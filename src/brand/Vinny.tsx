/*
 * VIN / Vinny - the Vinyl Intelligence curator character.
 *
 * The canonical Vinny is a set of five approved 3D-rendered image assets
 * (project-owned, in public/vinny/). This component is the single source of
 * truth for the state -> asset mapping; nothing else references the files
 * directly. The assets are transparent PNGs at 600x750; they are served as
 * static files and loaded on demand by the browser (never bundled).
 *
 * States:
 *   idle      - friendly standing Vinny (default)
 *   thinking  - finger-to-face, while VIN is choosing
 *   success   - presenting a record, when VIN has a pick
 *   no-match  - shrug + question mark, when VIN found nothing to suggest
 *   empty     - Vinny beside an empty record crate, for empty collection/shelf
 */

export type VinnyState = 'idle' | 'thinking' | 'success' | 'no-match' | 'empty'

const ASSET: Record<VinnyState, string> = {
  idle: '/vinny/vinny-idle.png',
  thinking: '/vinny/vinny-thinking.png',
  success: '/vinny/vinny-success.png',
  'no-match': '/vinny/vinny-no-match.png',
  empty: '/vinny/vinny-empty.png',
}

// intrinsic size of every approved asset - used to reserve layout space so the
// image load does not shift the page.
const NATURAL_W = 600
const NATURAL_H = 750

type VinnyProps = {
  state?: VinnyState
  /** Rendered width in px (height keeps the asset's aspect ratio). */
  size?: number
  className?: string
  /**
   * Omit for a decorative Vinny (aria-hidden). Provide a concise phrase where
   * Vinny is the only thing communicating a state.
   */
  label?: string
}

export function Vinny({ state = 'idle', size = 120, className, label }: VinnyProps) {
  return (
    <img
      className={['vi-vinny', `vi-vinny--${state}`, className]
        .filter(Boolean)
        .join(' ')}
      src={ASSET[state]}
      width={size}
      height={Math.round((size * NATURAL_H) / NATURAL_W)}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      decoding="async"
      draggable={false}
    />
  )
}
