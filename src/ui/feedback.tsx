import type { ReactNode } from 'react'
import { Icon } from './Icon.tsx'
import { Button } from './primitives.tsx'

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="vi-empty">
      {icon}
      <h3 style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="vi-errorstate" role="alert">
      <Icon name="alert" size={22} />
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

export function LoadingSkeleton({
  lines = 3,
  label = 'Loading',
}: {
  lines?: number
  label?: string
}) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="vi-skeleton"
          style={{ height: '1rem', width: `${90 - i * 12}%` }}
        />
      ))}
      <span className="vi-visually-hidden" role="status">
        {label}
      </span>
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="vi-stat" aria-hidden="true">
      <div className="vi-skeleton" style={{ height: '1.8rem', width: '3rem' }} />
      <div
        className="vi-skeleton"
        style={{ height: '0.7rem', width: '5rem', marginTop: 'var(--space-2)' }}
      />
    </div>
  )
}

export function SkeletonAlbumCard() {
  return (
    <div className="vi-skeleton-card" aria-hidden="true">
      <div className="vi-skeleton vi-skeleton-card__art" />
      <div className="vi-skeleton" style={{ height: '0.9rem', width: '80%' }} />
      <div className="vi-skeleton" style={{ height: '0.7rem', width: '55%' }} />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-2) 0',
      }}
    >
      <div
        className="vi-skeleton"
        style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)' }}
      />
      <div style={{ flex: 1, display: 'grid', gap: 'var(--space-2)' }}>
        <div className="vi-skeleton" style={{ height: '0.8rem', width: '40%' }} />
        <div className="vi-skeleton" style={{ height: '0.7rem', width: '25%' }} />
      </div>
    </div>
  )
}
