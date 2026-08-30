/**
 * Deterministic, dependency-free search / filter / sort over the owned
 * collection that is already loaded through the RLS-authoritative browser
 * query. Milestone 6 collection browsing runs entirely here: no network
 * request, no LLM, no database write. It is separate from the Milestone 4
 * external MusicBrainz catalog search.
 */
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'

export type CollectionFilters = {
  /** Free text; case-insensitive substring of artist OR title; trimmed. */
  search: string
  /** Raw exact-year input; a non-integer is treated as "no year filter". */
  year: string
  /** e.g. "1960s"; derived from release_year, never persisted. */
  decade: string
  /** e.g. "jazz"; case-insensitive membership in release.genres. */
  genre: string
}

export type CollectionSort =
  | 'recently-added'
  | 'artist-asc'
  | 'album-asc'
  | 'year-desc'
  | 'year-asc'

export const EMPTY_FILTERS: CollectionFilters = {
  search: '',
  year: '',
  decade: '',
  genre: '',
}

export const DEFAULT_SORT: CollectionSort = 'recently-added'

export const COLLECTION_SORTS: { value: CollectionSort; label: string }[] = [
  { value: 'recently-added', label: 'Recently added' },
  { value: 'artist-asc', label: 'Artist A-Z' },
  { value: 'album-asc', label: 'Album A-Z' },
  { value: 'year-desc', label: 'Year (newest)' },
  { value: 'year-asc', label: 'Year (oldest)' },
]

export function decadeLabel(year: number): string {
  return `${Math.floor(year / 10) * 10}s`
}

function releaseGenres(item: CollectionItemWithRelease): string[] {
  return Array.isArray(item.release.genres) ? item.release.genres : []
}

/** Decades actually represented in the loaded collection, ascending. */
export function availableDecades(items: CollectionItemWithRelease[]): string[] {
  const decades = new Set<string>()

  for (const item of items) {
    const year = item.release.release_year

    if (typeof year === 'number') {
      decades.add(decadeLabel(year))
    }
  }

  return [...decades].sort()
}

/** Distinct lowercase genres actually present in the loaded collection. */
export function availableGenres(items: CollectionItemWithRelease[]): string[] {
  const genres = new Set<string>()

  for (const item of items) {
    for (const raw of releaseGenres(item)) {
      const genre = raw.trim().toLocaleLowerCase()

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

function matchesSearch(item: CollectionItemWithRelease, needle: string): boolean {
  if (needle.length === 0) {
    return true
  }

  return `${item.release.artist}\n${item.release.title}`
    .toLocaleLowerCase()
    .includes(needle)
}

function matchesYear(
  item: CollectionItemWithRelease,
  year: number | null,
): boolean {
  return year === null || item.release.release_year === year
}

function matchesDecade(
  item: CollectionItemWithRelease,
  decade: string,
): boolean {
  if (decade.length === 0) {
    return true
  }

  const year = item.release.release_year

  return typeof year === 'number' && decadeLabel(year) === decade
}

function matchesGenre(
  item: CollectionItemWithRelease,
  genre: string,
): boolean {
  if (genre.length === 0) {
    return true
  }

  return releaseGenres(item).some(
    (value) => value.toLocaleLowerCase() === genre,
  )
}

function yearSort(
  a: CollectionItemWithRelease,
  b: CollectionItemWithRelease,
  direction: 'asc' | 'desc',
): number {
  const ay = a.release.release_year
  const by = b.release.release_year

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

function compareBySort(
  a: CollectionItemWithRelease,
  b: CollectionItemWithRelease,
  sort: CollectionSort,
): number {
  switch (sort) {
    case 'artist-asc':
      return a.release.artist.localeCompare(b.release.artist)
    case 'album-asc':
      return a.release.title.localeCompare(b.release.title)
    case 'year-desc':
      return yearSort(a, b, 'desc')
    case 'year-asc':
      return yearSort(a, b, 'asc')
    case 'recently-added':
    default:
      return 0
  }
}

/**
 * Applies the filters (logical AND) then the sort. The incoming array is
 * assumed to already be in "recently added" order (added_at desc, id desc);
 * that original position is the deterministic tiebreak for every sort.
 */
export function applyCollectionQuery(
  items: CollectionItemWithRelease[],
  filters: CollectionFilters,
  sort: CollectionSort,
): CollectionItemWithRelease[] {
  const needle = filters.search.trim().toLocaleLowerCase()
  const year = parseYear(filters.year)
  const decade = filters.decade.trim()
  const genre = filters.genre.trim().toLocaleLowerCase()

  const filtered = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        matchesSearch(item, needle)
        && matchesYear(item, year)
        && matchesDecade(item, decade)
        && matchesGenre(item, genre),
    )

  filtered.sort((a, b) => {
    const primary = compareBySort(a.item, b.item, sort)
    return primary !== 0 ? primary : a.index - b.index
  })

  return filtered.map((entry) => entry.item)
}
