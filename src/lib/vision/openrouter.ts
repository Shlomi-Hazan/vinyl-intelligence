import {
  DEFAULT_VISION_MODEL,
  RecognitionError,
  type CoverRecognition,
} from './types.ts'

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_OUTPUT_TOKENS = 400

const MAX_TEXT_LENGTH = 200
const MAX_NOTES_LENGTH = 240
const MAX_VISIBLE_TEXT_ITEMS = 12
const MAX_VISIBLE_TEXT_LENGTH = 120
const RELEASE_YEAR_MIN = 1900

// Per-1M-token listed pricing (see docs/decisions/0003-openrouter-vision-provider.md).
// For both models the text-input and image-input rates are equal, so a
// prompt-token estimate at the input rate covers the image tokens too.
const MODEL_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  'google/gemini-3.1-flash-lite': { inputPerMillion: 0.25, outputPerMillion: 1.5 },
  'google/gemini-3.5-flash': { inputPerMillion: 1.5, outputPerMillion: 9 },
}

const RECOGNITION_JSON_SCHEMA = {
  name: 'cover_recognition',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'artist',
      'albumTitle',
      'visibleText',
      'label',
      'catalogNumber',
      'releaseYearHint',
      'confidence',
      'notes',
      'identified',
    ],
    properties: {
      artist: { type: ['string', 'null'] },
      albumTitle: { type: ['string', 'null'] },
      visibleText: { type: 'array', items: { type: 'string' } },
      label: { type: ['string', 'null'] },
      catalogNumber: { type: ['string', 'null'] },
      releaseYearHint: { type: ['integer', 'null'] },
      confidence: { type: 'number' },
      notes: { type: ['string', 'null'] },
      identified: { type: 'boolean' },
    },
  },
} as const

const RECOGNITION_PROMPT = [
  'You are analyzing a single photograph of a physical music record cover',
  '(typically a vinyl LP sleeve). Extract only information that is actually',
  'visible in the image. Return JSON that matches the provided schema.',
  'Set "identified" to false if the photo is not a music record cover or is too',
  'blurry, dark, or cropped to read. Only fill "label", "catalogNumber", or',
  '"releaseYearHint" when that value is printed on the cover; otherwise use null.',
  '"visibleText" is a short list of distinct text lines you can read on the',
  'cover. "confidence" is your own 0..1 estimate and is advisory only.',
  'Do not guess or invent metadata.',
].join(' ')

export type VisionFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export type VisionUsage = {
  promptTokens: number | null
  completionTokens: number | null
  estimatedCostUsd: number | null
}

export type RecognizeCoverOptions = {
  imageDataUrl: string
  apiKey: string
  model?: string
  fetchImpl?: VisionFetch
  timeoutMs?: number
  appUrl?: string
  appTitle?: string
}

export type RecognizeCoverResult = {
  recognition: CoverRecognition
  usage: VisionUsage
  model: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim().slice(0, maxLength).trim()

  return trimmed.length > 0 ? trimmed : null
}

function normalizeVisibleText(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const lines: string[] = []

  for (const entry of value) {
    const line = cleanText(entry, MAX_VISIBLE_TEXT_LENGTH)

    if (line && !seen.has(line.toLowerCase())) {
      seen.add(line.toLowerCase())
      lines.push(line)
    }

    if (lines.length >= MAX_VISIBLE_TEXT_ITEMS) {
      break
    }
  }

  return lines
}

