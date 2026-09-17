export type CatalogProvider = 'musicbrainz' | 'discogs'

/**
 * The three mutually-exclusive Discover search modes (spec 0017 §6). A
 * shared browser+server wire-contract value - not a provider internal, so
 * it lives here rather than in `musicbrainz.ts`.
 */
export type SearchMode = 'all' | 'artist' | 'album'

export type CatalogCandidate = {
  provider: CatalogProvider
  providerReleaseId: string
  providerReleaseGroupId: string | null
  score: number | null
  artist: string
  title: string
  releaseYear: number | null
  label: string | null
  catalogNumber: string | null
  country: string | null
  format: string | null
  transientCoverDisplayUrl: string | null
  /**
   * A provider-hosted image URL meant to be PERSISTED as owned-release
   * artwork (spec 0018 follow-up §9-§11) - distinct from
   * `transientCoverDisplayUrl` (a search-result-only display hint, never
   * persisted). Always `null` for MusicBrainz (which derives artwork from
   * the Cover Art Archive by mbid at render time, never a persisted URL);
   * populated only by a Discogs exact-release lookup, and only when the
   * release actually has a usable image - missing artwork is valid.
   */
  providerImageUrl: string | null
  derivedProviderPageUrl: string
}

export type CatalogSearchResponse = {
  candidates: CatalogCandidate[]
  /** Echoes the effective offset this page was fetched at (spec 0017 §8.2). */
  offset: number
  /**
   * Computed server-side from the provider's raw page size and its own
   * `count` field (spec 0017 §7.2) - never inferred client-side from
   * `candidates.length` alone. Additive to the pre-0017 shape: any code that
   * only reads `.candidates` continues to work unmodified.
   */
  hasMore: boolean
}

export type CatalogCollectionItem = {
  id: string
  added_at: string
  created_at: string
  release: {
    id: string
    artist: string
    title: string
    release_year: number | null
    label: string | null
    catalog_number: string | null
    country: string | null
    format: string | null
    genres: string[]
    updated_at: string
    provider_image_url?: string | null
  }
}

export type CatalogAddResponse = {
  item: CatalogCollectionItem
}

export type CatalogErrorCode =
  | 'invalid_query'
  | 'unauthorized'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_bad_response'
  | 'not_found'
  | 'config_error'
  | 'database_error'
  | 'unknown'

export class CatalogClientError extends Error {
  readonly code: CatalogErrorCode

  constructor(code: CatalogErrorCode, message: string) {
    super(message)
    this.name = 'CatalogClientError'
    this.code = code
  }
}
