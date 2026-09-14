import { useCallback, useRef, useState } from 'react'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { BidiJoin, BidiText } from '../components/BidiText.tsx'
import { CollectionForm } from '../collection/CollectionForm.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Button, SearchInput } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { SkeletonAlbumCard } from '../ui/feedback.tsx'
import {
  clearCatalogSearchDraft,
  loadCatalogSearchDraft,
  saveCatalogSearchDraft,
} from './catalogSearchDraft.ts'
import {
  addCatalogReleaseToCollection,
  searchCatalog,
} from '../lib/catalog/client.ts'
import { isExactCatalogReleaseOwned } from '../lib/catalog/ownedRelease.ts'
import {
  addManualCollectionItem,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'
import type { LoadPhase } from '../app/collection-data-context.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const EXAMPLES = ['Alice Coltrane', 'Bowie Low', 'Radiohead OK Computer']

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'That did not work. Try again.'
}

/** The separate meta fields for a catalogue candidate, in display order. */
function candidateMetaParts(c: CatalogCandidate): string[] {
  return [
    c.releaseYear?.toString() ?? null,
    c.label,
    c.catalogNumber,
    c.country,
    c.format,
  ].filter((x): x is string => Boolean(x))
}

type DiscoverPanelProps = {
  client: BrowserSupabaseClient
  userId: string
  ownedItems: CollectionItemWithRelease[]
  /**
   * The collection-load phase `ownedItems` came from. Ownership is only
   * authoritative when this is `'ready'` - on `'loading'` (including a
   * post-add reload, where `ownedItems` is deliberately retained as STALE
   * data) or `'error'`, a candidate must never be classified as owned OR
   * not-owned, and no catalog-add write may be triggered (spec 0016
   * Finding B review correction).
   */
  collectionStatus: LoadPhase
  onCollectionChanged: () => void
}

type Phase = 'initial' | 'loading' | 'results' | 'no-results' | 'error'

