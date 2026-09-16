/**
 * Deterministic, dependency-free search / filter / sort over the owned
 * collection that is already loaded through the RLS-authoritative browser
 * query. Milestone 6 collection browsing runs entirely here: no network
 * request, no LLM, no database write. It is separate from the Milestone 4
 * external MusicBrainz catalog search.
 */
import {
  effectiveGenres,
  type CollectionItemWithRelease,
} from '../lib/supabase/collection.ts'
import { buildSearchKey } from '../lib/i18n/searchKey.ts'
import { compareNames } from '../lib/i18n/collator.ts'
import { canonicalizeGenre } from '../lib/genre/canonical.ts'
import type { ListeningSummary } from './listeningSummary.ts'

/**
 * Mutually exclusive listening-recency filter (spec 0016 Finding A / §21.3):
 * `never` = zero listening events; `stale` = never played OR last played
 * strictly before the 30-day cutoff. Exactly one of the three is active.
 */
export type ListeningFilter = 'none' | 'never' | 'stale'

export type CollectionFilters = {
  /** Free text; case-insensitive substring of artist OR title; trimmed. */
  search: string
  /** Raw exact-year input; a non-integer is treated as "no year filter". */
  year: string
  /** e.g. "1960s"; derived from release_year, never persisted. */
  decade: string
  /** e.g. "jazz"; case-insensitive membership in release.genres. */
  genre: string
  /** `rating >= minRating`; `0` = no filter. Unrated never matches > 0. */
  minRating: number
  /** See `ListeningFilter`. */
  listening: ListeningFilter
}

export type CollectionSort =
  | 'recently-added'
  | 'artist-asc'
  | 'album-asc'
  | 'year-desc'
  | 'year-asc'
  | 'rating-desc'
  | 'rating-asc'
  | 'least-recently-played'

export const EMPTY_FILTERS: CollectionFilters = {
  search: '',
  year: '',
  decade: '',
  genre: '',
  minRating: 0,
  listening: 'none',
}

export const DEFAULT_SORT: CollectionSort = 'recently-added'

export const COLLECTION_SORTS: { value: CollectionSort; label: string }[] = [
  { value: 'recently-added', label: 'Recently added' },
  // English-only labels (spec 0015 §9): a Latin-then-Hebrew ordering is not
  // "A-Z", and application chrome stays English.
  { value: 'artist-asc', label: 'Artist alphabetical' },
  { value: 'album-asc', label: 'Album alphabetical' },
  { value: 'year-desc', label: 'Year (newest)' },
  { value: 'year-asc', label: 'Year (oldest)' },
  { value: 'rating-desc', label: 'Rating (highest)' },
  { value: 'rating-asc', label: 'Rating (lowest)' },
  { value: 'least-recently-played', label: 'Least recently played' },
]

/**
 * Spec 0016 §21.3: the "not played in the last 30 days" boundary is inherited
 * from the curator's already-approved `avoidRecentlyPlayed` contract
 * (`src/lib/curator/candidates.ts` `DEFAULT_RECENT_DAYS`) and the Dashboard's
 * `PLAYED_WINDOW_DAYS` - same value, declared independently here so this
 * module stays dependency-free of the curator and Dashboard feature
 * boundaries (plan 016 PR B).
 */
const NOT_PLAYED_RECENTLY_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function decadeLabel(year: number): string {
  return `${Math.floor(year / 10) * 10}s`
}

/**
 * The genres a record is browsed / filtered by: the CANONICAL effective genres
 * (catalog + personal, deduped by canonical form - spec 0015 §10.5). Neither
 * source is mutated.
 *
 * Spec 0018 §8.4: for a masked (`discogsUnavailable`) item, its CATALOG
 * genres are treated as absent for exactly as long as it stays masked - only
 * its own personal genres (never provider-derived) remain usable here.
 */
function itemGenres(item: CollectionItemWithRelease): string[] {
  if (item.discogsUnavailable) {
    return effectiveGenres({ ...item, release: { ...item.release, genres: [] } })
  }
  return effectiveGenres(item)
}

/** `release_year`, treated as absent (`null`) for a masked item (spec 0018 §8.4). */
function itemReleaseYear(item: CollectionItemWithRelease): number | null {
  return item.discogsUnavailable ? null : item.release.release_year
}

/** `artist`/`title`, treated as empty strings for a masked item's own search
 * matching (spec 0018 §8.4) - never matched by a text search targeting them. */
function itemArtist(item: CollectionItemWithRelease): string {
  return item.discogsUnavailable ? '' : item.release.artist
}

function itemTitle(item: CollectionItemWithRelease): string {
  return item.discogsUnavailable ? '' : item.release.title
}

