// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import curatorHandler, { config as curatorConfig } from './curator-recommend.mts'
import {
  handleCuratorRecommend,
  type CuratorFunctionDependencies,
} from './_shared/curator-handlers.mts'
import { CuratorError } from '../../src/lib/curator/types.ts'

const env = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  OPENROUTER_API_KEY: 'or-secret',
}

const userId = '00000000-0000-4000-8000-0000000000e1'

function validIntent(overrides: Record<string, unknown> = {}) {
  return {
    includeGenres: [],
    excludeGenres: [],
    decades: [],
    minRating: null,
    favoritesOnly: false,
    neverPlayedOnly: false,
    avoidRecentlyPlayed: false,
    recentDays: null,
    preference: 'none',
    energy: 'any',
    mood: null,
    requestedCount: 3,
    ...overrides,
  }
}

function collectionRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    added_at: '2026-08-01T00:00:00.000Z',
    rating: 4,
    is_favorite: false,
    release: {
      artist: `Artist ${id}`,
      title: `Title ${id}`,
      release_year: 1991,
      genres: ['rock'],
    },
    ...over,
  }
}

type Options = {
  authError?: Error
  collectionRows?: unknown[]
  collectionError?: Error
  eventsError?: Error
  events?: unknown[]
  recentIntentCount?: number
  rateCheckThrows?: boolean
}

function createDependencies(options: Options = {}) {
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.authError ? null : { id: userId } },
        error: options.authError ?? null,
      })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(async () => {
        if (table === 'collection_items') {
          return options.collectionError
            ? { data: null, error: options.collectionError }
            : { data: options.collectionRows ?? [collectionRow('a'), collectionRow('b')], error: null }
        }
        if (table === 'listening_events') {
          return options.eventsError
            ? { data: null, error: options.eventsError }
            : { data: options.events ?? [], error: null }
        }
        return { data: [], error: null }
      }),
    })),
  }

  const extractIntent = vi.fn<CuratorFunctionDependencies['extractIntent']>(async () => ({
    intent: validIntent() as never,
    usage: { promptTokens: 700, completionTokens: 120, estimatedCostUsd: 0.0004 },
    model: 'google/gemini-3.1-flash-lite',
  }))

  const selectRecommendations = vi.fn<CuratorFunctionDependencies['selectRecommendations']>(
    async ({ candidatesById }) => {
      const firstId = [...candidatesById.keys()][0]
      return {
        recommendations: [
          {
            collectionItemId: firstId,
            artist: 'Artist a',
            title: 'Title a',
            year: 1991,
            decade: 1990,
            genres: ['rock'],
            rating: 4,
            favorite: false,
            playCount: 0,
            lastListenedAt: null,
            neverPlayed: true,
            reason: 'a solid pick',
            evidenceKeys: ['genre'],
            isBestMatch: true,
          },
        ],
        usage: { promptTokens: 1400, completionTokens: 220, estimatedCostUsd: 0.004 },
        model: 'google/gemini-3.5-flash',
      }
    },
  )

  const recordModelCall = vi.fn(
    async (
      env: Record<string, string | undefined>,
      record: {
        feature: string
        model: string
        success: boolean
        errorCategory: string | null
        latencyMs: number | null
        usage: unknown
      },
    ) => {
      void env
      void record
    },
  )
  const countRecentIntentCalls = vi.fn(async () => {
    if (options.rateCheckThrows) {
      throw new Error('rate check db down')
    }
    return options.recentIntentCount ?? 0
  })

  const deps: CuratorFunctionDependencies = {
    createClient: vi.fn(() => supabase) as unknown as CuratorFunctionDependencies['createClient'],
    extractIntent,
    selectRecommendations,
    recordModelCall,
    countRecentIntentCalls,
    now: () => 1_800_000_000_000,
  }

  return { deps, extractIntent, selectRecommendations, recordModelCall, countRecentIntentCalls, supabase }
}

