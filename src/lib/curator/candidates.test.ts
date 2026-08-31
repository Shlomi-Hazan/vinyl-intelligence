import { describe, expect, it } from 'vitest'
import {
  applyHardFilters,
  applyPreviousExclusion,
  buildAllowedCandidateSet,
  deriveCandidateFacts,
  rankAndCap,
  scoreCandidate,
  selectCandidates,
  stableHash01,
} from './candidates.ts'
import type {
  CuratorCollectionItem,
  CuratorIntent,
  CuratorListeningEvent,
} from './types.ts'

const NOW = Date.parse('2026-08-31T00:00:00.000Z')

function daysAgoIso(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString()
}

function item(overrides: Partial<CuratorCollectionItem> = {}): CuratorCollectionItem {
  return {
    id: 'item-1',
    added_at: '2026-08-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    artist: 'Artist',
    title: 'Title',
    release_year: 1990,
    genres: ['rock'],
    ...overrides,
  }
}

function baseIntent(overrides: Partial<CuratorIntent> = {}): CuratorIntent {
  return {
    includeGenres: [],
    excludeGenres: [],
    decades: [],
    minRating: null,
    favoritesOnly: false,
    neverPlayedOnly: false,
    avoidRecentlyPlayed: false,
    recentDays: null,
    preference: 'none',
    energy: 'any',
    mood: null,
    requestedCount: 3,
    ...overrides,
  }
}

describe('deriveCandidateFacts', () => {
  it('derives playCount, lastListenedAt (max), neverPlayed, and decade', () => {
    const items = [item({ id: 'a', release_year: 1994 }), item({ id: 'b', release_year: null })]
    const events: CuratorListeningEvent[] = [
      { collection_item_id: 'a', listened_at: daysAgoIso(10) },
      { collection_item_id: 'a', listened_at: daysAgoIso(3) },
    ]
    const [a, b] = deriveCandidateFacts(items, events)
    expect(a.playCount).toBe(2)
    expect(a.lastListenedAt).toBe(daysAgoIso(3))
    expect(a.neverPlayed).toBe(false)
    expect(a.decade).toBe(1990)
    expect(b.playCount).toBe(0)
    expect(b.neverPlayed).toBe(true)
    expect(b.decade).toBeNull()
  })

  it('normalizes genres to trimmed lowercase', () => {
    const [c] = deriveCandidateFacts([item({ genres: [' Jazz ', 'ROCK'] })], [])
    expect(c.genres).toEqual(['jazz', 'rock'])
  })
})

describe('applyHardFilters', () => {
  function candidates() {
    return deriveCandidateFacts(
      [
        item({ id: 'rock90', genres: ['rock'], release_year: 1991, rating: 4, is_favorite: true }),
        item({ id: 'jazz59', genres: ['jazz'], release_year: 1959, rating: 5 }),
        item({ id: 'jazzrap91', genres: ['hip hop', 'jazz rap'], release_year: 1991 }),
        item({ id: 'nogenre', genres: [], release_year: 2001 }),
      ],
      [{ collection_item_id: 'rock90', listened_at: daysAgoIso(3) }],
    )
  }

  it('includeGenres OR-matches; empty genres fail include', () => {
    const out = applyHardFilters(candidates(), baseIntent({ includeGenres: ['rock'] }), NOW)
    expect(out.map((c) => c.id)).toEqual(['rock90'])
  })

  it('excludeGenres uses exact-token equality, not substring', () => {
    const out = applyHardFilters(candidates(), baseIntent({ excludeGenres: ['jazz'] }), NOW)
    // jazz59 removed; jazzrap91 (genre "jazz rap") kept.
    expect(out.map((c) => c.id).sort()).toEqual(['jazzrap91', 'nogenre', 'rock90'])
  })

  it('decades membership; null year fails', () => {
    const withNull = deriveCandidateFacts([item({ id: 'x', release_year: null })], [])
    expect(applyHardFilters(withNull, baseIntent({ decades: [1990] }), NOW)).toHaveLength(0)
    const out = applyHardFilters(candidates(), baseIntent({ decades: [1990] }), NOW)
    expect(out.map((c) => c.id).sort()).toEqual(['jazzrap91', 'rock90'])
  })

  it('minRating filters unrated and lower-rated', () => {
    const out = applyHardFilters(candidates(), baseIntent({ minRating: 5 }), NOW)
    expect(out.map((c) => c.id)).toEqual(['jazz59'])
  })

  it('favoritesOnly and neverPlayedOnly', () => {
    expect(
      applyHardFilters(candidates(), baseIntent({ favoritesOnly: true }), NOW).map((c) => c.id),
    ).toEqual(['rock90'])
    expect(
      applyHardFilters(candidates(), baseIntent({ neverPlayedOnly: true }), NOW).map((c) => c.id).sort(),
    ).toEqual(['jazz59', 'jazzrap91', 'nogenre'])
  })

  it('avoidRecentlyPlayed with default 30-day window and a boundary case', () => {
    const list = deriveCandidateFacts(
      [item({ id: 'old' }), item({ id: 'recent' }), item({ id: 'edge' }), item({ id: 'never' })],
      [
        { collection_item_id: 'old', listened_at: daysAgoIso(40) },
        { collection_item_id: 'recent', listened_at: daysAgoIso(5) },
        { collection_item_id: 'edge', listened_at: daysAgoIso(30) },
      ],
    )
    const out = applyHardFilters(list, baseIntent({ avoidRecentlyPlayed: true }), NOW)
    // 'edge' played exactly 30 days ago counts as recent (excluded).
    expect(out.map((c) => c.id).sort()).toEqual(['never', 'old'])
  })

  it('avoidRecentlyPlayed honours an explicit recentDays', () => {
    const list = deriveCandidateFacts(
      [item({ id: 'a' }), item({ id: 'b' })],
      [
        { collection_item_id: 'a', listened_at: daysAgoIso(50) },
        { collection_item_id: 'b', listened_at: daysAgoIso(100) },
      ],
    )
    const out = applyHardFilters(
      list,
      baseIntent({ avoidRecentlyPlayed: true, recentDays: 90 }),
      NOW,
    )
    expect(out.map((c) => c.id)).toEqual(['b'])
  })
})

