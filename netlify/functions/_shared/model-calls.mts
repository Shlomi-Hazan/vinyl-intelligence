import { createClient } from '@supabase/supabase-js'

/**
 * Shared `model_calls` telemetry helpers for the AI Netlify Functions.
 *
 * - Reads (rate-limit counting) go through the authenticated user's bearer
 *   token + RLS own-row SELECT policy. Never the service role.
 * - Writes go through the service role, which has INSERT-only on `model_calls`
 *   (mirroring the Milestone 4/5 server persistence boundary).
 *
 * These functions take already-resolved credential strings so each caller keeps
 * its own env-validation and error type (RecognitionError / CuratorError).
 */

export type SupabaseFactory = typeof createClient

export type ModelCallTelemetry = {
  userId: string
  feature: string
  provider: string
  model: string
  success: boolean
  latencyMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  estimatedCostUsd: number | null
  errorCategory: string | null
}

/**
 * Counts the user's own recent `model_calls` rows for one feature, through the
 * already-validated bearer token (RLS restricts the result to `auth.uid()`'s
 * rows). Throws on a query error so the caller can fail closed.
 */
export async function countRecentModelCallsWithUserToken(
  createClientImpl: SupabaseFactory,
  args: {
    supabaseUrl: string
    publishableKey: string
    token: string
    userId: string
    feature: string
    windowStartIso: string
  },
): Promise<number> {
  const userClient = createClientImpl(args.supabaseUrl, args.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${args.token}` } },
  })

  const { count, error } = await userClient
    .from('model_calls')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', args.userId)
    .eq('feature', args.feature)
    .gte('created_at', args.windowStartIso)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

/** Inserts one telemetry row with the service role. Throws on insert error. */
export async function recordModelCallWithServiceRole(
  createClientImpl: SupabaseFactory,
  args: { supabaseUrl: string; serviceRoleKey: string },
  record: ModelCallTelemetry,
): Promise<void> {
  const serviceClient = createClientImpl(args.supabaseUrl, args.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await serviceClient.from('model_calls').insert({
    user_id: record.userId,
    feature: record.feature,
    provider: record.provider,
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
