import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CuratorRecommendationCard } from './CuratorRecommendationCard.tsx'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { CuratorRecommendation } from '../lib/curator/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const client = {} as BrowserSupabaseClient

function recommendation(
  overrides: Partial<CuratorRecommendation> = {},
): CuratorRecommendation {
  return {
    collectionItemId: 'item-42',
    artist: 'Pink Floyd',
    title: 'Wish You Were Here',
    year: 1975,
    decade: 1970,
    genres: ['progressive rock'],
    rating: null,
    favorite: false,
    playCount: 0,
    lastListenedAt: null,
    neverPlayed: true,
    reason: 'A warm, older record you have not played lately.',
    evidenceKeys: ['never_played'],
    isBestMatch: false,
    ...overrides,
  }
}

function owned(overrides: Partial<CollectionItemWithRelease> = {}): CollectionItemWithRelease {
  return {
    id: 'item-42',
    added_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    rating: null,
    is_favorite: false,
    notes: null,
    custom_cover_path: null,
    custom_cover_updated_at: null,
    personal_genres: [],
    release: {
      id: 'rel-42',
      artist: 'Pink Floyd',
      title: 'Wish You Were Here',
      release_year: 1975,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: ['progressive rock'],
      updated_at: '2026-01-01T00:00:00.000Z',
      provider_release_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      provider_release_group_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      source: 'catalog',
    },
    ...overrides,
  }
}

function renderCard(props: Partial<Parameters<typeof CuratorRecommendationCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <CuratorRecommendationCard
        recommendation={recommendation()}
        ownedItem={owned()}
        client={client}
        userId="user-1"
        events={[]}
        eventsStatus="ready"
        onMarkPlayed={vi.fn().mockResolvedValue(undefined)}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('CuratorRecommendationCard', () => {
  it('feeds the canonical artwork the owned release MusicBrainz ids', () => {
    renderCard()
    const cover = screen.getByRole('img', { name: /Pink Floyd - Wish You Were Here/ })
    // tier 2: CAA release front from the owned item's real provider_release_id
    expect(cover.querySelector('img.vi-art__img')).toHaveAttribute(
      'src',
      'https://coverartarchive.org/release/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/front-250',
    )
  })

  it('links the artwork and the title to the owned record detail route', () => {
    renderCard()
    const links = screen.getAllByRole('link').filter(
      (a) => a.getAttribute('href') === '/collection/item-42',
    )
    // artwork link + title link + explicit "View record" action
    expect(links.length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('link', { name: 'View record' })).toHaveAttribute(
      'href',
      '/collection/item-42',
    )
    expect(screen.getByRole('link', { name: 'Wish You Were Here' })).toHaveAttribute(
      'href',
      '/collection/item-42',
    )
  })

  it('still renders safely when the owned item cannot be resolved', () => {
    renderCard({ ownedItem: null })
    // no crash; branded fallback artwork, no invented cover art
    expect(
      screen.getByRole('img', { name: 'Pink Floyd - Wish You Were Here (no cover art)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View record' })).toHaveAttribute(
      'href',
      '/collection/item-42',
    )
    expect(screen.getByText('A warm, older record you have not played lately.')).toBeInTheDocument()
  })

  it('derives listening facts live from the shared events, not the stale snapshot', () => {
    // snapshot says never played, but the live events already have a play
    renderCard({
      events: [
        {
          id: 'e1',
          collection_item_id: 'item-42',
          listened_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
      eventsStatus: 'ready',
    })
    const card = screen.getByRole('article')
    expect(within(card).queryByText('Never played')).not.toBeInTheDocument()
    expect(within(card).getByText(/Played 1 time · last listened 2 days ago/)).toBeInTheDocument()
  })

  it('does not show a false "Never played" while events are still loading', () => {
    renderCard({ events: [], eventsStatus: 'loading' })
    const card = screen.getByRole('article')
    expect(within(card).queryByText('Never played')).not.toBeInTheDocument()
    expect(within(card).getByText('Checking your listening history…')).toBeInTheDocument()
  })
})
