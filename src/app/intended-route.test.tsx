import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { renderApp } from '../test/renderApp.tsx'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'

vi.mock('../lib/supabase/collection.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/collection.ts')>()
  return { ...actual, loadCollection: vi.fn(async () => []) }
})
vi.mock('../lib/supabase/listeningEvents.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/supabase/listeningEvents.ts')>()
  return { ...actual, loadListeningEvents: vi.fn(async () => []) }
})

const user = { id: 'u-1', email: 'a@example.test' } as User
const session = { user, access_token: 't', refresh_token: 'r' } as Session
const profile: Profile = { id: 'u-1', display_name: 'Ana', avatar_path: null, avatar_updated_at: null, created_at: '', updated_at: '' }

type AuthCb = (event: AuthChangeEvent, s: Session | null) => void

function fakeClient() {
  let cb: AuthCb | null = null
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
  }
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn((c: AuthCb) => {
        cb = c
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithPassword: vi.fn(async () => ({
        data: { session, user },
        error: null,
      })),
      signUp: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => query),
    __login() {
      cb?.('SIGNED_IN', session)
    },
  }
  return client as unknown as BrowserSupabaseClient & { __login: () => void }
}

async function signInOnAuthPage() {
  const u = userEvent.setup()
  await u.type(await screen.findByLabelText('Email'), 'a@example.test')
  await u.type(screen.getByLabelText('Password'), 'password123')
  await u.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('intended-route return after login', () => {
  it('an unauthenticated protected-route visit lands on /auth', async () => {
    renderApp({ client: fakeClient(), route: '/collection' })
    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Your shelf is empty')).not.toBeInTheDocument()
  })

  it('after login the exact intended route is restored (not /dashboard)', async () => {
    const client = fakeClient()
    renderApp({ client, route: '/collection' })

    await screen.findByLabelText('Email')
    await signInOnAuthPage()

    // restored to /collection, NOT the dashboard
    await waitFor(() =>
      expect(screen.getByText('Your shelf is empty')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('heading', { name: /Welcome back/ })).not.toBeInTheDocument()
  })

  it('a direct login with no intended route goes to /dashboard', async () => {
    const client = fakeClient()
    renderApp({ client, route: '/auth' })

    await screen.findByLabelText('Email')
    await signInOnAuthPage()

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Welcome back/ }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText('Your shelf is empty')).not.toBeInTheDocument()
  })

  // A tampered / external `location.state.from` is rejected by
  // `safeInternalPath` (see routing.test.ts) so the redirect falls back to
  // `/dashboard` - no open redirect is possible.
})
