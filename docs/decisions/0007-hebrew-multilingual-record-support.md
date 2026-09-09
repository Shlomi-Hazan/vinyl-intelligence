# 0007 Hebrew & Multilingual Record Support

Status: **accepted** 2026-09-09 (human product-contract approval). Post-M12
enhancement. Not yet implemented — planned as **three sequential implementation
PRs, then one documentation-only closeout PR** in
`docs/plans/015-hebrew-multilingual-record-support.md`; full behaviour contract
in `docs/specs/0015-hebrew-multilingual-record-support.md`.

Baseline `main` at decision time: `dd3f9485c44d84fdc8a285c2889bdbe1cf779e1b`
(PR #21 — M12 final closeout).

Date: 2026-09-09

Rev 2 (2026-09-09): independent review corrections folded in — final
status/SHA/acceptance/general-docs work moved to a separate documentation-only
closeout PR; English-compatibility contract names the approved personal-genre /
alias-dedupe deltas explicitly; the genre facet is entirely PR 2 (PR 1 has no
genre-semantics change); the ambiguous Hebrew alias `פאנק` is removed; the
script-dominance rule is fully specified (§6); the real-provider human-test
budget is bounded.

Rev 3 (2026-09-09): implementation-readiness micro-corrections — `buildSearchKey`
is comparison-only and never on a write path (§2); `CollectionBrowser` keeps
`?q=` raw (only orthographic variants fold, no cross-script aliasing) (§2);
native `<option>` labels are not wrapped in `<bdi>` (attributes on the
`<option>`); `PageHeader` keeps its `string` prop API and stable-`title` focus
contract; sort labels stay English-only (`Artist alphabetical` /
`Album alphabetical`) (§7); Goal-level English-regression wording allows the
§19.2 deltas; `H(שלום חנוך) = 8` corrected (§6); the `AlbumArtwork` fallback
isolates title and artist separately.

## Context

Vinyl Intelligence already stores Unicode metadata and production has returned
Hebrew MusicBrainz results. An independent audit against `HEAD dd3f948` found
that the app does not *handle* multilingual dynamic content:

- no bidirectional-text isolation anywhere (`grep` for `dir=`, `<bdi`,
  `unicode-bidi`, `Intl.Collator` in `src/` + `netlify/` returns nothing);
- Collection sort uses `localeCompare()` with no locale argument;
- Collection search is a raw lowercased substring match;
- **no genre canonicalization exists**, and the three genre consumers
  (Collection filter, Dashboard insights, curator candidate builder) already
  disagree in English because two read `release.genres` only while the filter
  reads `effectiveGenres` (ADR 0006 §Consequences deferred the VIN half);
- a Hebrew VIN request that yields a Hebrew genre constraint
  (`includeGenres: ["רוק"]`) is silently reduced to `no_match`, and a Hebrew
  `excludeGenres` is silently inert;
- the selection prompt has no response-language instruction; the vision prompt
  does not require preserving the original script;
- bundled fonts are Latin-subset only (verified: 0 Hebrew codepoints).

Several product and architecture questions had to be settled before a spec could
be written:

1. How far does "multilingual" go — chrome too, or dynamic content only?
2. Search normalization: how aggressive, and does it ever rewrite stored
   metadata?
3. Genre canonicalization: where does it live, and does it mutate persisted
   values? Catalog genres and personal genres — same policy or different?
4. Does any of this require a database migration?
5. Language detection for `lang` attributes: any-Hebrew-character, or
   dominance-based?
6. Sorting: what is the mixed Hebrew/English order?
7. Does the curator / vision security contract change?

## Decision

### 1. Dynamic content only; chrome stays English/LTR

The application chrome (navigation, buttons, headings, static labels,
empty/loading/error copy) stays **English and left-to-right**, and the root
document stays `<html lang="en">`. The enhancement applies only to **dynamic
record/user content**: artist, title, label, genre, personal genre, notes, the
VIN request/refinement text, recommendation reasons, transcript lines,
recognition clues.

**Rejected as out of scope:** full Hebrew UI translation, RTL chrome, automatic
artist/title transliteration in either direction, cross-script aliasing
(`Shalom Hanoch` ↔ `שלום חנוך`).

### 2. Search normalization derives a key; it never rewrites metadata

A pure `buildSearchKey()` produces a **comparison-only** key: Unicode
compatibility normalization (NFKC unless narrower is proven safer), removal of
**only** actual Hebrew combining/cantillation/niqqud marks (**not** Hebrew
punctuation — maqaf `U+05BE` in particular is preserved; the audit's broad
`[֑-ׇ]` strip is rejected), folding of geresh/gershayim/quote and
maqaf/hyphen/dash variants, whitespace/NBSP collapse, locale-independent
lowercase. Comparison is on derived keys only.

**`buildSearchKey` never runs on a write path** — it is never persisted, never
used to rewrite `artist` / `title` / `label` / `notes`, and never part of a DB
INSERT/UPDATE normalization. It strips niqqud and folds punctuation, so using it
on persisted metadata would break the original-metadata preservation contract.
`CollectionBrowser` keeps the raw `?q=` string in the URL and the input; the key
is derived only inside `matchesSearch`. Only **orthographic variants** of the
same text (niqqud, punctuation form, whitespace, compatibility forms, case) fold
to one key — there is **no** cross-script aliasing (a Hebrew query matches
Hebrew-script text, an English query matches Latin-script text). If invisible
bidi-control / NBSP sanitization of persisted text is ever needed, that is a
separate narrowly-scoped sanitizer, evidence-justified, not `buildSearchKey`.
**`releases.artist` / `releases.title` / stored catalog genre values are never
rewritten.** (Personal genres have their own write-normalization policy — §3.)

### 3. Catalog genres canonicalize at read time; personal genres at write time

- **Catalog / MusicBrainz genres:** raw persisted values on the shared
  `releases` row are **never** rewritten (no per-user write to shared data; RLS
  already enforces this). Canonicalization to canonical lowercase English
  happens only at effective/read/use time.
- **Personal genres** (`collection_items.personal_genres`, owner-owned): known
  conservative aliases from a **closed, deterministic** map are canonicalized to
  canonical English **at the write-normalization boundary** — so a user who adds
  `רוק` may see it saved as `rock`. Unknown/ambiguous personal genres are
  normalized safely and **preserved as entered** — never translated, never
  guessed, never sent to an LLM.
- Existing persisted Hebrew personal aliases canonicalize correctly at read/use
  time, so **no backfill and no migration** are needed.

The initial approved alias map (closed, 15 canonical outputs):
`רוק|rock→rock`, `ג'אז|ג׳אז|jazz→jazz`,
`היפ הופ|היפ-הופ|hip hop|hip-hop→hip hop`, `פופ|pop→pop`, `בלוז|blues→blues`,
`punk→punk`, `מטאל|metal→metal`, `רגאיי|reggae→reggae`,
`קלאסי|classical→classical`, `אלקטרוני|electronic→electronic`,
`פולק|folk→folk`, `סול|soul→soul`,
`רוק מתקדם|progressive rock→progressive rock`,
`רוק ישראלי|israeli rock→israeli rock`, `מזרחית|mizrahi→mizrahi`.

Hebrew **`פאנק` is deliberately NOT mapped** — it is ambiguous between "punk"
and "funk", so mapping it either way would violate the conservative / no-guess
contract. `פאנק` passes through unchanged until a future explicitly approved
disambiguation strategy exists. English `punk` still canonicalizes to `punk`.
Expanding the map (adding `פאנק` in either direction, or any other alias)
requires per-alias product approval.

### 4. One effective-genre source of truth

Collection filtering, Dashboard insights, and VIN candidate filtering/ranking
all consume the **same** canonical effective-genre set (catalog ∪ personal,
canonicalized, deduped). The curator server load (`curator-handlers.mts`
`loadOwnedCollection`) is extended to select `collection_items.personal_genres`
— this closes the "VIN integration" that ADR 0006 §Consequences explicitly
deferred. `collection_items.notes` remains excluded from all model context.

### 5. No database migration

All text columns are `text` (code-point-limited, not byte-limited); the genre
CHECK (`g = btrim(g) and g = lower(g) and char_length(g) between 1 and 40`)
already accepts Hebrew (caseless; `btrim` is a no-op on Hebrew letters/points).
Undesirable invisible formatting controls are handled by app-layer
normalization, which is not evidence for a schema change. **Final conclusion: no
migration.** If implementation proves otherwise, it STOPS and returns the exact
evidence to the human before any migration is written.

### 6. Language detection is dominance-based (exact rule, no implementer discretion)

`classifyScript(s)` counts **Hebrew letters `H`** and **Latin letters `L`**
only — digits, punctuation, whitespace, and Hebrew combining marks / niqqud /
cantillation are ignored. Then:

- `H == 0 && L == 0` → `neutral`
- `H > 0 && L == 0` → `hebrew`
- `L > 0 && H == 0` → `latin`
- both present: `H >= 2*L` → `hebrew`; `L >= 2*H` → `latin`; otherwise → `mixed`

Examples: `שלום חנוך` (H = 8, L = 0) → `hebrew`; `Radiohead` → `latin`;
`שלום Hanoch` (H = 4, L = 6) → `mixed`; `אביב גפן - III` (H = 7, L = 3) →
`hebrew` (7 ≥ 2·3); `1979` → `neutral`.

`BidiText` always emits `<bdi dir="auto">`; it sets `lang="he"` **only** when
`classifyScript` returns `hebrew`. `latin` inherits the document `en`; `mixed`
and `neutral` get **no** language override. `BidiText` never sets `lang="he"`
just because a string contains a Hebrew character. For `aria-label` /
plain-string contexts, Unicode isolate controls (`U+2068`/`U+2069`) wrap the
dynamic run rather than `dir="auto"` on the whole English sentence.

### 7. Deterministic sort with an explicit mixed-script bucket order

Artist/title alphabetical sorting: **Latin bucket first, then Hebrew bucket,
then neutral/other**, using a shared `Intl.Collator` with an explicit locale
list (`['en','he']`) and options — not the host default locale. A–Z within
Latin, א–ת within Hebrew, existing stable original-index tiebreak preserved.
Example: `ABBA, David Bowie, Radiohead, אריק איינשטיין, רביד פלוטניק, שלום חנוך`.
Because the result is a Latin-then-Hebrew list, the two `COLLECTION_SORTS`
**labels** become **English-only** — `Artist alphabetical` / `Album
alphabetical` (not `A–Z / א–ת`, which would put Hebrew glyphs in the English
chrome). The sort **values** (`artist-asc` / `album-asc`) and the `?sort=` URL
contract are unchanged.

### 8. Curator and vision security contracts are unchanged

No model change; no response-schema change; no change to nonce / untrusted-data
framing; no allowed-candidate-ID relaxation; the two-call-per-request budget and
`{ inScope, intent }` wrapper stand; notes are never sent to a model. The genre
fix is a **two-level defense**: (1) a trusted intent/refinement prompt line
asking for canonical lowercase English genre names, and (2) an authoritative
deterministic `canonicalizeGenre` normalization of validated genre values
server-side before hard filtering — a normalization step of the same kind as the
existing trim/lowercase/dedupe, not a trust-boundary change. The selection
prompt gains: reason in the request language; artist/title verbatim, never
translated. The vision prompt gains: preserve the original visible script, no
transliteration, Latin output only when Latin is actually printed.

### 9. No new dependency and no new bundled webfont by default

Hebrew renders via the existing `system-ui` / `Georgia` fallback on all
mainstream platforms (`font-display: swap` prevents invisible text). At most,
PR 3 may append Hebrew fallback **family names** to the CSS stacks if human
visual testing shows the seam is unacceptable — additive stack entries only, no
new font file, no `@font-face`.

### 10. Three sequential implementation PRs, then a documentation-only closeout PR

PR 1 (BiDi + search + sort, no AI change, no genre-semantics change) →
PR 2 (canonical genres + VIN) → PR 3 (vision + accessibility + Scan) →
**closeout PR** (status → COMPLETE, final SHAs, human-acceptance evidence,
general-docs reconciliation). Each PR starts from then-current `main` after the
previous is reviewed, merged, deployed from merged `main`, and human-accepted.
**No implementation PR claims post-merge evidence** (a merge SHA, a deploy SHA,
a "final `main`", an acceptance result) — that can only exist after it merges,
so it lives in the closeout PR, exactly as in the M12 pattern (PR #21).

## Consequences

- A new `src/lib/i18n/*` module set (`script`, `searchKey`, `collator`,
  `isolate`), a `BidiText` component, and a `src/lib/genre/canonical.ts` module
  — all pure, dependency-free, deterministic, unit-tested.
- The curator server select and candidate typing change to carry
  `personal_genres`; this is a pure additive genre merge, not an M9/M10
  candidate-contract change.
- **Dashboard top-genre counts change for mixed / personally-tagged
  collections** (a `רוק`+`rock` split collapses to one row; personally-tagged
  records start counting). This is the intended consistency fix and is called
  out for human acceptance.
- Three trusted curator-prompt additions (intent, refinement, selection) plus
  one vision prompt addition require a real-provider human retest, **bounded**:
  ≈ 4 curator model calls in PR 2's human gate (one Hebrew request + one Hebrew
  refinement, two model calls each), one Hebrew Vision call in PR 3's. English
  regression, out-of-scope-Hebrew, and unknown-genre behaviour are mocked
  automated coverage, not live calls.
- **English compatibility is scoped, not absolute.** English free-text search,
  all-English sort order, and already-canonical English catalog-genre semantics
  are unchanged (locked by regression fixtures that use `personal_genres: []`
  and canonical catalog genres). Three deltas ARE expected and approved:
  personal genres begin participating in Dashboard genre insights; personal
  genres begin participating in VIN candidate genres (curator server now loads
  `personal_genres`); approved aliases dedupe to one canonical genre. Any other
  English-visible change is a defect → STOP.
- No schema change, no migration, no dependency, no new secret/env var, no
  Netlify/Supabase config change, no new bundled webfont.
- The **documentation-only closeout PR** (after PR 3 production acceptance)
  reconciles `docs/architecture.md`, `docs/ai-design.md`, `docs/data-model.md`,
  `docs/security.md`, `README.md`, `docs/verification.md`, the spec/decision
  index READMEs, and this ADR's "implemented" note, and sets spec/plan status →
  COMPLETE with the final SHAs and acceptance evidence. No implementation PR
  does this.
- Historical roadmap `docs/roadmaps/2026-08-18-*` stays byte-unchanged
  (`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`).

## Alternatives considered

- **Full Hebrew localization / RTL chrome.** Far larger, changes the product's
  character, and unnecessary — the listener's *records* are multilingual, the
  *app* is an English tool. Rejected as an explicit non-goal.
- **`dir="auto"` on whole sentences / any container.** Simpler to apply but a
  leading Hebrew value flips the entire English sentence. Rejected in favour of
  isolating only the dynamic run (`<bdi>` in markup, FSI/PDI in strings).
- **`lang="he"` whenever a Hebrew character appears.** Mis-tags mixed strings
  and makes screen readers mispronounce the Latin parts. Rejected for
  dominance-based detection.
- **Broad `[U+0591–U+05C7]` "niqqud" strip for the search key** (from the
  audit). That range also contains Hebrew punctuation, notably maqaf `U+05BE`.
  Rejected; the implementation targets specific combining/accent code points and
  preserves punctuation.
- **Canonicalize catalog genres on write (rewrite `releases.genres`).** Any
  per-user write to a shared catalog row is a data-integrity and abuse risk and
  is irreversible. Rejected — catalog canonicalization is read-time only, raw
  values preserved.
- **Do not canonicalize personal genres on write; canonicalize everything at
  read time.** Workable, but a user who types `רוק` then sees a `רוק` chip that
  filters as `rock` is confusing, and it leaves ambiguous data in the row.
  Chose write-time canonicalization for *known* aliases, read-time as the
  safety net for legacy rows and unknowns.
- **LLM-assisted genre translation / inference.** Violates the AI-boundary rule
  (deterministic code where it is clearly better) and introduces non-determinism
  and cost into a filter path. Rejected — closed deterministic map only.
- **Map Hebrew `פאנק` to `punk`** (it was in the first draft of the alias
  table). `פאנק` is ambiguous — it is the common Hebrew spelling of both "punk"
  and "funk". Mapping it either way is a guess and violates the
  conservative/no-guess contract. Removed; `פאנק` passes through unchanged
  pending a future explicitly approved disambiguation. English `punk` is
  unambiguous and stays mapped.
- **`localeCompare()` with a locale argument but no script bucketing** (DUCET
  interleaving of Hebrew and Latin). Defensible, but users expect "the English
  records, then the Hebrew records" like a physical shelf. Chose explicit
  bucketing.
- **Bundle a Hebrew webfont subset (Inter Hebrew / Noto Sans Hebrew).** Adds
  ~40–70 KB and a font file for a cosmetic seam; contradicts the no-CDN /
  minimal-subset posture and the "don't add a font for architectural purity"
  guidance. Rejected by default; PR 3 may add fallback *family names* only if
  human evidence justifies.
- **A database migration to a Hebrew-aware collation or a normalized search
  column + GIN index.** Not needed — all filtering is client-side by design
  (spec 0007), and `text` stores Hebrew fine. Would be revisited only if
  server-side Hebrew search is ever introduced (out of scope).
- **One implementation branch for the whole enhancement.** Too large to review
  safely and mixes a zero-AI-risk UI change with authoritative curator-path and
  prompt changes. Chose three sequential implementation PRs, each independently
  reviewed/deployed/accepted.
- **Final status / SHA / acceptance work inside implementation PR 3.**
  Temporally impossible — a PR cannot cite its own merge SHA, deploy SHA, or
  human-acceptance result. Chose a separate documentation-only closeout PR after
  PR 3 acceptance, matching the M12 pattern (PR #21).
