// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import addHandler, { config as addConfig } from '../functions/catalog-add.mts'
import searchHandler, { config as searchConfig } from '../functions/catalog-search.mts'
import {
  computeHasMore,
  handleCatalogAdd,
  handleCatalogSearch,
} from '../functions/_shared/catalog-handlers.mts'
import { MusicBrainzError } from '../../src/lib/catalog/musicbrainz.ts'
import { DiscogsError } from '../../src/lib/catalog/discogs.ts'
import type { CatalogCandidate } from '../../src/lib/catalog/types.ts'

const env = {
  DISCOGS_TOKEN: 'discogs-test-token',
  DISCOGS_USER_AGENT: 'VinylIntelligence/0.0.0 (test@example.com)',
  MUSICBRAINZ_USER_AGENT: 'VinylIntelligence/0.0.0 (test@example.com)',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
}
const providerReleaseId = '11111111-1111-4111-8111-111111111111'
const providerReleaseGroupId = '22222222-2222-4222-8222-222222222222'
const verifiedUserId = '00000000-0000-4000-8000-0000000000a1'
const discogsReleaseId = '26770295'
const discogsMasterId = '3058367'

function catalogCandidate(): CatalogCandidate {
  return {
    artist: 'Pink Floyd',
    catalogNumber: 'SHVL 804',
    country: 'GB',
    derivedProviderPageUrl: `https://musicbrainz.org/release/${providerReleaseId}`,
    format: 'LP',
    label: 'Harvest',
    provider: 'musicbrainz',
    providerReleaseGroupId,
    providerReleaseId,
    releaseYear: 1973,
    score: 100,
    title: 'The Dark Side of the Moon',
    transientCoverDisplayUrl: null,
  }
}

function discogsCandidate(): CatalogCandidate {
  return {
    artist: 'כהן',
    catalogNumber: 'HSV005',
    country: 'Israel',
    derivedProviderPageUrl: `https://www.discogs.com/release/${discogsReleaseId}`,
    format: 'Vinyl, 2×, LP, Album',
    label: 'Hasivuv',
    provider: 'discogs',
    providerReleaseGroupId: discogsMasterId,
    providerReleaseId: discogsReleaseId,
    releaseYear: 2023,
    score: null,
    title: 'מה שאפשר עם מה שנשאר',
    transientCoverDisplayUrl: null,
  }
}

function authedRequest(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: 'Bearer valid-token',
    },
  })
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

