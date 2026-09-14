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
 *
 * IMPORTANT BOUNDARY (PR #25 pre-merge correction): this module has its OWN
 * narrow genre-text normalizer and does NOT import `buildSearchKey` from
 * `src/lib/i18n/searchKey.ts`. `buildSearchKey` is COMPARISON-ONLY for the
 * Collection free-text search and must never run on a write / persistence
 * path (spec §7 / §12). Genre canonicalization runs on the personal-genre
 * WRITE path (`normalizePersonalGenres`), so it cannot share that function or
 * inherit its behaviour (e.g. niqqud stripping) even indirectly. The genre
 * normalizer below implements only the narrower, separately-approved contract:
 * trim, collapse Unicode whitespace, fold the approved geresh/gershayim/
 * maqaf-hyphen-dash variants, and locale-independent lowercase. It does NOT
 * strip niqqud/cantillation and does NOT apply NFKC - neither is needed by any
 * entry in the closed alias table below, and adding either would let
 * search-only behaviour leak into what gets persisted.
 */

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

const cp = (code: number): string => String.fromCodePoint(code)

function charClass(codes: readonly number[]): RegExp {
  return new RegExp(`[${codes.map(cp).join('')}]`, 'gu')
}

// Fold ONLY the punctuation variants the closed alias table actually needs
// (geresh/apostrophe, gershayim/quote, maqaf/hyphen/dash) - the same code
// points spec §7 folds for search, declared independently here so genre
// normalization never depends on `buildSearchKey` or its niqqud handling.
// geresh U+05F3, curly single quotes U+2018/U+2019, modifier prime U+02B9,
// prime U+2032, ASCII apostrophe U+0027.
const APOSTROPHES = charClass([0x0027, 0x05f3, 0x2018, 0x2019, 0x02b9, 0x2032])
// gershayim U+05F4, curly double quotes U+201C/U+201D, modifier double-prime
// U+02BA, double prime U+2033, ASCII quote U+0022.
const QUOTES = charClass([0x0022, 0x05f4, 0x201c, 0x201d, 0x02ba, 0x2033])
// maqaf U+05BE, hyphen U+2010, non-breaking hyphen U+2011, figure dash U+2012,
// en dash U+2013, em dash U+2014, horizontal bar U+2015, minus sign U+2212,
// ASCII hyphen-minus U+002D.
const DASHES = charClass([
  0x002d, 0x05be, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212,
])
const WHITESPACE = /\s+/gu

/**
 * Narrow genre-text normalization (spec §10.1, corrected boundary): trim,
 * collapse whitespace, fold the approved punctuation variants above,
 * locale-independent lowercase. Deliberately does NOT strip niqqud/
 * cantillation and does NOT apply Unicode compatibility (NFKC) normalization -
 * neither is required by any approved alias, and both are search-only
 * behaviour that must not reach genre persistence.
 */
function normalizeGenreText(raw: string): string {
  return raw
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .replace(DASHES, '-')
    .replace(WHITESPACE, ' ')
    .trim()
    .toLowerCase()
}

/**
 * alias (any raw form) -> canonical. Keys are stored already normalized with
 * `normalizeGenreText` so a lookup is a single normalized `Map.get`. Every
 * canonical output is itself a key (idempotence).
 *
 * `hip hop` needs its space AND hyphen spellings in both scripts because the
 * normalizer folds a hyphen to "-" (kept), not to a space.
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
  ALIASES.map(([alias, canonical]) => [normalizeGenreText(alias), canonical]),
)

/**
 * Resolve one raw genre string to its canonical form. Unknown values
 * (including the deliberately-unmapped `פאנק`) are returned normalized but
 * otherwise unchanged - never guessed, never translated. An empty /
 * whitespace-only input yields `''`.
 */
export function canonicalizeGenre(raw: string): string {
  const normalized = normalizeGenreText(raw)
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
