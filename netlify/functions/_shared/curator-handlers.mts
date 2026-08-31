import { createClient } from '@supabase/supabase-js'
import {
  countRecentModelCallsWithUserToken,
  recordModelCallWithServiceRole,
} from './model-calls.mts'
import {
  buildAllowedCandidateSet,
  deriveCandidateFacts,
  applyHardFilters,
  rankAndCap,
} from '../../../src/lib/curator/candidates.ts'
import {
  extractIntent as extractIntentImpl,
  selectRecommendations as selectRecommendationsImpl,
} from '../../../src/lib/curator/openrouterCurator.ts'
import {
  CURATOR_INTENT_FEATURE,
  CURATOR_SELECTION_FEATURE,
  CuratorError,
  DEFAULT_CURATOR_INTENT_MODEL,
  DEFAULT_CURATOR_SELECTION_MODEL,
  MAX_REQUEST_LENGTH,
  OPENROUTER_PROVIDER,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MINUTES,
  type CuratorCollectionItem,
  type CuratorErrorCode,
  type CuratorListeningEvent,
  type CuratorResult,
  type CuratorUsage,
} from '../../../src/lib/curator/types.ts'

type Environment = Partial<Record<string, string>>
type SupabaseFactory = typeof createClient

type AuthenticatedContext = { userId: string; token: string }

type TelemetryRecord = {
  userId: string
  feature: typeof CURATOR_INTENT_FEATURE | typeof CURATOR_SELECTION_FEATURE
  model: string
  success: boolean
  latencyMs: number | null
  usage: CuratorUsage | null
  errorCategory: CuratorErrorCode | null
}

export type CuratorFunctionDependencies = {
  createClient: SupabaseFactory
  extractIntent: typeof extractIntentImpl
  selectRecommendations: typeof selectRecommendationsImpl
  recordModelCall: (env: Environment, record: TelemetryRecord) => Promise<void>
  countRecentIntentCalls: (
    env: Environment,
    args: { token: string; userId: string; windowStartIso: string },
  ) => Promise<number>
  now: () => number
}

type CuratorResponsePayload = CuratorResult | { code: CuratorErrorCode; message: string }

function jsonResponse(payload: CuratorResponsePayload, status = 200): Response {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

const STATUS_BY_CODE: Record<CuratorErrorCode, number> = {
  unauthorized: 401,
  invalid_request: 400,
  request_too_long: 400,
  rate_limited: 429,
  rate_check_failed: 503,
  collection_unavailable: 503,
  provider_rate_limited: 503,
  provider_unavailable: 502,
  provider_timeout: 504,
  provider_bad_response: 502,
  config_error: 500,
  unknown: 500,
}

function errorResponse(code: CuratorErrorCode, message: string): Response {
  return jsonResponse({ code, message }, STATUS_BY_CODE[code])
}

function requiredEnv(env: Environment, key: string): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new CuratorError('config_error', 'The curator is not configured.')
  }
  return value
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(/\s+/, 2)
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new CuratorError('unauthorized', 'Sign in to use the curator.')
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
    throw new CuratorError('unauthorized', 'Sign in to use the curator.')
  }
  return { userId: data.user.id, token }
}

async function parseCuratorRequestBody(request: Request): Promise<string> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    throw new CuratorError('invalid_request', 'Send the request as JSON.')
  }

  if (
    typeof payload !== 'object'
    || payload === null
    || Array.isArray(payload)
    || Object.keys(payload).length !== 1
    || typeof (payload as Record<string, unknown>).request !== 'string'
  ) {
    throw new CuratorError('invalid_request', 'The curator request must contain only a "request" string.')
  }

  const text = ((payload as Record<string, string>).request).trim()
  if (text.length === 0) {
    throw new CuratorError('invalid_request', 'Enter a request for the curator.')
  }
  if (text.length > MAX_REQUEST_LENGTH) {
    throw new CuratorError('request_too_long', `Keep the request under ${MAX_REQUEST_LENGTH} characters.`)
  }
  return text
}

