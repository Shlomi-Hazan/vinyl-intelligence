import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Logo } from '../brand/Logo.tsx'
import { Icon } from '../ui/Icon.tsx'
import { NAV, pageTitleForPath } from './nav.ts'
import { useAuth } from '../auth/useAuth.ts'

const RAIL_KEY = 'vi.sidebar.rail'

function readRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

function initials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? 'VI').trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? 'V').concat(parts[1]?.[0] ?? '').toUpperCase()
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((entry) => (
        <NavLink
          key={entry.to}
          to={entry.to}
          className="vi-navitem"
          onClick={onNavigate}
        >
          <span className="vi-navitem__icon">
            <Icon name={entry.icon} size={19} />
          </span>
          <span className="vi-navitem__label">{entry.label}</span>
        </NavLink>
      ))}
    </>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { profile, user, signOut } = useAuth()
  const [rail, setRail] = useState(readRail)
  const [moreOpen, setMoreOpen] = useState(false)
  const liveRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_KEY, rail ? '1' : '0')
    } catch {
      /* private mode: ignore */
    }
  }, [rail])

  const title = pageTitleForPath(location.pathname)

  useEffect(() => {
    // DOM-only side effect: announce the new page to assistive tech.
    if (liveRef.current) {
      liveRef.current.textContent = `${title}, loaded`
    }
  }, [location.pathname, title])

  const mobilePrimary = NAV.filter((n) => n.primaryMobile)

  return (
    <div className="vi-app legacy-host" data-rail={rail ? 'true' : 'false'}>
      <a className="vi-skip-link" href="#vi-main-content">
        Skip to content
      </a>

      <nav className="vi-sidebar" aria-label="Primary">
        <NavLink to="/dashboard" className="vi-sidebar__brand" aria-label="Vinyl Intelligence, dashboard">
          <Logo variant="mark" size={38} />
          <span
            className="vi-sidebar__brand-text"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.05rem' }}
          >
            Vinyl Intelligence
          </span>
        </NavLink>

        <button
          type="button"
          className="vi-collapse-btn"
          aria-pressed={rail}
          aria-label={rail ? 'Expand the sidebar' : 'Collapse the sidebar to icons'}
          onClick={() => setRail((r) => !r)}
        >
          <Icon name="panel-left" size={15} />
          <span className="vi-collapse-btn__label">{rail ? 'Expand' : 'Collapse'}</span>
        </button>

        <div className="vi-sidebar__nav">
          <NavItems />
        </div>

        <div className="vi-sidebar__foot">
          <button type="button" className="vi-sidebar__account" onClick={() => void signOut()}>
            <span className="vi-avatar">{initials(profile?.display_name ?? null, user?.email ?? null)}</span>
            <span className="vi-sidebar__account-text">
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {profile?.display_name ?? user?.email ?? 'Account'}
              </span>
              <br />
              <span style={{ color: 'var(--text-faint)' }}>Sign out</span>
            </span>
          </button>
        </div>
      </nav>

      <div className="vi-main">
        <div className="vi-topbar">
          <span className="vi-topbar__context">{title}</span>
          <span className="vi-topbar__spacer" />
          <NavLink to="/discover" className="vi-btn vi-btn--secondary vi-btn--sm">
            <Icon name="plus" size={16} />
            Add a record
          </NavLink>
          <div className="vi-topbar__user">
            <span className="vi-avatar" aria-hidden="true">
              {initials(profile?.display_name ?? null, user?.email ?? null)}
            </span>
          </div>
        </div>

        <p ref={liveRef} className="vi-visually-hidden" role="status" aria-live="polite" />

        <main id="vi-main-content">{children}</main>
      </div>

      <nav className="vi-bottomnav" aria-label="Primary">
        {mobilePrimary.map((entry) => (
          <NavLink key={entry.to} to={entry.to} className="vi-bottomnav__item">
            <Icon name={entry.icon} size={20} />
            {entry.label}
          </NavLink>
        ))}
        <button
          type="button"
          className="vi-bottomnav__item"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="more" size={20} />
          More
        </button>
      </nav>

      {moreOpen ? (
        <>
          <div
            className="vi-drawer-backdrop"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="vi-drawer" role="dialog" aria-modal="true" aria-label="More navigation">
            {NAV.filter((n) => !n.primaryMobile).map((entry) => (
              <NavLink
                key={entry.to}
                to={entry.to}
                className="vi-navitem"
                onClick={() => setMoreOpen(false)}
              >
                <span className="vi-navitem__icon">
                  <Icon name={entry.icon} size={19} />
                </span>
                <span className="vi-navitem__label">{entry.label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              className="vi-navitem"
              onClick={() => {
                setMoreOpen(false)
                void signOut()
              }}
            >
              <span className="vi-navitem__icon">
                <Icon name="close" size={19} />
              </span>
              <span className="vi-navitem__label">Sign out</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
