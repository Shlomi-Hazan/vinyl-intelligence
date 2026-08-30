import { afterEach, describe, expect, it, vi } from 'vitest'
import { downscaleImageToDataUrl, validateImageFile } from './image.ts'
import { RecognitionError } from './types.ts'

function makeFile(bytes: number, type: string, name = 'cover'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('validateImageFile', () => {
  it('accepts jpeg, png, and webp', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(() => validateImageFile(makeFile(1000, type))).not.toThrow()
    }
  })

  it('rejects an unsupported type', () => {
    try {
      validateImageFile(makeFile(1000, 'image/gif'))
      throw new Error('expected a rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(RecognitionError)
      expect((error as RecognitionError).code).toBe('unsupported_media_type')
    }
  })

  it('rejects an empty file', () => {
    expect(() => validateImageFile(makeFile(0, 'image/jpeg'))).toThrow(RecognitionError)
  })

  it('rejects a file over the input size cap', () => {
    try {
      validateImageFile(makeFile(21_000_000, 'image/jpeg'))
      throw new Error('expected a rejection')
    } catch (error) {
      expect((error as RecognitionError).code).toBe('image_too_large')
    }
  })
})

describe('downscaleImageToDataUrl', () => {
  function stubCanvas(dataUrl: string) {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl)
  }

  it('returns a bounded jpeg data URL for a valid image', async () => {
    stubCanvas('data:image/jpeg;base64,' + 'A'.repeat(2000))

    const result = await downscaleImageToDataUrl(makeFile(5_000_000, 'image/jpeg'))

    expect(result.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('rejects a still-too-large re-encoded image', async () => {
    stubCanvas('data:image/jpeg;base64,' + 'A'.repeat(5_000_000))

    await expect(
      downscaleImageToDataUrl(makeFile(5_000_000, 'image/jpeg')),
    ).rejects.toMatchObject({ code: 'image_too_large' })
  })

  it('validates the file before touching the canvas', async () => {
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    await expect(
      downscaleImageToDataUrl(makeFile(1000, 'image/gif')),
    ).rejects.toMatchObject({ code: 'unsupported_media_type' })
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})
