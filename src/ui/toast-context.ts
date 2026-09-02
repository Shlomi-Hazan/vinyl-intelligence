import { createContext } from 'react'

export type ToastTone = 'default' | 'success' | 'error'

export type ToastInput = {
  message: string
  tone?: ToastTone
  /** ms; default 4000. */
  duration?: number
}

export type ToastApi = {
  show: (toast: ToastInput) => void
}

export const ToastContext = createContext<ToastApi | null>(null)
