import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './primitives.tsx'

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  labelledBy?: string
}

/**
 * Minimal accessible modal: focus trap, Esc to close, focus restored to the
 * previously focused element, backdrop click closes.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    restoreRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
    )?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) {
        return
      }
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div
      className="vi-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        className="vi-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.2rem' }}>{title}</h2>
          <IconButton icon="close" label="Close dialog" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}
