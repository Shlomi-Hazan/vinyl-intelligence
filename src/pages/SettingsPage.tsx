import { PageHeader } from '../app/PageHeader.tsx'
import { ProfilePanel } from '../profile/ProfilePanel.tsx'
import { useAuth } from '../auth/useAuth.ts'

/*
 * Phase A: hosts the existing profile / display-name / sign-out functionality.
 * The full settings design is Phase D.
 */
export function SettingsPage() {
  const { user, profile, notice, errorMessage, updateDisplayName, signOut } = useAuth()

  return (
    <div className="vi-page legacy-host">
      <PageHeader eyebrow="Account" title="Settings" />
      {profile ? (
        <ProfilePanel
          email={user?.email ?? null}
          profile={profile}
          notice={notice}
          errorMessage={errorMessage}
          onSaveDisplayName={updateDisplayName}
          onSignOut={signOut}
        />
      ) : null}
    </div>
  )
}
