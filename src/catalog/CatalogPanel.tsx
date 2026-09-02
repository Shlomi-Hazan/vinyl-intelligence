import { useCallback, useRef, useState } from 'react'
import { CatalogCandidateList } from './CatalogCandidateList.tsx'
import { CatalogPhotoPanel } from './CatalogPhotoPanel.tsx'
import { CatalogSearchForm } from './CatalogSearchForm.tsx'
import {
  loadCatalogSearchDraft,
  saveCatalogSearchDraft,
} from './catalogSearchDraft.ts'
import {
  addCatalogReleaseToCollection,
  searchCatalog,
} from '../lib/catalog/client.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type CatalogPanelProps = {
  client: BrowserSupabaseClient
  onCatalogItemAdded: () => void
  /**
   * Authenticated user id. When present, the draft query and last successful
   * result set survive a refresh / same-tab navigation via sessionStorage (no
   * new MusicBrainz request on restore).
   */
  userId?: string
  /**
   * The embedded photo-recognition panel. Defaults to `true` for the legacy
   * single-page shell; the Visual Experience `/discover` route sets it `false`
   * because photo recognition has its own `/scan` route.
   */
  showPhotoPanel?: boolean
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Catalog action failed. Please try again.'
}

export function CatalogPanel({
  client,
  onCatalogItemAdded,
  userId,
  showPhotoPanel = true,
}: CatalogPanelProps) {
  const [restoredDraft] = useState(() =>
    userId ? loadCatalogSearchDraft(userId) : null,
  )
  const [query, setQuery] = useState(restoredDraft?.draftQuery ?? '')
  const [candidates, setCandidates] = useState<CatalogCandidate[]>(
    restoredDraft?.result?.candidates ?? [],
  )
  const [hasSearched, setHasSearched] = useState(
    restoredDraft?.result != null,
  )
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [addingCandidateId, setAddingCandidateId] = useState<string | null>(null)
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const searchInProgress = useRef(false)
  // Mirrors the last completed search so a draft-only write does not drop it.
  const lastResultRef = useRef(restoredDraft?.result ?? null)

  const persistSearchDraft = useCallback(
    (draftQuery: string) => {
      if (userId) {
        saveCatalogSearchDraft(userId, {
          draftQuery,
          result: lastResultRef.current,
        })
      }
    },
    [userId],
  )

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery)
      persistSearchDraft(nextQuery)
    },
    [persistSearchDraft],
  )

  // A MusicBrainz search happens only on an explicit action: the search form
  // submit / Enter, or the "search from these clues" button in the photo panel.
  // Typing in the input never calls the provider, so editing an already
  // searched query cannot generate background request bursts.
  const runSearch = useCallback(async (explicitQuery?: string) => {
    if (searchInProgress.current) {
      return
    }

    const trimmedQuery = (explicitQuery ?? query).trim()
    setHasSearched(true)
    setNotice(null)
    setSearchError(null)
    setAddErrors({})

    if (trimmedQuery.length < 2) {
      setCandidates([])
      setSearchError('Search query must be at least 2 characters.')
      return
    }

    searchInProgress.current = true
    setIsSearching(true)

    try {
      const nextCandidates = await searchCatalog(client, trimmedQuery)
      setCandidates(nextCandidates)
      // Persist only a completed search (results, or a legitimate zero-result
      // response). A transient error below never becomes a restored state.
      lastResultRef.current = {
        submittedQuery: trimmedQuery,
        candidates: nextCandidates,
      }
      persistSearchDraft(explicitQuery ?? query)
    } catch (error) {
      setCandidates([])
      setSearchError(getErrorMessage(error))
    } finally {
      searchInProgress.current = false
      setIsSearching(false)
    }
  }, [client, persistSearchDraft, query])

  async function handleAdd(candidate: CatalogCandidate) {
    setAddingCandidateId(candidate.providerReleaseId)
    setNotice(null)
    setAddErrors((current) => ({
      ...current,
      [candidate.providerReleaseId]: '',
    }))

    try {
      await addCatalogReleaseToCollection(client, candidate)
      setNotice('Catalog record added.')
      setAddErrors((current) => {
        const nextErrors = { ...current }
        delete nextErrors[candidate.providerReleaseId]
        return nextErrors
      })
      onCatalogItemAdded()
    } catch (error) {
      setAddErrors((current) => ({
        ...current,
        [candidate.providerReleaseId]: getErrorMessage(error),
      }))
    } finally {
      setAddingCandidateId(null)
    }
  }

  return (
    <section className="catalog-panel" aria-labelledby="catalog-title">
      <div>
        <p className="eyebrow">Catalog add</p>
        <h2 id="catalog-title">Search MusicBrainz</h2>
      </div>

      {showPhotoPanel ? (
        <CatalogPhotoPanel
          client={client}
          onUseQuery={(nextQuery) => {
            handleQueryChange(nextQuery)
            void runSearch(nextQuery)
          }}
          userId={userId}
        />
      ) : null}

      <CatalogSearchForm
        isSearching={isSearching}
        onQueryChange={handleQueryChange}
        onSubmit={() => void runSearch()}
        query={query}
      />

      {notice ? <p className="notice">{notice}</p> : null}
      {searchError ? <p className="error">{searchError}</p> : null}

      {hasSearched && !isSearching && !searchError && candidates.length === 0 ? (
        <p className="field-hint">No MusicBrainz releases matched that search.</p>
      ) : null}

      {candidates.length > 0 ? (
        <CatalogCandidateList
          addErrors={addErrors}
          addingCandidateId={addingCandidateId}
          candidates={candidates}
          onAdd={(candidate) => void handleAdd(candidate)}
        />
      ) : null}
    </section>
  )
}
