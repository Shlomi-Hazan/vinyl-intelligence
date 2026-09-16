/**
 * The six-hour Discogs content-freshness invariant (spec 0018 §12), as one
 * small, pure, dependency-free helper shared by every consumer:
 * `CollectionDataProvider` (client), `loadOwnedCollection` (VIN's
 * candidate-fact plumbing, server), and any future display surface.
 *
 * A `NULL`/missing `provider_fetched_at` on a Discogs-provider row is always
 * treated as stale - never as fresh - regardless of whether the
 * database-level `releases_discogs_requires_fetched_at` constraint is also
 * in force. Only `provider === 'discogs'` rows are ever subject to this
 * check; every other provider (or a manual release) is always "fresh" by
 * definition, since this invariant does not apply to it.
 */
export const DISCOGS_FRESHNESS_WINDOW_MS = 6 * 60 * 60 * 1000

/** age <= 6h -> fresh; age > 6h -> stale (the boundary itself is inclusive of fresh). */
export function isDiscogsRowFresh(
  provider: string | null | undefined,
  providerFetchedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (provider !== 'discogs') {
    return true
  }

  if (!providerFetchedAt) {
    return false
  }

  const fetchedAtMs = Date.parse(providerFetchedAt)

  if (!Number.isFinite(fetchedAtMs)) {
    return false
  }

  return now - fetchedAtMs <= DISCOGS_FRESHNESS_WINDOW_MS
}

/**
 * Exact milliseconds until a currently-fresh row crosses the six-hour
 * boundary and becomes stale - NOT floored/rounded to any minimum delay, so
 * an exact one-shot expiry timer built on this value never leaves a
 * stale-display window past the deadline. `0` for an already-stale or
 * non-Discogs row.
 */
export function msUntilStale(
  provider: string | null | undefined,
  providerFetchedAt: string | null | undefined,
  now: number = Date.now(),
): number {
  if (provider !== 'discogs') {
    return 0
  }

  if (!isDiscogsRowFresh(provider, providerFetchedAt, now)) {
    return 0
  }

  const fetchedAtMs = Date.parse(providerFetchedAt as string)

  return Math.max(0, DISCOGS_FRESHNESS_WINDOW_MS - (now - fetchedAtMs))
}
