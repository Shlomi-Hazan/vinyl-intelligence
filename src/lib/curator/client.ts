import type { BrowserSupabaseClient } from '../supabase/client.ts'
import {
  CuratorError,
  EVIDENCE_KEYS,
  type CuratorErrorCode,
  type CuratorIntent,
  type CuratorRecommendation,
  type CuratorResult,
} from './types.ts'

const CURATOR_ERROR_CODES: CuratorErrorCode[] = [
  'unauthorized',
  'invalid_request',
  'request_too_long',
  'rate_limited',
  'rate_check_failed',
  'collection_unavailable',
  'provider_rate_limited',
  'provider_unavailable',
  'provider_timeout',
  'provider_bad_response',
  'config_error',
  'unknown',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCuratorErrorCode(value: unknown): value is CuratorErrorCode {
  return typeof value === 'string' && CURATOR_ERROR_CODES.includes(value as CuratorErrorCode)
}

async function getAccessToken(client: BrowserSupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw new CuratorError('unauthorized', error.message)
  }
  const accessToken = data.session?.access_token
  if (!accessToken) {
    throw new CuratorError('unauthorized', 'Sign in to use the curator.')
  }
  return accessToken
}

function normalizeRecommendation(value: unknown): CuratorRecommendation {
  if (!isRecord(value) || typeof value.collectionItemId !== 'string') {
    throw new CuratorError('provider_bad_response', 'The curator returned an unexpected response.')
  }
  return {
    collectionItemId: value.collectionItemId,
    artist: typeof value.artist === 'string' ? value.artist : '',
    title: typeof value.title === 'string' ? value.title : '',
    year: typeof value.year === 'number' ? value.year : null,
    decade: typeof value.decade === 'number' ? value.decade : null,
    genres: Array.isArray(value.genres)
      ? value.genres.filter((g): g is string => typeof g === 'string')
      : [],
    rating: typeof value.rating === 'number' ? value.rating : null,
    favorite: value.favorite === true,
    playCount: typeof value.playCount === 'number' ? value.playCount : 0,
    lastListenedAt: typeof value.lastListenedAt === 'string' ? value.lastListenedAt : null,
    neverPlayed: value.neverPlayed === true,
    reason: typeof value.reason === 'string' ? value.reason : '',
    evidenceKeys: Array.isArray(value.evidenceKeys)
      ? value.evidenceKeys.filter(
          (k): k is CuratorRecommendation['evidenceKeys'][number] =>
            typeof k === 'string' && (EVIDENCE_KEYS as readonly string[]).includes(k),
        )
      : [],
    isBestMatch: value.isBestMatch === true,
  }
}

function normalizeResult(payload: unknown): CuratorResult {
  if (!isRecord(payload)) {
    throw new CuratorError('provider_bad_response', 'The curator returned an unexpected response.')
  }

  if (payload.status === 'empty_collection') {
    return { status: 'empty_collection' }
  }

  if (payload.status === 'no_match') {
    if (!isRecord(payload.interpretedIntent)) {
      throw new CuratorError('provider_bad_response', 'The curator returned an unexpected response.')
    }
    return {
      status: 'no_match',
      interpretedIntent: payload.interpretedIntent as unknown as CuratorIntent,
    }
  }

  if (payload.status === 'ok') {
    if (!isRecord(payload.interpretedIntent) || !Array.isArray(payload.recommendations)) {
      throw new CuratorError('provider_bad_response', 'The curator returned an unexpected response.')
    }
    return {
      status: 'ok',
      interpretedIntent: payload.interpretedIntent as unknown as CuratorIntent,
      candidateCount: typeof payload.candidateCount === 'number' ? payload.candidateCount : 0,
      recommendations: payload.recommendations.map(normalizeRecommendation),
    }
  }

  throw new CuratorError('provider_bad_response', 'The curator returned an unknown status.')
}

/** POST the free-text request to the curator function and return a typed result. */
export async function requestCuratorRecommendation(
  client: BrowserSupabaseClient,
  request: string,
): Promise<CuratorResult> {
  const accessToken = await getAccessToken(client)
  const response = await fetch('/api/curator/recommend', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ request }),
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const code = isRecord(payload) && isCuratorErrorCode(payload.code) ? payload.code : 'unknown'
    const message =
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'The curator failed. Please try again.'
    throw new CuratorError(code, message)
  }

  return normalizeResult(payload)
}
