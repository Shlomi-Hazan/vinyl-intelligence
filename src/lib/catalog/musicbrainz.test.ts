import { describe, expect, it, vi } from 'vitest'
import {
  buildMusicBrainzLookupUrl,
  buildMusicBrainzReleaseGroupGenresUrl,
  buildMusicBrainzSearchUrl,
  lookupMusicBrainzRelease,
  lookupMusicBrainzReleaseGroupGenres,
  MusicBrainzError,
  normalizeMusicBrainzGenres,
  normalizeMusicBrainzRelease,
  searchMusicBrainzReleases,
  type FetchFunction,
} from './musicbrainz.ts'

const releaseId = '11111111-1111-4111-8111-111111111111'
const releaseGroupId = '22222222-2222-4222-8222-222222222222'
const userAgent = 'VinylIntelligence/0.0.0 (test@example.com)'

function releasePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: releaseId,
    score: 98,
    title: 'The Dark Side of the Moon',
    date: '1973-03-24',
    country: 'GB',
    'artist-credit': [
      {
        name: 'Pink Floyd',
        joinphrase: '',
      },
    ],
    'release-group': {
      id: releaseGroupId,
    },
    'label-info': [
      {
        'catalog-number': 'SHVL 804',
        label: {
          name: 'Harvest',
        },
      },
    ],
    media: [
      {
        format: '12" Vinyl',
      },
    ],
    ...overrides,
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status })
}

describe('MusicBrainz adapter', () => {
  it('builds bounded official MusicBrainz URLs with JSON format', () => {
    const searchUrl = buildMusicBrainzSearchUrl('pink floyd dark side', 5)
    const lookupUrl = buildMusicBrainzLookupUrl(releaseId)

    expect(searchUrl.origin).toBe('https://musicbrainz.org')
    expect(searchUrl.pathname).toBe('/ws/2/release')
    expect(searchUrl.searchParams.get('query')).toBe('pink floyd dark side')
    expect(searchUrl.searchParams.get('fmt')).toBe('json')
    expect(searchUrl.searchParams.get('limit')).toBe('5')
    expect(lookupUrl.pathname).toBe(`/ws/2/release/${releaseId}`)
    expect(lookupUrl.searchParams.get('inc')).toContain('artist-credits')
  })

  it('sends the configured User-Agent and normalizes release search results', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ releases: [releasePayload()] }),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'pink floyd',
        userAgent,
      }),
    ).resolves.toEqual([
      {
        artist: 'Pink Floyd',
        catalogNumber: 'SHVL 804',
        country: 'GB',
        derivedProviderPageUrl: `https://musicbrainz.org/release/${releaseId}`,
        format: '12" Vinyl',
        label: 'Harvest',
        provider: 'musicbrainz',
        providerReleaseGroupId: releaseGroupId,
        providerReleaseId: releaseId,
        releaseYear: 1973,
        score: 98,
        title: 'The Dark Side of the Moon',
        transientCoverDisplayUrl: null,
      },
    ])

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          'User-Agent': userAgent,
        }),
      }),
    )
  })

  it('normalizes missing optional metadata to null without fabricating facts', () => {
    expect(
      normalizeMusicBrainzRelease(
        releasePayload({
          country: undefined,
          date: '',
          'label-info': [],
          media: [],
          score: undefined,
        }),
      ),
    ).toMatchObject({
      catalogNumber: null,
      country: null,
      format: null,
      label: null,
      releaseYear: null,
      score: null,
    })
  })

  it('excludes malformed releases that lack safe required identifiers or facts', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        releases: [
          releasePayload({ id: 'not-a-mbid' }),
          releasePayload({ title: '' }),
          releasePayload({ 'artist-credit': [] }),
        ],
      }),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'bad data',
        userAgent,
      }),
    ).resolves.toEqual([])
  })

  it('rejects malformed provider search responses', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ unexpected: [] }),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'pink floyd',
        userAgent,
      }),
    ).rejects.toMatchObject({
      code: 'provider_bad_response',
    })
  })

  it('maps no results to an empty normalized candidate list', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ releases: [] }),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'definitely missing',
        userAgent,
      }),
    ).resolves.toEqual([])
  })

  it('maps MusicBrainz 503 responses to rate-limit/unavailable errors', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'slow down' }, 503),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'pink floyd',
        userAgent,
      }),
    ).rejects.toMatchObject({
      code: 'provider_rate_limited',
      status: 503,
    })
  })

  it('maps MusicBrainz 429 responses to the same rate-limit error as 503', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'too many requests' }, 429),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'pink floyd',
        userAgent,
      }),
    ).rejects.toMatchObject({
      code: 'provider_rate_limited',
      status: 429,
    })
  })

  it('maps a 429 release lookup to a rate-limit error', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'too many requests' }, 429),
    ) satisfies FetchFunction

    await expect(
      lookupMusicBrainzRelease({
        fetchImpl,
        providerReleaseId: releaseId,
        userAgent,
      }),
    ).rejects.toMatchObject({
      code: 'provider_rate_limited',
      status: 429,
    })
  })

  it('maps aborted provider requests to timeout errors', async () => {
    const fetchImpl = vi.fn((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      }),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'pink floyd',
        timeoutMs: 1,
        userAgent,
      }),
    ).rejects.toBeInstanceOf(MusicBrainzError)
    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        query: 'pink floyd',
        timeoutMs: 1,
        userAgent,
      }),
    ).rejects.toMatchObject({
      code: 'provider_timeout',
    })
  })

  it('re-fetches and normalizes a selected release by MBID', async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      void input
      void init

      return jsonResponse(releasePayload({ score: undefined }))
    }) satisfies FetchFunction

    await expect(
      lookupMusicBrainzRelease({
        fetchImpl,
        providerReleaseId: releaseId,
        userAgent,
      }),
    ).resolves.toMatchObject({
      providerReleaseId: releaseId,
      score: null,
      title: 'The Dark Side of the Moon',
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(String(fetchImpl.mock.calls.at(0)?.[0])).toContain(
      `/release/${releaseId}`,
    )
  })
})

