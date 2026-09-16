import type { BrowserSupabaseClient } from '../supabase/client.ts'
import type { DiscogsSearchResponse } from './discogs.ts'
import {
  CatalogClientError,
  type CatalogAddResponse,
  type CatalogCandidate,
  type CatalogErrorCode,
  type CatalogSearchResponse,
  type SearchMode,
} from './types.ts'

/**
 * The exact response shape `/api/catalog/add` returns for a `{ action:
 * 'refresh', provider: 'discogs', providerReleaseId }` request (spec 0018
 * §8.0/§8.2.1). The browser must use `providerFetchedAt` as returned here -
 * never `Date.now()` - when updating its own freshness clock.
 */
export type DiscogsRefreshResponse = {
  candidate: CatalogCandidate
  genres: string[]
  providerFetchedAt: string
}

const DEFAULT_CATALOG_LIMIT = 5
const MAX_CATALOG_LIMIT = 10

type CatalogErrorResponse = {
  code?: CatalogErrorCode
  message?: string
}

async function getAccessToken(client: BrowserSupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession()

  if (error) {
    throw new CatalogClientError('unauthorized', error.message)
  }

  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new CatalogClientError(
      'unauthorized',
      'Sign in before using catalog search.',
    )
  }

  return accessToken
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCatalogErrorCode(value: unknown): value is CatalogErrorCode {
  return typeof value === 'string'
    && [
      'invalid_query',
      'unauthorized',
      'provider_rate_limited',
      'provider_unavailable',
      'provider_timeout',
      'provider_bad_response',
      'not_found',
      'config_error',
      'database_error',
      'unknown',
    ].includes(value)
}

function parseErrorResponse(payload: unknown): CatalogErrorResponse {
  if (!isRecord(payload)) {
    return {}
  }

  return {
    code: isCatalogErrorCode(payload.code) ? payload.code : undefined,
    message: typeof payload.message === 'string' ? payload.message : undefined,
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function requestCatalog<T>(
  client: BrowserSupabaseClient,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const accessToken = await getAccessToken(client)
  const response = await fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const payload = await parseJsonResponse(response)

  if (!response.ok) {
    const errorPayload = parseErrorResponse(payload)

    throw new CatalogClientError(
      errorPayload.code ?? 'unknown',
      errorPayload.message ?? 'Catalog request failed. Please try again.',
    )
  }

  return payload as T
}

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CATALOG_LIMIT
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CATALOG_LIMIT)
}

export type SearchCatalogPageOptions = {
  query: string
  mode: SearchMode
  /** Non-negative page offset. Omitted -> 0 (spec 0017 §8.1). */
  offset?: number
  limit?: number
}

/**
 * A single, mode-aware, paginated catalog search page (spec 0017 §8.1).
 * Used by Discover, which needs the full `{ candidates, offset, hasMore }`
 * response shape for its mode selector and Load More UI.
 */
export async function searchCatalogPage(
  client: BrowserSupabaseClient,
  { limit, mode, offset, query }: SearchCatalogPageOptions,
): Promise<CatalogSearchResponse> {
  const params = new URLSearchParams({
    limit: boundedLimit(limit ?? DEFAULT_CATALOG_LIMIT).toString(),
    mode,
    offset: (offset ?? 0).toString(),
    q: query.trim(),
  })

  return requestCatalog<CatalogSearchResponse>(
    client,
    `/api/catalog/search?${params.toString()}`,
  )
}

/**
 * The exact-URL lookup (spec 0017 §10-§11): `releaseId` alone, mutually
 * exclusive with `q`/`mode`/`offset`/`limit` server-side. Returns the exact
 * same `CatalogSearchResponse` shape as a normal search page
 * (`{ candidates: [one], offset: 0, hasMore: false }`), so Discover's
 * existing candidate-rendering, ownership, and duplicate-copy code needs no
 * new branches to handle it.
 */
export async function lookupCatalogRelease(
  client: BrowserSupabaseClient,
  releaseId: string,
): Promise<CatalogSearchResponse> {
  const params = new URLSearchParams({ releaseId })

  return requestCatalog<CatalogSearchResponse>(
    client,
    `/api/catalog/search?${params.toString()}`,
  )
}

/**
 * The pre-0017 candidate-only contract, kept byte-identical for Scan
 * (`ScanPanel.tsx` calls this exact function with this exact signature and
 * return type - unchanged). Implemented as a thin wrapper over
 * `searchCatalogPage`, explicitly sending `mode: 'all'` rather than relying
 * on the server's omitted-mode-defaults-to-all transition safety net (spec
 * 0017 §8.1) - new code should not lean on an implicit default for its own
 * intentional request. Scan therefore inherits the corrected All-mode
 * shared-search semantics through this shared boundary without any change
 * to its own call site.
 */
export async function searchCatalog(
  client: BrowserSupabaseClient,
  query: string,
  limit = DEFAULT_CATALOG_LIMIT,
): Promise<CatalogCandidate[]> {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length === 0) {
    return []
  }

  const data = await searchCatalogPage(client, {
    limit,
    mode: 'all',
    query: trimmedQuery,
  })

  return Array.isArray(data.candidates) ? data.candidates : []
}

export async function addCatalogReleaseToCollection(
  client: BrowserSupabaseClient,
  candidate: Pick<CatalogCandidate, 'provider' | 'providerReleaseId'>,
): Promise<CatalogAddResponse['item']> {
  const data = await requestCatalog<CatalogAddResponse>(client, '/api/catalog/add', {
    body: JSON.stringify({
      provider: candidate.provider,
      providerReleaseId: candidate.providerReleaseId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  return data.item
}

/**
 * The explicit, user-triggered Discogs fallback search (spec 0018 §6/§8):
 * `GET /api/catalog/search?provider=discogs&q=...`. A genuinely distinct
 * response shape from `CatalogSearchResponse` - never forced into it.
 */
export async function searchDiscogsCatalog(
  client: BrowserSupabaseClient,
  query: string,
): Promise<DiscogsSearchResponse> {
  const params = new URLSearchParams({ provider: 'discogs', q: query.trim() })

  return requestCatalog<DiscogsSearchResponse>(
    client,
    `/api/catalog/search?${params.toString()}`,
  )
}

/**
 * The read-only Discogs exact-preview lookup (spec 0018 §5.2/§6 step 3):
 * `GET /api/catalog/search?provider=discogs&releaseId=...`. Zero database
 * writes. Returns the same `CatalogSearchResponse` shape as the existing
 * MusicBrainz exact lookup (`lookupCatalogRelease`) - a real, fully-
 * normalized `CatalogCandidate`, never trusted metadata from the browser's
 * own prior search-result display.
 */
export async function lookupDiscogsCatalogRelease(
  client: BrowserSupabaseClient,
  releaseId: string,
): Promise<CatalogSearchResponse> {
  const params = new URLSearchParams({ provider: 'discogs', releaseId })

  return requestCatalog<CatalogSearchResponse>(
    client,
    `/api/catalog/search?${params.toString()}`,
  )
}

/**
 * Re-fetches and persists the current Discogs metadata for an
 * already-owned release (spec 0018 §8.2.1) via the existing
 * `POST /api/catalog/add` endpoint's `refresh` action - never creates a new
 * collection item.
 */
export async function refreshDiscogsCollectionItem(
  client: BrowserSupabaseClient,
  providerReleaseId: string,
): Promise<DiscogsRefreshResponse> {
  return requestCatalog<DiscogsRefreshResponse>(client, '/api/catalog/add', {
    body: JSON.stringify({
      action: 'refresh',
      provider: 'discogs',
      providerReleaseId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
}
