import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CustomCoverError,
  customCoverPath,
  removeCustomCover,
  uploadCustomCover,
  validateCustomCoverInput,
} from './customCover.ts'
import { __clearSignedCoverCache } from '../../media/signedCover.ts'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

afterEach(() => {
  __clearSignedCoverCache()
  vi.restoreAllMocks()
})

const UID = 'AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA'
const ITEM = 'BBBBBBBB-2222-4222-8222-BBBBBBBBBBBB'

function fakeFile(type: string, size: number): File {
  const f = new File(['x'], 'cover.png', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

function fakeClient(overrides: {
  upload?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  remove?: ReturnType<typeof vi.fn>
} = {}) {
  const upload = overrides.upload ?? vi.fn().mockResolvedValue({ error: null })
  const remove = overrides.remove ?? vi.fn().mockResolvedValue({ error: null })
  const eq = vi.fn().mockResolvedValue({ error: null })
  const update = overrides.update ?? vi.fn(() => ({ eq }))
  const from = vi.fn((table: string) => {
    if (table === 'collection_items') {
      return { update }
    }
    throw new Error(`unexpected table ${table}`)
  })
  const storageFrom = vi.fn(() => ({ upload, remove }))
  return {
    client: { from, storage: { from: storageFrom } } as unknown as BrowserSupabaseClient,
    upload,
    update,
    remove,
    eq,
    storageFrom,
  }
}

describe('customCoverPath', () => {
  it('is the canonical lowercase-UUID path for the owner + item', () => {
    expect(customCoverPath(UID, ITEM)).toBe(
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb/cover.webp',
    )
  })
})

describe('validateCustomCoverInput', () => {
  it('accepts jpeg / png / webp', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(() => validateCustomCoverInput(fakeFile(type, 1000))).not.toThrow()
    }
  })

  it('rejects an unsupported type', () => {
    expect(() => validateCustomCoverInput(fakeFile('image/gif', 1000))).toThrow(
      CustomCoverError,
    )
    try {
      validateCustomCoverInput(fakeFile('application/pdf', 1000))
    } catch (e) {
      expect((e as CustomCoverError).code).toBe('unsupported_type')
    }
  })

  it('rejects an oversized source file', () => {
    try {
      validateCustomCoverInput(fakeFile('image/png', 25 * 1024 * 1024))
    } catch (e) {
      expect((e as CustomCoverError).code).toBe('file_too_large')
    }
  })
})

describe('uploadCustomCover', () => {
  const webp = () => Promise.resolve(new Blob(['webp'], { type: 'image/webp' }))

  it('uploads the canonical object and links it to the item', async () => {
    const { client, upload, update, storageFrom } = fakeClient()
    const result = await uploadCustomCover(client, UID, ITEM, fakeFile('image/png', 1000), webp)

    expect(storageFrom).toHaveBeenCalledWith('collection-covers')
    expect(upload).toHaveBeenCalledWith(
      customCoverPath(UID, ITEM),
      expect.any(Blob),
      { upsert: true, contentType: 'image/webp' },
    )
    expect(update).toHaveBeenCalledWith({
      custom_cover_path: customCoverPath(UID, ITEM),
      custom_cover_updated_at: result.updatedAt,
    })
    expect(result.path).toBe(customCoverPath(UID, ITEM))
  })

  it('replacing an existing cover just upserts the same path', async () => {
    const { client, upload } = fakeClient()
    await uploadCustomCover(client, UID, ITEM, fakeFile('image/webp', 1000), webp)
    await uploadCustomCover(client, UID, ITEM, fakeFile('image/webp', 1000), webp)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[0][0]).toBe(upload.mock.calls[1][0])
  })

  it('surfaces a storage upload failure without linking', async () => {
    const { client, update } = fakeClient({
      upload: vi.fn().mockResolvedValue({ error: { message: 'denied' } }),
    })
    await expect(
      uploadCustomCover(client, UID, ITEM, fakeFile('image/png', 1000), webp),
    ).rejects.toMatchObject({ code: 'upload_failed' })
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a bad type before touching storage', async () => {
    const { client, upload } = fakeClient()
    await expect(
      uploadCustomCover(client, UID, ITEM, fakeFile('image/gif', 1000), webp),
    ).rejects.toMatchObject({ code: 'unsupported_type' })
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('removeCustomCover', () => {
  it('nulls the columns first, then best-effort deletes the object', async () => {
    const { client, update, remove } = fakeClient()
    await removeCustomCover(client, UID, ITEM)
    expect(update).toHaveBeenCalledWith({
      custom_cover_path: null,
      custom_cover_updated_at: null,
    })
    expect(remove).toHaveBeenCalledWith([customCoverPath(UID, ITEM)])
  })

  it('still resolves when the object delete fails (orphan tolerated)', async () => {
    const { client } = fakeClient({
      remove: vi.fn().mockRejectedValue(new Error('gone')),
    })
    await expect(removeCustomCover(client, UID, ITEM)).resolves.toBeUndefined()
  })

  it('throws if the column update fails', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    const { client } = fakeClient({ update: vi.fn(() => ({ eq })) })
    await expect(removeCustomCover(client, UID, ITEM)).rejects.toMatchObject({
      code: 'remove_failed',
    })
  })
})
