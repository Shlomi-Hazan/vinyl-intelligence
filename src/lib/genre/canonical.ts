/**
 * The ONE authoritative canonical-genre taxonomy for the whole app - browser
 * runtime and the Netlify curator runtime import this same module (the curator
 * Netlify functions already import `src/lib/curator/*` and `src/lib/i18n/*` the
 * same way).
 *
 * Locked by spec `docs/specs/0015-hebrew-multilingual-record-support.md` §10 /
 * ADR 0007 §3. A CLOSED, deterministic alias map: a known Hebrew or
 * case/punctuation/spacing variant resolves to one lowercase English canonical
 * value; anything else is returned normalized-but-unchanged. Never guessed,
 * never translated, never sent to an LLM.
 *
 * `פאנק` is DELIBERATELY NOT mapped - it is ambiguous between "punk" and "funk"
 * in Hebrew, so mapping it either way would violate the no-guess contract. It
 * passes through unchanged. English `punk` still canonicalizes to `punk`.
 */
import { buildSearchKey } from '../i18n/searchKey.ts'

/** The 15 canonical outputs. */
export const CANONICAL_GENRES = [
  'rock',
  'jazz',
  'hip hop',
  'pop',
  'blues',
  'punk',
  'metal',
  'reggae',
  'classical',
  'electronic',
  'folk',
  'soul',
  'progressive rock',
  'israeli rock',
  'mizrahi',
] as const

/**
 * alias (any raw form) -> canonical. Keys are stored already normalized with
 * `buildSearchKey` (§7 folds: NFKC, niqqud strip, geresh/gershayim/dash folds,
 * whitespace collapse, locale-independent lowercase) so a lookup is a single
 * normalized `Map.get`. Every canonical output is itself a key (idempotence).
 *
 * `hip hop` needs its space AND hyphen spellings in both scripts because
 * `buildSearchKey` folds a hyphen to "-" (kept), not to a space.
 */
const ALIASES: ReadonlyArray<readonly [alias: string, canonical: string]> = [
  ['rock', 'rock'],
  ['רוק', 'rock'],

  ['jazz', 'jazz'],
  ["ג'אז", 'jazz'], // ASCII apostrophe and geresh U+05F3 fold to the same key

  ['hip hop', 'hip hop'],
  ['hip-hop', 'hip hop'],
  ['היפ הופ', 'hip hop'],
  ['היפ-הופ', 'hip hop'],

  ['pop', 'pop'],
  ['פופ', 'pop'],

  ['blues', 'blues'],
  ['בלוז', 'blues'],

  ['punk', 'punk'], // Hebrew פאנק is intentionally absent - ambiguous

  ['metal', 'metal'],
  ['מטאל', 'metal'],

  ['reggae', 'reggae'],
  ['רגאיי', 'reggae'],

  ['classical', 'classical'],
  ['קלאסי', 'classical'],

  ['electronic', 'electronic'],
  ['אלקטרוני', 'electronic'],

  ['folk', 'folk'],
  ['פולק', 'folk'],

  ['soul', 'soul'],
  ['סול', 'soul'],

  ['progressive rock', 'progressive rock'],
  ['רוק מתקדם', 'progressive rock'],

  ['israeli rock', 'israeli rock'],
  ['רוק ישראלי', 'israeli rock'],

  ['mizrahi', 'mizrahi'],
  ['מזרחית', 'mizrahi'],
]

const CANONICAL_BY_ALIAS: ReadonlyMap<string, string> = new Map(
  ALIASES.map(([alias, canonical]) => [buildSearchKey(alias), canonical]),
)

/**
 * Resolve one raw genre string to its canonical form. Unknown values are
 * returned normalized (§7 folds) but otherwise unchanged - never guessed.
 * An empty / whitespace-only input yields `''`.
 */
export function canonicalizeGenre(raw: string): string {
  const normalized = buildSearchKey(raw)
  return CANONICAL_BY_ALIAS.get(normalized) ?? normalized
}

/**
 * Canonicalize a list, dropping blanks and de-duplicating by canonical form
 * while preserving first-occurrence order.
 */
export function canonicalizeGenres(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const canonical = canonicalizeGenre(value)
    if (canonical.length === 0 || seen.has(canonical)) {
      continue
    }
    seen.add(canonical)
    out.push(canonical)
  }
  return out
}
