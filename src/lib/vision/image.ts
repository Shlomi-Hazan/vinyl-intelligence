import {
  RecognitionError,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from './types.ts'

// Pre-downscale UX cap for a picked file (a large phone photo).
const MAX_INPUT_BYTES = 20_000_000
// Post-downscale cap. Must stay below the recognition function's
// MAX_IMAGE_BYTES (3_000_000) with margin for base64 + JSON overhead.
const MAX_OUTPUT_BYTES = 2_600_000
const DEFAULT_MAX_EDGE = 1024
const DEFAULT_JPEG_QUALITY = 0.8
const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,'

function supportedTypeLabel(): string {
  return SUPPORTED_IMAGE_MIME_TYPES.map((type) => type.replace('image/', '')).join(', ')
}

export function validateImageFile(file: File): void {
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(file.type as SupportedImageMimeType)) {
    throw new RecognitionError(
      'unsupported_media_type',
      `Choose a ${supportedTypeLabel()} image.`,
    )
  }

  if (file.size === 0) {
    throw new RecognitionError('unsupported_media_type', 'That file could not be read.')
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new RecognitionError(
      'image_too_large',
      'That photo is too large. Choose a smaller image.',
    )
  }
}

function approximateBase64Bytes(dataUrl: string): number {
  const base64 = dataUrl.slice(JPEG_DATA_URL_PREFIX.length)
  return Math.ceil((base64.length * 3) / 4)
}

export type DownscaleOptions = {
  maxEdge?: number
  quality?: number
}

/**
 * Validates the picked file, then downscales it to a bounded JPEG data URL
 * using an offscreen canvas. Real canvas encoding is a browser concern and is
 * verified in human runtime testing, not jsdom.
 */
export async function downscaleImageToDataUrl(
  file: File,
  { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_JPEG_QUALITY }: DownscaleOptions = {},
): Promise<string> {
  validateImageFile(file)

  const bitmap = await createImageBitmap(file)

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height) || 1
    const scale = Math.min(1, maxEdge / longestEdge)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new RecognitionError('unknown', 'This browser cannot process the image.')
    }

    context.drawImage(bitmap, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)

    if (!dataUrl.startsWith(JPEG_DATA_URL_PREFIX)) {
      throw new RecognitionError('unknown', 'This browser cannot process the image.')
    }

    if (approximateBase64Bytes(dataUrl) > MAX_OUTPUT_BYTES) {
      throw new RecognitionError(
        'image_too_large',
        'That photo is still too large after resizing. Choose a smaller image.',
      )
    }

    return dataUrl
  } finally {
    bitmap.close?.()
  }
}
