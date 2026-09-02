import { Logo } from '../brand/Logo.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { AuthForm } from '../auth/AuthForm.tsx'
import { useAuth } from '../auth/useAuth.ts'

/*
 * Phase A: hosts the existing AuthForm inside the brand frame. Supabase Auth
 * behaviour is unchanged. The full split-panel design is Phase B.
 */
export function AuthPage() {
  const { signIn, signUp, notice, errorMessage } = useAuth()

  return (
    <div className="vi-auth legacy-host">
      <div className="vi-auth__card">
        <div className="vi-auth__brand">
          <Logo variant="mark" size={36} />
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              Vinyl Intelligence
            </p>
            <p className="vi-hint">Your collection, made intelligent.</p>
          </div>
        </div>

        <AuthForm
          onSignIn={signIn}
          onSignUp={signUp}
          notice={notice}
          errorMessage={errorMessage}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderTop: '1px solid var(--border)',
            paddingTop: 'var(--space-3)',
          }}
        >
          <VinAvatar size={32} />
          <p className="vi-hint" style={{ margin: 0 }}>
            VIN is ready once you sign in.
          </p>
        </div>
      </div>
    </div>
  )
}
