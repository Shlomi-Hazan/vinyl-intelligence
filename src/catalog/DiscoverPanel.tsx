import { useCallback, useEffect, useRef, useState } from 'react'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { BidiJoin, BidiText } from '../components/BidiText.tsx'
import { CollectionForm } from '../collection/CollectionForm.tsx'
import { DiscogsAttribution } from './DiscogsAttribution.tsx'
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
  lookupDiscogsCatalogRelease,
  searchCatalogPage,
  searchDiscogsCatalog,
} from '../lib/catalog/client.ts'
import {
  musicBrainzWebSearchUrl,
  parseMusicBrainzReleaseUrl,
} from '../lib/catalog/musicbrainzIdentity.ts'
import { discogsWebSearchUrl, parseDiscogsReleaseUrl } from '../lib/catalog/discogsIdentity.ts'
import { isDiscogsRowFresh, msUntilStale } from '../lib/catalog/discogsFreshness.ts'
import { isExactCatalogReleaseOwned } from '../lib/catalog/ownedRelease.ts'
import {
  addManualCollectionItem,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'
import type { LoadPhase } from '../app/collection-data-context.ts'
import type { DiscogsSearchResultItem } from '../lib/catalog/discogs.ts'
import type { CatalogCandidate, CatalogProvider, SearchMode } from '../lib/catalog/types.ts'
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

// One primary catalog-search area, MusicBrainz default (spec 0018 follow-up
// §1) - an explicit, prominent, always-visible choice, never a buried
// fallback toggle.
const PROVIDER_OPTIONS: { value: CatalogProvider; label: string }[] = [
  { value: 'musicbrainz', label: 'MusicBrainz' },
  { value: 'discogs', label: 'Discogs' },
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

/** The separate meta fields for a Discogs search result, in display order. */
function discogsResultMetaParts(r: DiscogsSearchResultItem): string[] {
  return [
    r.releaseYear?.toString() ?? null,
    r.country,
    r.formatSummary,
    r.label,
    r.catalogNumber,
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

/** A pending "add another copy?" confirmation only ever needs identity - the
 * dialog itself renders no candidate preview, so this is deliberately the
 * minimal shape both a full `CatalogCandidate` (MusicBrainz, or a Discogs
 * exact-URL result) and a bare Discogs search-result item satisfy without
 * constructing a fake candidate object (spec 0018 follow-up §3-§4). */
type PendingDuplicate = Pick<CatalogCandidate, 'provider' | 'providerReleaseId'>

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
  // The active provider (spec 0018 follow-up §1) - MusicBrainz by default,
  // switching never fires a request by itself, and the typed query survives
  // a switch since it is shared state, not reset here.
  const [provider, setProvider] = useState<CatalogProvider>('musicbrainz')
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
  // Shared across MusicBrainz candidates, Discogs exact-URL candidates, and
  // Discogs search results alike - the three id spaces never collide
  // (a MusicBrainz MBID and a Discogs numeric id cannot be equal), so one
  // in-flight/error map is simpler than three separate ones.
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [showManual, setShowManual] = useState(false)
  // Local confirmation state for "Add another copy" of an already-owned
  // release (spec 0016 Finding B / §21.7 - dialog/confirmation state is
  // local to this panel, never shared with ScanPanel). Reused identically
  // (spec 0017 §16, spec 0018 follow-up §4) whether the candidate came from
  // a MusicBrainz search, Load More, either provider's exact-URL lookup, or
  // a Discogs search result.
  const [confirmingCandidate, setConfirmingCandidate] = useState<PendingDuplicate | null>(
    null,
  )
  const inProgress = useRef(false)
  const lastResult = useRef(restored?.result ?? null)
  const searchRef = useRef<HTMLInputElement>(null)

  // --- Pagination (spec 0017 §7-§8) - MusicBrainz only; Discogs's own
  // secondary search intentionally has no pagination (spec 0018 §8). ---
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

  // --- Discogs secondary search (spec 0018 follow-up §1/§3/§4) - its own
  // independent state, sharing only the top-level `query` text and the
  // `add`/`confirmingCandidate` machinery above. Never auto-triggered. ---
  const [discogsPhase, setDiscogsPhase] = useState<Phase>('initial')
  const [discogsResults, setDiscogsResults] = useState<DiscogsSearchResultItem[]>([])
  const [discogsSubmittedQuery, setDiscogsSubmittedQuery] = useState('')
  const [discogsSearchError, setDiscogsSearchError] = useState<string | null>(null)
  // Discogs's own All/Artist/Album mode (spec 0020 §2) - independent of
  // MusicBrainz's `mode` above, exactly like every other Discogs surface in
  // this panel. Switching it never fires a search by itself.
  const [discogsMode, setDiscogsMode] = useState<SearchMode>('all')
  const discogsInProgress = useRef(false)
  // The exact moment `discogsResults` was fetched (spec 0018 follow-up §7 -
  // finding 1: transient Discogs data must expire at 6h, same as persisted
  // owned-release data). `null` whenever there are no live results to
  // expire. Read by the expiry effect below via `discogsResultsFetchedAtRef`.
  const [discogsResultsFetchedAt, setDiscogsResultsFetchedAt] = useState<string | null>(
    null,
  )
  const discogsResultsFetchedAtRef = useRef<string | null>(null)

  // --- Exact Discogs release URL lookup (spec 0018 follow-up §5) - the
  // Discogs analog of the MusicBrainz exact-URL state above, fully
  // independent of it. ---
  const [discogsExactUrlInput, setDiscogsExactUrlInput] = useState('')
  const [discogsExactUrlPhase, setDiscogsExactUrlPhase] = useState<ExactUrlPhase>('idle')
  const [discogsExactUrlError, setDiscogsExactUrlError] = useState<string | null>(null)
  const [discogsExactCandidate, setDiscogsExactCandidate] = useState<CatalogCandidate | null>(
    null,
  )
  const discogsExactUrlInProgress = useRef(false)
  // The exact moment `discogsExactCandidate` was fetched - the same
  // transient six-hour boundary as `discogsResultsFetchedAt` above, tracked
  // independently since the two are fully independent surfaces.
  const [discogsExactFetchedAt, setDiscogsExactFetchedAt] = useState<string | null>(null)
  const discogsExactFetchedAtRef = useRef<string | null>(null)

  useEffect(() => {
    discogsResultsFetchedAtRef.current = discogsResultsFetchedAt
  }, [discogsResultsFetchedAt])
  useEffect(() => {
    discogsExactFetchedAtRef.current = discogsExactFetchedAt
  }, [discogsExactFetchedAt])

  /**
   * Expires transient Discogs data older than six hours (spec 0018 follow-up
   * §7 finding 1) - the exact same freshness boundary already used for
   * persisted owned-release data (`isDiscogsRowFresh`/`msUntilStale`,
   * `discogsFreshness.ts`), applied here to ephemeral React state instead of
   * a database row. Clears (never re-fetches) each independently: search
   * results and the exact-URL preview candidate can expire at different
   * times. Called from the one-shot timer below AND from the
   * visibilitychange handler, so a backgrounded tab's throttled/paused timer
   * can never leave stale data visible after the tab becomes visible again.
   */
  const expireStaleDiscogsTransientData = useCallback(() => {
    const resultsFetchedAt = discogsResultsFetchedAtRef.current
    if (resultsFetchedAt && !isDiscogsRowFresh('discogs', resultsFetchedAt)) {
      setDiscogsResults([])
      setDiscogsPhase('initial')
      setDiscogsSubmittedQuery('')
      setDiscogsSearchError(null)
      setDiscogsResultsFetchedAt(null)
    }

    const exactFetchedAt = discogsExactFetchedAtRef.current
    if (exactFetchedAt && !isDiscogsRowFresh('discogs', exactFetchedAt)) {
      setDiscogsExactCandidate(null)
      setDiscogsExactUrlPhase('idle')
      setDiscogsExactUrlError(null)
      setDiscogsExactFetchedAt(null)
    }
  }, [])

  // The one-shot expiry timer (mirrors `CollectionDataProvider.tsx`'s exact
  // floor-free pattern) - re-computed whenever either fetched-at timestamp
  // changes, scheduled for exactly the soonest remaining deadline plus 1ms
  // (the six-hour boundary itself is fresh-inclusive, so the timer must fire
  // 1ms past it to observe genuine staleness - discogsFreshness.ts). No
  // polling; at most one pending timer for both surfaces combined.
  useEffect(() => {
    const pending = [discogsResultsFetchedAt, discogsExactFetchedAt].filter(
      (value): value is string => value !== null,
    )

    if (pending.length === 0) {
      return
    }

    const delay = Math.min(...pending.map((value) => msUntilStale('discogs', value) + 1))
    const timeoutId = window.setTimeout(expireStaleDiscogsTransientData, delay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [discogsResultsFetchedAt, discogsExactFetchedAt, expireStaleDiscogsTransientData])

  // Visibility-resume (spec 0018 §8.2's established pattern, applied here to
  // transient Discogs data): closes the gap where a backgrounded tab's
  // `setTimeout` was throttled/paused past its scheduled delay. Synchronous
  // on resume - stale transient data is never displayed even for one frame
  // after the tab becomes visible again. Never triggers a re-fetch.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        expireStaleDiscogsTransientData()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [expireStaleDiscogsTransientData])

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

  const resetDiscogsSearch = useCallback(() => {
    discogsInProgress.current = false
    setQuery('')
    setDiscogsResults([])
    setDiscogsSubmittedQuery('')
    setDiscogsSearchError(null)
    setDiscogsResultsFetchedAt(null)
    setAddErrors({})
    setShowManual(false)
    setDiscogsPhase('initial')
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [])

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

  /** The Discogs analog of `handleModeChange` (spec 0020 §2): switching
   * mode never fires a search by itself, and never touches MusicBrainz's
   * own `mode`/results. Unlike MusicBrainz's mode, Discogs search has no
   * draft persistence and no in-flight request to invalidate (no
   * pagination, no request-generation counter on this surface). */
  const handleDiscogsModeChange = useCallback(
    (next: SearchMode) => {
      if (next === discogsMode) {
        return
      }
      setDiscogsMode(next)
      setDiscogsResults([])
      setDiscogsSubmittedQuery('')
      setDiscogsSearchError(null)
      setDiscogsPhase('initial')
    },
    [discogsMode],
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

  const runDiscogsSearch = useCallback(
    async (raw?: string) => {
      if (discogsInProgress.current) {
        return
      }
      const q = (raw ?? query).trim()
      setDiscogsSearchError(null)
      setAddErrors({})
      if (q.length < 2) {
        setDiscogsSearchError('Enter at least 2 characters.')
        return
      }
      discogsInProgress.current = true
      setDiscogsPhase('loading')
      try {
        const response = await searchDiscogsCatalog(client, q, discogsMode)
        setDiscogsResults(response.results)
        setDiscogsSubmittedQuery(q)
        setDiscogsPhase(response.results.length > 0 ? 'results' : 'no-results')
        // The receipt time for the six-hour transient-data expiry boundary
        // (spec 0018 follow-up §7 finding 1) - recorded even for a
        // zero-result page, so a subsequent expiry correctly clears back to
        // the initial "search again" state rather than leaving a stale
        // empty-results phase displayed indefinitely.
        setDiscogsResultsFetchedAt(new Date().toISOString())
      } catch (error) {
        setDiscogsResults([])
        setDiscogsSearchError(errorMessage(error))
        setDiscogsPhase('error')
        setDiscogsResultsFetchedAt(null)
      } finally {
        discogsInProgress.current = false
      }
    },
    [client, discogsMode, query],
  )

  /**
   * The single persisting add path for every provider and every entry point
   * (a MusicBrainz candidate, a Discogs exact-URL candidate, or a bare
   * Discogs search-result item) - the server independently re-fetches and
   * validates before persisting regardless of which of these called it
   * (spec 0018 follow-up §3). Never trusts browser-held metadata.
   */
  async function add(candidate: Pick<CatalogCandidate, 'provider' | 'providerReleaseId'>) {
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
   * one add request per intentional confirmation. The server performs its
   * own exact provider lookup again regardless of provider (spec 0018
   * follow-up §4) - never trusts cached/search metadata. */
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

  /** The Discogs analog of `submitExactUrl` (spec 0018 follow-up §5): the
   * exact lookup here is a genuine read-only preview, useful because the
   * user explicitly requested one specific release - the persisting add
   * still performs its own second, independent, authoritative lookup. */
  async function submitDiscogsExactUrl() {
    if (discogsExactUrlInProgress.current) {
      return
    }
    const trimmed = discogsExactUrlInput.trim()

    if (!trimmed) {
      setDiscogsExactUrlPhase('idle')
      setDiscogsExactUrlError(null)
      return
    }

    const parsed = parseDiscogsReleaseUrl(trimmed)

    if (!parsed) {
      setDiscogsExactUrlPhase('invalid')
      setDiscogsExactUrlError('That doesn’t look like a Discogs release URL.')
      return
    }

    discogsExactUrlInProgress.current = true
    setDiscogsExactUrlPhase('loading')
    setDiscogsExactUrlError(null)

    try {
      const result = await lookupDiscogsCatalogRelease(client, parsed.providerReleaseId)
      const candidate = result.candidates[0]

      if (!candidate) {
        setDiscogsExactUrlPhase('error')
        setDiscogsExactUrlError('That release could not be verified on Discogs.')
        setDiscogsExactFetchedAt(null)
        return
      }

      setDiscogsExactCandidate(candidate)
      setDiscogsExactUrlPhase('result')
      // The receipt time for the six-hour transient-data expiry boundary
      // (spec 0018 follow-up §7 finding 1) - the same boundary applied to
      // the search results above.
      setDiscogsExactFetchedAt(new Date().toISOString())
    } catch (error) {
      setDiscogsExactUrlPhase('error')
      setDiscogsExactUrlError(errorMessage(error))
      setDiscogsExactFetchedAt(null)
    } finally {
      discogsExactUrlInProgress.current = false
    }
  }

  /** The shared per-candidate card, reused identically by the MusicBrainz
   * results list, Load More's appended entries, and EITHER provider's
   * exact-URL lookup result (spec 0017 §10.3 point 5 / spec 0018 follow-up
   * §5 - "no new candidate-rendering component," only reuse of the existing
   * one from more call sites). A `CatalogCandidate` always carries separate
   * artist/title regardless of provider (spec 0018 follow-up §14). */
  function renderCandidate(c: CatalogCandidate) {
    const collectionReady = collectionStatus === 'ready'
    const isDiscogs = c.provider === 'discogs'
    const owned =
      collectionReady && isExactCatalogReleaseOwned(c.provider, c.providerReleaseId, ownedItems)
    const metaParts = candidateMetaParts(c)
    const providerLabel = isDiscogs ? 'Discogs' : 'MusicBrainz'
    return (
      <li key={c.providerReleaseId}>
        <article className="vi-candidate" data-owned={owned}>
          <span className="vi-candidate__art">
            <AlbumArtwork
              size="thumb"
              artist={c.artist}
              title={c.title}
              seedId={c.providerReleaseId}
              releaseMbid={!isDiscogs ? c.providerReleaseId : null}
              releaseGroupMbid={!isDiscogs ? c.providerReleaseGroupId : null}
              providerImageUrl={isDiscogs ? c.providerImageUrl : null}
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
            {isDiscogs ? <DiscogsAttribution releaseUrl={c.derivedProviderPageUrl} compact /> : null}
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
                    onClick={() =>
                      setConfirmingCandidate({
                        provider: c.provider,
                        providerReleaseId: c.providerReleaseId,
                      })
                    }
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
                {providerLabel}
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

  /** The Discogs search-RESULT card (spec 0018 follow-up §3/§14): visually
   * parity with `renderCandidate` (cover / title / meta / attribution /
   * action), but genuinely distinct internally - `displayTitle` stays the
   * provider's own combined search string, never heuristically split, and
   * the not-owned action adds directly with no client-side preview/confirm
   * step (the server performs its own exact lookup before persisting). */
  function renderDiscogsResult(r: DiscogsSearchResultItem) {
    const collectionReady = collectionStatus === 'ready'
    const owned =
      collectionReady && isExactCatalogReleaseOwned('discogs', r.providerReleaseId, ownedItems)
    const metaParts = discogsResultMetaParts(r)
    return (
      <li key={r.providerReleaseId}>
        <article className="vi-candidate" data-owned={owned}>
          <span className="vi-candidate__art">
            <AlbumArtwork
              size="thumb"
              artist=""
              title={r.displayTitle}
              seedId={r.providerReleaseId}
              releaseMbid={null}
              releaseGroupMbid={null}
              providerImageUrl={r.transientCoverDisplayUrl}
              decorativeText={false}
            />
          </span>
          <div className="vi-candidate__body">
            <h3 className="vi-candidate__title">
              <BidiText>{r.displayTitle}</BidiText>
            </h3>
            {metaParts.length > 0 ? (
              <p className="vi-candidate__meta">
                <BidiJoin parts={metaParts} />
              </p>
            ) : null}
            <DiscogsAttribution releaseUrl={r.derivedProviderPageUrl} compact />
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
                    disabled={addingId === r.providerReleaseId}
                    onClick={() =>
                      setConfirmingCandidate({
                        provider: 'discogs',
                        providerReleaseId: r.providerReleaseId,
                      })
                    }
                  >
                    {addingId === r.providerReleaseId ? 'Adding…' : 'Add another copy'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={addingId === r.providerReleaseId}
                  onClick={() =>
                    void add({ provider: 'discogs', providerReleaseId: r.providerReleaseId })
                  }
                >
                  {addingId === r.providerReleaseId ? 'Adding…' : 'Add to collection'}
                </Button>
              )}
              <a
                className="vi-btn vi-btn--ghost vi-btn--sm"
                href={r.derivedProviderPageUrl}
                target="_blank"
                rel="noreferrer"
              >
                Discogs
                <span className="vi-visually-hidden"> (opens in a new tab)</span>
              </a>
            </div>
            {addErrors[r.providerReleaseId] ? (
              <p className="vi-error-text" role="alert">
                {addErrors[r.providerReleaseId]}
              </p>
            ) : null}
          </div>
        </article>
      </li>
    )
  }

  const searched = provider === 'musicbrainz' ? phase !== 'initial' : discogsPhase !== 'initial'
  const confirmingDiscogs = confirmingCandidate?.provider === 'discogs'

  return (
    <div className="vi-discover">
      <div className="vi-discover__searchrow">
        <SearchInput
          label="Search the catalog"
          placeholder="Artist and album, e.g. Portishead Dummy"
          value={query}
          onChange={setQuery}
          onSubmit={() => void (provider === 'musicbrainz' ? runSearch() : runDiscogsSearch())}
          inputRef={searchRef}
        />
        {searched ? (
          <Button
            variant="ghost"
            size="sm"
            iconBefore="close"
            onClick={provider === 'musicbrainz' ? resetSearch : resetDiscogsSearch}
          >
            New search
          </Button>
        ) : null}
      </div>

      <div className="vi-discover__providers">
        <SegmentedRadioGroup
          label="Catalog provider"
          value={provider}
          onChange={setProvider}
          options={PROVIDER_OPTIONS}
        />
      </div>

      {provider === 'musicbrainz' ? (
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
      ) : (
        <div className="vi-discover__modes">
          <SegmentedRadioGroup
            label="Search mode"
            value={discogsMode}
            onChange={handleDiscogsModeChange}
            options={MODE_OPTIONS}
          />
          <a
            className="vi-btn vi-btn--ghost vi-btn--sm"
            href={discogsWebSearchUrl(query || null)}
            target="_blank"
            rel="noreferrer"
          >
            Search on Discogs
            <span className="vi-visually-hidden"> (opens in a new tab)</span>
          </a>
        </div>
      )}

      {provider === 'discogs' ? (
        <p className="vi-hint vi-discover__discogshint">
          Extra pressings and regional releases.
        </p>
      ) : null}

      {provider === 'musicbrainz' && searched && submittedQuery ? (
        <p className="vi-hint vi-discover__current">
          Showing results for &ldquo;<BidiText>{submittedQuery}</BidiText>&rdquo;
          &middot; press Enter to run it again
        </p>
      ) : null}
      {provider === 'discogs' && searched && discogsSubmittedQuery ? (
        <p className="vi-hint vi-discover__current">
          Showing Discogs results for &ldquo;<BidiText>{discogsSubmittedQuery}</BidiText>
          &rdquo; &middot; press Enter to run it again
        </p>
      ) : null}

      {provider === 'musicbrainz' ? (
        <>
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
        </>
      ) : (
        <>
          {discogsPhase === 'initial' ? (
            <div className="vi-discover__hint">
              <p>Search Discogs for a release, confirm it&rsquo;s the right pressing, and add it.</p>
              <div className="vi-discover__examples">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className="vi-chip"
                    onClick={() => {
                      setQuery(ex)
                      void runDiscogsSearch(ex)
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {discogsPhase === 'loading' ? (
            <div className="vi-candidate__list" aria-busy="true">
              <SkeletonAlbumCard />
              <SkeletonAlbumCard />
            </div>
          ) : null}

          {discogsPhase === 'error' && discogsSearchError ? (
            <div className="vi-errorstate" role="alert">
              <Icon name="alert" size={20} />
              <p>{discogsSearchError}</p>
              <Button variant="secondary" size="sm" onClick={() => void runDiscogsSearch()}>
                Try again
              </Button>
            </div>
          ) : null}
          {discogsPhase !== 'error' && discogsSearchError ? (
            <p className="vi-error-text" role="alert">
              {discogsSearchError}
            </p>
          ) : null}

          {discogsPhase === 'no-results' ? (
            <div className="vi-discover__empty" role="status">
              <p>No Vinyl matches found on Discogs for that search.</p>
              <p className="vi-hint">
                Try different words, or add the record manually below.
              </p>
            </div>
          ) : null}

          {discogsPhase === 'results' ? (
            <ul className="vi-candidate__list" aria-label="Discogs results">
              {discogsResults.map((r) => renderDiscogsResult(r))}
            </ul>
          ) : null}

          <div className="vi-discover__exacturl">
            <Field
              label="Know the exact release?"
              htmlFor="vi-discover-discogs-exacturl"
              error={
                discogsExactUrlPhase === 'invalid' || discogsExactUrlPhase === 'error'
                  ? discogsExactUrlError
                  : null
              }
            >
              <form
                className="vi-discover__exacturl-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitDiscogsExactUrl()
                }}
              >
                <Input
                  id="vi-discover-discogs-exacturl"
                  type="url"
                  inputMode="url"
                  value={discogsExactUrlInput}
                  onChange={(e) => setDiscogsExactUrlInput(e.target.value)}
                  placeholder="https://www.discogs.com/release/26770295-..."
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={discogsExactUrlPhase === 'loading'}
                  aria-busy={discogsExactUrlPhase === 'loading'}
                >
                  {discogsExactUrlPhase === 'loading' ? 'Finding…' : 'Find exact release'}
                </Button>
              </form>
            </Field>

            {discogsExactUrlPhase === 'result' && discogsExactCandidate ? (
              <ul className="vi-candidate__list" aria-label="Exact Discogs release">
                {renderCandidate(discogsExactCandidate)}
              </ul>
            ) : null}
          </div>
        </>
      )}

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
            You already own this{confirmingDiscogs ? ' Discogs' : ''} release. Add
            another physical copy to your collection?
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
