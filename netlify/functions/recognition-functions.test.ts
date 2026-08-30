// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import recognizeHandler, { config as recognizeConfig } from './catalog-recognize.mts'
import {
  countRecentRecognitionAttemptsWithUserToken,
  handleCatalogRecognize,
  type RecognitionFunctionDependencies,
} from './_shared/recognition-handlers.mts'
import { RecognitionError, type CoverRecognition } from '../../src/lib/vision/types.ts'

const env = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  OPENROUTER_API_KEY: 'or-secret-key',
}

const verifiedUserId = '00000000-0000-4000-8000-0000000000d1'

function jpegDataUrl(byteLength = 400): string {
  const bytes = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(Math.max(0, byteLength - 3), 0x20),
  ])
  return `data:image/jpeg;base64,${bytes.toString('base64')}`
}

function pngMagicJpegDeclaredDataUrl(): string {
  // Declares PNG but the bytes are JPEG magic -> magic-number mismatch.
  const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200)])
  return `data:image/png;base64,${bytes.toString('base64')}`
}

function recognition(overrides: Partial<CoverRecognition> = {}): CoverRecognition {
  return {
    artist: 'Pink Floyd',
    albumTitle: 'The Dark Side of the Moon',
    visibleText: ['PINK FLOYD'],
    label: null,
    catalogNumber: null,
    releaseYearHint: 1973,
    confidence: 0.8,
    notes: null,
    identified: true,
    ...overrides,
  }
}

function createDependencies(options: { authError?: Error } = {}) {
  const authClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.authError ? null : { id: verifiedUserId } },
        error: options.authError ?? null,
      })),
    },
  }
  const createClient = vi.fn(() => authClient)
  const recognizeCover = vi.fn<RecognitionFunctionDependencies['recognizeCover']>(
    async () => ({
      recognition: recognition(),
      model: 'google/gemini-3.1-flash-lite',
      usage: { promptTokens: 1000, completionTokens: 120, estimatedCostUsd: 0.00043 },
    }),
  )
  const recordModelCall = vi.fn<RecognitionFunctionDependencies['recordModelCall']>(
    async () => undefined,
  )
  const countRecentRecognitionAttempts = vi.fn<
    RecognitionFunctionDependencies['countRecentRecognitionAttempts']
  >(async () => 0)
  // now() call order per request: (1) rate-limit window anchor, (2) startedAt,
  // (3+) provider-completion timestamp.
  const now = vi
    .fn<() => number>()
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_000)
    .mockReturnValue(1_450)

  const dependencies = {
    createClient,
    recognizeCover,
    recordModelCall,
    countRecentRecognitionAttempts,
    now,
  } as unknown as RecognitionFunctionDependencies

  return {
    authClient,
    createClient,
    dependencies,
    recognizeCover,
    recordModelCall,
    countRecentRecognitionAttempts,
    now,
  }
}

