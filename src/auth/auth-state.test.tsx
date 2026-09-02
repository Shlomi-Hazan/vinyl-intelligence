import { act, screen, waitFor, within } from '@testing-library/react'
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

const userA = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'user-a@example.test',
} as User

const sessionA = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: userA,
} as Session

const userB = {
  id: '00000000-0000-4000-8000-0000000000b2',
  email: 'user-b@example.test',
} as User

const sessionB = {
  access_token: 'test-access-token-b',
  refresh_token: 'test-refresh-token-b',
  expires_in: 3600,
  token_type: 'bearer',
  user: userB,
} as Session

const profileA: Profile = {
  id: userA.id,
  display_name: 'Alice',
  avatar_path: null,
  avatar_updated_at: null,
  created_at: '2026-08-18T00:00:00.000Z',
  updated_at: '2026-08-18T00:00:00.000Z',
}

type FakeClientOptions = {
  session?: Session | null
  profile?: Profile | null
  getSessionError?: Error
  signInError?: Error
  signInSession?: Session | null
  signOutError?: Error
  signUpError?: Error
  signUpSession?: Session | null
  updateError?: Error
}

type AuthStateCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void

function createFakeClient(options: FakeClientOptions = {}) {
  let updatePayload: { display_name?: string | null } | null = null
  let authStateCallback: AuthStateCallback | null = null
  const unsubscribe = vi.fn()

  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: options.profile ?? null,
      error: null,
    })),
    update: vi.fn((payload: { display_name?: string | null }) => {
      updatePayload = payload
      return query
    }),
    single: vi.fn(async () => {
      if (options.updateError) {
        return { data: null, error: options.updateError }
      }
      return {
        data: {
          ...(options.profile ?? profileA),
          display_name: updatePayload?.display_name ?? null,
        },
        error: null,
      }
    }),
  }

  const client = {
    auth: {
      getSession: vi.fn(async () => {
        if (options.getSessionError) {
          return { data: { session: null }, error: options.getSessionError }
        }
        return { data: { session: options.session ?? null }, error: null }
      }),
      onAuthStateChange: vi.fn((callback: AuthStateCallback) => {
        authStateCallback = callback
        return { data: { subscription: { unsubscribe } } }
      }),
      signInWithPassword: vi.fn(async () => ({
        data: {
          session: options.signInError ? null : (options.signInSession ?? sessionA),
          user: options.signInError ? null : userA,
        },
        error: options.signInError ?? null,
      })),
      signOut: vi.fn(async () => ({ error: options.signOutError ?? null })),
      signUp: vi.fn(async () => ({
        data: {
          session: options.signUpError ? null : (options.signUpSession ?? null),
          user: options.signUpError ? null : userA,
        },
        error: options.signUpError ?? null,
      })),
    },
    from: vi.fn(() => query),
    __emitAuthStateChange(nextSession: Session | null) {
      if (!authStateCallback) {
        throw new Error('Auth state callback was not registered.')
      }
      authStateCallback(nextSession ? 'SIGNED_IN' : 'SIGNED_OUT', nextSession)
    },
    __query: query,
  }

  return client as unknown as BrowserSupabaseClient & {
    __emitAuthStateChange: (nextSession: Session | null) => void
    __query: typeof query
  }
}

