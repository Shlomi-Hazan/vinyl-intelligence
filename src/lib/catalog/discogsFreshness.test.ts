import { describe, expect, it } from 'vitest'
import {
  DISCOGS_FRESHNESS_WINDOW_MS,
  isDiscogsRowFresh,
  msUntilStale,
} from './discogsFreshness.ts'

const NOW = Date.parse('2026-09-16T12:00:00.000Z')

describe('isDiscogsRowFresh', () => {
  it('a non-Discogs provider is always fresh, regardless of provider_fetched_at', () => {
    expect(isDiscogsRowFresh('musicbrainz', null, NOW)).toBe(true)
    expect(isDiscogsRowFresh(null, null, NOW)).toBe(true)
    expect(isDiscogsRowFresh('manual', null, NOW)).toBe(true)
  })

  it('a Discogs row just below six hours old is fresh', () => {
    const fetchedAt = new Date(NOW - (DISCOGS_FRESHNESS_WINDOW_MS - 1)).toISOString()
    expect(isDiscogsRowFresh('discogs', fetchedAt, NOW)).toBe(true)
  })

  it('a Discogs row exactly six hours old is still fresh (boundary is inclusive)', () => {
    const fetchedAt = new Date(NOW - DISCOGS_FRESHNESS_WINDOW_MS).toISOString()
    expect(isDiscogsRowFresh('discogs', fetchedAt, NOW)).toBe(true)
  })

  it('a Discogs row one millisecond past six hours old is stale', () => {
    const fetchedAt = new Date(NOW - DISCOGS_FRESHNESS_WINDOW_MS - 1).toISOString()
    expect(isDiscogsRowFresh('discogs', fetchedAt, NOW)).toBe(false)
  })

  it('a Discogs row with a null/missing provider_fetched_at is always stale, never fresh', () => {
    expect(isDiscogsRowFresh('discogs', null, NOW)).toBe(false)
    expect(isDiscogsRowFresh('discogs', undefined, NOW)).toBe(false)
  })

  it('a Discogs row with an unparseable timestamp is treated as stale', () => {
    expect(isDiscogsRowFresh('discogs', 'not-a-date', NOW)).toBe(false)
  })
})

describe('msUntilStale', () => {
  it('returns the exact remaining time for a fresh row, with no floor applied', () => {
    const fetchedAt = new Date(NOW - (DISCOGS_FRESHNESS_WINDOW_MS - 1000)).toISOString()
    expect(msUntilStale('discogs', fetchedAt, NOW)).toBe(1000)
  })

  it('returns 0 for an already-stale row', () => {
    const fetchedAt = new Date(NOW - DISCOGS_FRESHNESS_WINDOW_MS - 1).toISOString()
    expect(msUntilStale('discogs', fetchedAt, NOW)).toBe(0)
  })

  it('returns 0 for a non-Discogs row', () => {
    expect(msUntilStale('musicbrainz', null, NOW)).toBe(0)
  })

  it('returns 0 exactly at the six-hour boundary (fresh, but zero time remains)', () => {
    const fetchedAt = new Date(NOW - DISCOGS_FRESHNESS_WINDOW_MS).toISOString()
    expect(msUntilStale('discogs', fetchedAt, NOW)).toBe(0)
  })
})
