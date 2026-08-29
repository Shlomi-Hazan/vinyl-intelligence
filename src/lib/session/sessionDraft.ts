/**
 * Tiny helpers for per-tab, per-user draft persistence in `sessionStorage`.
 *
 * These exist so unsaved catalog / photo / manual-collection work survives a
 * refresh or same-tab navigation without another provider call or database
 * write. They deliberately stay small: build a user-scoped key, read JSON
 * safely, write JSON safely, remove a key. Nothing here is a storage framework.
 *
 * Rules enforced by callers, not this module:
 * - Never store secrets, tokens, image bytes, or raw provider payloads.
 * - Persisted shapes are explicit and validated on read.
 */

const KEY_PREFIX = 'vinyl-intelligence'
const KEY_VERSION = 'v1'

/**
 * Builds a versioned, user-scoped key, e.g.
 * `vinyl-intelligence:catalog-search:v1:<userId>`. Namespacing by the
 * authenticated user id keeps one signed-in user from ever restoring another
 * user's temporary state.
 */
export function buildUserSessionKey(namespace: string, userId: string): string {
  return `${KEY_PREFIX}:${namespace}:${KEY_VERSION}:${userId}`
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null
    }

    return window.sessionStorage
  } catch {
    // Access itself can throw (privacy modes, sandboxed frames, SSR shims).
    return null
  }
}

/**
 * Reads and JSON-parses a session value, then hands the parsed value to
 * `parse` for shape validation. Any failure (missing storage, unreadable key,
 * malformed JSON, failed validation) returns `null` and removes the key so a
 * bad value cannot linger or crash a later read.
 */
export function safeReadSessionJson<T>(
  key: string,
  parse: (value: unknown) => T | null,
): T | null {
  const storage = getSessionStorage()

  if (!storage) {
    return null
  }

  let raw: string | null

  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }

  if (raw === null) {
    return null
  }

  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(raw)
  } catch {
    removeSessionKey(key)
    return null
  }

  let validated: T | null

  try {
    validated = parse(parsedJson)
  } catch {
    validated = null
  }

  if (validated === null) {
    removeSessionKey(key)
    return null
  }

  return validated
}

/**
 * JSON-stringifies and stores a value. Quota or serialization failures are
 * swallowed: persistence is a convenience and must never break the UI.
 */
export function safeWriteSessionJson(key: string, value: unknown): void {
  const storage = getSessionStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore: storage full, disabled, or value not serializable.
  }
}

export function removeSessionKey(key: string): void {
  const storage = getSessionStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(key)
  } catch {
    // Ignore: nothing actionable if removal fails.
  }
}