function recognizeRequest(body: unknown, withAuth = true) {
  return new Request('http://app.test/api/catalog/recognize', {
    method: 'POST',
    headers: withAuth
      ? { 'content-type': 'application/json', Authorization: 'Bearer valid-token' }
      : { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

describe('catalog recognize function', () => {
  it('uses the approved public route', () => {
    expect(recognizeConfig).toEqual({ method: ['POST'], path: '/api/catalog/recognize' })
    expect(recognizeHandler).toEqual(expect.any(Function))
  })

  it('rejects an unauthenticated request before any provider, rate-check, or telemetry call', async () => {
    const { dependencies, recognizeCover, recordModelCall, countRecentRecognitionAttempts } =
      createDependencies()

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }, false),
      env,
      dependencies,
    )

    expect(response.status).toBe(401)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'unauthorized' })
    expect(recognizeCover).not.toHaveBeenCalled()
    expect(recordModelCall).not.toHaveBeenCalled()
    expect(countRecentRecognitionAttempts).not.toHaveBeenCalled()
  })

  it('rejects an invalid Supabase token', async () => {
    const { dependencies, recognizeCover } = createDependencies({
      authError: new Error('expired'),
    })

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(401)
    expect(recognizeCover).not.toHaveBeenCalled()
  })

  it('rejects a body that is not exactly an image', async () => {
    const { dependencies } = createDependencies()

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl(), extra: 'x' }),
      env,
      dependencies,
    )

    expect(response.status).toBe(400)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_query' })
  })

  it('rejects a disallowed image type', async () => {
    const { dependencies } = createDependencies()

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: 'data:image/gif;base64,R0lGODdh' }),
      env,
      dependencies,
    )

    expect(response.status).toBe(415)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'unsupported_media_type' })
  })

  it('rejects an oversized decoded image', async () => {
    const { dependencies, recognizeCover } = createDependencies()

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl(3_500_000) }),
      env,
      dependencies,
    )

    expect(response.status).toBe(413)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'image_too_large' })
    expect(recognizeCover).not.toHaveBeenCalled()
  })

  it('rejects an image whose bytes do not match the declared type', async () => {
    const { dependencies } = createDependencies()

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: pngMagicJpegDeclaredDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(415)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'unsupported_media_type' })
  })

  it('returns config_error when the OpenRouter key is missing', async () => {
    const { dependencies, recognizeCover } = createDependencies()

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      { ...env, OPENROUTER_API_KEY: undefined },
      dependencies,
    )

    expect(response.status).toBe(500)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'config_error' })
    expect(recognizeCover).not.toHaveBeenCalled()
  })

  it('returns normalized clues and records one successful telemetry row', async () => {
    const { dependencies, recognizeCover, recordModelCall } = createDependencies()

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toEqual({
      recognition: recognition(),
    })
    expect(recognizeCover).toHaveBeenCalledOnce()
    expect(recordModelCall).toHaveBeenCalledOnce()

    const record = recordModelCall.mock.calls[0][2]
    expect(record).toMatchObject({
      userId: verifiedUserId,
      model: 'google/gemini-3.1-flash-lite',
      success: true,
      latencyMs: 450,
      promptTokens: 1000,
      completionTokens: 120,
      estimatedCostUsd: 0.00043,
      errorCategory: null,
    })
  })

  it('does not retry the provider and records a failed telemetry row', async () => {
    const { dependencies, recognizeCover, recordModelCall } = createDependencies()
    recognizeCover.mockRejectedValueOnce(
      new RecognitionError('provider_timeout', 'took too long'),
    )

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(504)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'provider_timeout' })
    expect(recognizeCover).toHaveBeenCalledOnce()
    expect(recordModelCall).toHaveBeenCalledOnce()

    const record = recordModelCall.mock.calls[0][2]
    expect(record).toMatchObject({
      success: false,
      errorCategory: 'provider_timeout',
      promptTokens: null,
      completionTokens: null,
      estimatedCostUsd: null,
    })
  })

  it('still succeeds when the telemetry insert fails', async () => {
    const { dependencies, recordModelCall } = createDependencies()
    recordModelCall.mockRejectedValue(new Error('insert denied'))

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      recognition: { identified: true },
    })
  })

  it('returns a not-identified recognition as a normal 200 for the UI to handle', async () => {
    const { dependencies, recognizeCover } = createDependencies()
    recognizeCover.mockResolvedValueOnce({
      recognition: recognition({ identified: false, artist: null, albumTitle: null, visibleText: [] }),
      model: 'google/gemini-3.1-flash-lite',
      usage: { promptTokens: 800, completionTokens: 20, estimatedCostUsd: 0.0002 },
    })

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      recognition: { identified: false },
    })
  })

  it('never includes the OpenRouter key in the response body', async () => {
    const { dependencies } = createDependencies()

    const okResponse = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )
    expect(await okResponse.text()).not.toContain('or-secret-key')
  })
})

