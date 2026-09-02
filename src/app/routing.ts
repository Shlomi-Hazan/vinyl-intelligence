/**
 * Allow-list of internal destinations a post-login redirect may return to.
 * Anything not matching (external URLs, `//host`, `/`, `/auth`, junk, or an
 * over-long string) yields `null` and the caller falls back to `/dashboard` -
 * so a tampered `location.state.from` cannot cause an open redirect.
 */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/collection',
  '/discover',
  '/scan',
  '/vin',
  '/history',
  '/settings',
] as const

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    return null
  }
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\') ||
    /[\s<>]/.test(value)
  ) {
    return null
  }
  const pathOnly = value.split(/[?#]/, 1)[0]
  const allowed = PROTECTED_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  )
  return allowed ? value : null
}
