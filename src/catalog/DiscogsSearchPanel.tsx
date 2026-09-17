import { useState } from 'react'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { BidiJoin, BidiText } from '../components/BidiText.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Button, SearchInput } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { SkeletonAlbumCard } from '../ui/feedback.tsx'
import { DiscogsAttribution } from './DiscogsAttribution.tsx'
import {
  addCatalogReleaseToCollection,
  lookupDiscogsCatalogRelease,
  searchDiscogsCatalog,
} from '../lib/catalog/client.ts'
import { isExactCatalogReleaseOwned } from '../lib/catalog/ownedRelease.ts'
import type { DiscogsSearchResultItem } from '../lib/catalog/discogs.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { LoadPhase } from '../app/collection-data-context.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type DiscogsSearchPanelProps = {
  client: BrowserSupabaseClient
  ownedItems: CollectionItemWithRelease[]
  collectionStatus: LoadPhase
  onCollectionChanged: () => void
}

type SearchPhase = 'idle' | 'loading' | 'results' | 'no-results' | 'error'
type PreviewPhase = 'idle' | 'loading' | 'error'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'That did not work. Try again.'
}

function candidateMetaParts(c: CatalogCandidate): string[] {
  return [
    c.releaseYear?.toString() ?? null,
    c.label,
    c.catalogNumber,
    c.country,
    c.format,
  ].filter((x): x is string => Boolean(x))
}

function resultMetaParts(r: DiscogsSearchResultItem): string[] {
  return [
    r.releaseYear?.toString() ?? null,
    r.country,
    r.formatSummary,
    r.label,
    r.catalogNumber,
  ].filter((x): x is string => Boolean(x))
}

/**
 * The Discogs fallback search (spec 0018 §6/§8): its own, fully independent
 * React state, never auto-triggered. Every rendered result already displays
 * real Discogs data, so every result carries its own compact attribution
 * mark - in addition to, not instead of, the confirmation dialog's own full
 * attribution.
 */
