import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { recognizeCoverWithOpenRouter } from '../../../src/lib/vision/openrouter.ts'
import {
  DEFAULT_VISION_MODEL,
  RECOGNITION_FEATURE,
  RecognitionError,
  SUPPORTED_IMAGE_MIME_TYPES,
  type CoverRecognition,
  type RecognitionErrorCode,
  type SupportedImageMimeType,
} from '../../../src/lib/vision/types.ts'

const OPENROUTER_PROVIDER = 'openrouter'

// Conservative decoded-image cap. Well below Netlify's ~4.5 MB effective binary
// request payload; the browser downscales to a small fraction of this.
const MAX_IMAGE_BYTES = 3_000_000
const MIN_IMAGE_BYTES = 64

const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/

type Environment = Partial<Record<string, string>>

type SupabaseFactory = typeof createClient

type AuthenticatedUser = Pick<User, 'id'>

type ModelCallRecord = {
  userId: string
  model: string
  success: boolean
  latencyMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  estimatedCostUsd: number | null
  errorCategory: RecognitionErrorCode | null
}

export type RecognitionFunctionDependencies = {
  createClient: SupabaseFactory
  recognizeCover: typeof recognizeCoverWithOpenRouter
  recordModelCall: (
    env: Environment,
    createClientImpl: SupabaseFactory,
    record: ModelCallRecord,
  ) => Promise<void>
  now: () => number
}

type RecognitionResponsePayload =
  | { recognition: CoverRecognition }
  | { code: RecognitionErrorCode; message: string }

function jsonResponse(payload: RecognitionResponsePayload, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function errorResponse(code: RecognitionErrorCode, message: string): Response {
  const statusByCode: Record<RecognitionErrorCode, number> = {
    unauthorized: 401,
    invalid_query: 400,
    unsupported_media_type: 415,
    image_too_large: 413,
    provider_rate_limited: 503,
    provider_unavailable: 502,
    provider_timeout: 504,
    provider_bad_response: 502,
    config_error: 500,
    unknown: 500,
  }

  return jsonResponse({ code, message }, statusByCode[code])
}

function requiredEnv(env: Environment, key: string): string {
  const value = env[key]?.trim()

  if (!value) {
    throw new RecognitionError(
      'config_error',
      'Photo recognition is not configured.',
    )
  }

  return value
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(/\s+/, 2)

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new RecognitionError(
      'unauthorized',
      'Sign in to use photo recognition.',
    )
  }

  return token
}

async function authenticateRequest(
  request: Request,
  env: Environment,
  createClientImpl: SupabaseFactory,
): Promise<AuthenticatedUser> {
  const supabaseUrl = requiredEnv(env, 'VITE_SUPABASE_URL')
  const publishableKey = requiredEnv(env, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  const token = bearerToken(request)
  const authClient = createClientImpl(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user) {
    throw new RecognitionError(
      'unauthorized',
      'Sign in to use photo recognition.',
    )
  }

  return { id: data.user.id }
}

function magicNumberMimeType(bytes: Uint8Array): SupportedImageMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

async function parseRecognizeRequest(request: Request): Promise<string> {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    throw new RecognitionError('invalid_query', 'Send the image as JSON.')
  }

  if (
    typeof payload !== 'object'
    || payload === null
    || Array.isArray(payload)
    || Object.keys(payload).length !== 1
    || typeof (payload as Record<string, unknown>).imageBase64 !== 'string'
  ) {
    throw new RecognitionError(
      'invalid_query',
      'The recognition request must contain only an image.',
    )
  }

  const imageDataUrl = (payload as Record<string, string>).imageBase64
  const match = DATA_URL_PATTERN.exec(imageDataUrl)

  if (!match) {
    throw new RecognitionError(
      'unsupported_media_type',
      `Use a ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')} image.`,
    )
  }

  const declaredMime = match[1] as SupportedImageMimeType
  let bytes: Uint8Array

  try {
    bytes = new Uint8Array(Buffer.from(match[2], 'base64'))
  } catch {
    throw new RecognitionError('unsupported_media_type', 'The image could not be read.')
  }

  if (bytes.length < MIN_IMAGE_BYTES) {
    throw new RecognitionError('unsupported_media_type', 'The image could not be read.')
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new RecognitionError(
      'image_too_large',
      'That image is too large. Try a smaller photo.',
    )
  }

  if (magicNumberMimeType(bytes) !== declaredMime) {
    throw new RecognitionError(
      'unsupported_media_type',
      'That file does not look like a supported image.',
    )
  }

  return imageDataUrl
}

