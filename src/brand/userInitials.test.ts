import { describe, expect, it } from 'vitest'
import { userInitials } from './userInitials.ts'

describe('userInitials', () => {
  it('uses the first two words of a display name', () => {
    expect(userInitials('Ada Lovelace', 'a@x.test')).toBe('AL')
    expect(userInitials('Prince', null)).toBe('P')
  })

  it('falls back to the email local part when there is no display name', () => {
    expect(userInitials(null, 'grace.hopper@navy.mil')).toBe('GH')
    // blank display name falls through to the email (local part + domain tokens)
    expect(userInitials('', 'zoe@example.com')).toBe('ZE')
  })

  it('falls back to V when nothing usable is given', () => {
    expect(userInitials(null, null)).toBe('V')
    expect(userInitials('   ', '')).toBe('V')
  })

  it('splits on separators and always uppercases', () => {
    expect(userInitials('jean-luc picard', null)).toBe('JL')
  })
})
