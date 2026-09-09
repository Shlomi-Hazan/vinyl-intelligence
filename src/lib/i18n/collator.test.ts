import { describe, expect, it } from 'vitest'
import { compareNames } from './collator.ts'

function sorted(values: string[]): string[] {
  // Mirror applyCollectionQuery: compareNames first, stable index tiebreak.
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      const primary = compareNames(a.value, b.value)
      return primary !== 0 ? primary : a.index - b.index
    })
    .map((entry) => entry.value)
}

describe('compareNames', () => {
  it('sorts an all-English list A-Z (via the en collator)', () => {
    expect(sorted(['Radiohead', 'ABBA', 'David Bowie'])).toEqual([
      'ABBA',
      'David Bowie',
      'Radiohead',
    ])
  })

  it('sorts an all-Hebrew list alef-tav (via the he collator)', () => {
    expect(sorted(['רביד פלוטניק', 'אריק איינשטיין', 'שלום חנוך'])).toEqual([
      'אריק איינשטיין',
      'רביד פלוטניק',
      'שלום חנוך',
    ])
  })

  it('puts the Latin bucket before the Hebrew bucket before other/neutral', () => {
    // "!!!" has no letters -> other/neutral bucket, which always sorts last.
    expect(
      sorted([
        'שלום חנוך',
        'Radiohead',
        'אריק איינשטיין',
        'Bowie',
        '!!!',
        'David Bowie',
      ]),
    ).toEqual([
      'Bowie',
      'David Bowie',
      'Radiohead',
      'אריק איינשטיין',
      'שלום חנוך',
      '!!!',
    ])
  })

  it('is deterministic across repeated runs', () => {
    const input = ['שלום חנוך', 'Bowie', 'אריק', 'ABBA', 'רדיוהד']
    expect(sorted(input)).toEqual(sorted(input))
  })

  it('applies numeric ordering within a bucket', () => {
    expect(sorted(['Vol. 10', 'Vol. 2', 'Vol. 1'])).toEqual([
      'Vol. 1',
      'Vol. 2',
      'Vol. 10',
    ])
  })

  it('returns 0 for equal names so the caller can tiebreak', () => {
    expect(compareNames('שלום', 'שלום')).toBe(0)
    expect(compareNames('bowie', 'BOWIE')).not.toBe(0) // sensitivity: variant
  })

  it('orders the other/neutral bucket by code point deterministically', () => {
    // both have no letters -> other/neutral bucket -> code-point order
    expect(compareNames('!!!', '???')).toBeLessThan(0) // 0x21 < 0x3F
    expect(compareNames('???', '!!!')).toBeGreaterThan(0)
  })
})
