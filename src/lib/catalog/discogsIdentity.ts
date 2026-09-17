/**
 * Discogs release identity/URL helpers - a browser-safe, dependency-free
 * sibling of `musicbrainzIdentity.ts` (spec 0018 §2.1). IDs are validated and
 * carried as strings everywhere, never parsed to a JS `number`.
 *
 * `discogsWebSearchUrl`, below, was originally cut (no "search on Discogs"
 * outbound link - spec 0018 §3) but is reinstated by spec 0020 §5, solely to
 * give a user an in-app path to Discogs's own site to find a release URL for
 * the exact-URL import feature (which itself was cut from v1 and reinstated
 * earlier, by the spec 0018 follow-up §5, spec 0019). Neither link performs
 * or triggers any search, matching, or persistence of its own.
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
 * An outbound link to Discogs's own web search (spec 0020 §5), mirroring
 * `musicBrainzWebSearchUrl`'s exact shape: `q` is set only for a non-empty,
 * trimmed term; `type=release` is always set. Never fetched by this app -
 * purely a link the user follows to Discogs's own site.
 */
export function discogsWebSearchUrl(term: string | null): string {
  const params = new URLSearchParams()
  const trimmed = term?.trim()

  if (trimmed) {
    params.set('q', trimmed)
  }

  params.set('type', 'release')

  return `https://www.discogs.com/search/?${params.toString()}`
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
