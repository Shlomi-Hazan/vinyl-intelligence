import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader.tsx'

describe('PageHeader', () => {
  it('renders the title and eyebrow through <bdi> (BiDi-isolated)', () => {
    render(<PageHeader eyebrow="שלום חנוך" title="מחכים למשיח" />)
    const heading = screen.getByRole('heading', { level: 1 })
    const bdi = heading.querySelector('bdi')
    expect(bdi?.textContent).toBe('מחכים למשיח')
    expect(bdi?.getAttribute('dir')).toBe('auto')
    expect(bdi?.getAttribute('lang')).toBe('he')
  })

  it('keeps a plain-string API and moves focus to the heading on mount', () => {
    render(<PageHeader title="History" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('History')
    expect(heading).toHaveFocus()
  })

  it('does not set lang for a Latin title', () => {
    render(<PageHeader title="Radiohead" />)
    expect(
      screen.getByRole('heading', { level: 1 }).querySelector('bdi')?.getAttribute('lang'),
    ).toBeNull()
  })
})
