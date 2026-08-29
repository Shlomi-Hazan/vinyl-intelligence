/**
 * Session persistence for the manual "Add record" form.
 *
 * Persists ONLY the user-entered draft field values, scoped to the
 * authenticated user, so partially entered work survives a refresh or same-tab
 * navigation while the user looks up missing release details. Restoring the
 * draft only repopulates inputs; it never submits, inserts, or validates.
 *
 * Never persisted: saved rows, database ids, server responses, tokens,
 * validation messages, or submitting/success state.
 */
import {
  buildUserSessionKey,
  removeSessionKey,
  safeReadSessionJson,
  safeWriteSessionJson,
} from '../lib/session/sessionDraft.ts'
import type { ManualReleaseInput } from '../lib/supabase/collection.ts'

const NAMESPACE = 'manual-collection-draft'

const FIELDS: readonly (keyof ManualReleaseInput)[] = [
  'artist',
  'title',
  'releaseYear',
  'label',
  'catalogNumber',
  'country',
  'format',
]

function parseDraft(value: unknown): ManualReleaseInput | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const draft = {} as ManualReleaseInput

  for (const field of FIELDS) {
    if (typeof candidate[field] !== 'string') {
      return null
    }

    draft[field] = candidate[field] as string
  }

  return draft
}

function isEmptyDraft(draft: ManualReleaseInput): boolean {
  return FIELDS.every((field) => draft[field].trim().length === 0)
}

export function loadManualCollectionDraft(
  userId: string,
): ManualReleaseInput | null {
  return safeReadSessionJson(buildUserSessionKey(NAMESPACE, userId), parseDraft)
}

export function saveManualCollectionDraft(
  userId: string,
  draft: ManualReleaseInput,
): void {
  const key = buildUserSessionKey(NAMESPACE, userId)

  // An all-blank form is not "unsaved work"; drop the key instead of storing
  // an empty record.
  if (isEmptyDraft(draft)) {
    removeSessionKey(key)
    return
  }

  const payload = {} as ManualReleaseInput

  for (const field of FIELDS) {
    payload[field] = draft[field]
  }

  safeWriteSessionJson(key, payload)
}

export function clearManualCollectionDraft(userId: string): void {
  removeSessionKey(buildUserSessionKey(NAMESPACE, userId))
}
