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

  it('does NOT strip niqqud on an unknown genre (search-only behaviour must not leak in)', () => {
    // זָמָר עִבְרִי - "unknown genre" with niqqud points. Genre normalization
    // only trims / collapses whitespace / folds approved punctuation / lowers -
    // it must not remove the points the way the search-only buildSearchKey does.
    const pointed =
      'ז' + cp(0x05b8) + 'מ' + cp(0x05b8) + 'ר' + ' ' + 'ע' + cp(0x05b4) + 'ב' + 'ר' + cp(0x05b4) + 'י'
    const out = canonicalizeGenre(pointed)
    expect(out).toBe(pointed) // unchanged: no case folding needed, no whitespace to collapse
    expect(out).toContain(cp(0x05b8)) // niqqud still present
    expect(out).not.toBe('זמר עברי') // did NOT collapse to the unpointed spelling
  })

  it('collapses whitespace and case around a niqqud-pointed unknown genre without touching the points', () => {
    const pointed = 'ז' + cp(0x05b8) + 'מר'
    const out = canonicalizeGenre(`  ${pointed}   spelled  `)
    expect(out).toBe(`${pointed} spelled`)
    expect(out).toContain(cp(0x05b8))
  })
})

// NOTE (PR #25 correction): a static "read canonical.ts source and assert no
// import statement" test was attempted here but is not viable in this
// project's Vitest/jsdom environment - `import.meta.url` is not a `file:`
// URL under jsdom, so `fileURLToPath(new URL(...))` throws
// `TypeError: The URL must be of scheme file` (the same class of environment
// limitation previously hit and resolved during Milestone 12 planning by not
// forcing a workaround). Per that precedent, the "no buildSearchKey / no
// NFKC" boundary is instead verified by direct source inspection and
// reported in the PR body / correction report, and is exercised behaviourally
// by the niqqud-preservation tests above (search-only stripping does not
// leak into genre normalization) and by the alias-table tests below (no
// unexpected NFKC-driven matches).

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
