import { Link } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { useAuth } from '../auth/useAuth.ts'

/*
 * Phase A: structural host only. NO statistics - the real dashboard (stat
 * cards, recent activity, quick-VIN, decade/genre insight) is Phase B and will
 * read from CollectionDataProvider.
 */
export function DashboardPage() {
  const { profile } = useAuth()
  const name = profile?.display_name?.trim()

  return (
    <div className="vi-page">
      <PageHeader
        eyebrow="Home"
        title={name ? `Welcome back, ${name}` : 'Welcome back'}
      />

      <p className="vi-hint" style={{ marginBottom: 'var(--space-6)' }}>
        Your personal record library. Jump to a section below - the full
        dashboard with your collection stats and recent activity arrives next.
      </p>

      <nav className="vi-quicknav" aria-label="Quick navigation">
        <Link to="/collection">
          <strong>Your collection</strong>
          <span>Browse, search, filter, rate, and mark records played.</span>
        </Link>
        <Link to="/discover">
          <strong>Add a record</strong>
          <span>Search the MusicBrainz catalog and add it to your shelf.</span>
        </Link>
        <Link to="/scan">
          <strong>Scan a cover</strong>
          <span>Photograph a sleeve and confirm the match.</span>
        </Link>
        <Link to="/vin">
          <strong>Ask VIN</strong>
          <span>Get a recommendation from records you own.</span>
        </Link>
        <Link to="/history">
          <strong>Listening history</strong>
          <span>See what you have played and when.</span>
        </Link>
      </nav>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          alignItems: 'center',
          marginTop: 'var(--space-6)',
          padding: 'var(--space-4)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--surface)',
        }}
      >
        <VinAvatar size={44} />
        <p className="vi-hint" style={{ margin: 0 }}>
          Not sure what to play? <Link to="/vin">Ask VIN</Link>.
        </p>
      </div>
    </div>
  )
}
