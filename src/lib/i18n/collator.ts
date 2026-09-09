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
 *   3. The other / neutral bucket sorts by code point (a plain `<`), which is
 *      locale-independent and matches how numeric / symbol names sort today.
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

/** Deterministic code-point comparison (BMP-safe; locale-independent). */
function codePointCompare(a: string, b: string): number {
  if (a === b) {
    return 0
  }
  return a < b ? -1 : 1
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
