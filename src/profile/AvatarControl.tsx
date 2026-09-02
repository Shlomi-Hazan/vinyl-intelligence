import { useId, useRef, useState } from 'react'
import { Button } from '../ui/primitives.tsx'
import { UserAvatar } from '../brand/UserAvatar.tsx'
import {
  AvatarError,
  AVATAR_ACCEPTED_INPUT_TYPES,
  removeAvatar,
  uploadAvatar,
} from '../lib/profile/avatar.ts'
import type { BrowserSupabaseClient, Profile } from '../lib/supabase/client.ts'

/*
 * Profile photo management. Optional throughout: initials are the default and
 * the fallback. On success we ask the caller to re-fetch the authoritative
 * profile (refreshProfile) so every UserAvatar updates without a reload. A
 * signed URL is never shown here, stored, or logged - only pass/fail state.
 */

type Props = {
  client: BrowserSupabaseClient
  userId: string
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_path' | 'avatar_updated_at'>
  email: string | null
  /** Re-fetch the profile row into shared auth state. */
  onChanged: () => Promise<void> | void
}

type Phase = 'idle' | 'uploading' | 'removing' | 'error'

function messageFor(error: unknown, fallback: string): string {
  return error instanceof AvatarError
    ? error.message
    : error instanceof Error && error.message
      ? error.message
      : fallback
}

export function AvatarControl({ client, userId, profile, email, onChanged }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const hasPhoto = Boolean(profile.avatar_path)
  const busy = phase === 'uploading' || phase === 'removing'

  async function handleFile(file: File | undefined) {
    if (!file) {
      return
    }
    setPhase('uploading')
    setMessage(null)
    try {
      await uploadAvatar(client, userId, file)
      await onChanged()
      setPhase('idle')
    } catch (error) {
      setPhase('error')
      setMessage(messageFor(error, 'Could not update your photo. Try again.'))
    } finally {
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  async function handleRemove() {
    setPhase('removing')
    setMessage(null)
    try {
      await removeAvatar(client, userId)
      await onChanged()
      setPhase('idle')
    } catch (error) {
      setPhase('error')
      setMessage(messageFor(error, 'Could not remove your photo.'))
    }
  }

  return (
    <div className="vi-avatarctl">
      <UserAvatar
        profile={profile}
        email={email}
        client={client}
        size="xl"
        label="Your profile photo"
      />

      <div className="vi-avatarctl__body">
        <p className="vi-hint">
          Optional. JPEG, PNG, or WebP. We crop it to a square and store a small
          copy. Without a photo, your initials are shown.
        </p>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={AVATAR_ACCEPTED_INPUT_TYPES.join(',')}
          disabled={busy}
          onChange={(e) => void handleFile(e.target.files?.[0])}
          className="vi-visually-hidden"
        />

        <div className="vi-avatarctl__actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {phase === 'uploading'
              ? 'Uploading…'
              : hasPhoto
                ? 'Change photo'
                : 'Upload photo'}
          </Button>
          {hasPhoto ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              {phase === 'removing' ? 'Removing…' : 'Remove photo'}
            </Button>
          ) : null}
        </div>

        {message ? (
          <p className="vi-error-text" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
