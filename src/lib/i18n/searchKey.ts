/**
 * Derive a COMPARISON-ONLY search key from a dynamic string.
 *
 * Locked by spec `docs/specs/0015-hebrew-multilingual-record-support.md` §7.
 *
 * `buildSearchKey` is used ONLY to compare a typed query against stored
 * artist/title text. It is never persisted, never used to rewrite
 * artist/title/label/notes, and never part of a DB INSERT/UPDATE normalization.
 *
 * Steps (in order):
 *   1. Unicode compatibility normalization - NFKC. Folds presentation /
 *      compatibility forms (Hebrew presentation forms U+FB2A-U+FB4F, full-width
 *      Latin, ligatures) toward canonical spelling so an alternate encoding of
 *      the same text matches.
 *   2. Remove ONLY genuine Hebrew combining / cantillation / niqqud marks
 *      (U+0591-U+05BD, U+05BF, U+05C1, U+05C2, U+05C4, U+05C5, U+05C7). Hebrew
 *      PUNCTUATION is preserved - notably maqaf U+05BE (the broad
 *      `[U+0591-U+05C7]` strip is deliberately NOT used because it swallows
 *      maqaf), paseq U+05C0, sof pasuq U+05C3, nun hafukha U+05C6, geresh
 *      U+05F3, gershayim U+05F4.
 *   3. Fold punctuation variants: geresh / apostrophes / prime -> "'";
 *      gershayim / quotes / double-prime -> '"'; maqaf / hyphen / dashes -> "-".
 *   4. Collapse all Unicode whitespace (incl. NBSP) to a single space; trim.
 *   5. Locale-independent lowercase (`toLowerCase`, NOT `toLocaleLowerCase`).
 *
 * There is NO cross-script aliasing: a Hebrew query resolves to a Hebrew key and
 * only matches Hebrew-script stored text (and vice versa). Only orthographic
 * variants of the SAME text fold together. Every non-ASCII code point below is
 * declared numerically so the source stays reviewable.
 */

const cp = (code: number): string => String.fromCodePoint(code)

function charClass(codes: readonly number[]): RegExp {
  return new RegExp(`[${codes.map(cp).join('')}]`, 'gu')
}

function rangeClass(start: number, end: number, extra: readonly number[]): RegExp {
  const parts: string[] = [`${cp(start)}-${cp(end)}`, ...extra.map(cp)]
  return new RegExp(`[${parts.join('')}]`, 'gu')
}

// Step 2 - contiguous cantillation + points block 0x0591-0x05BD, plus rafe
// 0x05BF, shin dot 0x05C1, sin dot 0x05C2, upper/lower dot 0x05C4/0x05C5, qamats
// qatan 0x05C7. Maqaf 0x05BE, paseq 0x05C0, sof pasuq 0x05C3, nun hafukha
// 0x05C6 are intentionally NOT included.
const HEBREW_MARKS = rangeClass(0x0591, 0x05bd, [
  0x05bf, 0x05c1, 0x05c2, 0x05c4, 0x05c5, 0x05c7,
])

// Step 3 - punctuation-variant folds.
// geresh 0x05F3, curly single quotes 0x2018/0x2019, modifier prime 0x02B9,
// prime 0x2032, ASCII apostrophe 0x0027.
const APOSTROPHES = charClass([0x0027, 0x05f3, 0x2018, 0x2019, 0x02b9, 0x2032])
// gershayim 0x05F4, curly double quotes 0x201C/0x201D, modifier double-prime
// 0x02BA, double prime 0x2033, ASCII quote 0x0022.
const QUOTES = charClass([0x0022, 0x05f4, 0x201c, 0x201d, 0x02ba, 0x2033])
// maqaf 0x05BE, hyphen 0x2010, non-breaking hyphen 0x2011, figure dash 0x2012,
// en dash 0x2013, em dash 0x2014, horizontal bar 0x2015, minus sign 0x2212,
// ASCII hyphen-minus 0x002D.
const DASHES = charClass([
  0x002d, 0x05be, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212,
])

// Step 4 - JS `\s` (with the `u` flag) already matches NBSP U+00A0 and the other
// Unicode space separators.
const WHITESPACE = /\s+/gu

export function buildSearchKey(input: string): string {
  return input
    .normalize('NFKC')
    .replace(HEBREW_MARKS, '')
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .replace(DASHES, '-')
    .replace(WHITESPACE, ' ')
    .trim()
    .toLowerCase()
}
