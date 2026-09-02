import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlbumArtwork } from './AlbumArtwork.tsx'
import { fallbackAccent } from './fallbackCover.ts'

describe('AlbumArtwork (Phase A: fallback tier only)', () => {
  it('renders an accessible image name from artist and title', () => {
    render(<AlbumArtwork artist="Pink Floyd" title="Meddle" />)
    expect(
      screen.getByRole('img', { name: 'Pink Floyd - Meddle (no cover art)' }),
    ).toBeInTheDocument()
  })

  it('does not render an <img> element (no network tier in Phase A)', () => {
    const { container } = render(<AlbumArtwork artist="A" title="B" />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps a 1:1 aspect ratio box', () => {
    const { container } = render(<AlbumArtwork artist="A" title="B" />)
    const box = container.querySelector('.vi-art') as HTMLElement
    expect(box).not.toBeNull()
    // the class carries `aspect-ratio: 1 / 1` in components.css
    expect(box.className).toContain('vi-art--fallback')
  })

  it('uses the deterministic accent for a given seed', () => {
    const { container, rerender } = render(
      <AlbumArtwork artist="A" title="B" seedId="seed-1" />,
    )
    const first = container.querySelector('circle[r="20"]')?.getAttribute('fill')
    rerender(<AlbumArtwork artist="A" title="B" seedId="seed-1" />)
    const second = container.querySelector('circle[r="20"]')?.getAttribute('fill')
    expect(first).toBe(second)
    expect(first).toBe(fallbackAccent('seed-1'))
  })

  it('hides decorative geometry from assistive tech', () => {
    const { container } = render(<AlbumArtwork artist="A" title="B" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
