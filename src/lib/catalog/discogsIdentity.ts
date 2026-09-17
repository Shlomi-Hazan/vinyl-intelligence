/**
 * Discogs release identity/URL helpers - a browser-safe, dependency-free
 * sibling of `musicbrainzIdentity.ts` (spec 0018 §2.1). IDs are validated and
 * carried as strings everywhere, never parsed to a JS `number`.
 *
 * Deliberately does NOT export a `discogsWebSearchUrl` or a
 * `parseDiscogsReleaseUrl` - both are explicitly cut from v1 (spec 0018 §3):
 * there is no Discogs URL-paste/import feature and no "search on Discogs"
 * outbound link with a free-text query.
 */

/**
 * A bare positive integer, 1-10 digits - a generous defensive
 * string-length bound, not a claimed provider guarantee (spec 0018 §2.1).
 */
export const DISCOGS_RELEASE_ID_PATTERN = /^[1-9][0-9]{0,9}$/

/**
 * The human-facing Discogs release page, distinct from `api.discogs.com`.
 * Returns `null` for an id that fails `DISCOGS_RELEASE_ID_PATTERN` - never a
 * malformed link.
 */
export function discogsReleaseUrl(providerReleaseId: string): string | null {
  if (!DISCOGS_RELEASE_ID_PATTERN.test(providerReleaseId)) {
    return null
  }

  return `https://www.discogs.com/release/${providerReleaseId}`
}
