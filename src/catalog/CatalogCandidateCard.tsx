import type { CatalogCandidate } from '../lib/catalog/types.ts'

type CatalogCandidateCardProps = {
  candidate: CatalogCandidate
  errorMessage?: string | null
  isAdding: boolean
  onAdd: (candidate: CatalogCandidate) => void
}

function optionalDetails(candidate: CatalogCandidate): string {
  return [
    candidate.releaseYear?.toString() ?? null,
    candidate.label,
    candidate.catalogNumber,
    candidate.country,
    candidate.format,
  ]
    .filter((detail): detail is string => Boolean(detail))
    .join(' / ')
}

export function CatalogCandidateCard({
  candidate,
  errorMessage,
  isAdding,
  onAdd,
}: CatalogCandidateCardProps) {
  const details = optionalDetails(candidate)

  return (
    <article className="catalog-card">
      <div className="collection-card-main">
        <p className="collection-artist">{candidate.artist}</p>
        <h3>{candidate.title}</h3>
        {details ? <p className="field-hint">{details}</p> : null}
        <p className="field-hint">
          <a href={candidate.derivedProviderPageUrl} rel="noreferrer" target="_blank">
            MusicBrainz release
          </a>
        </p>
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </div>
      <div className="collection-card-actions">
        <button
          disabled={isAdding}
          onClick={() => onAdd(candidate)}
          type="button"
        >
          {isAdding ? 'Adding...' : 'Add to collection'}
        </button>
      </div>
    </article>
  )
}
