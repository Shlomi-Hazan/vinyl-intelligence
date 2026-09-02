import { Logo } from '../brand/Logo.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { AuthCard } from '../auth/AuthCard.tsx'
import { useAuth } from '../auth/useAuth.ts'

/*
 * Phase B: the redesigned auth screen. Split brand panel + focused card on
 * md+, a compact branded strip on mobile. Supabase auth semantics are
 * unchanged - AuthCard calls the same `signIn` / `signUp` from useAuth, and
 * AppRoutes still redirects an authenticated visit to /dashboard (or the
 * remembered target).
 */
export function AuthPage() {
  const { signIn, signUp, notice, errorMessage } = useAuth()

  return (
    <div className="vi-authpage">
      <div className="vi-authpage__brand">
        <Logo variant="wordmark" />
        <p
          className="vi-authpage__brand-line"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
            lineHeight: 1.1,
            color: 'var(--text)',
          }}
        >
          Your collection, made intelligent.
        </p>
        <p>
          Sign in to browse your shelf, scan a cover to add a record, and ask
          VIN what to play - always from music you own.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <VinAvatar size={40} />
          <p className="vi-hint" style={{ margin: 0 }}>
            VIN is ready the moment you are in.
          </p>
        </div>
      </div>

      <div className="vi-authpage__mobilebar">
        <Logo variant="mark" size={30} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          Vinyl Intelligence
        </span>
      </div>

      <div className="vi-authpage__panel">
        <AuthCard
          onSignIn={signIn}
          onSignUp={signUp}
          notice={notice}
          errorMessage={errorMessage}
        />
      </div>
    </div>
  )
}
