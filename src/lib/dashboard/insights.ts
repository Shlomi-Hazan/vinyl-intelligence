/*
 * Deterministic, dependency-free dashboard derivations from the RLS-authoritative
 * data already loaded by CollectionDataProvider (`collection_items` +
 * immutable `listening_events`). No API call, no model call, no database write.
 * `now` is injected so every rule is testable.
 *
 * Definitions (fixed):
 * - collection size      = number of owned collection items.
 * - favorites            = owned items with `is_favorite === true`.
 * - played in last N days = count of DISTINCT owned items that have >= 1
 *                           listening event with `listened_at` within the
 *                           trailing N * 24h window (default N = 30). Counts
 *                           records, not events.
 * - never played         = owned items with zero listening events.
 * - recently added       = owned items sorted by `added_at` desc, then `id`
 *                          desc (identical to the collection display order).
 * - recently played      = one entry per owned item that has any listening
 *                          event, keyed by its most recent `listened_at`,
 *                          newest first.
 * - rediscover           = owned items that are never played OR last played
 *                          >= STALE_DAYS (default 60) ago, ranked: favorite
 *                          first, then higher rating, then older last-listened
 *                          (never-played = oldest), then earlier `added_at`.
 * - decade distribution / top genres: only when >= MIN_INSIGHT_ITEMS owned
 *   items carry a release year / at least one genre, respectively.
 */

import type { CollectionItemWithRelease } from '../supabase/collection.ts'
import type { ListeningEventRecord } from '../supabase/listeningEvents.ts'

export const PLAYED_WINDOW_DAYS = 30
export const REDISCOVER_STALE_DAYS = 60
export const MIN_INSIGHT_ITEMS = 4

const DAY_MS = 86_400_000

type PlayFacts = { count: number; lastMs: number | null }

function buildPlayFacts(
  events: readonly ListeningEventRecord[],
): Map<string, PlayFacts> {
  const map = new Map<string, PlayFacts>()
  for (const event of events) {
    const ms = new Date(event.listened_at).getTime()
    const current = map.get(event.collection_item_id) ?? { count: 0, lastMs: null }
    current.count += 1
    if (Number.isFinite(ms) && (current.lastMs === null || ms > current.lastMs)) {
      current.lastMs = ms
    }
    map.set(event.collection_item_id, current)
  }
  return map
}

function decadeOf(year: number | null): string | null {
  if (typeof year !== 'number' || !Number.isFinite(year)) {
    return null
  }
  return `${Math.floor(year / 10) * 10}s`
}

export type CollectionStats = {
  collectionSize: number
  favorites: number
}

/**
 * Collection-only stats - safe to show whenever the COLLECTION load succeeded,
 * regardless of the listening-events state.
 */
export function collectionStats(
  items: readonly CollectionItemWithRelease[],
): CollectionStats {
  let favorites = 0
  for (const item of items) {
    if (item.is_favorite) {
      favorites += 1
    }
  }
  return { collectionSize: items.length, favorites }
}

export type ListeningStats = {
  playedInWindow: number
  neverPlayed: number
}

/**
 * Listening-derived stats. ONLY call this when `eventsStatus === 'ready'` - an
 * empty `events` array during loading/failure would fabricate
 * "0 played / everything never played". The dashboard gates every call site.
 */
export function listeningStats(
  items: readonly CollectionItemWithRelease[],
  events: readonly ListeningEventRecord[],
  now: number,
  windowDays: number = PLAYED_WINDOW_DAYS,
): ListeningStats {
  const play = buildPlayFacts(events)
  const cutoff = now - windowDays * DAY_MS
  let playedInWindow = 0
  let neverPlayed = 0

  for (const item of items) {
    const facts = play.get(item.id)
    if (!facts || facts.count === 0) {
      neverPlayed += 1
      continue
    }
    if (facts.lastMs !== null && facts.lastMs >= cutoff) {
      playedInWindow += 1
    }
  }

  return { playedInWindow, neverPlayed }
}

