import { useContext } from 'react'
import { ToastContext, type ToastApi } from './toast-context.ts'

/** No-ops if no provider is mounted, so leaf components stay simple. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => {} }
}
