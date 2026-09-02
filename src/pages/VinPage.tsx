import { useLocation } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { CuratorPanel } from '../curator/CuratorPanel.tsx'
import { useClient } from '../app/useClient.ts'

/*
 * Phase A/B: hosts the M9 single-turn recommendation + M10 bounded refinement
 * exactly as-is. NO change to the curator client, contracts, prompts, schemas,
 * models, rate limits, telemetry, or owned-ID invariant.
 *
 * Phase B: accepts a client-only `prefill` from router state (the dashboard
 * "Quick VIN" jump). It only pre-fills the textarea - no submit, no model call.
 * The premium curator conversation redesign + 5-state Vinny are Phase D.
 */
export function VinPage() {
  const { client } = useClient()
  const location = useLocation()
  const state = location.state as { prefill?: unknown } | null
  const prefill =
    typeof state?.prefill === 'string' ? state.prefill.slice(0, 800) : undefined

  return (
    <div className="vi-page legacy-host">
      <PageHeader
        eyebrow="AI curator"
        title="Ask VIN"
        actions={<VinAvatar size={40} />}
      />
      <CuratorPanel client={client} initialRequest={prefill} />
    </div>
  )
}
