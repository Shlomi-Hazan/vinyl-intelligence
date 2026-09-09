import { describe, expect, it } from 'vitest'
import { FSI, PDI, isolate } from './isolate.ts'

describe('isolate', () => {
  it('wraps a run in FSI ... PDI (U+2068 / U+2069)', () => {
    expect(FSI).toBe(String.fromCodePoint(0x2068))
    expect(PDI).toBe(String.fromCodePoint(0x2069))
    expect(isolate('שלום חנוך')).toBe(`${FSI}שלום חנוך${PDI}`)
  })

  it('does not modify the underlying text', () => {
    const title = 'מחכים למשיח'
    expect(isolate(title).slice(1, -1)).toBe(title)
  })

  it('returns an empty string for empty input (no stray controls)', () => {
    expect(isolate('')).toBe('')
  })

  it('composes safely inside an English sentence', () => {
    const label = `View ${isolate('שבלול')} by ${isolate('אריק איינשטיין')}`
    expect(label).toContain(FSI)
    expect(label).toContain(PDI)
    expect(label.startsWith('View ')).toBe(true)
  })
})
