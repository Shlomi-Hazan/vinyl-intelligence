import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recognizeCover } from './client.ts'
import { RecognitionError } from './types.ts'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

const imageDataUrl = 'data:image/jpeg;base64,/9j/4AAQ'

function clientWithSession(accessToken: string | null): BrowserSupabaseClient {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: accessToken ? { access_token: accessToken } : null },
        error: null,
      })),
    },
  } as unknown as BrowserSupabaseClient
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recognizeCover', () => {
  it('sends the image with a bearer token and returns the recognition', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        recognition: {
          artist: 'Pink Floyd',
          albumTitle: 'The Dark Side of the Moon',
          visibleText: ['PINK FLOYD'],
          label: null,
          catalogNumber: null,
          releaseYearHint: 1973,
          confidence: 0.8,
          notes: null,
          identified: true,
        },
      }),
    )

    const result = await recognizeCover(clientWithSession('token-abc'), imageDataUrl)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/recognize',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
        body: JSON.stringify({ imageBase64: imageDataUrl }),
      }),
    )
    expect(result.artist).toBe('Pink Floyd')
    expect(result.identified).toBe(true)
  })

  it('throws unauthorized without calling the endpoint when there is no session', async () => {
    await expect(
      recognizeCover(clientWithSession(null), imageDataUrl),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a sanitized server error payload to a RecognitionError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'provider_rate_limited', message: 'busy' }, 503),
    )

    await expect(
      recognizeCover(clientWithSession('token'), imageDataUrl),
    ).rejects.toMatchObject({ code: 'provider_rate_limited', message: 'busy' })
  })

  it('falls back to unknown for an unrecognized error code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'weird' }, 500))

    await expect(
      recognizeCover(clientWithSession('token'), imageDataUrl),
    ).rejects.toMatchObject({ code: 'unknown' })
  })

  it('rejects an unexpected success payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: true }, 200))

    await expect(
      recognizeCover(clientWithSession('token'), imageDataUrl),
    ).rejects.toBeInstanceOf(RecognitionError)
  })
})
