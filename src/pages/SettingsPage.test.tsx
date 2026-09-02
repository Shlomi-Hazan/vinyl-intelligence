import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { SettingsPage } from './SettingsPage.tsx'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext.ts'
import { ToastProvider } from '../ui/ToastProvider.tsx'
import { __clearAvatarUrlCache } from '../lib/profile/avatar.ts'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'

const uploadAvatar = vi.fn()
const removeAvatar = vi.fn()

vi.mock('../lib/profile/avatar.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/profile/avatar.ts')>()
  return {
    ...actual,
    uploadAvatar: (...a: unknown[]) => uploadAvatar(...a),
    removeAvatar: (...a: unknown[]) => removeAvatar(...a),
  }
})

const client = {
  storage: { from: () => ({ createSignedUrl: vi.fn(async () => ({ data: null, error: new Error('x') })) }) },
} as unknown as BrowserSupabaseClient

const user = { id: 'u-1', email: 'ada@x.test' } as User

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'u-1',
    display_name: 'Ada Lovelace',
    avatar_path: null,
    avatar_updated_at: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function renderSettings(over: Partial<AuthContextValue> = {}) {
  const auth = {
    status: 'authenticated',
    client,
    user,
    profile: profile(),
    session: null,
    notice: null,
    errorMessage: null,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(async () => {}),
    updateDisplayName: vi.fn(async () => {}),
    refreshProfile: vi.fn(async () => {}),
    ...over,
  } as unknown as AuthContextValue

  render(
    <AuthContext.Provider value={auth}>
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>,
  )
  return auth
}

beforeEach(() => {
  vi.clearAllMocks()
  __clearAvatarUrlCache()
})
afterEach(() => vi.restoreAllMocks())

describe('SettingsPage', () => {
  it('shows initials by default and the read-only account email', () => {
    renderSettings()
    expect(screen.getByLabelText('Your profile photo')).toHaveTextContent('AL')
    expect(screen.getByText('ada@x.test')).toBeInTheDocument()
    expect(screen.getByText(/can’t be changed here/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument()
    // no photo yet -> no Remove
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
  })

  it('uploads a photo and refreshes the shared profile state', async () => {
    uploadAvatar.mockResolvedValue({ path: 'u-1/avatar.webp', updatedAt: 't' })
    const auth = renderSettings()

    const file = new File([new Uint8Array(8)], 'me.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.setup().upload(input, file)

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledWith(expect.anything(), 'u-1', file))
    expect(auth.refreshProfile).toHaveBeenCalled()
  })

  it('offers Remove when a photo exists and calls removeAvatar + refresh', async () => {
    removeAvatar.mockResolvedValue(undefined)
    const auth = renderSettings({
      profile: profile({ avatar_path: 'u-1/avatar.webp', avatar_updated_at: 't1' }),
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove photo' }))
    await waitFor(() => expect(removeAvatar).toHaveBeenCalledWith(expect.anything(), 'u-1'))
    expect(auth.refreshProfile).toHaveBeenCalled()
  })

  it('surfaces an upload failure without claiming success', async () => {
    uploadAvatar.mockRejectedValue(new Error('storage is full'))
    const auth = renderSettings()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent
      .setup()
      .upload(input, new File([new Uint8Array(8)], 'me.png', { type: 'image/png' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('storage is full'))
    expect(auth.refreshProfile).not.toHaveBeenCalled()
  })

  it('keeps the display-name save and sign-out actions', async () => {
    const auth = renderSettings()
    const u = userEvent.setup()

    const name = screen.getByLabelText('Display name')
    await u.clear(name)
    await u.type(name, 'Grace Hopper')
    await u.click(screen.getByRole('button', { name: 'Save display name' }))
    await waitFor(() => expect(auth.updateDisplayName).toHaveBeenCalledWith('Grace Hopper'))

    await u.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
  })
})