async function enforceRateLimit(
  deps: CuratorFunctionDependencies,
  env: Environment,
  { token, userId }: AuthenticatedContext,
): Promise<void> {
  const windowStartIso = new Date(
    deps.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000,
  ).toISOString()

  let recent: number
  try {
    recent = await deps.countRecentIntentCalls(env, { token, userId, windowStartIso })
  } catch {
    throw new CuratorError(
      'rate_check_failed',
      'Could not verify the curator rate limit. Please try again.',
    )
  }

  if (recent >= RATE_LIMIT_MAX) {
    throw new CuratorError('rate_limited', 'Too many curator requests. Try again in a few minutes.')
  }
}

type CuratorCollectionRow = {
  id: string
  added_at: string
  rating: number | null
  is_favorite: boolean
  release:
    | { artist: string; title: string; release_year: number | null; genres: string[] | null }
    | { artist: string; title: string; release_year: number | null; genres: string[] | null }[]
    | null
}

function normalizeCollectionRow(row: CuratorCollectionRow): CuratorCollectionItem {
  const release = Array.isArray(row.release) ? row.release[0] : row.release
  if (!release) {
    throw new CuratorError('collection_unavailable', 'A record is missing its metadata.')
  }
  return {
    id: row.id,
    added_at: row.added_at,
    rating: typeof row.rating === 'number' ? row.rating : null,
    is_favorite: row.is_favorite === true,
    artist: release.artist,
    title: release.title,
    release_year: typeof release.release_year === 'number' ? release.release_year : null,
    genres: Array.isArray(release.genres) ? release.genres : [],
  }
}

