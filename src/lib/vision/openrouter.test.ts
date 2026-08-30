import { describe, expect, it, vi } from 'vitest'
import { recognizeCoverWithOpenRouter, type VisionFetch } from './openrouter.ts'
import { RecognitionError } from './types.ts'

const imageDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const apiKey = 'or-test-key'

function chatResponse(
  content: unknown,
  usage: Record<string, unknown> | null = { prompt_tokens: 1000, completion_tokens: 120 },
  status = 200,
) {
  const body = {
    choices: [
      {
        message: {
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
      },
    ],
    ...(usage ? { usage } : {}),
  }

  return new Response(JSON.stringify(body), { status })
}

function validClues(overrides: Record<string, unknown> = {}) {
  return {
    artist: 'Pink Floyd',
    albumTitle: 'The Dark Side of the Moon',
    visibleText: ['PINK FLOYD', 'THE DARK SIDE OF THE MOON'],
    label: 'Harvest',
    catalogNumber: 'SHVL 804',
    releaseYearHint: 1973,
    confidence: 0.82,
    notes: null,
    identified: true,
    ...overrides,
  }
}

describe('recognizeCoverWithOpenRouter', () => {
  it('sends one image part, a JSON schema response format, and capped output', async () => {
    const fetchImpl = vi.fn<VisionFetch>(async () => chatResponse(validClues()))

    await recognizeCoverWithOpenRouter({
      imageDataUrl,
      apiKey,
      model: 'google/gemini-3.1-flash-lite',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${apiKey}`)

    const sent = JSON.parse(init.body as string)
    expect(sent.model).toBe('google/gemini-3.1-flash-lite')
    expect(sent.max_tokens).toBe(400)
    expect(sent.response_format.type).toBe('json_schema')
    expect(sent.response_format.json_schema.strict).toBe(true)
    const parts = sent.messages[0].content
    expect(parts.filter((p: { type: string }) => p.type === 'image_url')).toHaveLength(1)
    expect(parts.find((p: { type: string }) => p.type === 'image_url').image_url.url).toBe(imageDataUrl)
  })

  it('normalizes valid structured clues and estimates cost from usage', async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(validClues(), { prompt_tokens: 1000, completion_tokens: 120 }),
    )

    const result = await recognizeCoverWithOpenRouter({
      imageDataUrl,
      apiKey,
      model: 'google/gemini-3.1-flash-lite',
      fetchImpl,
    })

    expect(result.recognition.artist).toBe('Pink Floyd')
    expect(result.recognition.releaseYearHint).toBe(1973)
    expect(result.recognition.identified).toBe(true)
    expect(result.usage.promptTokens).toBe(1000)
    expect(result.usage.completionTokens).toBe(120)
    // 1000/1e6 * 0.25 + 120/1e6 * 1.5
    expect(result.usage.estimatedCostUsd).toBeCloseTo(0.00043, 6)
  })

  it('prefers a provider-reported cost when present', async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(validClues(), { prompt_tokens: 1000, completion_tokens: 120, cost: 0.0012 }),
    )

    const result = await recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl })
    expect(result.usage.estimatedCostUsd).toBe(0.0012)
  })

  it('returns null cost and null tokens when usage is missing', async () => {
    const fetchImpl = vi.fn<VisionFetch>(async () => chatResponse(validClues(), null))

    const result = await recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl })
    expect(result.usage.promptTokens).toBeNull()
    expect(result.usage.completionTokens).toBeNull()
    expect(result.usage.estimatedCostUsd).toBeNull()
  })

  it('clamps confidence, bounds the year hint, caps visible text, and drops empties', async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(
        validClues({
          confidence: 5,
          releaseYearHint: 3000,
          artist: '   ',
          visibleText: [...Array(20)].map((_, i) => `line ${i}`),
          notes: 'x'.repeat(500),
        }),
      ),
    )

    const result = await recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl })
    expect(result.recognition.confidence).toBe(1)
    expect(result.recognition.releaseYearHint).toBeNull()
    expect(result.recognition.artist).toBeNull()
    expect(result.recognition.visibleText.length).toBeLessThanOrEqual(12)
    expect(result.recognition.notes!.length).toBeLessThanOrEqual(240)
  })

  it('maps 429 and 503 to provider_rate_limited', async () => {
    for (const status of [429, 503]) {
      const fetchImpl = vi.fn<VisionFetch>(async () => new Response('busy', { status }))
      await expect(
        recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl }),
      ).rejects.toMatchObject({ code: 'provider_rate_limited' })
    }
  })

  it('maps other non-2xx responses to provider_unavailable', async () => {
    const fetchImpl = vi.fn<VisionFetch>(async () => new Response('nope', { status: 500 }))
    await expect(
      recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  it('maps aborted requests to provider_timeout', async () => {
    const fetchImpl = vi.fn<VisionFetch>((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      }),
    )

    await expect(
      recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl, timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: 'provider_timeout' })
  })

  it('maps malformed model JSON to provider_bad_response', async () => {
    const fetchImpl = vi.fn<VisionFetch>(async () => chatResponse('not json at all {'))
    await expect(
      recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl }),
    ).rejects.toBeInstanceOf(RecognitionError)
    await expect(
      recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl }),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
  })

  it('rejects a non-object root with provider_bad_response', async () => {
    const fetchImpl = vi.fn<VisionFetch>(async () => chatResponse([1, 2, 3]))
    await expect(
      recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl }),
    ).rejects.toMatchObject({ code: 'provider_bad_response' })
  })

  it('rejects field-level contract violations with provider_bad_response', async () => {
    const missingRequiredField: Record<string, unknown> = { ...validClues() }
    delete missingRequiredField.label

    const invalidPayloads: Record<string, unknown>[] = [
      missingRequiredField,
      validClues({ artist: 123 }),
      validClues({ visibleText: ['PINK FLOYD', 5] }),
      validClues({ identified: 'yes' }),
      validClues({ confidence: 'high' }),
    ]

    for (const payload of invalidPayloads) {
      const fetchImpl = vi.fn<VisionFetch>(async () => chatResponse(payload))
      await expect(
        recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl }),
      ).rejects.toMatchObject({ code: 'provider_bad_response' })
    }
  })

  it('ignores unknown extra fields on an otherwise valid payload', async () => {
    const fetchImpl = vi.fn<VisionFetch>(async () =>
      chatResponse(validClues({ extraneous: 'ignored', anotherOne: 42 })),
    )

    const result = await recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl })
    expect(result.recognition.artist).toBe('Pink Floyd')
  })

  it('never leaks the api key in a thrown error', async () => {
    const fetchImpl = vi.fn<VisionFetch>(async () => new Response('x', { status: 500 }))
    try {
      await recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, fetchImpl })
      throw new Error('should have thrown')
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(apiKey)
    }
  })
})
