import { describe, expect, it } from 'vitest'
import {
  collectionStats,
  decadeDistribution,
  listeningStats,
  recentlyAdded,
  recentlyPlayed,
  rediscover,
  topGenres,
} from './insights.ts'
import type { CollectionItemWithRelease } from '../supabase/collection.ts'
import type { ListeningEventRecord } from '../supabase/listeningEvents.ts'

const NOW = Date.parse('2026-09-02T12:00:00.000Z')
const daysAgo = (n: number) =>
  new Date(NOW - n * 86_400_000).toISOString()

function item(
  id: string,
  over: Partial<CollectionItemWithRelease> & {
    year?: number | null
    genres?: string[]
  } = {},
): CollectionItemWithRelease {
  const { year = 1990, genres = [], ...rest } = over
  return {
    id,
    added_at: `2026-08-${id.padStart(2, '0')}T00:00:00.000Z`,
    created_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: `rel-${id}`,
      artist: `Artist ${id}`,
      title: `Title ${id}`,
      release_year: year,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres,
      updated_at: '2026-08-01T00:00:00.000Z',
    },
    ...rest,
  }
}

function ev(id: string, itemId: string, listenedAt: string): ListeningEventRecord {
  return {
    id,
    collection_item_id: itemId,
    listened_at: listenedAt,
    created_at: listenedAt,
  }
}

describe('collectionStats (collection-only, always safe)', () => {
  it('counts size and favorites without any listening data', () => {
    const items = [
      item('01', { is_favorite: true }),
      item('02', { is_favorite: true }),
      item('03'),
    ]
    expect(collectionStats(items)).toEqual({ collectionSize: 3, favorites: 2 })
  })

  it('empty collection is zero', () => {
    expect(collectionStats([])).toEqual({ collectionSize: 0, favorites: 0 })
  })
})

describe('listeningStats (only valid when events are loaded)', () => {
  const items = [item('01'), item('02'), item('03'), item('04')]
  const events = [
    ev('e1', '01', daysAgo(2)), // in window
    ev('e2', '01', daysAgo(40)), // older, same item
    ev('e3', '02', daysAgo(29)), // in window
    ev('e4', '03', daysAgo(45)), // outside window, but played
  ]

  it('counts played-in-30d (distinct records) and never-played', () => {
    const s = listeningStats(items, events, NOW)
    expect(s.playedInWindow).toBe(2) // items 01 and 02
    expect(s.neverPlayed).toBe(1) // item 04
  })

  it('an item with only old plays is neither in-window nor never-played', () => {
    const s = listeningStats([item('03')], [ev('e', '03', daysAgo(90))], NOW)
    expect(s.playedInWindow).toBe(0)
    expect(s.neverPlayed).toBe(0)
  })
})

describe('recentlyAdded', () => {
  it('orders by added_at desc then id desc, and caps', () => {
    const result = recentlyAdded(
      [item('01'), item('05'), item('03')],
      2,
    )
    expect(result.map((r) => r.id)).toEqual(['05', '03'])
  })
})

describe('recentlyPlayed', () => {
  it('one entry per played item, most-recent listen first', () => {
    const items = [item('01'), item('02'), item('03')]
    const events = [
      ev('a', '01', daysAgo(10)),
      ev('b', '01', daysAgo(1)),
      ev('c', '02', daysAgo(5)),
    ]
    const result = recentlyPlayed(items, events, 5)
    expect(result.map((r) => r.item.id)).toEqual(['01', '02'])
    expect(result[0].lastListenedAt).toBe(daysAgo(1))
  })

  it('never-played items are excluded; empty when no events', () => {
    expect(recentlyPlayed([item('01')], [], 5)).toEqual([])
  })
})

describe('rediscover', () => {
  it('selects never-played and 60+ day-stale items, favouring favorites then rating', () => {
    const items = [
      item('01', { is_favorite: true, rating: 3 }), // stale + favorite
      item('02', { rating: 5 }), // never played, high rating
      item('03', { rating: 2 }), // never played, low rating
      item('04'), // played recently -> excluded
      item('05'), // never played, unrated
    ]
    const events = [
      ev('a', '01', daysAgo(120)),
      ev('b', '04', daysAgo(3)),
    ]
    const result = rediscover(items, events, NOW, 3)
    expect(result.map((r) => r.id)).toEqual(['01', '02', '03'])
  })

  it('empty when everything was played recently', () => {
    const items = [item('01'), item('02')]
    const events = [ev('a', '01', daysAgo(1)), ev('b', '02', daysAgo(2))]
    expect(rediscover(items, events, NOW, 5)).toEqual([])
  })
})

describe('decadeDistribution', () => {
  it('returns percentages by decade when enough dated items exist', () => {
    const items = [
      item('01', { year: 1971 }),
      item('02', { year: 1975 }),
      item('03', { year: 1991 }),
      item('04', { year: 1999 }),
    ]
    const dist = decadeDistribution(items)
    expect(dist).toEqual([
      { decade: '1970s', count: 2, pct: 50 },
      { decade: '1990s', count: 2, pct: 50 },
    ])
  })

  it('returns [] when fewer than MIN_INSIGHT_ITEMS have a year', () => {
    const items = [item('01', { year: 1971 }), item('02', { year: null })]
    expect(decadeDistribution(items)).toEqual([])
  })
})

describe('topGenres', () => {
  it('counts genres, sorted desc then alpha, capped', () => {
    const items = [
      item('01', { genres: ['Rock', 'Pop'] }),
      item('02', { genres: ['rock'] }),
      item('03', { genres: ['jazz'] }),
      item('04', { genres: ['rock', 'jazz'] }),
    ]
    expect(topGenres(items, 2)).toEqual([
      { genre: 'rock', count: 3 },
      { genre: 'jazz', count: 2 },
    ])
  })

  it('returns [] with insufficient genre coverage', () => {
    const items = [item('01', { genres: ['rock'] }), item('02', { genres: [] })]
    expect(topGenres(items)).toEqual([])
  })
})
