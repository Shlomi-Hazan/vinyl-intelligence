import { describe, expect, it, vi } from 'vitest'
import {
  addManualCollectionItem,
  deleteCollectionItem,
  loadCollection,
  normalizeManualReleaseInput,
  updateCollectionItemPersonalSignals,
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
    genre: '',
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
    'genres',
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
            rating: 4,
            is_favorite: true,
            notes: 'a personal note',
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
      genres: [],
    })

    expect(
      normalizeManualReleaseInput(manualInput({ genre: '  Spiritual Jazz  ' })).genres,
    ).toEqual(['spiritual jazz'])

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

  it('loads collection items with joined release metadata, item-level personal signals, and deterministic ordering', async () => {
    const { client, query } = createLoadClient()

    await expect(loadCollection(client)).resolves.toEqual([
      {
        id: 'item-1',
        added_at: '2026-08-19T10:00:00.000Z',
        created_at: '2026-08-19T10:00:00.000Z',
        rating: 4,
        is_favorite: true,
        notes: 'a personal note',
        custom_cover_path: null,
        custom_cover_updated_at: null,
        release: releaseRow(),
      },
    ])

    expect(client.from).toHaveBeenCalledWith('collection_items')
    expectCollectionSelectSemantics(firstMockArg(query.select))
    // Personal signals are selected at the collection-item level, not nested
    // under `release`.
    const selectText = String(firstMockArg(query.select)).replace(/\s+/g, ' ')
    expect(selectText).toMatch(
      /created_at,\s*rating,\s*is_favorite,\s*notes,\s*custom_cover_path,\s*custom_cover_updated_at,\s*release:/,
    )
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
      genres: [],
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
      genres: [],
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

function createSignalsClient(
  options: { updateError?: Error; saved?: Record<string, unknown> } = {},
) {
  const single = vi.fn(async () => {
    if (options.updateError) {
      return { data: null, error: options.updateError }
    }

    return {
      data: options.saved ?? {
        id: 'item-1',
        rating: null,
        is_favorite: false,
        notes: null,
      },
      error: null,
    }
  })
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single,
  }
  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'collection_items') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return query
    }),
  }

  return { client: client as unknown as BrowserSupabaseClient, query, single }
}

describe('updateCollectionItemPersonalSignals (partial patch)', () => {
  it('writes only the favorite key and returns the saved values', async () => {
    const { client, query } = createSignalsClient({
      saved: { id: 'item-1', rating: 3, is_favorite: true, notes: 'kept' },
    })

    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', { is_favorite: true }),
    ).resolves.toEqual({ id: 'item-1', rating: 3, is_favorite: true, notes: 'kept' })

    expect(query.update).toHaveBeenCalledWith({ is_favorite: true })
    expect(query.eq).toHaveBeenCalledWith('id', 'item-1')
    expect(String(firstMockArg(query.select))).toBe('id, rating, is_favorite, notes')
  })

  it('writes only the rating key, including a clear to null', async () => {
    const { client, query } = createSignalsClient()

    await updateCollectionItemPersonalSignals(client, 'item-1', { rating: 5 })
    expect(query.update).toHaveBeenCalledWith({ rating: 5 })

    query.update.mockClear()
    await updateCollectionItemPersonalSignals(client, 'item-1', { rating: null })
    expect(query.update).toHaveBeenCalledWith({ rating: null })
  })

  it('writes only the notes key and trims / nulls whitespace-only input', async () => {
    const { client, query } = createSignalsClient()

    await updateCollectionItemPersonalSignals(client, 'item-1', { notes: '  hello  ' })
    expect(query.update).toHaveBeenCalledWith({ notes: 'hello' })

    query.update.mockClear()
    await updateCollectionItemPersonalSignals(client, 'item-1', { notes: '   ' })
    expect(query.update).toHaveBeenCalledWith({ notes: null })
  })

  it('rejects an over-limit note, a fractional rating, and an out-of-range rating before any write', async () => {
    const { client, query } = createSignalsClient()

    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', { notes: 'a'.repeat(1001) }),
    ).rejects.toThrow(/1000 characters or fewer/)
    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', { rating: 1.5 }),
    ).rejects.toThrow(/whole number from 1 to 5/)
    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', { rating: 6 }),
    ).rejects.toThrow(/whole number from 1 to 5/)
    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', { rating: 0 }),
    ).rejects.toThrow(/whole number from 1 to 5/)

    expect(query.update).not.toHaveBeenCalled()
  })

  it('rejects an empty patch and an unsupported field before any write', async () => {
    const { client, query } = createSignalsClient()

    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', {}),
    ).rejects.toThrow(/No personal-signal changes/)
    // A stray `undefined` value is not a present key and cannot clobber a signal.
    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', { rating: undefined }),
    ).rejects.toThrow(/No personal-signal changes/)
    await expect(
      updateCollectionItemPersonalSignals(
        client,
        'item-1',
        { user_id: 'x' } as unknown as Parameters<typeof updateCollectionItemPersonalSignals>[2],
      ),
    ).rejects.toThrow(/Unsupported personal-signal field: user_id/)

    expect(query.update).not.toHaveBeenCalled()
  })

  it('surfaces Supabase / RLS errors', async () => {
    const { client } = createSignalsClient({
      updateError: new Error('update blocked by RLS'),
    })

    await expect(
      updateCollectionItemPersonalSignals(client, 'item-1', { is_favorite: true }),
    ).rejects.toThrow('update blocked by RLS')
  })
})
