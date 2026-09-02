import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell.tsx'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext.ts'

function wrap(route: string, ui: React.ReactNode) {
  const auth = {
    status: 'authenticated',
    client: {} as never,
    session: null,
    user: { id: 'u1', email: 'a@example.test' } as never,
    profile: { id: 'u1', display_name: 'Ana', created_at: '', updated_at: '' },
    notice: null,
    errorMessage: null,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateDisplayName: vi.fn(),
  } as unknown as AuthContextValue

  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('AppShell', () => {
  it('renders the primary navigation with every section', () => {
    wrap('/dashboard', <AppShell>content</AppShell>)
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    for (const label of [
      'Dashboard',
      'Collection',
      'Discover',
      'Ask VIN',
      'Scan',
      'History',
      'Settings',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the current route with aria-current="page"', () => {
    wrap('/collection', <AppShell>content</AppShell>)
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveTextContent(
      'Collection',
    )
  })

  it('exposes a skip link and a labelled main region', () => {
    wrap('/dashboard', <AppShell>content</AppShell>)
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#vi-main-content',
    )
    expect(document.getElementById('vi-main-content')).not.toBeNull()
  })

  it('renders a mobile bottom-nav with a More control', () => {
    wrap('/dashboard', <AppShell>content</AppShell>)
    // Two <nav aria-label="Primary"> exist: sidebar + bottom bar.
    const navs = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(navs.length).toBe(2)
    expect(
      screen.getByRole('button', { name: /More/ }),
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
