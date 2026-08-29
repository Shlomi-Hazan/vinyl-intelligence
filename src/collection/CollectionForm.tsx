import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  RELEASE_FIELD_LIMITS,
  normalizeManualReleaseInput,
  validateManualReleaseInput,
  type CollectionItemWithRelease,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'
import {
  clearManualCollectionDraft,
  loadManualCollectionDraft,
  saveManualCollectionDraft,
} from './manualCollectionDraft.ts'

type CollectionFormMode = 'add' | 'edit'

type CollectionFormProps = {
  mode: CollectionFormMode
  initialRelease?: CollectionItemWithRelease['release']
  onCancel?: () => void
  onSubmit: (input: ManualReleaseInput) => Promise<void>
  /**
   * Authenticated user id. When set (add mode only), the in-progress form draft
   * is persisted to sessionStorage so partially entered work survives a refresh
   * / same-tab navigation. Restoring only repopulates inputs — it never submits.
   */
  draftStorageUserId?: string
}

const emptyInput: ManualReleaseInput = {
  artist: '',
  title: '',
  releaseYear: '',
  label: '',
  catalogNumber: '',
  country: '',
  format: '',
}

function releaseToInput(
  release?: CollectionItemWithRelease['release'],
): ManualReleaseInput {
  if (!release) {
    return emptyInput
  }

  return {
    artist: release.artist,
    title: release.title,
    releaseYear: release.release_year?.toString() ?? '',
    label: release.label ?? '',
    catalogNumber: release.catalog_number ?? '',
    country: release.country ?? '',
    format: release.format ?? '',
  }
}

export function CollectionForm({
  mode,
  initialRelease,
  onCancel,
  onSubmit,
  draftStorageUserId,
}: CollectionFormProps) {
  // Draft persistence is only for the manual "Add record" form.
  const draftUserId = mode === 'add' ? draftStorageUserId : undefined
  const [restoredDraft] = useState(() =>
    draftUserId ? loadManualCollectionDraft(draftUserId) : null,
  )
  const [input, setInput] = useState<ManualReleaseInput>(
    () => restoredDraft ?? releaseToInput(initialRelease),
  )
  const [hasInteracted, setHasInteracted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validationErrors = useMemo(
    () => validateManualReleaseInput(normalizeManualReleaseInput(input)),
    [input],
  )

  // Persist the complete current draft after each user edit. Restoring the
  // draft on mount does not trigger this (it runs only once `hasInteracted`).
  useEffect(() => {
    if (!draftUserId || !hasInteracted) {
      return
    }

    saveManualCollectionDraft(draftUserId, input)
  }, [draftUserId, hasInteracted, input])

  function updateField(field: keyof ManualReleaseInput, value: string) {
    setHasInteracted(true)
    setInput((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasInteracted(true)
    setSubmitError(null)

    if (validationErrors.length > 0) {
      setSubmitError(validationErrors[0])
      return
    }

    setIsSubmitting(true)

    try {
      await onSubmit(input)
      if (mode === 'add') {
        setInput(emptyInput)
        setHasInteracted(false)
        setSubmitError(null)
        // The record is now durably saved, so the draft is no longer unsaved
        // work.
        if (draftUserId) {
          clearManualCollectionDraft(draftUserId)
        }
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Record could not be saved.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitLabel = mode === 'add' ? 'Add record' : 'Save record'
  const validationMessage = hasInteracted ? validationErrors[0] : null

  return (
    <form className="collection-form" onSubmit={handleSubmit}>
      <div className="collection-form-grid">
        <label>
          Artist
          <input
            maxLength={RELEASE_FIELD_LIMITS.artist + 8}
            name="artist"
            onChange={(event) => updateField('artist', event.target.value)}
            required
            type="text"
            value={input.artist}
          />
        </label>

        <label>
          Title
          <input
            maxLength={RELEASE_FIELD_LIMITS.title + 8}
            name="title"
            onChange={(event) => updateField('title', event.target.value)}
            required
            type="text"
            value={input.title}
          />
        </label>

        <label>
          Release year
          <input
            inputMode="numeric"
            name="releaseYear"
            onChange={(event) => updateField('releaseYear', event.target.value)}
            placeholder="Optional"
            type="text"
            value={input.releaseYear}
          />
        </label>

        <label>
          Label
          <input
            maxLength={RELEASE_FIELD_LIMITS.label + 8}
            name="label"
            onChange={(event) => updateField('label', event.target.value)}
            placeholder="Optional"
            type="text"
            value={input.label}
          />
        </label>

        <label>
          Catalog number
          <input
            maxLength={RELEASE_FIELD_LIMITS.catalogNumber + 8}
            name="catalogNumber"
            onChange={(event) => updateField('catalogNumber', event.target.value)}
            placeholder="Optional"
            type="text"
            value={input.catalogNumber}
          />
        </label>

        <label>
          Country
          <input
            maxLength={RELEASE_FIELD_LIMITS.country + 8}
            name="country"
            onChange={(event) => updateField('country', event.target.value)}
            placeholder="Optional"
            type="text"
            value={input.country}
          />
        </label>

        <label>
          Format
          <input
            maxLength={RELEASE_FIELD_LIMITS.format + 8}
            name="format"
            onChange={(event) => updateField('format', event.target.value)}
            placeholder="Optional"
            type="text"
            value={input.format}
          />
        </label>
      </div>

      {validationMessage ? <p className="error">{validationMessage}</p> : null}
      {submitError ? <p className="error">{submitError}</p> : null}

      <div className="auth-actions">
        <button disabled={isSubmitting || validationErrors.length > 0} type="submit">
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
        {onCancel ? (
          <button disabled={isSubmitting} onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
