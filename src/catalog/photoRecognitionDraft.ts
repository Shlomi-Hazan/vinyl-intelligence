/**
 * Session persistence for the "Add by photo" panel.
 *
 * Persists ONLY the normalized {@link CoverRecognition} clues and the current
 * editable derived MusicBrainz query, scoped to the authenticated user. This
 * lets a refresh or same-tab navigation restore the clues without another paid
 * OpenRouter recognition call.
 *
 * Never persisted: the image, the File, base64 / data URLs, the prompt, the raw
 * provider response, any token, or the MusicBrainz candidate list.
 */
import {
  buildUserSessionKey,
  removeSessionKey,
  safeReadSessionJson,
  safeWriteSessionJson,
} from '../lib/session/sessionDraft.ts'
import type { CoverRecognition } from '../lib/vision/types.ts'

const NAMESPACE = 'cover-recognition'

export type PhotoRecognitionDraft = {
  recognition: CoverRecognition
  derivedQuery: string
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function parseRecognition(value: unknown): CoverRecognition | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (
    !isStringOrNull(candidate.artist)
    || !isStringOrNull(candidate.albumTitle)
    || !isStringOrNull(candidate.label)
    || !isStringOrNull(candidate.catalogNumber)
    || !isStringOrNull(candidate.notes)
    || !isNumberOrNull(candidate.releaseYearHint)
    || typeof candidate.confidence !== 'number'
    || typeof candidate.identified !== 'boolean'
    || !Array.isArray(candidate.visibleText)
    || !candidate.visibleText.every((line) => typeof line === 'string')
  ) {
    return null
  }

  return {
    artist: candidate.artist,
    albumTitle: candidate.albumTitle,
    visibleText: candidate.visibleText,
    label: candidate.label,
    catalogNumber: candidate.catalogNumber,
    releaseYearHint: candidate.releaseYearHint,
    confidence: candidate.confidence,
    notes: candidate.notes,
    identified: candidate.identified,
  }
}

function parseDraft(value: unknown): PhotoRecognitionDraft | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.derivedQuery !== 'string') {
    return null
  }

  const recognition = parseRecognition(candidate.recognition)

  if (!recognition) {
    return null
  }

  return { recognition, derivedQuery: candidate.derivedQuery }
}

export function loadPhotoRecognitionDraft(
  userId: string,
): PhotoRecognitionDraft | null {
  return safeReadSessionJson(buildUserSessionKey(NAMESPACE, userId), parseDraft)
}

export function savePhotoRecognitionDraft(
  userId: string,
  draft: PhotoRecognitionDraft,
): void {
  safeWriteSessionJson(buildUserSessionKey(NAMESPACE, userId), {
    recognition: draft.recognition,
    derivedQuery: draft.derivedQuery,
  })
}

export function clearPhotoRecognitionDraft(userId: string): void {
  removeSessionKey(buildUserSessionKey(NAMESPACE, userId))
}
