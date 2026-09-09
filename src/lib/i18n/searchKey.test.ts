import { describe, expect, it } from 'vitest'
import { buildSearchKey } from './searchKey.ts'

const cp = (code: number): string => String.fromCodePoint(code)

describe('buildSearchKey', () => {
  it('folds niqqud vs no-niqqud to the same key', () => {
    // "atur mitzhech" with points vs the plain spelling.
    const pointed =
      'ע' + cp(0x05b8) + 'ט' + 'ו' + cp(0x05bc) + 'ר' // עָטוּר
    expect(buildSearchKey(pointed)).toBe(buildSearchKey('עטור'))
  })

  it('folds a Hebrew presentation form via NFKC to the base spelling', () => {
    // U+FB2A HEBREW LETTER SHIN WITH SHIN DOT -> shin + U+05C1 -> shin.
    expect(buildSearchKey(cp(0xfb2a) + 'לום')).toBe(buildSearchKey('שלום'))
  })

  it('folds geresh / apostrophe variants', () => {
    const geresh = 'ג' + cp(0x05f3) + 'אז' // ג׳אז
    const ascii = "ג'אז"
    const curly = 'ג' + cp(0x2019) + 'אז'
    expect(buildSearchKey(geresh)).toBe(buildSearchKey(ascii))
    expect(buildSearchKey(curly)).toBe(buildSearchKey(ascii))
  })

  it('folds gershayim / quote variants', () => {
    const gershayim = 'תשל' + cp(0x05f4) + 'ב'
    const ascii = 'תשל"ב'
    expect(buildSearchKey(gershayim)).toBe(buildSearchKey(ascii))
  })

  it('folds maqaf and dash variants to a hyphen and does NOT strip maqaf', () => {
    const maqaf = 'עם' + cp(0x05be) + 'ישראל' // maqaf U+05BE
    const hyphen = 'עם-ישראל'
    const enDash = 'עם' + cp(0x2013) + 'ישראל'
    expect(buildSearchKey(maqaf)).toBe(buildSearchKey(hyphen))
    expect(buildSearchKey(enDash)).toBe(buildSearchKey(hyphen))
    // maqaf survives as a hyphen (it is NOT removed as a "mark").
    expect(buildSearchKey(maqaf)).toContain('-')
  })

  it('collapses Unicode whitespace including NBSP', () => {
    const nbsp = 'שלום' + cp(0x00a0) + cp(0x00a0) + 'חנוך'
    const runs = 'שלום   \t חנוך'
    expect(buildSearchKey(nbsp)).toBe('שלום חנוך')
    expect(buildSearchKey(runs)).toBe('שלום חנוך')
  })

  it('lowercases English locale-independently', () => {
    expect(buildSearchKey('David BOWIE')).toBe('david bowie')
    // Turkish dotted-I stays ASCII "i" (not the Turkish locale mapping).
    expect(buildSearchKey('IGGY')).toBe('iggy')
  })

  it('never bridges scripts (no transliteration aliasing)', () => {
    expect(buildSearchKey('שלום חנוך')).not.toBe(buildSearchKey('shalom hanoch'))
  })

  it('is idempotent', () => {
    const once = buildSearchKey("Miles Davis - Kind of Blue (1959)")
    expect(buildSearchKey(once)).toBe(once)
  })
})
