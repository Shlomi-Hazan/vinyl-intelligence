/*
 * Deterministic Cover Art Archive (CAA) front-image URLs, built entirely in the
 * browser from the MusicBrainz identifiers the app already stores. There is NO
 * backend CAA call, NO persisted cover URL, and NO image proxy - `AlbumArtwork`
 * hotlinks these as plain `<img src>` (CAA 302-redirects a present image to an
 * archive.org CDN object; a missing image is a cheap 404).
 *
 * See docs/decisions/0005 section 3 and docs/specs/0012 section 7.3.
 */

export type CoverArtSize = 250 | 500 | 1200

const CAA_ORIGIN = 'https://coverartarchive.org'

// A MusicBrainz MBID is a lowercase UUID. Anything else is not a usable id and
// must not be turned into a request URL.
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isMbid(value: unknown): value is string {
  return typeof value === 'string' && MBID_RE.test(value.trim().toLowerCase())
}

function frontUrl(kind: 'release' | 'release-group', mbid: string, size: CoverArtSize): string {
  return `${CAA_ORIGIN}/${kind}/${mbid.trim().toLowerCase()}/front-${size}`
}

/** CAA front image for a specific MusicBrainz *release*, or null if no usable id. */
export function caaReleaseFrontUrl(
  mbid: string | null | undefined,
  size: CoverArtSize = 250,
): string | null {
  return isMbid(mbid) ? frontUrl('release', mbid, size) : null
}

/** CAA front image for a MusicBrainz *release group*, or null if no usable id. */
export function caaReleaseGroupFrontUrl(
  mbid: string | null | undefined,
  size: CoverArtSize = 250,
): string | null {
  return isMbid(mbid) ? frontUrl('release-group', mbid, size) : null
}
