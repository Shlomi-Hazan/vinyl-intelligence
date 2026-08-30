import {
  COLLECTION_SORTS,
  hasActiveFilters,
  yearFilterIsInvalid,
  type CollectionFilters,
  type CollectionSort,
} from './collectionQuery.ts'

type CollectionLibraryControlsProps = {
  filters: CollectionFilters
  sort: CollectionSort
  decades: string[]
  genres: string[]
  visibleCount: number
  totalCount: number
  onFiltersChange: (next: CollectionFilters) => void
  onSortChange: (next: CollectionSort) => void
  onClear: () => void
}

export function CollectionLibraryControls({
  filters,
  sort,
  decades,
  genres,
  visibleCount,
  totalCount,
  onFiltersChange,
  onSortChange,
  onClear,
}: CollectionLibraryControlsProps) {
  function update(patch: Partial<CollectionFilters>) {
    onFiltersChange({ ...filters, ...patch })
  }

  const canClear = hasActiveFilters(filters)

  return (
    <div className="collection-library-controls" role="search">
      <label>
        Search collection
        <input
          onChange={(event) => update({ search: event.target.value })}
          placeholder="Artist or album"
          type="search"
          value={filters.search}
        />
      </label>

      {decades.length > 0 ? (
        <label>
          Decade
          <select
            onChange={(event) => update({ decade: event.target.value })}
            value={filters.decade}
          >
            <option value="">All decades</option>
            {decades.map((decade) => (
              <option key={decade} value={decade}>
                {decade}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        Year
        <input
          inputMode="numeric"
          onChange={(event) => update({ year: event.target.value })}
          placeholder="Exact year"
          type="text"
          value={filters.year}
        />
      </label>

      {genres.length > 0 ? (
        <label>
          Genre filter
          <select
            onChange={(event) => update({ genre: event.target.value })}
            value={filters.genre}
          >
            <option value="">All genres</option>
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        Sort
        <select
          onChange={(event) => onSortChange(event.target.value as CollectionSort)}
          value={sort}
        >
          {COLLECTION_SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="auth-actions collection-library-actions">
        <button disabled={!canClear} onClick={onClear} type="button">
          Clear filters
        </button>
        <p className="field-hint" aria-live="polite">
          {visibleCount} of {totalCount} records
        </p>
      </div>

      {yearFilterIsInvalid(filters.year) ? (
        <p className="field-hint">
          Enter a whole year (for example 1977) to filter by year.
        </p>
      ) : null}
    </div>
  )
}
