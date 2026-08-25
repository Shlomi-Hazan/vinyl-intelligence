import { type FormEvent } from 'react'

type CatalogSearchFormProps = {
  isSearching: boolean
  onQueryChange: (query: string) => void
  onSubmit: () => void
  query: string
}

export function CatalogSearchForm({
  isSearching,
  onQueryChange,
  onSubmit,
  query,
}: CatalogSearchFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form className="catalog-form" onSubmit={handleSubmit}>
      <label>
        Catalog search
        <input
          maxLength={120}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Artist, album, or catalog number"
          type="search"
          value={query}
        />
      </label>
      <div className="auth-actions">
        <button disabled={isSearching || query.trim().length < 2} type="submit">
          {isSearching ? 'Searching...' : 'Search catalog'}
        </button>
      </div>
    </form>
  )
}
