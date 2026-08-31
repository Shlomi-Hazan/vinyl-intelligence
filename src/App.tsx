import { useState } from 'react'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { AuthForm } from './auth/AuthForm.tsx'
import { useAuth } from './auth/useAuth.ts'
import { CatalogPanel } from './catalog/CatalogPanel.tsx'
import { CollectionPanel } from './collection/CollectionPanel.tsx'
import { CuratorPanel } from './curator/CuratorPanel.tsx'
import type { BrowserSupabaseClient } from './lib/supabase/client.ts'
import { ProfilePanel } from './profile/ProfilePanel.tsx'

type AppProps = {
  client?: BrowserSupabaseClient
}

function AuthenticatedShell() {
  const [collectionRefreshKey, setCollectionRefreshKey] = useState(0)
  const {
    status,
    client,
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
      <div className="authenticated-layout">
        <ProfilePanel
          email={user?.email ?? null}
          errorMessage={errorMessage}
          notice={notice}
          onSaveDisplayName={updateDisplayName}
          onSignOut={signOut}
          profile={profile}
        />
        {client && user ? (
          <>
            <CuratorPanel key={`curator-${user.id}`} client={client} />
            <CatalogPanel
              key={`catalog-${user.id}`}
              client={client}
              onCatalogItemAdded={() =>
                setCollectionRefreshKey((current) => current + 1)
              }
              userId={user.id}
            />
            <CollectionPanel
              key={`collection-${user.id}`}
              client={client}
              refreshKey={collectionRefreshKey}
              userId={user.id}
            />
          </>
        ) : null}
      </div>
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
