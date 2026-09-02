import { describe, expect, it } from 'vitest'
import { fallbackAccent, fallbackSeed } from './fallbackCover.ts'

describe('fallbackCover', () => {
  it('is deterministic for the same input', () => {
    expect(fallbackAccent('abc')).toBe(fallbackAccent('abc'))
    expect(fallbackSeed('abc')).toBe(fallbackSeed('abc'))
  })

  it('varies across different inputs but stays in the curated ramp', () => {
    const ramp = new Set([
      '#c6743e',
      '#2f5d50',
      '#c9a34e',
      '#8a5a3c',
      '#4a6b62',
      '#9c7b3e',
    ])
    const seen = new Set<string>()
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      const accent = fallbackAccent(id)
      expect(ramp.has(accent)).toBe(true)
      seen.add(accent)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('handles an empty string without throwing', () => {
    expect(() => fallbackAccent('')).not.toThrow()
    expect(fallbackAccent('')).toBe(fallbackAccent(''))
  })
})
