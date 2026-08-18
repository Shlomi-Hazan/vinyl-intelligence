import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import App from '../App.tsx'
import type {
  BrowserSupabaseClient,
  Profile,
} from '../lib/supabase/client.ts'

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

const profileA: Profile = {
  id: userA.id,
  display_name: 'Alice',
  created_at: '2026-08-18T00:00:00.000Z',
  updated_at: '2026-08-18T00:00:00.000Z',
}

type FakeClientOptions = {
  session?: Session | null
  profile?: Profile | null
  getSessionError?: Error
  signInSession?: Session | null
  signUpSession?: Session | null
}

function createFakeClient(options: FakeClientOptions = {}) {
  let updatePayload: { display_name?: string | null } | null = null
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
    single: vi.fn(async () => ({
      data: {
        ...(options.profile ?? profileA),
        display_name: updatePayload?.display_name ?? null,
      },
      error: null,
    })),
  }

  const client = {
    auth: {
      getSession: vi.fn(async () => {
        if (options.getSessionError) {
          return { data: { session: null }, error: options.getSessionError }
        }

        return { data: { session: options.session ?? null }, error: null }
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe } },
      })),
      signInWithPassword: vi.fn(async () => ({
        data: {
          session: options.signInSession ?? sessionA,
          user: userA,
        },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({
        data: {
          session: options.signUpSession ?? null,
          user: userA,
        },
        error: null,
      })),
    },
    from: vi.fn(() => query),
    __query: query,
  }

  return client as unknown as BrowserSupabaseClient & {
    __query: typeof query
  }
}

describe('auth and profile workflow', () => {
  it('shows a loading auth state before the initial session resolves', () => {
    const client = createFakeClient()

    render(<App client={client} />)

    expect(screen.getByText('Checking your session...')).toBeInTheDocument()
  })

  it('signs in with email and password and renders the protected profile shell', async () => {
    const client = createFakeClient({
      profile: profileA,
      signInSession: sessionA,
    })
    const user = userEvent.setup()

    render(<App client={client} />)

    await user.type(await screen.findByLabelText('Email'), 'user-a@example.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByText('user-a@example.test')).toBeInTheDocument()
    })

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user-a@example.test',
      password: 'password123',
    })
  })

  it('shows the confirmation-pending state after sign-up without a session', async () => {
    const client = createFakeClient({ signUpSession: null })
    const user = userEvent.setup()

    render(<App client={client} />)

    await user.type(await screen.findByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(
        screen.getByText('Check your email to confirm your account before signing in.'),
      ).toBeInTheDocument()
    })

    expect(screen.queryByText('Protected profile')).not.toBeInTheDocument()
  })

  it('signs out from an authenticated profile shell', async () => {
    const client = createFakeClient({ session: sessionA, profile: profileA })
    const user = userEvent.setup()

    render(<App client={client} />)

    await waitFor(() => {
      expect(screen.getByText('Protected profile')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
  })

  it('validates display-name length before saving', async () => {
    const client = createFakeClient({ session: sessionA, profile: profileA })
    const user = userEvent.setup()

    render(<App client={client} />)

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

    render(<App client={client} />)

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

  it('shows a controlled missing-profile state without browser-side creation', async () => {
    const client = createFakeClient({ session: sessionA, profile: null })

    render(<App client={client} />)

    await waitFor(() => {
      expect(
        screen.getByText('Profile setup needs attention'),
      ).toBeInTheDocument()
    })

    expect(client.__query.update).not.toHaveBeenCalled()
  })

  it('surfaces Supabase auth errors without fabricating a session', async () => {
    const client = createFakeClient({
      getSessionError: new Error('Auth service unavailable'),
    })

    render(<App client={client} />)

    await waitFor(() => {
      expect(screen.getByText('Auth service unavailable')).toBeInTheDocument()
    })

    expect(screen.queryByText('Protected profile')).not.toBeInTheDocument()
  })
})
