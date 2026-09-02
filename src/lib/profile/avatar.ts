import { useEffect, useState } from 'react'
import type { BrowserSupabaseClient } from '../supabase/client.ts'

/*
 * Optional profile avatar (Phase D). Initials remain the default AND the
 * fallback everywhere; a user is never required to upload an image.
 *
 * Modelled on the custom-cover flow (lib/collection/customCover.ts +
 * media/signedCover.ts): one canonical WebP object per user in the private
 * `profile-avatars` bucket, client-side conversion + centre-crop, direct
 * browser Storage calls (RLS + bucket config enforce ownership/type/size), and
 * a memory-only signed-URL cache. A signed URL is a bearer credential - it is
 * NEVER written to the profile row, localStorage, sessionStorage, a log,
 * telemetry, an error message, or test output.
 */

export const AVATAR_BUCKET = 'profile-avatars'
export const AVATAR_MAX_BYTES = 1024 * 1024 // 1 MiB (bucket file_size_limit)
export const AVATAR_DIMENSION = 512
export const AVATAR_ACCEPTED_INPUT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
const MAX_INPUT_BYTES = 15 * 1024 * 1024
export const AVATAR_SIGNED_URL_TTL_SECONDS = 3600
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export type AvatarErrorCode =
  | 'unsupported_type'
  | 'file_too_large'
  | 'conversion_failed'
  | 'output_too_large'
  | 'upload_failed'
  | 'profile_failed'
  | 'remove_failed'

export class AvatarError extends Error {
  readonly code: AvatarErrorCode
  constructor(code: AvatarErrorCode, message: string) {
    super(message)
    this.name = 'AvatarError'
    this.code = code
  }
}

/** The canonical avatar object path for one user (lowercase UUID text). */
export function avatarPath(userId: string): string {
  return `${userId.trim().toLowerCase()}/avatar.webp`
}

export function validateAvatarInput(file: File): void {
  if (!(AVATAR_ACCEPTED_INPUT_TYPES as readonly string[]).includes(file.type)) {
    throw new AvatarError('unsupported_type', 'Use a JPEG, PNG, or WebP image.')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AvatarError('file_too_large', 'That image is too large. Use one under 15 MB.')
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality),
  )
}

/** Decode -> deterministic centre-crop to a square -> resize -> WebP. */
export async function fileToAvatarWebp(
  file: File,
  dimension = AVATAR_DIMENSION,
): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new AvatarError('conversion_failed', 'That image could not be read.')
  }

  const side = Math.min(bitmap.width, bitmap.height)
  const sx = Math.round((bitmap.width - side) / 2)
  const sy = Math.round((bitmap.height - side) / 2)

  const canvas = document.createElement('canvas')
  canvas.width = dimension
  canvas.height = dimension
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    throw new AvatarError('conversion_failed', 'Image conversion is unavailable.')
  }
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, dimension, dimension)
  bitmap.close?.()

  let blob = await canvasToBlob(canvas, 0.85)
  if (blob && blob.size > AVATAR_MAX_BYTES) {
    blob = await canvasToBlob(canvas, 0.7)
  }
  if (!blob) {
    throw new AvatarError('conversion_failed', 'Image conversion failed.')
  }
  if (blob.size > AVATAR_MAX_BYTES) {
    throw new AvatarError('output_too_large', 'That image is too detailed to store.')
  }
  return blob
}

export type AvatarUploadResult = { path: string; updatedAt: string }

/**
 * Validate -> convert -> upsert the canonical avatar object -> point the
 * profile row at it. `convert` is injectable so tests do not need a canvas.
 */
