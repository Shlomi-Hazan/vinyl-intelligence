import type { ReactNode } from 'react'
import { Logo } from '../brand/Logo.tsx'

/**
 * Full-viewport boundary state used before the shell can render: session
 * loading, missing profile row, or an auth error.
 */
export function FullPageState({
  title,
  description,
  tone = 'info',
  action,
}: {
  title: string
  description?: string
  tone?: 'info' | 'error'
  action?: ReactNode
}) {
  return (
    <div className="vi-fullpage">
      <div className="vi-fullpage__card" role={tone === 'error' ? 'alert' : 'status'}>
        <Logo variant="mark" size={44} />
        <h1 style={{ fontSize: '1.5rem' }}>{title}</h1>
        {description ? <p className="vi-hint">{description}</p> : null}
        {action}
      </div>
    </div>
  )
}
