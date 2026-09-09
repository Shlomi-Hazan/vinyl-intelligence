import { describe, expect, it } from 'vitest'
import { classifyScript, leadingScript } from './script.ts'

describe('classifyScript', () => {
  it.each([
    ['שלום חנוך', 'hebrew'], // H=8 L=0
    ['Radiohead', 'latin'], // H=0 L=9
    ['שלום Hanoch', 'mixed'], // H=4 L=6  (6 < 2*4 and 4 < 2*6)
    ['אביב גפן - III', 'hebrew'], // H=7 L=3  (7 >= 2*3)
    ['1979', 'neutral'],
    ['', 'neutral'],
  ] as const)('classifies %j as %s', (input, expected) => {
    expect(classifyScript(input)).toBe(expected)
  })

  it('ignores niqqud when counting Hebrew letters', () => {
    // עָטוּר has 4 letters + 3 points; still hebrew, and the points do not
    // inflate the count relative to the plain spelling.
    expect(classifyScript('עָטוּר')).toBe('hebrew')
    expect(classifyScript('עטור')).toBe('hebrew')
  })

  it('treats digits and punctuation as non-letters', () => {
    expect(classifyScript("'70s")).toBe('latin') // only the "s" counts
    expect(classifyScript('---')).toBe('neutral')
    expect(classifyScript('12" single')).toBe('latin')
  })

  it('does not flip to hebrew for a single Hebrew char in a Latin phrase', () => {
    // 1 Hebrew, many Latin -> latin (L >= 2H)
    expect(classifyScript('The א Team here now')).toBe('latin')
  })

  it('is mixed when neither script dominates 2:1', () => {
    expect(classifyScript('אב cd')).toBe('mixed') // H=2 L=2
  })
})

describe('leadingScript', () => {
  it.each([
    ['שלום חנוך', 'hebrew'],
    ['Radiohead', 'latin'],
    ['שלום Hanoch', 'hebrew'],
    ['Aviv גפן', 'latin'],
    ['1979 שלום', 'hebrew'], // digits skipped, first letter is Hebrew
    ['1979', 'none'],
    ['', 'none'],
  ] as const)('%j -> %s', (input, expected) => {
    expect(leadingScript(input)).toBe(expected)
  })
})
