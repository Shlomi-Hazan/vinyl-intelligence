import { describe, expect, it, vi } from 'vitest'
import {
  addManualCollectionItem,
  deleteCollectionItem,
  loadCollection,
  normalizeManualReleaseInput,
  updateManualRelease,
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

function releaseRow() {
  return {
    id: 'release-1',
    artist: 'Alice Coltrane',
    title: 'Journey in Satchidananda',
    release_year: 1971,
    label: 'Impulse!',
    catalog_number: 'AS-9203',
    country: 'US',
    format: 'LP',
    updated_at: '2026-08-19T10:00:00.000Z',
  }
}

function expectCollectionSelectSemantics(selectArg: unknown) {
  expect(selectArg).toEqual(expect.any(String))

  const selectText = (selectArg as string).replace(/\s+/g, ' ')
  const releaseSelectMatch = selectText.match(/release:releases!inner\s*\((.*)\)/)

  expect(selectText).toContain('id')
  expect(selectText).toContain('added_at')
  expect(selectText).toContain('created_at')
  expect(releaseSelectMatch?.[1]).toEqual(expect.any(String))

  const releaseFields = releaseSelectMatch?.[1] ?? ''
  for (const field of [
    'id',
    'artist',
    'title',
    'release_year',
    'label',
    'catalog_number',
    'country',
    'format',
    'updated_at',
  ]) {
    expect(releaseFields).toContain(field)
  }
}

function expectReleaseMetadataSelectSemantics(selectArg: unknown) {
  expect(selectArg).toEqual(expect.any(String))

  const selectText = (selectArg as string).replace(/\s+/g, ' ')
  for (const field of [
    'id',
    'artist',
    'title',
    'release_year',
    'label',
    'catalog_number',
    'country',
    'format',
    'updated_at',
  ]) {
    expect(selectText).toContain(field)
  }
}

function firstMockArg(mock: unknown): unknown {
  return (mock as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]
}

function createLoadClient(options: { loadError?: Error } = {}) {
  const query = {
    data: options.loadError
      ? null
      : [
          {
            id: 'item-1',
            added_at: '2026-08-19T10:00:00.000Z',
            created_at: '2026-08-19T10:00:00.000Z',
            release: [releaseRow()],
          },
        ],
    error: options.loadError ?? null,
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  }
  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'collection_items') {
        throw new Error(`Unexpected table read: ${table}`)
      }

      return query
    }),
  }

  return {
    client: client as unknown as BrowserSupabaseClient,
    query,
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

function createUpdateClient(options: { updateError?: Error } = {}) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => {
      if (options.updateError) {
        return { data: null, error: options.updateError }
      }

      return {
        data: {
          ...releaseRow(),
          title: 'Journey Updated',
          release_year: 1972,
          label: null,
          catalog_number: null,
          country: 'GB',
          format: 'Gatefold LP',
        },
        error: null,
      }
    }),
    update: vi.fn(() => query),
  }
  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'releases') {
        throw new Error(`Unexpected table update: ${table}`)
      }

      return query
    }),
  }

  return {
    client: client as unknown as BrowserSupabaseClient,
    query,
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

  it('loads collection items with joined release metadata and deterministic ordering', async () => {
    const { client, query } = createLoadClient()

    await expect(loadCollection(client)).resolves.toEqual([
      {
        id: 'item-1',
        added_at: '2026-08-19T10:00:00.000Z',
        created_at: '2026-08-19T10:00:00.000Z',
        release: releaseRow(),
      },
    ])

    expect(client.from).toHaveBeenCalledWith('collection_items')
    expectCollectionSelectSemantics(firstMockArg(query.select))
    expect(query.order.mock.calls).toEqual([
      ['added_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('propagates Supabase load errors', async () => {
    const { client } = createLoadClient({
      loadError: new Error('collection read rejected'),
    })

    await expect(loadCollection(client)).rejects.toThrow('collection read rejected')
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

  it('updates the requested release with normalized editable metadata', async () => {
    const { client, query } = createUpdateClient()

    await expect(
      updateManualRelease(
        client,
        'release-1',
        manualInput({
          releaseYear: ' 1972 ',
          label: ' ',
          catalogNumber: '',
          country: ' GB ',
          format: ' Gatefold LP ',
          title: ' Journey Updated ',
        }),
      ),
    ).resolves.toMatchObject({
      id: 'release-1',
      title: 'Journey Updated',
      release_year: 1972,
      label: null,
      catalog_number: null,
      country: 'GB',
      format: 'Gatefold LP',
    })

    expect(client.from).toHaveBeenCalledWith('releases')
    expect(query.update).toHaveBeenCalledWith({
      artist: 'Alice Coltrane',
      title: 'Journey Updated',
      release_year: 1972,
      label: null,
      catalog_number: null,
      country: 'GB',
      format: 'Gatefold LP',
    })
    expect(query.eq).toHaveBeenCalledWith('id', 'release-1')
    expectReleaseMetadataSelectSemantics(firstMockArg(query.select))
  })

  it('propagates Supabase update errors', async () => {
    const { client } = createUpdateClient({
      updateError: new Error('release update rejected'),
    })

    await expect(
      updateManualRelease(client, 'release-1', manualInput()),
    ).rejects.toThrow('release update rejected')
  })

  it('rejects invalid update input before persistence', async () => {
    const { client, query } = createUpdateClient()

    await expect(
      updateManualRelease(client, 'release-1', manualInput({ artist: ' ' })),
    ).rejects.toThrow('Artist is required.')

    expect(client.from).not.toHaveBeenCalled()
    expect(query.update).not.toHaveBeenCalled()
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
