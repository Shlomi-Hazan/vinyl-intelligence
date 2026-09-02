/**
 * Deterministic, dependency-free grouping of listening events into day sections
 * for the History journal. Everything here works off the browser's own locale
 * and time zone: the stored `listened_at` is a UTC instant, and a collector
 * thinks in their local calendar ("I played that last night"), so the day
 * boundaries are local ones.
 *
 * No network request, no database write - the same principle as
 * `listeningSummary.ts`.
 */
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'
import { compareListeningEventsNewestFirst } from '../lib/supabase/listeningEvents.ts'

export type HistoryDayGroup = {
  /** Stable local-calendar key, `YYYY-MM-DD`. */
  key: string
  /** "Today" / "Yesterday" / a full local date. */
  label: string
  /** Events on this day, newest first. */
  events: ListeningEventRecord[]
}

function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayLabel(key: string, date: Date, now: Date): string {
  const todayKey = localDayKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayKey = localDayKey(yesterday)

  if (key === todayKey) {
    return 'Today'
  }
  if (key === yesterdayKey) {
    return 'Yesterday'
  }

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Group events into local-day sections, newest day first, newest event first
 * inside each day. Events with an unparseable timestamp are dropped rather than
 * shown under an "Invalid Date" heading.
 */
export function groupListeningEventsByDay(
  events: readonly ListeningEventRecord[],
  now: Date = new Date(),
): HistoryDayGroup[] {
  const ordered = [...events]
    .filter((event) => !Number.isNaN(new Date(event.listened_at).getTime()))
    .sort(compareListeningEventsNewestFirst)

  const groups: HistoryDayGroup[] = []
  const byKey = new Map<string, HistoryDayGroup>()

  for (const event of ordered) {
    const date = new Date(event.listened_at)
    const key = localDayKey(date)
    let group = byKey.get(key)

    if (!group) {
      group = { key, label: dayLabel(key, date, now), events: [] }
      byKey.set(key, group)
      groups.push(group)
    }

    group.events.push(event)
  }

  return groups
}

/**
 * ISO instant -> the `value` a native `<input type="datetime-local">` expects,
 * expressed in the browser's local time (`YYYY-MM-DDTHH:mm`). Returns an empty
 * string for an unparseable input so the field simply starts blank.
 */
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (n: number) => `${n}`.padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * The reverse: a local `datetime-local` value -> a UTC ISO instant for storage.
 * Throws on an empty / unparseable value so the caller shows a validation error
 * rather than writing a bad timestamp.
 */
export function fromDateTimeLocalValue(value: string): string {
  const date = new Date(value)

  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new Error('Enter a valid date and time.')
  }

  return date.toISOString()
}