describe('catalog recognize per-user rate limit', () => {
  it('allows the provider call when the user is under the window limit', async () => {
    const { dependencies, recognizeCover, countRecentRecognitionAttempts } =
      createDependencies()
    countRecentRecognitionAttempts.mockResolvedValueOnce(9)

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(200)
    expect(recognizeCover).toHaveBeenCalledOnce()
  })

  it('returns 429 rate_limited when the user already has 10 recent attempts', async () => {
    const { dependencies, recognizeCover, recordModelCall, countRecentRecognitionAttempts } =
      createDependencies()
    countRecentRecognitionAttempts.mockResolvedValueOnce(10)

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(429)
    await expect(readJson(response)).resolves.toMatchObject({
      code: 'rate_limited',
      message: 'Too many recognition attempts. Try again in a few minutes.',
    })
    // No provider call and no telemetry row for a locally rejected request.
    expect(recognizeCover).not.toHaveBeenCalled()
    expect(recordModelCall).not.toHaveBeenCalled()
  })

  it('checks the rate limit only after authentication and scopes it to the user + 10-minute window', async () => {
    const { dependencies, countRecentRecognitionAttempts } = createDependencies()

    await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(countRecentRecognitionAttempts).toHaveBeenCalledOnce()
    const [, , query] = countRecentRecognitionAttempts.mock.calls[0]
    expect(query.userId).toBe(verifiedUserId)
    expect(query.token).toBe('valid-token')
    // now() is mocked to 1_000 first; window start is now - 10 minutes.
    expect(query.windowStartIso).toBe(new Date(1_000 - 10 * 60_000).toISOString())
  })

  it('fails closed without calling the provider when the rate-check query itself fails', async () => {
    const { dependencies, recognizeCover, recordModelCall, countRecentRecognitionAttempts } =
      createDependencies()
    countRecentRecognitionAttempts.mockRejectedValueOnce(new Error('db unreachable'))

    const response = await handleCatalogRecognize(
      recognizeRequest({ imageBase64: jpegDataUrl() }),
      env,
      dependencies,
    )

    expect(response.status).toBe(500)
    await expect(readJson(response)).resolves.toMatchObject({ code: 'unknown' })
    expect(recognizeCover).not.toHaveBeenCalled()
    expect(recordModelCall).not.toHaveBeenCalled()
  })
})

describe('countRecentRecognitionAttemptsWithUserToken', () => {
  type CaptureCall = [string, unknown]

  function createCountingClient(result: {
    count?: number | null
    error?: { message: string } | null
  }) {
    const calls: CaptureCall[] = []
    let createOptions: unknown
    const builder = {
      select: (columns: string, opts?: unknown) => {
        calls.push(['select', { columns, opts }])
        return builder
      },
      eq: (column: string, value: unknown) => {
        calls.push([`eq:${column}`, value])
        return builder
      },
      gte: (column: string, value: unknown) => {
        calls.push([`gte:${column}`, value])
        return builder
      },
      then: (resolve: (value: unknown) => void) =>
        resolve({ count: result.count ?? null, error: result.error ?? null }),
    }
    const from = (table: string) => {
      calls.push(['from', table])
      return builder
    }
    const createClient = ((_url: string, _key: string, options: unknown) => {
      createOptions = options
      return { from }
    }) as unknown as RecognitionFunctionDependencies['createClient']

    return { createClient, calls, getCreateOptions: () => createOptions }
  }

  const baseEnv = {
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  }
  const windowStartIso = '2026-08-30T08:00:00.000Z'

  it('counts only the current user + cover_vision + within-window rows and passes the bearer token', async () => {
    const client = createCountingClient({ count: 4 })

    const total = await countRecentRecognitionAttemptsWithUserToken(baseEnv, client.createClient, {
      token: 'user-token',
      userId: 'user-a',
      windowStartIso,
    })

    expect(total).toBe(4)
    expect(client.calls).toEqual([
      ['from', 'model_calls'],
      ['select', { columns: 'id', opts: { count: 'exact', head: true } }],
      ['eq:user_id', 'user-a'],
      ['eq:feature', 'cover_vision'],
      ['gte:created_at', windowStartIso],
    ])
    expect(client.getCreateOptions()).toMatchObject({
      global: { headers: { Authorization: 'Bearer user-token' } },
    })
  })

  it('does not count another user\'s rows (query is filtered to the given userId)', async () => {
    const client = createCountingClient({ count: 0 })

    const total = await countRecentRecognitionAttemptsWithUserToken(baseEnv, client.createClient, {
      token: 'user-b-token',
      userId: 'user-b',
      windowStartIso,
    })

    expect(total).toBe(0)
    expect(client.calls).toContainEqual(['eq:user_id', 'user-b'])
  })

  it('throws when the count query returns an error', async () => {
    const client = createCountingClient({ error: { message: 'permission denied' } })

    await expect(
      countRecentRecognitionAttemptsWithUserToken(baseEnv, client.createClient, {
        token: 't',
        userId: 'u',
        windowStartIso,
      }),
    ).rejects.toThrow('permission denied')
  })
})
