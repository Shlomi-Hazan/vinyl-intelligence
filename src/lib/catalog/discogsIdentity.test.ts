import { describe, expect, it } from 'vitest'
import { DISCOGS_RELEASE_ID_PATTERN, discogsReleaseUrl } from './discogsIdentity.ts'

describe('DISCOGS_RELEASE_ID_PATTERN', () => {
  it('accepts a bare positive integer of 1-10 digits', () => {
    expect(DISCOGS_RELEASE_ID_PATTERN.test('1')).toBe(true)
    expect(DISCOGS_RELEASE_ID_PATTERN.test('26770295')).toBe(true)
    expect(DISCOGS_RELEASE_ID_PATTERN.test('1234567890')).toBe(true)
  })

  it('rejects a leading zero', () => {
    expect(DISCOGS_RELEASE_ID_PATTERN.test('0')).toBe(false)
    expect(DISCOGS_RELEASE_ID_PATTERN.test('01234')).toBe(false)
  })

  it('rejects a non-numeric or malformed id', () => {
    expect(DISCOGS_RELEASE_ID_PATTERN.test('not-a-uuid')).toBe(false)
    expect(DISCOGS_RELEASE_ID_PATTERN.test('')).toBe(false)
    expect(DISCOGS_RELEASE_ID_PATTERN.test('-5')).toBe(false)
    expect(DISCOGS_RELEASE_ID_PATTERN.test('5.5')).toBe(false)
  })

  it('rejects a MusicBrainz UUID (the two id shapes never overlap)', () => {
    expect(
      DISCOGS_RELEASE_ID_PATTERN.test('11111111-1111-4111-8111-111111111111'),
    ).toBe(false)
  })

  it('rejects an id longer than 10 digits', () => {
    expect(DISCOGS_RELEASE_ID_PATTERN.test('12345678901')).toBe(false)
  })
})

describe('discogsReleaseUrl', () => {
  it('builds the canonical release page URL for a valid id', () => {
    expect(discogsReleaseUrl('26770295')).toBe(
      'https://www.discogs.com/release/26770295',
    )
  })

  it('returns null (never a malformed string) for an invalid id', () => {
    expect(discogsReleaseUrl('not-a-uuid')).toBeNull()
    expect(discogsReleaseUrl('')).toBeNull()
    expect(discogsReleaseUrl('0')).toBeNull()
  })
})
