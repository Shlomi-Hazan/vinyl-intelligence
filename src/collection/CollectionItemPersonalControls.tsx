import { useState } from 'react'
import {
  NOTE_MAX_LENGTH,
  updateCollectionItemPersonalSignals,
  type CollectionItemPersonalSignals,
  type CollectionItemWithRelease,
} from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type SavedSignals = CollectionItemPersonalSignals & { id: string }

type CollectionItemPersonalControlsProps = {
  client: BrowserSupabaseClient
  item: CollectionItemWithRelease
  onSignalsSaved: (itemId: string, saved: SavedSignals) => void
}

const RATING_VALUES = [1, 2, 3, 4, 5] as const

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return "Couldn't save. Please try again."
}

export function CollectionItemPersonalControls({
  client,
  item,
  onSignalsSaved,
}: CollectionItemPersonalControlsProps) {
  const [rating, setRating] = useState<number | null>(item.rating)
  const [isFavorite, setIsFavorite] = useState(item.is_favorite)
  const [savedNote, setSavedNote] = useState(item.notes ?? '')
  const [noteDraft, setNoteDraft] = useState(item.notes ?? '')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Favorite and rating persist immediately. Only the mutated key is sent, so
  // an unsaved note draft is never written by a favorite/rating change.
  async function persistImmediate(
    patch: { rating: number | null } | { is_favorite: boolean },
    applyOptimistic: () => void,
    revert: () => void,
  ) {
    setError(null)
    applyOptimistic()

    try {
      const saved = await updateCollectionItemPersonalSignals(client, item.id, patch)
      onSignalsSaved(item.id, saved)
      // The response is authoritative for every signal; sync the two the user
      // is not currently editing, and leave the note draft untouched.
      setRating(saved.rating)
      setIsFavorite(saved.is_favorite)
      setSavedNote(saved.notes ?? '')
    } catch (caught) {
      revert()
      setError(getErrorMessage(caught))
    }
  }

  function toggleFavorite() {
    const next = !isFavorite
    const previous = isFavorite
    void persistImmediate(
      { is_favorite: next },
      () => setIsFavorite(next),
      () => setIsFavorite(previous),
    )
  }

  function chooseRating(value: number) {
    const previous = rating
    void persistImmediate(
      { rating: value },
      () => setRating(value),
      () => setRating(previous),
    )
  }

  function clearRating() {
    const previous = rating
    void persistImmediate(
      { rating: null },
      () => setRating(null),
      () => setRating(previous),
    )
  }

  async function saveNote() {
    setError(null)
    setIsSavingNote(true)

    try {
      const saved = await updateCollectionItemPersonalSignals(client, item.id, {
        notes: noteDraft,
      })
      onSignalsSaved(item.id, saved)
      setRating(saved.rating)
      setIsFavorite(saved.is_favorite)
      setSavedNote(saved.notes ?? '')
      setNoteDraft(saved.notes ?? '')
    } catch (caught) {
      // Keep the user's draft text; the persisted note is unchanged.
      setError(getErrorMessage(caught))
    } finally {
      setIsSavingNote(false)
    }
  }

  const noteDirty = noteDraft !== savedNote

  return (
    <div className="collection-card-personal">
      <div className="collection-personal-row">
        <button
          aria-label="Favorite this record"
          aria-pressed={isFavorite}
          className="collection-favorite-toggle"
          onClick={toggleFavorite}
          type="button"
        >
          {isFavorite ? '★ Favorite' : '☆ Favorite'}
        </button>

        <span className="collection-rating" role="group" aria-label="Rating">
          {RATING_VALUES.map((value) => (
            <button
              aria-label={`Rate ${value} star${value === 1 ? '' : 's'}`}
              aria-pressed={rating === value}
              className="collection-rating-star"
              key={value}
              onClick={() => chooseRating(value)}
              type="button"
            >
              {rating !== null && value <= rating ? '★' : '☆'}
            </button>
          ))}
          {rating !== null ? (
            <button
              className="collection-rating-clear"
              onClick={clearRating}
              type="button"
            >
              Clear rating
            </button>
          ) : (
            <span className="field-hint">Unrated</span>
          )}
        </span>
      </div>

      <label className="collection-note">
        Personal note
        <textarea
          maxLength={NOTE_MAX_LENGTH}
          onChange={(event) => setNoteDraft(event.target.value)}
          rows={2}
          value={noteDraft}
        />
      </label>
      <div className="collection-personal-row">
        <button disabled={isSavingNote} onClick={() => void saveNote()} type="button">
          {isSavingNote ? 'Saving...' : 'Save note'}
        </button>
        <span aria-live="polite" className="field-hint">
          {noteDraft.length} / {NOTE_MAX_LENGTH}
          {noteDirty ? ' - unsaved' : ''}
        </span>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
