import { describe, expect, it, vi } from 'vitest'
import {
  buildMusicBrainzLookupUrl,
  buildMusicBrainzQuery,
  buildMusicBrainzReleaseGroupGenresUrl,
  buildMusicBrainzSearchUrl,
  escape,
  literalize,
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

function fakeReleaseId(char: string): string {
  return `${char.repeat(8)}-${char.repeat(4)}-4${char.repeat(3)}-8${char.repeat(3)}-${char.repeat(12)}`
}

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

/** A syntactically valid search payload: `count`/`offset` match the given
 * releases by default, overridable per test for the malformed-metadata
 * cases below. */
function searchPayload(
  releases: unknown[],
  overrides: Record<string, unknown> = {},
) {
  return { count: releases.length, offset: 0, releases, ...overrides }
}

describe('MusicBrainz adapter', () => {
  it('builds bounded official MusicBrainz URLs with JSON format', () => {
    const searchUrl = buildMusicBrainzSearchUrl('pink floyd dark side', 5, 10)
    const lookupUrl = buildMusicBrainzLookupUrl(releaseId)

    expect(searchUrl.origin).toBe('https://musicbrainz.org')
    expect(searchUrl.pathname).toBe('/ws/2/release')
    expect(searchUrl.searchParams.get('query')).toBe('pink floyd dark side')
    expect(searchUrl.searchParams.get('fmt')).toBe('json')
    expect(searchUrl.searchParams.get('limit')).toBe('5')
    expect(searchUrl.searchParams.get('offset')).toBe('10')
    expect(lookupUrl.pathname).toBe(`/ws/2/release/${releaseId}`)
    expect(lookupUrl.searchParams.get('inc')).toContain('artist-credits')
  })

  it('sends the configured User-Agent and normalizes release search results', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(searchPayload([releasePayload()])),
    ) satisfies FetchFunction

    const page = await searchMusicBrainzReleases({
      fetchImpl,
      limit: 5,
      mode: 'all',
      offset: 0,
      query: 'pink floyd',
      userAgent,
    })

    expect(page.candidates).toEqual([
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
        providerImageUrl: null,
      },
    ])
    expect(page.rawCount).toBe(1)
    expect(page.providerCount).toBe(1)
    expect(page.providerOffset).toBe(0)

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
    const releases = [
      releasePayload({ id: 'not-a-mbid' }),
      releasePayload({ title: '' }),
      releasePayload({ 'artist-credit': [] }),
    ]
    const fetchImpl = vi.fn(async () =>
      jsonResponse(searchPayload(releases)),
    ) satisfies FetchFunction

    const page = await searchMusicBrainzReleases({
      fetchImpl,
      limit: 5,
      mode: 'all',
      offset: 0,
      query: 'bad data',
      userAgent,
    })

    expect(page.candidates).toEqual([])
  })

  it('rejects malformed provider search responses (releases missing/not an array)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ unexpected: [] }),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        mode: 'all',
        offset: 0,
        query: 'pink floyd',
        userAgent,
      }),
    ).rejects.toMatchObject({
      code: 'provider_bad_response',
    })
  })

  it('maps no results to an empty normalized candidate list', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(searchPayload([])),
    ) satisfies FetchFunction

    const page = await searchMusicBrainzReleases({
      fetchImpl,
      limit: 5,
      mode: 'all',
      offset: 0,
      query: 'definitely missing',
      userAgent,
    })

    expect(page.candidates).toEqual([])
  })

  it('maps MusicBrainz 503 responses to rate-limit/unavailable errors', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'slow down' }, 503),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        mode: 'all',
        offset: 0,
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
        mode: 'all',
        offset: 0,
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
        mode: 'all',
        offset: 0,
        query: 'pink floyd',
        timeoutMs: 1,
        userAgent,
      }),
    ).rejects.toBeInstanceOf(MusicBrainzError)
    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        mode: 'all',
        offset: 0,
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

describe('literalize (Boolean-keyword literalization, spec 0017 §6.2)', () => {
  it('lowercases a standalone AND/OR/NOT', () => {
    expect(literalize('AND')).toBe('and')
    expect(literalize('OR')).toBe('or')
    expect(literalize('NOT')).toBe('not')
  })

  it('lowercases a standalone keyword between other words, leaving them untouched', () => {
    expect(literalize('LOVE AND WAR')).toBe('LOVE and WAR')
    expect(literalize('ROCK OR ROLL')).toBe('ROCK or ROLL')
  })

  it('treats punctuation-adjacent keywords as standalone', () => {
    expect(literalize('(AND)')).toBe('(and)')
    expect(literalize('AND/OR')).toBe('and/or')
  })

  it('lowercases a keyword separated from Hebrew text by ordinary spaces, leaving the Hebrew untouched', () => {
    expect(literalize('שלום AND עולם')).toBe('שלום and עולם')
  })

  it('is idempotent on an already-lowercase and/or/not', () => {
    expect(literalize('and')).toBe('and')
    expect(literalize('love and war')).toBe('love and war')
  })

  it('does not match a substring of a longer ALL-CAPS word', () => {
    expect(literalize('NOTHING BUT THIEVES')).toBe('NOTHING BUT THIEVES')
    expect(literalize('CANDY')).toBe('CANDY')
  })

  it('does not match a keyword embedded directly in non-Latin text with no separating whitespace', () => {
    expect(literalize('שלוםANDעולם')).toBe('שלוםANDעולם')
  })

  it('does not match a keyword embedded directly in accented-Latin text', () => {
    expect(literalize('éANDé')).toBe('éANDé')
  })
})

