import { describe, expect, it, vi } from 'vitest'
import {
  addListeningEvent,
  compareListeningEventsNewestFirst,
  loadListeningEvents,
  type ListeningEventRecord,
} from './listeningEvents.ts'
import type { BrowserSupabaseClient } from './client.ts'

function record(overrides: Partial<ListeningEventRecord> = {}): ListeningEventRecord {
  return {
    id: 'e1',
    collection_item_id: 'item-1',
    listened_at: '2026-08-20T10:00:00.000Z',
    created_at: '2026-08-20T10:00:00.000Z',
    ...overrides,
  }
}

function createLoadClient(options: { loadError?: Error } = {}) {
  const query = {
    data: options.loadError ? null : [record()],
    error: options.loadError ?? null,
    select: vi.fn(() => query),
    order: vi.fn(() => query),
  }
  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'listening_events') {
        throw new Error(`Unexpected table read: ${table}`)
      }
      return query
    }),
  }
  return { client: client as unknown as BrowserSupabaseClient, query }
}

function createInsertClient(options: { insertError?: Error } = {}) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () =>
      options.insertError
        ? { data: null, error: options.insertError }
        : { data: record({ id: 'new-event' }), error: null },
    ),
  }
  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'listening_events') {
        throw new Error(`Unexpected table write: ${table}`)
      }
      return query
    }),
  }
  return { client: client as unknown as BrowserSupabaseClient, query }
}

describe('loadListeningEvents', () => {
  it('selects the four UI columns and orders listened_at DESC then id DESC', async () => {
    const { client, query } = createLoadClient()

    await expect(loadListeningEvents(client)).resolves.toEqual([record()])

    expect(query.select).toHaveBeenCalledWith(
      'id, collection_item_id, listened_at, created_at',
    )
    expect(query.order.mock.calls).toEqual([
      ['listened_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('surfaces a read error', async () => {
    const { client } = createLoadClient({ loadError: new Error('events read rejected') })
    await expect(loadListeningEvents(client)).rejects.toThrow('events read rejected')
  })
})

describe('addListeningEvent', () => {
  it('inserts exactly { collection_item_id } and returns the created row', async () => {
    const { client, query } = createInsertClient()

    await expect(addListeningEvent(client, 'item-42')).resolves.toEqual(
      record({ id: 'new-event' }),
    )

    expect(query.insert).toHaveBeenCalledTimes(1)
    expect(query.insert).toHaveBeenCalledWith({ collection_item_id: 'item-42' })
  })

  it('surfaces an insert error and returns nothing fabricated', async () => {
    const { client } = createInsertClient({ insertError: new Error('insert blocked by RLS') })
    await expect(addListeningEvent(client, 'item-42')).rejects.toThrow(
      'insert blocked by RLS',
    )
  })
})

describe('compareListeningEventsNewestFirst', () => {
  it('orders by listened_at descending', () => {
    const older = record({ id: 'a', listened_at: '2026-08-01T00:00:00.000Z' })
    const newer = record({ id: 'b', listened_at: '2026-08-02T00:00:00.000Z' })
    expect([older, newer].sort(compareListeningEventsNewestFirst)).toEqual([newer, older])
  })

  it('breaks an equal-timestamp tie by id descending', () => {
    const ts = '2026-08-01T00:00:00.000Z'
    const a = record({ id: 'a', listened_at: ts })
    const b = record({ id: 'b', listened_at: ts })
    const c = record({ id: 'c', listened_at: ts })
    expect([a, c, b].sort(compareListeningEventsNewestFirst)).toEqual([c, b, a])
  })
})
