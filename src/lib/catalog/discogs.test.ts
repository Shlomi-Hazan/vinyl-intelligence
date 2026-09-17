import { describe, expect, it, vi } from 'vitest'
import {
  buildDiscogsReleaseLookupUrl,
  buildDiscogsSearchUrl,
  DiscogsError,
  lookupDiscogsRelease,
  normalizeDiscogsExactRelease,
  normalizeDiscogsGenreList,
  normalizeDiscogsSearchResult,
  searchDiscogsReleases,
  type FetchFunction,
} from './discogs.ts'

const token = 'clean-test-token'
const userAgent = 'VinylIntelligence/0.0.0 (test@example.com)'

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status })
}

// The real, verified Phase-0 fixture (spec 0018 §5.1/§10.1): labels[0] is
// Shigola Records with the literal sentinel catno "none"; labels[1] is
// Hasivuv with the real pressing identifier "HSV005".
function hsv005ExactReleasePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 26770295,
    title: 'מה שאפשר עם מה שנשאר',
    artists_sort: 'כהן',
    year: 2023,
    country: 'Israel',
    master_id: 3058367,
    genres: ['Hip Hop'],
    labels: [
      { name: 'Shigola Records', catno: 'none' },
      { name: 'Hasivuv', catno: 'HSV005' },
    ],
    formats: [{ name: 'Vinyl', qty: '2', descriptions: ['LP', 'Album'] }],
    ...overrides,
  }
}

function searchResultPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 26770295,
    title: 'כהן - מה שאפשר עם מה שנשאר',
    year: 2023,
    country: 'Israel',
    master_id: 3058367,
    format: ['Vinyl', 'LP', 'Album'],
    label: ['Shigola Records', 'Hasivuv'],
    catno: 'HSV005',
    ...overrides,
  }
}

describe('URL builders', () => {
  it('builds the Database Search URL with q/type=release/per_page', () => {
    const url = buildDiscogsSearchUrl('כהן מה שאפשר עם מה שנשאר')
    expect(url.origin).toBe('https://api.discogs.com')
    expect(url.pathname).toBe('/database/search')
    expect(url.searchParams.get('q')).toBe('כהן מה שאפשר עם מה שנשאר')
    expect(url.searchParams.get('type')).toBe('release')
    expect(url.searchParams.get('per_page')).toBe('10')
  })

  it('builds the exact-release lookup URL', () => {
    const url = buildDiscogsReleaseLookupUrl('26770295')
    expect(url.toString()).toBe('https://api.discogs.com/releases/26770295')
  })
})

