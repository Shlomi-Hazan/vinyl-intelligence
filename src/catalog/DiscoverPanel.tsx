import { useCallback, useMemo, useRef, useState } from 'react'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { CollectionForm } from '../collection/CollectionForm.tsx'
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
import {
  addManualCollectionItem,
  type ManualReleaseInput,
} from '../lib/supabase/collection.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const EXAMPLES = ['Alice Coltrane', 'Bowie Low', 'Radiohead OK Computer']

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'That did not work. Try again.'
}

function candidateMeta(c: CatalogCandidate): string {
  return [
    c.releaseYear?.toString() ?? null,
    c.label,
    c.catalogNumber,
    c.country,
    c.format,
  ]
    .filter((x): x is string => Boolean(x))
    .join(' · ')
}

type DiscoverPanelProps = {
  client: BrowserSupabaseClient
  userId: string
  ownedItems: CollectionItemWithRelease[]
  onCollectionChanged: () => void
}

type Phase = 'initial' | 'loading' | 'results' | 'no-results' | 'error'

export function DiscoverPanel({
  client,
  userId,
  ownedItems,
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

  const ownedReleaseIds = useMemo(() => {
    const s = new Set<string>()
    for (const item of ownedItems) {
      if (item.release.provider_release_id) {
        s.add(item.release.provider_release_id)
      }
    }
    return s
  }, [ownedItems])

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
          Showing results for &ldquo;{submittedQuery}&rdquo; &middot; press Enter
          to run it again
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
            const owned = ownedReleaseIds.has(c.providerReleaseId)
            const meta = candidateMeta(c)
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
                    <p className="vi-candidate__artist">{c.artist}</p>
                    <h3 className="vi-candidate__title">{c.title}</h3>
                    {meta ? <p className="vi-candidate__meta">{meta}</p> : null}
                    <div className="vi-candidate__actions">
                      {owned ? (
                        <span className="vi-candidate__owned">
                          <Icon name="check" size={15} /> In your collection
                        </span>
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
    </div>
  )
}
