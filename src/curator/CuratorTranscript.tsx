import type { CuratorTurn } from '../lib/curator/types.ts'

type CuratorTranscriptProps = {
  turns: CuratorTurn[]
}

function turnText(turn: CuratorTurn): string {
  if (turn.role === 'you') {
    return turn.text.length > 120 ? `${turn.text.slice(0, 120)}…` : turn.text
  }
  if (turn.kind === 'ok') {
    return turn.titles.length > 0
      ? `recommended ${turn.titles.join(', ')}`
      : 'recommended nothing'
  }
  return turn.constraints.length > 0
    ? `no records matched (${turn.constraints.join('; ')})`
    : 'no records matched that refinement'
}

/** Bounded conversation transcript - display only, no persisted reasons. */
export function CuratorTranscript({ turns }: CuratorTranscriptProps) {
  if (turns.length === 0) {
    return null
  }
  return (
    <ol className="curator-transcript" aria-label="Conversation so far">
      {turns.map((turn, index) => (
        <li
          className={turn.role === 'you' ? 'curator-turn-you' : 'curator-turn-curator'}
          // Turns are append-only and never reordered; index is a stable key here.
          key={index}
        >
          <span className="curator-turn-role">
            {turn.role === 'you' ? 'You' : 'Curator'}
          </span>
          <span className="curator-turn-text">{turnText(turn)}</span>
        </li>
      ))}
    </ol>
  )
}
