export const RECOGNITION_FEATURE = 'cover_vision' as const

export const DEFAULT_VISION_MODEL = 'google/gemini-3.1-flash-lite'

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]

/**
 * Clues extracted from a record-cover photo by the vision model.
 *
 * Every field is untrusted model output that has been validated and normalized
 * server-side. `label`, `catalogNumber`, and `releaseYearHint` are search hints
 * only and are never written to the database as facts. `confidence` is advisory
 * and never drives an action.
 */
export type CoverRecognition = {
  artist: string | null
  albumTitle: string | null
  visibleText: string[]
  label: string | null
  catalogNumber: string | null
  releaseYearHint: number | null
  confidence: number
  notes: string | null
  identified: boolean
}

export type RecognitionResponse = {
  recognition: CoverRecognition
}

export type RecognitionErrorCode =
  | 'unauthorized'
  | 'invalid_query'
  | 'unsupported_media_type'
  | 'image_too_large'
  // Application-owned per-user throttle on this costed endpoint. Distinct from
  // `provider_rate_limited`, which is OpenRouter returning 429/503.
  | 'rate_limited'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_bad_response'
  | 'config_error'
  | 'unknown'

export class RecognitionError extends Error {
  readonly code: RecognitionErrorCode

  constructor(code: RecognitionErrorCode, message: string) {
    super(message)
    this.name = 'RecognitionError'
    this.code = code
  }
}
