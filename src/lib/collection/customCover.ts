/*
 * Custom album covers for owned collection items - the tier-1 artwork source.
 *
 * Uses the Phase 0 storage contract exactly (migration
 * 20260903120000_add_custom_cover_storage.sql): the private `collection-covers`
 * bucket, one canonical object per item:
 *
 *     {user_id}/{collection_item_id}/cover.webp        (lowercase UUID text)
 *
 * Any accepted jpeg/png/webp input is converted client-side to a downscaled
 * WebP before upload; only `image/webp` is a valid stored object. Upload /
 * replace / delete are direct browser -> Storage calls - bucket config + RLS
 * enforce ownership, type, and size. `public.releases` is never touched.
 */

import { evictSignedCoverUrl } from '../../media/signedCover.ts'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

export const CUSTOM_COVER_BUCKET = 'collection-covers'
/** Stored-object cap (bucket `file_size_limit`). */
export const CUSTOM_COVER_MAX_BYTES = 3 * 1024 * 1024
/** Longest edge of the downscaled WebP. */
export const CUSTOM_COVER_MAX_DIMENSION = 1400
export const CUSTOM_COVER_ACCEPTED_INPUT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
/** Reject an absurd source file before we even try to decode it. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024

export type CustomCoverErrorCode =
  | 'unsupported_type'
  | 'file_too_large'
  | 'conversion_failed'
  | 'output_too_large'
  | 'upload_failed'
  | 'update_failed'
  | 'remove_failed'

export class CustomCoverError extends Error {
  readonly code: CustomCoverErrorCode
  constructor(code: CustomCoverErrorCode, message: string) {
    super(message)
    this.name = 'CustomCoverError'
    this.code = code
  }
}

/** The canonical object path for one owned item (lowercase UUID text). */
export function customCoverPath(userId: string, collectionItemId: string): string {
  return `${userId.trim().toLowerCase()}/${collectionItemId.trim().toLowerCase()}/cover.webp`
}

/** Throws `CustomCoverError` for an unsupported type or an oversized source file. */
export function validateCustomCoverInput(file: File): void {
  if (
    !(CUSTOM_COVER_ACCEPTED_INPUT_TYPES as readonly string[]).includes(file.type)
  ) {
    throw new CustomCoverError(
      'unsupported_type',
      'Use a JPEG, PNG, or WebP image.',
    )
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new CustomCoverError(
      'file_too_large',
      'That image is too large. Use one under 20 MB.',
    )
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality),
  )
}

/**
 * Decode + downscale + re-encode to WebP entirely in the browser. Retries once
 * at lower quality if the first encode exceeds the stored-object cap.
 */
export async function fileToWebpBlob(
  file: File,
  maxDimension = CUSTOM_COVER_MAX_DIMENSION,
): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new CustomCoverError(
      'conversion_failed',
      'That image could not be read. Try a different file.',
    )
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    throw new CustomCoverError('conversion_failed', 'Image conversion is unavailable.')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  let blob = await canvasToBlob(canvas, 0.85)
  if (blob && blob.size > CUSTOM_COVER_MAX_BYTES) {
    blob = await canvasToBlob(canvas, 0.65)
  }
  if (!blob) {
    throw new CustomCoverError('conversion_failed', 'Image conversion failed.')
  }
  if (blob.size > CUSTOM_COVER_MAX_BYTES) {
    throw new CustomCoverError(
      'output_too_large',
      'That image is too detailed to store. Try a simpler or smaller one.',
    )
  }
  return blob
}

export type CustomCoverResult = { path: string; updatedAt: string }

/**
 * Validate -> convert to WebP -> upsert the canonical object -> point the
 * collection item at it. `convert` is injectable so tests do not need a canvas.
 */
export async function uploadCustomCover(
  client: BrowserSupabaseClient,
  userId: string,
  collectionItemId: string,
  file: File,
  convert: (f: File) => Promise<Blob> = fileToWebpBlob,
): Promise<CustomCoverResult> {
  validateCustomCoverInput(file)
  const path = customCoverPath(userId, collectionItemId)
  const blob = await convert(file)

  const upload = await client.storage
    .from(CUSTOM_COVER_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/webp' })
  if (upload.error) {
    throw new CustomCoverError('upload_failed', 'Could not upload the cover. Try again.')
  }

  const updatedAt = new Date().toISOString()
  const { error: updateError } = await client
    .from('collection_items')
    .update({ custom_cover_path: path, custom_cover_updated_at: updatedAt })
    .eq('id', collectionItemId)
  if (updateError) {
    throw new CustomCoverError(
      'update_failed',
      'The cover uploaded but could not be linked to the record.',
    )
  }

  evictSignedCoverUrl(path)
  return { path, updatedAt }
}

/**
 * Detach the custom cover (artwork falls back to CAA / branded). Nulls the
 * columns first so the UI recovers even if the object delete fails; the
 * residual object can be removed later by its owner.
 */
export async function removeCustomCover(
  client: BrowserSupabaseClient,
  userId: string,
  collectionItemId: string,
): Promise<void> {
  const path = customCoverPath(userId, collectionItemId)

  const { error: updateError } = await client
    .from('collection_items')
    .update({ custom_cover_path: null, custom_cover_updated_at: null })
    .eq('id', collectionItemId)
  if (updateError) {
    throw new CustomCoverError('remove_failed', 'Could not remove the custom cover.')
  }

  // Best-effort object cleanup - never blocks the UI recovery.
  try {
    await client.storage.from(CUSTOM_COVER_BUCKET).remove([path])
  } catch {
    /* orphan object; owner can clean up later via the DELETE policy */
  }
  evictSignedCoverUrl(path)
}
