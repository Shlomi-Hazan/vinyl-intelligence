import { afterEach, describe, expect, it, vi } from 'vitest'
import { refineCuratorRecommendation, requestCuratorRecommendation } from './client.ts'
import { CuratorError, type CuratorIntent } from './types.ts'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

const sampleIntent: CuratorIntent = {
  includeGenres: ['rock'],
  excludeGenres: [],
  decades: [1990],
  minRating: null,
  favoritesOnly: false,
  neverPlayedOnly: false,
  avoidRecentlyPlayed: true,
  recentDays: null,
  preference: 'none',
  energy: 'any',
  mood: null,
  requestedCount: 3,
}

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

describe('refineCuratorRecommendation (Milestone 10)', () => {
  const context = {
    previousRequest: 'give me 90s rock',
    previousIntent: sampleIntent,
    previousRecommendationIds: ['a', 'b'],
  }

  it('posts { request, context } to /api/curator/refine with a bearer token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'no_match', interpretedIntent: sampleIntent }),
    )
    await refineCuratorRecommendation(client('abc'), 'only favorites', context)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/curator/refine')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer abc')
    expect(JSON.parse(init?.body as string)).toEqual({
      request: 'only favorites',
      context,
    })
  })

  it('normalizes an ok refine result and its excludedPreviousRecommendations count', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'ok',
        interpretedIntent: sampleIntent,
        candidateCount: 2,
        excludedPreviousRecommendations: 2,
        recommendations: [
          {
            collectionItemId: 'c',
            artist: 'X',
            title: 'Y',
            year: 1991,
            decade: 1990,
            genres: ['rock'],
            rating: 4,
            favorite: true,
            playCount: 0,
            lastListenedAt: null,
            neverPlayed: true,
            reason: 'fits',
            evidenceKeys: ['favorite'],
            isBestMatch: true,
          },
        ],
      }),
    )
    const result = await refineCuratorRecommendation(client(), 'something else', context)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') {
      return
    }
    expect(result.excludedPreviousRecommendations).toBe(2)
    expect(result.recommendations[0].collectionItemId).toBe('c')
  })

  it('defaults excludedPreviousRecommendations to 0 when the server omits it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'ok',
        interpretedIntent: sampleIntent,
        candidateCount: 1,
        recommendations: [],
      }),
    )
    const result = await refineCuratorRecommendation(client(), 'x', context)
    expect(result.status === 'ok' && result.excludedPreviousRecommendations).toBe(0)
  })

  it('maps a non-OK { code, message } to a CuratorError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'invalid_request', message: 'bad context' }, 400),
    )
    await expect(refineCuratorRecommendation(client(), 'x', context)).rejects.toMatchObject({
      code: 'invalid_request',
    })
  })
})