describe('auth and profile workflow (routed)', () => {
  it('shows a loading auth state before the initial session resolves', () => {
    renderApp({ client: createFakeClient(), route: '/settings' })
    expect(screen.getByText('Checking your session...')).toBeInTheDocument()
  })

  it('signs in with email and password and lands on the authenticated app', async () => {
    const client = createFakeClient({ profile: profileA, signInSession: sessionA })
    const user = userEvent.setup()

    renderApp({ client, route: '/auth' })

    await user.type(await screen.findByLabelText('Email'), 'user-a@example.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Welcome back/ }),
      ).toBeInTheDocument()
    })
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user-a@example.test',
      password: 'password123',
    })
  })

  it('shows the profile shell at /settings for an authenticated user', async () => {
    renderApp({
      client: createFakeClient({ session: sessionA, profile: profileA }),
      route: '/settings',
    })

    expect(await screen.findByText('Protected profile')).toBeInTheDocument()
    expect(screen.getByText('user-a@example.test')).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toBeInTheDocument()
  })

  it('shows a collection-first empty state at /collection (not the CRUD form)', async () => {
    const user = userEvent.setup()
    renderApp({
      client: createFakeClient({ session: sessionA, profile: profileA }),
      route: '/collection',
    })

    // collection-first: an empty shelf with truthful actions, no big form
    expect(await screen.findByText('Your shelf is empty')).toBeInTheDocument()
    const onboard = screen
      .getByText('Your shelf is empty')
      .closest('.vi-onboard') as HTMLElement
    expect(
      within(onboard).getByRole('link', { name: 'Add a record' }),
    ).toHaveAttribute('href', '/discover')
    expect(onboard.querySelector('img.vi-vinny')).toHaveAttribute(
      'src',
      '/vinny/vinny-empty.png',
    )
    expect(screen.queryByLabelText('Artist')).not.toBeInTheDocument()

    // manual CRUD is still available, behind a disclosure
    await user.click(screen.getByRole('button', { name: 'Add a record manually' }))
    expect(await screen.findByLabelText('Artist')).toBeInTheDocument()
  })

  it('shows the catalog search host at /discover', async () => {
    renderApp({
      client: createFakeClient({ session: sessionA, profile: profileA }),
      route: '/discover',
    })

    expect(
      await screen.findByRole('heading', { name: 'Discover', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'Search the catalog' }),
    ).toBeInTheDocument()
  })

  it('shows the confirmation-pending state after sign-up without a session', async () => {
    const client = createFakeClient({ signUpSession: null })
    const user = userEvent.setup()

    renderApp({ client, route: '/auth' })

    await user.click(await screen.findByRole('tab', { name: 'Create account' }))
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          'Check your email to confirm your account before signing in.',
        ),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected profile')).not.toBeInTheDocument()
  })

  it('keeps the sign-in form usable after a failed password sign-in', async () => {
    const client = createFakeClient({
      signInError: new Error('Invalid login credentials'),
    })
    const user = userEvent.setup()

    renderApp({ client, route: '/auth' })

    await user.type(await screen.findByLabelText('Email'), 'user-a@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.queryByText('Something needs attention')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(2)
  })

  it('keeps signup and sign-in controls available after failed signup', async () => {
    const client = createFakeClient({
      signUpError: new Error('User already registered'),
    })
    const user = userEvent.setup()

    renderApp({ client, route: '/auth' })

    await user.click(await screen.findByRole('tab', { name: 'Create account' }))
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(screen.getByText('User already registered')).toBeInTheDocument()
    })
    // both modes still reachable
    expect(screen.getByRole('tab', { name: 'Sign in' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('signs out from the settings profile shell', async () => {
    const client = createFakeClient({ session: sessionA, profile: profileA })
    const user = userEvent.setup()

    renderApp({ client, route: '/settings' })

    await waitFor(() => {
      expect(screen.getByText('Protected profile')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
  })

  it('returns to /auth when Supabase emits a signed-out auth state', async () => {
    const client = createFakeClient({ session: sessionA, profile: profileA })

    renderApp({ client, route: '/collection' })

    expect(await screen.findByText('Your shelf is empty')).toBeInTheDocument()

    act(() => {
      client.__emitAuthStateChange(null)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
    expect(screen.queryByText('Your shelf is empty')).not.toBeInTheDocument()
  })

  it('keeps the profile visible after a failed sign-out and allows retry', async () => {
    const client = createFakeClient({
      session: sessionA,
      profile: profileA,
      signOutError: new Error('Sign-out service unavailable'),
    })
    const user = userEvent.setup()

    renderApp({ client, route: '/settings' })

    await waitFor(() => {
      expect(screen.getByText('Protected profile')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(screen.getByText('Sign-out service unavailable')).toBeInTheDocument()
    })
    expect(screen.getByText('Protected profile')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(client.auth.signOut).toHaveBeenCalledTimes(2)
  })

  it('validates display-name length before saving', async () => {
    renderApp({
      client: createFakeClient({ session: sessionA, profile: profileA }),
      route: '/settings',
    })
    const user = userEvent.setup()

    const input = await screen.findByLabelText('Display name')
    await user.clear(input)
    await user.type(input, 'a'.repeat(81))

    expect(
      screen.getByText('Display name must be 80 characters or fewer.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
  })

  it('trims and saves display-name updates through the profile service', async () => {
    const client = createFakeClient({ session: sessionA, profile: profileA })
    const user = userEvent.setup()

    renderApp({ client, route: '/settings' })

    const input = await screen.findByLabelText('Display name')
    await user.clear(input)
    await user.type(input, ' Alice Updated ')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => {
      expect(client.__query.update).toHaveBeenCalledWith({
        display_name: 'Alice Updated',
      })
    })
  })

  it('keeps the profile visible after a failed profile update', async () => {
    const client = createFakeClient({
      session: sessionA,
      profile: profileA,
      updateError: new Error('Profile update rejected'),
    })
    const user = userEvent.setup()

    renderApp({ client, route: '/settings' })

    const input = await screen.findByLabelText('Display name')
    await user.clear(input)
    await user.type(input, 'Alice Updated')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => {
      expect(screen.getByText('Profile update rejected')).toBeInTheDocument()
    })
    expect(screen.getByText('Protected profile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
  })

  it('shows a controlled missing-profile state without browser-side creation', async () => {
    const client = createFakeClient({ session: sessionA, profile: null })

    renderApp({ client, route: '/dashboard' })

    await waitFor(() => {
      expect(
        screen.getByText('Profile setup needs attention'),
      ).toBeInTheDocument()
    })
    expect(client.__query.update).not.toHaveBeenCalled()
  })

  it('remounts the user-scoped collection UI when the authenticated user changes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = createFakeClient({ session: sessionA, profile: profileA })
    const user = userEvent.setup()

    renderApp({ client, route: '/collection' })

    await user.click(
      await screen.findByRole('button', { name: 'Add a record manually' }),
    )
    await user.type(await screen.findByLabelText('Artist'), 'Draft by user A')
    expect(screen.getByLabelText('Artist')).toHaveValue('Draft by user A')

    act(() => {
      client.__emitAuthStateChange(sessionB)
    })

    // the whole user-scoped subtree remounts: the manual disclosure resets and
    // user A's draft is not shown to user B
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Add a record manually' }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Artist')).not.toBeInTheDocument()
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes('same key'),
      ),
    ).toBe(false)
    consoleError.mockRestore()
  })

  it('surfaces Supabase auth errors without fabricating a session', async () => {
    const client = createFakeClient({
      getSessionError: new Error('Auth service unavailable'),
    })

    renderApp({ client, route: '/dashboard' })

    await waitFor(() => {
      expect(screen.getByText('Auth service unavailable')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected profile')).not.toBeInTheDocument()
  })
})
