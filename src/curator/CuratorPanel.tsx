import { useState, type FormEvent } from 'react'
import { CuratorRecommendationCard } from './CuratorRecommendationCard.tsx'
import { CuratorRefinePanel } from './CuratorRefinePanel.tsx'
import { requestCuratorRecommendation } from '../lib/curator/client.ts'
import {
  CuratorError,
  DEFAULT_RECENT_DAYS,
  MAX_REQUEST_LENGTH,
  type CuratorConversation,
  type CuratorIntent,
  type CuratorRecommendation,
  type CuratorRefineResult,
  type CuratorResult,
} from '../lib/curator/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type CuratorPanelProps = {
  client: BrowserSupabaseClient
  /**
   * Optional client-only seed for the request textarea (e.g. the dashboard
   * "Quick VIN" prefill). It only pre-fills the field - nothing is submitted
   * and no model call is made until the user explicitly asks. The M9/M10
   * request/response contracts are unchanged.
   */
  initialRequest?: string
}

type PanelStatus = 'idle' | 'loading' | 'error' | 'done'

type OkResult = Extract<CuratorResult | CuratorRefineResult, { status: 'ok' }>

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

function recommendationTitles(recs: CuratorRecommendation[]): string[] {
  return recs.slice(0, 3).map((r) => r.title)
}

function OkCards({ result }: { result: OkResult }) {
  const excluded =
    'excludedPreviousRecommendations' in result ? result.excludedPreviousRecommendations : 0
  return (
    <div className="curator-results">
      <p className="field-hint">
        Chosen from {result.candidateCount} matching record
        {result.candidateCount === 1 ? '' : 's'}.
        {excluded > 0
          ? ` Excluded ${excluded} previous pick${excluded === 1 ? '' : 's'}.`
          : ''}
      </p>
      <div className="curator-list" aria-label="Recommendations">
        {result.recommendations.map((rec) => (
          <CuratorRecommendationCard key={rec.collectionItemId} recommendation={rec} />
        ))}
      </div>
    </div>
  )
}

