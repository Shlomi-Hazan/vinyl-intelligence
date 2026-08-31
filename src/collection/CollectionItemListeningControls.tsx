import { useState } from 'react'
import { formatListenedAt, type ListeningSummary } from './listeningSummary.ts'

type CollectionItemListeningControlsProps = {
  summary: ListeningSummary
  /**
   * Appends one listening event for this collection item. Rejects on failure so
   * this control can show a recoverable error without fabricating a local event.
   */
  onMarkPlayed: () => Promise<void>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return "Couldn't record that play. Please try again."
}

export function CollectionItemListeningControls({
  summary,
  onMarkPlayed,
}: CollectionItemListeningControlsProps) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function markPlayed() {
    // Guard against a double submit; no debounce, just a per-item in-flight lock.
    if (isPending) {
      return
    }

    setError(null)
    setIsPending(true)

    try {
      await onMarkPlayed()
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setIsPending(false)
    }
  }

  const countLabel =
    summary.count === 0
      ? 'Never played'
      : `Played ${summary.count} time${summary.count === 1 ? '' : 's'}`

  return (
    <div className="collection-card-listening">
      <button disabled={isPending} onClick={() => void markPlayed()} type="button">
        {isPending ? 'Marking...' : 'Mark played'}
      </button>
      <span className="field-hint listening-count">{countLabel}</span>
      {summary.lastListenedAt ? (
        <span className="field-hint">
          {'Last listened: '}
          <time dateTime={summary.lastListenedAt}>
            {formatListenedAt(summary.lastListenedAt)}
          </time>
        </span>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
