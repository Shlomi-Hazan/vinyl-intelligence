import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonalGenresEditor } from './PersonalGenresEditor.tsx'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const updateCollectionItemPersonalGenres = vi.fn()

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return {
    ...actual,
    updateCollectionItemPersonalGenres: (...a: unknown[]) =>
      updateCollectionItemPersonalGenres(...a),
  }
})

const client = {} as BrowserSupabaseClient

function renderEditor(personal: string[] = ['jazz'], catalog: string[] = ['hip hop']) {
  const onSaved = vi.fn()
  render(
    <PersonalGenresEditor
      client={client}
      collectionItemId="i1"
      catalogGenres={catalog}
      personalGenres={personal}
      onSaved={onSaved}
    />,
  )
  return { onSaved }
}

beforeEach(() => vi.clearAllMocks())

describe('PersonalGenresEditor', () => {
  it('removes a personal genre and persists the remaining list', async () => {
    updateCollectionItemPersonalGenres.mockResolvedValue([])
    const { onSaved } = renderEditor(['jazz'])

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove jazz' }))

    await waitFor(() =>
      expect(updateCollectionItemPersonalGenres).toHaveBeenCalledWith(
        expect.anything(),
        'i1',
        [],
      ),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('surfaces a save failure and rolls back the optimistic change', async () => {
    updateCollectionItemPersonalGenres.mockRejectedValue(new Error('denied by RLS'))
    renderEditor(['jazz'])

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove jazz' }))

    await waitFor(() =>
      expect(screen.getByText('denied by RLS')).toBeInTheDocument(),
    )
    // rolled back: the chip is still there
    expect(
      within(screen.getByRole('list', { name: 'Your genres' })).getByText('jazz'),
    ).toBeInTheDocument()
  })

  it('does not offer removal for catalog genres', () => {
    renderEditor(['jazz'], ['hip hop', 'rap'])
    const catalog = screen.getByRole('list', { name: 'Catalog genres' })
    expect(within(catalog).queryByRole('button')).not.toBeInTheDocument()
  })

  it('rejects an over-long genre before any write', async () => {
    renderEditor([])
    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Add a genre'), 'x'.repeat(45))
    await u.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toHaveTextContent('40 characters')
    expect(updateCollectionItemPersonalGenres).not.toHaveBeenCalled()
  })

  it('refuses a personal genre already present in the catalog genres', async () => {
    renderEditor([], ['Hip Hop'])
    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Add a genre'), 'hip hop')
    await u.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'already listed under the catalog genres',
    )
    expect(updateCollectionItemPersonalGenres).not.toHaveBeenCalled()
  })
})
