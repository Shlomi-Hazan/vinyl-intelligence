/**
 * Deterministic script classification for one dynamic string (artist, title,
 * genre, note, reason, transcript line, …). Pure, dependency-free.
 *
 * The rule is LOCKED by spec `docs/specs/0015-hebrew-multilingual-record-support.md`
 * §8 - no implementer discretion:
 *
 *   Count Hebrew LETTERS `H` and Latin LETTERS `L` only. Ignore digits,
 *   punctuation, whitespace, and Hebrew combining marks / niqqud / cantillation
 *   (those are `\p{L}`-negative, so filtering to letters removes them).
 *
 *   H === 0 && L === 0            -> neutral
 *   H  >  0 && L === 0            -> hebrew
 *   L  >  0 && H === 0            -> latin
 *   both present, H >= 2 * L      -> hebrew
 *   both present, L >= 2 * H      -> latin
 *   otherwise                    -> mixed
 */

export type ScriptClass = 'hebrew' | 'latin' | 'mixed' | 'neutral'

const LETTER = /\p{L}/u
const HEBREW = /\p{Script=Hebrew}/u
const LATIN = /\p{Script=Latin}/u

/** Count Hebrew vs Latin *letters* in one pass (code-point iteration). */
function countLetters(input: string): { hebrew: number; latin: number } {
  let hebrew = 0
  let latin = 0
  for (const ch of input) {
    if (!LETTER.test(ch)) {
      continue
    }
    if (HEBREW.test(ch)) {
      hebrew += 1
    } else if (LATIN.test(ch)) {
      latin += 1
    }
  }
  return { hebrew, latin }
}

export function classifyScript(input: string): ScriptClass {
  const { hebrew, latin } = countLetters(input)

  if (hebrew === 0 && latin === 0) {
    return 'neutral'
  }
  if (hebrew > 0 && latin === 0) {
    return 'hebrew'
  }
  if (latin > 0 && hebrew === 0) {
    return 'latin'
  }
  if (hebrew >= 2 * latin) {
    return 'hebrew'
  }
  if (latin >= 2 * hebrew) {
    return 'latin'
  }
  return 'mixed'
}

/**
 * The script of the first *letter* in the string, used to pick a sort bucket
 * (spec §9 step 1: "bucket every value by its leading meaningful script").
 * `'none'` when the string has no letters (digits / symbols / empty).
 */
export function leadingScript(
  input: string,
): 'hebrew' | 'latin' | 'other' | 'none' {
  for (const ch of input) {
    if (!LETTER.test(ch)) {
      continue
    }
    if (HEBREW.test(ch)) {
      return 'hebrew'
    }
    if (LATIN.test(ch)) {
      return 'latin'
    }
    return 'other'
  }
  return 'none'
}
