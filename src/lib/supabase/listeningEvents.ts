import type { BrowserSupabaseClient, ListeningEvent } from './client.ts'

/**
 * A listening event as the browse/history UI needs it. `user_id` is omitted -
 * RLS already guarantees every visible row belongs to the current user, and the
 * UI never needs it.
 */
export type ListeningEventRecord = Pick<
  ListeningEvent,
  'id' | 'collection_item_id' | 'listened_at' | 'created_at'
>

/**
 * Newest-first comparator for listening events: most recent `listened_at` first,
 * `id` descending as a stable tie-break for equal timestamps. This matches the
 * `(listened_at desc, id desc)` ordering the database index and load query use,
 * so freshly inserted local rows can be spliced in without a reload.
 */
export function compareListeningEventsNewestFirst(
  a: Pick<ListeningEvent, 'id' | 'listened_at'>,
  b: Pick<ListeningEvent, 'id' | 'listened_at'>,
): number {
  const aTime = new Date(a.listened_at).getTime()
  const bTime = new Date(b.listened_at).getTime()

  if (aTime !== bTime) {
    return bTime - aTime
  }

  if (a.id === b.id) {
    return 0
  }

  return a.id < b.id ? 1 : -1
}

/**
 * Load the current user's listening events, newest first. RLS scopes the result
 * to the caller's own rows. Any error is surfaced to the caller so the UI can
 * show a real failure state (and a Retry) rather than an empty history.
 */
export async function loadListeningEvents(
  client: BrowserSupabaseClient,
): Promise<ListeningEventRecord[]> {
  const { data, error } = await client
    .from('listening_events')
    .select('id, collection_item_id, listened_at, created_at')
    .order('listened_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    throw error
  }

  return data ?? []
}

/**
 * Append one listening event for an owned collection item ("Mark played").
 *
 * The insert payload is EXACTLY `{ collection_item_id }`: `user_id` defaults to
 * `auth.uid()` and `listened_at` defaults to `now()` in the database, and the
 * column-level grant only lets the browser write `collection_item_id`. The row
 * is immutable once written. Errors are surfaced so the caller never fabricates
 * a local event on failure.
 */
export async function addListeningEvent(
  client: BrowserSupabaseClient,
  collectionItemId: string,
): Promise<ListeningEventRecord> {
  const { data, error } = await client
    .from('listening_events')
    .insert({ collection_item_id: collectionItemId })
    .select('id, collection_item_id, listened_at, created_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

/**
 * Phase D: correct the time of an OWN listening event.
 *
 * ONLY `listened_at` is sent - the column-level grant plus RLS mean the browser
 * cannot touch id / user_id / collection_item_id / created_at, so a listen can
 * never be re-pointed at another album or another user. `listenedAt` must be a
 * valid ISO 8601 instant (the UI converts the user's local date+time to one).
 * Errors are surfaced so the caller never fabricates a local change.
 */
export async function updateListeningEventTime(
  client: BrowserSupabaseClient,
  eventId: string,
  listenedAt: string,
): Promise<ListeningEventRecord> {
  if (Number.isNaN(new Date(listenedAt).getTime())) {
    throw new Error('That is not a valid date and time.')
  }

  const { data, error } = await client
    .from('listening_events')
    .update({ listened_at: listenedAt })
    .eq('id', eventId)
    .select('id, collection_item_id, listened_at, created_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

/**
 * Phase D: delete an accidental OWN listening event. RLS scopes the delete to
 * the caller's own row. The album itself is untouched - only this play is
 * removed. Errors are surfaced.
 */
export async function deleteListeningEvent(
  client: BrowserSupabaseClient,
  eventId: string,
): Promise<void> {
  const { data, error } = await client
    .from('listening_events')
    .delete()
    .eq('id', eventId)
    .select('id')
    .single()

  if (error) {
    throw error
  }

  if (data?.id !== eventId) {
    throw new Error('The listening event was not deleted.')
  }
}
