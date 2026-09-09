/**
 * Deterministic name comparison for the Collection artist/title sorts.
 *
 * Locked by spec `docs/specs/0015-hebrew-multilingual-record-support.md` §9 /
 * ADR 0007 §7:
 *
 *   1. Bucket every value by its leading meaningful script:
 *      Latin (0)  <  Hebrew (1)  <  other / neutral (2).
 *   2. Compare within a bucket with a SCRIPT-SPECIFIC collator - two singletons,
 *      `Intl.Collator('en', …)` and `Intl.Collator('he', …)`. A locale ARRAY
 *      (`['en','he']`) is a prioritized fallback request, not a per-string
 *      policy, so it is deliberately not used.
 *   3. The other / neutral bucket sorts by true Unicode scalar code point
 *      (code-point iteration, NOT a plain UTF-16 `<`), which is
 *      locale-independent and non-BMP-safe.
 *   4. The caller keeps its stable original-index tiebreak
 *      (`applyCollectionQuery`).
 */
import { leadingScript } from './script.ts'

// Baseline options (spec §9). Refining these requires a documented reason.
const APPROVED_OPTIONS: Intl.CollatorOptions = {
  numeric: true,
  sensitivity: 'variant',
  caseFirst: 'false',
}

const latinCollator = new Intl.Collator('en', APPROVED_OPTIONS)
const hebrewCollator = new Intl.Collator('he', APPROVED_OPTIONS)

type SortBucket = 0 | 1 | 2

function bucketOf(value: string): SortBucket {
  switch (leadingScript(value)) {
    case 'latin':
      return 0
    case 'hebrew':
      return 1
    default:
      return 2
  }
}

/**
 * Deterministic Unicode *scalar code-point* lexicographic comparison,
 * locale-independent. The string iterator yields whole code points, so a
 * supplementary (non-BMP) character compares by its real scalar value rather
 * than by its UTF-16 surrogate units (`'\u{10000}' > '￿'`, which a plain
 * `<` on the string would get wrong).
 */
function codePointCompare(a: string, b: string): number {
  const ai = a[Symbol.iterator]()
  const bi = b[Symbol.iterator]()
  for (;;) {
    const an = ai.next()
    const bn = bi.next()
    if (an.done && bn.done) {
      return 0
    }
    if (an.done) {
      return -1
    }
    if (bn.done) {
      return 1
    }
    const ac = an.value.codePointAt(0) as number
    const bc = bn.value.codePointAt(0) as number
    if (ac !== bc) {
      return ac < bc ? -1 : 1
    }
  }
}

/**
 * Compare two names for an alphabetical sort. Returns a negative / zero /
 * positive number; a zero result means "equal for sort purposes" and the caller
 * applies its own stable tiebreak.
 */
export function compareNames(a: string, b: string): number {
  const bucketA = bucketOf(a)
  const bucketB = bucketOf(b)
  if (bucketA !== bucketB) {
    return bucketA - bucketB
  }
  if (bucketA === 0) {
    return latinCollator.compare(a, b)
  }
  if (bucketA === 1) {
    return hebrewCollator.compare(a, b)
  }
  return codePointCompare(a, b)
}
