import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserAvatar } from './UserAvatar.tsx'
import { __clearAvatarUrlCache } from '../lib/profile/avatar.ts'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'

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

function client(signedUrl: string | null): BrowserSupabaseClient {
  return {
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(async () =>
          signedUrl
            ? { data: { signedUrl }, error: null }
            : { data: null, error: new Error('no') },
        ),
      }),
    },
  } as unknown as BrowserSupabaseClient
}

beforeEach(() => __clearAvatarUrlCache())
afterEach(() => vi.restoreAllMocks())

describe('UserAvatar', () => {
  it('shows initials when there is no avatar_path', () => {
    render(<UserAvatar profile={profile()} email="ada@x.test" label="You" />)
    expect(screen.getByLabelText('You')).toHaveTextContent('AL')
    expect(screen.queryByRole('img', { hidden: true })).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the photo once the signed URL resolves', async () => {
    render(
      <UserAvatar
        profile={profile({ avatar_path: 'u-1/avatar.webp', avatar_updated_at: 't1' })}
        email="ada@x.test"
        client={client('https://signed.example/a.webp')}
        label="You"
      />,
    )
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull())
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://signed.example/a.webp',
    )
  })

  it('falls back to initials when the <img> errors', async () => {
    render(
      <UserAvatar
        profile={profile({ avatar_path: 'u-1/avatar.webp', avatar_updated_at: 't1' })}
        email="ada@x.test"
        client={client('https://signed.example/broken.webp')}
        label="You"
      />,
    )
    const img = await waitFor(() => {
      const el = document.querySelector('img')
      expect(el).not.toBeNull()
      return el as HTMLImageElement
    })
    fireEvent.error(img)
    await waitFor(() => expect(document.querySelector('img')).toBeNull())
    expect(screen.getByLabelText('You')).toHaveTextContent('AL')
  })

  it('falls back to initials when signing fails', async () => {
    render(
      <UserAvatar
        profile={profile({ avatar_path: 'u-1/avatar.webp', avatar_updated_at: 't1' })}
        email="ada@x.test"
        client={client(null)}
        label="You"
      />,
    )
    await waitFor(() =>
      expect(screen.getByLabelText('You')).toHaveTextContent('AL'),
    )
    expect(document.querySelector('img')).toBeNull()
  })
})
