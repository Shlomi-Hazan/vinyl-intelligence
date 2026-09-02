import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon.tsx'
import { ToastContext, type ToastInput } from './toast-context.ts'

type ActiveToast = ToastInput & { id: number }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      setToasts((current) => [...current, { ...toast, id }])
      window.setTimeout(() => dismiss(id), toast.duration ?? 4000)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="vi-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={[
              'vi-toast',
              toast.tone === 'error' ? 'vi-toast--error' : null,
              toast.tone === 'success' ? 'vi-toast--success' : null,
            ]
              .filter(Boolean)
              .join(' ')}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            {toast.tone === 'success' ? (
              <span className="vi-toast__dot">
                <Icon name="check" size={16} />
              </span>
            ) : null}
            {toast.tone === 'error' ? <Icon name="alert" size={16} /> : null}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
