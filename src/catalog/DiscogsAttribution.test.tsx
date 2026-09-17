import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiscogsAttribution } from './DiscogsAttribution.tsx'

describe('DiscogsAttribution', () => {
  it('renders the required "Data provided by Discogs" text with a normal (non-nofollow) link', () => {
    render(<DiscogsAttribution releaseUrl="https://www.discogs.com/release/26770295" />)
    const link = screen.getByRole('link', { name: 'Discogs' })
    expect(link).toHaveAttribute('href', 'https://www.discogs.com/release/26770295')
    expect(link).not.toHaveAttribute('rel', expect.stringContaining('nofollow'))
    expect(screen.getByText(/Data provided by/)).toBeInTheDocument()
  })

  it('the full variant carries the required trailing period before the decorative arrow', () => {
    render(<DiscogsAttribution releaseUrl="https://www.discogs.com/release/1" />)
    expect(screen.getByText(/Data provided by/).textContent).toMatch(/Discogs\.\s*↗$/)
  })

  it('the compact variant carries the compact modifier class and omits the trailing period', () => {
    render(<DiscogsAttribution releaseUrl="https://www.discogs.com/release/1" compact />)
    const text = screen.getByText(/Data provided by/)
    expect(text.className).toContain('vi-discogs-attribution--compact')
    expect(text.textContent).toMatch(/Discogs\s*↗$/)
    expect(text.textContent).not.toMatch(/Discogs\./)
  })

  it('the decorative arrow is aria-hidden - never part of the accessible name', () => {
    render(<DiscogsAttribution releaseUrl="https://www.discogs.com/release/1" />)
    expect(screen.getByRole('link', { name: 'Discogs' })).toBeInTheDocument()
  })
})