export async function uploadAvatar(
  client: BrowserSupabaseClient,
  userId: string,
  file: File,
  convert: (f: File) => Promise<Blob> = fileToAvatarWebp,
): Promise<AvatarUploadResult> {
  validateAvatarInput(file)
  const path = avatarPath(userId)
  const blob = await convert(file)

  const upload = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/webp' })
  if (upload.error) {
    throw new AvatarError('upload_failed', 'Could not upload the photo. Try again.')
  }

  const updatedAt = new Date().toISOString()
  const { error: profileError } = await client
    .from('profiles')
    .update({ avatar_path: path, avatar_updated_at: updatedAt })
    .eq('id', userId)
  if (profileError) {
    // Partial failure: the object is stored but the profile is not pointing at
    // it. Surface it - the UI keeps showing initials, and a Replace re-links.
    throw new AvatarError(
      'profile_failed',
      'The photo uploaded but could not be linked to your profile.',
    )
  }

  evictAvatarUrl(path)
  return { path, updatedAt }
}

/**
 * Remove the custom avatar (returns to initials). Nulls the profile columns
 * FIRST so the UI recovers even if the object delete fails; the residual object
 * can be removed later by its owner via the DELETE policy.
 */
export async function removeAvatar(
  client: BrowserSupabaseClient,
  userId: string,
): Promise<void> {
  const path = avatarPath(userId)

  const { error: profileError } = await client
    .from('profiles')
    .update({ avatar_path: null, avatar_updated_at: null })
    .eq('id', userId)
  if (profileError) {
    throw new AvatarError('remove_failed', 'Could not remove your profile photo.')
  }

  try {
    await client.storage.from(AVATAR_BUCKET).remove([path])
  } catch {
    /* orphan object; owner can clean up later */
  }
  evictAvatarUrl(path)
}

/* ----------------------- signed-URL cache (memory only) ----------------------- */

type CacheEntry = { url: string; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<string | null>>()

function fresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return entry !== undefined && entry.expiresAt - REFRESH_MARGIN_MS > Date.now()
}

/** Resolve (and memory-cache) the signed URL for the avatar path. Never throws. */
export async function resolveAvatarUrl(
  client: BrowserSupabaseClient,
  path: string,
): Promise<string | null> {
  const cached = cache.get(path)
  if (fresh(cached)) {
    return cached.url
  }
  const existing = inFlight.get(path)
  if (existing) {
    return existing
  }
  const request = (async (): Promise<string | null> => {
    try {
      const { data, error } = await client.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS)
      if (error || !data?.signedUrl) {
        return null
      }
      cache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + AVATAR_SIGNED_URL_TTL_SECONDS * 1000,
      })
      return data.signedUrl
    } catch {
      return null
    } finally {
      inFlight.delete(path)
    }
  })()
  inFlight.set(path, request)
  return request
}

export function evictAvatarUrl(path: string): void {
  cache.delete(path)
  inFlight.delete(path)
}

/** Test-only. */
export function __clearAvatarUrlCache(): void {
  cache.clear()
  inFlight.clear()
}

export type AvatarUrlState = {
  url: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}
const IDLE: AvatarUrlState = { url: null, status: 'idle' }
const LOADING: AvatarUrlState = { url: null, status: 'loading' }

/** React hook: resolves the signed avatar URL, keyed by path + version. */
export function useAvatarUrl(
  client: BrowserSupabaseClient | null | undefined,
  path: string | null | undefined,
  version?: string | number | null,
): AvatarUrlState {
  const active = Boolean(client && path)
  const key = active ? `${path}::${version ?? ''}` : ''
  const [resolved, setResolved] = useState<{ key: string; state: AvatarUrlState }>({
    key: '',
    state: IDLE,
  })

  useEffect(() => {
    if (!client || !path) {
      return
    }
    let cancelled = false
    resolveAvatarUrl(client, path).then((url) => {
      if (cancelled) {
        return
      }
      setResolved({
        key,
        state: url ? { url, status: 'ready' } : { url: null, status: 'error' },
      })
    })
    return () => {
      cancelled = true
    }
  }, [client, path, key])

  if (!active) {
    return IDLE
  }
  return resolved.key === key ? resolved.state : LOADING
}
