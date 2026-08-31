import { useState, type FormEvent } from 'react'
import { CuratorRecommendationCard } from './CuratorRecommendationCard.tsx'
import { requestCuratorRecommendation } from '../lib/curator/client.ts'
import {
  CuratorError,
  DEFAULT_RECENT_DAYS,
  MAX_REQUEST_LENGTH,
  type CuratorIntent,
  type CuratorResult,
} from '../lib/curator/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type CuratorPanelProps = {
  client: BrowserSupabaseClient
}

type PanelStatus = 'idle' | 'loading' | 'error' | 'done'

function describeConstraints(intent: CuratorIntent): string[] {
  const lines: string[] = []
  if (intent.includeGenres.length > 0) {
    lines.push(`Genres: ${intent.includeGenres.join(', ')}`)
  }
  if (intent.excludeGenres.length > 0) {
    lines.push(`Excluded genres: ${intent.excludeGenres.join(', ')}`)
  }
  if (intent.decades.length > 0) {
    lines.push(`Decades: ${intent.decades.map((d) => `${d}s`).join(', ')}`)
  }
  if (intent.minRating !== null) {
    lines.push(`Minimum rating: ${intent.minRating}`)
  }
  if (intent.favoritesOnly) {
    lines.push('Favorites only')
  }
  if (intent.neverPlayedOnly) {
    lines.push('Never played only')
  }
  if (intent.avoidRecentlyPlayed) {
    lines.push(`Not played in the last ${intent.recentDays ?? DEFAULT_RECENT_DAYS} days`)
  }
  return lines
}

function errorMessage(error: unknown): { code: string; message: string } {
  if (error instanceof CuratorError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'unknown', message: 'The curator failed. Please try again.' }
}

export function CuratorPanel({ client }: CuratorPanelProps) {
  const [request, setRequest] = useState('')
  const [status, setStatus] = useState<PanelStatus>('idle')
  const [result, setResult] = useState<CuratorResult | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  const trimmed = request.trim()
  const pending = status === 'loading'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending || trimmed.length === 0) {
      return
    }

    setStatus('loading')
    setError(null)

    try {
      const next = await requestCuratorRecommendation(client, trimmed)
      setResult(next)
      setStatus('done')
    } catch (caught) {
      setError(errorMessage(caught))
      setResult(null)
      setStatus('error')
    }
  }

  return (
    <section className="curator-panel" aria-labelledby="curator-title">
      <div>
        <p className="eyebrow">AI Curator</p>
        <h2 id="curator-title">What should I play?</h2>
        <p className="field-hint">Recommends only from records you own.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="curator-request">
          Your request
          <textarea
            maxLength={MAX_REQUEST_LENGTH}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="I had a stressful day. Give me something relaxing but not sleepy."
            rows={3}
            value={request}
          />
        </label>
        <div className="collection-personal-row">
          <button disabled={pending || trimmed.length === 0} type="submit">
            {pending ? 'Thinking...' : 'Recommend'}
          </button>
          <span aria-live="polite" className="field-hint">
            {request.length} / {MAX_REQUEST_LENGTH}
          </span>
        </div>
      </form>

      {pending ? (
        <p className="field-hint">Reading your request and your collection...</p>
      ) : null}

      {status === 'error' && error ? (
        <div className="curator-state" role="alert">
          <p className="error">{error.message}</p>
        </div>
      ) : null}

      {status === 'done' && result?.status === 'empty_collection' ? (
        <p className="field-hint curator-state">
          Add a few records first - the curator only recommends from your own
          collection.
        </p>
      ) : null}

      {status === 'done' && result?.status === 'no_match' ? (
        <div className="curator-state">
          <p className="notice">No owned records match those constraints.</p>
          {describeConstraints(result.interpretedIntent).length > 0 ? (
            <ul className="curator-constraints">
              {describeConstraints(result.interpretedIntent).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <p className="field-hint">Edit your request and try again.</p>
        </div>
      ) : null}

      {status === 'done' && result?.status === 'ok' ? (
        <div className="curator-results">
          <p className="field-hint">
            Chosen from {result.candidateCount} matching record
            {result.candidateCount === 1 ? '' : 's'}.
          </p>
          <div className="curator-list" aria-label="Recommendations">
            {result.recommendations.map((rec) => (
              <CuratorRecommendationCard key={rec.collectionItemId} recommendation={rec} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
