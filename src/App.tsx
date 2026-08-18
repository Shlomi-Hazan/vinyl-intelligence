import { AuthProvider } from './auth/AuthProvider.tsx'
import { AuthForm } from './auth/AuthForm.tsx'
import { useAuth } from './auth/useAuth.ts'
import type { BrowserSupabaseClient } from './lib/supabase/client.ts'
import { ProfilePanel } from './profile/ProfilePanel.tsx'

type AppProps = {
  client?: BrowserSupabaseClient
}

function AuthenticatedShell() {
  const {
    status,
    user,
    profile,
    notice,
    errorMessage,
    signIn,
    signOut,
    signUp,
    updateDisplayName,
  } = useAuth()

  if (status === 'loading') {
    return (
      <main className="app-shell">
        <section className="status-panel" aria-live="polite">
          <p className="eyebrow">Auth boundary</p>
          <h1>Vinyl Intelligence</h1>
          <p className="lede">Checking your session...</p>
        </section>
      </main>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <main className="app-shell">
        <AuthForm
          errorMessage={errorMessage}
          notice={notice}
          onSignIn={signIn}
          onSignUp={signUp}
        />
      </main>
    )
  }

  if (status === 'profile_missing') {
    return (
      <main className="app-shell">
        <section className="status-panel" role="alert">
          <p className="eyebrow">Profile boundary</p>
          <h1>Profile setup needs attention</h1>
          <p className="lede">
            Your account is signed in, but its protected profile row was not
            found. The app will not create one from the browser.
          </p>
          <button onClick={signOut} type="button">
            Sign out
          </button>
        </section>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="app-shell">
        <section className="status-panel" role="alert">
          <p className="eyebrow">Auth boundary</p>
          <h1>Something needs attention</h1>
          <p className="lede">{errorMessage ?? 'Please try again.'}</p>
          {user ? (
            <button onClick={signOut} type="button">
              Sign out
            </button>
          ) : null}
        </section>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="app-shell">
        <section className="status-panel" aria-live="polite">
          <p className="eyebrow">Profile boundary</p>
          <h1>Loading profile</h1>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <ProfilePanel
        email={user?.email ?? null}
        errorMessage={errorMessage}
        notice={notice}
        onSaveDisplayName={updateDisplayName}
        onSignOut={signOut}
        profile={profile}
      />
    </main>
  )
}

function App({ client }: AppProps) {
  return (
    <AuthProvider client={client}>
      <AuthenticatedShell />
    </AuthProvider>
  )
}

export default App
