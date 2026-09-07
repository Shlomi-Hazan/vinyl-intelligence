import { createContext } from 'react'
import type {
  CuratorConversation,
  CuratorIntent,
  CuratorRefineResult,
  CuratorResult,
} from '../lib/curator/types.ts'

/** Internal panel status for the request flow. */
export type CuratorPanelStatus = 'idle' | 'loading' | 'error' | 'done'

/** The `ok` variant shared by the initial and refine results. */
export type CuratorOkResult = Extract<
  CuratorResult | CuratorRefineResult,
  { status: 'ok' }
>

/**
 * The transient VIN session - exactly the state the curator panel used to hold
 * in component-local `useState`. It is lifted to a provider that outlives the
 * `/vin` route so "VIN -> View record -> back to VIN" keeps the recommendations
 * and the bounded conversation.
 *
 * Persistence contract (unchanged from Milestone 10): React memory ONLY. No
 * database, no `sessionStorage` / `localStorage`, no server state, no
 * transcript. `reset()` ("Start over") clears it; a full app remount (refresh)
 * starts empty; the provider is keyed by user id so a user change discards it.
 */
export type CuratorSession = {
  request: string
  setRequest: (value: string) => void

  status: CuratorPanelStatus
  setStatus: (value: CuratorPanelStatus) => void

  initialResult: CuratorResult | null
  setInitialResult: (value: CuratorResult | null) => void

  error: { code: string; message: string } | null
  setError: (value: { code: string; message: string } | null) => void

  /** Milestone 11: the last curator call was out of scope. */
  outOfScope: boolean
  setOutOfScope: (value: boolean) => void

  /** Milestone 10 bounded conversation state. */
  conversation: CuratorConversation | null
  setConversation: (
    value:
      | CuratorConversation
      | null
      | ((current: CuratorConversation | null) => CuratorConversation | null),
  ) => void

  lastOkResult: CuratorOkResult | null
  setLastOkResult: (value: CuratorOkResult | null) => void

  refineNoMatchIntent: CuratorIntent | null
  setRefineNoMatchIntent: (value: CuratorIntent | null) => void

  refineEmpty: boolean
  setRefineEmpty: (value: boolean) => void

  /** Clears the whole transient session ("Start over"). */
  reset: () => void
}

export const CuratorSessionContext = createContext<CuratorSession | null>(null)
