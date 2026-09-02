import { useRef, useState } from 'react'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { CollectionForm } from '../collection/CollectionForm.tsx'
import { Vinny } from '../brand/Vinny.tsx'
import { Button } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { recognizeCover } from '../lib/vision/client.ts'
import { downscaleImageToDataUrl, validateImageFile } from '../lib/vision/image.ts'
import { buildCatalogQueryFromRecognition } from '../lib/vision/query.ts'
import { RecognitionError, type CoverRecognition } from '../lib/vision/types.ts'
import {
  addCatalogReleaseToCollection,
  searchCatalog,
} from '../lib/catalog/client.ts'
import {
  addManualCollectionItem,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

/*
 * Phase C: a step-based photo-recognition -> confirm -> add experience around
 * the EXISTING recognition + catalog logic (recognizeCover, image downscale,
 * buildCatalogQueryFromRecognition, searchCatalog, addCatalogReleaseToCollection
 * - all unchanged). The recognition image is never persisted. VIN never adds a
 * guessed release: a candidate is saved only on an explicit confirm.
 */

type ScanState =
  | { k: 'idle' }
  | { k: 'invalid'; message: string }
  | { k: 'analyzing' }
  | { k: 'searching'; recognition: CoverRecognition; query: string }
  | { k: 'low_confidence'; recognition: CoverRecognition; query: string | null }
  | {
      k: 'candidates'
      recognition: CoverRecognition
      query: string
      candidates: CatalogCandidate[]
    }
  | { k: 'no_match'; query: string }
  | { k: 'success' }
  | { k: 'model_error'; message: string }
  | { k: 'provider_error'; message: string; query: string }

type ScanPanelProps = {
  client: BrowserSupabaseClient
  userId: string
  onCollectionChanged: () => void
  /** "search by text instead" -> hand the derived query to Discover. */
  onSearchByText: (query: string) => void
}

const STEPS = ['Photo', 'Analyse', 'Catalogue', 'Confirm'] as const

function stepIndex(state: ScanState): number {
  switch (state.k) {
    case 'idle':
    case 'invalid':
      return 0
    case 'analyzing':
      return 1
    case 'searching':
    case 'low_confidence':
      return 2
    case 'candidates':
    case 'no_match':
    case 'provider_error':
      return 3
    case 'success':
      return 4
    case 'model_error':
      return 1
  }
}

function recognitionError(error: unknown): ScanState {
  if (error instanceof RecognitionError) {
    if (
      error.code === 'unsupported_media_type' ||
      error.code === 'image_too_large'
    ) {
      return { k: 'invalid', message: error.message }
    }
    return { k: 'model_error', message: error.message }
  }
  return {
    k: 'model_error',
    message: error instanceof Error ? error.message : 'Recognition failed.',
  }
}

function clueList(r: CoverRecognition): string[] {
  const out: string[] = []
  if (r.artist) out.push(`Artist: ${r.artist}`)
  if (r.albumTitle) out.push(`Album: ${r.albumTitle}`)
  if (r.label) out.push(`Label: ${r.label}`)
  if (r.catalogNumber) out.push(`Cat #: ${r.catalogNumber}`)
  if (r.releaseYearHint !== null) out.push(`Year ~ ${r.releaseYearHint}`)
  return out
}

function candidateMeta(c: CatalogCandidate): string {
  return [c.releaseYear?.toString() ?? null, c.label, c.country, c.format]
    .filter((x): x is string => Boolean(x))
    .join(' · ')
}

export function ScanPanel({
  client,
  userId,
  onCollectionChanged,
  onSearchByText,
}: ScanPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [state, setState] = useState<ScanState>({ k: 'idle' })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const busy = useRef(false)

  function pickFile(next: File | undefined) {
    setState({ k: 'idle' })
    setShowManual(false)
    setAddError(null)
    if (!next) {
      setFile(null)
      setFileName(null)
      return
    }
    try {
      validateImageFile(next)
      setFile(next)
      setFileName(next.name)
    } catch (error) {
      setFile(null)
      setFileName(null)
      setState({
        k: 'invalid',
        message:
          error instanceof RecognitionError || error instanceof Error
            ? error.message
            : 'That image cannot be used.',
      })
    }
  }

  async function analyse() {
    if (busy.current || !file) {
      return
    }
    busy.current = true
    setState({ k: 'analyzing' })
    try {
      const dataUrl = await downscaleImageToDataUrl(file)
      const recognition = await recognizeCover(client, dataUrl)
      const query = buildCatalogQueryFromRecognition(recognition)
      const clues = clueList(recognition)
      if (!recognition.identified || clues.length === 0 || !query) {
        setState({ k: 'low_confidence', recognition, query })
        return
      }
      setState({ k: 'searching', recognition, query })
      try {
        const candidates = await searchCatalog(client, query)
        setState(
          candidates.length > 0
            ? { k: 'candidates', recognition, query, candidates }
            : { k: 'no_match', query },
        )
      } catch (error) {
        setState({
          k: 'provider_error',
          message: error instanceof Error ? error.message : 'Catalog search failed.',
          query,
        })
      }
    } catch (error) {
      setState(recognitionError(error))
    } finally {
      busy.current = false
    }
  }

  async function confirm(candidate: CatalogCandidate) {
    setSavingId(candidate.providerReleaseId)
    setAddError(null)
    try {
      await addCatalogReleaseToCollection(client, candidate)
      onCollectionChanged()
      setState({ k: 'success' })
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Could not add that record.')
    } finally {
      setSavingId(null)
    }
  }

  async function addManual(input: ManualReleaseInput) {
    await addManualCollectionItem(client, input)
    onCollectionChanged()
    setState({ k: 'success' })
  }

  function reset() {
    setFile(null)
    setFileName(null)
    setShowManual(false)
    setAddError(null)
    setState({ k: 'idle' })
  }

  const active = stepIndex(state)
  const thinking = state.k === 'analyzing' || state.k === 'searching'

  return (
    <div className="vi-scan">
      <ol className="vi-scan__steps" aria-label="Scan progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className="vi-scan__step"
            data-state={i < active ? 'done' : i === active ? 'active' : 'todo'}
          >
            <span className="vi-scan__dot">{i < active ? '✓' : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="vi-scan__panel">
        {/* ---- capture ---- */}
        {state.k === 'idle' || state.k === 'invalid' ? (
          <>
            <label className="vi-scan__drop">
              <Icon name="scan" size={28} />
              <span>
                {fileName
                  ? `Selected: ${fileName}`
                  : 'Take or upload a photo of the record cover'}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="vi-visually-hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <span className="vi-btn vi-btn--secondary vi-btn--sm">
                Choose image
              </span>
            </label>
            {state.k === 'invalid' ? (
              <p className="vi-error-text" role="alert">
                {state.message}
              </p>
            ) : null}
            {file ? (
              <Button variant="primary" onClick={() => void analyse()}>
                Analyse cover
              </Button>
            ) : null}
          </>
        ) : null}

        {/* ---- analysing / searching ---- */}
        {state.k === 'analyzing' || state.k === 'searching' ? (
          <div className="vi-scan__figure" aria-live="polite">
            <Vinny state="thinking" size={150} />
            <p>
              {state.k === 'analyzing'
                ? 'Reading the cover…'
                : 'Searching the catalogue…'}
            </p>
          </div>
        ) : null}

        {/* ---- low confidence ---- */}
        {state.k === 'low_confidence' ? (
          <div className="vi-scan__figure" aria-live="polite">
            <Vinny state="no-match" size={150} />
            <p>VIN could not read enough from that photo to be sure.</p>
            <div className="vi-candidate__actions">
              {state.query ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSearchByText(state.query as string)}
                >
                  Search by text instead
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setShowManual(true)}>
                Add manually
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Retake photo
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---- no catalog match ---- */}
        {state.k === 'no_match' ? (
          <div className="vi-scan__figure" aria-live="polite">
            <Vinny state="no-match" size={150} />
            <p>No catalogue release matched those clues.</p>
            <div className="vi-candidate__actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSearchByText(state.query)}
              >
                Refine the search in Discover
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowManual(true)}>
                Add manually
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Retake photo
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---- provider / model errors (kept distinct from "no match") ---- */}
        {state.k === 'provider_error' || state.k === 'model_error' ? (
          <div className="vi-errorstate" role="alert">
            <Icon name="alert" size={20} />
            <p>{state.message}</p>
            <div className="vi-candidate__actions">
              {state.k === 'provider_error' ? (
                <Button variant="secondary" size="sm" onClick={() => void analyse()}>
                  Try again
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={reset}>
                  Start over
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {/* ---- candidates ---- */}
        {state.k === 'candidates' ? (
          <>
            <div className="vi-scan__clues" aria-label="Recognition clues">
              {clueList(state.recognition).map((c) => (
                <span key={c} className="vi-scan__clue">
                  {c}
                </span>
              ))}
            </div>
            <p className="vi-hint">
              These are only clues. Pick the release that matches your record —
              nothing is saved until you confirm.
            </p>
            <ul className="vi-candidate__list" aria-label="Catalogue candidates">
              {state.candidates.map((c) => (
                <li key={c.providerReleaseId}>
                  <article className="vi-candidate">
                    <span className="vi-candidate__art">
                      <AlbumArtwork
                        size="thumb"
                        artist={c.artist}
                        title={c.title}
                        seedId={c.providerReleaseId}
                        releaseMbid={c.providerReleaseId}
                        releaseGroupMbid={c.providerReleaseGroupId}
                      />
                    </span>
                    <div className="vi-candidate__body">
                      <p className="vi-candidate__artist">{c.artist}</p>
                      <h3 className="vi-candidate__title">{c.title}</h3>
                      {candidateMeta(c) ? (
                        <p className="vi-candidate__meta">{candidateMeta(c)}</p>
                      ) : null}
                      <div className="vi-candidate__actions">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={savingId === c.providerReleaseId}
                          onClick={() => void confirm(c)}
                        >
                          {savingId === c.providerReleaseId
                            ? 'Adding…'
                            : 'This is it — add'}
                        </Button>
                        <a
                          className="vi-btn vi-btn--ghost vi-btn--sm"
                          href={c.derivedProviderPageUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          MusicBrainz
                        </a>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
            {addError ? (
              <p className="vi-error-text" role="alert">
                {addError}
              </p>
            ) : null}
            <div className="vi-candidate__actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSearchByText(state.query)}
              >
                None of these — search by text
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowManual(true)}>
                Add manually
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Retake photo
              </Button>
            </div>
          </>
        ) : null}

        {/* ---- success ---- */}
        {state.k === 'success' ? (
          <div className="vi-scan__figure" aria-live="polite">
            <Vinny state="success" size={150} />
            <p>Added to your collection.</p>
            <div className="vi-candidate__actions">
              <Button variant="secondary" size="sm" onClick={reset}>
                Scan another
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---- manual fallback (shared) ---- */}
        {showManual && state.k !== 'success' ? (
          <div className="legacy-host vi-manual-add">
            <h3 style={{ fontFamily: 'var(--font-display)' }}>Add a record manually</h3>
            <CollectionForm
              mode="add"
              draftStorageUserId={userId}
              onSubmit={addManual}
              onCancel={() => setShowManual(false)}
            />
          </div>
        ) : null}
      </div>

      <p className="vi-hint" aria-hidden={thinking ? 'true' : undefined}>
        Your photo is used only to find the record. It is never saved.
      </p>
    </div>
  )
}
