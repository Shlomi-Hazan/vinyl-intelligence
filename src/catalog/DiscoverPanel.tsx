import { useCallback, useRef, useState } from 'react'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { BidiJoin, BidiText } from '../components/BidiText.tsx'
import { CollectionForm } from '../collection/CollectionForm.tsx'
import { DiscogsSearchPanel } from './DiscogsSearchPanel.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Button, Field, Input, SegmentedRadioGroup, SearchInput } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { SkeletonAlbumCard } from '../ui/feedback.tsx'
import {
  clearCatalogSearchDraft,
  loadCatalogSearchDraft,
  saveCatalogSearchDraft,
} from './catalogSearchDraft.ts'
import {
  addCatalogReleaseToCollection,
  lookupCatalogRelease,
  searchCatalogPage,
} from '../lib/catalog/client.ts'
import {
  musicBrainzWebSearchUrl,
  parseMusicBrainzReleaseUrl,
} from '../lib/catalog/musicbrainzIdentity.ts'
import { isExactCatalogReleaseOwned } from '../lib/catalog/ownedRelease.ts'
import {
  addManualCollectionItem,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'
import type { LoadPhase } from '../app/collection-data-context.ts'
import type { CatalogCandidate, SearchMode } from '../lib/catalog/types.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const EXAMPLES = ['Alice Coltrane', 'Bowie Low', 'Radiohead OK Computer']

// The value the client always sends as `limit` for every page request,
// first page and Load More alike (spec 0017 §7.1/§8.1).
const PAGE_SIZE = 5

const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
]

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

/**
 * The first-page search lifecycle only - unchanged in meaning by spec 0017.
 * Load More, the exact-URL lookup, and the search-mode selector each carry
 * their own independent, orthogonal state below rather than overloading
 * this single discriminant.
 */
type Phase = 'initial' | 'loading' | 'results' | 'no-results' | 'error'

type ExactUrlPhase = 'idle' | 'invalid' | 'loading' | 'result' | 'error'

