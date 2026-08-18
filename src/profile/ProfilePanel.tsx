import { useState, type FormEvent } from 'react'
import { DISPLAY_NAME_MAX_LENGTH } from '../lib/supabase/profile.ts'
import type { Profile } from '../lib/supabase/client.ts'

type ProfilePanelProps = {
  email: string | null
  profile: Profile
  notice: string | null
  errorMessage: string | null
  onSaveDisplayName: (displayName: string) => Promise<void>
  onSignOut: () => Promise<void>
}

export function ProfilePanel({
  email,
  profile,
  notice,
  errorMessage,
  onSaveDisplayName,
  onSignOut,
}: ProfilePanelProps) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const trimmedDisplayName = displayName.trim()
  const hasInvalidSpacing = displayName.length > 0 && displayName !== trimmedDisplayName
  const isTooLong = trimmedDisplayName.length > DISPLAY_NAME_MAX_LENGTH
  const validationMessage = hasInvalidSpacing
    ? 'Display name will be saved without leading or trailing spaces.'
    : isTooLong
      ? `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`
      : null

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isTooLong) {
      return
    }

    setIsSaving(true)

    try {
      await onSaveDisplayName(trimmedDisplayName)
      setDisplayName(trimmedDisplayName)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      await onSignOut()
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <section className="profile-panel" aria-labelledby="profile-title">
      <p className="eyebrow">Protected profile</p>
      <h1 id="profile-title">Vinyl Intelligence</h1>
      <p className="account-line">{email ?? profile.id}</p>

      <form className="profile-form" onSubmit={handleSave}>
        <label>
          Display name
          <input
            maxLength={DISPLAY_NAME_MAX_LENGTH + 8}
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Optional"
            type="text"
            value={displayName}
          />
        </label>

        <p className="field-hint">
          Optional. Blank saves as no display name. Maximum{' '}
          {DISPLAY_NAME_MAX_LENGTH} characters.
        </p>

        {validationMessage ? (
          <p className={isTooLong ? 'error' : 'notice'}>{validationMessage}</p>
        ) : null}

        <div className="auth-actions">
          <button disabled={isSaving || isTooLong} type="submit">
            {isSaving ? 'Saving...' : 'Save profile'}
          </button>
          <button disabled={isSigningOut} onClick={handleSignOut} type="button">
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </form>

      {notice ? <p className="notice">{notice}</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </section>
  )
}