export function DiscogsSearchPanel({
  client,
  ownedItems,
  collectionStatus,
  onCollectionChanged,
}: DiscogsSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<SearchPhase>('idle')
  const [results, setResults] = useState<DiscogsSearchResultItem[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('idle')
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  // The result a settled `previewError` belongs to - kept separate from
  // `previewingId` (which clears once the request settles, so the button
  // can stop showing "Finding…") so the error stays scoped to, and visible
  // under, the correct candidate after the in-flight state itself clears.
  const [previewErrorId, setPreviewErrorId] = useState<string | null>(null)
  const [confirmingCandidate, setConfirmingCandidate] = useState<CatalogCandidate | null>(
    null,
  )

  const [addingId, setAddingId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function runSearch() {
    const q = query.trim()
    setSearchError(null)
    setPreviewError(null)

    if (q.length < 2) {
      setSearchError('Enter at least 2 characters.')
      return
    }

    setPhase('loading')

    try {
      const response = await searchDiscogsCatalog(client, q)
      setResults(response.results)
      setPhase(response.results.length > 0 ? 'results' : 'no-results')
    } catch (error) {
      setResults([])
      setSearchError(errorMessage(error))
      setPhase('error')
    }
  }

  async function reviewAndAdd(result: DiscogsSearchResultItem) {
    setPreviewError(null)
    setPreviewErrorId(null)
    setPreviewingId(result.providerReleaseId)
    setPreviewPhase('loading')

    try {
      const response = await lookupDiscogsCatalogRelease(client, result.providerReleaseId)
      const candidate = response.candidates[0]

      if (!candidate) {
        setPreviewPhase('error')
        setPreviewError('That release could not be verified on Discogs.')
        setPreviewErrorId(result.providerReleaseId)
        return
      }

      setPreviewPhase('idle')
      setConfirmingCandidate(candidate)
    } catch (error) {
      setPreviewPhase('error')
      setPreviewError(errorMessage(error))
      setPreviewErrorId(result.providerReleaseId)
    } finally {
      setPreviewingId(null)
    }
  }

  async function confirmAdd() {
    if (!confirmingCandidate || addingId || collectionStatus !== 'ready') {
      return
    }

    const candidate = confirmingCandidate
    setAddingId(candidate.providerReleaseId)
    setAddError(null)

    try {
      await addCatalogReleaseToCollection(client, candidate)
      onCollectionChanged()
      setConfirmingCandidate(null)
    } catch (error) {
      setAddError(errorMessage(error))
    } finally {
      setAddingId(null)
    }
  }

  const collectionReady = collectionStatus === 'ready'
  const confirmingOwned =
    confirmingCandidate !== null
    && collectionReady
    && isExactCatalogReleaseOwned('discogs', confirmingCandidate.providerReleaseId, ownedItems)

  return (
    <div className="vi-discogs-search">
      <form
        className="vi-discover__searchrow"
        onSubmit={(e) => {
          e.preventDefault()
          void runSearch()
        }}
      >
        <SearchInput
          label="Search Discogs"
          placeholder="Artist and album"
          value={query}
          onChange={setQuery}
          onSubmit={() => void runSearch()}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={phase === 'loading'}>
          {phase === 'loading' ? 'Searching…' : 'Search Discogs'}
        </Button>
      </form>

      <p className="vi-hint">
        Discogs and MusicBrainz results are shown separately and are never
        combined or matched against each other - adding the same release
        through both providers creates two separate collection entries.
      </p>

      {phase === 'loading' ? (
        <div className="vi-candidate__list" aria-busy="true">
          <SkeletonAlbumCard />
          <SkeletonAlbumCard />
        </div>
      ) : null}

      {phase === 'error' && searchError ? (
        <div className="vi-errorstate" role="alert">
          <Icon name="alert" size={20} />
          <p>{searchError}</p>
          <Button variant="secondary" size="sm" onClick={() => void runSearch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {phase !== 'error' && searchError ? (
        <p className="vi-error-text" role="alert">
          {searchError}
        </p>
      ) : null}

      {phase === 'no-results' ? (
        <div className="vi-discover__empty" role="status">
          <p>No Vinyl matches found on Discogs for that search.</p>
        </div>
      ) : null}

      {phase === 'results' ? (
        <ul className="vi-candidate__list" aria-label="Discogs results">
          {results.map((result) => {
            const owned =
              collectionReady
              && isExactCatalogReleaseOwned('discogs', result.providerReleaseId, ownedItems)
            const metaParts = resultMetaParts(result)
            const previewingThis = previewingId === result.providerReleaseId

            return (
              <li key={result.providerReleaseId}>
                <article className="vi-candidate" data-owned={owned}>
                  <span className="vi-candidate__art">
                    <AlbumArtwork
                      size="thumb"
                      artist=""
                      title={result.displayTitle}
                      seedId={result.providerReleaseId}
                      releaseMbid={null}
                      releaseGroupMbid={null}
                      decorativeText={false}
                    />
                  </span>
                  <div className="vi-candidate__body">
                    <h3 className="vi-candidate__title">
                      <BidiText>{result.displayTitle}</BidiText>
                    </h3>
                    {metaParts.length > 0 ? (
                      <p className="vi-candidate__meta">
                        <BidiJoin parts={metaParts} />
                      </p>
                    ) : null}
                    <DiscogsAttribution releaseUrl={result.derivedProviderPageUrl} compact />
                    <div className="vi-candidate__actions">
                      {owned ? (
                        <span className="vi-candidate__owned">
                          <Icon name="check" size={15} /> In your collection
                        </span>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!collectionReady || previewingThis}
                        onClick={() => void reviewAndAdd(result)}
                      >
                        {previewingThis ? 'Finding…' : 'Review & Add'}
                      </Button>
                      <a
                        className="vi-btn vi-btn--ghost vi-btn--sm"
                        href={result.derivedProviderPageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Discogs
                        <span className="vi-visually-hidden"> (opens in a new tab)</span>
                      </a>
                    </div>
                    {previewErrorId === result.providerReleaseId &&
                    previewPhase === 'error' &&
                    previewError ? (
                      <p className="vi-error-text" role="alert">
                        {previewError}
                      </p>
                    ) : null}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      ) : null}

      {confirmingCandidate ? (
        <Dialog
          open
          onClose={() => {
            setConfirmingCandidate(null)
            setAddError(null)
          }}
          title={confirmingOwned ? 'Add another copy?' : 'Confirm & add this record?'}
        >
          <div className="vi-candidate" data-owned={confirmingOwned}>
            <span className="vi-candidate__art">
              <AlbumArtwork
                size="thumb"
                artist={confirmingCandidate.artist}
                title={confirmingCandidate.title}
                seedId={confirmingCandidate.providerReleaseId}
                releaseMbid={null}
                releaseGroupMbid={null}
              />
            </span>
            <div className="vi-candidate__body">
              <p className="vi-candidate__artist">
                <BidiText>{confirmingCandidate.artist}</BidiText>
              </p>
              <h3 className="vi-candidate__title">
                <BidiText>{confirmingCandidate.title}</BidiText>
              </h3>
              {candidateMetaParts(confirmingCandidate).length > 0 ? (
                <p className="vi-candidate__meta">
                  <BidiJoin parts={candidateMetaParts(confirmingCandidate)} />
                </p>
              ) : null}
              <DiscogsAttribution releaseUrl={confirmingCandidate.derivedProviderPageUrl} />
            </div>
          </div>

          {confirmingOwned ? (
            <p>
              You already own this release. Add another physical copy to your
              collection?
            </p>
          ) : null}

          {addError ? (
            <p className="vi-error-text" role="alert">
              {addError}
            </p>
          ) : null}

          <div className="vi-dialog__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmingCandidate(null)
                setAddError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={addingId !== null}
              onClick={() => void confirmAdd()}
            >
              {addingId !== null
                ? 'Adding…'
                : confirmingOwned
                  ? 'Add another copy'
                  : 'Confirm & Add'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
