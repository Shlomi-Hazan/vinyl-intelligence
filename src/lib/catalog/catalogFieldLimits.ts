/**
 * The single shared source for release field-length bounds and the
 * application-wide release-year range (spec 0018 §1/§2.3 - previously
 * duplicated privately in `musicbrainz.ts` and separately exported from
 * `src/lib/supabase/collection.ts`). Both of those modules now import from
 * here; `collection.ts` re-exports `RELEASE_FIELD_LIMITS` so every existing
 * importer keeps working unmodified.
 */
export const RELEASE_FIELD_LIMITS = {
  artist: 160,
  title: 200,
  label: 160,
  catalogNumber: 120,
  country: 80,
  format: 80,
  genre: 40,
  /** A persisted Discogs provider image URL (spec 0018 follow-up §9). */
  providerImageUrl: 1000,
} as const

export const RELEASE_YEAR_MIN = 1900
export const RELEASE_YEAR_MAX = 2100
