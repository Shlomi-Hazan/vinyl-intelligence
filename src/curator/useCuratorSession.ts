import { useContext } from 'react'
import {
  CuratorSessionContext,
  type CuratorSession,
} from './curator-session-context.ts'

/**
 * The transient VIN session. Must be used inside `CuratorSessionProvider`
 * (mounted in `AppRoutes` above the authenticated route outlet).
 */
export function useCuratorSession(): CuratorSession {
  const value = useContext(CuratorSessionContext)
  if (!value) {
    throw new Error('useCuratorSession must be used within CuratorSessionProvider.')
  }
  return value
}
