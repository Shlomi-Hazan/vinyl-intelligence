export type CatalogProvider = 'musicbrainz'

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
  derivedProviderPageUrl: string
}

export type CatalogSearchResponse = {
  candidates: CatalogCandidate[]
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
