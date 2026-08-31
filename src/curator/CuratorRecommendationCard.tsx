import type { CuratorRecommendation } from '../lib/curator/types.ts'

type CuratorRecommendationCardProps = {
  recommendation: CuratorRecommendation
}

function metadataLine(rec: CuratorRecommendation): string {
  const parts: string[] = []
  if (rec.year !== null) {
    parts.push(String(rec.year))
  }
  if (rec.decade !== null) {
    parts.push(`${rec.decade}s`)
  }
  return parts.join(' · ')
}

function listeningLine(rec: CuratorRecommendation): string {
  if (rec.neverPlayed) {
    return 'Never played'
  }
  if (rec.lastListenedAt) {
    const days = Math.max(
      0,
      Math.floor((Date.now() - new Date(rec.lastListenedAt).getTime()) / 86_400_000),
    )
    const played = `Played ${rec.playCount} time${rec.playCount === 1 ? '' : 's'}`
    return `${played} · last listened ${days} day${days === 1 ? '' : 's'} ago`
  }
  return `Played ${rec.playCount} time${rec.playCount === 1 ? '' : 's'}`
}

export function CuratorRecommendationCard({ recommendation }: CuratorRecommendationCardProps) {
  const detail = metadataLine(recommendation)

  return (
    <article className="curator-recommendation">
      {recommendation.isBestMatch ? (
        <p className="curator-best-match">Best match</p>
      ) : null}
      <h3>{recommendation.title}</h3>
      <p className="collection-artist">{recommendation.artist}</p>
      {detail ? <p className="field-hint">{detail}</p> : null}
      {recommendation.genres.length > 0 ? (
        <p className="collection-genres">{recommendation.genres.join(', ')}</p>
      ) : null}
      <p className="curator-reason">{recommendation.reason}</p>
      <p className="field-hint curator-facts">
        {recommendation.rating !== null ? (
          <span aria-label={`Rated ${recommendation.rating} of 5`}>
            {'★'.repeat(recommendation.rating)}
            {'☆'.repeat(5 - recommendation.rating)}
          </span>
        ) : null}
        {recommendation.favorite ? <span>{'★'} Favorite</span> : null}
        <span>{listeningLine(recommendation)}</span>
      </p>
    </article>
  )
}
