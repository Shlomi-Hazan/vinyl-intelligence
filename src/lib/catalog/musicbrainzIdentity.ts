/**
 * Pure, browser-safe MusicBrainz release identity/URL helpers (spec 0017).
 *
 * No `fetch`, no `AbortController`, no provider-timeout logic - this module
 * is safe to import from React components as well as server code, unlike
 * `musicbrainz.ts` (which also contains provider-fetching logic and, until
 * this enhancement, had zero browser importers). `musicbrainz.ts` re-exports
 * `MUSICBRAINZ_RELEASE_ID_PATTERN` from here so every existing import site
 * keeps working unmodified - this is the one canonical definition.
 */

export const MUSICBRAINZ_RELEASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The canonical MusicBrainz release-page URL for a given release id, or
 * `null` (never a malformed string) when the id fails
 * `MUSICBRAINZ_RELEASE_ID_PATTERN`. The single shared implementation spec
 * 0017 §13.3 recommends - `normalizeMusicBrainzRelease`, the pasted-URL
 * parser below, and the Record Detail provenance link all call this instead
 * of each building their own copy.
 */
export function musicBrainzReleaseUrl(providerReleaseId: string): string | null {
  if (!MUSICBRAINZ_RELEASE_ID_PATTERN.test(providerReleaseId)) {
    return null
  }

  return `https://musicbrainz.org/release/${providerReleaseId.toLowerCase()}`
}

/**
 * MusicBrainz's own full search UI, prefilled with a plain (unqualified)
 * query term when one is given (spec 0017 §12). `type=release&method=indexed`
 * is always present; `query` is omitted entirely - not sent empty - when no
 * term has been typed yet, so the link still opens a useful, working search
 * page.
 */
export function musicBrainzWebSearchUrl(term: string | null): string {
  const params = new URLSearchParams()
  const trimmed = term?.trim()

  if (trimmed) {
    params.set('query', trimmed)
  }

  params.set('type', 'release')
  params.set('method', 'indexed')

  return `https://musicbrainz.org/search?${params.toString()}`
}

/**
 * Strict parser for a pasted MusicBrainz release URL (spec 0017 §10.2).
 * Accepts only `https://musicbrainz.org/release/<mbid>` (case-insensitive
 * scheme/host; `http://` is normalized to `https://`), with at most one
 * optional trailing slash and an optional query string/fragment - both
 * tolerated and stripped, never inspected. Everything else is rejected:
 * any hostname other than exactly `musicbrainz.org` (no subdomains, no
 * lookalike domains), any MusicBrainz entity other than `release`, a
 * missing or malformed id, an extra path segment, embedded userinfo
 * credentials, a non-`http(s)` scheme, and an explicit non-default port.
 * An empty/whitespace-only input returns `null` exactly like any other
 * rejection - the caller (§10.2) is responsible for treating an empty
 * input as "untouched" rather than as a validation error.
 *
 * This function never fetches the input or anything derived from it - it
 * is a pure string parser, the extract-and-validate-an-identifier half of
 * spec 0017 §15's SSRF analysis. Only the returned, already-validated
 * `providerReleaseId` (a bare MBID) ever crosses to the server.
 */
export function parseMusicBrainzReleaseUrl(
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

  if (url.hostname.toLowerCase() !== 'musicbrainz.org') {
    return null
  }

  // `URL` normalizes an explicitly-specified default port (80 for http, 443
  // for https) back to an empty string, so a non-empty `port` here is
  // genuinely an explicit, non-default port.
  if (url.port !== '') {
    return null
  }

  const match = /^\/release\/([^/]+)\/?$/i.exec(url.pathname)

  if (!match) {
    return null
  }

  const candidateId = match[1]

  if (!MUSICBRAINZ_RELEASE_ID_PATTERN.test(candidateId)) {
    return null
  }

  return { providerReleaseId: candidateId.toLowerCase() }
}