export function DiscoverPanel({
  client,
  userId,
  ownedItems,
  collectionStatus,
  onCollectionChanged,
}: DiscoverPanelProps) {
  const restored = useRef(loadCatalogSearchDraft(userId)).current
  const [query, setQuery] = useState(restored?.draftQuery ?? '')
  const [mode, setMode] = useState<SearchMode>(restored?.mode ?? 'all')
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
  // Discogs fallback (spec 0018 §6): its own, fully independent toggle and
  // panel state - never auto-triggered by a MusicBrainz search.
  const [showDiscogs, setShowDiscogs] = useState(false)
  // Local confirmation state for "Add another copy" of an already-owned
  // release (spec 0016 Finding B / §21.7 - dialog/confirmation state is
  // local to this panel, never shared with ScanPanel). Reused identically
  // (spec 0017 §16) whether the candidate came from a normal search, Load
  // More, or the exact-URL lookup below.
  const [confirmingCandidate, setConfirmingCandidate] = useState<CatalogCandidate | null>(
    null,
  )
  const inProgress = useRef(false)
  const lastResult = useRef(restored?.result ?? null)
  const searchRef = useRef<HTMLInputElement>(null)

  // --- Pagination (spec 0017 §7-§8) ---
  const [offset, setOffset] = useState(restored?.result?.offset ?? 0)
  const [hasMore, setHasMore] = useState(restored?.result?.hasMore ?? false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null)
  const resultsListRef = useRef<HTMLUListElement>(null)

  // Monotonic request-generation counter: guards against a stale response
  // (an older search, an older mode, an older Load More page) overwriting
  // newer UI state. Bumped on every new search submit, mode change, and
  // "New search" reset; every async response checks its own captured `seq`
  // against the current value before applying (spec 0017 plan's approved
  // strategy - no `AbortController`, nothing here needs to actually cancel
  // the in-flight request, only ignore a late result).
  const requestSeq = useRef(0)

  // --- Exact MusicBrainz release URL lookup (spec 0017 §10-§11) - a fully
  // independent surface: its own state, never touched by a normal search,
  // and a normal search never clears it either. ---
  const [exactUrlInput, setExactUrlInput] = useState('')
  const [exactUrlPhase, setExactUrlPhase] = useState<ExactUrlPhase>('idle')
  const [exactUrlError, setExactUrlError] = useState<string | null>(null)
  const [exactCandidate, setExactCandidate] = useState<CatalogCandidate | null>(null)
  const exactUrlInProgress = useRef(false)

  // Bumps the request-generation counter and releases every in-flight guard
  // that bump makes stale - search's own `inProgress` guard AND Load More's
  // own `loadingMore` guard alike. Without this, a Load More request
  // superseded by a new search/mode-change/reset would correctly have its
  // eventual result discarded (via the `seq` check each async operation
  // already performs) but would leave `loadingMore` stuck `true` forever,
  // since only that same request's own `finally` block ever cleared it -
  // and it now never will, having failed the `seq` check itself. Returns
  // the new seq for the caller's own subsequent async operation, if any,
  // to capture.
  const invalidatePendingWork = useCallback((): number => {
    const seq = ++requestSeq.current
    inProgress.current = false
    setLoadingMore(false)
    return seq
  }, [])

  const resetSearch = useCallback(() => {
    invalidatePendingWork()
    setQuery('')
    setCandidates([])
    setSubmittedQuery('')
    setSearchError(null)
    setAddErrors({})
    setShowManual(false)
    setPhase('initial')
    setOffset(0)
    setHasMore(false)
    setLoadMoreError(null)
    lastResult.current = null
    // "New search" preserves the currently-selected mode (a fixed Plan 017
    // decision) - `mode` state is deliberately not touched here.
    clearCatalogSearchDraft(userId)
    // focus the input so the user can type immediately
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [invalidatePendingWork, userId])

  const handleModeChange = useCallback(
    (next: SearchMode) => {
      if (next === mode) {
        return
      }
      // Invalidate any in-flight request under the previous mode (spec
      // 0017 §6.6/concurrency) before clearing the results it would have
      // populated, and release every in-flight guard so neither a stale
      // search nor a stale Load More can block or leak into the new mode.
      invalidatePendingWork()
      setMode(next)
      setCandidates([])
      setSubmittedQuery('')
      setOffset(0)
      setHasMore(false)
      setLoadMoreError(null)
      setSearchError(null)
      setPhase('initial')
      lastResult.current = null
      saveCatalogSearchDraft(userId, { draftQuery: query, mode: next, result: null })
    },
    [invalidatePendingWork, mode, query, userId],
  )

  const runSearch = useCallback(
    async (raw?: string) => {
      // This guard is runSearch's own rapid-resubmit dedup (e.g. mashing
      // Enter) - unrelated to, and evaluated before, the invalidation
      // below, which releases guards belonging to *other*, now-superseded
      // operations (a stale Load More in particular).
      if (inProgress.current) {
        return
      }
      const q = (raw ?? query).trim()
      setSearchError(null)
      setAddErrors({})
      setLoadMoreError(null)
      if (q.length < 2) {
        setSearchError('Enter at least 2 characters.')
        return
      }
      // A new search supersedes any in-flight Load More under the previous
      // query/mode - release its guard so a later hasMore:true here isn't
      // shadowed by a stale, stuck-true loadingMore.
      const seq = invalidatePendingWork()
      inProgress.current = true
      setPhase('loading')
      try {
        const page = await searchCatalogPage(client, {
          limit: PAGE_SIZE,
          mode,
          offset: 0,
          query: q,
        })

        if (seq !== requestSeq.current) {
          return
        }

        setCandidates(page.candidates)
        setSubmittedQuery(q)
        setOffset(0)
        setHasMore(page.hasMore)
        setPhase(page.candidates.length > 0 ? 'results' : 'no-results')
        lastResult.current = {
          candidates: page.candidates,
          hasMore: page.hasMore,
          mode,
          offset: 0,
          submittedQuery: q,
        }
        saveCatalogSearchDraft(userId, { draftQuery: q, mode, result: lastResult.current })
      } catch (error) {
        if (seq !== requestSeq.current) {
          return
        }
        setCandidates([])
        setSearchError(errorMessage(error))
        setPhase('error')
      } finally {
        if (seq === requestSeq.current) {
          inProgress.current = false
        }
      }
    },
    [client, invalidatePendingWork, mode, query, userId],
  )

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return
    }
    const nextOffset = offset + PAGE_SIZE
    const seq = ++requestSeq.current
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await searchCatalogPage(client, {
        limit: PAGE_SIZE,
        mode,
        offset: nextOffset,
        query: submittedQuery,
      })

      if (seq !== requestSeq.current) {
        return
      }

      const seen = new Set(candidates.map((c) => c.providerReleaseId))
      const merged = [
        ...candidates,
        ...page.candidates.filter((c) => !seen.has(c.providerReleaseId)),
      ]

      setCandidates(merged)
      setOffset(nextOffset)
      setHasMore(page.hasMore)
      lastResult.current = {
        candidates: merged,
        hasMore: page.hasMore,
        mode,
        offset: nextOffset,
        submittedQuery,
      }
      saveCatalogSearchDraft(userId, { draftQuery: query, mode, result: lastResult.current })

      // Focus management (spec 0017 §19): only move focus when the Load
      // More control is about to disappear (the window is now exhausted)
      // and the user's focus was actually on it - never steal focus on a
      // normal append.
      if (!page.hasMore && document.activeElement === loadMoreButtonRef.current) {
        resultsListRef.current?.focus()
      }
    } catch (error) {
      if (seq !== requestSeq.current) {
        return
      }
      setLoadMoreError(errorMessage(error))
    } finally {
      if (seq === requestSeq.current) {
        setLoadingMore(false)
      }
    }
  }, [candidates, client, hasMore, loadingMore, mode, offset, query, submittedQuery, userId])

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
   * confirm button twice) and reuses the existing `add` path - exactly
   * one add request per intentional confirmation. */
  function confirmAddAnotherCopy() {
    if (!confirmingCandidate || addingId || collectionStatus !== 'ready') {
      return
    }
    const candidate = confirmingCandidate
    setConfirmingCandidate(null)
    void add(candidate)
  }

  async function submitExactUrl() {
    if (exactUrlInProgress.current) {
      return
    }
    const trimmed = exactUrlInput.trim()

    if (!trimmed) {
      // Untouched, not an error (spec 0017 §10.2/§21).
      setExactUrlPhase('idle')
      setExactUrlError(null)
      return
    }

    const parsed = parseMusicBrainzReleaseUrl(trimmed)

    if (!parsed) {
      setExactUrlPhase('invalid')
      setExactUrlError('That doesn’t look like a MusicBrainz release URL.')
      return
    }

    exactUrlInProgress.current = true
    setExactUrlPhase('loading')
    setExactUrlError(null)

    try {
      const result = await lookupCatalogRelease(client, parsed.providerReleaseId)
      const candidate = result.candidates[0]

      if (!candidate) {
        setExactUrlPhase('error')
        setExactUrlError('That release could not be found on MusicBrainz.')
        return
      }

      setExactCandidate(candidate)
      setExactUrlPhase('result')
    } catch (error) {
      setExactUrlPhase('error')
      setExactUrlError(errorMessage(error))
    } finally {
      exactUrlInProgress.current = false
    }
  }

  /** The shared per-candidate card, reused identically by the results
   * list, Load More's appended entries, and the exact-URL lookup's single
   * result (spec 0017 §10.3 point 5 - "no new candidate-rendering
   * component," only reuse of the existing one from more call sites). */
  function renderCandidate(c: CatalogCandidate) {
    const collectionReady = collectionStatus === 'ready'
    const owned =
      collectionReady && isExactCatalogReleaseOwned(c.provider, c.providerReleaseId, ownedItems)
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
              releaseMbid={c.provider !== 'discogs' ? c.providerReleaseId : null}
              releaseGroupMbid={
                c.provider !== 'discogs' ? c.providerReleaseGroupId : null
              }
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
                <span className="vi-visually-hidden"> (opens in a new tab)</span>
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

      <div className="vi-discover__modes">
        <SegmentedRadioGroup
          label="Search mode"
          value={mode}
          onChange={handleModeChange}
          options={MODE_OPTIONS}
        />
        <a
          className="vi-btn vi-btn--ghost vi-btn--sm"
          href={musicBrainzWebSearchUrl(query || null)}
          target="_blank"
          rel="noreferrer"
        >
          Search on MusicBrainz
          <span className="vi-visually-hidden"> (opens in a new tab)</span>
        </a>
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
        <>
          <ul
            className="vi-candidate__list"
            aria-label="Catalog results"
            ref={resultsListRef}
            tabIndex={-1}
          >
            {candidates.map((c) => renderCandidate(c))}
          </ul>
          {hasMore && !loadMoreError ? (
            <div className="vi-discover__loadmore">
              <Button
                ref={loadMoreButtonRef}
                variant="secondary"
                size="sm"
                disabled={loadingMore}
                aria-busy={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Loading…' : 'Load more results'}
              </Button>
            </div>
          ) : null}
          {loadMoreError ? (
            <div className="vi-errorstate" role="alert">
              <Icon name="alert" size={18} />
              <p>{loadMoreError}</p>
              <Button variant="secondary" size="sm" onClick={() => void loadMore()}>
                Retry
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="vi-discover__exacturl">
        <Field
          label="Know the exact release?"
          htmlFor="vi-discover-exacturl"
          error={
            exactUrlPhase === 'invalid' || exactUrlPhase === 'error'
              ? exactUrlError
              : null
          }
        >
          <form
            className="vi-discover__exacturl-row"
            onSubmit={(e) => {
              e.preventDefault()
              void submitExactUrl()
            }}
          >
            <Input
              id="vi-discover-exacturl"
              type="url"
              inputMode="url"
              value={exactUrlInput}
              onChange={(e) => setExactUrlInput(e.target.value)}
              placeholder="https://musicbrainz.org/release/..."
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={exactUrlPhase === 'loading'}
              aria-busy={exactUrlPhase === 'loading'}
            >
              {exactUrlPhase === 'loading' ? 'Finding…' : 'Find exact release'}
            </Button>
          </form>
        </Field>

        {exactUrlPhase === 'result' && exactCandidate ? (
          <ul className="vi-candidate__list" aria-label="Exact release">
            {renderCandidate(exactCandidate)}
          </ul>
        ) : null}
      </div>

      <div className="vi-discover__discogs">
        {showDiscogs ? (
          <div className="vi-discogs-search-host">
            <h3 style={{ fontFamily: 'var(--font-display)' }}>Search Discogs</h3>
            <DiscogsSearchPanel
              client={client}
              ownedItems={ownedItems}
              collectionStatus={collectionStatus}
              onCollectionChanged={onCollectionChanged}
            />
            <Button variant="ghost" size="sm" onClick={() => setShowDiscogs(false)}>
              Close Discogs search
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setShowDiscogs(true)}>
            Can't find it? Search Discogs
          </Button>
        )}
      </div>

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
