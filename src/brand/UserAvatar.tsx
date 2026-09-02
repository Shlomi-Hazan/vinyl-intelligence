import { useState } from 'react'
import { avatarPath, useAvatarUrl } from '../lib/profile/avatar.ts'
import { userInitials } from './userInitials.ts'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'

/*
 * The ONE canonical user avatar. Initials are the default AND the fallback:
 * shown when there is no `avatar_path`, while the signed URL is resolving,
 * when signing fails, and when the `<img>` itself errors. A circular photo is
 * shown only once its signed URL has loaded successfully.
 *
 * Used in every place the user is represented - AppShell top-right, sidebar
 * account control (expanded + collapsed rail), and the Settings preview - so
 * there is no separate photo/initials logic anywhere else.
 */

export type UserAvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const PX: Record<UserAvatarSize, number> = { sm: 28, md: 36, lg: 44, xl: 128 }

type UserAvatarProps = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_path' | 'avatar_updated_at'> | null
  email?: string | null
  /** Needed only to mint the private-bucket signed URL for a custom photo. */
  client?: BrowserSupabaseClient | null
  size?: UserAvatarSize
  className?: string
  /**
   * Decorative next to an already-labelled control (the default). Pass a label
   * where the avatar stands alone as the user's identity.
   */
  label?: string
}

export function UserAvatar({
  profile,
  email,
  client,
  size = 'md',
  className,
  label,
}: UserAvatarProps) {
  const px = PX[size]
  const initials = userInitials(profile?.display_name, email)

  const wantsPhoto = Boolean(profile?.avatar_path && client)
  const signed = useAvatarUrl(
    client,
    wantsPhoto && profile ? avatarPath(profile.id) : null,
    profile?.avatar_updated_at ?? null,
  )
  const [imgFailed, setImgFailed] = useState('')
  const key = `${profile?.avatar_updated_at ?? ''}`
  const showImage =
    signed.status === 'ready' && signed.url !== null && imgFailed !== key

  return (
    <span
      className={['vi-avatar', className].filter(Boolean).join(' ')}
      style={{ width: px, height: px, fontSize: Math.round(px * 0.36) }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-has-photo={showImage || undefined}
    >
      {showImage ? (
        <img
          className="vi-avatar__img"
          src={signed.url as string}
          alt=""
          decoding="async"
          draggable={false}
          onError={() => setImgFailed(key)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}
