import { useEffect, useState, type FormEvent } from 'react'
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
  /**
   * Optional UI-only signal so a host (e.g. the /vin page) can show a matching
   * Vinny state. It is derived from the initial-request flow only and does not
   * change any curator behaviour or contract. A true technical error reports
   * `idle` (the panel shows its own error UI) - never `no-match`.
   */
  onStatusChange?: (state: CuratorUiState) => void
}

type PanelStatus = 'idle' | 'loading' | 'error' | 'done'

/** Semantic curator state for the host's Vinny character. */
export type CuratorUiState = 'idle' | 'thinking' | 'success' | 'no-match'

// Client-only starter prompts. Clicking one ONLY sets the request text - it is
// never auto-submitted and makes no model call. No backend/schema change.
const STARTER_PROMPTS = [
  'Something relaxing',
  'A forgotten favourite',
  'Something I have not played lately',
  'Surprise me',
] as const

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

export function CuratorPanel({
  client,
  initialRequest,
  onStatusChange,
}: CuratorPanelProps) {
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

  // Map the internal flow to a semantic Vinny state for the host page.
  let vinnyState: CuratorUiState = 'idle'
  if (status === 'loading') {
    vinnyState = 'thinking'
  } else if (status === 'done') {
    if (conversation) {
      const lastCurator = [...conversation.turns]
        .reverse()
        .find((turn) => turn.role === 'curator')
      vinnyState = lastCurator?.kind === 'no_match' ? 'no-match' : 'success'
    } else if (initialResult?.status === 'ok') {
      vinnyState = 'success'
    } else if (initialResult?.status === 'no_match') {
      vinnyState = 'no-match'
    }
  }
  // status 'error' deliberately stays 'idle' - the panel renders the error.

  useEffect(() => {
    onStatusChange?.(vinnyState)
  }, [vinnyState, onStatusChange])

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
    <section className="curator-panel vi-curator" aria-labelledby="curator-title">
      <div className="vi-curator__intro">
        <p className="vi-eyebrow">Ask VIN</p>
        <h2 id="curator-title">What should I play?</h2>
        <p className="vi-hint">VIN recommends only from records you own.</p>
      </div>

      {conversation === null ? (
        <form className="vi-curator__form" onSubmit={handleSubmit}>
          <div className="vi-curator__starters" aria-label="Prompt suggestions">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="vi-chip"
                onClick={() => setRequest(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <label className="vi-field vi-curator__request">
            <span className="vi-label">Your request</span>
            <textarea
              className="vi-textarea"
              maxLength={MAX_REQUEST_LENGTH}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="I had a stressful day. Give me something relaxing but not sleepy."
              rows={4}
              value={request}
            />
          </label>
          <div className="vi-curator__submit">
            <button
              className="vi-btn vi-btn--primary vi-btn--lg"
              disabled={pending || trimmed.length === 0}
              type="submit"
            >
              {pending ? 'Thinking...' : 'Recommend'}
            </button>
            <span aria-live="polite" className="vi-hint">
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
