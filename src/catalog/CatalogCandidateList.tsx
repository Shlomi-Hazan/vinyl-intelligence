import { CatalogCandidateCard } from './CatalogCandidateCard.tsx'
import type { CatalogCandidate } from '../lib/catalog/types.ts'

type CatalogCandidateListProps = {
  addingCandidateId: string | null
  addErrors: Record<string, string>
  candidates: CatalogCandidate[]
  onAdd: (candidate: CatalogCandidate) => void
}

export function CatalogCandidateList({
  addingCandidateId,
  addErrors,
  candidates,
  onAdd,
}: CatalogCandidateListProps) {
  return (
    <div className="catalog-results" aria-label="Catalog candidates">
      {candidates.map((candidate) => (
        <CatalogCandidateCard
          candidate={candidate}
          errorMessage={addErrors[candidate.providerReleaseId] ?? null}
          isAdding={addingCandidateId === candidate.providerReleaseId}
          key={candidate.providerReleaseId}
          onAdd={onAdd}
        />
      ))}
    </div>
  )
}
