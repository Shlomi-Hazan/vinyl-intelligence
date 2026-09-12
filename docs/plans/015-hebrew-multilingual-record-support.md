# 015 Hebrew & Multilingual Record Support (Implementation Plan)

Status (2026-09-09): **PLANNING ONLY — not started.**
Spec: `docs/specs/0015-hebrew-multilingual-record-support.md`.
Decision: `docs/decisions/0007-hebrew-multilingual-record-support.md`.
Baseline `main`: `dd3f9485c44d84fdc8a285c2889bdbe1cf779e1b` (PR #21).

Rev 2 (2026-09-09): independent review corrections — (1) a separate
documentation-only **closeout PR** after PR 3 acceptance holds all
final-status / final-SHA / final-acceptance / general-docs work; no
implementation PR claims post-merge evidence; (2) the English-compatibility
contract and PR 2 stop condition now name the approved personal-genre /
alias-dedupe deltas; (3) the genre facet (`availableGenres`, `matchesGenre`,
`?genre=`) is entirely PR 2 — PR 1 makes no genre-semantics change and does not
reference `canonicalizeGenre`; (4) the ambiguous Hebrew alias `פאנק` is removed
from the map; (5) the script-dominance rule is fully specified (spec §8); (6)
the real-provider human-test budget is bounded (≈ 4 model calls in PR 2, one
Vision call in PR 3).

Rev 3 (2026-09-09): implementation-readiness micro-corrections — `buildSearchKey`
is comparison-only, never persisted, never on a write path; `CollectionBrowser`
keeps `?q=` raw (only orthographic variants fold; no cross-script aliasing);
native `<option>` labels are NOT wrapped in `<bdi>` (`dir`/`lang` on the
`<option>`); `PageHeader` keeps `title: string` / `eyebrow?: string` and the
stable-`title` focus dependency; the two sort labels become English-only
(`Artist alphabetical` / `Album alphabetical`); `H(שלום חנוך) = 8`; the
`AlbumArtwork` fallback isolates title and artist separately.

Rev 4 (2026-09-09): final implementation-readiness corrections — (1) the sort
uses **two script-specific `Intl.Collator` singletons** (`'en'` and `'he'`), not
a `['en','he']` fallback array; (2) PR 1 gives `dir="auto"` to **every mounted
free-text input/textarea** (collection search, `CollectionForm` metadata fields,
`PersonalGenresEditor` draft, `NotesEditor`, Quick VIN, the primary
`CatalogSearchForm` query input — moved from PR 3, curator request + refine);
(3) PR 1 BiDi scope now includes the `CuratorRecommendationCard` **reason** (BiDi
prep for the PR 2 Hebrew reason), the full `PersonalGenresEditor` display
(chips + `Remove {genre}` aria + draft input), and the `AlbumDetailPage`
remove-dialog title isolation. PR 2 touches `PersonalGenresEditor` / the
selection prompt for **semantics only** — no BiDi repair.

Rev 5 (2026-09-09, PR #23 pre-merge review): 4 corrections landed in PR 1 —
(1) composite metadata (`metaParts` / `candidateMetaParts`) is rendered as
separate `<bdi>` runs via a new `BidiJoin` helper, never one joined string;
(2) single-field truncation containers (`.vi-albumcard__title`,
`.vi-albumrow__title/__artist`, `.vi-art__title/__artist`) ARE the `<bdi>`
(via `BidiText className`), so the ellipsis is direction-aware; `.vi-histrow__title`
stays a composite LTR container with two isolated runs (smallest safe choice —
no layout change); (3) `matchesSearch` compares artist OR title as separate
fields (no cross-field join); (4) the other/neutral comparator is true Unicode
scalar code-point order (code-point iteration, not UTF-16 `<`). No status
change; general docs untouched.

Rev 6 (2026-09-12, PR #25 pre-merge correction): 3 corrections to the PR 2
canonical-genre / VIN work described below — (1) `src/lib/genre/canonical.ts`
does not import or call `buildSearchKey`; it implements its own narrower
write-path text normalizer (trim / collapse whitespace / fold approved
punctuation / lowercase only — no niqqud stripping, no NFKC), so search-only
normalization can never leak into what is persisted as a personal genre; (2)
the level-1 prompt instruction in `INTENT_SYSTEM_PROMPT` /
`REFINEMENT_SYSTEM_PROMPT` does not ask the model to translate a genre to a
"canonical lowercase English" name — it asks the model to copy an explicitly
named genre verbatim in the user's own wording/script and never
translate/transliterate/guess; level 2 (`normalizeCuratorIntent` →
`canonicalizeGenre`) remains the sole canonicalization authority; (3) added a
focused handler test proving a record whose only matching genre lives in
`personal_genres` (not the catalog `release.genres`) survives the curator hard
filter. No status change; general docs untouched.

**Three sequential implementation PRs, then one documentation-only closeout
PR** (the M12 final-closeout pattern). **Do not create one giant branch.** Each
implementation PR starts from **then-current `main`** after the previous PR is
independently reviewed, merged, deployed from merged `main`, and human-accepted.
The closeout PR starts from `main` after PR 3 is accepted.

Global constraints for every PR (from the spec + `AGENTS.md`):

- No dependency add/upgrade. No new environment variable / secret.
- No database migration. No Supabase config change. No Netlify config change.
- No model change. No response-schema change. No change to nonce /
  untrusted-data framing. No allowed-candidate-ID relaxation. Notes never sent
  to a model.
- No change to the deferred, unmounted legacy subtree.
- `<html lang="en">` and LTR chrome unchanged.
- Historical roadmap `docs/roadmaps/2026-08-18-*` byte-unchanged
  (`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`).
- Every automated gate green from a clean checkout before a PR opens; an
  independent review before merge; a human production acceptance before the
  next PR starts.
- Any finding that would require a migration, a dependency, a schema/model
  change, or a security-contract change → **STOP and return to the human**.

Automated gate (run for every PR, from a clean checkout / temp clone where
practical):

```
npm ci
git diff --check
npm run typecheck
npm run lint            # 0 warnings
npm run test:run
npm run build
npx supabase start && npx supabase test db && npx supabase db lint
npm audit --omit=dev
```

Deploy step (only after human-approved merge): `npx netlify deploy --prod
--context production --message "…"`, then non-provider smoke (`/`,
`/api/health`, one SPA deep link), then STOP for human acceptance.

---

## PR 1 — Multilingual UI Foundation

**Goal:** BiDi isolation, script classification, Hebrew-aware search, and the
deterministic sort. **Zero AI-behaviour change. Zero genre-semantics change.**

**Risk level: LOW–MEDIUM.** New pure modules are low risk; the search/sort
rewrites touch a shipped deterministic path (spec 0007) and can shift English
tie-breaks — regression tests lock that. CSS integration across ~8 surfaces is
the main review surface.

### 1.1 Expected scoped files

New:
- `src/lib/i18n/script.ts` — `classifyScript(s): 'hebrew'|'latin'|'mixed'|'neutral'`
- `src/lib/i18n/searchKey.ts` — `buildSearchKey(s): string` (comparison-only)
- `src/lib/i18n/collator.ts` — **two module-level singletons**
  `new Intl.Collator('en', APPROVED_OPTIONS)` and
  `new Intl.Collator('he', APPROVED_OPTIONS)` (not a `['en','he']` array — that
  is a fallback request, not a per-string policy), plus `compareNames(a,b)`:
  bucket by leading script (Latin → Hebrew → other/neutral), compare
  Latin-vs-Latin with the `en` collator, Hebrew-vs-Hebrew with the `he`
  collator, other/neutral by code point, then the stable original-index
  tiebreak. `APPROVED_OPTIONS` baseline `{ numeric: true, sensitivity: 'variant', caseFirst: 'false' }`.
- `src/lib/i18n/isolate.ts` — `isolate(s): string` (FSI/PDI wrap)
- `src/components/BidiText.tsx` — `<bdi dir="auto" lang={…}>` primitive
- Test files for each of the above.

Modified (runtime):
- `src/collection/collectionQuery.ts` — **only** `matchesSearch` (compares
  `needle = buildSearchKey(query)` against the artist and title as SEPARATE
  fields — `buildSearchKey(artist).includes(needle) || buildSearchKey(title).includes(needle)`
  — preserving the spec-0007 artist-OR-title contract; comparison only, nothing
  persisted) and `compareBySort` (uses `compareNames`); rename the
  two `COLLECTION_SORTS` **label strings** to `Artist alphabetical` /
  `Album alphabetical` (English-only — chrome stays English; a Latin-then-Hebrew
  list is not "A–Z"). Sort **values** (`artist-asc` / `album-asc`) and the
  `?sort=` contract are unchanged. **`availableGenres`, `matchesGenre`, and any
  `?genre=` handling are NOT touched in PR 1** — they move to PR 2 with the
  canonical-genre module.
- `src/collection/CollectionBrowser.tsx` — `BidiText` on card title/artist/meta
  and list-row cells; the genre `<option>` gets `dir`/`lang` **on the `<option>`
  element itself** with a plain-string child (never `<bdi>` inside `<option>` —
  spec §6.6), value/semantics unchanged; filter-status record-name context
  isolated. **`?q=` is not multilingual-normalized**: the query text is written
  to `?q=` / the input unchanged apart from the pre-existing leading/trailing
  whitespace trim; `buildSearchKey` is derived only inside `matchesSearch` for
  the comparison — `CollectionBrowser` never writes `buildSearchKey(q)` or any
  normalized form into the URL or input. The `?genre=` param is unchanged in
  PR 1.
- `src/pages/AlbumDetailPage.tsx` — `BidiText` on the metadata values and genre
  chips (display only in PR 1 — no canonicalization yet); the **remove dialog**
  copy isolates the interpolated `release.title` as a dynamic run
  (`isolate()` / `<bdi>` around the title, English sentence stays `dir="ltr"`);
  the `NotesEditor` `<textarea>` gets `dir="auto"`. Header title/eyebrow are
  isolated **inside `PageHeader`** (below), so the page still passes plain
  strings.
- `src/app/PageHeader.tsx` — keep the props `title: string` and
  `eyebrow?: string` (do **not** widen to `ReactNode`); `PageHeader` renders
  each string through the BiDi primitive internally; the `useEffect` focus
  dependency stays `[focusOnMount, title]` (the stable string), so the
  focus-on-route-change behaviour does not regress.
- `src/pages/HistoryPage.tsx` — `BidiText` on the row heading; the edit/delete
  dialog copy isolates the interpolated record title.
- `src/pages/DashboardPage.tsx` — `BidiText` on `AlbumMini` title/artist; the
  **Quick VIN `<Input>`** gets `dir="auto"`. Genre chips stay untouched in PR 1.
- `src/collection/CollectionForm.tsx` — `dir="auto"` on **every free-text
  metadata control that can hold human-readable text**: at minimum `artist`,
  `title`, `label`, `country`, `genre`. `releaseYear` stays numeric / LTR.
  `catalogNumber` / `format` may also take `dir="auto"` if the shared generic
  text input makes it simpler and neutral/Latin values do not regress.
- `src/collection/PersonalGenresEditor.tsx` — **BiDi display only** (PR 1):
  catalog genre chip text and personal genre chip text → `BidiText`; the
  `Remove {genre}` `aria-label` → `isolate(genre)`; the draft `<input>` →
  `dir="auto"`. (PR 2 revisits this file **only** for canonical dedupe
  semantics; the BiDi behaviour is already in place from PR 1.)
- `src/curator/CuratorRecommendationCard.tsx` — **BiDi preparation for the
  Hebrew reason PR 2 will produce** (this is not an AI change): `BidiText` on
  `recommendation.reason`, `title`, `artist`; each genre value isolated
  individually; `isolate()` around the dynamic title/artist in the art-link
  `aria-label`. No reason **content/language** logic here — that is PR 2.
- `src/curator/CuratorTranscript.tsx` — isolate the user text and the
  `recommended {titles}` dynamic run.
- `src/curator/CuratorPanel.tsx` / `src/curator/CuratorRefinePanel.tsx` —
  `BidiText`/`isolate` on `describeConstraints` values and the transcript;
  `dir="auto"` on the request + refine textareas.
- `src/catalog/CatalogSearchForm.tsx` — **`dir="auto"` on the catalog-search
  query input** (moved from PR 3 into PR 1: the primary catalog search box must
  be multilingual in the foundation PR). PR 3 keeps only the final Scan/Discover
  candidate-rendering sweep.
- `src/catalog/ScanPanel.tsx` — `BidiText` on clue chips and candidate cards;
  isolate the interpolated query in low-confidence/no-match copy. (Any
  Scan-only manual text field may stay PR 3 as final-polish.)
- `src/catalog/CatalogCandidateCard.tsx` / `src/catalog/DiscoverPanel.tsx` —
  `BidiText` on artist/title where rendered.
- `src/media/AlbumArtwork.tsx` — `isolate()` in the computed `aria-label`; the
  decorative fallback overlay wraps **`title` and `artist` in separate `<bdi>`**
  (or `BidiText`) elements so `Hebrew title + English artist` and the reverse
  both read correctly (overlay stays `aria-hidden`; box layout unchanged).

Modified (CSS):
- `src/styles.css` (or a new `src/styles/i18n.css` imported there) —
  `bdi { unicode-bidi: isolate }` safety net.
- `src/styles/pages.css` — neutralize `letter-spacing` / `text-transform` on
  `.vi-page-header__eyebrow` for Hebrew content (scoped `:lang(he)` or modifier).
- `src/styles/components.css`, `src/styles/shell.css` — add `dir` awareness to
  the clamped / `text-overflow: ellipsis` blocks that render dynamic fields.

Modified (runtime, cont.):
- `src/collection/CollectionBrowser.tsx` also gets `dir="auto"` on the
  collection **search `<input>`** (in addition to the `?q=`-raw + option
  handling already listed above).

Modified (tests): `src/collection/collectionQuery.test.ts` and any component
test whose rendered output now contains `<bdi>` wrappers or a new `dir="auto"`
input (`CuratorRecommendationCard.test.tsx`, `CuratorPanel.test.tsx`,
`CuratorRefinePanel.test.tsx`, `HistoryPage.test.tsx`, `DashboardPage.test.tsx`,
`CollectionBrowser.test.tsx`, `CollectionForm.test.tsx` if present,
`PersonalGenresEditor.test.tsx`, `AlbumDetailPage.test.tsx`,
`DiscoverPanel.test.tsx` / catalog search test, `ScanPanel.test.tsx`,
`AlbumArtwork.test.tsx` as needed).

### 1.2 Ordered steps

1. `script.ts` + tests. Implement the **exact locked rule from spec §8** (count
   Hebrew vs Latin **letters** only, ignoring digits / punctuation / whitespace /
   combining marks; `H>=2L → hebrew`, `L>=2H → latin`, else `mixed`; zero letters
   → `neutral`). Assert all six §8 example rows, including `H(שלום חנוך) == 8`
   and `אביב גפן - III` → `hebrew` (H 7, L 3).
2. `searchKey.ts` + tests. **Decide and document the Unicode normalization form**
   (NFKC unless narrower is safer) and the exact combining-mark code points
   removed; assert maqaf `U+05BE` is preserved. Use a meaningful combining-mark /
   presentation-form test case (not plain `עברית`).
3. `collator.ts` + tests. **Two script-specific singletons** — `Intl.Collator('en', …)`
   and `Intl.Collator('he', …)`, **not** a `['en','he']` array (spec §9 / ADR §7).
   Tests: script bucketing (Latin → Hebrew → other/neutral); Latin-vs-Latin via
   `en`, Hebrew-vs-Hebrew via `he`; the §9 example ordering; `other/neutral` by
   code point; determinism across two runs; `numeric:true` within a bucket;
   stable original-index tiebreak.
4. `isolate.ts` + `BidiText.tsx` + tests (attributes only; `BidiText` renders as
   `<bdi>` and is never nested in `<option>`; `lang` policy per §8: `lang="he"`
   only for `hebrew`, none for `latin`/`mixed`/`neutral`).
5. Wire `collectionQuery.ts` — `matchesSearch` compares derived
   `buildSearchKey` values only (nothing persisted), `compareBySort` →
   `compareNames`, rename the two sort **labels** to `Artist alphabetical` /
   `Album alphabetical` (values unchanged). Run `collectionQuery.test.ts` — add
   Hebrew cases and **English regression cases** asserting an identical filtered
   result and identical sort order for English-only fixtures, plus a case that a
   Hebrew query does not match Latin-script stored text. Do **not** touch the
   genre facet.
6. Integrate `BidiText` / `isolate` across the mounted components (§1.1), one
   component per commit where practical — including the `dir="auto"` pass over
   every mounted free-text input/textarea (collection search, `CollectionForm`
   metadata fields, `PersonalGenresEditor` draft, `NotesEditor`, Quick VIN,
   `CatalogSearchForm`, curator request + refine) and the `CuratorRecommendationCard`
   reason/title/artist/genre BiDi preparation for the PR 2 Hebrew reason.
7. CSS safety net + eyebrow fix + clamped-element `dir` audit.
8. Update affected component tests to the new DOM (assert `dir` / `lang` /
   isolate chars, never geometry).
9. Full automated gate from a clean checkout.

### 1.3 Tests to add / update

Per spec §20: script classification (incl. `H(שלום חנוך) == 8`), search key
(comparison-only; maqaf-preserved; a meaningful combining-mark case; a
Hebrew-query-vs-Latin-stored non-match), sort (Hebrew via `he` collator /
English via `en` collator / mixed buckets / other-neutral by code point /
determinism / numeric / stable tiebreak / renamed English labels / **the `en`
and `he` singletons are separate, not a locale array**), `BidiText` attributes
(renders as `<bdi>`, never inside `<option>`), the genre `<option>` carrying
`dir`/`lang` with a plain-string child, the `AlbumArtwork` fallback isolating
title and artist separately, `PageHeader` keeping `title: string` and the
stable-`title` focus dependency, English search+sort regression. Add
`dir="auto"` assertions for the mounted free-text inputs (collection search,
`CollectionForm` metadata fields, `PersonalGenresEditor` draft, `NotesEditor`,
Quick VIN, `CatalogSearchForm`, curator request + refine). Add
`CuratorRecommendationCard` BiDi assertions: `reason` / `title` / `artist`
wrapped, genres isolated individually, `aria-label` contains isolate characters.
Add `PersonalGenresEditor` BiDi assertions: catalog + personal genre chips
wrapped, `Remove {genre}` aria isolated. Add `AlbumDetailPage` remove-dialog
assertion: the interpolated title is an isolated run. Update component
snapshots/queries for the new `<bdi>` wrappers.

### 1.4 Automated gates

The global gate (above). Additionally: `npm run test:run` must show **no**
reduction in the pre-PR test count except where a test is deliberately
rewritten (documented in the PR).

### 1.5 Human gates

Spec §21 "After PR 1" checks 1–7 on the existing production account, desktop +
one phone width (390–430 px). VoiceOver spot check on one Hebrew card.

### 1.6 Explicitly NOT done in PR 1

- **No genre-semantics change of any kind.** `availableGenres`, `matchesGenre`,
  the `?genre=` param, and the `canonicalizeGenre` module are all PR 2. Genre
  chips render raw values as today wrapped in `BidiText`; the genre `<option>`
  renders the raw value as a plain-string child with `dir`/`lang` on the
  `<option>` (no `<bdi>` inside `<option>`). The option **value** is unchanged.
- **No `?q=` multilingual normalization.** The query text is written to `?q=` /
  the input unchanged apart from the pre-existing leading/trailing whitespace
  trim; `buildSearchKey` is comparison-only, never persisted, never on a write
  path, and never written into the URL or input. No cross-script aliasing (a
  Hebrew query does not match Latin-script stored text).
- **No `PageHeader` prop-type change** (`title`/`eyebrow` stay `string`); no
  regression to the route-change focus effect.
- **`dir="auto"` on inputs only changes the editable text direction** — no
  stored value is rewritten, no validation/semantics change; `releaseYear` stays
  LTR.
- **`CuratorRecommendationCard` gets BiDi wrapping but no reason content/language
  logic** — the Hebrew-reason behaviour is PR 2's selection-prompt change.
- **`PersonalGenresEditor` gets BiDi display only** — canonical genre semantics /
  dedupe stay PR 2.
- No Dashboard `topGenres` source change.
- No curator server change; no `personal_genres` in the curator select.
- No prompt change of any kind (intent, refinement, selection, vision).
- No Vision behaviour change (the `CatalogSearchForm` input `dir="auto"` is a
  UI-direction change, not a Vision or catalog-search behaviour change).
- No new webfont; no font-file change.
- No general-docs change; no spec/plan status change (all closeout).
- No schema / migration / dependency / env / Netlify / Supabase change.

### 1.7 Stop conditions

- English free-text search or an all-English sort order cannot be preserved
  without a change users would notice → STOP, report the specific case.
- `Intl.Collator` behaves non-deterministically in the CI/test runtime → STOP,
  report (do not add an ICU dependency).
- The `he` (or `en`) collator is unavailable / falls back in the runtime, or a
  single `['en','he']` array collator is the only thing that passes → STOP,
  report (the two singletons are the contract; do not silently accept a fallback
  array).
- A `BidiText` integration forces a structural change to a shared component that
  ripples beyond the dynamic-field render → STOP, report.
- Isolating the `PageHeader` title/eyebrow cannot be done without widening the
  prop type or changing the focus-effect dependency → STOP, report (the string
  API and focus contract are fixed).
- A native `<option>` needs `<bdi>` inside it to render correctly → STOP, report
  (put the attributes on the `<option>`; do not nest `<bdi>`).

### 1.8 Merge / deploy sequence

Open PR 1 → independent review → human-approved merge (normal merge commit) →
`git pull --ff-only` → deploy merged `main` to production → non-provider smoke →
STOP for human acceptance (§1.5). Only after acceptance does PR 2 begin, from
the then-current `main`.

---

## PR 2 — Canonical Genres + VIN

**Goal:** one canonical effective-genre taxonomy across Collection / Dashboard /
VIN; the personal-genre write policy; the curator two-level genre defense;
request-language recommendation reasons.

**Risk level: MEDIUM.** Changes the authoritative curator filter path and
Dashboard insight counts for mixed collections; three trusted-prompt additions
need a real-provider human retest. All changes are deterministic, closed, and
schema-preserving.

### 2.1 Expected scoped files

New:
- `src/lib/genre/canonical.ts` — `canonicalizeGenre(raw)`, `canonicalizeGenres(list)`,
  and the closed alias map from spec §10.2.
- `src/lib/genre/canonical.test.ts`.

Modified (runtime — client):
- `src/lib/supabase/collection.ts` — `effectiveGenres` canonicalizes on read;
  `normalizePersonalGenres` canonicalizes known aliases at the write boundary
  (spec §11.2), preserving unknowns.
- `src/collection/collectionQuery.ts` — `availableGenres` / `matchesGenre` /
  genre facet consume canonical effective genres; `?genre=` param canonicalized.
- `src/collection/PersonalGenresEditor.tsx` — **semantics only**: the "already a
  catalog genre" dedupe compares canonical forms (fixes P13). Chip `BidiText`,
  the `Remove {genre}` isolate, and the draft-input `dir="auto"` are already in
  place from PR 1 and are not re-touched.
- `src/lib/dashboard/insights.ts` — `topGenres` consumes canonical
  `effectiveGenres(item)` input (not `item.release.genres`); `MIN_INSIGHT_ITEMS`
  gate counts records with ≥ 1 effective genre.
- `src/pages/DashboardPage.tsx` — pass the effective-genre-based `topGenres`
  through unchanged; genre chip `BidiText` and Quick-VIN input `dir="auto"` are
  already from PR 1.
- `src/lib/curator/candidates.ts` — `normalizeGenres` (candidate side) applies
  `canonicalizeGenres`; `includeGenreMatches` / exclude equality operate on the
  canonical vocabulary; token semantics unchanged.
- `src/lib/curator/intentSchema.ts` — after `normalizeCuratorIntent`, map
  `includeGenres` / `excludeGenres` through `canonicalizeGenre` (level-2
  authoritative normalization, the sole canonicalization authority);
  `INTENT_SYSTEM_PROMPT` gains a preserve-wording instruction (level 1): copy
  an explicitly named genre verbatim in the user's own wording/script, never
  translate/transliterate/guess. The model performs no canonicalization or
  language decision — see Rev 6 correction below.
- `src/lib/curator/refinementSchema.ts` — same canonicalization via the shared
  `normalizeCuratorIntent` path; `REFINEMENT_SYSTEM_PROMPT` gains the same
  preserve-wording instruction.
- `src/lib/curator/selectionSchema.ts` — `SELECTION_SYSTEM_PROMPT` gains:
  reason in the request language; artist/title verbatim, never translated. The
  **UI already renders a Hebrew `reason` correctly** — `CuratorRecommendationCard`
  wraps `reason` / `title` / `artist` / genres in `BidiText` from PR 1, so PR 2
  is purely the prompt/behaviour change, not a BiDi repair.

Modified (runtime — server):
- `netlify/functions/_shared/curator-handlers.mts` — `loadOwnedCollection`
  select adds `collection_items.personal_genres`; `normalizeCollectionRow`
  merges catalog + personal genres and applies `canonicalizeGenres`;
  `CuratorCollectionRow` / `CuratorCollectionItem` typing updated accordingly.
  (Thin entrypoints `netlify/functions/curator-*.mts` unchanged.)

Modified (tests):
- `src/lib/curator/candidates.test.ts`, `src/lib/curator/intentSchema.test.ts`,
  `src/lib/curator/refinementSchema.test.ts`, `src/lib/curator/selectionSchema.test.ts`,
  `src/lib/dashboard/insights.test.ts`, `src/collection/collectionQuery.test.ts`,
  `src/collection/PersonalGenresEditor.test.tsx`,
  `netlify/tests/curator-functions.test.ts`.

### 2.2 Ordered steps

1. `canonical.ts` + exhaustive tests for every §10.2 row (15 canonical outputs)
   and the unknown pass-through / no-guess rule. **`canonicalizeGenre('פאנק')`
   must return `'פאנק'` unchanged** (ambiguous punk/funk — deliberately not
   mapped); `canonicalizeGenre('punk')` → `'punk'`. The alias map must not
   contain `פאנק`.
2. `effectiveGenres` + `normalizePersonalGenres` canonicalization + tests
   (dedupe `rock`/`רוק`; unknown personal genre preserved; existing persisted
   alias canonicalizes on read).
3. `collectionQuery` genre facet — `availableGenres` / `matchesGenre` consume
   canonical effective genres; `?genre=` param canonicalized on read (raw label
   still shown). English regression assert with a canonical-English-only fixture.
4. `PersonalGenresEditor` canonical dedupe.
5. `insights.topGenres` → canonical effective input; update `insights.test.ts`
   (one row for `rock`+`רוק`; personally-tagged record counted). This is an
   **approved §19.2 delta** — the English test fixtures for the "unchanged"
   assertions use `personal_genres: []` + canonical catalog genres.
6. `candidates.ts` candidate-side canonicalization; **English regression test**
   using the spec §19.4 fixture (`personal_genres: []`, already-canonical
   English catalog genres): fixed intent + fixed collection → byte-identical
   filtered + ranked set.
7. `intentSchema.ts` level-2 canonicalization + `INTENT_SYSTEM_PROMPT` line;
   `refinementSchema.ts` line; tests for Hebrew `includeGenres` / `excludeGenres`
   → canonical, and English unchanged.
8. `selectionSchema.ts` prompt line; test that `validateSelection` still rejects
   an out-of-set id and assembles facts from `candidatesById` when the mocked
   model returns a Hebrew reason + verbatim Hebrew names.
9. `curator-handlers.mts` select + normalize + types; update
   `netlify/tests/curator-functions.test.ts` (assert `personal_genres` in the
   select; canonical candidate genres; telemetry unchanged).
10. Full automated gate from a clean checkout.

### 2.3 Tests to add / update

Spec §20 "Canonical genre", "Dashboard consistency", and "VIN (mocked model)"
groups in full, plus the English regression guards in steps 6–7.

### 2.4 Automated gates

The global gate. Plus an explicit statement in the PR description that, with the
spec §19.4 fixture (`personal_genres: []` + already-canonical English catalog
genres), the English curator filter/rank output and the English Dashboard
insight output are byte-identical to pre-change (cite the regression tests), and
that the only English-visible deltas are the three approved §19.2 items.

### 2.5 Human gates

Spec §21 "After PR 2" on the existing production account, run **only after** the
automated gate and independent review pass. This is the **only** implementation
PR whose human gate exercises the real curator provider, and it is bounded to:

- check 8 — Dashboard / genre-filter / personal-genre-save verification (**no
  provider call**);
- **live interaction A** — one Hebrew initial VIN request with an approved
  canonicalizable Hebrew genre (verifies Hebrew reason, original-script
  artist/title, correct owned-candidate filtering);
- **live interaction B** — one Hebrew refinement (`"בלי רוק"`, verifies
  refinement canonicalization).

≈ **4 model calls total** (the pipeline makes two per successful interaction).
English regression, out-of-scope-Hebrew, and unknown-Hebrew-genre behaviour are
**mocked** automated coverage (spec §20) and do **not** get a live call unless a
new defect specifically needs one. The two-call-per-interaction budget is
confirmed from `model_calls` telemetry during interactions A and B.

### 2.6 Explicitly NOT done in PR 2

- No response-schema change; `reason` `maxLength` stays 300.
- No model change; no reasoning-effort / token-budget change.
- No change to `includeGenreMatches` token semantics or the include/exclude
  asymmetry.
- No new alias beyond §10.2 (any proposed addition is reported, not added);
  **`פאנק` is not mapped** (ambiguous punk/funk).
- No LLM genre translation / inference.
- No Vision change (PR 3).
- No BiDi / `dir="auto"` work — PR 1 already shipped every mounted genre chip,
  recommendation reason/title/artist, `PersonalGenresEditor` display, and
  free-text input direction. PR 2 touches `PersonalGenresEditor` for canonical
  dedupe **semantics only**.
- No general-docs change; no spec/plan status change (closeout PR).
- No schema / migration / dependency / env / Netlify / Supabase change.
- No notes added to model context.

### 2.7 Stop conditions

- With the spec §19.4 fixture (`personal_genres: []` + already-canonical English
  catalog genres), any English-visible search / sort / filter / insight / rank
  change → STOP. And with any fixture, any English-visible change **beyond** the
  three explicitly approved §19.2 deltas (personal genres now participate in
  Dashboard insights; personal genres now participate in VIN candidate genres;
  approved aliases dedupe to one canonical genre) → STOP, report the case (the
  map is too broad or applied in the wrong place).
- A prompt addition measurably raises the `provider_bad_response` rate or breaks
  the `{ inScope, intent }` wrapper in the mocked tests → STOP, revert the line,
  report.
- The `personal_genres` select or type change ripples into the M9/M10 candidate
  contract in a way that is not a pure additive genre merge → STOP, report.
- Implementation reveals a migration is genuinely needed (e.g. a persisted
  personal genre cannot be canonicalized safely at read time) → STOP, return
  evidence to the human.

### 2.8 Merge / deploy sequence

Open PR 2 → independent review → **automated gate + review both green first** →
human-approved merge → `git pull --ff-only` → deploy merged `main` → non-provider
smoke → human acceptance (§2.5, real provider). Only after acceptance does PR 3
begin, from the then-current `main`.

---

## PR 3 — Scan + Accessibility + Final Runtime Polish

**Goal:** vision preserves the original script; Scan multilingual rendering
completed; final accessibility / BiDi sweep; typography decision. **This is the
last implementation PR — it makes no final-status / final-SHA / general-docs
claim (that is the closeout PR, which cannot run until PR 3 is merged, deployed,
and accepted).**

**Risk level: LOW–MEDIUM.** One trusted vision-prompt line needs a real-provider
human retest; the rest is UI/CSS.

### 3.1 Expected scoped files

Modified (runtime):
- `src/lib/vision/openrouter.ts` — `RECOGNITION_SYSTEM_PROMPT` gains the
  preserve-original-script / no-transliteration instruction (spec §15). **No
  schema change, no query-builder change, no model change.**
- `src/catalog/ScanPanel.tsx` — complete the multilingual rendering started in
  PR 1 (candidate list, clues, low-confidence / no-match / provider-error copy
  that interpolates a Hebrew query or record name); `dir="auto"` on any
  Scan-only manual fallback field genuinely part of the Scan polish path.
- `src/catalog/DiscoverPanel.tsx` — final BiDi sweep of the candidate-rendering
  path. (`CatalogSearchForm`'s query-input `dir="auto"` already landed in PR 1 —
  not re-touched here.)
- Any remaining mounted component with an un-isolated dynamic `aria-label` /
  `title` attribute found in the final sweep (use `isolate()`).

Modified (CSS — only if PR 3 human visual evidence justifies it):
- `src/styles/tokens.css` — append explicit Hebrew fallback family names to the
  `--font-sans` / `--font-display` stacks (e.g. `'Arial Hebrew', 'Noto Sans
  Hebrew', 'David Libre'` before the generic). **Additive stack entries only —
  no new font file, no `@font-face`, no bundled webfont.** If system fallback
  looks acceptable in human testing, this step is skipped and that is recorded.

Modified (tests):
- `src/lib/vision/openrouter.test.ts`, `src/lib/vision/query.test.ts` — mocked
  Hebrew recognition round-trips unchanged; query built correctly.
- `src/catalog/ScanPanel.test.tsx`, `src/catalog/DiscoverPanel.test.tsx` — BiDi
  attributes on candidate cards.

**No documentation change in PR 3** beyond what a code change conventionally
carries inline. The general-docs reconciliation
(`architecture.md`, `ai-design.md`, `data-model.md`, `security.md`, `README.md`,
`verification.md`, the spec/decision index READMEs, the ADR "implemented" note,
`intent.txt` if genuinely needed) and the spec/plan **status → COMPLETE** with
final SHAs and acceptance evidence are the **closeout PR** below.

### 3.2 Ordered steps

1. `RECOGNITION_SYSTEM_PROMPT` line + mocked vision tests (Hebrew recognition
   survives `normalizeRecognition`; `buildCatalogQueryFromRecognition` output
   correct; Latin `visibleText` dedupe still works).
2. Complete `ScanPanel` / `DiscoverPanel` BiDi candidate rendering. (The primary
   catalog search input `dir="auto"` and the curator textareas already landed in
   PR 1; do not re-touch.)
3. Final repo-wide sweep for un-isolated dynamic `aria-label` / `title`
   attributes in mounted components; fix with `isolate()`.
4. Human visual check at phone + desktop widths to decide the typography
   question (spec §13 / P10). Apply the additive fallback stack entries **only**
   if the seam is unacceptable; the decision (either way) is recorded in the
   closeout PR's `docs/verification.md` section.
5. Full automated gate from a clean checkout.
6. Verify the historical roadmap hash is unchanged; confirm no doc/status file
   was touched.

### 3.3 Tests to add / update

Spec §20 "Vision (mocked)" and "UI (attributes only)" groups; ScanPanel /
DiscoverPanel BiDi attribute tests.

### 3.4 Automated gates

The global gate. `npm audit --omit=dev` = 0 (unchanged). The full `npm audit`
dev-only findings are documented, versions unchanged (M12 practice).

### 3.5 Human gates

Spec §21 "After PR 3" on the existing production account. Real-provider budget:
**one Hebrew Vision recognition call** — check 11 (scan one Hebrew sleeve end to
end). Check 12 (English sleeve unchanged) is covered by mocked regression and is
re-run live only if a defect appears; check 13 (full mobile + desktop regression
across the seven mounted routes) is visual, no provider call.

### 3.6 Explicitly NOT done in PR 3

- No recognition schema change; no query-builder change; no model change.
- No new bundled webfont / font file / `@font-face` (only additive fallback
  family names, and only if human evidence justifies).
- No re-doing PR 1's input-direction work — the collection search box,
  `CollectionForm` fields, `PersonalGenresEditor` draft, `NotesEditor`, Quick
  VIN, the primary `CatalogSearchForm` input, and the curator textareas are
  already `dir="auto"` from PR 1.
- No genre / VIN behaviour change (PR 2 owns that).
- No schema / migration / dependency / env / Netlify / Supabase change.
- No changes to the deferred legacy subtree.
- **No general-docs change, no spec/plan status change, no final-SHA / final-
  acceptance claim, no `intent.txt` change** — all of that is the closeout PR.

### 3.7 Stop conditions

- The vision prompt line measurably degrades English recognition or raises the
  `provider_bad_response` rate in mocked tests → STOP, revert the line, report.
- The typography seam is only fixable with a bundled Hebrew webfont → STOP,
  report (do not add the font; the human decides).
- The final sweep finds a dynamic-content security issue (unescaped render,
  injection) → STOP, report immediately.

### 3.8 Merge / deploy sequence

Open PR 3 → independent review → automated gate + review green → human-approved
merge → `git pull --ff-only` → deploy merged `main` → non-provider smoke → human
acceptance (§3.5). On acceptance, the runtime work is complete; the **closeout
PR** below is then opened from the then-current `main`.

---

## Final Documentation Closeout PR (documentation-only)

Opened **after PR 3 production acceptance**, from the then-current `main`. Same
shape as the M12 final-closeout PR (#21).

**Risk level: NONE (documentation only).**

### C.1 Expected scoped files

- `docs/specs/0015-hebrew-multilingual-record-support.md` — status → **COMPLETE**;
  final `main` SHA; the three implementation-PR merge SHAs; the three production
  deploy SHAs.
- `docs/plans/015-hebrew-multilingual-record-support.md` — status → **COMPLETE**;
  same SHAs; per-PR outcome notes.
- `docs/decisions/0007-hebrew-multilingual-record-support.md` — add an
  "implemented and verified" note (status stays `accepted`).
- `docs/architecture.md` — the `src/lib/i18n/*` modules, `BidiText`, the
  canonical-genre module, the effective-genre single-source-of-truth flow.
- `docs/ai-design.md` — the three trusted curator-prompt additions + the vision
  prompt addition; genre canonicalization as an authoritative post-validation
  normalization step; request-language reasons.
- `docs/data-model.md` — no migration; catalog genre canonicalization is
  read-time, personal-genre canonicalization is write-time; the curator load now
  includes `personal_genres` (resolves the ADR 0006 deferral).
- `docs/security.md` — prompt changes reviewed; no new retained data; model
  output still untrusted; canonicalization is normalization, not a trust
  boundary.
- `README.md` — one-line capability note (multilingual dynamic record content).
- `docs/verification.md` — one consolidated "Hebrew & Multilingual Record
  Support" section: per-PR automated gate results, per-PR human acceptance
  (existing account; the exact real-provider call counts — ≈ 4 curator model
  calls in PR 2, one Vision call in PR 3; **no** provider-forced-failure test;
  **no** signup/email test), known limitations, the typography decision.
- `docs/specs/README.md` / `docs/decisions/README.md` — add the 0015 / 0007
  index entries.
- `intent.txt` — **only if** product intent / stakeholders / constraints / DoD /
  scope genuinely changed (likely a one-line appendix that multilingual dynamic
  content is in scope); otherwise untouched.

### C.2 Constraints

Documentation only. No runtime / CSS / test / config / dependency change. No
deploy (the accepted production deploy stays whatever PR 3 produced). No provider
call. Historical roadmap byte-unchanged
(`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`). The
closeout PR records facts that already exist; it invents none.

### C.3 Gate

`git diff --check`; only the C.1 files changed; historical roadmap hash
identical; no runtime/test/config change. Independent review; human-approved
merge (normal merge commit); **no deploy**.

---

## Cross-PR summary

| | PR 1 | PR 2 | PR 3 | Closeout PR |
|---|---|---|---|---|
| Theme | BiDi + search + sort + all input directions | canonical genres + VIN | vision + a11y + Scan sweep | docs / status / evidence |
| AI behaviour change | none | 3 trusted curator-prompt lines + server canonicalization | 1 trusted vision-prompt line | none |
| Genre-semantics change | **none** | all of it | none | none |
| Schema / migration | none | none | none | none |
| Real provider in human gate | no | yes — ≈ 4 curator model calls (1 Hebrew request + 1 Hebrew refine) | yes — 1 Hebrew Vision call | no |
| General-docs / status change | no | no | no | yes (all of it) |
| Risk | LOW–MEDIUM | MEDIUM | LOW | NONE |
| Starts from | `main` @ `dd3f948` | `main` after PR 1 | `main` after PR 2 | `main` after PR 3 |
| New files | 5 + tests | 1 + tests | 0 | 0 |
| Approx. modified runtime files | ~19 | ~10 (incl. 1 `.mts`) | ~3 | 0 |

## Open items requiring product input before the relevant PR

- **PR 2:** the §10.2 alias map is the approved initial set; any addition needs
  product sign-off (spec §10.3).
- **PR 3:** the typography decision (accept system fallback vs. add fallback
  family names) is made from human visual evidence during PR 3, recorded in
  `docs/verification.md`.
- **A4 (date/number locale):** `formatListenedAt` / `historyGrouping` use the
  browser locale for weekday/date/number rendering. Whether to pin these to
  `en` for chrome consistency is **noted, not scheduled** — it is a separate
  small decision, not part of this enhancement unless the human adds it.
