/**
 * Discogs release identity/URL helpers - a browser-safe, dependency-free
 * sibling of `musicbrainzIdentity.ts` (spec 0018 §2.1). IDs are validated and
 * carried as strings everywhere, never parsed to a JS `number`.
 *
 * Still deliberately does NOT export a `discogsWebSearchUrl` (no "search on
 * Discogs" outbound link with a free-text query - spec 0018 §3, unchanged by
 * the follow-up). `parseDiscogsReleaseUrl`, below, WAS cut from v1 but is
 * reinstated by the spec 0018 follow-up (§5): exact Discogs release URL
 * import is now a supported entry point, mirroring the existing MusicBrainz
 * exact-URL feature.
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

/**
 * Strict parser for a pasted Discogs release URL (spec 0018 follow-up §5),
 * mirroring `parseMusicBrainzReleaseUrl`'s exact discipline: a real `URL`
 * parse plus an anchored pathname match, never fragile string splitting.
 *
 * Accepts only `https://www.discogs.com/release/<id>` or
 * `https://discogs.com/release/<id>`, optionally followed by a `-<slug>`
 * (Discogs's own canonical link shape, e.g.
 * `/release/26770295-Artist-Album-Title`), with at most one trailing slash
 * and an optional query string/fragment - both tolerated and stripped,
 * never inspected. Everything else is rejected: a master URL (`/master/…`),
 * an artist URL (`/artist/…`), a Marketplace URL (`/sell/…`), any other
 * path shape, a numeric id embedded in an unrelated path, an id that fails
 * `DISCOGS_RELEASE_ID_PATTERN`, embedded userinfo credentials, a non-
 * `http(s)` scheme, and an explicit non-default port. An empty/whitespace-
 * only input returns `null` exactly like any other rejection - the caller
 * is responsible for treating an empty input as "untouched" rather than as
 * a validation error.
 *
 * This function never fetches the input or anything derived from it - a
 * pure string parser. Only the returned, already-validated
 * `providerReleaseId` ever crosses to the server.
 */
export function parseDiscogsReleaseUrl(
  input: string,
): { providerReleaseId: string } | null {
  const trimmed = input.trim()

  if (!trimmed) {
    return null
  }

  let url: URL

  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }

  if (url.username || url.password) {
    return null
  }

  const host = url.hostname.toLowerCase()

  if (host !== 'discogs.com' && host !== 'www.discogs.com') {
    return null
  }

  // `URL` normalizes an explicitly-specified default port (80 for http, 443
  // for https) back to an empty string, so a non-empty `port` here is
  // genuinely an explicit, non-default port.
  if (url.port !== '') {
    return null
  }

  // Anchored to the whole pathname: `/release/<digits>` optionally followed
  // by `-<anything except a slash>`, optionally trailed by one slash -
  // never a substring match, so `/sell/item/release/26770295` (Marketplace)
  // or `/master/26770295` never slip through.
  const match = /^\/release\/(\d+)(?:-[^/]*)?\/?$/.exec(url.pathname)

  if (!match) {
    return null
  }

  const candidateId = match[1]

  return DISCOGS_RELEASE_ID_PATTERN.test(candidateId)
    ? { providerReleaseId: candidateId }
    : null
}
