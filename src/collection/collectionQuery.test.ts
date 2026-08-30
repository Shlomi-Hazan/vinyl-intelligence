import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTERS,
  applyCollectionQuery,
  availableDecades,
  availableGenres,
  decadeLabel,
  hasActiveFilters,
  yearFilterIsInvalid,
  type CollectionFilters,
} from './collectionQuery.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'

let counter = 0

function item(
  release: Partial<CollectionItemWithRelease['release']> = {},
): CollectionItemWithRelease {
  counter += 1
  return {
    id: `item-${counter}`,
    added_at: `2026-08-${String(30 - counter).padStart(2, '0')}T10:00:00.000Z`,
    created_at: '2026-08-01T10:00:00.000Z',
    release: {
      id: `release-${counter}`,
      artist: 'Miles Davis',
      title: 'Kind of Blue',
      release_year: 1959,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: ['jazz'],
      updated_at: '2026-08-01T10:00:00.000Z',
      ...release,
    },
  }
}

function filters(patch: Partial<CollectionFilters> = {}): CollectionFilters {
  return { ...EMPTY_FILTERS, ...patch }
}

function ids(items: CollectionItemWithRelease[]): string[] {
  return items.map((entry) => entry.id)
}

describe('collectionQuery', () => {
  it('returns the whole collection when no filters are set', () => {
    const collection = [item(), item(), item()]
    expect(applyCollectionQuery(collection, EMPTY_FILTERS, 'recently-added')).toHaveLength(3)
  })

  it('derives decades deterministically', () => {
    expect(decadeLabel(1967)).toBe('1960s')
    expect(decadeLabel(1999)).toBe('1990s')
    expect(decadeLabel(2000)).toBe('2000s')
  })

  it('matches artist and title, case-insensitively, on a partial trimmed query', () => {
    const collection = [
      item({ artist: 'Miles Davis', title: 'Kind of Blue' }),
      item({ artist: 'John Coltrane', title: 'Giant Steps' }),
      item({ artist: 'Bill Evans', title: 'Sunday at the Village Vanguard' }),
    ]

    expect(ids(applyCollectionQuery(collection, filters({ search: '  mILes ' }), 'recently-added'))).toEqual([
      collection[0].id,
    ])
    expect(ids(applyCollectionQuery(collection, filters({ search: 'giant' }), 'recently-added'))).toEqual([
      collection[1].id,
    ])
    expect(applyCollectionQuery(collection, filters({ search: '   ' }), 'recently-added')).toHaveLength(3)
  })

  it('filters by exact year and ignores a non-integer year input', () => {
    const collection = [
      item({ release_year: 1959 }),
      item({ release_year: 1965 }),
      item({ release_year: null }),
    ]

    expect(applyCollectionQuery(collection, filters({ year: '1959' }), 'recently-added')).toHaveLength(1)
    expect(applyCollectionQuery(collection, filters({ year: 'sixty' }), 'recently-added')).toHaveLength(3)
    expect(yearFilterIsInvalid('sixty')).toBe(true)
    expect(yearFilterIsInvalid('1959')).toBe(false)
    expect(yearFilterIsInvalid('  ')).toBe(false)
  })

  it('treats an out-of-range year as no filter with an invalid hint (1900..2100)', () => {
    const collection = [item({ release_year: 1959 }), item({ release_year: 1999 })]

    // 1800 / 2101 are integers but outside the persisted release_year range.
    expect(applyCollectionQuery(collection, filters({ year: '1800' }), 'recently-added')).toHaveLength(2)
    expect(applyCollectionQuery(collection, filters({ year: '2101' }), 'recently-added')).toHaveLength(2)

    expect(yearFilterIsInvalid('1899')).toBe(true)
    expect(yearFilterIsInvalid('1900')).toBe(false)
    expect(yearFilterIsInvalid('2100')).toBe(false)
    expect(yearFilterIsInvalid('2101')).toBe(true)
  })

  it('filters by decade and never matches a null year', () => {
    const collection = [
      item({ release_year: 1967 }),
      item({ release_year: 1971 }),
      item({ release_year: null }),
    ]

    expect(applyCollectionQuery(collection, filters({ decade: '1960s' }), 'recently-added')).toHaveLength(1)
    expect(applyCollectionQuery(collection, filters({ decade: '1970s' }), 'recently-added')).toHaveLength(1)
  })

  it('filters by genre, case-insensitively, and never matches empty genres', () => {
    const collection = [
      item({ genres: ['Jazz', 'Hard Bop'] }),
      item({ genres: ['rock'] }),
      item({ genres: [] }),
    ]

    expect(applyCollectionQuery(collection, filters({ genre: 'jazz' }), 'recently-added')).toHaveLength(1)
    expect(applyCollectionQuery(collection, filters({ genre: 'HARD BOP' }), 'recently-added')).toHaveLength(1)
    expect(applyCollectionQuery(collection, filters({ genre: 'ambient' }), 'recently-added')).toHaveLength(0)
  })

  it('combines filter categories with logical AND', () => {
    const collection = [
      item({ artist: 'Miles Davis', release_year: 1967, genres: ['jazz'] }),
      item({ artist: 'Miles Davis', release_year: 1975, genres: ['jazz'] }),
      item({ artist: 'Herbie Hancock', release_year: 1965, genres: ['jazz'] }),
      item({ artist: 'Miles Davis', release_year: 1969, genres: ['rock'] }),
    ]

    const result = applyCollectionQuery(
      collection,
      filters({ search: 'miles', decade: '1960s', genre: 'jazz' }),
      'recently-added',
    )
    expect(ids(result)).toEqual([collection[0].id])
  })

  it('does not crash on null year or empty genres', () => {
    const collection = [item({ release_year: null, genres: [] })]
    expect(() =>
      applyCollectionQuery(collection, filters({ search: 'x', year: '1', decade: '1990s', genre: 'y' }), 'year-asc'),
    ).not.toThrow()
  })

  it('reports no results and hasActiveFilters', () => {
    const collection = [item({ artist: 'Miles Davis' })]
    expect(applyCollectionQuery(collection, filters({ search: 'nope' }), 'recently-added')).toHaveLength(0)
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters(filters({ genre: 'jazz' }))).toBe(true)
    expect(hasActiveFilters(filters({ search: '   ' }))).toBe(false)
  })

  it('sorts by each option with null years last and a deterministic tiebreak', () => {
    const a = item({ artist: 'Zappa', title: 'Apostrophe', release_year: 1974 })
    const b = item({ artist: 'ABBA', title: 'Zebra', release_year: 1974 })
    const c = item({ artist: 'Beck', title: 'Mellow Gold', release_year: null })
    const collection = [a, b, c] // incoming "recently added" order

    expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'recently-added'))).toEqual([a.id, b.id, c.id])
    expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'artist-asc'))).toEqual([b.id, c.id, a.id])
    expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'album-asc'))).toEqual([a.id, c.id, b.id])
    // year sorts: same-year tie broken by incoming order (a before b), null last
    expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'year-desc'))).toEqual([a.id, b.id, c.id])
    expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'year-asc'))).toEqual([a.id, b.id, c.id])
  })

  it('offers only the decades and genres present in the collection', () => {
    const collection = [
      item({ release_year: 1967, genres: ['jazz'] }),
      item({ release_year: 1999, genres: ['Rock', 'Pop'] }),
      item({ release_year: null, genres: [] }),
    ]

    expect(availableDecades(collection)).toEqual(['1960s', '1990s'])
    expect(availableGenres(collection)).toEqual(['jazz', 'pop', 'rock'])
  })

  it('never invents rows', () => {
    const collection = [item(), item()]
    const result = applyCollectionQuery(collection, filters({ search: 'miles' }), 'recently-added')
    for (const entry of result) {
      expect(collection).toContain(entry)
    }
  })
})
