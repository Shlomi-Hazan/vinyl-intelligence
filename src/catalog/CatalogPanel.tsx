import { useCallback, useEffect, useRef, useState } from 'react'
import { CatalogCandidateList } from './CatalogCandidateList.tsx'
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

const CATALOG_SEARCH_DEBOUNCE_MS = 450

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
  const latestSearchId = useRef(0)
  const lastSearchQuery = useRef('')

  const runSearch = useCallback(async (nextQuery = query) => {
    const trimmedQuery = nextQuery.trim()
    lastSearchQuery.current = trimmedQuery
    const searchId = latestSearchId.current + 1
    latestSearchId.current = searchId
    setHasSearched(true)
    setNotice(null)
    setSearchError(null)
    setAddErrors({})

    if (trimmedQuery.length < 2) {
      setCandidates([])
      setSearchError('Search query must be at least 2 characters.')
      return
    }

    setIsSearching(true)

    try {
      const nextCandidates = await searchCatalog(client, trimmedQuery)

      if (latestSearchId.current !== searchId) {
        return
      }

      setCandidates(nextCandidates)
    } catch (error) {
      if (latestSearchId.current !== searchId) {
        return
      }

      setCandidates([])
      setSearchError(getErrorMessage(error))
    } finally {
      if (latestSearchId.current === searchId) {
        setIsSearching(false)
      }
    }
  }, [client, query])

  useEffect(() => {
    if (!hasSearched) {
      return undefined
    }

    if (query.trim() === lastSearchQuery.current) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      void runSearch(query)
    }, CATALOG_SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [hasSearched, query, runSearch])

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
