import type { BrowserSupabaseClient, Profile } from './client.ts'

export const DISPLAY_NAME_MAX_LENGTH = 80

export function normalizeDisplayName(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function validateDisplayName(value: string | null): string | null {
  if (value === null) {
    return null
  }

  if (value !== value.trim()) {
    return 'Display name must not include leading or trailing spaces.'
  }

  if (value.length < 1) {
    return 'Display name cannot be blank.'
  }

  if (value.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`
  }

  return null
}

export async function fetchOwnProfile(
  client: BrowserSupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function updateOwnProfile(
  client: BrowserSupabaseClient,
  userId: string,
  displayNameInput: string,
): Promise<Profile> {
  const displayName = normalizeDisplayName(displayNameInput)
  const validationError = validateDisplayName(displayName)

  if (validationError) {
    throw new Error(validationError)
  }

  const { data, error } = await client
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select('id, display_name, created_at, updated_at')
    .single()

  if (error) {
    throw error
  }

  return data
}