describe('normalizeDiscogsSearchResult (display-only, never split)', () => {
  it('keeps the raw combined "Artist - Title" string as displayTitle, never split', () => {
    const item = normalizeDiscogsSearchResult(searchResultPayload())
    expect(item?.displayTitle).toBe('כהן - מה שאפשר עם מה שנשאר')
    expect(item).not.toHaveProperty('artist')
    expect(item).not.toHaveProperty('title')
  })

  it('maps id, master_id, year, country, and a joined format summary', () => {
    const item = normalizeDiscogsSearchResult(searchResultPayload())
    expect(item).toMatchObject({
      provider: 'discogs',
      providerReleaseId: '26770295',
      providerReleaseGroupId: '3058367',
      releaseYear: 2023,
      country: 'Israel',
      formatSummary: 'Vinyl, LP, Album',
      derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
    })
  })

  it('applies the sentinel-aware rule to the flat catno field', () => {
    const item = normalizeDiscogsSearchResult(searchResultPayload({ catno: 'none' }))
    expect(item?.catalogNumber).toBeNull()
    expect(item?.label).toBe('Shigola Records')
  })

  it('uses a valid, non-sentinel flat catno', () => {
    const item = normalizeDiscogsSearchResult(searchResultPayload())
    expect(item?.catalogNumber).toBe('HSV005')
  })

  it('returns null for a missing/invalid id', () => {
    expect(normalizeDiscogsSearchResult(searchResultPayload({ id: 'not-a-number' }))).toBeNull()
    expect(normalizeDiscogsSearchResult(searchResultPayload({ id: undefined }))).toBeNull()
  })

  it('returns null for a missing title', () => {
    expect(normalizeDiscogsSearchResult(searchResultPayload({ title: '' }))).toBeNull()
  })

  it('returns null for a non-object input', () => {
    expect(normalizeDiscogsSearchResult(null)).toBeNull()
    expect(normalizeDiscogsSearchResult('string')).toBeNull()
  })

  it('prefers cover_image as the transient display image (spec 0018 follow-up §8)', () => {
    const item = normalizeDiscogsSearchResult(
      searchResultPayload({
        cover_image: 'https://img.discogs.com/full.jpeg',
        thumb: 'https://img.discogs.com/thumb.jpeg',
      }),
    )
    expect(item?.transientCoverDisplayUrl).toBe('https://img.discogs.com/full.jpeg')
  })

  it('falls back to thumb when cover_image is absent', () => {
    const item = normalizeDiscogsSearchResult(
      searchResultPayload({ thumb: 'https://img.discogs.com/thumb.jpeg' }),
    )
    expect(item?.transientCoverDisplayUrl).toBe('https://img.discogs.com/thumb.jpeg')
  })

  it('is null when neither cover_image nor thumb is a valid URL', () => {
    expect(
      normalizeDiscogsSearchResult(searchResultPayload())?.transientCoverDisplayUrl,
    ).toBeNull()
    expect(
      normalizeDiscogsSearchResult(
        searchResultPayload({ cover_image: 'not-a-url', thumb: '' }),
      )?.transientCoverDisplayUrl,
    ).toBeNull()
  })

  it('ignores a non-http(s) cover_image value (never javascript:/data:)', () => {
    const item = normalizeDiscogsSearchResult(
      searchResultPayload({ cover_image: 'javascript:alert(1)' }),
    )
    expect(item?.transientCoverDisplayUrl).toBeNull()
  })
})

