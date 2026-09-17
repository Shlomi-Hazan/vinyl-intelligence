import { describe, expect, it } from 'vitest'
import {
  DISCOGS_RELEASE_ID_PATTERN,
  discogsReleaseUrl,
  parseDiscogsReleaseUrl,
} from './discogsIdentity.ts'

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

describe('parseDiscogsReleaseUrl (spec 0018 follow-up §5)', () => {
  it('accepts the canonical https URL with no slug', () => {
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/release/26770295')).toEqual({
      providerReleaseId: '26770295',
    })
  })

  it('accepts a URL with the canonical Artist-Title slug', () => {
    expect(
      parseDiscogsReleaseUrl(
        'https://www.discogs.com/release/26770295-Some-Artist-Some-Title',
      ),
    ).toEqual({ providerReleaseId: '26770295' })
  })

  it('accepts the bare domain without www', () => {
    expect(parseDiscogsReleaseUrl('https://discogs.com/release/26770295')).toEqual({
      providerReleaseId: '26770295',
    })
  })

  it('accepts http (not just https)', () => {
    expect(parseDiscogsReleaseUrl('http://www.discogs.com/release/26770295')).toEqual({
      providerReleaseId: '26770295',
    })
  })

  it('tolerates a trailing slash, a query string, and a fragment', () => {
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/release/26770295/'),
    ).toEqual({ providerReleaseId: '26770295' })
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/release/26770295?ev=rb'),
    ).toEqual({ providerReleaseId: '26770295' })
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/release/26770295#release-notes'),
    ).toEqual({ providerReleaseId: '26770295' })
  })

  it('is case-insensitive on scheme and host', () => {
    expect(
      parseDiscogsReleaseUrl('HTTPS://WWW.Discogs.COM/release/26770295'),
    ).toEqual({ providerReleaseId: '26770295' })
  })

  it('returns null for empty/whitespace-only input, not an error', () => {
    expect(parseDiscogsReleaseUrl('')).toBeNull()
    expect(parseDiscogsReleaseUrl('   ')).toBeNull()
  })

  it('rejects a wrong or lookalike hostname', () => {
    expect(parseDiscogsReleaseUrl('https://example.com/release/26770295')).toBeNull()
    expect(
      parseDiscogsReleaseUrl('https://discogs.com.evil.example/release/26770295'),
    ).toBeNull()
    expect(
      parseDiscogsReleaseUrl('https://sub.discogs.com/release/26770295'),
    ).toBeNull()
  })

  it('rejects a master URL (not a release)', () => {
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/master/26770295')).toBeNull()
  })

  it('rejects an artist URL', () => {
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/artist/26770295-Some-Artist'),
    ).toBeNull()
  })

  it('rejects a Marketplace URL, including one with a release id buried in it', () => {
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/sell/item/26770295'),
    ).toBeNull()
    expect(
      parseDiscogsReleaseUrl(
        'https://www.discogs.com/sell/release/26770295?ev=rb',
      ),
    ).toBeNull()
  })

  it('rejects a numeric id hidden in an unrelated/extra path segment', () => {
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/release/26770295/extra'),
    ).toBeNull()
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/foo/release/26770295'),
    ).toBeNull()
  })

  it('rejects a missing or non-numeric id', () => {
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/release/')).toBeNull()
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com/release/not-a-number'),
    ).toBeNull()
  })

  it('rejects an id that fails DISCOGS_RELEASE_ID_PATTERN (leading zero)', () => {
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/release/0123')).toBeNull()
  })

  it('rejects a non-http(s) scheme', () => {
    expect(
      parseDiscogsReleaseUrl('javascript:alert(1)//release/26770295'),
    ).toBeNull()
    expect(
      parseDiscogsReleaseUrl('ftp://www.discogs.com/release/26770295'),
    ).toBeNull()
  })

  it('rejects embedded userinfo credentials', () => {
    expect(
      parseDiscogsReleaseUrl('https://user:pass@www.discogs.com/release/26770295'),
    ).toBeNull()
  })

  it('rejects an explicit non-default port', () => {
    expect(
      parseDiscogsReleaseUrl('https://www.discogs.com:8443/release/26770295'),
    ).toBeNull()
  })

  it('rejects a malformed URL', () => {
    expect(parseDiscogsReleaseUrl('not a url at all')).toBeNull()
  })
})
