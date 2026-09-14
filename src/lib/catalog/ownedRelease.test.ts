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
      provider_release_id: '11111111-1111-4111-8111-111111111111',
      ...overrides,
    },
  } as CollectionItemWithRelease
}

const OWNED_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

describe('isExactCatalogReleaseOwned (spec 0016 Finding B / §21.7)', () => {
  it('an empty collection is never owned', () => {
    expect(isExactCatalogReleaseOwned(OWNED_ID, [])).toBe(false)
  })

  it('an exact provider release id match is owned', () => {
    expect(isExactCatalogReleaseOwned(OWNED_ID, [ownedItem()])).toBe(true)
  })

  it('a different provider release id is not owned', () => {
    expect(isExactCatalogReleaseOwned(OTHER_ID, [ownedItem()])).toBe(false)
  })

  it('an owned item with a null provider_release_id never falsely matches', () => {
    const item = ownedItem({ provider_release_id: null })
    expect(isExactCatalogReleaseOwned(OWNED_ID, [item])).toBe(false)
    // it also can never match itself via a null-to-null comparison, since the
    // candidate id being checked is always a real string here.
  })

  it('two existing copies of the same release still count as owned', () => {
    const copies = [
      ownedItem(),
      { ...ownedItem(), id: 'c2' },
    ]
    expect(isExactCatalogReleaseOwned(OWNED_ID, copies)).toBe(true)
  })

  it('does not match on artist/title alone when the release id differs', () => {
    const item = ownedItem({ provider_release_id: OTHER_ID })
    expect(isExactCatalogReleaseOwned(OWNED_ID, [item])).toBe(false)
  })
})
