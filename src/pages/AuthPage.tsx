import { Logo } from '../brand/Logo.tsx'
import { Vinny } from '../brand/Vinny.tsx'
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
            fontSize: 'clamp(2rem, 3.2vw, 3rem)',
            lineHeight: 1.08,
          }}
        >
          Your collection, made intelligent.
        </p>
        <p>
          Sign in to browse your shelf, scan a cover to add a record, and ask
          VIN what to play - always from music you own.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Vinny state="idle" size={72} />
          <p className="vi-hint" style={{ margin: 0 }}>
            VIN is ready the moment you are in.
          </p>
        </div>
      </div>

      <div className="vi-authpage__mobilebar">
        <Logo variant="mark" size={34} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.05rem' }}>
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
