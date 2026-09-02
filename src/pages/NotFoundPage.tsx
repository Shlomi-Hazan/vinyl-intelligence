import { Link } from 'react-router-dom'
import { Logo } from '../brand/Logo.tsx'

export function NotFoundPage() {
  return (
    <div className="vi-fullpage">
      <div className="vi-fullpage__card">
        <Logo variant="mark" size={48} />
        <h1 style={{ fontSize: '1.6rem' }}>This groove skipped</h1>
        <p className="vi-hint">
          That page is not in the collection. Let's get you back to the music.
        </p>
        <Link to="/dashboard" className="vi-btn vi-btn--primary">
          Back to your dashboard
        </Link>
      </div>
    </div>
  )
}
