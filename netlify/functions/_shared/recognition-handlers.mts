import { createClient } from '@supabase/supabase-js'
import {
  countRecentModelCallsWithUserToken,
  recordModelCallWithServiceRole as recordModelCallShared,
} from './model-calls.mts'
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

// Minimal per-user abuse/rate guard for this costed endpoint (intent.txt §15).
// Counted against the durable model_calls telemetry: if the authenticated user
// already made >= MAX_RECOGNITIONS_PER_WINDOW cover_vision provider attempts
// (success or failure) in the trailing WINDOW, the request is rejected before
// any OpenRouter call and no telemetry row is written.
const MAX_RECOGNITIONS_PER_WINDOW = 10
const RATE_LIMIT_WINDOW_MINUTES = 10

const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/

type Environment = Partial<Record<string, string>>

type SupabaseFactory = typeof createClient

type AuthenticatedContext = {
  userId: string
  // The already-validated Supabase bearer token, reused to read the user's own
  // model_calls rows through the authenticated SELECT policy (RLS). Never used
  // to widen privileges and never logged.
  token: string
}

export type RecentRecognitionQuery = {
  token: string
  userId: string
  windowStartIso: string
}

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
  countRecentRecognitionAttempts: (
    env: Environment,
    createClientImpl: SupabaseFactory,
    query: RecentRecognitionQuery,
  ) => Promise<number>
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
    rate_limited: 429,
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
): Promise<AuthenticatedContext> {
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

  return { userId: data.user.id, token }
}

/**
 * Counts the user's own recent `cover_vision` telemetry rows through the
 * authenticated SELECT policy (RLS restricts the result to `auth.uid()`'s
 * rows). Uses the already-validated bearer token; never the service role, so
 * this check does not require widening `service_role` privileges.
 */
export async function countRecentRecognitionAttemptsWithUserToken(
  env: Environment,
  createClientImpl: SupabaseFactory,
  { token, userId, windowStartIso }: RecentRecognitionQuery,
): Promise<number> {
  return countRecentModelCallsWithUserToken(createClientImpl, {
    supabaseUrl: requiredEnv(env, 'VITE_SUPABASE_URL'),
    publishableKey: requiredEnv(env, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
    token,
    userId,
    feature: RECOGNITION_FEATURE,
    windowStartIso,
  })
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
  await recordModelCallShared(
    createClientImpl,
    {
      supabaseUrl: requiredEnv(env, 'VITE_SUPABASE_URL'),
      serviceRoleKey: requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    },
    {
      userId: record.userId,
      feature: RECOGNITION_FEATURE,
      provider: OPENROUTER_PROVIDER,
      model: record.model,
      success: record.success,
      latencyMs: record.latencyMs,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      estimatedCostUsd: record.estimatedCostUsd,
      errorCategory: record.errorCategory,
    },
  )
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

/**
 * Application-owned per-user throttle, enforced before any OpenRouter call. A
 * request rejected here makes no provider call and writes no model_calls row.
 * If the rate-check query itself fails, the request fails closed (no provider
 * call) rather than silently assuming a decision was made.
 */
async function enforceRecognitionRateLimit(
  dependencies: RecognitionFunctionDependencies,
  env: Environment,
  { token, userId }: { token: string; userId: string },
): Promise<void> {
  const windowStartIso = new Date(
    dependencies.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000,
  ).toISOString()

  let recentAttempts: number

  try {
    recentAttempts = await dependencies.countRecentRecognitionAttempts(
      env,
      dependencies.createClient,
      { token, userId, windowStartIso },
    )
  } catch {
    throw new RecognitionError(
      'unknown',
      'Could not verify the recognition rate limit. Please try again.',
    )
  }

  if (recentAttempts >= MAX_RECOGNITIONS_PER_WINDOW) {
    throw new RecognitionError(
      'rate_limited',
      'Too many recognition attempts. Try again in a few minutes.',
    )
  }
}

function defaultDependencies(): RecognitionFunctionDependencies {
  return {
    createClient,
    recognizeCover: recognizeCoverWithOpenRouter,
    recordModelCall: recordModelCallWithServiceRole,
    countRecentRecognitionAttempts: countRecentRecognitionAttemptsWithUserToken,
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
    const { userId, token } = await authenticateRequest(
      request,
      env,
      dependencies.createClient,
    )

    await enforceRecognitionRateLimit(dependencies, env, { token, userId })

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
        userId,
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
      userId,
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