/** Decades actually represented in the loaded collection, ascending. */
export function availableDecades(items: CollectionItemWithRelease[]): string[] {
  const decades = new Set<string>()

  for (const item of items) {
    const year = itemReleaseYear(item)

    if (typeof year === 'number') {
      decades.add(decadeLabel(year))
    }
  }

  return [...decades].sort()
}

/**
 * Distinct canonical genres present in the loaded collection - one option per
 * canonical genre, so `rock` and a legacy personal `רוק` collapse to a single
 * `rock` choice (spec 0015 §5).
 */
export function availableGenres(items: CollectionItemWithRelease[]): string[] {
  const genres = new Set<string>()

  for (const item of items) {
    for (const genre of itemGenres(item)) {
      if (genre) {
        genres.add(genre)
      }
    }
  }

  return [...genres].sort()
}

export function hasActiveFilters(filters: CollectionFilters): boolean {
  return (
    filters.search.trim().length > 0
    || filters.year.trim().length > 0
    || filters.decade.length > 0
    || filters.genre.length > 0
    || filters.minRating > 0
    || filters.listening !== 'none'
  )
}

// Matches the persisted releases.release_year DB constraint (M3 migration).
const YEAR_MIN = 1900
const YEAR_MAX = 2100

function parseYear(raw: string): number | null {
  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return null
  }

  const year = Number(trimmed)

  return Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX
    ? year
    : null
}

/**
 * True when the year input is non-empty but not a whole year in the persisted
 * 1900..2100 range (UI hint). An out-of-range or non-integer entry applies no
 * exact-year filter.
 */
export function yearFilterIsInvalid(raw: string): boolean {
  return raw.trim().length > 0 && parseYear(raw) === null
}

/**
 * `needle` is already a `buildSearchKey` of the raw query (see
 * `applyCollectionQuery`). The artist and title are matched as SEPARATE fields -
 * the historical Collection contract is a substring of artist OR title, never a
 * cross-field match. Each field is passed through the same comparison-only key
 * so orthographic variants (niqqud, geresh vs apostrophe, maqaf vs hyphen,
 * whitespace, case) match. Stored metadata is never rewritten.
 */
function matchesSearch(item: CollectionItemWithRelease, needle: string): boolean {
  if (needle.length === 0) {
    return true
  }

  return (
    buildSearchKey(itemArtist(item)).includes(needle)
    || buildSearchKey(itemTitle(item)).includes(needle)
  )
}

function matchesYear(
  item: CollectionItemWithRelease,
  year: number | null,
): boolean {
  return year === null || itemReleaseYear(item) === year
}

function matchesDecade(
  item: CollectionItemWithRelease,
  decade: string,
): boolean {
  if (decade.length === 0) {
    return true
  }

  const year = itemReleaseYear(item)

  return typeof year === 'number' && decadeLabel(year) === decade
}

/** `genre` is already a `canonicalizeGenre` of the raw `?genre=` value. */
function matchesGenre(
  item: CollectionItemWithRelease,
  genre: string,
): boolean {
  if (genre.length === 0) {
    return true
  }

  return itemGenres(item).includes(genre)
}

/** `minRating <= 0` means no filter. Unrated (`rating: null`) never matches
 * a positive threshold - approved UI has no "any including unrated" mode. */
function matchesMinRating(
  item: CollectionItemWithRelease,
  minRating: number,
): boolean {
  if (minRating <= 0) {
    return true
  }

  return item.rating !== null && item.rating >= minRating
}

/**
 * Spec 0016 §21.3 exact boundary: a record with no events, or whose events
 * all have an unparseable timestamp, is stale (never played qualifies). A
 * record last played strictly before the cutoff is stale. A record last
 * played AT OR AFTER the cutoff is recent, not stale - exact complement of
 * the curator's `avoidRecentlyPlayed` contract (`last >= cutoff` -> recent).
 */
function isStale(summary: ListeningSummary | undefined, now: number): boolean {
  // Never played (no summary, or zero events) is stale by definition.
  if (!summary || summary.count === 0) {
    return true
  }

  // Defensive: events exist but none had a parseable timestamp. Do not claim
  // staleness without evidence of when the last play actually was.
  if (summary.lastListenedAt === null) {
    return false
  }

  const last = new Date(summary.lastListenedAt).getTime()

  if (!Number.isFinite(last)) {
    return false
  }

  const cutoff = now - NOT_PLAYED_RECENTLY_DAYS * MS_PER_DAY

  return last < cutoff
}

function matchesListening(
  item: CollectionItemWithRelease,
  listening: ListeningFilter,
  listeningByItem: ReadonlyMap<string, ListeningSummary>,
  now: number,
): boolean {
  if (listening === 'none') {
    return true
  }

  const summary = listeningByItem.get(item.id)

  if (listening === 'never') {
    return !summary || summary.count === 0
  }

  return isStale(summary, now)
}