export function DiscoverPanel({
  client,
  userId,
  ownedItems,
  collectionStatus,
  onCollectionChanged,
}: DiscoverPanelProps) {
  const restored = useRef(loadCatalogSearchDraft(userId)).current
  const [query, setQuery] = useState(restored?.draftQuery ?? '')
  const [candidates, setCandidates] = useState<CatalogCandidate[]>(
    restored?.result?.candidates ?? [],
  )
  const [phase, setPhase] = useState<Phase>(
    restored?.result
      ? restored.result.candidates.length > 0
        ? 'results'
        : 'no-results'
      : 'initial',
  )
  const [submittedQuery, setSubmittedQuery] = useState(
    restored?.result?.submittedQuery ?? '',
  )
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [showManual, setShowManual] = useState(false)
  // Local confirmation state for "Add another copy" of an already-owned
  // release (spec 0016 Finding B / §21.7 - dialog/confirmation state is
  // local to this panel, never shared with ScanPanel).
  const [confirmingCandidate, setConfirmingCandidate] = useState<CatalogCandidate | null>(
    null,
  )
  const inProgress = useRef(false)
  const lastResult = useRef(restored?.result ?? null)
  const searchRef = useRef<HTMLInputElement>(null)

  const resetSearch = useCallback(() => {
    setQuery('')
    setCandidates([])
    setSubmittedQuery('')
    setSearchError(null)
    setAddErrors({})
    setShowManual(false)
    setPhase('initial')
    lastResult.current = null
    clearCatalogSearchDraft(userId)
    // focus the input so the user can type immediately
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [userId])

  const runSearch = useCallback(
    async (raw?: string) => {
      if (inProgress.current) {
        return
      }
      const q = (raw ?? query).trim()
      setSearchError(null)
      setAddErrors({})
      if (q.length < 2) {
        setSearchError('Enter at least 2 characters.')
        return
      }
      inProgress.current = true
      setPhase('loading')
      try {
        const next = await searchCatalog(client, q)
        setCandidates(next)
        setSubmittedQuery(q)
        setPhase(next.length > 0 ? 'results' : 'no-results')
        lastResult.current = { submittedQuery: q, candidates: next }
        saveCatalogSearchDraft(userId, { draftQuery: q, result: lastResult.current })
      } catch (error) {
        setCandidates([])
        setSearchError(errorMessage(error))
        setPhase('error')
      } finally {
        inProgress.current = false
      }
    },
    [client, query, userId],
  )

  async function add(candidate: CatalogCandidate) {
    // Ownership data is only authoritative when the collection load is
    // 'ready' - never allow a write while it is loading (including a
    // post-add reload's stale window) or errored, even if a stale/disabled
    // control were somehow triggered (spec 0016 Finding B review correction).
    if (collectionStatus !== 'ready') {
      return
    }
    setAddingId(candidate.providerReleaseId)
    setAddErrors((cur) => {
      const n = { ...cur }
      delete n[candidate.providerReleaseId]
      return n
    })
    try {
      await addCatalogReleaseToCollection(client, candidate)
      onCollectionChanged()
    } catch (error) {
      setAddErrors((cur) => ({
        ...cur,
        [candidate.providerReleaseId]: errorMessage(error),
      }))
    } finally {
      setAddingId(null)
    }
  }

  async function addManual(input: ManualReleaseInput) {
    await addManualCollectionItem(client, input)
    onCollectionChanged()
    setShowManual(false)
  }

  /** Confirms "Add another copy" of an already-owned release: closes the
   * dialog immediately (so a rapid repeated click cannot hit the same
   * confirm button twice) and reuses the existing `add` path - exactly one
   * add request per intentional confirmation. */
  function confirmAddAnotherCopy() {
    if (!confirmingCandidate || addingId || collectionStatus !== 'ready') {
      return
    }
    const candidate = confirmingCandidate
    setConfirmingCandidate(null)
    void add(candidate)
  }

  const searched = phase !== 'initial'

  return (
    <div className="vi-discover">
      <div className="vi-discover__searchrow">
        <SearchInput
          label="Search the catalog"
          placeholder="Artist and album, e.g. Portishead Dummy"
          value={query}
          onChange={setQuery}
          onSubmit={() => void runSearch()}
          inputRef={searchRef}
        />
        {searched ? (
          <Button
            variant="ghost"
            size="sm"
            iconBefore="close"
            onClick={resetSearch}
          >
            New search
          </Button>
        ) : null}
      </div>

      {searched && submittedQuery ? (
        <p className="vi-hint vi-discover__current">
          Showing results for &ldquo;<BidiText>{submittedQuery}</BidiText>&rdquo;
          &middot; press Enter to run it again
        </p>
      ) : null}

      {phase === 'initial' ? (
        <div className="vi-discover__hint">
          <p>Search MusicBrainz for a release, confirm the right edition, and add it.</p>
          <div className="vi-discover__examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="vi-chip"
                onClick={() => {
                  setQuery(ex)
                  void runSearch(ex)
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {phase === 'loading' ? (
        <div className="vi-candidate__list" aria-busy="true">
          <SkeletonAlbumCard />
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
          <p>No catalog matches for that search.</p>
          <p className="vi-hint">
            Try different words, or add the record manually below.
          </p>
        </div>
      ) : null}

      {phase === 'results' ? (
        <ul className="vi-candidate__list" aria-label="Catalog results">
          {candidates.map((c) => {
            const collectionReady = collectionStatus === 'ready'
            const owned =
              collectionReady && isExactCatalogReleaseOwned(c.providerReleaseId, ownedItems)
            const metaParts = candidateMetaParts(c)
            return (
              <li key={c.providerReleaseId}>
                <article className="vi-candidate" data-owned={owned}>
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
                    <p className="vi-candidate__artist">
                      <BidiText>{c.artist}</BidiText>
                    </p>
                    <h3 className="vi-candidate__title">
                      <BidiText>{c.title}</BidiText>
                    </h3>
                    {metaParts.length > 0 ? (
                      <p className="vi-candidate__meta">
                        <BidiJoin parts={metaParts} />
                      </p>
                    ) : null}
                    <div className="vi-candidate__actions">
                      {!collectionReady ? (
                        <Button variant="secondary" size="sm" disabled>
                          {collectionStatus === 'loading'
                            ? 'Checking collection…'
                            : 'Collection unavailable'}
                        </Button>
                      ) : owned ? (
                        <>
                          <span className="vi-candidate__owned">
                            <Icon name="check" size={15} /> In your collection
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={addingId === c.providerReleaseId}
                            onClick={() => setConfirmingCandidate(c)}
                          >
                            {addingId === c.providerReleaseId
                              ? 'Adding…'
                              : 'Add another copy'}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={addingId === c.providerReleaseId}
                          onClick={() => void add(c)}
                        >
                          {addingId === c.providerReleaseId
                            ? 'Adding…'
                            : 'Add to collection'}
                        </Button>
                      )}
                      <a
                        className="vi-btn vi-btn--ghost vi-btn--sm"
                        href={c.derivedProviderPageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        MusicBrainz
                      </a>
                    </div>
                    {addErrors[c.providerReleaseId] ? (
                      <p className="vi-error-text" role="alert">
                        {addErrors[c.providerReleaseId]}
                      </p>
                    ) : null}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="vi-discover__manual">
        {showManual ? (
          <div className="legacy-host vi-manual-add">
            <h3 style={{ fontFamily: 'var(--font-display)' }}>Add a record manually</h3>
            <CollectionForm
              mode="add"
              draftStorageUserId={userId}
              onSubmit={addManual}
              onCancel={() => setShowManual(false)}
            />
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setShowManual(true)}>
            Can't find it? Add it manually
          </Button>
        )}
      </div>

      {confirmingCandidate ? (
        <Dialog
          open
          onClose={() => setConfirmingCandidate(null)}
          title="Add another copy?"
        >
          <p>
            You already own this release. Add another physical copy to your
            collection?
          </p>
          <div className="vi-dialog__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingCandidate(null)}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={confirmAddAnotherCopy}>
              Add another copy
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
