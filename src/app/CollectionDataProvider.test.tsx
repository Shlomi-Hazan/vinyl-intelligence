import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { CollectionDataProvider } from './CollectionDataProvider.tsx'
import { useCollectionData } from './useCollectionData.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const loadCollection = vi.fn()
const loadListeningEvents = vi.fn()

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return { ...actual, loadCollection: (...a: unknown[]) => loadCollection(...a) }
})
vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return {
    ...actual,
    loadListeningEvents: (...a: unknown[]) => loadListeningEvents(...a),
  }
})

const client = {} as BrowserSupabaseClient

function Probe() {
  const data = useCollectionData()
  return (
    <div>
      <span data-testid="status">{data.status}</span>
      <span data-testid="count">{data.items.length}</span>
      <span data-testid="error">{data.error ?? '-'}</span>
      <button type="button" onClick={data.reload}>
        reload
      </button>
    </div>
  )
}

describe('CollectionDataProvider', () => {
  it('loads once then exposes ready state with items', async () => {
    loadCollection.mockResolvedValueOnce([{ id: 'x' }, { id: 'y' }])
    loadListeningEvents.mockResolvedValueOnce([])

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('surfaces an error and recovers on reload', async () => {
    loadCollection.mockRejectedValueOnce(new Error('boom'))
    loadListeningEvents.mockResolvedValueOnce([])

    render(
      <CollectionDataProvider client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error')
    })
    expect(screen.getByTestId('error')).toHaveTextContent('boom')

    loadCollection.mockResolvedValueOnce([{ id: 'z' }])
    loadListeningEvents.mockResolvedValueOnce([])
    await userEvent.setup().click(screen.getByRole('button', { name: 'reload' }))

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('starts empty for a fresh user id (no previous-user data)', async () => {
    loadCollection.mockResolvedValue([{ id: 'a' }])
    loadListeningEvents.mockResolvedValue([])

    const { rerender } = render(
      <CollectionDataProvider key="u1" client={client} userId="u1">
        <Probe />
      </CollectionDataProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    )

    // A user change is modelled as a keyed remount (as AppRoutes does).
    rerender(
      <CollectionDataProvider key="u2" client={client} userId="u2">
        <Probe />
      </CollectionDataProvider>,
    )
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })
})