function yearSort(
  a: CollectionItemWithRelease,
  b: CollectionItemWithRelease,
  direction: 'asc' | 'desc',
): number {
  const ay = itemReleaseYear(a)
  const by = itemReleaseYear(b)

  if (ay === null && by === null) {
    return 0
  }

  // Unknown year always sorts last, regardless of direction.
  if (ay === null) {
    return 1
  }

  if (by === null) {
    return -1
  }

  return direction === 'asc' ? ay - by : by - ay
}

/**
 * Approved (spec 0016 §21.2): unrated (`rating: null`) records always sort
 * last, in BOTH directions - never mixed in among rated records regardless
 * of `direction`.
 */
function ratingSort(
  a: CollectionItemWithRelease,
  b: CollectionItemWithRelease,
  direction: 'asc' | 'desc',
): number {
  const ar = a.rating
  const br = b.rating

  if (ar === null && br === null) {
    return 0
  }

  if (ar === null) {
    return 1
  }

  if (br === null) {
    return -1
  }

  return direction === 'asc' ? ar - br : br - ar
}

/**
 * Approved (spec 0016 §21.4): never-played records first, then played
 * records ordered from the oldest `lastListenedAt` to the newest - mirrors
 * the Dashboard `rediscover` convention (`lastMs ?? -Infinity`, ascending).
 * When `listeningByItem` is empty (listening data not yet ready - see
 * `CollectionBrowser`), every item resolves to the same `-Infinity` value,
 * so this correctly becomes a no-op (stable index tiebreak) rather than
 * pretending an unknown history is known.
 */
function leastRecentlyPlayedSort(
  a: CollectionItemWithRelease,
  b: CollectionItemWithRelease,
  listeningByItem: ReadonlyMap<string, ListeningSummary>,
): number {
  const aVal = lastListenedMs(listeningByItem.get(a.id))
  const bVal = lastListenedMs(listeningByItem.get(b.id))
  return aVal - bVal
}

function lastListenedMs(summary: ListeningSummary | undefined): number {
  if (!summary || summary.lastListenedAt === null) {
    return Number.NEGATIVE_INFINITY
  }

  const ms = new Date(summary.lastListenedAt).getTime()

  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY
}

function compareBySort(
  a: CollectionItemWithRelease,
  b: CollectionItemWithRelease,
  sort: CollectionSort,
  listeningByItem: ReadonlyMap<string, ListeningSummary>,
): number {
  switch (sort) {
    case 'artist-asc':
      return compareNames(itemArtist(a), itemArtist(b))
    case 'album-asc':
      return compareNames(itemTitle(a), itemTitle(b))
    case 'year-desc':
      return yearSort(a, b, 'desc')
    case 'year-asc':
      return yearSort(a, b, 'asc')
    case 'rating-desc':
      return ratingSort(a, b, 'desc')
    case 'rating-asc':
      return ratingSort(a, b, 'asc')
    case 'least-recently-played':
      return leastRecentlyPlayedSort(a, b, listeningByItem)
    case 'recently-added':
    default:
      return 0
  }
}

/**
 * Applies the filters (logical AND) then the sort. The incoming array is
 * assumed to already be in "recently added" order (added_at desc, id desc);
 * that original position is the deterministic tiebreak for every sort.
 *
 * `listeningByItem`/`now` are optional so every pre-existing call site
 * (none of which touch rating/listening) keeps compiling unchanged; the
 * caller must pass a real map + `now` to get real listening-based
 * filtering/sorting (`CollectionBrowser` gates this on the listening-events
 * load phase - see spec 0016 Finding A / §21).
 */
export function applyCollectionQuery(
  items: CollectionItemWithRelease[],
  filters: CollectionFilters,
  sort: CollectionSort,
  listeningByItem: ReadonlyMap<string, ListeningSummary> = new Map(),
  now: number = Date.now(),
): CollectionItemWithRelease[] {
  // Comparison-only search key of the raw query (spec 0015 §7). The raw
  // `filters.search` string is untouched - it stays in the URL and the input.
  const needle = buildSearchKey(filters.search)
  const year = parseYear(filters.year)
  const decade = filters.decade.trim()
  // Canonicalize the raw `?genre=` value so a Hebrew alias link (`?genre=רוק`)
  // and the canonical `rock` option select the same records (spec 0015 §5).
  const genre = canonicalizeGenre(filters.genre)

  const filtered = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        matchesSearch(item, needle)
        && matchesYear(item, year)
        && matchesDecade(item, decade)
        && matchesGenre(item, genre)
        && matchesMinRating(item, filters.minRating)
        && matchesListening(item, filters.listening, listeningByItem, now),
    )

  filtered.sort((a, b) => {
    const primary = compareBySort(a.item, b.item, sort, listeningByItem)
    return primary !== 0 ? primary : a.index - b.index
  })

  return filtered.map((entry) => entry.item)
}
