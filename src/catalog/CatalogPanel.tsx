import { useCallback, useRef, useState } from 'react'
import { CatalogCandidateList } from './CatalogCandidateList.tsx'
import { CatalogPhotoPanel } from './CatalogPhotoPanel.tsx'
import { CatalogSearchForm } from './CatalogSearchForm.tsx'
import {
  addCatalogReleaseToCollection,
  searchCatalog,
} from '../lib/catalog/client.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type CatalogPanelProps = {
  client: BrowserSupabaseClient
  onCatalogItemAdded: () => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Catalog action failed. Please try again.'
}

export function CatalogPanel({ client, onCatalogItemAdded }: CatalogPanelProps) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<CatalogCandidate[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [addingCandidateId, setAddingCandidateId] = useState<string | null>(null)
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const searchInProgress = useRef(false)

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
      setCandidates(await searchCatalog(client, trimmedQuery))
    } catch (error) {
      setCandidates([])
      setSearchError(getErrorMessage(error))
    } finally {
      searchInProgress.current = false
      setIsSearching(false)
    }
  }, [client, query])

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

      <CatalogPhotoPanel
        client={client}
        onUseQuery={(nextQuery) => {
          setQuery(nextQuery)
          void runSearch(nextQuery)
        }}
      />

      <CatalogSearchForm
        isSearching={isSearching}
        onQueryChange={setQuery}
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
