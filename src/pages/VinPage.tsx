import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { Vinny } from '../brand/Vinny.tsx'
import { CuratorPanel, type CuratorUiState } from '../curator/CuratorPanel.tsx'
import { useClient } from '../app/useClient.ts'
import { useCollectionData } from '../app/useCollectionData.ts'

/*
 * Phase A/B: hosts the M9 single-turn recommendation + M10 bounded refinement
 * exactly as-is. NO change to the curator client, contracts, prompts, schemas,
 * models, rate limits, telemetry, or owned-ID invariant.
 *
 * Phase B correction: a focused two-area curator composition - the request on
 * the left, VIN + real collection context + the current curator state on the
 * right. When the collection is empty, the recommendation UI is replaced by an
 * honest "add records first" state (no model call is possible / made).
 * `prefill` (dashboard Quick VIN) is a client-only textarea seed.
 * `onStatusChange` is a UI-only signal for VIN's thinking state.
 */
export function VinPage() {
  const { client } = useClient()
  const location = useLocation()
  const { items, status: collectionStatus } = useCollectionData()
  const [vinState, setVinState] = useState<CuratorUiState>('idle')

  const state = location.state as { prefill?: unknown } | null
  const prefill =
    typeof state?.prefill === 'string' ? state.prefill.slice(0, 800) : undefined

  const ready = collectionStatus === 'ready'
  const ownedCount = ready ? items.length : null
  const emptyCollection = ready && items.length === 0

  const asideState = emptyCollection ? 'empty' : vinState

  const stateCopy =
    vinState === 'thinking'
      ? 'VIN is digging through your crate...'
      : vinState === 'success'
        ? "VIN's pick is ready."
        : vinState === 'no-match'
          ? 'No match for that one - try different words.'
          : 'Describe a mood and VIN will choose.'

  return (
    <div className="vi-page vi-page--wide legacy-host">
      <PageHeader eyebrow="AI curator" title="Ask VIN" />

      <div className="vi-vinpage">
        <div className="vi-vinpage__main">
          {emptyCollection ? (
            <div className="vi-onboard">
              <h2>VIN needs records first</h2>
              <p>
                VIN only recommends from music you own. Add a few records and
                then ask "what should I play?".
              </p>
              <div className="vi-onboard__cta">
                <Link to="/discover" className="vi-btn vi-btn--primary vi-btn--lg">
                  Add a record
                </Link>
                <Link to="/scan" className="vi-btn vi-btn--secondary vi-btn--lg">
                  Scan a cover
                </Link>
              </div>
            </div>
          ) : (
            <CuratorPanel
              client={client}
              initialRequest={prefill}
              onStatusChange={setVinState}
            />
          )}
        </div>

        <aside className="vi-vinpage__aside" aria-live="polite">
          <Vinny state={asideState} size={190} />
          <strong>VIN</strong>
          <p>
            Your Vinyl Intelligence Navigator - recommends only from records you
            own
            {ownedCount !== null ? ` (${ownedCount} in your collection)` : ''}.
          </p>
          {!emptyCollection ? (
            <p className="vi-vinpage__state">{stateCopy}</p>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
