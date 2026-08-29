import { describe, expect, it } from 'vitest'
import {
  buildUserSessionKey,
  removeSessionKey,
  safeReadSessionJson,
  safeWriteSessionJson,
} from './sessionDraft.ts'

type Sample = { value: string }

function parseSample(value: unknown): Sample | null {
  if (
    typeof value === 'object'
    && value !== null
    && typeof (value as Record<string, unknown>).value === 'string'
  ) {
    return { value: (value as Record<string, string>).value }
  }

  return null
}

describe('sessionDraft helpers', () => {
  it('builds a versioned, user-scoped key', () => {
    expect(buildUserSessionKey('catalog-search', 'abc-123')).toBe(
      'vinyl-intelligence:catalog-search:v1:abc-123',
    )
  })

  it('round-trips a validated JSON value', () => {
    const key = buildUserSessionKey('sample', 'user-1')
    safeWriteSessionJson(key, { value: 'kept' })

    expect(safeReadSessionJson(key, parseSample)).toEqual({ value: 'kept' })
  })

  it('returns null and removes the key for malformed JSON', () => {
    const key = buildUserSessionKey('sample', 'user-1')
    sessionStorage.setItem(key, '{ not json')

    expect(safeReadSessionJson(key, parseSample)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('returns null and removes the key when validation rejects the shape', () => {
    const key = buildUserSessionKey('sample', 'user-1')
    sessionStorage.setItem(key, JSON.stringify({ value: 42 }))

    expect(safeReadSessionJson(key, parseSample)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('returns null for an absent key without touching storage', () => {
    const key = buildUserSessionKey('sample', 'absent')
    expect(safeReadSessionJson(key, parseSample)).toBeNull()
  })

  it('scopes values by user id', () => {
    const keyA = buildUserSessionKey('sample', 'user-a')
    const keyB = buildUserSessionKey('sample', 'user-b')
    safeWriteSessionJson(keyA, { value: 'a-only' })

    expect(safeReadSessionJson(keyB, parseSample)).toBeNull()
    expect(safeReadSessionJson(keyA, parseSample)).toEqual({ value: 'a-only' })
  })

  it('removeSessionKey deletes a stored value', () => {
    const key = buildUserSessionKey('sample', 'user-1')
    safeWriteSessionJson(key, { value: 'gone' })
    removeSessionKey(key)

    expect(sessionStorage.getItem(key)).toBeNull()
  })
})