function createDependencies(options: {
  authError?: Error
  collectionInsertError?: Error
  releaseUpsertError?: Error
  searchError?: Error
  discogsSearchError?: Error
  discogsLookupError?: Error
} = {}) {
  const searchReleases = vi.fn(async () => ({
    candidates: [catalogCandidate()],
    providerCount: 1,
    providerOffset: 0,
    rawCount: 1,
  }))
  const lookupRelease = vi.fn(async () => catalogCandidate())
  const lookupReleaseGroupGenres = vi.fn(async (): Promise<string[]> => [])
  const paceProviderRequest = vi.fn(async () => undefined)
  const delay = vi.fn(async () => undefined)
  const searchDiscogsReleases = vi.fn(async () => ({
    results: [
      {
        catalogNumber: 'HSV005',
        country: 'Israel',
        derivedProviderPageUrl: `https://www.discogs.com/release/${discogsReleaseId}`,
        displayTitle: 'כהן - מה שאפשר עם מה שנשאר',
        formatSummary: 'Vinyl, LP, Album',
        label: 'Hasivuv',
        provider: 'discogs' as const,
        providerReleaseGroupId: discogsMasterId,
        providerReleaseId: discogsReleaseId,
        releaseYear: 2023,
      },
    ],
  }))
  const lookupDiscogsRelease = vi.fn(async () => ({
    candidate: discogsCandidate(),
    genres: ['hip hop'],
  }))
  const paceDiscogsRequest = vi.fn(async () => undefined)

  if (options.discogsSearchError) {
    searchDiscogsReleases.mockRejectedValue(options.discogsSearchError)
  }

  if (options.discogsLookupError) {
    lookupDiscogsRelease.mockRejectedValue(options.discogsLookupError)
  }
  const authClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: options.authError ? null : { id: verifiedUserId },
        },
        error: options.authError ?? null,
      })),
    },
  }
  const releaseQuery = {
    select: vi.fn(() => releaseQuery),
    single: vi.fn(async () => ({
      data: options.releaseUpsertError ? null : { id: 'release-1' },
      error: options.releaseUpsertError ?? null,
    })),
    upsert: vi.fn((payload: Record<string, unknown>, options?: unknown) => {
      void payload
      void options
      return releaseQuery
    }),
  }
  const itemQuery = {
    insert: vi.fn(() => itemQuery),
    select: vi.fn(() => itemQuery),
    single: vi.fn(async () => ({
      data: options.collectionInsertError
        ? null
        : {
            id: 'item-1',
            added_at: '2026-08-26T10:00:00.000Z',
            created_at: '2026-08-26T10:00:00.000Z',
            release: {
              id: 'release-1',
              artist: 'Pink Floyd',
              title: 'The Dark Side of the Moon',
              release_year: 1973,
              label: 'Harvest',
              catalog_number: 'SHVL 804',
              country: 'GB',
              format: 'LP',
              updated_at: '2026-08-26T10:00:00.000Z',
            },
          },
      error: options.collectionInsertError ?? null,
    })),
  }
  const serviceClient = {
    from: vi.fn((table: string) => {
      if (table === 'releases') {
        return releaseQuery
      }

      if (table === 'collection_items') {
        return itemQuery
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
  const createClient = vi.fn((_url: string, key: string) =>
    key === 'service-key' ? serviceClient : authClient,
  )

  if (options.searchError) {
    searchReleases.mockRejectedValue(options.searchError)
  }

  const dependencies = {
    createClient,
    delay,
    lookupDiscogsRelease,
    lookupRelease,
    lookupReleaseGroupGenres,
    paceDiscogsRequest,
    paceProviderRequest,
    searchDiscogsReleases,
    searchReleases,
  } as unknown as NonNullable<Parameters<typeof handleCatalogSearch>[2]>

  return {
    authClient,
    createClient,
    delay,
    dependencies,
    itemQuery,
    lookupDiscogsRelease,
    lookupRelease,
    lookupReleaseGroupGenres,
    paceDiscogsRequest,
    paceProviderRequest,
    releaseQuery,
    searchDiscogsReleases,
    searchReleases,
    serviceClient,
  }
}

describe('catalog Netlify functions', () => {
  it('uses the approved public function routes', () => {
    expect(searchConfig).toEqual({
      method: ['GET'],
      path: '/api/catalog/search',
    })
    expect(addConfig).toEqual({
      method: ['POST'],
      path: '/api/catalog/add',
    })
    expect(searchHandler).toEqual(expect.any(Function))
    expect(addHandler).toEqual(expect.any(Function))
  })

  it('rejects search without a bearer token before provider calls', async () => {
    const { dependencies, searchReleases } = createDependencies()

    const response = await handleCatalogSearch(
      new Request('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(response.status).toBe(401)
    await expect(readJson(response)).resolves.toMatchObject({
      code: 'unauthorized',
    })
    expect(searchReleases).not.toHaveBeenCalled()
  })

  it('rejects invalid auth tokens without provider calls', async () => {
    const { dependencies, searchReleases } = createDependencies({
      authError: new Error('expired token'),
    })

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(response.status).toBe(401)
    await expect(readJson(response)).resolves.toMatchObject({
      code: 'unauthorized',
    })
    expect(searchReleases).not.toHaveBeenCalled()
  })

  it('validates search query and bounds result limit', async () => {
    const { dependencies, searchReleases } = createDependencies()

    const invalidResponse = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=a'),
      env,
      dependencies,
    )

    expect(invalidResponse.status).toBe(400)
    expect(searchReleases).not.toHaveBeenCalled()

    await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink&limit=200'),
      env,
      dependencies,
    )

    expect(searchReleases).toHaveBeenCalledWith({
      limit: 10,
      mode: 'all',
      offset: 0,
      query: 'pink',
      userAgent: env.MUSICBRAINZ_USER_AGENT,
    })
  })

  it('returns normalized search candidates and uses per-instance pacing', async () => {
    const { dependencies, paceProviderRequest } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      candidates: [
        {
          provider: 'musicbrainz',
          providerReleaseId,
          title: 'The Dark Side of the Moon',
        },
      ],
      hasMore: false,
      offset: 0,
    })
    expect(paceProviderRequest).toHaveBeenCalledOnce()
  })

  it('sanitizes provider failures without returning raw provider payloads', async () => {
    const { dependencies } = createDependencies({
      searchError: new MusicBrainzError(
        'provider_rate_limited',
        'MusicBrainz is rate limiting or temporarily unavailable.',
        503,
      ),
    })

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(response.status).toBe(503)
    await expect(readJson(response)).resolves.toEqual({
      code: 'provider_rate_limited',
      message: 'MusicBrainz is rate limiting or temporarily unavailable.',
    })
  })

  it('rejects catalog add without auth', async () => {
    const { dependencies, lookupRelease } = createDependencies()
    const response = await handleCatalogAdd(
      new Request('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(401)
    expect(lookupRelease).not.toHaveBeenCalled()
  })

  it('accepts only provider identity for catalog add', async () => {
    const { dependencies, lookupRelease } = createDependencies()
    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          artist: 'Browser supplied artist',
          provider: 'musicbrainz',
          providerReleaseId,
          user_id: '00000000-0000-4000-8000-0000000000b2',
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({
      code: 'invalid_query',
    })
    expect(lookupRelease).not.toHaveBeenCalled()
  })

  it('re-fetches selected provider release and persists ownership for the verified user', async () => {
    const { dependencies, itemQuery, lookupRelease, releaseQuery } =
      createDependencies()

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupRelease).toHaveBeenCalledWith({
      providerReleaseId,
      userAgent: env.MUSICBRAINZ_USER_AGENT,
    })
    expect(releaseQuery.upsert).toHaveBeenCalledWith(
      {
        artist: 'Pink Floyd',
        catalog_number: 'SHVL 804',
        country: 'GB',
        created_by: null,
        format: 'LP',
        label: 'Harvest',
        provider: 'musicbrainz',
        provider_fetched_at: null,
        provider_release_group_id: providerReleaseGroupId,
        provider_release_id: providerReleaseId,
        release_year: 1973,
        source: 'catalog',
        title: 'The Dark Side of the Moon',
      },
      { onConflict: 'provider,provider_release_id' },
    )
    expect(itemQuery.insert).toHaveBeenCalledWith({
      release_id: 'release-1',
      user_id: verifiedUserId,
    })
    await expect(readJson(response)).resolves.toMatchObject({
      item: {
        id: 'item-1',
        release: {
          title: 'The Dark Side of the Moon',
        },
      },
    })
  })

  it('returns recoverable database errors when collection item creation fails', async () => {
    const { dependencies, releaseQuery } = createDependencies({
      collectionInsertError: new Error('insert denied'),
    })

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(500)
    await expect(readJson(response)).resolves.toEqual({
      code: 'database_error',
      message: 'Catalog record could not be added to your collection.',
    })
    expect(releaseQuery.upsert).toHaveBeenCalledOnce()
  })

  it('retries the add lookup once after a provider rate-limit, then persists', async () => {
    const {
      dependencies,
      delay,
      lookupRelease,
      lookupReleaseGroupGenres,
      paceProviderRequest,
      releaseQuery,
    } = createDependencies()

    lookupRelease.mockReset()
    lookupRelease
      .mockRejectedValueOnce(
        new MusicBrainzError(
          'provider_rate_limited',
          'MusicBrainz is rate limiting or temporarily unavailable.',
          503,
        ),
      )
      .mockResolvedValueOnce(catalogCandidate())

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupRelease).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledTimes(1)
    expect(delay).toHaveBeenCalledWith(1200)
    expect(releaseQuery.upsert).toHaveBeenCalledOnce()

    // Pace fires 3x: before the initial lookup, before the retry lookup (the
    // retry is a real MusicBrainz request), and before the genre lookup.
    expect(paceProviderRequest).toHaveBeenCalledTimes(3)

    // Order around the retry: delay -> pace -> retry lookup; and the genre
    // lookup still gets its own pace afterwards.
    const [delayOrder] = delay.mock.invocationCallOrder
    const paceOrders = paceProviderRequest.mock.invocationCallOrder
    const lookupOrders = lookupRelease.mock.invocationCallOrder
    const [genreOrder] = lookupReleaseGroupGenres.mock.invocationCallOrder

    expect(delayOrder).toBeGreaterThan(lookupOrders[0])
    expect(paceOrders[1]).toBeGreaterThan(delayOrder)
    expect(lookupOrders[1]).toBeGreaterThan(paceOrders[1])
    expect(paceOrders[2]).toBeGreaterThan(lookupOrders[1])
    expect(genreOrder).toBeGreaterThan(paceOrders[2])
  })

  it('surfaces a recoverable 503 when the add lookup retry is also rate-limited', async () => {
    const { dependencies, delay, lookupRelease, releaseQuery } =
      createDependencies()

    lookupRelease.mockReset()
    lookupRelease.mockRejectedValue(
      new MusicBrainzError(
        'provider_rate_limited',
        'MusicBrainz is rate limiting or temporarily unavailable.',
        503,
      ),
    )

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(503)
    await expect(readJson(response)).resolves.toEqual({
      code: 'provider_rate_limited',
      message: 'MusicBrainz is rate limiting or temporarily unavailable.',
    })
    expect(lookupRelease).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledTimes(1)
    expect(releaseQuery.upsert).not.toHaveBeenCalled()
  })

  it('does not retry non-rate-limit provider errors on add', async () => {
    const { dependencies, delay, lookupRelease } = createDependencies()

    lookupRelease.mockReset()
    lookupRelease.mockRejectedValue(
      new MusicBrainzError(
        'not_found',
        'MusicBrainz release was not found.',
        404,
      ),
    )

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(404)
    expect(lookupRelease).toHaveBeenCalledTimes(1)
    expect(delay).not.toHaveBeenCalled()
  })

  it('does not retry database failures after a successful add lookup', async () => {
    const { dependencies, delay, lookupRelease } = createDependencies({
      releaseUpsertError: new Error('permission denied'),
    })

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(500)
    await expect(readJson(response)).resolves.toMatchObject({
      code: 'database_error',
    })
    expect(lookupRelease).toHaveBeenCalledTimes(1)
    expect(delay).not.toHaveBeenCalled()
  })

  it('does not retry or look up when add auth fails', async () => {
    const { dependencies, delay, lookupRelease } = createDependencies({
      authError: new Error('expired token'),
    })

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(401)
    expect(lookupRelease).not.toHaveBeenCalled()
    expect(delay).not.toHaveBeenCalled()
  })

  it('does not automatically retry a rate-limited search', async () => {
    const { dependencies, delay, searchReleases } = createDependencies({
      searchError: new MusicBrainzError(
        'provider_rate_limited',
        'MusicBrainz is rate limiting or temporarily unavailable.',
        503,
      ),
    })

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(response.status).toBe(503)
    expect(searchReleases).toHaveBeenCalledTimes(1)
    expect(delay).not.toHaveBeenCalled()
  })

  it('catalog search performs no release-group genre lookup', async () => {
    const { dependencies, lookupReleaseGroupGenres } = createDependencies()

    await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(lookupReleaseGroupGenres).not.toHaveBeenCalled()
  })

  function addRequest() {
    return authedRequest('http://app.test/api/catalog/add', {
      body: JSON.stringify({ provider: 'musicbrainz', providerReleaseId }),
      method: 'POST',
    })
  }

  it('paces the release-group genre lookup and persists the enriched genres', async () => {
    const { dependencies, lookupReleaseGroupGenres, paceProviderRequest, releaseQuery } =
      createDependencies()
    lookupReleaseGroupGenres.mockResolvedValue(['progressive rock', 'psychedelic rock'])

    const response = await handleCatalogAdd(addRequest(), env, dependencies)

    expect(response.status).toBe(200)
    // one pace before the release lookup, one before the genre lookup.
    expect(paceProviderRequest).toHaveBeenCalledTimes(2)
    expect(lookupReleaseGroupGenres).toHaveBeenCalledWith({
      releaseGroupId: providerReleaseGroupId,
      userAgent: env.MUSICBRAINZ_USER_AGENT,
    })
    expect(releaseQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ genres: ['progressive rock', 'psychedelic rock'] }),
      { onConflict: 'provider,provider_release_id' },
    )
  })

  it('omits genres from the upsert when enrichment returns nothing (no-erase on shared rows)', async () => {
    const { dependencies, lookupReleaseGroupGenres, releaseQuery } = createDependencies()
    lookupReleaseGroupGenres.mockResolvedValue([])

    const response = await handleCatalogAdd(addRequest(), env, dependencies)

    expect(response.status).toBe(200)
    const upsertPayload = releaseQuery.upsert.mock.calls[0]?.[0] ?? {}
    expect(upsertPayload).not.toHaveProperty('genres')
  })

  it('still succeeds when the genre lookup throws (best effort)', async () => {
    const { dependencies, lookupReleaseGroupGenres, releaseQuery } = createDependencies()
    lookupReleaseGroupGenres.mockRejectedValue(new Error('genre lookup exploded'))

    const response = await handleCatalogAdd(addRequest(), env, dependencies)

    expect(response.status).toBe(200)
    const upsertPayload = releaseQuery.upsert.mock.calls[0]?.[0] ?? {}
    expect(upsertPayload).not.toHaveProperty('genres')
  })

  it('skips the genre lookup entirely when the candidate has no release-group id', async () => {
    const { dependencies, lookupRelease, lookupReleaseGroupGenres, paceProviderRequest } =
      createDependencies()
    lookupRelease.mockResolvedValue({
      ...catalogCandidate(),
      providerReleaseGroupId: null,
    })

    const response = await handleCatalogAdd(addRequest(), env, dependencies)

    expect(response.status).toBe(200)
    expect(lookupReleaseGroupGenres).not.toHaveBeenCalled()
    expect(paceProviderRequest).toHaveBeenCalledTimes(1)
  })
})

