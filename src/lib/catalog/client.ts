import type { BrowserSupabaseClient } from '../supabase/client.ts'
import {
  CatalogClientError,
  type CatalogAddResponse,
  type CatalogCandidate,
  type CatalogErrorCode,
  type CatalogSearchResponse,
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

export async function searchCatalog(
  client: BrowserSupabaseClient,
  query: string,
  limit = DEFAULT_CATALOG_LIMIT,
): Promise<CatalogCandidate[]> {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length === 0) {
    return []
  }

  const params = new URLSearchParams({
    q: trimmedQuery,
    limit: boundedLimit(limit).toString(),
  })
  const data = await requestCatalog<CatalogSearchResponse>(
    client,
    `/api/catalog/search?${params.toString()}`,
  )

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
