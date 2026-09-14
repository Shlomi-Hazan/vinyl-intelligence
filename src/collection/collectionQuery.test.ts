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
import { buildListeningSummaryMap } from './listeningSummary.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

let counter = 0

function item(
  release: Partial<CollectionItemWithRelease['release']> = {},
): CollectionItemWithRelease {
  counter += 1
  return {
    id: `item-${counter}`,
    added_at: `2026-08-${String(30 - counter).padStart(2, '0')}T10:00:00.000Z`,
    created_at: '2026-08-01T10:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
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

  describe('Hebrew & multilingual (spec 0015)', () => {
    it('finds a Hebrew record by a Hebrew substring and tolerates a geresh variant', () => {
      const collection = [
        item({ artist: 'שלום חנוך', title: 'מחכים למשיח' }),
        item({ artist: 'אריק איינשטיין', title: 'שבלול' }),
        item({ artist: "ג'ירפות", title: 'אלבום' }),
      ]

      expect(
        ids(applyCollectionQuery(collection, filters({ search: 'חנוך' }), 'recently-added')),
      ).toEqual([collection[0].id])
      // gershayim/geresh-insensitive: stored ASCII apostrophe, query with U+05F3
      expect(
        ids(
          applyCollectionQuery(
            collection,
            filters({ search: 'ג' + String.fromCodePoint(0x05f3) + 'ירפות' }),
            'recently-added',
          ),
        ),
      ).toEqual([collection[2].id])
    })

    it('keeps English search behaviour and does not bridge scripts', () => {
      const collection = [
        item({ artist: 'David Bowie', title: 'Heroes' }),
        item({ artist: 'שלום חנוך', title: 'מחכים למשיח' }),
      ]
      expect(
        ids(applyCollectionQuery(collection, filters({ search: 'BOWIE' }), 'recently-added')),
      ).toEqual([collection[0].id])
      // a transliteration query must NOT match the Hebrew record
      expect(
        applyCollectionQuery(collection, filters({ search: 'shalom hanoch' }), 'recently-added'),
      ).toHaveLength(0)
    })

    it('matches a substring of ARTIST OR TITLE, never a cross-field join', () => {
      const collection = [
        item({ artist: 'David Bowie', title: 'Heroes' }),
        item({ artist: 'שלום חנוך', title: 'מחכים למשיח' }),
      ]
      // artist-side and title-side substrings both match their own record
      expect(
        ids(applyCollectionQuery(collection, filters({ search: 'bowie' }), 'recently-added')),
      ).toEqual([collection[0].id])
      expect(
        ids(applyCollectionQuery(collection, filters({ search: 'heroes' }), 'recently-added')),
      ).toEqual([collection[0].id])
      // a query spanning artist + title is NOT a match (no cross-field search)
      expect(
        applyCollectionQuery(
          collection,
          filters({ search: 'David Bowie Heroes' }),
          'recently-added',
        ),
      ).toHaveLength(0)
      // Hebrew artist-side and title-side each still match
      expect(
        ids(applyCollectionQuery(collection, filters({ search: 'חנוך' }), 'recently-added')),
      ).toEqual([collection[1].id])
      expect(
        ids(applyCollectionQuery(collection, filters({ search: 'למשיח' }), 'recently-added')),
      ).toEqual([collection[1].id])
      expect(
        applyCollectionQuery(collection, filters({ search: 'חנוך מחכים' }), 'recently-added'),
      ).toHaveLength(0)
    })

    it('sorts Latin bucket (A-Z) before Hebrew bucket (alef-tav)', () => {
      const a = item({ artist: 'שלום חנוך', title: 'x' })
      const b = item({ artist: 'Radiohead', title: 'y' })
      const c = item({ artist: 'אריק איינשטיין', title: 'z' })
      const d = item({ artist: 'ABBA', title: 'w' })
      const collection = [a, b, c, d]

      expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'artist-asc'))).toEqual([
        d.id, // ABBA
        b.id, // Radiohead
        c.id, // אריק
        a.id, // שלום
      ])
    })

    it('English-only sort order is unchanged and deterministic across runs', () => {
      const z = item({ artist: 'Zappa', title: 'z' })
      const a = item({ artist: 'ABBA', title: 'a' })
      const m = item({ artist: 'Miles Davis', title: 'm' })
      const collection = [z, a, m]
      const once = ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'artist-asc'))
      const twice = ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'artist-asc'))
      expect(once).toEqual([a.id, m.id, z.id])
      expect(once).toEqual(twice)
    })
  })

  describe('effective genres (catalog + personal)', () => {
    it('filters on a personal genre the catalog does not carry', () => {
      const withPersonal: CollectionItemWithRelease = {
        ...item({ genres: ['hip hop'] }),
        personal_genres: ['west coast hip hop'],
      }
      const plain = item({ genres: ['rock'] })
      const collection = [withPersonal, plain]

      expect(
        applyCollectionQuery(
          collection,
          filters({ genre: 'west coast hip hop' }),
          'recently-added',
        ),
      ).toEqual([withPersonal])
    })

    it('lists personal genres alongside catalog genres without duplicates', () => {
      const collection = [
        { ...item({ genres: ['Jazz'] }), personal_genres: ['fusion', 'jazz'] },
        { ...item({ genres: [] }), personal_genres: ['ambient'] },
      ]
      expect(availableGenres(collection)).toEqual(['ambient', 'fusion', 'jazz'])
    })
  })

  describe('canonical genre facet (spec 0015 §5 - PR 2)', () => {
    it('catalog rock + a legacy personal רוק collapse to one `rock` option', () => {
      const collection = [
        item({ genres: ['rock'] }),
        { ...item({ genres: [] }), personal_genres: ['רוק'] },
        item({ genres: ['jazz'] }),
      ]
      expect(availableGenres(collection)).toEqual(['jazz', 'rock'])
    })

    it('selecting `rock` returns both the catalog-rock and the Hebrew-alias record', () => {
      const catalogRock = item({ genres: ['rock'] })
      const hebrewRock: CollectionItemWithRelease = {
        ...item({ genres: [] }),
        personal_genres: ['רוק'],
      }
      const jazz = item({ genres: ['jazz'] })
      const collection = [catalogRock, hebrewRock, jazz]
      const out = applyCollectionQuery(
        collection,
        filters({ genre: 'rock' }),
        'recently-added',
      )
      expect(out).toEqual([catalogRock, hebrewRock])
    })

    it('a bookmarked `?genre=רוק` still filters canonical rock records', () => {
      const catalogRock = item({ genres: ['rock'] })
      const jazz = item({ genres: ['jazz'] })
      // `filters.genre` carries the raw param; applyCollectionQuery canonicalizes it
      const out = applyCollectionQuery(
        [catalogRock, jazz],
        filters({ genre: 'רוק' }),
        'recently-added',
      )
      expect(out).toEqual([catalogRock])
    })

    it('an unknown Hebrew genre stays a distinct facet option', () => {
      const collection = [
        item({ genres: ['rock'] }),
        { ...item({ genres: [] }), personal_genres: ['זמר עברי'] },
      ]
      expect(availableGenres(collection)).toEqual(['rock', 'זמר עברי'])
    })
  })

  describe('rating and listening controls (spec 0016 Finding A)', () => {
    const NOW = new Date('2026-09-14T12:00:00.000Z').getTime()
    const CUTOFF_DAYS = 30
    const cutoffMs = NOW - CUTOFF_DAYS * 24 * 60 * 60 * 1000

    let eventCounter = 0
    function playEvent(
      collectionItemId: string,
      listenedAt: string,
    ): ListeningEventRecord {
      eventCounter += 1
      return {
        id: `event-${eventCounter}`,
        collection_item_id: collectionItemId,
        listened_at: listenedAt,
        created_at: listenedAt,
      }
    }

    describe('rating filter', () => {
      it('3+ includes 3, 4, and 5; excludes lower and unrated', () => {
        const r3 = { ...item(), rating: 3 }
        const r4 = { ...item(), rating: 4 }
        const r5 = { ...item(), rating: 5 }
        const r2 = { ...item(), rating: 2 }
        const unrated = { ...item(), rating: null }
        const collection = [r3, r4, r5, r2, unrated]

        expect(
          ids(applyCollectionQuery(collection, filters({ minRating: 3 }), 'recently-added')),
        ).toEqual([r3.id, r4.id, r5.id])
      })

      it('4+ includes only 4 and 5', () => {
        const r4 = { ...item(), rating: 4 }
        const r5 = { ...item(), rating: 5 }
        const r3 = { ...item(), rating: 3 }
        const collection = [r4, r5, r3]

        expect(
          ids(applyCollectionQuery(collection, filters({ minRating: 4 }), 'recently-added')),
        ).toEqual([r4.id, r5.id])
      })

      it('5+ includes only 5', () => {
        const r5 = { ...item(), rating: 5 }
        const r4 = { ...item(), rating: 4 }
        const collection = [r5, r4]

        expect(
          ids(applyCollectionQuery(collection, filters({ minRating: 5 }), 'recently-added')),
        ).toEqual([r5.id])
      })

      it('unrated is excluded by any positive minRating; 0 means no filter', () => {
        const rated = { ...item(), rating: 5 }
        const unrated = { ...item(), rating: null }
        const collection = [rated, unrated]

        expect(
          ids(applyCollectionQuery(collection, filters({ minRating: 3 }), 'recently-added')),
        ).toEqual([rated.id])
        expect(
          ids(applyCollectionQuery(collection, filters({ minRating: 0 }), 'recently-added')),
        ).toEqual([rated.id, unrated.id])
      })
    })

    describe('rating sort', () => {
      it('"highest" orders 5 to 1, unrated last', () => {
        const r2 = { ...item(), rating: 2 }
        const r5 = { ...item(), rating: 5 }
        const unrated = { ...item(), rating: null }
        const r4 = { ...item(), rating: 4 }
        const collection = [r2, r5, unrated, r4]

        expect(
          ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'rating-desc')),
        ).toEqual([r5.id, r4.id, r2.id, unrated.id])
      })

      it('"lowest" orders 1 to 5, unrated STILL last (not first)', () => {
        const r2 = { ...item(), rating: 2 }
        const r5 = { ...item(), rating: 5 }
        const unrated = { ...item(), rating: null }
        const r4 = { ...item(), rating: 4 }
        const collection = [r2, r5, unrated, r4]

        expect(
          ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'rating-asc')),
        ).toEqual([r2.id, r4.id, r5.id, unrated.id])
      })

      it('deterministic tie handling: equal ratings keep incoming order', () => {
        const a = { ...item(), rating: 4 }
        const b = { ...item(), rating: 4 }
        const collection = [a, b]

        expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'rating-desc'))).toEqual([
          a.id,
          b.id,
        ])
        expect(ids(applyCollectionQuery(collection, EMPTY_FILTERS, 'rating-asc'))).toEqual([
          a.id,
          b.id,
        ])
      })
    })

    describe('never-played filter', () => {
      it('an item with no events qualifies', () => {
        const neverPlayed = item()
        const played = item()
        const events = [playEvent(played.id, '2026-09-01T00:00:00.000Z')]
        const listeningByItem = buildListeningSummaryMap(events)
        const collection = [neverPlayed, played]

        expect(
          ids(
            applyCollectionQuery(
              collection,
              filters({ listening: 'never' }),
              'recently-added',
              listeningByItem,
              NOW,
            ),
          ),
        ).toEqual([neverPlayed.id])
      })

      it('an item with one or more events does not qualify', () => {
        const played = item()
        const events = [
          playEvent(played.id, '2026-09-01T00:00:00.000Z'),
          playEvent(played.id, '2026-09-05T00:00:00.000Z'),
        ]
        const listeningByItem = buildListeningSummaryMap(events)

        expect(
          applyCollectionQuery(
            [played],
            filters({ listening: 'never' }),
            'recently-added',
            listeningByItem,
            NOW,
          ),
        ).toHaveLength(0)
      })
    })

    describe('stale filter (approved 30-day boundary, spec 0016 §21.3)', () => {
      it('never played qualifies', () => {
        const neverPlayed = item()
        const listeningByItem = buildListeningSummaryMap([])

        expect(
          ids(
            applyCollectionQuery(
              [neverPlayed],
              filters({ listening: 'stale' }),
              'recently-added',
              listeningByItem,
              NOW,
            ),
          ),
        ).toEqual([neverPlayed.id])
      })

      it('played strictly before the cutoff qualifies', () => {
        const stale = item()
        const events = [playEvent(stale.id, new Date(cutoffMs - 1).toISOString())]
        const listeningByItem = buildListeningSummaryMap(events)

        expect(
          ids(
            applyCollectionQuery(
              [stale],
              filters({ listening: 'stale' }),
              'recently-added',
              listeningByItem,
              NOW,
            ),
          ),
        ).toEqual([stale.id])
      })

      it('played exactly at the cutoff does NOT qualify (recent)', () => {
        const recent = item()
        const events = [playEvent(recent.id, new Date(cutoffMs).toISOString())]
        const listeningByItem = buildListeningSummaryMap(events)

        expect(
          applyCollectionQuery(
            [recent],
            filters({ listening: 'stale' }),
            'recently-added',
            listeningByItem,
            NOW,
          ),
        ).toHaveLength(0)
      })

      it('played after the cutoff does NOT qualify', () => {
        const recent = item()
        const events = [playEvent(recent.id, new Date(cutoffMs + 1).toISOString())]
        const listeningByItem = buildListeningSummaryMap(events)

        expect(
          applyCollectionQuery(
            [recent],
            filters({ listening: 'stale' }),
            'recently-added',
            listeningByItem,
            NOW,
          ),
        ).toHaveLength(0)
      })
    })

    describe('never/stale are mutually exclusive states', () => {
      it('CollectionFilters.listening only ever holds one of none/never/stale', () => {
        const f: CollectionFilters = filters({ listening: 'never' })
        expect(f.listening).toBe('never')
        // there is no shape that represents both at once - a single field,
        // not two independent booleans (spec 0016 §21.3/§21.5)
        expect(Object.keys(f)).not.toContain('neverPlayed')
        expect(Object.keys(f)).not.toContain('stale')
      })
    })

    describe('least recently played sort', () => {
      it('never-played first, then oldest to newest lastListenedAt', () => {
        const neverPlayed = item()
        const oldest = item()
        const newest = item()
        const events = [
          playEvent(oldest.id, '2026-08-01T00:00:00.000Z'),
          playEvent(newest.id, '2026-09-10T00:00:00.000Z'),
        ]
        const listeningByItem = buildListeningSummaryMap(events)
        // deliberately NOT already in "least recently played" order
        const collection = [newest, oldest, neverPlayed]

        expect(
          ids(
            applyCollectionQuery(
              collection,
              EMPTY_FILTERS,
              'least-recently-played',
              listeningByItem,
              NOW,
            ),
          ),
        ).toEqual([neverPlayed.id, oldest.id, newest.id])
      })

      it('deterministic ties: equal listening state keeps incoming order', () => {
        const a = item()
        const b = item()
        const collection = [a, b] // both never-played
        const listeningByItem = buildListeningSummaryMap([])

        expect(
          ids(
            applyCollectionQuery(
              collection,
              EMPTY_FILTERS,
              'least-recently-played',
              listeningByItem,
              NOW,
            ),
          ),
        ).toEqual([a.id, b.id])
      })

      it('an empty/not-ready listening map never fabricates an order (stable no-op)', () => {
        const a = item()
        const b = item()
        const c = item()
        const collection = [a, b, c]

        expect(
          ids(
            applyCollectionQuery(collection, EMPTY_FILTERS, 'least-recently-played'),
          ),
        ).toEqual([a.id, b.id, c.id])
      })
    })

    describe('combinations with existing filters', () => {
      it('min rating + genre', () => {
        const match = { ...item({ genres: ['jazz'] }), rating: 5 }
        const wrongGenre = { ...item({ genres: ['rock'] }), rating: 5 }
        const wrongRating = { ...item({ genres: ['jazz'] }), rating: 2 }
        const collection = [match, wrongGenre, wrongRating]

        expect(
          ids(
            applyCollectionQuery(
              collection,
              filters({ minRating: 4, genre: 'jazz' }),
              'recently-added',
            ),
          ),
        ).toEqual([match.id])
      })

      it('stale + favourite (favourite is applied by CollectionBrowser, not this module - verify stale still composes with an existing predicate-shaped filter)', () => {
        const staleFav = { ...item(), is_favorite: true }
        const recentFav = { ...item(), is_favorite: true }
        const events = [playEvent(recentFav.id, new Date(cutoffMs + 1).toISOString())]
        const listeningByItem = buildListeningSummaryMap(events)
        const collection = [staleFav, recentFav]

        const staleResults = applyCollectionQuery(
          collection,
          filters({ listening: 'stale' }),
          'recently-added',
          listeningByItem,
          NOW,
        )
        // favourite filtering happens after applyCollectionQuery in
        // CollectionBrowser; confirm stale correctly narrows first.
        expect(ids(staleResults)).toEqual([staleFav.id])
        expect(staleResults.every((entry) => entry.is_favorite)).toBe(true)
      })

      it('never + decade', () => {
        const neverInDecade = item({ release_year: 1975 })
        const neverOutOfDecade = item({ release_year: 1999 })
        const playedInDecade = item({ release_year: 1975 })
        const events = [playEvent(playedInDecade.id, '2026-09-01T00:00:00.000Z')]
        const listeningByItem = buildListeningSummaryMap(events)
        const collection = [neverInDecade, neverOutOfDecade, playedInDecade]

        expect(
          ids(
            applyCollectionQuery(
              collection,
              filters({ listening: 'never', decade: '1970s' }),
              'recently-added',
              listeningByItem,
              NOW,
            ),
          ),
        ).toEqual([neverInDecade.id])
      })

      it('never + search', () => {
        const neverMatching = item({ artist: 'Miles Davis' })
        const neverNotMatching = item({ artist: 'John Coltrane' })
        const collection = [neverMatching, neverNotMatching]
        const listeningByItem = buildListeningSummaryMap([])

        expect(
          ids(
            applyCollectionQuery(
              collection,
              filters({ listening: 'never', search: 'miles' }),
              'recently-added',
              listeningByItem,
              NOW,
            ),
          ),
        ).toEqual([neverMatching.id])
      })
    })
  })
})