async function loadOwnedCollection(
  env: Environment,
  createClientImpl: SupabaseFactory,
  { token }: AuthenticatedContext,
): Promise<{ items: CuratorCollectionItem[]; events: CuratorListeningEvent[] }> {
  const supabaseUrl = requiredEnv(env, 'VITE_SUPABASE_URL')
  const publishableKey = requiredEnv(env, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  const userClient = createClientImpl(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // `notes` is deliberately NOT selected - it is never curator model context.
  const itemsResult = await userClient
    .from('collection_items')
    .select(
      'id, added_at, rating, is_favorite, release:releases!inner(artist, title, release_year, genres)',
    )
  if (itemsResult.error) {
    throw new CuratorError('collection_unavailable', 'Could not load your collection. Please try again.')
  }

  const eventsResult = await userClient
    .from('listening_events')
    .select('collection_item_id, listened_at')
  if (eventsResult.error) {
    throw new CuratorError('collection_unavailable', 'Could not load your listening history. Please try again.')
  }

  const items = (itemsResult.data ?? []).map((row) =>
    normalizeCollectionRow(row as unknown as CuratorCollectionRow),
  )
  const events = (eventsResult.data ?? []) as CuratorListeningEvent[]
  return { items, events }
}

async function defaultRecordModelCall(
  env: Environment,
  record: TelemetryRecord,
): Promise<void> {
  await recordModelCallWithServiceRole(
    createClient,
    {
      supabaseUrl: requiredEnv(env, 'VITE_SUPABASE_URL'),
      serviceRoleKey: requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    },
    {
      userId: record.userId,
      feature: record.feature,
      provider: OPENROUTER_PROVIDER,
      model: record.model,
      success: record.success,
      latencyMs: record.latencyMs,
      promptTokens: record.usage?.promptTokens ?? null,
      completionTokens: record.usage?.completionTokens ?? null,
      estimatedCostUsd: record.usage?.estimatedCostUsd ?? null,
      errorCategory: record.errorCategory,
    },
  )
}

async function safeRecordModelCall(
  deps: CuratorFunctionDependencies,
  env: Environment,
  record: TelemetryRecord,
): Promise<void> {
  try {
    await deps.recordModelCall(env, record)
  } catch {
    // Telemetry must never fail the user's request. Log the category only.
    console.warn(
      `model_calls telemetry insert failed (feature=${record.feature}, category=${record.errorCategory ?? 'ok'})`,
    )
  }
}

function defaultDependencies(): CuratorFunctionDependencies {
  return {
    createClient,
    extractIntent: extractIntentImpl,
    selectRecommendations: selectRecommendationsImpl,
    recordModelCall: defaultRecordModelCall,
    countRecentIntentCalls: (env, { token, userId, windowStartIso }) =>
      countRecentModelCallsWithUserToken(createClient, {
        supabaseUrl: requiredEnv(env, 'VITE_SUPABASE_URL'),
        publishableKey: requiredEnv(env, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
        token,
        userId,
        feature: CURATOR_INTENT_FEATURE,
        windowStartIso,
      }),
    now: () => Date.now(),
  }
}

function categoryFor(error: unknown): CuratorErrorCode {
  return error instanceof CuratorError ? error.code : 'unknown'
}

function mapThrownError(error: unknown): Response {
  if (error instanceof CuratorError) {
    return errorResponse(error.code, error.message)
  }
  return errorResponse('unknown', 'The curator failed. Please try again.')
}

export async function handleCuratorRecommend(
  request: Request,
  env: Environment = process.env,
  deps: CuratorFunctionDependencies = defaultDependencies(),
): Promise<Response> {
  try {
    const context = await authenticateRequest(request, env, deps.createClient)
    const userRequest = await parseCuratorRequestBody(request)
    await enforceRateLimit(deps, env, context)

    const { items, events } = await loadOwnedCollection(env, deps.createClient, context)
    if (items.length === 0) {
      return jsonResponse({ status: 'empty_collection' })
    }

    const apiKey = requiredEnv(env, 'OPENROUTER_API_KEY')
    const intentModel = env.OPENROUTER_CURATOR_INTENT_MODEL?.trim() || DEFAULT_CURATOR_INTENT_MODEL
    const selectionModel =
      env.OPENROUTER_CURATOR_SELECTION_MODEL?.trim() || DEFAULT_CURATOR_SELECTION_MODEL
    const appUrl = env.OPENROUTER_APP_URL
    const appTitle = env.OPENROUTER_APP_TITLE

    // ---- LLM call #1: intent ------------------------------------------------
    const intentStartedAt = deps.now()
    let intentResult: Awaited<ReturnType<typeof extractIntentImpl>>
    try {
      intentResult = await deps.extractIntent({
        request: userRequest,
        apiKey,
        model: intentModel,
        appUrl,
        appTitle,
      })
    } catch (error) {
      await safeRecordModelCall(deps, env, {
        userId: context.userId,
        feature: CURATOR_INTENT_FEATURE,
        model: intentModel,
        success: false,
        latencyMs: deps.now() - intentStartedAt,
        usage: null,
        errorCategory: categoryFor(error),
      })
      throw error
    }
    await safeRecordModelCall(deps, env, {
      userId: context.userId,
      feature: CURATOR_INTENT_FEATURE,
      model: intentResult.model,
      success: true,
      latencyMs: deps.now() - intentStartedAt,
      usage: intentResult.usage,
      errorCategory: null,
    })

    const intent = intentResult.intent

    // ---- deterministic middle --------------------------------------------
    const now = deps.now()
    const withFacts = deriveCandidateFacts(items, events)
    const filtered = applyHardFilters(withFacts, intent, now)
    if (filtered.length === 0) {
      return jsonResponse({ status: 'no_match', interpretedIntent: intent })
    }
    const ranked = rankAndCap(filtered, intent, now)
    const { facts, ids, byId } = buildAllowedCandidateSet(ranked, now)

    // ---- LLM call #2: selection -----------------------------------------
    const selectionStartedAt = deps.now()
    let selectionResult: Awaited<ReturnType<typeof selectRecommendationsImpl>>
    try {
      selectionResult = await deps.selectRecommendations({
        request: userRequest,
        candidateFacts: facts,
        allowedIds: ids,
        candidatesById: byId,
        requestedCount: intent.requestedCount,
        apiKey,
        model: selectionModel,
        appUrl,
        appTitle,
      })
    } catch (error) {
      await safeRecordModelCall(deps, env, {
        userId: context.userId,
        feature: CURATOR_SELECTION_FEATURE,
        model: selectionModel,
        success: false,
        latencyMs: deps.now() - selectionStartedAt,
        usage: null,
        errorCategory: categoryFor(error),
      })
      throw error
    }
    await safeRecordModelCall(deps, env, {
      userId: context.userId,
      feature: CURATOR_SELECTION_FEATURE,
      model: selectionResult.model,
      success: true,
      latencyMs: deps.now() - selectionStartedAt,
      usage: selectionResult.usage,
      errorCategory: null,
    })

    return jsonResponse({
      status: 'ok',
      interpretedIntent: intent,
      candidateCount: filtered.length,
      recommendations: selectionResult.recommendations,
    })
  } catch (error) {
    return mapThrownError(error)
  }
}
