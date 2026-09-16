import type { BrowserSupabaseClient } from '../supabase/client.ts'
import {
  CatalogClientError,
  type CatalogAddResponse,
  type CatalogCandidate,
  type CatalogErrorCode,
  type CatalogSearchResponse,
  type SearchMode,
} from './types.ts'

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
