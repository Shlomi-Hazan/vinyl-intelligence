import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { customCoverPath } from '../lib/collection/customCover.ts'
import { RatingControl, SegmentedControl, Select } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { useToast } from '../ui/useToast.ts'
import {
  COLLECTION_SORTS,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  applyCollectionQuery,
  availableDecades,
  availableGenres,
  hasActiveFilters,
  yearFilterIsInvalid,
  type CollectionFilters,
  type CollectionSort,
} from './collectionQuery.ts'
import { summarizeListeningForItem } from './listeningSummary.ts'
import {
  addListeningEvent,
  type ListeningEventRecord,
} from '../lib/supabase/listeningEvents.ts'
import { updateCollectionItemPersonalSignals } from '../lib/supabase/collection.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type CollectionView = 'grid' | 'list'

const VIEW_STORAGE_KEY = 'vi:collection:view'
const SORT_VALUES = new Set<string>(COLLECTION_SORTS.map((s) => s.value))

function readStoredView(): CollectionView {
  try {
    return sessionStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

/**
 * Truthful listening label for the list view. "Never played" and a play count
 * are only shown once the listening-events data has actually loaded.
 */
function playsLabel(
  status: 'loading' | 'ready' | 'error',
  count: number,
): string {
  if (status === 'loading') {
    return 'Plays loading…'
  }
  if (status === 'error') {
    return 'Plays unavailable'
  }
  return count > 0 ? `${count} play${count === 1 ? '' : 's'}` : 'Never played'
}

function metaLine(item: CollectionItemWithRelease): string {
  const year = item.release.release_year
  const genre = (item.release.genres ?? [])[0]
  return [year ? String(year) : null, genre]
    .filter((x): x is string => Boolean(x))
    .join(' · ')
}

type CollectionBrowserProps = {
  client: BrowserSupabaseClient
  userId: string
  items: CollectionItemWithRelease[]
  events: ListeningEventRecord[]
  /**
   * Load phase of the listening-events data. Play counts / "Never played" are
   * only shown when this is `ready`; `loading` / `error` render as unknown.
   */
  eventsStatus?: 'loading' | 'ready' | 'error'
  /** Called after a successful inline mutation so the provider reloads. */
  onMutated: () => void
}

export function CollectionBrowser({
  client,
  userId,
  items,
  events,
  eventsStatus = 'ready',
  onMutated,
}: CollectionBrowserProps) {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const [view, setView] = useState<CollectionView>(readStoredView)
  const [busyId, setBusyId] = useState<string | null>(null)

  const q = params.get('q') ?? ''
  const genreParam = params.get('genre') ?? ''
  const decadeParam = params.get('decade') ?? ''
  const yearParam = params.get('year') ?? ''
  const favoritesOnly = params.get('fav') === '1'
  const sortParam = params.get('sort') ?? ''
  const sort: CollectionSort = SORT_VALUES.has(sortParam)
    ? (sortParam as CollectionSort)
    : DEFAULT_SORT

  const filters: CollectionFilters = useMemo(
    () => ({ search: q, genre: genreParam, decade: decadeParam, year: yearParam }),
    [q, genreParam, decadeParam, yearParam],
  )

  const setFilterParams = useCallback(
    (next: {
      filters?: CollectionFilters
      sort?: CollectionSort
      favoritesOnly?: boolean
    }) => {
      const f = next.filters ?? filters
      const s = next.sort ?? sort
      const fav = next.favoritesOnly ?? favoritesOnly
      const p = new URLSearchParams()
      if (f.search.trim()) p.set('q', f.search.trim())
      if (f.genre) p.set('genre', f.genre)
      if (f.decade) p.set('decade', f.decade)
      if (f.year.trim()) p.set('year', f.year.trim())
      if (fav) p.set('fav', '1')
      if (s !== DEFAULT_SORT) p.set('sort', s)
      setParams(p, { replace: true })
    },
    [filters, sort, favoritesOnly, setParams],
  )

  const chooseView = useCallback((next: CollectionView) => {
    setView(next)
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      /* private mode */
    }
  }, [])

  const decades = useMemo(() => availableDecades(items), [items])
  const genres = useMemo(() => availableGenres(items), [items])

  const visible = useMemo(() => {
    const queried = applyCollectionQuery(items, filters, sort)
    return favoritesOnly ? queried.filter((i) => i.is_favorite) : queried
  }, [items, filters, sort, favoritesOnly])

  const anyFilter = hasActiveFilters(filters) || favoritesOnly
  const yearInvalid = yearFilterIsInvalid(filters.year)

  async function toggleFavorite(item: CollectionItemWithRelease) {
    if (busyId) return
    const next = !item.is_favorite
    setBusyId(item.id)
    try {
      await updateCollectionItemPersonalSignals(client, item.id, {
        is_favorite: next,
      })
      // No optimistic mutation: the authoritative reload is the source of truth.
      onMutated()
      toast.show({
        message: next ? 'Added to favourites.' : 'Removed from favourites.',
        tone: 'success',
      })
    } catch (error) {
      toast.show({
        message:
          error instanceof Error
            ? error.message
            : "Couldn't update that favourite. Try again.",
        tone: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function logListen(item: CollectionItemWithRelease) {
    if (busyId) return
    setBusyId(item.id)
    try {
      await addListeningEvent(client, item.id)
      onMutated()
      toast.show({ message: 'Added to listening history.', tone: 'success' })
    } catch (error) {
      toast.show({
        message:
          error instanceof Error
            ? error.message
            : "Couldn't add that play to your history. Try again.",
        tone: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="vi-collection" aria-label="Your collection">
      <div className="vi-filterbar" role="search">
        <label className="vi-filterbar__search">
          <span className="vi-visually-hidden">Search your collection</span>
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search artist or album"
            value={filters.search}
            onChange={(e) =>
              setFilterParams({ filters: { ...filters, search: e.target.value } })
            }
          />
        </label>

        {genres.length > 0 ? (
          <Select
            aria-label="Filter by genre"
            value={filters.genre}
            onChange={(e) =>
              setFilterParams({ filters: { ...filters, genre: e.target.value } })
            }
          >
            <option value="">All genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        ) : null}

        {decades.length > 0 ? (
          <Select
            aria-label="Filter by decade"
            value={filters.decade}
            onChange={(e) =>
              setFilterParams({ filters: { ...filters, decade: e.target.value } })
            }
          >
            <option value="">All decades</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          aria-label="Sort"
          value={sort}
          onChange={(e) =>
            setFilterParams({ sort: e.target.value as CollectionSort })
          }
        >
          {COLLECTION_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <button
          type="button"
          className="vi-chip"
          aria-pressed={favoritesOnly}
          onClick={() => setFilterParams({ favoritesOnly: !favoritesOnly })}
        >
          <Icon name="heart" size={13} /> Favourites
        </button>

        <div className="vi-filterbar__end">
          <SegmentedControl<CollectionView>
            label="View"
            value={view}
            onChange={chooseView}
            options={[
              { value: 'grid', label: 'Grid', icon: 'grid' },
              { value: 'list', label: 'List', icon: 'list' },
            ]}
          />
          <Link to="/discover" className="vi-btn vi-btn--secondary vi-btn--sm">
            <Icon name="plus" size={15} /> Add record
          </Link>
        </div>
      </div>

      <div className="vi-filterbar__status">
        <span>
          {visible.length} of {items.length} record{items.length === 1 ? '' : 's'}
        </span>
        {yearInvalid ? (
          <span className="vi-hint">Year must be 1900-2100</span>
        ) : null}
        {anyFilter ? (
          <button
            type="button"
            className="vi-btn vi-btn--ghost vi-btn--sm"
            onClick={() =>
              setFilterParams({
                filters: EMPTY_FILTERS,
                sort: DEFAULT_SORT,
                favoritesOnly: false,
              })
            }
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="vi-collection__filtered-empty" role="status">
          <h3>No records match these filters</h3>
          <p>
            Your collection still has {items.length} record
            {items.length === 1 ? '' : 's'}. Adjust or clear the filters above.
          </p>
        </div>
      ) : view === 'grid' ? (
        <ul className="vi-album-grid" aria-label="Records">
          {visible.map((item) => (
            <li key={item.id}>
              <AlbumCard
                item={item}
                userId={userId}
                client={client}
                busy={busyId === item.id}
                onToggleFavorite={() => toggleFavorite(item)}
                onLogListen={() => logListen(item)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="vi-album-rows" aria-label="Records">
          {visible.map((item) => (
            <li key={item.id}>
              <AlbumRow
                item={item}
                userId={userId}
                client={client}
                busy={busyId === item.id}
                playsLabel={playsLabel(
                  eventsStatus,
                  summarizeListeningForItem(events, item.id).count,
                )}
                onToggleFavorite={() => toggleFavorite(item)}
                onLogListen={() => logListen(item)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type CardProps = {
  item: CollectionItemWithRelease
  userId: string
  client: BrowserSupabaseClient
  busy: boolean
  onToggleFavorite: () => void
  onLogListen: () => void
}

function artProps(item: CardProps['item'], userId: string, client: BrowserSupabaseClient) {
  return {
    artist: item.release.artist,
    title: item.release.title,
    seedId: item.release.id,
    releaseMbid: item.release.provider_release_id ?? null,
    releaseGroupMbid: item.release.provider_release_group_id ?? null,
    customCoverPath: item.custom_cover_path
      ? customCoverPath(userId, item.id)
      : null,
    client,
    customCoverVersion: item.custom_cover_updated_at ?? null,
  }
}

function QuickActions({ item, busy, onToggleFavorite, onLogListen }: CardProps) {
  return (
    <div className="vi-albumcard__actions">
      <button
        type="button"
        className="vi-albumcard__act vi-albumcard__act--fav"
        aria-pressed={item.is_favorite}
        aria-label={item.is_favorite ? 'Remove favourite' : 'Add favourite'}
        disabled={busy}
        onClick={onToggleFavorite}
        data-on={item.is_favorite}
      >
        <Icon name="heart" size={16} filled={item.is_favorite} />
      </button>
      <button
        type="button"
        className="vi-albumcard__act"
        aria-label="Log a listen"
        disabled={busy}
        onClick={onLogListen}
      >
        <Icon name="play" size={15} />
      </button>
    </div>
  )
}

function AlbumCard(props: CardProps) {
  const { item, userId, client } = props
  return (
    <div className="vi-albumcard">
      <Link to={`/collection/${item.id}`} className="vi-albumcard__link">
        <AlbumArtwork size="grid" {...artProps(item, userId, client)} />
        <span className="vi-albumcard__title">{item.release.title}</span>
        <span className="vi-albumcard__meta">
          {item.release.artist}
          {metaLine(item) ? ` · ${metaLine(item)}` : ''}
        </span>
      </Link>
      {item.rating ? (
        <span className="vi-albumcard__rating">
          <RatingControl value={item.rating} readOnly />
        </span>
      ) : null}
      <QuickActions {...props} />
    </div>
  )
}

function AlbumRow(props: CardProps & { playsLabel: string }) {
  const { item, userId, client, playsLabel: plays } = props
  return (
    <div className="vi-albumrow">
      <Link to={`/collection/${item.id}`} className="vi-albumrow__link">
        <span className="vi-albumrow__art">
          <AlbumArtwork size="thumb" {...artProps(item, userId, client)} />
        </span>
        <span className="vi-albumrow__title">{item.release.title}</span>
        <span className="vi-albumrow__artist">{item.release.artist}</span>
        <span className="vi-albumrow__meta">{metaLine(item) || '—'}</span>
        <span className="vi-albumrow__rating">
          {item.rating ? <RatingControl value={item.rating} readOnly /> : null}
        </span>
        <span className="vi-albumrow__plays">{plays}</span>
      </Link>
      <QuickActions {...props} />
    </div>
  )
}
