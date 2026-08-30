import type { BrowserSupabaseClient } from '../supabase/client.ts'
import {
  RecognitionError,
  type CoverRecognition,
  type RecognitionErrorCode,
} from './types.ts'

const RECOGNITION_ERROR_CODES: RecognitionErrorCode[] = [
  'unauthorized',
  'invalid_query',
  'unsupported_media_type',
  'image_too_large',
  'rate_limited',
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

function isRecognitionErrorCode(value: unknown): value is RecognitionErrorCode {
  return typeof value === 'string'
    && RECOGNITION_ERROR_CODES.includes(value as RecognitionErrorCode)
}

async function getAccessToken(client: BrowserSupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession()

  if (error) {
    throw new RecognitionError('unauthorized', error.message)
  }

  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new RecognitionError('unauthorized', 'Sign in to use photo recognition.')
  }

  return accessToken
}

function normalizeRecognition(value: unknown): CoverRecognition {
  if (!isRecord(value)) {
    throw new RecognitionError(
      'provider_bad_response',
      'Photo recognition returned an unexpected response.',
    )
  }

  return {
    artist: typeof value.artist === 'string' ? value.artist : null,
    albumTitle: typeof value.albumTitle === 'string' ? value.albumTitle : null,
    visibleText: Array.isArray(value.visibleText)
      ? value.visibleText.filter((line): line is string => typeof line === 'string')
      : [],
    label: typeof value.label === 'string' ? value.label : null,
    catalogNumber: typeof value.catalogNumber === 'string' ? value.catalogNumber : null,
    releaseYearHint:
      typeof value.releaseYearHint === 'number' ? value.releaseYearHint : null,
    confidence: typeof value.confidence === 'number' ? value.confidence : 0,
    notes: typeof value.notes === 'string' ? value.notes : null,
    identified: value.identified === true,
  }
}

export async function recognizeCover(
  client: BrowserSupabaseClient,
  imageDataUrl: string,
): Promise<CoverRecognition> {
  const accessToken = await getAccessToken(client)
  const response = await fetch('/api/catalog/recognize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64: imageDataUrl }),
  })

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const code = isRecord(payload) && isRecognitionErrorCode(payload.code)
      ? payload.code
      : 'unknown'
    const message = isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : 'Photo recognition failed. Please try again.'

    throw new RecognitionError(code, message)
  }

  if (!isRecord(payload) || !isRecord(payload.recognition)) {
    throw new RecognitionError(
      'provider_bad_response',
      'Photo recognition returned an unexpected response.',
    )
  }

  return normalizeRecognition(payload.recognition)
}
