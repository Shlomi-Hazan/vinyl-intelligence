import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ListeningHistory } from './ListeningHistory.tsx'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

function collectionItem(
  overrides: Partial<CollectionItemWithRelease> = {},
): CollectionItemWithRelease {
  return {
    id: 'item-1',
    added_at: '2026-08-19T10:00:00.000Z',
    created_at: '2026-08-19T10:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: 'release-1',
      artist: 'Miles Davis',
      title: 'Kind of Blue',
      release_year: 1959,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '2026-08-19T10:00:00.000Z',
    },
    ...overrides,
  }
}

function event(overrides: Partial<ListeningEventRecord> = {}): ListeningEventRecord {
  return {
    id: 'e1',
    collection_item_id: 'item-1',
    listened_at: '2026-08-20T10:00:00.000Z',
    created_at: '2026-08-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('ListeningHistory', () => {
  it('is collapsed by default and expands on toggle', async () => {
    const user = userEvent.setup()
    render(<ListeningHistory items={[collectionItem()]} events={[]} />)

    const toggle = screen.getByRole('button', { name: /Listening history/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('No plays recorded yet.')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('No plays recorded yet.')).toBeInTheDocument()
  })

  it('lists events newest-first with the record artist and title', async () => {
    const user = userEvent.setup()
    render(
      <ListeningHistory
        items={[collectionItem()]}
        events={[
          event({ id: 'a', listened_at: '2026-08-20T09:00:00.000Z' }),
          event({ id: 'b', listened_at: '2026-08-21T09:00:00.000Z' }),
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Listening history/ }))
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].textContent).toContain('Miles Davis — Kind of Blue')
    const times = rows.map(
      (row) => row.querySelector('time')?.getAttribute('dateTime'),
    )
    expect(times).toEqual([
      '2026-08-21T09:00:00.000Z',
      '2026-08-20T09:00:00.000Z',
    ])
  })

  it('labels an event whose collection item is gone', async () => {
    const user = userEvent.setup()
    render(
      <ListeningHistory
        items={[]}
        events={[event({ collection_item_id: 'removed' })]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Listening history/ }))
    expect(screen.getByText('Record no longer in collection')).toBeInTheDocument()
  })

  it('shows a recoverable error state', async () => {
    const user = userEvent.setup()
    render(
      <ListeningHistory
        items={[collectionItem()]}
        events={[]}
        error="events unavailable"
        onRetry={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Listening history/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('events unavailable')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
