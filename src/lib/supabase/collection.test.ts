import { describe, expect, it, vi } from 'vitest'
import {
  addManualCollectionItem,
  deleteCollectionItem,
  normalizeManualReleaseInput,
  validateManualReleaseInput,
  type ManualReleaseInput,
} from './collection.ts'
import type { BrowserSupabaseClient } from './client.ts'

function manualInput(
  overrides: Partial<ManualReleaseInput> = {},
): ManualReleaseInput {
  return {
    artist: '  Alice Coltrane  ',
    title: '  Journey in Satchidananda  ',
    releaseYear: '1971',
    label: '  Impulse!  ',
    catalogNumber: '  AS-9203  ',
    country: '  US  ',
    format: '  LP  ',
    ...overrides,
  }
}

function createAddClient(options: { itemInsertError?: Error } = {}) {
  const releaseDelete = vi.fn()
  const releaseQuery = {
    delete: releaseDelete,
    insert: vi.fn(() => releaseQuery),
    select: vi.fn(() => releaseQuery),
    single: vi.fn(async () => ({
      data: {
        id: 'release-1',
        artist: 'Alice Coltrane',
        title: 'Journey in Satchidananda',
        release_year: 1971,
        label: 'Impulse!',
        catalog_number: 'AS-9203',
        country: 'US',
        format: 'LP',
        updated_at: '2026-08-19T10:00:00.000Z',
      },
      error: null,
    })),
  }
  const itemQuery = {
    insert: vi.fn(() => itemQuery),
    select: vi.fn(() => itemQuery),
    single: vi.fn(async () => {
      if (options.itemInsertError) {
        return { data: null, error: options.itemInsertError }
      }

      return {
        data: {
          id: 'item-1',
          added_at: '2026-08-19T10:00:00.000Z',
          created_at: '2026-08-19T10:00:00.000Z',
          release: {
            id: 'release-1',
            artist: 'Alice Coltrane',
            title: 'Journey in Satchidananda',
            release_year: 1971,
            label: 'Impulse!',
            catalog_number: 'AS-9203',
            country: 'US',
            format: 'LP',
            updated_at: '2026-08-19T10:00:00.000Z',
          },
        },
        error: null,
      }
    }),
  }
  const client = {
    from: vi.fn((table: string) =>
      table === 'releases' ? releaseQuery : itemQuery,
    ),
  }

  return {
    client: client as unknown as BrowserSupabaseClient,
    itemQuery,
    releaseDelete,
    releaseQuery,
  }
}

function createDeleteClient(options: {
  deleteError?: Error
  deletedId?: string | null
} = {}) {
  const releaseDelete = vi.fn()
  const collectionDelete = vi.fn(() => collectionQuery)
  const collectionQuery = {
    delete: collectionDelete,
    eq: vi.fn(() => collectionQuery),
    select: vi.fn(() => collectionQuery),
    single: vi.fn(async () => {
      if (options.deleteError) {
        return { data: null, error: options.deleteError }
      }

      return {
        data: options.deletedId === null
          ? null
          : { id: options.deletedId ?? 'item-1' },
        error: null,
      }
    }),
  }
  const releaseQuery = {
    delete: releaseDelete,
  }
  const client = {
    from: vi.fn((table: string) =>
      table === 'collection_items' ? collectionQuery : releaseQuery,
    ),
  }

  return {
    client: client as unknown as BrowserSupabaseClient,
    collectionDelete,
    collectionQuery,
    releaseDelete,
  }
}

describe('manual collection service', () => {
  it('normalizes manual release input before persistence', () => {
    expect(normalizeManualReleaseInput(manualInput({ releaseYear: ' ' }))).toEqual({
      artist: 'Alice Coltrane',
      title: 'Journey in Satchidananda',
      release_year: null,
      label: 'Impulse!',
      catalog_number: 'AS-9203',
      country: 'US',
      format: 'LP',
    })

    expect(
      normalizeManualReleaseInput(
        manualInput({
          label: ' ',
          catalogNumber: '',
          country: '   ',
          format: '',
        }),
      ),
    ).toMatchObject({
      label: null,
      catalog_number: null,
      country: null,
      format: null,
    })
  })

  it('validates required fields, length limits, and release-year bounds', () => {
    const errors = validateManualReleaseInput(
      normalizeManualReleaseInput(
        manualInput({
          artist: ' ',
          title: 't'.repeat(201),
          releaseYear: '1899',
          label: 'l'.repeat(161),
          catalogNumber: 'c'.repeat(121),
          country: 'u'.repeat(81),
          format: 'f'.repeat(81),
        }),
      ),
    )

    expect(errors).toEqual([
      'Artist is required.',
      'Title must be 200 characters or fewer.',
      'Label must be 160 characters or fewer.',
      'Catalog number must be 120 characters or fewer.',
      'Country must be 80 characters or fewer.',
      'Format must be 80 characters or fewer.',
      'Release year must be a whole number from 1900 to 2100.',
    ])
  })

  it('adds a manual release and then a collection item without deduplication', async () => {
    const { client, itemQuery, releaseQuery } = createAddClient()

    await expect(addManualCollectionItem(client, manualInput())).resolves.toMatchObject({
      id: 'item-1',
      release: {
        id: 'release-1',
        artist: 'Alice Coltrane',
      },
    })

    expect(releaseQuery.insert).toHaveBeenCalledWith({
      artist: 'Alice Coltrane',
      title: 'Journey in Satchidananda',
      release_year: 1971,
      label: 'Impulse!',
      catalog_number: 'AS-9203',
      country: 'US',
      format: 'LP',
    })
    expect(itemQuery.insert).toHaveBeenCalledWith({ release_id: 'release-1' })
  })

  it('does not claim release cleanup when the second add step fails', async () => {
    const { client, releaseDelete } = createAddClient({
      itemInsertError: new Error('collection item insert rejected'),
    })

    await expect(addManualCollectionItem(client, manualInput())).rejects.toThrow(
      'collection item insert rejected',
    )

    expect(releaseDelete).not.toHaveBeenCalled()
  })

  it('confirms a collection item delete by requesting the deleted id back', async () => {
    const { client, collectionDelete, collectionQuery, releaseDelete } =
      createDeleteClient()

    await expect(deleteCollectionItem(client, 'item-1')).resolves.toBeUndefined()

    expect(collectionDelete).toHaveBeenCalledOnce()
    expect(collectionQuery.eq).toHaveBeenCalledWith('id', 'item-1')
    expect(collectionQuery.select).toHaveBeenCalledWith('id')
    expect(collectionQuery.single).toHaveBeenCalledOnce()
    expect(releaseDelete).not.toHaveBeenCalled()
  })

  it('treats a zero-row or not-visible delete as an error', async () => {
    const { client, releaseDelete } = createDeleteClient({ deletedId: null })

    await expect(deleteCollectionItem(client, 'item-1')).rejects.toThrow(
      'Collection item was not deleted.',
    )

    expect(releaseDelete).not.toHaveBeenCalled()
  })

  it('propagates Supabase delete errors', async () => {
    const { client, releaseDelete } = createDeleteClient({
      deleteError: new Error('delete rejected by RLS'),
    })

    await expect(deleteCollectionItem(client, 'item-1')).rejects.toThrow(
      'delete rejected by RLS',
    )

    expect(releaseDelete).not.toHaveBeenCalled()
  })
})
