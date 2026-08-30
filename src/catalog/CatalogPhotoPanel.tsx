import { useRef, useState } from 'react'
import { recognizeCover } from '../lib/vision/client.ts'
import { downscaleImageToDataUrl, validateImageFile } from '../lib/vision/image.ts'
import { buildCatalogQueryFromRecognition } from '../lib/vision/query.ts'
import { RecognitionError, type CoverRecognition } from '../lib/vision/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import {
  clearPhotoRecognitionDraft,
  loadPhotoRecognitionDraft,
  savePhotoRecognitionDraft,
} from './photoRecognitionDraft.ts'

type CatalogPhotoPanelProps = {
  client: BrowserSupabaseClient
  onUseQuery: (query: string) => void
  /**
   * Authenticated user id. When present, recognition clues + the derived query
   * survive a refresh / same-tab navigation via sessionStorage (no new
   * recognition call on restore).
   */
  userId?: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof RecognitionError || error instanceof Error) {
    return error.message
  }

  return 'Photo recognition failed. Please try again.'
}

function clueSummary(recognition: CoverRecognition): string[] {
  const lines: string[] = []

  if (recognition.artist) {
    lines.push(`Artist: ${recognition.artist}`)
  }

  if (recognition.albumTitle) {
    lines.push(`Album: ${recognition.albumTitle}`)
  }

  if (recognition.label) {
    lines.push(`Label hint: ${recognition.label}`)
  }

  if (recognition.catalogNumber) {
    lines.push(`Catalog number hint: ${recognition.catalogNumber}`)
  }

  if (recognition.releaseYearHint !== null) {
    lines.push(`Year hint: ${recognition.releaseYearHint}`)
  }

  if (recognition.visibleText.length > 0) {
    lines.push(`Visible text: ${recognition.visibleText.join(' | ')}`)
  }

  return lines
}

export function CatalogPhotoPanel({
  client,
  onUseQuery,
  userId,
}: CatalogPhotoPanelProps) {
  const [restoredDraft] = useState(() =>
    userId ? loadPhotoRecognitionDraft(userId) : null,
  )
  const [fileName, setFileName] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [recognizeError, setRecognizeError] = useState<string | null>(null)
  const [recognition, setRecognition] = useState<CoverRecognition | null>(
    restoredDraft?.recognition ?? null,
  )
  const [derivedQuery, setDerivedQuery] = useState(
    restoredDraft?.derivedQuery ?? '',
  )
  const recognizeInProgress = useRef(false)

  function persistDraft(nextRecognition: CoverRecognition, nextQuery: string) {
    if (userId) {
      savePhotoRecognitionDraft(userId, {
        recognition: nextRecognition,
        derivedQuery: nextQuery,
      })
    }
  }

  function handleDerivedQueryChange(nextQuery: string) {
    setDerivedQuery(nextQuery)

    if (recognition) {
      persistDraft(recognition, nextQuery)
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    // Selecting a new image invalidates any stored clues immediately so stale
    // recognition is never shown for a different photo.
    if (userId) {
      clearPhotoRecognitionDraft(userId)
    }
    setRecognition(null)
    setDerivedQuery('')
    setRecognizeError(null)

    if (!file) {
      setSelectedFile(null)
      setFileName(null)
      return
    }

    try {
      validateImageFile(file)
      setSelectedFile(file)
      setFileName(file.name)
    } catch (error) {
      setSelectedFile(null)
      setFileName(null)
      setRecognizeError(getErrorMessage(error))
    }
  }

  async function handleRecognize() {
    if (recognizeInProgress.current || !selectedFile) {
      return
    }

    recognizeInProgress.current = true
    setIsRecognizing(true)
    setRecognizeError(null)
    setRecognition(null)
    setDerivedQuery('')

    try {
      const imageDataUrl = await downscaleImageToDataUrl(selectedFile)
      const result = await recognizeCover(client, imageDataUrl)
      const nextQuery = buildCatalogQueryFromRecognition(result) ?? ''
      setRecognition(result)
      setDerivedQuery(nextQuery)
      persistDraft(result, nextQuery)
    } catch (error) {
      setRecognizeError(getErrorMessage(error))
    } finally {
      recognizeInProgress.current = false
      setIsRecognizing(false)
    }
  }

  const clues = recognition ? clueSummary(recognition) : []
  const canSearch = derivedQuery.trim().length >= 2
  const identified = recognition?.identified === true && clues.length > 0

  return (
    <section className="catalog-photo-panel" aria-labelledby="catalog-photo-title">
      <div>
        <p className="eyebrow">Add by photo</p>
        <h3 id="catalog-photo-title">Recognize from a cover photo</h3>
      </div>

      <label className="catalog-photo-input">
        Cover photo
        <input
          accept="image/*"
          capture="environment"
          disabled={isRecognizing}
          onChange={handleFileChange}
          type="file"
        />
      </label>

      {fileName ? <p className="field-hint">Selected: {fileName}</p> : null}

      <div className="auth-actions">
        <button
          disabled={!selectedFile || isRecognizing}
          onClick={() => void handleRecognize()}
          type="button"
        >
          {isRecognizing ? 'Recognizing...' : 'Recognize cover'}
        </button>
      </div>

      {recognizeError ? <p className="error">{recognizeError}</p> : null}

      {recognition && !identified ? (
        <p className="field-hint">
          We could not read enough from that photo. Use the manual search below.
        </p>
      ) : null}

      {identified ? (
        <div className="catalog-photo-result">
          <ul className="catalog-photo-clues">
            {clues.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="field-hint">
            These clues are only a starting point. Edit the search below, then
            search MusicBrainz and confirm the correct release yourself.
          </p>
          <label className="catalog-photo-query">
            Search from these clues
            <input
              onChange={(event) => handleDerivedQueryChange(event.target.value)}
              type="text"
              value={derivedQuery}
            />
          </label>
          <div className="auth-actions">
            <button
              disabled={!canSearch}
              onClick={() => onUseQuery(derivedQuery.trim())}
              type="button"
            >
              Search catalog for these clues
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