describe('normalizeDiscogsExactRelease (the sole CatalogCandidate producer)', () => {
  it('maps artists_sort/title unambiguously (never split, unlike the search shape)', () => {
    const result = normalizeDiscogsExactRelease(hsv005ExactReleasePayload())
    expect(result?.candidate.artist).toBe('כהן')
    expect(result?.candidate.title).toBe('מה שאפשר עם מה שנשאר')
  })

  it('the §10.1 sentinel fixture: labels[0] catno "none" is skipped for labels[1] HSV005', () => {
    const result = normalizeDiscogsExactRelease(hsv005ExactReleasePayload())
    expect(result?.candidate.label).toBe('Hasivuv')
    expect(result?.candidate.catalogNumber).toBe('HSV005')
  })

  it('never persists the literal sentinel "none" when every entry lacks a real catno', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        labels: [
          { name: 'Shigola Records', catno: 'none' },
          { name: 'Other Label', catno: 'None' },
        ],
      }),
    )
    expect(result?.candidate.catalogNumber).toBeNull()
    expect(result?.candidate.label).toBe('Shigola Records')
  })

  it('maps provider/providerReleaseId/providerReleaseGroupId/year/country/genres', () => {
    const result = normalizeDiscogsExactRelease(hsv005ExactReleasePayload())
    expect(result?.candidate).toMatchObject({
      provider: 'discogs',
      providerReleaseId: '26770295',
      providerReleaseGroupId: '3058367',
      releaseYear: 2023,
      country: 'Israel',
      derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
      transientCoverDisplayUrl: null,
      score: null,
    })
    expect(result?.genres).toEqual(['hip hop'])
  })

  it('maps the matched Vinyl formats[] entry into a deterministic format summary', () => {
    const result = normalizeDiscogsExactRelease(hsv005ExactReleasePayload())
    expect(result?.candidate.format).toBe('Vinyl, 2×, LP, Album')
  })

  it('omits qty when it is exactly "1"', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'] }],
      }),
    )
    expect(result?.candidate.format).toBe('Vinyl, LP')
  })

  it('a non-Vinyl-only release (e.g. the digital 20370835 fixture) returns null - the authoritative Vinyl gate', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        formats: [{ name: 'File', descriptions: ['AAC', 'Album'] }],
      }),
    )
    expect(result).toBeNull()
  })

  it('falls back to a parsed leading year from released when year is absent', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({ year: undefined, released: '2023-05-01' }),
    )
    expect(result?.candidate.releaseYear).toBe(2023)
  })

  it('stores null for an unparseable/out-of-range year, never a fabricated one', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({ year: 0, released: undefined }),
    )
    expect(result?.candidate.releaseYear).toBeNull()
  })

  it('returns null for a missing/invalid required field (artist, title, id)', () => {
    expect(normalizeDiscogsExactRelease(hsv005ExactReleasePayload({ artists_sort: '' }))).toBeNull()
    expect(normalizeDiscogsExactRelease(hsv005ExactReleasePayload({ title: '' }))).toBeNull()
    expect(normalizeDiscogsExactRelease(hsv005ExactReleasePayload({ id: 'bad' }))).toBeNull()
  })

  it('null master_id becomes providerReleaseGroupId: null (a release genuinely may have none)', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({ master_id: 0 }),
    )
    expect(result?.candidate.providerReleaseGroupId).toBeNull()
  })

  it('returns null for a non-object input', () => {
    expect(normalizeDiscogsExactRelease(null)).toBeNull()
  })

  it('is null when the release has no images array at all', () => {
    const result = normalizeDiscogsExactRelease(hsv005ExactReleasePayload())
    expect(result?.candidate.providerImageUrl).toBeNull()
  })

  it('prefers the entry whose type is exactly "primary" (spec 0018 follow-up §9)', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        images: [
          { type: 'secondary', uri: 'https://i.discogs.com/secondary.jpeg' },
          { type: 'primary', uri: 'https://i.discogs.com/primary.jpeg' },
        ],
      }),
    )
    expect(result?.candidate.providerImageUrl).toBe('https://i.discogs.com/primary.jpeg')
  })

  it('falls back to the first entry with a usable URL when no entry is type "primary"', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        images: [
          { type: 'secondary', uri: 'https://i.discogs.com/first.jpeg' },
          { type: 'secondary', uri: 'https://i.discogs.com/second.jpeg' },
        ],
      }),
    )
    expect(result?.candidate.providerImageUrl).toBe('https://i.discogs.com/first.jpeg')
  })

  it('falls back to resource_url, then uri150, when uri is missing', () => {
    const withResourceUrl = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        images: [{ type: 'primary', resource_url: 'https://i.discogs.com/res.jpeg' }],
      }),
    )
    expect(withResourceUrl?.candidate.providerImageUrl).toBe('https://i.discogs.com/res.jpeg')

    const withThumbOnly = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        images: [{ type: 'primary', uri150: 'https://i.discogs.com/150.jpeg' }],
      }),
    )
    expect(withThumbOnly?.candidate.providerImageUrl).toBe('https://i.discogs.com/150.jpeg')
  })

  it('a malformed entry (no usable URL field, or a non-http(s) value) is ignored, never fabricated', () => {
    const result = normalizeDiscogsExactRelease(
      hsv005ExactReleasePayload({
        images: [
          { type: 'primary', uri: 'javascript:alert(1)' },
          { type: 'secondary' },
        ],
      }),
    )
    expect(result?.candidate.providerImageUrl).toBeNull()
  })

  it('a release with an empty images array has providerImageUrl null - missing artwork is valid', () => {
    const result = normalizeDiscogsExactRelease(hsv005ExactReleasePayload({ images: [] }))
    expect(result?.candidate.providerImageUrl).toBeNull()
  })
})

describe('normalizeDiscogsGenreList (flat string[] shape, distinct from MusicBrainz)', () => {
  it('cleans, lowercases, dedupes, and bounds each entry', () => {
    expect(normalizeDiscogsGenreList(['Hip Hop', 'hip hop', '  Rock  '])).toEqual([
      'hip hop',
      'rock',
    ])
  })

  it('returns an empty list for a non-array payload', () => {
    expect(normalizeDiscogsGenreList(undefined)).toEqual([])
    expect(normalizeDiscogsGenreList({ genres: ['rock'] })).toEqual([])
  })
})

