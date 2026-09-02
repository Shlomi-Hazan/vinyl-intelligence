import { useState } from 'react'
import { Button } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import {
  PERSONAL_GENRE_MAX_LENGTH,
  PERSONAL_GENRES_MAX,
  normalizePersonalGenres,
  updateCollectionItemPersonalGenres,
} from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

/*
 * Phase D (8D-2). Catalog genres are shared, authoritative, and read-only to
 * the browser; a collector adds their OWN genres on the collection item they
 * own. This editor manages only `personal_genres` - it never touches the
 * shared `releases` row.
 */

type Props = {
  client: BrowserSupabaseClient
  collectionItemId: string
  /** Catalog genres from the release - shown read-only for context, no removal. */
  catalogGenres: readonly string[]
  personalGenres: readonly string[]
  /** Reload the collection so the rest of the app sees the new genres. */
  onSaved: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not save your genres.'
}

export function PersonalGenresEditor({
  client,
  collectionItemId,
  catalogGenres,
  personalGenres,
  onSaved,
}: Props) {
  const [genres, setGenres] = useState<string[]>(() => [...personalGenres])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function persist(next: string[]) {
    setMessage(null)
    setBusy(true)
    const previous = genres
    setGenres(next)
    try {
      const saved = await updateCollectionItemPersonalGenres(
        client,
        collectionItemId,
        next,
      )
      setGenres(saved)
      onSaved()
    } catch (error) {
      setGenres(previous)
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const catalogNormalized = catalogGenres.map((g) => g.trim().toLocaleLowerCase())

  function addDraft() {
    let candidate: string[]
    try {
      candidate = normalizePersonalGenres([draft])
    } catch (error) {
      setMessage(errorText(error))
      return
    }
    const value = candidate[0]
    if (!value) {
      setDraft('')
      return
    }
    if (catalogNormalized.includes(value)) {
      // The shared catalog release already carries this genre; adding it as a
      // personal genre would only show a confusing duplicate chip. Effective
      // filtering already includes it.
      setMessage('That genre is already listed under the catalog genres.')
      return
    }
    if (genres.includes(value)) {
      setDraft('')
      return
    }
    let next: string[]
    try {
      next = normalizePersonalGenres([...genres, value])
    } catch (error) {
      setMessage(errorText(error))
      return
    }
    setDraft('')
    void persist(next)
  }

  function removeAt(value: string) {
    void persist(genres.filter((g) => g !== value))
  }

  const atLimit = genres.length >= PERSONAL_GENRES_MAX

  return (
    <div className="vi-genres">
      {catalogGenres.length > 0 ? (
        <div className="vi-genres__group">
          <p className="vi-genres__label">Genres</p>
          <ul className="vi-chiprow" aria-label="Catalog genres">
            {catalogGenres.map((g) => (
              <li key={g} className="vi-chip vi-chip--static">
                {g}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="vi-genres__group">
        <p className="vi-genres__label">Your genres</p>
        {genres.length > 0 ? (
          <ul className="vi-chiprow" aria-label="Your genres">
            {genres.map((g) => (
              <li key={g} className="vi-chip">
                {g}
                <button
                  type="button"
                  className="vi-chip__x"
                  aria-label={`Remove ${g}`}
                  disabled={busy}
                  onClick={() => removeAt(g)}
                >
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vi-hint">
            None yet. Add your own to make your collection easier to browse.
          </p>
        )}

        {atLimit ? (
          <p className="vi-hint">Up to {PERSONAL_GENRES_MAX} personal genres.</p>
        ) : (
          <div className="vi-genres__add">
            <input
              className="vi-input"
              type="text"
              value={draft}
              maxLength={PERSONAL_GENRE_MAX_LENGTH + 4}
              placeholder="e.g. west coast hip hop"
              aria-label="Add a genre"
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addDraft()
                }
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || draft.trim().length === 0}
              onClick={addDraft}
            >
              Add
            </Button>
          </div>
        )}

        {message ? (
          <p className="vi-error-text" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