async function recordModelCallWithServiceRole(
  env: Environment,
  createClientImpl: SupabaseFactory,
  record: ModelCallRecord,
): Promise<void> {
  const supabaseUrl = requiredEnv(env, 'VITE_SUPABASE_URL')
  const serviceRoleKey = requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const serviceClient = createClientImpl(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await serviceClient.from('model_calls').insert({
    user_id: record.userId,
    feature: RECOGNITION_FEATURE,
    provider: OPENROUTER_PROVIDER,
    model: record.model,
    success: record.success,
    latency_ms: record.latencyMs,
    prompt_tokens: record.promptTokens,
    completion_tokens: record.completionTokens,
    estimated_cost_usd: record.estimatedCostUsd,
    error_category: record.errorCategory,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function safeRecordModelCall(
  dependencies: RecognitionFunctionDependencies,
  env: Environment,
  record: ModelCallRecord,
): Promise<void> {
  try {
    await dependencies.recordModelCall(env, dependencies.createClient, record)
  } catch {
    // Telemetry must never fail the user's request. Log the category only,
    // never the image, prompt, or provider payload.
    console.warn(
      `model_calls telemetry insert failed (category=${record.errorCategory ?? 'ok'})`,
    )
  }
}

function defaultDependencies(): RecognitionFunctionDependencies {
  return {
    createClient,
    recognizeCover: recognizeCoverWithOpenRouter,
    recordModelCall: recordModelCallWithServiceRole,
    now: () => Date.now(),
  }
}

function mapThrownError(error: unknown): Response {
  if (error instanceof RecognitionError) {
    return errorResponse(error.code, error.message)
  }

  return errorResponse('unknown', 'Photo recognition failed. Please try again.')
}

export async function handleCatalogRecognize(
  request: Request,
  env: Environment = process.env,
  dependencies: RecognitionFunctionDependencies = defaultDependencies(),
): Promise<Response> {
  try {
    const user = await authenticateRequest(request, env, dependencies.createClient)
    const imageDataUrl = await parseRecognizeRequest(request)
    const apiKey = requiredEnv(env, 'OPENROUTER_API_KEY')
    const model = env.OPENROUTER_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL

    const startedAt = dependencies.now()

    let result: Awaited<ReturnType<typeof recognizeCoverWithOpenRouter>>

    try {
      result = await dependencies.recognizeCover({
        imageDataUrl,
        apiKey,
        model,
        appUrl: env.OPENROUTER_APP_URL,
        appTitle: env.OPENROUTER_APP_TITLE,
      })
    } catch (error) {
      const errorCategory =
        error instanceof RecognitionError ? error.code : 'unknown'

      await safeRecordModelCall(dependencies, env, {
        userId: user.id,
        model,
        success: false,
        latencyMs: dependencies.now() - startedAt,
        promptTokens: null,
        completionTokens: null,
        estimatedCostUsd: null,
        errorCategory,
      })

      throw error
    }

    await safeRecordModelCall(dependencies, env, {
      userId: user.id,
      model: result.model,
      success: true,
      latencyMs: dependencies.now() - startedAt,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      estimatedCostUsd: result.usage.estimatedCostUsd,
      errorCategory: null,
    })

    return jsonResponse({ recognition: result.recognition })
  } catch (error) {
    return mapThrownError(error)
  }
}