describe('scoreCandidate / rankAndCap', () => {
  it('surprise is deterministic for the same input', () => {
    expect(stableHash01('item-1')).toBe(stableHash01('item-1'))
    const list = deriveCandidateFacts(
      [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })],
      [],
    )
    const intent = baseIntent({ preference: 'surprise' })
    const first = rankAndCap(list, intent, NOW).map((c) => c.id)
    const second = rankAndCap([...list].reverse(), intent, NOW).map((c) => c.id)
    expect(first).toEqual(second)
  })

  it('highly_rated ranks a higher rating first', () => {
    const list = deriveCandidateFacts(
      [item({ id: 'r3', rating: 3 }), item({ id: 'r5', rating: 5 }), item({ id: 'r1', rating: 1 })],
      [],
    )
    const out = rankAndCap(list, baseIntent({ preference: 'highly_rated' }), NOW)
    expect(out.map((c) => c.id)).toEqual(['r5', 'r3', 'r1'])
  })

  it('rediscovery ranks never-played and long-ago plays first', () => {
    const list = deriveCandidateFacts(
      [item({ id: 'never' }), item({ id: 'recent' }), item({ id: 'old' })],
      [
        { collection_item_id: 'recent', listened_at: daysAgoIso(2) },
        { collection_item_id: 'old', listened_at: daysAgoIso(300) },
      ],
    )
    const out = rankAndCap(list, baseIntent({ preference: 'rediscovery' }), NOW)
    expect(out.map((c) => c.id)).toEqual(['never', 'old', 'recent'])
  })

  it('tie-break: equal score falls back to added_at desc then id asc (uses the loaded added_at)', () => {
    const list = deriveCandidateFacts(
      [
        item({ id: 'zzz', added_at: '2026-01-01T00:00:00.000Z' }),
        item({ id: 'aaa', added_at: '2026-06-01T00:00:00.000Z' }),
        item({ id: 'mmm', added_at: '2026-06-01T00:00:00.000Z' }),
      ],
      [],
    )
    // preference none + identical rating/favorite => identical score.
    const scores = list.map((c) => scoreCandidate(c, baseIntent(), NOW))
    expect(new Set(scores).size).toBe(1)
    const out = rankAndCap(list, baseIntent(), NOW).map((c) => c.id)
    // newer added_at first (aaa/mmm before zzz); equal added_at -> id asc.
    expect(out).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('caps at 12 candidates', () => {
    const many = Array.from({ length: 20 }, (_, i) => item({ id: `i${i}` }))
    const out = selectCandidates(many, [], baseIntent(), NOW)
    expect(out).toHaveLength(12)
  })

  it('returns an empty list when nothing passes the hard filter', () => {
    const out = selectCandidates([item({ genres: ['rock'] })], [], baseIntent({ includeGenres: ['jazz'] }), NOW)
    expect(out).toEqual([])
  })
})

describe('buildAllowedCandidateSet', () => {
  it('projects a fact object without added_at / notes / provider ids and an id set', () => {
    const list = selectCandidates(
      [item({ id: 'a', rating: 4, is_favorite: true })],
      [{ collection_item_id: 'a', listened_at: daysAgoIso(12) }],
      baseIntent(),
      NOW,
    )
    const { facts, ids, byId } = buildAllowedCandidateSet(list, NOW)
    expect(ids.has('a')).toBe(true)
    expect(byId.get('a')?.added_at).toBe('2026-08-01T00:00:00.000Z')
    expect(facts[0]).toEqual({
      id: 'a',
      artist: 'Artist',
      title: 'Title',
      year: 1990,
      decade: 1990,
      genres: ['rock'],
      rating: 4,
      favorite: true,
      playCount: 1,
      lastListenedDaysAgo: 12,
      neverPlayed: false,
    })
    expect(Object.keys(facts[0])).not.toContain('added_at')
    expect(JSON.stringify(facts)).not.toContain('added_at')
  })
})

describe('applyPreviousExclusion (Milestone 10)', () => {
  function three() {
    return deriveCandidateFacts(
      [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })],
      [],
    )
  }

  it('is a no-op on an empty set (returns the same array reference)', () => {
    const list = three()
    expect(applyPreviousExclusion(list, new Set())).toBe(list)
  })

  it('removes only the ids in the set, order-preserving', () => {
    const out = applyPreviousExclusion(three(), new Set(['b']))
    expect(out.map((c) => c.id)).toEqual(['a', 'c'])
  })

  it('ignores ids not present among the candidates', () => {
    const out = applyPreviousExclusion(three(), new Set(['ZZZ', 'ABC123']))
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('can empty the candidate list (caller then returns no_match)', () => {
    expect(applyPreviousExclusion(three(), new Set(['a', 'b', 'c']))).toEqual([])
  })
})