describe('computeHasMore (spec 0017 §7.2 - the three worked examples)', () => {
  it('a completely full raw page that is also the entire result set -> false', () => {
    expect(
      computeHasMore({ limit: 5, offset: 0, providerCount: 5, rawCount: 5 }),
    ).toBe(false)
  })

  it('a completely full raw page with more results beyond it -> true', () => {
    expect(
      computeHasMore({ limit: 5, offset: 0, providerCount: 6, rawCount: 5 }),
    ).toBe(true)
  })

  it('the 20-result window boundary short-circuits regardless of providerCount -> false', () => {
    expect(
      computeHasMore({ limit: 5, offset: 15, providerCount: 100, rawCount: 5 }),
    ).toBe(false)
  })

  it('a partial raw page is exhaustion regardless of providerCount -> false', () => {
    expect(
      computeHasMore({ limit: 5, offset: 0, providerCount: 100, rawCount: 3 }),
    ).toBe(false)
  })
})

describe('catalog search - modes, pagination, and exact lookup (spec 0017)', () => {
  it('an omitted mode defaults to all', async () => {
    const { dependencies, searchReleases } = createDependencies()

    await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(searchReleases).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'all' }),
    )
  })

  it('accepts each explicit valid mode', async () => {
    const { dependencies, searchReleases } = createDependencies()

    for (const mode of ['all', 'artist', 'album']) {
      searchReleases.mockClear()
      const response = await handleCatalogSearch(
        authedRequest(`http://app.test/api/catalog/search?q=pink&mode=${mode}`),
        env,
        dependencies,
      )

      expect(response.status).toBe(200)
      expect(searchReleases).toHaveBeenCalledWith(
        expect.objectContaining({ mode }),
      )
    }
  })

  it('rejects a present but unrecognized mode as invalid_query (not silently coerced to all)', async () => {
    const { dependencies, searchReleases } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink&mode=bogus'),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
    expect(searchReleases).not.toHaveBeenCalled()
  })

  it('an omitted offset defaults to 0', async () => {
    const { dependencies, searchReleases } = createDependencies()

    await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(searchReleases).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 }),
    )
  })

  it('accepts a valid non-negative integer offset', async () => {
    const { dependencies, searchReleases } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink&offset=5'),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(searchReleases).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 5 }),
    )
  })

  it.each(['-1', '1.5', 'abc'])(
    'rejects an invalid offset (%s) as invalid_query',
    async (offset) => {
      const { dependencies, searchReleases } = createDependencies()

      const response = await handleCatalogSearch(
        authedRequest(`http://app.test/api/catalog/search?q=pink&offset=${offset}`),
        env,
        dependencies,
      )

      expect(response.status).toBe(400)
      await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
      expect(searchReleases).not.toHaveBeenCalled()
    },
  )

  it('rejects a combined offset + limit exceeding the 20-result window, even when each is individually valid', async () => {
    const { dependencies, searchReleases } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink&offset=15&limit=10'),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
    expect(searchReleases).not.toHaveBeenCalled()
  })

  it('accepts the boundary case that exactly fills the 20-result window', async () => {
    const { dependencies, searchReleases } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink&offset=15&limit=5'),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(searchReleases).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, offset: 15 }),
    )
  })

  it('reflects the count-aware hasMore formula in the actual response', async () => {
    const { dependencies, searchReleases } = createDependencies()
    searchReleases.mockResolvedValue({
      candidates: [catalogCandidate()],
      providerCount: 6,
      providerOffset: 0,
      rawCount: 5,
    })

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink&limit=5'),
      env,
      dependencies,
    )

    await expect(readJson(response)).resolves.toMatchObject({ hasMore: true, offset: 0 })
  })

  it('rejects releaseId combined with q', async () => {
    const { dependencies, searchReleases, lookupRelease } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest(`http://app.test/api/catalog/search?releaseId=${providerReleaseId}&q=pink`),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
    expect(searchReleases).not.toHaveBeenCalled()
    expect(lookupRelease).not.toHaveBeenCalled()
  })

  it.each(['mode=all', 'offset=0', 'limit=5'])(
    'rejects releaseId combined with %s',
    async (extraParam) => {
      const { dependencies, lookupRelease } = createDependencies()

      const response = await handleCatalogSearch(
        authedRequest(
          `http://app.test/api/catalog/search?releaseId=${providerReleaseId}&${extraParam}`,
        ),
        env,
        dependencies,
      )

      expect(response.status).toBe(400)
      await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
      expect(lookupRelease).not.toHaveBeenCalled()
    },
  )

  it('rejects a request with neither q nor releaseId', async () => {
    const { dependencies, searchReleases, lookupRelease } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search'),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
    expect(searchReleases).not.toHaveBeenCalled()
    expect(lookupRelease).not.toHaveBeenCalled()
  })

  it('rejects a malformed releaseId', async () => {
    const { dependencies, lookupRelease } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?releaseId=not-a-uuid'),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
    expect(lookupRelease).not.toHaveBeenCalled()
  })

  it('performs the exact lookup and returns the single-candidate response shape', async () => {
    const { dependencies, lookupRelease, paceProviderRequest } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest(`http://app.test/api/catalog/search?releaseId=${providerReleaseId}`),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupRelease).toHaveBeenCalledWith({
      providerReleaseId,
      userAgent: env.MUSICBRAINZ_USER_AGENT,
    })
    expect(paceProviderRequest).toHaveBeenCalledOnce()
    await expect(readJson(response)).resolves.toEqual({
      candidates: [catalogCandidate()],
      hasMore: false,
      offset: 0,
    })
  })

  it('the exact lookup performs no genre enrichment and no database write', async () => {
    const { dependencies, createClient, lookupReleaseGroupGenres, serviceClient } =
      createDependencies()

    const response = await handleCatalogSearch(
      authedRequest(`http://app.test/api/catalog/search?releaseId=${providerReleaseId}`),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupReleaseGroupGenres).not.toHaveBeenCalled()
    // The service-role createClient path is never selected for this
    // request - `serviceClient` is constructed up-front in the shared test
    // harness (it exists to serve the add-path tests above), so the
    // meaningful assertion is that createClient is never invoked with the
    // service-role key, not that the object fails to exist.
    expect(createClient).not.toHaveBeenCalledWith(
      expect.any(String),
      'service-key',
      expect.anything(),
    )
    expect(serviceClient.from).not.toHaveBeenCalled()
  })

  it('the exact lookup reuses the existing single bounded rate-limit retry', async () => {
    const { dependencies, delay, lookupRelease, paceProviderRequest } =
      createDependencies()

    lookupRelease.mockReset()
    lookupRelease
      .mockRejectedValueOnce(
        new MusicBrainzError(
          'provider_rate_limited',
          'MusicBrainz is rate limiting or temporarily unavailable.',
          503,
        ),
      )
      .mockResolvedValueOnce(catalogCandidate())

    const response = await handleCatalogSearch(
      authedRequest(`http://app.test/api/catalog/search?releaseId=${providerReleaseId}`),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupRelease).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledTimes(1)
    expect(delay).toHaveBeenCalledWith(1200)
    // Pacing is the shared, unmodified pacer every MusicBrainz call already
    // uses - twice here, once for the initial attempt and once for the
    // retry (spec 0017 §14).
    expect(paceProviderRequest).toHaveBeenCalledTimes(2)
  })

  it('a normal search still gets no retry policy of its own (unchanged, re-verified)', async () => {
    const { dependencies, delay, searchReleases } = createDependencies({
      searchError: new MusicBrainzError(
        'provider_rate_limited',
        'MusicBrainz is rate limiting or temporarily unavailable.',
        503,
      ),
    })

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink&offset=5'),
      env,
      dependencies,
    )

    expect(response.status).toBe(503)
    expect(searchReleases).toHaveBeenCalledTimes(1)
    expect(delay).not.toHaveBeenCalled()
  })
})

