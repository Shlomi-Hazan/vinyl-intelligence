import { describe, expect, it } from 'vitest'
import { formatListenedAt, summarizeListeningForItem } from './listeningSummary.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

function event(overrides: Partial<ListeningEventRecord> = {}): ListeningEventRecord {
  return {
    id: 'e1',
    collection_item_id: 'item-1',
    listened_at: '2026-08-20T10:00:00.000Z',
    created_at: '2026-08-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('summarizeListeningForItem', () => {
  it('returns count 0 and a null lastListenedAt when the item has no events', () => {
    expect(
      summarizeListeningForItem(
        [event({ id: 'a', collection_item_id: 'other' })],
        'item-1',
      ),
    ).toEqual({ count: 0, lastListenedAt: null })
  })

  it('counts only the matching collection item', () => {
    const events = [
      event({ id: 'a', collection_item_id: 'item-1' }),
      event({ id: 'b', collection_item_id: 'item-1' }),
      event({ id: 'c', collection_item_id: 'item-2' }),
    ]
    expect(summarizeListeningForItem(events, 'item-1').count).toBe(2)
  })

  it('picks the newest listened_at regardless of array order', () => {
    const ascending = [
      event({ id: 'a', listened_at: '2026-08-01T00:00:00.000Z' }),
      event({ id: 'b', listened_at: '2026-08-10T00:00:00.000Z' }),
      event({ id: 'c', listened_at: '2026-08-05T00:00:00.000Z' }),
    ]
    const shuffled = [ascending[2], ascending[0], ascending[1]]

    expect(summarizeListeningForItem(ascending, 'item-1').lastListenedAt).toBe(
      '2026-08-10T00:00:00.000Z',
    )
    expect(summarizeListeningForItem(shuffled, 'item-1').lastListenedAt).toBe(
      '2026-08-10T00:00:00.000Z',
    )
  })

  it('ignores an unparseable timestamp when choosing the newest', () => {
    const events = [
      event({ id: 'a', listened_at: 'not-a-date' }),
      event({ id: 'b', listened_at: '2026-08-02T00:00:00.000Z' }),
    ]
    const summary = summarizeListeningForItem(events, 'item-1')
    expect(summary.count).toBe(2)
    expect(summary.lastListenedAt).toBe('2026-08-02T00:00:00.000Z')
  })
})

describe('formatListenedAt', () => {
  it('renders a parseable timestamp as local text', () => {
    expect(formatListenedAt('2026-08-20T10:00:00.000Z')).not.toBe('Invalid Date')
    expect(formatListenedAt('2026-08-20T10:00:00.000Z').length).toBeGreaterThan(0)
  })

  it('returns the raw input unchanged when it cannot be parsed', () => {
    expect(formatListenedAt('nonsense')).toBe('nonsense')
  })
})
