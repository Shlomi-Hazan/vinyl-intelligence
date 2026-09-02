import { describe, expect, it } from 'vitest'
import {
  groupListeningEventsByDay,
  toDateTimeLocalValue,
  fromDateTimeLocalValue,
} from './historyGrouping.ts'
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

function ev(id: string, listenedAt: string, itemId = 'item-1'): ListeningEventRecord {
  return {
    id,
    collection_item_id: itemId,
    listened_at: listenedAt,
    created_at: listenedAt,
  }
}

describe('groupListeningEventsByDay', () => {
  // A fixed "now" in local time; all fixtures are built relative to it so the
  // test is stable regardless of the machine's zone.
  const now = new Date(2026, 7, 30, 15, 0, 0) // 30 Aug 2026, 15:00 local

  function localIso(y: number, m: number, d: number, h = 12, min = 0): string {
    return new Date(y, m, d, h, min, 0).toISOString()
  }

  it('labels the current and previous local day as Today / Yesterday', () => {
    const groups = groupListeningEventsByDay(
      [
        ev('a', localIso(2026, 7, 30, 9)),
        ev('b', localIso(2026, 7, 29, 20)),
      ],
      now,
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday'])
  })

  it('orders days newest first and events newest first within a day', () => {
    const groups = groupListeningEventsByDay(
      [
        ev('old', localIso(2026, 7, 28, 10)),
        ev('today-early', localIso(2026, 7, 30, 8)),
        ev('today-late', localIso(2026, 7, 30, 14)),
      ],
      now,
    )
    expect(groups[0].label).toBe('Today')
    expect(groups[0].events.map((e) => e.id)).toEqual(['today-late', 'today-early'])
    expect(groups[2] ?? groups[1]).toBeDefined()
    expect(groups.at(-1)?.events[0].id).toBe('old')
  })

  it('uses a full local date for older days', () => {
    const groups = groupListeningEventsByDay([ev('x', localIso(2026, 7, 20))], now)
    expect(groups[0].label).not.toBe('Today')
    expect(groups[0].label).not.toBe('Yesterday')
    expect(groups[0].label).toMatch(/2026/)
  })

  it('drops events with an unparseable timestamp instead of grouping them', () => {
    const groups = groupListeningEventsByDay(
      [ev('good', localIso(2026, 7, 30)), ev('bad', 'not-a-date')],
      now,
    )
    const ids = groups.flatMap((g) => g.events.map((e) => e.id))
    expect(ids).toEqual(['good'])
  })

  it('returns no groups for an empty list', () => {
    expect(groupListeningEventsByDay([], now)).toEqual([])
  })
})

describe('datetime-local conversion', () => {
  it('round-trips an instant through the local input value', () => {
    const iso = new Date(2026, 2, 4, 9, 7, 0).toISOString()
    const value = toDateTimeLocalValue(iso)
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    // minutes precision only; seconds are dropped
    expect(new Date(fromDateTimeLocalValue(value)).getTime()).toBe(
      new Date(2026, 2, 4, 9, 7, 0).getTime(),
    )
  })

  it('returns an empty string for an unparseable ISO input', () => {
    expect(toDateTimeLocalValue('nope')).toBe('')
  })

  it('rejects an empty or invalid local value', () => {
    expect(() => fromDateTimeLocalValue('')).toThrow()
    expect(() => fromDateTimeLocalValue('not-a-date')).toThrow()
  })
})
