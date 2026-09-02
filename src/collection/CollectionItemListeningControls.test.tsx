import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CollectionItemListeningControls } from './CollectionItemListeningControls.tsx'
import type { ListeningSummary } from './listeningSummary.ts'

const zero: ListeningSummary = { count: 0, lastListenedAt: null }
const played: ListeningSummary = { count: 3, lastListenedAt: '2026-09-01T00:00:00.000Z' }

describe('CollectionItemListeningControls - listening truthfulness', () => {
  it('events ready + zero events shows "Never played"', () => {
    render(
      <CollectionItemListeningControls
        summary={zero}
        eventsStatus="ready"
        onMarkPlayed={vi.fn()}
      />,
    )
    expect(screen.getByText('Never played')).toBeInTheDocument()
  })

  it('events ready + N events shows the count and last-listened', () => {
    render(
      <CollectionItemListeningControls
        summary={played}
        eventsStatus="ready"
        onMarkPlayed={vi.fn()}
      />,
    )
    expect(screen.getByText('Played 3 times')).toBeInTheDocument()
    expect(screen.getByText(/Last listened:/)).toBeInTheDocument()
  })

  it('events LOADING never shows "Never played"', () => {
    render(
      <CollectionItemListeningControls
        summary={zero}
        eventsStatus="loading"
        onMarkPlayed={vi.fn()}
      />,
    )
    expect(screen.queryByText('Never played')).toBeNull()
    expect(screen.getByText('Loading listening history…')).toBeInTheDocument()
  })

  it('events ERROR never shows "Never played" (and hides a stale last-listened)', () => {
    render(
      <CollectionItemListeningControls
        summary={played}
        eventsStatus="error"
        onMarkPlayed={vi.fn()}
      />,
    )
    expect(screen.queryByText('Never played')).toBeNull()
    expect(screen.getByText('Listening history unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/Last listened:/)).toBeNull()
    // marking a play is still possible
    expect(screen.getByRole('button', { name: 'Mark played' })).toBeEnabled()
  })

  it('a failed mark-played surfaces a recoverable error, no fabricated count', async () => {
    render(
      <CollectionItemListeningControls
        summary={zero}
        eventsStatus="ready"
        onMarkPlayed={() => Promise.reject(new Error('history write failed'))}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark played' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('history write failed')
    // still "Never played" - nothing was fabricated locally
    expect(screen.getByText('Never played')).toBeInTheDocument()
  })
})
