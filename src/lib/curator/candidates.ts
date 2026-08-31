/**
 * Milestone 9 - deterministic, dependency-free filter + rank over the user's
 * OWNED collection. No I/O, no LLM, no randomness.
 *
 * Pipeline: derive facts from listening events -> apply HARD constraints
 * (never silently relaxed) -> rank by a small explainable heuristic -> cap at
 * MAX_CANDIDATES -> project the model-facing fact object + the allowed id set.
 */
import {
  DEFAULT_RECENT_DAYS,
  MAX_CANDIDATES,
  type CuratorCandidate,
  type CuratorCandidateFact,
  type CuratorCollectionItem,
  type CuratorIntent,
  type CuratorListeningEvent,
} from './types.ts'

const MS_PER_DAY = 86_400_000
const NEVER_PLAYED_DAYS = 3650

function decadeOf(year: number | null): number | null {
  return typeof year === 'number' ? Math.floor(year / 10) * 10 : null
}

function normalizeGenres(genres: string[] | null | undefined): string[] {
  if (!Array.isArray(genres)) {
    return []
  }
  return genres
    .map((g) => (typeof g === 'string' ? g.trim().toLocaleLowerCase() : ''))
    .filter((g) => g.length > 0)
}

/** Derive playCount / lastListenedAt / neverPlayed / decade for every owned item. */
export function deriveCandidateFacts(
  items: CuratorCollectionItem[],
  events: CuratorListeningEvent[],
): CuratorCandidate[] {
  const byItem = new Map<string, { count: number; last: number }>()

  for (const event of events) {
    const time = new Date(event.listened_at).getTime()
    const current = byItem.get(event.collection_item_id) ?? { count: 0, last: Number.NEGATIVE_INFINITY }
    current.count += 1
    if (Number.isFinite(time) && time > current.last) {
      current.last = time
    }
    byItem.set(event.collection_item_id, current)
  }

  return items.map((item) => {
    const agg = byItem.get(item.id)
    const playCount = agg?.count ?? 0
    const lastListenedAt =
      agg && Number.isFinite(agg.last) ? new Date(agg.last).toISOString() : null

    return {
      ...item,
      genres: normalizeGenres(item.genres),
      decade: decadeOf(item.release_year),
      playCount,
      lastListenedAt,
      neverPlayed: playCount === 0,
    }
  })
}

function daysSince(iso: string | null, now: number): number | null {
  if (iso === null) {
    return null
  }
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) {
    return null
  }
  return Math.max(0, Math.floor((now - time) / MS_PER_DAY))
}

function passesHardFilters(
  candidate: CuratorCandidate,
  intent: CuratorIntent,
  now: number,
): boolean {
  const genres = candidate.genres

  if (intent.includeGenres.length > 0) {
    if (!intent.includeGenres.some((g) => genres.includes(g))) {
      return false
    }
  }

  if (intent.excludeGenres.length > 0) {
    if (intent.excludeGenres.some((g) => genres.includes(g))) {
      return false
    }
  }

  if (intent.decades.length > 0) {
    if (candidate.decade === null || !intent.decades.includes(candidate.decade)) {
      return false
    }
  }

  if (intent.minRating !== null) {
    if (candidate.rating === null || candidate.rating < intent.minRating) {
      return false
    }
  }

  if (intent.favoritesOnly && !candidate.is_favorite) {
    return false
  }

  if (intent.neverPlayedOnly && !candidate.neverPlayed) {
    return false
  }

  if (intent.avoidRecentlyPlayed) {
    const windowDays = intent.recentDays ?? DEFAULT_RECENT_DAYS
    const cutoff = now - windowDays * MS_PER_DAY
    if (candidate.lastListenedAt !== null) {
      const last = new Date(candidate.lastListenedAt).getTime()
      // "recently played" => played at or after the cutoff => excluded.
      if (Number.isFinite(last) && last >= cutoff) {
        return false
      }
    }
  }

  return true
}

export function applyHardFilters(
  candidates: CuratorCandidate[],
  intent: CuratorIntent,
  now: number = Date.now(),
): CuratorCandidate[] {
  return candidates.filter((candidate) => passesHardFilters(candidate, intent, now))
}

/** Deterministic string hash mapped to [0, 1). Not `Math.random`. */
export function stableHash01(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  // >>> 0 -> unsigned; divide by 2^32.
  return (hash >>> 0) / 4294967296
}

export function scoreCandidate(
  candidate: CuratorCandidate,
  intent: CuratorIntent,
  now: number = Date.now(),
): number {
  let score = (candidate.is_favorite ? 2 : 0) + (candidate.rating ?? 0) * 0.5

  switch (intent.preference) {
    case 'favorites':
      score += candidate.is_favorite ? 10 : 0
      break
    case 'highly_rated':
      score += (candidate.rating ?? 0) * 3
      break
    case 'rediscovery': {
      const days = candidate.neverPlayed
        ? NEVER_PLAYED_DAYS
        : Math.min(daysSince(candidate.lastListenedAt, now) ?? NEVER_PLAYED_DAYS, NEVER_PLAYED_DAYS)
      score += days / 365
      break
    }
    case 'surprise':
      score += stableHash01(candidate.id) * 8
      break
    case 'none':
    default:
      break
  }

  return score
}

/** Rank by score desc, tie-break added_at desc then id asc, then cap. */
export function rankAndCap(
  candidates: CuratorCandidate[],
  intent: CuratorIntent,
  now: number = Date.now(),
): CuratorCandidate[] {
  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(candidate, intent, now),
  }))

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score
    }
    // added_at desc
    if (a.candidate.added_at !== b.candidate.added_at) {
      return a.candidate.added_at < b.candidate.added_at ? 1 : -1
    }
    // id asc
    if (a.candidate.id === b.candidate.id) {
      return 0
    }
    return a.candidate.id < b.candidate.id ? -1 : 1
  })

  return scored.slice(0, MAX_CANDIDATES).map((entry) => entry.candidate)
}

/** Project the allowed candidates to the model-facing fact objects + id set. */
export function buildAllowedCandidateSet(
  candidates: CuratorCandidate[],
  now: number = Date.now(),
): { facts: CuratorCandidateFact[]; ids: Set<string>; byId: Map<string, CuratorCandidate> } {
  const facts: CuratorCandidateFact[] = candidates.map((candidate) => ({
    id: candidate.id,
    artist: candidate.artist,
    title: candidate.title,
    year: candidate.release_year,
    decade: candidate.decade,
    genres: candidate.genres,
    rating: candidate.rating,
    favorite: candidate.is_favorite,
    playCount: candidate.playCount,
    lastListenedDaysAgo: daysSince(candidate.lastListenedAt, now),
    neverPlayed: candidate.neverPlayed,
  }))

  return {
    facts,
    ids: new Set(candidates.map((c) => c.id)),
    byId: new Map(candidates.map((c) => [c.id, c])),
  }
}

/**
 * Full deterministic middle stage. Returns the ranked+capped candidate list;
 * an empty list means the caller should return `no_match`.
 */
export function selectCandidates(
  items: CuratorCollectionItem[],
  events: CuratorListeningEvent[],
  intent: CuratorIntent,
  now: number = Date.now(),
): CuratorCandidate[] {
  const withFacts = deriveCandidateFacts(items, events)
  const filtered = applyHardFilters(withFacts, intent, now)
  return rankAndCap(filtered, intent, now)
}
