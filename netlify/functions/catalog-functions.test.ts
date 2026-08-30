// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import addHandler, { config as addConfig } from './catalog-add.mts'
import searchHandler, { config as searchConfig } from './catalog-search.mts'
import {
  handleCatalogAdd,
  handleCatalogSearch,
} from './_shared/catalog-handlers.mts'
import { MusicBrainzError } from '../../src/lib/catalog/musicbrainz.ts'
import type { CatalogCandidate } from '../../src/lib/catalog/types.ts'

const env = {
  MUSICBRAINZ_USER_AGENT: 'VinylIntelligence/0.0.0 (test@example.com)',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
}
const providerReleaseId = '11111111-1111-4111-8111-111111111111'
const providerReleaseGroupId = '22222222-2222-4222-8222-222222222222'
const verifiedUserId = '00000000-0000-4000-8000-0000000000a1'

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
} = {}) {
  const searchReleases = vi.fn(async () => [catalogCandidate()])
  const lookupRelease = vi.fn(async () => catalogCandidate())
  const lookupReleaseGroupGenres = vi.fn(async (): Promise<string[]> => [])
  const paceProviderRequest = vi.fn(async () => undefined)
  const delay = vi.fn(async () => undefined)
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
    lookupRelease,
    lookupReleaseGroupGenres,
    paceProviderRequest,
    searchReleases,
  } as unknown as NonNullable<Parameters<typeof handleCatalogSearch>[2]>

  return {
    authClient,
    createClient,
    delay,
    dependencies,
    itemQuery,
    lookupRelease,
    lookupReleaseGroupGenres,
    paceProviderRequest,
    releaseQuery,
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
