import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCatalogReleaseToCollection,
  lookupCatalogRelease,
  lookupDiscogsCatalogRelease,
  refreshDiscogsCollectionItem,
  searchCatalog,
  searchCatalogPage,
  searchDiscogsCatalog,
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
      '/api/catalog/search?limit=10&mode=all&offset=0&q=pink+floyd',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
      }),
    )
  })

  it('searchCatalog compatibility wrapper explicitly sends mode=all (Scan compatibility, spec 0017)', async () => {
    const fetchMock = mockFetch({ candidates: [], hasMore: false, offset: 0 })
    vi.stubGlobal('fetch', fetchMock)

    await searchCatalog(createClient(), 'pink floyd')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('mode=all'),
      expect.anything(),
    )
  })

  it('searchCatalogPage sends mode/offset/limit and returns the full page shape', async () => {
    const fetchMock = mockFetch({
      candidates: [],
      hasMore: true,
      offset: 5,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      searchCatalogPage(createClient(), {
        limit: 5,
        mode: 'artist',
        offset: 5,
        query: 'portishead',
      }),
    ).resolves.toEqual({ candidates: [], hasMore: true, offset: 5 })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/search?limit=5&mode=artist&offset=5&q=portishead',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
      }),
    )
  })

  it('lookupCatalogRelease sends releaseId alone and returns the response shape', async () => {
    const releaseId = '11111111-1111-4111-8111-111111111111'
    const fetchMock = mockFetch({
      candidates: [
        {
          artist: 'Pink Floyd',
          catalogNumber: null,
          country: null,
          derivedProviderPageUrl: `https://musicbrainz.org/release/${releaseId}`,
          format: null,
          label: null,
          provider: 'musicbrainz',
          providerReleaseGroupId: null,
          providerReleaseId: releaseId,
          releaseYear: null,
          score: null,
          title: 'The Dark Side of the Moon',
          transientCoverDisplayUrl: null,
        },
      ],
      hasMore: false,
      offset: 0,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      lookupCatalogRelease(createClient(), releaseId),
    ).resolves.toMatchObject({
      candidates: [{ providerReleaseId: releaseId }],
      hasMore: false,
      offset: 0,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/catalog/search?releaseId=${releaseId}`,
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

  it('sends an explicit Discogs search request', async () => {
    const fetchMock = mockFetch({ results: [] })
    vi.stubGlobal('fetch', fetchMock)

    await searchDiscogsCatalog(createClient(), 'כהן מה שאפשר עם מה שנשאר')

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('/api/catalog/search?')
    expect(url).toContain('provider=discogs')
    // URLSearchParams encodes the query the same way as every other search
    // helper in this module (space -> '+', not '%20') - decode round-trip
    // rather than assume a specific escaping.
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('q')).toBe('כהן מה שאפשר עם מה שנשאר')
  })

  it('sends the read-only Discogs exact-preview lookup', async () => {
    const fetchMock = mockFetch({ candidates: [], hasMore: false, offset: 0 })
    vi.stubGlobal('fetch', fetchMock)

    await lookupDiscogsCatalogRelease(createClient(), '26770295')

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe('/api/catalog/search?provider=discogs&releaseId=26770295')
  })

  it('sends a Discogs refresh action to the existing add endpoint', async () => {
    const fetchMock = mockFetch({
      candidate: {
        artist: 'כהן',
        catalogNumber: 'HSV005',
        country: 'Israel',
        derivedProviderPageUrl: 'https://www.discogs.com/release/26770295',
        format: 'Vinyl, LP, Album',
        label: 'Hasivuv',
        provider: 'discogs',
        providerReleaseGroupId: '3058367',
        providerReleaseId: '26770295',
        releaseYear: 2023,
        score: null,
        title: 'מה שאפשר עם מה שנשאר',
        transientCoverDisplayUrl: null,
      },
      genres: ['hip hop'],
      providerFetchedAt: '2026-09-16T12:00:00.000Z',
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshDiscogsCollectionItem(createClient(), '26770295')

    expect(result.providerFetchedAt).toBe('2026-09-16T12:00:00.000Z')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/add',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'refresh',
          provider: 'discogs',
          providerReleaseId: '26770295',
        }),
        method: 'POST',
      }),
    )
  })
})