export function CuratorPanel({ client, initialRequest }: CuratorPanelProps) {
  const [request, setRequest] = useState(() => initialRequest ?? '')
  const [status, setStatus] = useState<PanelStatus>('idle')
  const [initialResult, setInitialResult] = useState<CuratorResult | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  // Milestone 10 - bounded conversation state; React memory only, no persistence.
  const [conversation, setConversation] = useState<CuratorConversation | null>(null)
  const [lastOkResult, setLastOkResult] = useState<OkResult | null>(null)
  const [refineNoMatchIntent, setRefineNoMatchIntent] = useState<CuratorIntent | null>(null)
  const [refineEmpty, setRefineEmpty] = useState(false)

  const trimmed = request.trim()
  const pending = status === 'loading'

  function resetConversation() {
    setConversation(null)
    setLastOkResult(null)
    setRefineNoMatchIntent(null)
    setRefineEmpty(false)
    setInitialResult(null)
    setStatus('idle')
    setError(null)
    setRequest('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending || trimmed.length === 0 || conversation !== null) {
      return
    }

    setStatus('loading')
    setError(null)

    try {
      const next = await requestCuratorRecommendation(client, trimmed)
      setInitialResult(next)
      setStatus('done')
      if (next.status === 'ok') {
        setLastOkResult(next)
        setConversation({
          turns: [
            { role: 'you', text: trimmed },
            { role: 'curator', kind: 'ok', titles: recommendationTitles(next.recommendations) },
          ],
          latestIntent: next.interpretedIntent,
          latestRequestText: trimmed,
          latestRecommendationIds: next.recommendations
            .slice(0, 3)
            .map((r) => r.collectionItemId),
          refinementCount: 0,
        })
      }
    } catch (caught) {
      setError(errorMessage(caught))
      setInitialResult(null)
      setStatus('error')
    }
  }

  function handleRefined(result: CuratorRefineResult, followUpText: string) {
    setConversation((current) => {
      if (!current) {
        return current
      }
      const nextTurns = [...current.turns, { role: 'you', text: followUpText } as const]
      if (result.status === 'ok') {
        return {
          turns: [
            ...nextTurns,
            {
              role: 'curator',
              kind: 'ok',
              titles: recommendationTitles(result.recommendations),
            } as const,
          ],
          latestIntent: result.interpretedIntent,
          latestRequestText: followUpText,
          latestRecommendationIds: result.recommendations
            .slice(0, 3)
            .map((r) => r.collectionItemId),
          refinementCount: current.refinementCount + 1,
        }
      }
      if (result.status === 'no_match') {
        return {
          ...current,
          turns: [
            ...nextTurns,
            {
              role: 'curator',
              kind: 'no_match',
              constraints: describeConstraints(result.interpretedIntent),
            } as const,
          ],
          // Advance the semantic state: a no_match is still a successfully
          // interpreted conversational change, so the next refinement must
          // start from this newly interpreted intent. The previous successful
          // recommendation IDs/cards deliberately stay for a later
          // "something else".
          latestIntent: result.interpretedIntent,
          latestRequestText: followUpText,
          refinementCount: current.refinementCount + 1,
        }
      }
      // empty_collection
      return {
        ...current,
        turns: nextTurns,
        latestRequestText: followUpText,
        refinementCount: current.refinementCount + 1,
      }
    })

    if (result.status === 'ok') {
      setLastOkResult(result)
      setRefineNoMatchIntent(null)
    } else if (result.status === 'no_match') {
      setRefineNoMatchIntent(result.interpretedIntent)
    } else {
      setRefineEmpty(true)
      setLastOkResult(null)
    }
  }

  return (
    <section className="curator-panel" aria-labelledby="curator-title">
      <div>
        <p className="eyebrow">AI Curator</p>
        <h2 id="curator-title">What should I play?</h2>
        <p className="field-hint">Recommends only from records you own.</p>
      </div>

      {conversation === null ? (
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
      ) : null}

      {pending ? (
        <p className="field-hint">Reading your request and your collection...</p>
      ) : null}

      {status === 'error' && error ? (
        <div className="curator-state" role="alert">
          <p className="error">{error.message}</p>
        </div>
      ) : null}

      {conversation === null && status === 'done' && initialResult?.status === 'empty_collection' ? (
        <p className="field-hint curator-state">
          Add a few records first - the curator only recommends from your own
          collection.
        </p>
      ) : null}

      {conversation === null && status === 'done' && initialResult?.status === 'no_match' ? (
        <div className="curator-state">
          <p className="notice">No owned records match those constraints.</p>
          {describeConstraints(initialResult.interpretedIntent).length > 0 ? (
            <ul className="curator-constraints">
              {describeConstraints(initialResult.interpretedIntent).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <p className="field-hint">Edit your request and try again.</p>
        </div>
      ) : null}

      {conversation !== null ? (
        <>
          {refineEmpty ? (
            <div className="curator-state">
              <p className="notice">Your collection is now empty.</p>
              <button onClick={resetConversation} type="button">
                Start over
              </button>
            </div>
          ) : (
            <>
              {refineNoMatchIntent ? (
                <div className="curator-state">
                  <p className="notice">No owned records match that refinement.</p>
                  {describeConstraints(refineNoMatchIntent).length > 0 ? (
                    <ul className="curator-constraints">
                      {describeConstraints(refineNoMatchIntent).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="field-hint">
                    Showing your previous recommendations below.
                  </p>
                </div>
              ) : null}

              {lastOkResult ? <OkCards result={lastOkResult} /> : null}

              <CuratorRefinePanel
                client={client}
                conversation={conversation}
                onRefined={handleRefined}
                onStartOver={resetConversation}
              />
            </>
          )}
        </>
      ) : null}
    </section>
  )
}
