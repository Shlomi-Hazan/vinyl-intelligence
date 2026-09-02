import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __clearSignedCoverCache,
  evictSignedCoverUrl,
  resolveSignedCoverUrl,
} from './signedCover.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

function clientWith(createSignedUrl: ReturnType<typeof vi.fn>) {
  return {
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  } as unknown as BrowserSupabaseClient
}

afterEach(() => {
  __clearSignedCoverCache()
  vi.restoreAllMocks()
})

describe('resolveSignedCoverUrl', () => {
  it('signs with a 1-hour TTL and memory-caches the result (one call for repeats)', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://x/signed?token=abc' }, error: null })
    const client = clientWith(createSignedUrl)

    const a = await resolveSignedCoverUrl(client, 'uid/item/cover.webp')
    const b = await resolveSignedCoverUrl(client, 'uid/item/cover.webp')

    expect(a).toBe('https://x/signed?token=abc')
    expect(b).toBe(a)
    expect(createSignedUrl).toHaveBeenCalledTimes(1)
    expect(createSignedUrl).toHaveBeenCalledWith('uid/item/cover.webp', 3600)
  })

  it('de-dupes concurrent requests for the same path', async () => {
    const createSignedUrl = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((r) =>
            setTimeout(() => r({ data: { signedUrl: 'u' }, error: null }), 5),
          ),
      )
    const client = clientWith(createSignedUrl)

    const [a, b] = await Promise.all([
      resolveSignedCoverUrl(client, 'p'),
      resolveSignedCoverUrl(client, 'p'),
    ])

    expect(a).toBe('u')
    expect(b).toBe('u')
    expect(createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('returns null (never throws) on a signing error or rejection', async () => {
    expect(
      await resolveSignedCoverUrl(
        clientWith(vi.fn().mockResolvedValue({ data: null, error: { message: 'no' } })),
        'p1',
      ),
    ).toBeNull()
    expect(
      await resolveSignedCoverUrl(
        clientWith(vi.fn().mockRejectedValue(new Error('boom'))),
        'p2',
      ),
    ).toBeNull()
  })

  it('re-signs after the path is evicted', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'u' }, error: null })
    const client = clientWith(createSignedUrl)

    await resolveSignedCoverUrl(client, 'p')
    evictSignedCoverUrl('p')
    await resolveSignedCoverUrl(client, 'p')

    expect(createSignedUrl).toHaveBeenCalledTimes(2)
  })

  it('never writes the signed URL to browser storage', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://x/secret-token' }, error: null })
    await resolveSignedCoverUrl(clientWith(createSignedUrl), 'p')

    const dump = JSON.stringify({ ...localStorage, ...sessionStorage })
    expect(dump).not.toContain('secret-token')
  })
})
