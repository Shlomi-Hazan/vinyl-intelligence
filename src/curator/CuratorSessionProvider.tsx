import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  CuratorSessionContext,
  type CuratorOkResult,
  type CuratorPanelStatus,
  type CuratorSession,
} from './curator-session-context.ts'
import type {
  CuratorConversation,
  CuratorIntent,
  CuratorResult,
} from '../lib/curator/types.ts'

/**
 * Holds the transient VIN session in React memory so it survives ordinary
 * in-app route navigation (VIN -> View record -> back to VIN). Mounted once, in
 * `AppRoutes`, inside the per-user `CollectionDataProvider` and above the route
 * `<Outlet>` - so it outlives the `/vin` page but is discarded on a user change
 * or a full app remount. Nothing here is persisted (no storage, no server, no
 * transcript); `reset()` is "Start over".
 */
export function CuratorSessionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState('')
  const [status, setStatus] = useState<CuratorPanelStatus>('idle')
  const [initialResult, setInitialResult] = useState<CuratorResult | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [outOfScope, setOutOfScope] = useState(false)
  const [conversation, setConversation] = useState<CuratorConversation | null>(null)
  const [lastOkResult, setLastOkResult] = useState<CuratorOkResult | null>(null)
  const [refineNoMatchIntent, setRefineNoMatchIntent] =
    useState<CuratorIntent | null>(null)
  const [refineEmpty, setRefineEmpty] = useState(false)

  const reset = useCallback(() => {
    setRequest('')
    setStatus('idle')
    setInitialResult(null)
    setError(null)
    setOutOfScope(false)
    setConversation(null)
    setLastOkResult(null)
    setRefineNoMatchIntent(null)
    setRefineEmpty(false)
  }, [])

  const value = useMemo<CuratorSession>(
    () => ({
      request,
      setRequest,
      status,
      setStatus,
      initialResult,
      setInitialResult,
      error,
      setError,
      outOfScope,
      setOutOfScope,
      conversation,
      setConversation,
      lastOkResult,
      setLastOkResult,
      refineNoMatchIntent,
      setRefineNoMatchIntent,
      refineEmpty,
      setRefineEmpty,
      reset,
    }),
    [
      request,
      status,
      initialResult,
      error,
      outOfScope,
      conversation,
      lastOkResult,
      refineNoMatchIntent,
      refineEmpty,
      reset,
    ],
  )

  return (
    <CuratorSessionContext.Provider value={value}>
      {children}
    </CuratorSessionContext.Provider>
  )
}
