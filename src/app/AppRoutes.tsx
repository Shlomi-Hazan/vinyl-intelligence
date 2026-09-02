import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import { FullPageState } from './FullPageState.tsx'
import { AppShell } from './AppShell.tsx'
import { CollectionDataProvider } from './CollectionDataProvider.tsx'
import { Button } from '../ui/primitives.tsx'
import { LandingPage } from '../pages/LandingPage.tsx'
import { AuthPage } from '../pages/AuthPage.tsx'
import { DashboardPage } from '../pages/DashboardPage.tsx'
import { CollectionPage } from '../pages/CollectionPage.tsx'
import { AlbumDetailPage } from '../pages/AlbumDetailPage.tsx'
import { DiscoverPage } from '../pages/DiscoverPage.tsx'
import { ScanPage } from '../pages/ScanPage.tsx'
import { VinPage } from '../pages/VinPage.tsx'
import { HistoryPage } from '../pages/HistoryPage.tsx'
import { SettingsPage } from '../pages/SettingsPage.tsx'
import { NotFoundPage } from '../pages/NotFoundPage.tsx'

/**
 * The full route table + auth guards. Rendered inside a router
 * (BrowserRouter in the app, MemoryRouter in tests).
 *
 * Auth rules:
 * - `/` is always public.
 * - `/auth` redirects to `/dashboard` when already authenticated.
 * - every other route is behind the authenticated layout; an unauthenticated
 *   visit redirects to `/auth` (remembering where they were headed).
 * - `CollectionDataProvider` is keyed by `user.id` so a user change remounts it
 *   with empty state - no previous user's collection can render.
 */
export function AppRoutes() {
  const { status, client, user, errorMessage, signOut } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <FullPageState title="Vinyl Intelligence" description="Checking your session..." />
    )
  }

  if (status === 'error') {
    return (
      <FullPageState
        tone="error"
        title="Something needs attention"
        description={errorMessage ?? 'Please try again.'}
        action={
          user ? (
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          ) : null
        }
      />
    )
  }

  if (status === 'profile_missing') {
    return (
      <FullPageState
        tone="error"
        title="Profile setup needs attention"
        description="Your account is signed in, but its protected profile row was not found. The app will not create one from the browser."
        action={
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        }
      />
    )
  }

  const authed = status === 'authenticated'

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/auth"
        element={authed ? <Navigate to="/dashboard" replace /> : <AuthPage />}
      />

      <Route
        element={
          authed && client && user ? (
            <CollectionDataProvider key={user.id} client={client} userId={user.id}>
              <AppShell>
                <Outlet />
              </AppShell>
            </CollectionDataProvider>
          ) : (
            <Navigate to="/auth" replace state={{ from: location.pathname }} />
          )
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/collection/:id" element={<AlbumDetailPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/vin" element={<VinPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