describe('searchDiscogsReleases', () => {
  function fakeFetch(payload: unknown, status = 200): FetchFunction {
    return vi.fn(async () => jsonResponse(payload, status))
  }

  it('sends the query, type=release, and per_page, authenticated via the Discogs header', async () => {
    const fetchImpl = fakeFetch({ results: [] })
    await searchDiscogsReleases({
      fetchImpl,
      query: 'כהן מה שאפשר עם מה שנשאר',
      token,
      userAgent,
    })

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit]
    expect(url.searchParams.get('q')).toBe('כהן מה שאפשר עם מה שנשאר')
    expect(url.searchParams.get('type')).toBe('release')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Discogs token=${token}`,
    )
  })

  it('drops non-Vinyl results before the UI ever sees them', async () => {
    const fetchImpl = fakeFetch({
      results: [
        searchResultPayload(),
        searchResultPayload({ id: 20370835, format: ['File', 'AAC', 'Album'] }),
      ],
    })

    const response = await searchDiscogsReleases({ fetchImpl, query: 'x', token, userAgent })
    expect(response.results).toHaveLength(1)
    expect(response.results[0]?.providerReleaseId).toBe('26770295')
  })

  it('bounds results to at most 5', async () => {
    const many = Array.from({ length: 12 }, (_v, i) =>
      searchResultPayload({ id: 26770295 + i }),
    )
    const fetchImpl = fakeFetch({ results: many })

    const response = await searchDiscogsReleases({ fetchImpl, query: 'x', token, userAgent })
    expect(response.results).toHaveLength(5)
  })

  it('throws provider_bad_response for a malformed payload', async () => {
    const fetchImpl = fakeFetch({ notResults: [] })

    await expect(
      searchDiscogsReleases({ fetchImpl, query: 'x', token, userAgent }),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
  })
})

describe('lookupDiscogsRelease', () => {
  function fakeFetch(payload: unknown, status = 200): FetchFunction {
    return vi.fn(async () => jsonResponse(payload, status))
  }

  it('returns the candidate + genres pairing on success', async () => {
    const fetchImpl = fakeFetch(hsv005ExactReleasePayload())
    const result = await lookupDiscogsRelease({
      fetchImpl,
      providerReleaseId: '26770295',
      token,
      userAgent,
    })
    expect(result.candidate.provider).toBe('discogs')
    expect(result.genres).toEqual(['hip hop'])
  })

  it('sends the Discogs auth header and no query params', async () => {
    const fetchImpl = fakeFetch(hsv005ExactReleasePayload())
    await lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent })
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe('https://api.discogs.com/releases/26770295')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Discogs token=${token}`,
    )
  })

  it('throws not_found for a non-Vinyl release (the authoritative gate)', async () => {
    const fetchImpl = fakeFetch(
      hsv005ExactReleasePayload({ formats: [{ name: 'File' }] }),
    )
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws not_found for a malformed response', async () => {
    const fetchImpl = fakeFetch({ id: 'nope' })
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('maps a 429 response to provider_rate_limited', async () => {
    const fetchImpl = fakeFetch({}, 429)
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'provider_rate_limited' })
  })

  it('maps a 503 response to provider_rate_limited', async () => {
    const fetchImpl = fakeFetch({}, 503)
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'provider_rate_limited' })
  })

  it('maps a 404 response to not_found', async () => {
    const fetchImpl = fakeFetch({}, 404)
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('maps any other non-ok response to provider_unavailable', async () => {
    const fetchImpl = fakeFetch({}, 500)
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  it('maps an aborted/timed-out request to provider_timeout', async () => {
    const fetchImpl: FetchFunction = vi.fn(async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    })
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'provider_timeout' })
  })

  it('maps an unexpected thrown error to provider_unavailable', async () => {
    const fetchImpl: FetchFunction = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(
      lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  it('never leaks the token into a thrown error message', async () => {
    const fetchImpl = fakeFetch({}, 500)
    try {
      await lookupDiscogsRelease({ fetchImpl, providerReleaseId: '26770295', token, userAgent })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DiscogsError)
      expect((error as Error).message).not.toContain(token)
    }
  })
})
