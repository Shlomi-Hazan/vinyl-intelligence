import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AVATAR_BUCKET,
  AvatarError,
  __clearAvatarUrlCache,
  avatarPath,
  removeAvatar,
  resolveAvatarUrl,
  uploadAvatar,
  validateAvatarInput,
} from './avatar.ts'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

function pngFile(size = 1024): File {
  const f = new File([new Uint8Array(size)], 'me.png', { type: 'image/png' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

type StorageStub = {
  upload: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  createSignedUrl: ReturnType<typeof vi.fn>
}

function makeClient(over: Partial<StorageStub> = {}) {
  const storage: StorageStub = {
    upload: vi.fn(async () => ({ data: { path: 'x' }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: 'https://signed.example/token?sig=secret' },
      error: null,
    })),
    ...over,
  }
  const profileUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  const client = {
    storage: { from: vi.fn(() => storage) },
    from: vi.fn(() => ({ update: profileUpdate })),
  } as unknown as BrowserSupabaseClient
  return { client, storage, profileUpdate }
}

beforeEach(() => __clearAvatarUrlCache())
afterEach(() => vi.restoreAllMocks())

describe('avatarPath', () => {
  it('is the canonical lowercase per-user path', () => {
    expect(avatarPath('ABC-123')).toBe('abc-123/avatar.webp')
  })
})

describe('validateAvatarInput', () => {
  it('rejects an unsupported type', () => {
    const gif = new File([new Uint8Array(4)], 'x.gif', { type: 'image/gif' })
    expect(() => validateAvatarInput(gif)).toThrow(AvatarError)
  })
  it('rejects a huge input file', () => {
    const big = pngFile(20 * 1024 * 1024)
    expect(() => validateAvatarInput(big)).toThrow(/too large/)
  })
  it('accepts a small png', () => {
    expect(() => validateAvatarInput(pngFile())).not.toThrow()
  })
})

describe('uploadAvatar', () => {
  it('uploads the converted webp then points the profile row at ONLY the two avatar columns', async () => {
    const { client, storage, profileUpdate } = makeClient()
    const convert = vi.fn(async () => new Blob([new Uint8Array(64)], { type: 'image/webp' }))

    const result = await uploadAvatar(client, 'user-1', pngFile(), convert)

    expect(convert).toHaveBeenCalled()
    expect(storage.upload).toHaveBeenCalledWith(
      'user-1/avatar.webp',
      expect.any(Blob),
      expect.objectContaining({ upsert: true, contentType: 'image/webp' }),
    )
    const patch = (profileUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['avatar_path', 'avatar_updated_at'])
    expect(patch.avatar_path).toBe('user-1/avatar.webp')
    expect(result.path).toBe('user-1/avatar.webp')
  })

  it('surfaces a storage failure as an AvatarError', async () => {
    const { client } = makeClient({
      upload: vi.fn(async () => ({ data: null, error: new Error('507') })),
    })
    await expect(
      uploadAvatar(client, 'user-1', pngFile(), async () => new Blob()),
    ).rejects.toBeInstanceOf(AvatarError)
  })
})

describe('removeAvatar', () => {
  it('nulls the profile columns before deleting the object', async () => {
    const calls: string[] = []
    const { client, storage, profileUpdate } = makeClient({
      remove: vi.fn(async () => {
        calls.push('storage.remove')
        return { data: [], error: null }
      }),
    })
    profileUpdate.mockImplementation(() => ({
      eq: vi.fn(async () => {
        calls.push('profile.update')
        return { error: null }
      }),
    }))

    await removeAvatar(client, 'user-1')

    expect(calls).toEqual(['profile.update', 'storage.remove'])
    const patch = (profileUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(patch).toEqual({ avatar_path: null, avatar_updated_at: null })
    expect(storage.remove).toHaveBeenCalledWith(['user-1/avatar.webp'])
  })
})

describe('resolveAvatarUrl (memory-only cache)', () => {
  it('signs against the private bucket and caches in memory', async () => {
    const { client, storage } = makeClient()
    const url = await resolveAvatarUrl(client, 'user-1/avatar.webp')
    expect(url).toBe('https://signed.example/token?sig=secret')
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1)
    expect(client.storage.from).toHaveBeenCalledWith(AVATAR_BUCKET)

    // second call is served from the in-memory cache, no new sign
    await resolveAvatarUrl(client, 'user-1/avatar.webp')
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('never writes the signed URL to web storage', async () => {
    const { client } = makeClient()
    await resolveAvatarUrl(client, 'user-1/avatar.webp')
    expect(JSON.stringify(window.localStorage)).not.toContain('signed.example')
    expect(JSON.stringify(window.sessionStorage)).not.toContain('signed.example')
  })

  it('returns null (never throws) when signing fails', async () => {
    const { client } = makeClient({
      createSignedUrl: vi.fn(async () => ({ data: null, error: new Error('nope') })),
    })
    await expect(resolveAvatarUrl(client, 'user-1/avatar.webp')).resolves.toBeNull()
  })
})
