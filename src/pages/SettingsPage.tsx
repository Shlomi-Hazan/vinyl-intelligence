import { useState, type FormEvent } from 'react'
import { PageHeader } from '../app/PageHeader.tsx'
import { AvatarControl } from '../profile/AvatarControl.tsx'
import { Button } from '../ui/primitives.tsx'
import { useAuth } from '../auth/useAuth.ts'
import { DISPLAY_NAME_MAX_LENGTH } from '../lib/supabase/profile.ts'

/*
 * Phase D: Settings. Two sections only - PROFILE (photo, display name, the
 * read-only account email) and ACCOUNT (sign out). No invented settings, no
 * password / email-change flows (those are not built).
 */
export function SettingsPage() {
  const {
    user,
    profile,
    notice,
    errorMessage,
    client,
    updateDisplayName,
    refreshProfile,
    signOut,
  } = useAuth()

  if (!profile || !client || !user) {
    return (
      <div className="vi-page">
        <PageHeader eyebrow="Account" title="Settings" />
      </div>
    )
  }

  return (
    <div className="vi-page vi-settings">
      <PageHeader eyebrow="Account" title="Settings" />

      <section className="vi-settings__section" aria-labelledby="vi-settings-profile">
        <h2 id="vi-settings-profile">Profile</h2>

        <AvatarControl
          client={client}
          userId={user.id}
          profile={profile}
          email={user.email ?? null}
          onChanged={refreshProfile}
        />

        <DisplayNameForm
          initial={profile.display_name ?? ''}
          onSave={updateDisplayName}
        />

        <div className="vi-field">
          <span className="vi-label">Account email</span>
          <p className="vi-settings__email">{user.email ?? profile.id}</p>
          <p className="vi-hint">Your email is used to sign in and can’t be changed here.</p>
        </div>

        {notice ? <p className="vi-notice">{notice}</p> : null}
        {errorMessage ? (
          <p className="vi-error-text" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="vi-settings__section" aria-labelledby="vi-settings-account">
        <h2 id="vi-settings-account">Account</h2>
        <SignOutButton onSignOut={signOut} />
      </section>
    </div>
  )
}

function DisplayNameForm({
  initial,
  onSave,
}: {
  initial: string
  onSave: (displayName: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  const trimmed = value.trim()
  const tooLong = trimmed.length > DISPLAY_NAME_MAX_LENGTH
  const willTrim = value.length > 0 && value !== trimmed
  const dirty = trimmed !== initial.trim()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (tooLong) {
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setValue(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="vi-field" onSubmit={submit}>
      <label className="vi-label" htmlFor="vi-settings-displayname">
        Display name
      </label>
      <input
        id="vi-settings-displayname"
        className="vi-input"
        type="text"
        value={value}
        maxLength={DISPLAY_NAME_MAX_LENGTH + 8}
        placeholder="Optional"
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="vi-hint">
        Shown across the app. Blank falls back to your initials. Up to{' '}
        {DISPLAY_NAME_MAX_LENGTH} characters.
      </p>
      {tooLong ? (
        <p className="vi-error-text" role="alert">
          Display name must be {DISPLAY_NAME_MAX_LENGTH} characters or fewer.
        </p>
      ) : willTrim ? (
        <p className="vi-notice">Leading and trailing spaces will be removed.</p>
      ) : null}
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={saving || tooLong || !dirty}
        >
          {saving ? 'Saving…' : 'Save display name'}
        </Button>
      </div>
    </form>
  )
}

function SignOutButton({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onSignOut()
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
