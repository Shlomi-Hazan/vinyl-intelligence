import { PageHeader } from '../app/PageHeader.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { CuratorPanel } from '../curator/CuratorPanel.tsx'
import { useClient } from '../app/useClient.ts'

/*
 * Phase A: hosts the M9 single-turn recommendation + M10 bounded refinement
 * exactly as-is. NO change to the curator client, contracts, prompts, schemas,
 * models, rate limits, telemetry, or owned-ID invariant. The premium curator
 * conversation redesign + the 5-state Vinny are Phase D.
 */
export function VinPage() {
  const { client } = useClient()

  return (
    <div className="vi-page legacy-host">
      <PageHeader
        eyebrow="AI curator"
        title="Ask VIN"
        actions={<VinAvatar size={40} />}
      />
      <CuratorPanel client={client} />
    </div>
  )
}
