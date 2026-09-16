import { describe, expect, it } from 'vitest'
import {
  MUSICBRAINZ_RELEASE_ID_PATTERN,
  musicBrainzReleaseUrl,
  musicBrainzWebSearchUrl,
  parseMusicBrainzReleaseUrl,
} from './musicbrainzIdentity.ts'

const validId = '11111111-1111-4111-8111-111111111111'
const validIdUpper = validId.toUpperCase()

describe('MUSICBRAINZ_RELEASE_ID_PATTERN', () => {
  it('accepts a valid lowercase or uppercase UUID', () => {
    expect(MUSICBRAINZ_RELEASE_ID_PATTERN.test(validId)).toBe(true)
    expect(MUSICBRAINZ_RELEASE_ID_PATTERN.test(validIdUpper)).toBe(true)
  })

  it('rejects a malformed id', () => {
    expect(MUSICBRAINZ_RELEASE_ID_PATTERN.test('not-a-uuid')).toBe(false)
    expect(MUSICBRAINZ_RELEASE_ID_PATTERN.test('')).toBe(false)
  })
})

describe('musicBrainzReleaseUrl', () => {
  it('builds the canonical release URL for a valid id, lowercased', () => {
    expect(musicBrainzReleaseUrl(validId)).toBe(
      `https://musicbrainz.org/release/${validId}`,
    )
    expect(musicBrainzReleaseUrl(validIdUpper)).toBe(
      `https://musicbrainz.org/release/${validId}`,
    )
  })

  it('returns null (never a malformed string) for an invalid id', () => {
    expect(musicBrainzReleaseUrl('not-a-uuid')).toBeNull()
    expect(musicBrainzReleaseUrl('')).toBeNull()
  })
})

describe('musicBrainzWebSearchUrl', () => {
  it('includes the query term plus the fixed type/method params', () => {
    expect(musicBrainzWebSearchUrl('Portishead Dummy')).toBe(
      'https://musicbrainz.org/search?query=Portishead+Dummy&type=release&method=indexed',
    )
  })

  it('trims the term before encoding it', () => {
    expect(musicBrainzWebSearchUrl('  Radiohead  ')).toBe(
      'https://musicbrainz.org/search?query=Radiohead&type=release&method=indexed',
    )
  })

  it('omits the query param entirely for null or empty/whitespace-only term', () => {
    expect(musicBrainzWebSearchUrl(null)).toBe(
      'https://musicbrainz.org/search?type=release&method=indexed',
    )
    expect(musicBrainzWebSearchUrl('')).toBe(
      'https://musicbrainz.org/search?type=release&method=indexed',
    )
    expect(musicBrainzWebSearchUrl('   ')).toBe(
      'https://musicbrainz.org/search?type=release&method=indexed',
    )
  })
})

describe('parseMusicBrainzReleaseUrl', () => {
  it('accepts the canonical https URL', () => {
    expect(
      parseMusicBrainzReleaseUrl(`https://musicbrainz.org/release/${validId}`),
    ).toEqual({ providerReleaseId: validId })
  })

  it('normalizes http to https (accepts it) and lowercases the id', () => {
    expect(
      parseMusicBrainzReleaseUrl(`http://musicbrainz.org/release/${validIdUpper}`),
    ).toEqual({ providerReleaseId: validId })
  })

  it('accepts exactly one optional trailing slash', () => {
    expect(
      parseMusicBrainzReleaseUrl(`https://musicbrainz.org/release/${validId}/`),
    ).toEqual({ providerReleaseId: validId })
  })

  it('accepts and strips a tolerated query string and/or fragment', () => {
    expect(
      parseMusicBrainzReleaseUrl(
        `https://musicbrainz.org/release/${validId}?srsltid=abc`,
      ),
    ).toEqual({ providerReleaseId: validId })
    expect(
      parseMusicBrainzReleaseUrl(
        `https://musicbrainz.org/release/${validId}#recordings`,
      ),
    ).toEqual({ providerReleaseId: validId })
  })

  it('is case-insensitive on scheme and host', () => {
    expect(
      parseMusicBrainzReleaseUrl(`HTTPS://MusicBrainz.ORG/release/${validId}`),
    ).toEqual({ providerReleaseId: validId })
  })

  it('rejects an empty or whitespace-only input as untouched (null)', () => {
    expect(parseMusicBrainzReleaseUrl('')).toBeNull()
    expect(parseMusicBrainzReleaseUrl('   ')).toBeNull()
  })

  it('rejects a wrong hostname', () => {
    expect(
      parseMusicBrainzReleaseUrl(`https://example.com/release/${validId}`),
    ).toBeNull()
  })

  it('rejects a subdomain', () => {
    expect(
      parseMusicBrainzReleaseUrl(`https://www.musicbrainz.org/release/${validId}`),
    ).toBeNull()
    expect(
      parseMusicBrainzReleaseUrl(`https://beta.musicbrainz.org/release/${validId}`),
    ).toBeNull()
  })

  it('rejects a lookalike domain', () => {
    expect(
      parseMusicBrainzReleaseUrl(
        `https://musicbrainz.org.evil.example/release/${validId}`,
      ),
    ).toBeNull()
    expect(
      parseMusicBrainzReleaseUrl(`https://evil-musicbrainz.org/release/${validId}`),
    ).toBeNull()
  })

  it('rejects a non-release MusicBrainz entity path', () => {
    for (const entity of ['artist', 'release-group', 'recording', 'work', 'label']) {
      expect(
        parseMusicBrainzReleaseUrl(`https://musicbrainz.org/${entity}/${validId}`),
      ).toBeNull()
    }
  })

  it('rejects a malformed MBID', () => {
    expect(
      parseMusicBrainzReleaseUrl('https://musicbrainz.org/release/not-a-uuid'),
    ).toBeNull()
  })

  it('rejects a missing id (bare /release/ or /release)', () => {
    expect(parseMusicBrainzReleaseUrl('https://musicbrainz.org/release/')).toBeNull()
    expect(parseMusicBrainzReleaseUrl('https://musicbrainz.org/release')).toBeNull()
  })

  it('rejects any extra path segment beyond the one optional trailing slash', () => {
    expect(
      parseMusicBrainzReleaseUrl(`https://musicbrainz.org/release/${validId}/edit`),
    ).toBeNull()
    expect(
      parseMusicBrainzReleaseUrl(`https://musicbrainz.org/release/${validId}//`),
    ).toBeNull()
  })

  it('rejects userinfo/credentials embedded in the URL', () => {
    expect(
      parseMusicBrainzReleaseUrl(
        `https://user:pass@musicbrainz.org/release/${validId}`,
      ),
    ).toBeNull()
  })

  it('rejects a non-http(s) scheme', () => {
    expect(parseMusicBrainzReleaseUrl(`javascript:alert(1)`)).toBeNull()
    expect(parseMusicBrainzReleaseUrl(`data:text/plain,${validId}`)).toBeNull()
    expect(
      parseMusicBrainzReleaseUrl(`file:///release/${validId}`),
    ).toBeNull()
  })

  it('rejects an explicit non-default port', () => {
    expect(
      parseMusicBrainzReleaseUrl(
        `https://musicbrainz.org:8080/release/${validId}`,
      ),
    ).toBeNull()
  })

  it('accepts an explicit default port (normalized away, not rejected)', () => {
    expect(
      parseMusicBrainzReleaseUrl(
        `https://musicbrainz.org:443/release/${validId}`,
      ),
    ).toEqual({ providerReleaseId: validId })
  })
})
