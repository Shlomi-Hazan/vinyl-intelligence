/**
 * Deterministic, dependency-free derivation of per-item listening facts from the
 * immutable `listening_events` rows already loaded through the RLS-authoritative
 * browser query. Milestone 8 stores no `listening_count` / `last_listened_at`
 * column and runs no counter trigger: listening count and last-listened time are
 * computed here, in the browser, every render. No network request, no database
 * write.
 */
import type { ListeningEventRecord } from '../lib/supabase/listeningEvents.ts'

export type ListeningSummary = {
  /** Number of listening events recorded for the collection item. */
  count: number
  /** ISO timestamp of the most recent event, or null when never played. */
  lastListenedAt: string | null
}

/**
 * Summarise the listening events for one collection item. Order-independent:
 * the newest event is chosen by parsed timestamp, not array position, so it does
 * not matter whether `events` is sorted. Zero matching events -> count 0 and a
 * null `lastListenedAt`.
 */
export function summarizeListeningForItem(
  events: readonly ListeningEventRecord[],
  collectionItemId: string,
): ListeningSummary {
  let count = 0
  let lastListenedAt: string | null = null
  let lastTime = Number.NEGATIVE_INFINITY

  for (const event of events) {
    if (event.collection_item_id !== collectionItemId) {
      continue
    }

    count += 1

    const time = new Date(event.listened_at).getTime()

    if (Number.isFinite(time) && time > lastTime) {
      lastTime = time
      lastListenedAt = event.listened_at
    }
  }

  return { count, lastListenedAt }
}

/**
 * Single-pass listening summary for every collection item, keyed by
 * `collection_item_id`. An item with no events is simply absent from the map
 * - callers treat a missing entry the same as `{ count: 0, lastListenedAt:
 * null }` (never played). Added for spec 0016 Finding A: the Collection
 * rating/listening browse controls filter/sort over every item's listening
 * facts at once, so building one map in a single pass is clearer (and
 * cheaper) than calling `summarizeListeningForItem` once per item. Existing
 * per-item call sites (e.g. the List view's play-count label) are
 * unaffected and unchanged.
 */
export function buildListeningSummaryMap(
  events: readonly ListeningEventRecord[],
): Map<string, ListeningSummary> {
  const map = new Map<string, ListeningSummary>()

  for (const event of events) {
    const time = new Date(event.listened_at).getTime()
    const parsed = Number.isFinite(time)

    const existing = map.get(event.collection_item_id)

    if (!existing) {
      map.set(event.collection_item_id, {
        count: 1,
        lastListenedAt: parsed ? event.listened_at : null,
      })
      continue
    }

    existing.count += 1

    if (parsed) {
      const existingTime = existing.lastListenedAt
        ? new Date(existing.lastListenedAt).getTime()
        : Number.NEGATIVE_INFINITY

      if (time > existingTime) {
        existing.lastListenedAt = event.listened_at
      }
    }
  }

  return map
}

/**
 * Human-readable local rendering of a stored UTC `listened_at` timestamp. The
 * browser's own locale and time zone are used - the raw ISO string is kept
 * separately (e.g. on a `<time dateTime>` attribute) as the machine-readable
 * value. An unparseable input is returned unchanged rather than shown as
 * "Invalid Date".
 */
export function formatListenedAt(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return date.toLocaleString()
}