describe('Discogs secondary catalog provider (spec 0018)', () => {
  it('a plain search defaults to MusicBrainz - no Discogs call before an explicit fallback', async () => {
    const { dependencies, searchDiscogsReleases, searchReleases } = createDependencies()

    await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?q=pink'),
      env,
      dependencies,
    )

    expect(searchReleases).toHaveBeenCalledOnce()
    expect(searchDiscogsReleases).not.toHaveBeenCalled()
  })

  it('an explicit provider=discogs search calls the Discogs adapter with its own pacer and token', async () => {
    const { dependencies, paceDiscogsRequest, paceProviderRequest, searchDiscogsReleases } =
      createDependencies()

    const response = await handleCatalogSearch(
      authedRequest(
        `http://app.test/api/catalog/search?provider=discogs&q=${encodeURIComponent('כהן מה שאפשר עם מה שנשאר')}`,
      ),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(searchDiscogsReleases).toHaveBeenCalledWith({
      query: 'כהן מה שאפשר עם מה שנשאר',
      token: env.DISCOGS_TOKEN,
      userAgent: env.DISCOGS_USER_AGENT,
    })
    expect(paceDiscogsRequest).toHaveBeenCalledOnce()
    expect(paceProviderRequest).not.toHaveBeenCalled()
    await expect(readJson(response)).resolves.toMatchObject({
      results: [{ provider: 'discogs', providerReleaseId: discogsReleaseId }],
    })
  })

  it('returns a genuinely distinct response shape from CatalogSearchResponse (no candidates/offset/hasMore keys)', async () => {
    const { dependencies } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?provider=discogs&q=pink'),
      env,
      dependencies,
    )

    const payload = await readJson(response)
    expect(payload).toHaveProperty('results')
    expect(payload).not.toHaveProperty('candidates')
    expect(payload).not.toHaveProperty('hasMore')
  })

  it.each(['mode=all', 'offset=0', 'limit=5'])(
    'rejects a Discogs search combined with %s',
    async (extraParam) => {
      const { dependencies, searchDiscogsReleases } = createDependencies()

      const response = await handleCatalogSearch(
        authedRequest(`http://app.test/api/catalog/search?provider=discogs&q=pink&${extraParam}`),
        env,
        dependencies,
      )

      expect(response.status).toBe(400)
      await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
      expect(searchDiscogsReleases).not.toHaveBeenCalled()
    },
  )

  it('rejects an unrecognized provider value', async () => {
    const { dependencies, searchReleases } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?provider=bogus&q=pink'),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
    expect(searchReleases).not.toHaveBeenCalled()
  })

  it('sanitizes a Discogs provider failure without leaking the token or a raw payload', async () => {
    const { dependencies } = createDependencies({
      discogsSearchError: new Error('should not be exposed'),
    })

    const response = await handleCatalogSearch(
      authedRequest('http://app.test/api/catalog/search?provider=discogs&q=pink'),
      env,
      dependencies,
    )

    expect(response.status).toBe(500)
    const payload = await readJson(response)
    expect(JSON.stringify(payload)).not.toContain(env.DISCOGS_TOKEN)
  })

  it('the read-only exact-preview lookup (provider=discogs&releaseId=...) performs zero database writes', async () => {
    const { dependencies, lookupDiscogsRelease, paceDiscogsRequest, serviceClient } =
      createDependencies()

    const response = await handleCatalogSearch(
      authedRequest(`http://app.test/api/catalog/search?provider=discogs&releaseId=${discogsReleaseId}`),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupDiscogsRelease).toHaveBeenCalledWith({
      providerReleaseId: discogsReleaseId,
      token: env.DISCOGS_TOKEN,
      userAgent: env.DISCOGS_USER_AGENT,
    })
    expect(paceDiscogsRequest).toHaveBeenCalledOnce()
    expect(serviceClient.from).not.toHaveBeenCalled()
    await expect(readJson(response)).resolves.toEqual({
      candidates: [discogsCandidate()],
      hasMore: false,
      offset: 0,
    })
  })

  it('rejects a Discogs releaseId that does not match the numeric Discogs id pattern (never the MusicBrainz UUID pattern)', async () => {
    const { dependencies, lookupDiscogsRelease } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest(`http://app.test/api/catalog/search?provider=discogs&releaseId=${providerReleaseId}`),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    expect(lookupDiscogsRelease).not.toHaveBeenCalled()
  })

  it('rejects a MusicBrainz releaseId against the Discogs numeric pattern being used for a musicbrainz lookup is unaffected (regression)', async () => {
    const { dependencies, lookupRelease } = createDependencies()

    const response = await handleCatalogSearch(
      authedRequest(`http://app.test/api/catalog/search?releaseId=${providerReleaseId}`),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupRelease).toHaveBeenCalledOnce()
  })

  function discogsAddRequest() {
    return authedRequest('http://app.test/api/catalog/add', {
      body: JSON.stringify({ provider: 'discogs', providerReleaseId: discogsReleaseId }),
      method: 'POST',
    })
  }

  it('adding a Discogs candidate performs a second, independent, persisting lookup and persists provider_fetched_at', async () => {
    const { dependencies, itemQuery, lookupDiscogsRelease, releaseQuery } = createDependencies()

    const response = await handleCatalogAdd(discogsAddRequest(), env, dependencies)

    expect(response.status).toBe(200)
    expect(lookupDiscogsRelease).toHaveBeenCalledWith({
      providerReleaseId: discogsReleaseId,
      token: env.DISCOGS_TOKEN,
      userAgent: env.DISCOGS_USER_AGENT,
    })
    const upsertPayload = releaseQuery.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(upsertPayload).toMatchObject({
      artist: 'כהן',
      catalog_number: 'HSV005',
      genres: ['hip hop'],
      label: 'Hasivuv',
      provider: 'discogs',
      provider_release_id: discogsReleaseId,
      source: 'catalog',
    })
    expect(typeof upsertPayload.provider_fetched_at).toBe('string')
    expect(itemQuery.insert).toHaveBeenCalledWith({
      release_id: 'release-1',
      user_id: verifiedUserId,
    })
  })

  it('a non-Vinyl / not-found Discogs release is rejected with a clear, honest error, never added', async () => {
    const { dependencies, itemQuery } = createDependencies({
      discogsLookupError: new DiscogsError(
        'not_found',
        'This Discogs release is not available as Vinyl, or the release could not be verified.',
      ),
    })

    const response = await handleCatalogAdd(discogsAddRequest(), env, dependencies)

    expect(response.status).toBe(404)
    expect(itemQuery.insert).not.toHaveBeenCalled()
  })

  it('a rejected Discogs provider identity (e.g. a MusicBrainz-shaped id) never reaches the lookup', async () => {
    const { dependencies, lookupDiscogsRelease } = createDependencies()

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({ provider: 'discogs', providerReleaseId }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    expect(lookupDiscogsRelease).not.toHaveBeenCalled()
  })

  it('a MusicBrainz add is unaffected (regression): providerFetchedAt persists as null', async () => {
    const { dependencies, releaseQuery } = createDependencies()

    await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({ provider: 'musicbrainz', providerReleaseId }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    const upsertPayload = releaseQuery.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(upsertPayload.provider_fetched_at).toBeNull()
  })

  it('the refresh action re-fetches and persists Discogs metadata without creating a collection item', async () => {
    const { dependencies, itemQuery, lookupDiscogsRelease, releaseQuery } = createDependencies()

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          action: 'refresh',
          provider: 'discogs',
          providerReleaseId: discogsReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(lookupDiscogsRelease).toHaveBeenCalledOnce()
    expect(releaseQuery.upsert).toHaveBeenCalledOnce()
    expect(itemQuery.insert).not.toHaveBeenCalled()
    const payload = await readJson(response)
    expect(payload).toMatchObject({
      candidate: { provider: 'discogs', providerReleaseId: discogsReleaseId },
      genres: ['hip hop'],
    })
    expect(typeof payload.providerFetchedAt).toBe('string')
  })

  it('the refresh action rejects a non-Discogs provider', async () => {
    const { dependencies, lookupDiscogsRelease } = createDependencies()

    const response = await handleCatalogAdd(
      authedRequest('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          action: 'refresh',
          provider: 'musicbrainz',
          providerReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    expect(lookupDiscogsRelease).not.toHaveBeenCalled()
  })

  it('the refresh action requires authentication', async () => {
    const { dependencies, lookupDiscogsRelease } = createDependencies({
      authError: new Error('expired token'),
    })

    const response = await handleCatalogAdd(
      new Request('http://app.test/api/catalog/add', {
        body: JSON.stringify({
          action: 'refresh',
          provider: 'discogs',
          providerReleaseId: discogsReleaseId,
        }),
        method: 'POST',
      }),
      env,
      dependencies,
    )

    expect(response.status).toBe(401)
    expect(lookupDiscogsRelease).not.toHaveBeenCalled()
  })

  it('never leaks DISCOGS_TOKEN in a response body for any Discogs code path', async () => {
    const { dependencies } = createDependencies({
      discogsLookupError: new DiscogsError('provider_unavailable', 'Discogs request failed.'),
    })

    const response = await handleCatalogAdd(discogsAddRequest(), env, dependencies)
    const payload = await readJson(response)
    expect(JSON.stringify(payload)).not.toContain(env.DISCOGS_TOKEN)
  })
})
