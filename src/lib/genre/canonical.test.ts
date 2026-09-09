import { describe, expect, it } from 'vitest'
import {
  CANONICAL_GENRES,
  canonicalizeGenre,
  canonicalizeGenres,
} from './canonical.ts'

const cp = (code: number): string => String.fromCodePoint(code)

describe('canonicalizeGenre - approved alias table (spec 0015 §10.2)', () => {
  it.each([
    ['רוק', 'rock'],
    ['Rock', 'rock'],
    ['ROCK', 'rock'],
    ['  rock  ', 'rock'],
    ["ג'אז", 'jazz'], // ASCII apostrophe
    ['ג' + cp(0x05f3) + 'אז', 'jazz'], // geresh U+05F3
    ['Jazz', 'jazz'],
    ['jazz', 'jazz'],
    ['היפ הופ', 'hip hop'],
    ['היפ-הופ', 'hip hop'],
    ['Hip Hop', 'hip hop'],
    ['hip-hop', 'hip hop'],
    ['hip hop', 'hip hop'],
    ['פופ', 'pop'],
    ['בלוז', 'blues'],
    ['מטאל', 'metal'],
    ['רגאיי', 'reggae'],
    ['קלאסי', 'classical'],
    ['אלקטרוני', 'electronic'],
    ['פולק', 'folk'],
    ['סול', 'soul'],
    ['רוק מתקדם', 'progressive rock'],
    ['progressive rock', 'progressive rock'],
    ['רוק ישראלי', 'israeli rock'],
    ['מזרחית', 'mizrahi'],
    ['mizrahi', 'mizrahi'],
  ] as const)('canonicalizeGenre(%j) === %j', (input, expected) => {
    expect(canonicalizeGenre(input)).toBe(expected)
  })

  it('every canonical output is idempotent', () => {
    for (const g of CANONICAL_GENRES) {
      expect(canonicalizeGenre(g)).toBe(g)
    }
  })

  it('leaves ambiguous Hebrew פאנק unmapped; English punk still maps', () => {
    expect(canonicalizeGenre('פאנק')).toBe('פאנק')
    expect(canonicalizeGenre('  פאנק ')).toBe('פאנק')
    expect(canonicalizeGenre('punk')).toBe('punk')
    expect(canonicalizeGenre('PUNK')).toBe('punk')
  })

  it('passes an unknown genre through, normalized but never guessed', () => {
    expect(canonicalizeGenre('זמר עברי')).toBe('זמר עברי')
    expect(canonicalizeGenre('  Zamer   Ivri ')).toBe('zamer ivri')
    expect(canonicalizeGenre('trip hop')).toBe('trip hop')
    // rockabilly must NOT collapse to rock
    expect(canonicalizeGenre('rockabilly')).toBe('rockabilly')
  })

  it('returns "" for a blank input', () => {
    expect(canonicalizeGenre('')).toBe('')
    expect(canonicalizeGenre('   ')).toBe('')
  })
})

describe('canonicalizeGenres', () => {
  it('dedupes by canonical form, preserving first-occurrence order', () => {
    expect(canonicalizeGenres(['rock', 'רוק', 'ROCK'])).toEqual(['rock'])
    expect(canonicalizeGenres(['Jazz', 'רוק', 'jazz'])).toEqual(['jazz', 'rock'])
  })

  it('drops blanks and keeps unknowns', () => {
    expect(canonicalizeGenres(['', '  ', 'רוק', 'זמר עברי', 'פאנק'])).toEqual([
      'rock',
      'זמר עברי',
      'פאנק',
    ])
  })
})
