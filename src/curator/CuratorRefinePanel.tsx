import { useState, type FormEvent } from 'react'
import { CuratorTranscript } from './CuratorTranscript.tsx'
import { refineCuratorRecommendation } from '../lib/curator/client.ts'
import {
  CuratorError,
  MAX_REFINEMENTS,
  MAX_REQUEST_LENGTH,
  type CuratorConversation,
  type CuratorRefineResult,
} from '../lib/curator/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type CuratorRefinePanelProps = {
  client: BrowserSupabaseClient
  conversation: CuratorConversation
  onRefined: (result: CuratorRefineResult, followUpText: string) => void
  onStartOver: () => void
}

const CHIPS = ['More energetic', 'More relaxed', 'Something older', 'Something else'] as const

function errorMessage(error: unknown): string {
  if (error instanceof CuratorError) {
    return error.message
  }
  return 'The refinement failed. Please try again.'
}

export function CuratorRefinePanel({
  client,
  conversation,
  onRefined,
  onStartOver,
}: CuratorRefinePanelProps) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = text.trim()
  const atLimit = conversation.refinementCount >= MAX_REFINEMENTS

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending || atLimit || trimmed.length === 0) {
      return
    }

    setPending(true)
    setError(null)

    try {
      const result = await refineCuratorRecommendation(client, trimmed, {
        previousRequest: conversation.latestRequestText,
        previousIntent: conversation.latestIntent,
        previousRecommendationIds: conversation.latestRecommendationIds,
      })
      onRefined(result, trimmed)
      setText('')
    } catch (caught) {
      // Keep the previous result visible; do not consume a refinement turn.
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="curator-refine" aria-labelledby="curator-refine-title">
      <h3 id="curator-refine-title">Refine these recommendations</h3>

      <CuratorTranscript turns={conversation.turns} />

      {atLimit ? (
        <div className="curator-state">
          <p className="field-hint">
            That&rsquo;s {MAX_REFINEMENTS} refinements. Start over to begin a new
            conversation.
          </p>
          <button onClick={onStartOver} type="button">
            Start over
          </button>
        </div>
      ) : (
        <>
          <div className="curator-chips" aria-label="Refinement suggestions">
            {CHIPS.map((chip) => (
              <button
                className="curator-chip"
                disabled={pending}
                key={chip}
                onClick={() => setText(chip)}
                type="button"
              >
                {chip}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <label className="curator-request">
              Your follow-up
              <textarea
                maxLength={MAX_REQUEST_LENGTH}
                onChange={(e) => setText(e.target.value)}
                placeholder="Only favorites."
                rows={2}
                value={text}
              />
            </label>
            <div className="collection-personal-row">
              <button disabled={pending || trimmed.length === 0} type="submit">
                {pending ? 'Refining...' : 'Refine'}
              </button>
              <span aria-live="polite" className="field-hint">
                {text.length} / {MAX_REQUEST_LENGTH}
              </span>
              <button className="curator-start-over" onClick={onStartOver} type="button">
                Start over
              </button>
            </div>
          </form>
        </>
      )}

      {error ? (
        <div className="curator-state" role="alert">
          <p className="error">{error}</p>
        </div>
      ) : null}
    </section>
  )
}