describe('escape (Lucene special-character escaping, spec 0017 §5.1)', () => {
  it('backslash-escapes every documented Lucene special character', () => {
    const specials = ['+', '-', '&', '|', '!', '(', ')', '{', '}', '[', ']', '^', '"', '~', '*', '?', ':', '\\', '/']
    for (const char of specials) {
      expect(escape(char)).toBe(`\\${char}`)
    }
  })

  it('escapes the documented literal "/" case (ac/dc)', () => {
    expect(escape('ac/dc')).toBe('ac\\/dc')
  })

  it('escapes a quote character', () => {
    expect(escape('"quoted"')).toBe('\\"quoted\\"')
  })

  it('leaves ordinary letters, digits, and whitespace untouched', () => {
    expect(escape('Portishead Dummy 1994')).toBe('Portishead Dummy 1994')
  })
})

describe('buildMusicBrainzQuery (mode -> template, spec 0017 §6.2)', () => {
  it('builds the All-mode two-field OR template', () => {
    expect(buildMusicBrainzQuery('all', 'Portishead')).toBe(
      'artist:(Portishead) OR release:(Portishead)',
    )
  })

  it('builds the Artist-mode template', () => {
    expect(buildMusicBrainzQuery('artist', 'Portishead')).toBe('artist:(Portishead)')
  })

  it('builds the Album-mode template', () => {
    expect(buildMusicBrainzQuery('album', 'Dummy')).toBe('release:(Dummy)')
  })

  it('escapes special characters within the field-scoped term', () => {
    expect(buildMusicBrainzQuery('album', 'Kind of Blue?')).toBe(
      'release:(Kind of Blue\\?)',
    )
  })

  it('literalizes a standalone AND/OR/NOT before escaping', () => {
    expect(buildMusicBrainzQuery('artist', 'LOVE AND WAR')).toBe(
      'artist:(LOVE and WAR)',
    )
  })

  it('preserves internal whitespace runs exactly, not collapsed', () => {
    expect(buildMusicBrainzQuery('album', 'a   b')).toBe('release:(a   b)')
  })

  it('passes Hebrew/non-Latin text through unescaped-by-script, un-transliterated', () => {
    expect(buildMusicBrainzQuery('all', 'שלום')).toBe(
      'artist:(שלום) OR release:(שלום)',
    )
  })

  it('the trusted All-mode OR is the only OR, uppercase and unescaped, even when the term itself literalizes to "or"', () => {
    const built = buildMusicBrainzQuery('all', 'ROCK OR ROLL')

    expect(built).toBe('artist:(ROCK or ROLL) OR release:(ROCK or ROLL)')
    expect(built.match(/\bOR\b/g)).toHaveLength(1)
  })
})

describe('searchMusicBrainzReleases - malformed provider pagination metadata (spec 0017 §8.4)', () => {
  async function expectBadResponse(overrides: Record<string, unknown>) {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(searchPayload([releasePayload()], overrides)),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        mode: 'all',
        offset: 0,
        query: 'pink floyd',
        userAgent,
      }),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
  }

  it('rejects a missing count', () => expectBadResponse({ count: undefined }))
  it('rejects a string count', () => expectBadResponse({ count: '1' }))
  it('rejects a negative count', () => expectBadResponse({ count: -1 }))
  it('rejects a fractional count', () => expectBadResponse({ count: 1.5 }))
  it('rejects a missing offset', () => expectBadResponse({ offset: undefined }))
  it('rejects a string offset', () => expectBadResponse({ offset: '0' }))
  it('rejects a negative offset', () => expectBadResponse({ offset: -1 }))
  it('rejects a fractional offset', () => expectBadResponse({ offset: 0.5 }))
  it(
    'rejects a provider offset that does not match the requested offset',
    () => expectBadResponse({ offset: 5 }),
  )

  it('rejects rawCount greater than the effective requested limit', async () => {
    const sixReleases = ['a', 'b', 'c', 'd', 'e', 'f'].map((char) =>
      releasePayload({ id: fakeReleaseId(char) }),
    )
    const fetchImpl = vi.fn(async () =>
      jsonResponse(searchPayload(sixReleases, { count: 6 })),
    ) satisfies FetchFunction

    await expect(
      searchMusicBrainzReleases({
        fetchImpl,
        limit: 5,
        mode: 'all',
        offset: 0,
        query: 'pink floyd',
        userAgent,
      }),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
  })

  it(
    'rejects rawCount > 0 with providerCount less than offset + rawCount',
    () => expectBadResponse({ count: 0 }),
  )

  it('never derives providerCount from candidates.length/rawCount as a fallback', async () => {
    // A completely full raw page (5) where normalization rejects one entry
    // (a malformed MBID): the true rawCount (5) must still be what the
    // handler sees, not candidates.length (4) - this is the exact
    // regression case the corrected hasMore formula depends on.
    const releases = [
      releasePayload({ id: fakeReleaseId('a') }),
      releasePayload({ id: 'not-a-mbid' }),
      releasePayload({ id: fakeReleaseId('b') }),
      releasePayload({ id: fakeReleaseId('c') }),
      releasePayload({ id: fakeReleaseId('d') }),
    ]
    const fetchImpl = vi.fn(async () =>
      jsonResponse(searchPayload(releases, { count: 100 })),
    ) satisfies FetchFunction

    const page = await searchMusicBrainzReleases({
      fetchImpl,
      limit: 5,
      mode: 'all',
      offset: 0,
      query: 'pink floyd',
      userAgent,
    })

    expect(page.rawCount).toBe(5)
    expect(page.candidates).toHaveLength(4)
    expect(page.providerCount).toBe(100)
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
