/**
 * Derive up to two uppercase initials from a display name, falling back to the
 * email local part, then to a single 'V'. Pure and dependency-free so it can be
 * shared and unit-tested apart from the avatar component.
 */
export function userInitials(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const source = (displayName?.trim() || email?.trim() || 'V')
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? 'V').concat(parts[1]?.[0] ?? '').toUpperCase()
}