describe('MusicBrainz release-group genre enrichment', () => {
  it('builds a bounded release-group genres URL', () => {
    const url = buildMusicBrainzReleaseGroupGenresUrl(releaseGroupId)

    expect(url.origin).toBe('https://musicbrainz.org')
    expect(url.pathname).toBe(`/ws/2/release-group/${releaseGroupId}`)
    expect(url.searchParams.get('fmt')).toBe('json')
    expect(url.searchParams.get('inc')).toBe('genres')
  })

  it('normalizes genre names: positive count, lowercase, trimmed, deduped, capped', () => {
    const genres = normalizeMusicBrainzGenres({
      genres: [
        { name: '  Jazz  ', count: 5 },
        { name: 'JAZZ', count: 2 },
        { name: 'Hard Bop', count: 1 },
        { name: 'not voted', count: 0 },
        { name: 'no count field' },
        { name: 42 },
        { name: 'x'.repeat(41), count: 3 },
      ],
    })

    expect(genres).toEqual(['jazz', 'hard bop', 'no count field'])
  })

  it('caps the genre list at 12', () => {
    const genres = normalizeMusicBrainzGenres({
      genres: Array.from({ length: 20 }, (_unused, index) => ({
        name: `genre-${index}`,
        count: 1,
      })),
    })

    expect(genres).toHaveLength(12)
  })

  it('returns an empty list for a malformed body', () => {
    expect(normalizeMusicBrainzGenres({})).toEqual([])
    expect(normalizeMusicBrainzGenres({ genres: 'nope' })).toEqual([])
    expect(normalizeMusicBrainzGenres(null)).toEqual([])
  })

  it('fetches and returns cleaned genres for a release-group', async () => {
    const fetchImpl = vi.fn(
      async (input: string | URL, init?: RequestInit) => {
        void input
        void init
        return jsonResponse({
          genres: [
            { name: 'Ambient', count: 4 },
            { name: 'Electronic', count: 2 },
          ],
        })
      },
    ) satisfies FetchFunction

    await expect(
      lookupMusicBrainzReleaseGroupGenres({ fetchImpl, releaseGroupId, userAgent }),
    ).resolves.toEqual(['ambient', 'electronic'])

    expect(String(fetchImpl.mock.calls.at(0)?.[0])).toContain(
      `/release-group/${releaseGroupId}`,
    )
  })

  it('is best effort: returns [] on 404 / 503 / timeout / malformed / missing id, never throws', async () => {
    const notFound = vi.fn(async () => jsonResponse({}, 404)) satisfies FetchFunction
    await expect(
      lookupMusicBrainzReleaseGroupGenres({ fetchImpl: notFound, releaseGroupId, userAgent }),
    ).resolves.toEqual([])

    const rateLimited = vi.fn(async () => jsonResponse({}, 503)) satisfies FetchFunction
    await expect(
      lookupMusicBrainzReleaseGroupGenres({ fetchImpl: rateLimited, releaseGroupId, userAgent }),
    ).resolves.toEqual([])

    const aborted = vi.fn(async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }) satisfies FetchFunction
    await expect(
      lookupMusicBrainzReleaseGroupGenres({ fetchImpl: aborted, releaseGroupId, userAgent }),
    ).resolves.toEqual([])

    const brokenJson = vi.fn(async () => new Response('not json', { status: 200 })) satisfies FetchFunction
    await expect(
      lookupMusicBrainzReleaseGroupGenres({ fetchImpl: brokenJson, releaseGroupId, userAgent }),
    ).resolves.toEqual([])

    const neverCalled = vi.fn(
      async (input: string | URL, init?: RequestInit) => {
        void input
        void init
        return jsonResponse({})
      },
    ) satisfies FetchFunction
    await expect(
      lookupMusicBrainzReleaseGroupGenres({ fetchImpl: neverCalled, releaseGroupId: '', userAgent }),
    ).resolves.toEqual([])
    expect(neverCalled).not.toHaveBeenCalled()
  })
})
