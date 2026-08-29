import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCatalogReleaseToCollection,
  searchCatalog,
} from './client.ts'
import { CatalogClientError } from './types.ts'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

const accessToken = 'test-access-token'

function createClient(options: { sessionError?: Error; signedOut?: boolean } = {}) {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: options.signedOut
            ? null
            : {
                access_token: accessToken,
              },
        },
        error: options.sessionError ?? null,
      })),
    },
  } as unknown as BrowserSupabaseClient
}

function mockFetch(payload: unknown, status = 200) {
  return vi.fn(async () => Response.json(payload, { status }))
}

describe('catalog browser client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({ candidates: [] }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends authenticated search requests to the app catalog boundary', async () => {
    const fetchMock = mockFetch({
      candidates: [
        {
          artist: 'Pink Floyd',
          catalogNumber: 'SHVL 804',
          country: 'GB',
          derivedProviderPageUrl:
            'https://musicbrainz.org/release/11111111-1111-4111-8111-111111111111',
          format: 'LP',
          label: 'Harvest',
          provider: 'musicbrainz',
          providerReleaseGroupId: null,
          providerReleaseId: '11111111-1111-4111-8111-111111111111',
          releaseYear: 1973,
          score: 100,
          title: 'The Dark Side of the Moon',
          transientCoverDisplayUrl: null,
        },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchCatalog(createClient(), '  pink floyd  ', 99)).resolves
      .toHaveLength(1)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/search?q=pink+floyd&limit=10',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
      }),
    )
  })

  it('does not make a network request for blank searches', async () => {
    const fetchMock = vi.mocked(fetch)

    await expect(searchCatalog(createClient(), '   ')).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces controlled catalog errors', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        {
          code: 'provider_rate_limited',
          message: 'MusicBrainz is rate limiting or temporarily unavailable.',
        },
        503,
      ),
    )

    await expect(searchCatalog(createClient(), 'pink')).rejects.toMatchObject({
      code: 'provider_rate_limited',
      message: 'MusicBrainz is rate limiting or temporarily unavailable.',
    })
  })

  it('requires an authenticated session before catalog calls', async () => {
    const fetchMock = vi.mocked(fetch)

    await expect(searchCatalog(createClient({ signedOut: true }), 'pink')).rejects
      .toBeInstanceOf(CatalogClientError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds catalog releases through the app function boundary using provider identity only', async () => {
    const fetchMock = mockFetch({
      item: {
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
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      addCatalogReleaseToCollection(createClient(), {
        provider: 'musicbrainz',
        providerReleaseId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toMatchObject({
      id: 'item-1',
      release: {
        title: 'The Dark Side of the Moon',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/add',
      expect.objectContaining({
        body: JSON.stringify({
          provider: 'musicbrainz',
          providerReleaseId: '11111111-1111-4111-8111-111111111111',
        }),
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    )
  })
})
