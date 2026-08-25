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
  const paceProviderRequest = vi.fn(async () => undefined)
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
    upsert: vi.fn(() => releaseQuery),
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
    lookupRelease,
    paceProviderRequest,
    searchReleases,
  } as unknown as NonNullable<Parameters<typeof handleCatalogSearch>[2]>

  return {
    authClient,
    createClient,
    dependencies,
    itemQuery,
    lookupRelease,
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
})