function request(body: unknown, headers: Record<string, string> = { authorization: 'Bearer tok' }) {
  return new Request('http://localhost/api/curator/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function run(body: unknown, options?: Options, headers?: Record<string, string>) {
  const ctx = createDependencies(options)
  const response = await handleCuratorRecommend(request(body, headers), env, ctx.deps)
  const json = await response.json()
  return { response, json, ...ctx }
}

describe('curator function - routing', () => {
  it('exports the POST /api/curator/recommend config', () => {
    expect(curatorConfig.path).toBe('/api/curator/recommend')
    expect(curatorConfig.method).toEqual(['POST'])
    expect(typeof curatorHandler).toBe('function')
  })
})

describe('curator function - auth / input', () => {
  it('401 without a bearer token', async () => {
    const { response, json, extractIntent } = await run({ request: 'x' }, {}, {})
    expect(response.status).toBe(401)
    expect(json.code).toBe('unauthorized')
    expect(extractIntent).not.toHaveBeenCalled()
  })

  it('401 when auth.getUser errors', async () => {
    const { response, json } = await run({ request: 'x' }, { authError: new Error('bad jwt') })
    expect(response.status).toBe(401)
    expect(json.code).toBe('unauthorized')
  })

  it('400 for a non-object / extra-key / non-string request', async () => {
    expect((await run('[]')).json.code).toBe('invalid_request')
    expect((await run({ request: 'x', extra: 1 })).json.code).toBe('invalid_request')
    expect((await run({ request: 5 })).json.code).toBe('invalid_request')
  })

  it('400 for a blank request', async () => {
    expect((await run({ request: '   ' })).json.code).toBe('invalid_request')
  })

  it('400 request_too_long over 800 chars', async () => {
    const { response, json } = await run({ request: 'a'.repeat(801) })
    expect(response.status).toBe(400)
    expect(json.code).toBe('request_too_long')
  })

  it('accepts an 800-char request', async () => {
    const { json } = await run({ request: 'a'.repeat(800) })
    expect(json.status).toBe('ok')
  })
})

describe('curator function - zero-cost paths', () => {
  it('empty collection -> empty_collection, 0 provider calls, 0 telemetry', async () => {
    const { json, extractIntent, selectRecommendations, recordModelCall } = await run(
      { request: 'x' },
      { collectionRows: [] },
    )
    expect(json).toEqual({ status: 'empty_collection' })
    expect(extractIntent).not.toHaveBeenCalled()
    expect(selectRecommendations).not.toHaveBeenCalled()
    expect(recordModelCall).not.toHaveBeenCalled()
  })

  it('rate limited -> 429, 0 provider calls, 0 telemetry', async () => {
    const { response, json, extractIntent, recordModelCall } = await run(
      { request: 'x' },
      { recentIntentCount: 10 },
    )
    expect(response.status).toBe(429)
    expect(json.code).toBe('rate_limited')
    expect(extractIntent).not.toHaveBeenCalled()
    expect(recordModelCall).not.toHaveBeenCalled()
  })

  it('rate-check query throws -> fail closed rate_check_failed, 0 provider calls', async () => {
    const { response, json, extractIntent } = await run({ request: 'x' }, { rateCheckThrows: true })
    expect(response.status).toBe(503)
    expect(json.code).toBe('rate_check_failed')
    expect(extractIntent).not.toHaveBeenCalled()
  })

  it('collection load error -> collection_unavailable, 0 provider calls', async () => {
    const { response, json, extractIntent } = await run(
      { request: 'x' },
      { collectionError: new Error('rls') },
    )
    expect(response.status).toBe(503)
    expect(json.code).toBe('collection_unavailable')
    expect(extractIntent).not.toHaveBeenCalled()
  })

  it('listening-events load error -> collection_unavailable', async () => {
    const { json } = await run({ request: 'x' }, { eventsError: new Error('rls') })
    expect(json.code).toBe('collection_unavailable')
  })
})

describe('curator function - normal + no_match', () => {
  it('normal success: 2 provider calls, 2 telemetry rows with the right models', async () => {
    const { json, extractIntent, selectRecommendations, recordModelCall } = await run({ request: 'x' })
    expect(json.status).toBe('ok')
    expect(json.recommendations).toHaveLength(1)
    expect(json.recommendations[0].isBestMatch).toBe(true)
    expect(json.candidateCount).toBe(2)
    expect(extractIntent).toHaveBeenCalledTimes(1)
    expect(selectRecommendations).toHaveBeenCalledTimes(1)
    expect(recordModelCall).toHaveBeenCalledTimes(2)
    const features = recordModelCall.mock.calls.map((c) => c[1].feature)
    expect(features).toEqual(['curator_intent', 'curator_selection'])
    expect(recordModelCall.mock.calls[0][1]).toMatchObject({
      model: 'google/gemini-3.1-flash-lite',
      success: true,
    })
    expect(recordModelCall.mock.calls[1][1]).toMatchObject({
      model: 'google/gemini-3.5-flash',
      success: true,
    })
  })

  it('no candidates after the hard filter -> no_match, 1 provider call, 1 intent row', async () => {
    const ctx = createDependencies()
    ctx.extractIntent.mockResolvedValueOnce({
      intent: validIntent({ includeGenres: ['nonexistent-genre'] }) as never,
      usage: { promptTokens: 700, completionTokens: 120, estimatedCostUsd: 0.0004 },
      model: 'google/gemini-3.1-flash-lite',
    })
    const response = await handleCuratorRecommend(request({ request: 'x' }), env, ctx.deps)
    const json = await response.json()
    expect(json.status).toBe('no_match')
    expect(json.interpretedIntent.includeGenres).toEqual(['nonexistent-genre'])
    expect(ctx.selectRecommendations).not.toHaveBeenCalled()
    expect(ctx.recordModelCall).toHaveBeenCalledTimes(1)
    expect(ctx.recordModelCall.mock.calls[0][1].feature).toBe('curator_intent')
  })
})

describe('curator function - provider failures + telemetry', () => {
  it('intent failure -> failed curator_intent row only, mapped error', async () => {
    const ctx = createDependencies()
    ctx.extractIntent.mockRejectedValueOnce(new CuratorError('provider_timeout', 'slow'))
    const response = await handleCuratorRecommend(request({ request: 'x' }), env, ctx.deps)
    expect(response.status).toBe(504)
    expect((await response.json()).code).toBe('provider_timeout')
    expect(ctx.recordModelCall).toHaveBeenCalledTimes(1)
    expect(ctx.recordModelCall.mock.calls[0][1]).toMatchObject({
      feature: 'curator_intent',
      success: false,
      errorCategory: 'provider_timeout',
    })
    expect(ctx.selectRecommendations).not.toHaveBeenCalled()
  })

  it('selection failure -> success intent row + failed selection row', async () => {
    const ctx = createDependencies()
    ctx.selectRecommendations.mockRejectedValueOnce(
      new CuratorError('provider_bad_response', 'out of set'),
    )
    const response = await handleCuratorRecommend(request({ request: 'x' }), env, ctx.deps)
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe('provider_bad_response')
    const rows = ctx.recordModelCall.mock.calls.map((c) => c[1])
    expect(rows[0]).toMatchObject({ feature: 'curator_intent', success: true })
    expect(rows[1]).toMatchObject({ feature: 'curator_selection', success: false, errorCategory: 'provider_bad_response' })
  })

  it('a telemetry insert failure does not change the response', async () => {
    const ctx = createDependencies()
    ctx.recordModelCall.mockRejectedValue(new Error('telemetry down'))
    const response = await handleCuratorRecommend(request({ request: 'x' }), env, ctx.deps)
    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe('ok')
  })
})

describe('curator function - config', () => {
  it('missing OPENROUTER_API_KEY -> config_error, 0 provider calls', async () => {
    const ctx = createDependencies()
    const response = await handleCuratorRecommend(
      request({ request: 'x' }),
      { ...env, OPENROUTER_API_KEY: '' },
      ctx.deps,
    )
    expect(response.status).toBe(500)
    expect((await response.json()).code).toBe('config_error')
    expect(ctx.extractIntent).not.toHaveBeenCalled()
  })
})