function normalizeReleaseYearHint(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  const year = Math.trunc(value)
  const maxYear = new Date().getUTCFullYear() + 1

  return year >= RELEASE_YEAR_MIN && year <= maxYear ? year : null
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

/**
 * Strict field-level validation of the untrusted structured model output.
 * Every field in the CoverRecognition contract must be present with the right
 * type; a missing or wrongly typed required field is rejected rather than
 * silently coerced. Unknown extra fields are ignored during normalization.
 */
function assertRecognitionContract(raw: Record<string, unknown>): void {
  const reject = (): never => {
    throw new RecognitionError(
      'provider_bad_response',
      'The recognition service returned data in an unexpected shape.',
    )
  }

  for (const key of ['artist', 'albumTitle', 'label', 'catalogNumber', 'notes']) {
    if (!(key in raw) || !isStringOrNull(raw[key])) {
      reject()
    }
  }

  if (
    !('visibleText' in raw)
    || !Array.isArray(raw.visibleText)
    || !raw.visibleText.every((entry) => typeof entry === 'string')
  ) {
    reject()
  }

  if (
    !('releaseYearHint' in raw)
    || !(
      raw.releaseYearHint === null
      || (typeof raw.releaseYearHint === 'number' && Number.isFinite(raw.releaseYearHint))
    )
  ) {
    reject()
  }

  if (
    !('confidence' in raw)
    || typeof raw.confidence !== 'number'
    || !Number.isFinite(raw.confidence)
  ) {
    reject()
  }

  if (!('identified' in raw) || typeof raw.identified !== 'boolean') {
    reject()
  }
}

function normalizeRecognition(raw: unknown): CoverRecognition {
  if (!isRecord(raw)) {
    throw new RecognitionError(
      'provider_bad_response',
      'The recognition service returned an unexpected result.',
    )
  }

  assertRecognitionContract(raw)

  return {
    artist: cleanText(raw.artist, MAX_TEXT_LENGTH),
    albumTitle: cleanText(raw.albumTitle, MAX_TEXT_LENGTH),
    visibleText: normalizeVisibleText(raw.visibleText),
    label: cleanText(raw.label, MAX_TEXT_LENGTH),
    catalogNumber: cleanText(raw.catalogNumber, MAX_TEXT_LENGTH),
    releaseYearHint: normalizeReleaseYearHint(raw.releaseYearHint),
    confidence: normalizeConfidence(raw.confidence),
    notes: cleanText(raw.notes, MAX_NOTES_LENGTH),
    identified: raw.identified === true,
  }
}

function estimateCostUsd(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
  reportedCost: unknown,
): number | null {
  if (typeof reportedCost === 'number' && Number.isFinite(reportedCost) && reportedCost >= 0) {
    return Number(reportedCost.toFixed(6))
  }

  const pricing = MODEL_PRICING[model]

  if (!pricing || promptTokens === null || completionTokens === null) {
    return null
  }

  const cost =
    (promptTokens / 1_000_000) * pricing.inputPerMillion
    + (completionTokens / 1_000_000) * pricing.outputPerMillion

  return Number(cost.toFixed(6))
}

function readTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null
}

function extractContentString(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new RecognitionError(
      'provider_bad_response',
      'The recognition service returned an unexpected result.',
    )
  }

  const message = isRecord(payload.choices[0])
    ? (payload.choices[0] as Record<string, unknown>).message
    : null
  const content = isRecord(message) ? message.content : null

  if (typeof content === 'string') {
    return content
  }

  // Some providers return content as an array of parts.
  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        isRecord(part) && typeof part.text === 'string' ? part.text : '',
      )
      .join('')

    if (text.trim().length > 0) {
      return text
    }
  }

  throw new RecognitionError(
    'provider_bad_response',
    'The recognition service returned an empty result.',
  )
}

/**
 * Calls OpenRouter exactly once with one image and a strict JSON-schema
 * response format, then validates and normalizes the structured clues.
 * The API key, prompt, and raw provider payload never leave this function.
 */
export async function recognizeCoverWithOpenRouter({
  imageDataUrl,
  apiKey,
  model = DEFAULT_VISION_MODEL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  appUrl,
  appTitle,
}: RecognizeCoverOptions): Promise<RecognizeCoverResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  if (appUrl) {
    headers['HTTP-Referer'] = appUrl
  }

  if (appTitle) {
    headers['X-Title'] = appTitle
  }

  try {
    const response = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        // OpenRouter returns usage accounting automatically; an explicit
        // usage.include flag is deprecated and has no effect.
        response_format: { type: 'json_schema', json_schema: RECOGNITION_JSON_SCHEMA },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: RECOGNITION_PROMPT },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    })

    if (response.status === 429 || response.status === 503) {
      throw new RecognitionError(
        'provider_rate_limited',
        'The recognition service is busy. Try again in a moment.',
      )
    }

    if (!response.ok) {
      throw new RecognitionError(
        'provider_unavailable',
        'The recognition service is unavailable. Try again later.',
      )
    }

    let payload: unknown

    try {
      payload = await response.json()
    } catch {
      throw new RecognitionError(
        'provider_bad_response',
        'The recognition service returned an unreadable result.',
      )
    }

    const contentString = extractContentString(payload)

    let parsedContent: unknown

    try {
      parsedContent = JSON.parse(contentString)
    } catch {
      throw new RecognitionError(
        'provider_bad_response',
        'The recognition service returned malformed data.',
      )
    }

    const recognition = normalizeRecognition(parsedContent)

    const usageRecord = isRecord(payload) && isRecord(payload.usage) ? payload.usage : null
    const promptTokens = readTokenCount(usageRecord?.prompt_tokens)
    const completionTokens = readTokenCount(usageRecord?.completion_tokens)

    return {
      recognition,
      model,
      usage: {
        promptTokens,
        completionTokens,
        estimatedCostUsd: estimateCostUsd(
          model,
          promptTokens,
          completionTokens,
          usageRecord?.cost,
        ),
      },
    }
  } catch (error) {
    if (error instanceof RecognitionError) {
      throw error
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new RecognitionError(
        'provider_timeout',
        'The recognition service took too long to respond.',
      )
    }

    throw new RecognitionError(
      'provider_unavailable',
      'The recognition service could not be reached.',
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
