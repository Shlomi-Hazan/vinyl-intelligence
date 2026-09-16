import type { CollectionItemWithRelease } from '../supabase/collection.ts'
import type { CatalogProvider } from './types.ts'

/**
 * The single shared source of truth for "does the user already own this
 * exact catalog release?" (spec 0016 Finding B / §21.7; provider-qualified
 * per spec 0018 §7). This is an EXACT `(provider, provider_release_id)`
 * match only - never artist/title, release-group, or normalized-metadata
 * matching, and never a bare `provider_release_id` match across providers.
 * Multiple existing copies still mean "owned"; an empty collection, or an
 * owned item with no `provider_release_id` (e.g. a manual entry), never
 * falsely matches. A MusicBrainz UUID and a numeric Discogs id never
 * collide, but the comparison is provider-scoped by construction, not by
 * accident of differing string shapes.
 *
 * Pure: no React, no network, no state, no side effects. Both DiscoverPanel
 * and ScanPanel must call this instead of deriving their own ownership set,
 * so the two surfaces can never silently drift on what counts as "owned".
 */
export function isExactCatalogReleaseOwned(
  provider: CatalogProvider,
  providerReleaseId: string,
  ownedItems: readonly CollectionItemWithRelease[],
): boolean {
  return ownedItems.some(
    (item) =>
      item.release.provider === provider
      && item.release.provider_release_id === providerReleaseId,
  )
}
