import { describe, expect, it, vi } from 'vitest'
import {
  PERSONAL_GENRES_MAX,
  effectiveGenres,
  isEditableRelease,
  normalizePersonalGenres,
  updateCollectionItemPersonalGenres,
  type CollectionItemWithRelease,
} from './collection.ts'
import type { BrowserSupabaseClient } from './client.ts'

function item(
  release: Partial<CollectionItemWithRelease['release']>,
  personal: string[] = [],
): CollectionItemWithRelease {
  return {
    id: 'i1',
    added_at: '',
    created_at: '',
    rating: null,
    is_favorite: false,
    notes: null,
    personal_genres: personal,
    release: {
      id: 'r1',
      artist: 'A',
      title: 'T',
      release_year: null,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '',
      ...release,
    },
  }
}

describe('normalizePersonalGenres', () => {
  it('trims, lowercases, drops blanks, and dedupes preserving order', () => {
    expect(normalizePersonalGenres([' Jazz ', 'jazz', 'Bebop', '   ', 'BEBOP'])).toEqual([
      'jazz',
      'bebop',
    ])
  })

  it('rejects an over-long entry', () => {
    expect(() => normalizePersonalGenres(['x'.repeat(41)])).toThrow(/40 characters/)
  })

  it('rejects more than the maximum number of genres', () => {
    const many = Array.from({ length: PERSONAL_GENRES_MAX + 1 }, (_, i) => `g${i}`)
    expect(() => normalizePersonalGenres(many)).toThrow(/up to/)
  })
})

describe('effectiveGenres', () => {
  it('unions catalog and personal genres, catalog first, deduped', () => {
    expect(
      effectiveGenres(item({ genres: ['Hip Hop', 'rap'] }, ['rap', 'west coast hip hop'])),
    ).toEqual(['hip hop', 'rap', 'west coast hip hop'])
  })

  it('works with only personal genres', () => {
    expect(effectiveGenres(item({ genres: [] }, ['ambient']))).toEqual(['ambient'])
  })

  it('does not mutate either source array', () => {
    const catalog = ['jazz']
    const personal = ['fusion']
    const it0 = item({ genres: catalog }, personal)
    effectiveGenres(it0)
    expect(catalog).toEqual(['jazz'])
    expect(personal).toEqual(['fusion'])
  })
})

describe('isEditableRelease', () => {
  it('is editable for a manual release (no provider ids)', () => {
    expect(isEditableRelease(item({}).release)).toBe(true)
  })
  it('is read-only for a catalog release (has a provider release id)', () => {
    expect(
      isEditableRelease(item({ provider_release_id: 'mbid-1' }).release),
    ).toBe(false)
  })
  it('honours an explicit source flag', () => {
    expect(isEditableRelease(item({ source: 'catalog' }).release)).toBe(false)
    expect(
      isEditableRelease(item({ source: 'manual', provider_release_id: 'x' }).release),
    ).toBe(true)
  })
})

describe('updateCollectionItemPersonalGenres', () => {
  function client(saved: string[] = ['jazz']) {
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      single: vi.fn(async () => ({
        data: { id: 'i1', personal_genres: saved },
        error: null,
      })),
    }
    const c = {
      from: vi.fn((table: string) => {
        if (table !== 'collection_items') throw new Error(`bad table ${table}`)
        return query
      }),
    }
    return { client: c as unknown as BrowserSupabaseClient, query }
  }

  it('writes ONLY personal_genres, normalised, scoped to the item id', async () => {
    const { client: c, query } = client(['jazz', 'bebop'])
    await expect(
      updateCollectionItemPersonalGenres(c, 'i1', [' Jazz ', 'BEBOP', 'jazz']),
    ).resolves.toEqual(['jazz', 'bebop'])
    expect(query.update).toHaveBeenCalledWith({ personal_genres: ['jazz', 'bebop'] })
    expect(query.eq).toHaveBeenCalledWith('id', 'i1')
  })

  it('rejects invalid input before any write', async () => {
    const { client: c, query } = client()
    await expect(
      updateCollectionItemPersonalGenres(c, 'i1', ['x'.repeat(50)]),
    ).rejects.toThrow(/40 characters/)
    expect(query.update).not.toHaveBeenCalled()
  })

  it('propagates a Supabase / RLS error', async () => {
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      single: vi.fn(async () => ({ data: null, error: new Error('denied by RLS') })),
    }
    const c = { from: vi.fn(() => query) } as unknown as BrowserSupabaseClient
    await expect(
      updateCollectionItemPersonalGenres(c, 'i1', ['jazz']),
    ).rejects.toThrow('denied by RLS')
  })
})
