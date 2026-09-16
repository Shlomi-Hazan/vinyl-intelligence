import { describe, expect, it } from 'vitest'
import { isExactCatalogReleaseOwned } from './ownedRelease.ts'
import type { CollectionItemWithRelease } from '../supabase/collection.ts'

function ownedItem(
  overrides: Partial<CollectionItemWithRelease['release']> = {},
): CollectionItemWithRelease {
  return {
    id: 'c1',
    added_at: '',
    created_at: '',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: 'r1',
      artist: 'Portishead',
      title: 'Dummy',
      release_year: 1994,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '',
      provider: 'musicbrainz',
      provider_release_id: '11111111-1111-4111-8111-111111111111',
      ...overrides,
    },
  } as CollectionItemWithRelease
}

const OWNED_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const DISCOGS_ID = '26770295'

describe('isExactCatalogReleaseOwned (spec 0016 Finding B / §21.7; provider-qualified per spec 0018 §7)', () => {
  it('an empty collection is never owned', () => {
    expect(isExactCatalogReleaseOwned('musicbrainz', OWNED_ID, [])).toBe(false)
  })

  it('an exact (provider, provider_release_id) match is owned', () => {
    expect(isExactCatalogReleaseOwned('musicbrainz', OWNED_ID, [ownedItem()])).toBe(true)
  })

  it('a different provider release id is not owned', () => {
    expect(isExactCatalogReleaseOwned('musicbrainz', OTHER_ID, [ownedItem()])).toBe(false)
  })

  it('an owned item with a null provider_release_id never falsely matches', () => {
    const item = ownedItem({ provider_release_id: null })
    expect(isExactCatalogReleaseOwned('musicbrainz', OWNED_ID, [item])).toBe(false)
  })

  it('two existing copies of the same release still count as owned', () => {
    const copies = [
      ownedItem(),
      { ...ownedItem(), id: 'c2' },
    ]
    expect(isExactCatalogReleaseOwned('musicbrainz', OWNED_ID, copies)).toBe(true)
  })

  it('does not match on artist/title alone when the release id differs', () => {
    const item = ownedItem({ provider_release_id: OTHER_ID })
    expect(isExactCatalogReleaseOwned('musicbrainz', OWNED_ID, [item])).toBe(false)
  })

  it('a MusicBrainz-owned release and a same-numbered-looking Discogs id are never conflated (spec 0018 §7)', () => {
    const musicBrainzOwned = ownedItem({ provider: 'musicbrainz', provider_release_id: DISCOGS_ID })
    expect(isExactCatalogReleaseOwned('discogs', DISCOGS_ID, [musicBrainzOwned])).toBe(false)
  })

  it('a Discogs-owned release matches only under provider "discogs"', () => {
    const discogsOwned = ownedItem({ provider: 'discogs', provider_release_id: DISCOGS_ID })
    expect(isExactCatalogReleaseOwned('discogs', DISCOGS_ID, [discogsOwned])).toBe(true)
    expect(isExactCatalogReleaseOwned('musicbrainz', DISCOGS_ID, [discogsOwned])).toBe(false)
  })
})
