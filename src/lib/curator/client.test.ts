import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestCuratorRecommendation } from './client.ts'
import { CuratorError } from './types.ts'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

function client(token: string | null = 'tok'): BrowserSupabaseClient {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: token ? { access_token: token } : null },
        error: null,
      })),
    },
  } as unknown as BrowserSupabaseClient
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestCuratorRecommendation', () => {
  it('posts the trimmed request with a bearer token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'empty_collection' }),
    )
    await requestCuratorRecommendation(client('abc'), 'give me jazz')
    const [, init] = fetchSpy.mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer abc')
    expect(JSON.parse(init?.body as string)).toEqual({ request: 'give me jazz' })
  })

  it('throws unauthorized when there is no session', async () => {
    await expect(requestCuratorRecommendation(client(null), 'x')).rejects.toMatchObject({
      code: 'unauthorized',
    })
  })

  it('maps a non-OK { code, message } body to a CuratorError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'rate_limited', message: 'slow down' }, 429),
    )
    const err = await requestCuratorRecommendation(client(), 'x').catch((e) => e)
    expect(err).toBeInstanceOf(CuratorError)
    expect(err.code).toBe('rate_limited')
    expect(err.message).toBe('slow down')
  })

  it('normalizes an ok result and its recommendations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'ok',
        interpretedIntent: { includeGenres: ['jazz'] },
        candidateCount: 4,
        recommendations: [
          {
            collectionItemId: 'a',
            artist: 'Miles Davis',
            title: 'Kind of Blue',
            year: 1959,
            decade: 1950,
            genres: ['jazz'],
            rating: 5,
            favorite: true,
            playCount: 1,
            lastListenedAt: null,
            neverPlayed: false,
            reason: 'a jazz landmark',
            evidenceKeys: ['genre', 'bogus'],
            isBestMatch: true,
          },
        ],
      }),
    )
    const result = await requestCuratorRecommendation(client(), 'jazz')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') {
      return
    }
    expect(result.candidateCount).toBe(4)
    expect(result.recommendations[0].evidenceKeys).toEqual(['genre'])
    expect(result.recommendations[0].isBestMatch).toBe(true)
  })

  it('rejects an unknown status as provider_bad_response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'weird' }))
    await expect(requestCuratorRecommendation(client(), 'x')).rejects.toMatchObject({
      code: 'provider_bad_response',
    })
  })
})