export function recentlyAdded(
  items: readonly CollectionItemWithRelease[],
  limit: number,
): CollectionItemWithRelease[] {
  return [...items]
    .sort((a, b) => {
      const byDate = b.added_at.localeCompare(a.added_at)
      return byDate !== 0 ? byDate : b.id.localeCompare(a.id)
    })
    .slice(0, limit)
}

export type RecentlyPlayedEntry = {
  item: CollectionItemWithRelease
  lastListenedAt: string
}

export function recentlyPlayed(
  items: readonly CollectionItemWithRelease[],
  events: readonly ListeningEventRecord[],
  limit: number,
): RecentlyPlayedEntry[] {
  const play = buildPlayFacts(events)
  const entries: (RecentlyPlayedEntry & { ms: number })[] = []
  for (const item of items) {
    const facts = play.get(item.id)
    if (!facts || facts.lastMs === null) {
      continue
    }
    entries.push({
      item,
      lastListenedAt: new Date(facts.lastMs).toISOString(),
      ms: facts.lastMs,
    })
  }
  return entries
    .sort((a, b) => (b.ms !== a.ms ? b.ms - a.ms : a.item.id.localeCompare(b.item.id)))
    .slice(0, limit)
    .map(({ item, lastListenedAt }) => ({ item, lastListenedAt }))
}

export function rediscover(
  items: readonly CollectionItemWithRelease[],
  events: readonly ListeningEventRecord[],
  now: number,
  limit: number,
  staleDays: number = REDISCOVER_STALE_DAYS,
): CollectionItemWithRelease[] {
  const play = buildPlayFacts(events)
  const staleCutoff = now - staleDays * DAY_MS

  const candidates = items.filter((item) => {
    const facts = play.get(item.id)
    if (!facts || facts.count === 0) {
      return true
    }
    return facts.lastMs !== null && facts.lastMs < staleCutoff
  })

  return candidates
    .map((item) => {
      const facts = play.get(item.id)
      return {
        item,
        favorite: item.is_favorite ? 1 : 0,
        rating: item.rating ?? 0,
        lastMs: facts?.lastMs ?? Number.NEGATIVE_INFINITY,
      }
    })
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return b.favorite - a.favorite
      if (a.rating !== b.rating) return b.rating - a.rating
      if (a.lastMs !== b.lastMs) return a.lastMs - b.lastMs
      const byAdded = a.item.added_at.localeCompare(b.item.added_at)
      return byAdded !== 0 ? byAdded : a.item.id.localeCompare(b.item.id)
    })
    .slice(0, limit)
    .map(({ item }) => item)
}

export type DecadeSlice = { decade: string; count: number; pct: number }

export function decadeDistribution(
  items: readonly CollectionItemWithRelease[],
): DecadeSlice[] {
  const counts = new Map<string, number>()
  let total = 0
  for (const item of items) {
    const decade = decadeOf(item.release.release_year)
    if (!decade) {
      continue
    }
    counts.set(decade, (counts.get(decade) ?? 0) + 1)
    total += 1
  }
  if (total < MIN_INSIGHT_ITEMS) {
    return []
  }
  return [...counts.entries()]
    .map(([decade, count]) => ({
      decade,
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => a.decade.localeCompare(b.decade))
}

export type GenreSlice = { genre: string; count: number }

export function topGenres(
  items: readonly CollectionItemWithRelease[],
  limit = 5,
): GenreSlice[] {
  const counts = new Map<string, number>()
  let itemsWithGenre = 0
  for (const item of items) {
    const genres = Array.isArray(item.release.genres) ? item.release.genres : []
    if (genres.length > 0) {
      itemsWithGenre += 1
    }
    for (const raw of genres) {
      const genre = raw.trim().toLocaleLowerCase()
      if (genre) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1)
      }
    }
  }
  if (itemsWithGenre < MIN_INSIGHT_ITEMS) {
    return []
  }
  return [...counts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.genre.localeCompare(b.genre)))
    .slice(0, limit)
}
