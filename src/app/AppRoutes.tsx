import { Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import { FullPageState } from './FullPageState.tsx'
import { AppShell } from './AppShell.tsx'
import { CollectionDataProvider } from './CollectionDataProvider.tsx'
import { Button } from '../ui/primitives.tsx'
import { Logo } from '../brand/Logo.tsx'

/*
 * Route-level code splitting (Phase B). Every page is lazy so a public landing /
 * auth visit does not eagerly download the authenticated application, and vice
 * versa. Simple React.lazy + Suspense on the existing BrowserRouter - no data
 * router, no code-splitting library. Named exports are adapted to lazy's
 * default-export contract inline.
 */
const LandingPage = lazy(() =>
  import('../pages/LandingPage.tsx').then((m) => ({ default: m.LandingPage })),
)
const AuthPage = lazy(() =>
  import('../pages/AuthPage.tsx').then((m) => ({ default: m.AuthPage })),
)
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage.tsx').then((m) => ({ default: m.DashboardPage })),
)
const CollectionPage = lazy(() =>
  import('../pages/CollectionPage.tsx').then((m) => ({ default: m.CollectionPage })),
)
const AlbumDetailPage = lazy(() =>
  import('../pages/AlbumDetailPage.tsx').then((m) => ({ default: m.AlbumDetailPage })),
)
const DiscoverPage = lazy(() =>
  import('../pages/DiscoverPage.tsx').then((m) => ({ default: m.DiscoverPage })),
)
const ScanPage = lazy(() =>
  import('../pages/ScanPage.tsx').then((m) => ({ default: m.ScanPage })),
)
const VinPage = lazy(() =>
  import('../pages/VinPage.tsx').then((m) => ({ default: m.VinPage })),
)
const HistoryPage = lazy(() =>
  import('../pages/HistoryPage.tsx').then((m) => ({ default: m.HistoryPage })),
)
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })),
)
const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage.tsx').then((m) => ({ default: m.NotFoundPage })),
)

function RouteLoading() {
  return (
    <div className="vi-route-loading" role="status" aria-live="polite">
      <Logo variant="mark" size={40} className="vi-route-loading__spin" />
      <span className="vi-hint">Loading...</span>
    </div>
  )
}

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
    <Suspense fallback={<RouteLoading />}>
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
    </Suspense>
  )
}
