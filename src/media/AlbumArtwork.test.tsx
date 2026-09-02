import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AlbumArtwork } from './AlbumArtwork.tsx'
import { fallbackAccent } from './fallbackCover.ts'
import { __clearSignedCoverCache } from './signedCover.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const REL = '11111111-1111-4111-8111-111111111111'
const RG = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  __clearSignedCoverCache()
  vi.restoreAllMocks()
})

function img(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img.vi-art__img')
}

describe('AlbumArtwork', () => {
  it('renders only the branded fallback when there is no id or custom cover', () => {
    const { container } = render(<AlbumArtwork artist="Pink Floyd" title="Meddle" />)
    expect(
      screen.getByRole('img', { name: 'Pink Floyd - Meddle (no cover art)' }),
    ).toBeInTheDocument()
    expect(img(container)).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('starts at the CAA release tier when a release MBID is present', () => {
    const { container } = render(
      <AlbumArtwork artist="A" title="B" releaseMbid={REL} releaseGroupMbid={RG} />,
    )
    expect(img(container)?.getAttribute('src')).toBe(
      `https://coverartarchive.org/release/${REL}/front-250`,
    )
    expect(img(container)).toHaveAttribute('loading', 'lazy')
    // real cover -> accessible name has no "(no cover art)"
    expect(screen.getByRole('img', { name: 'A - B' })).toBeInTheDocument()
  })

  it('advances release -> release-group -> branded fallback on <img> error, then stops', () => {
    const { container } = render(
      <AlbumArtwork artist="A" title="B" releaseMbid={REL} releaseGroupMbid={RG} />,
    )
    expect(img(container)?.getAttribute('src')).toContain(`/release/${REL}/front-250`)

    fireEvent.error(img(container) as HTMLImageElement)
    expect(img(container)?.getAttribute('src')).toBe(
      `https://coverartarchive.org/release-group/${RG}/front-250`,
    )

    fireEvent.error(img(container) as HTMLImageElement)
    // no more <img>: the branded fallback is showing and cannot error again
    expect(img(container)).toBeNull()
    expect(
      screen.getByRole('img', { name: 'A - B (no cover art)' }),
    ).toBeInTheDocument()
  })

  it('skips the release tier and uses release-group when only the group MBID is valid', () => {
    const { container } = render(
      <AlbumArtwork artist="A" title="B" releaseMbid="not-an-mbid" releaseGroupMbid={RG} />,
    )
    expect(img(container)?.getAttribute('src')).toBe(
      `https://coverartarchive.org/release-group/${RG}/front-250`,
    )
  })

  it('uses the deterministic fallback accent for a given seed', () => {
    const { container } = render(<AlbumArtwork artist="A" title="B" seedId="seed-1" />)
    expect(container.querySelector('circle[r="20"]')?.getAttribute('fill')).toBe(
      fallbackAccent('seed-1'),
    )
  })

  it('custom signed cover takes precedence over CAA', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'blob:signed-cover' }, error: null })
    const client = {
      storage: { from: () => ({ createSignedUrl }) },
    } as unknown as BrowserSupabaseClient

    const { container } = render(
      <AlbumArtwork
        artist="A"
        title="B"
        releaseMbid={REL}
        customCoverPath="uid/item/cover.webp"
        client={client}
      />,
    )

    await waitFor(() =>
      expect(img(container)?.getAttribute('src')).toBe('blob:signed-cover'),
    )
    expect(createSignedUrl).toHaveBeenCalledWith('uid/item/cover.webp', 3600)
  })

  it('falls back to CAA when the signed URL cannot be minted', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'denied' } })
    const client = {
      storage: { from: () => ({ createSignedUrl }) },
    } as unknown as BrowserSupabaseClient

    const { container } = render(
      <AlbumArtwork
        artist="A"
        title="B"
        releaseMbid={REL}
        customCoverPath="uid/item/cover.webp"
        client={client}
      />,
    )

    await waitFor(() =>
      expect(img(container)?.getAttribute('src')).toContain(`/release/${REL}/front-250`),
    )
  })
})
