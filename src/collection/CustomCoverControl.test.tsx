import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomCoverControl } from './CustomCoverControl.tsx'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const upload = vi.fn()
const remove = vi.fn()

vi.mock('../lib/collection/customCover.ts', async (o) => {
  const actual = await o<typeof import('../lib/collection/customCover.ts')>()
  return {
    ...actual,
    uploadCustomCover: (...a: unknown[]) => upload(...a),
    removeCustomCover: (...a: unknown[]) => remove(...a),
  }
})

afterEach(() => vi.clearAllMocks())

const baseItem: CollectionItemWithRelease = {
  id: 'item-1',
  added_at: '',
  created_at: '',
  rating: null,
  is_favorite: false,
  notes: null,
  custom_cover_path: null,
  custom_cover_updated_at: null,
  release: {
    id: 'rel-1',
    artist: 'A',
    title: 'B',
    release_year: null,
    label: null,
    catalog_number: null,
    country: null,
    format: null,
    genres: [],
    updated_at: '',
  },
}

function setup(item: CollectionItemWithRelease, onChanged = vi.fn()) {
  render(
    <CustomCoverControl
      client={{} as BrowserSupabaseClient}
      userId="uid"
      item={item}
      onChanged={onChanged}
    />,
  )
  return { onChanged }
}

describe('CustomCoverControl', () => {
  it('offers "Use my own cover" when none is set and uploads the chosen file', async () => {
    upload.mockResolvedValue({ path: 'p', updatedAt: 't' })
    const { onChanged } = setup(baseItem)
    const user = userEvent.setup()

    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await user.upload(input, new File(['x'], 'c.png', { type: 'image/png' }))

    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(
        expect.anything(),
        'uid',
        'item-1',
        expect.any(File),
      ),
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('offers replace + remove when a custom cover exists, and removes it', async () => {
    remove.mockResolvedValue(undefined)
    const { onChanged } = setup({
      ...baseItem,
      custom_cover_path: 'uid/item-1/cover.webp',
    })
    expect(screen.getByRole('button', { name: 'Replace cover' })).toBeInTheDocument()

    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Remove custom cover' }),
    )
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.anything(), 'uid', 'item-1'),
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows the message from a rejected upload and does not call onChanged', async () => {
    const { CustomCoverError } = await import('../lib/collection/customCover.ts')
    upload.mockRejectedValue(
      new CustomCoverError('output_too_large', 'That image is too detailed to store.'),
    )
    const { onChanged } = setup(baseItem)

    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await userEvent
      .setup()
      .upload(input, new File(['x'], 'c.png', { type: 'image/png' }))

    expect(
      await screen.findByText('That image is too detailed to store.'),
    ).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })
})
