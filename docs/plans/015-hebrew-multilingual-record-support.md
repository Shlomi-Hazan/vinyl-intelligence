# 015 Hebrew & Multilingual Record Support (Implementation Plan)

Status (2026-09-09): **PLANNING ONLY — not started.**
Spec: `docs/specs/0015-hebrew-multilingual-record-support.md`.
Decision: `docs/decisions/0007-hebrew-multilingual-record-support.md`.
Baseline `main`: `dd3f9485c44d84fdc8a285c2889bdbe1cf779e1b` (PR #21).

Three sequential implementation PRs. **Do not create one giant branch.** Each
implementation PR starts from **then-current `main`** after the previous PR is
independently reviewed, merged, deployed from merged `main`, and human-accepted.

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
- `src/lib/i18n/searchKey.ts` — `buildSearchKey(s): string`
- `src/lib/i18n/collator.ts` — shared `Intl.Collator` + `compareNames(a,b)` with script bucketing
- `src/lib/i18n/isolate.ts` — `isolate(s): string` (FSI/PDI wrap)
- `src/components/BidiText.tsx` — `<bdi dir="auto" lang={…}>` primitive
- Test files for each of the above.

Modified (runtime):
- `src/collection/collectionQuery.ts` — `matchesSearch`, `availableGenres`,
  `matchesGenre`, `compareBySort` use the new helpers; `COLLECTION_SORTS` labels
  → `Artist A–Z / א–ת`, `Album A–Z / א–ת`.
- `src/collection/CollectionBrowser.tsx` — `BidiText` on card title/artist/meta,
  list-row cells, genre `<option>` labels, filter-status record name context;
  normalize the `?q=` / `?genre=` param values on read.
- `src/pages/AlbumDetailPage.tsx` — `BidiText` on title, metadata values, genre
  chips (display only in PR 1 — no canonicalization yet), notes render, remove
  dialog title; pass artist/title through `BidiText` via `PageHeader`.
- `src/app/PageHeader.tsx` — accept an isolated/`BidiText` title + eyebrow (allow
  a node or add `dir` handling; keep `focusOnMount` behaviour).
- `src/pages/HistoryPage.tsx` — `BidiText` on the row heading and dialog titles.
- `src/pages/DashboardPage.tsx` — `BidiText` on `AlbumMini` title/artist and the
  Quick-VIN nothing-genre-related bits (genre chips stay untouched in PR 1).
- `src/collection/CollectionForm.tsx` — `dir="auto"` on the artist/title inputs.
- `src/curator/CuratorRecommendationCard.tsx` — `BidiText` on title/artist/genre
  list; `isolate()` in the art-link `aria-label`. (No reason/language change.)
- `src/curator/CuratorTranscript.tsx` — isolate the user text and the
  `recommended {titles}` dynamic run.
- `src/curator/CuratorPanel.tsx` / `src/curator/CuratorRefinePanel.tsx` —
  `BidiText`/`isolate` on `describeConstraints` values and the transcript;
  `dir="auto"` on the request + refine textareas.
- `src/catalog/ScanPanel.tsx` — `BidiText` on clue chips and candidate cards;
  isolate the interpolated query in low-confidence/no-match copy.
- `src/catalog/CatalogCandidateCard.tsx` / `src/catalog/DiscoverPanel.tsx` —
  `BidiText` on artist/title where rendered.
- `src/media/AlbumArtwork.tsx` — `isolate()` in the computed `aria-label`;
  `dir="auto"` on the decorative overlay (`aria-hidden`, visual only).

Modified (CSS):
- `src/styles.css` (or a new `src/styles/i18n.css` imported there) —
  `bdi { unicode-bidi: isolate }` safety net.
- `src/styles/pages.css` — neutralize `letter-spacing` / `text-transform` on
  `.vi-page-header__eyebrow` for Hebrew content (scoped `:lang(he)` or modifier).
- `src/styles/components.css`, `src/styles/shell.css` — add `dir` awareness to
  the clamped / `text-overflow: ellipsis` blocks that render dynamic fields.

Modified (tests): `src/collection/collectionQuery.test.ts` and any component
test whose rendered output now contains `<bdi>` wrappers
(`CuratorRecommendationCard.test.tsx`, `CuratorPanel.test.tsx`,
`HistoryPage.test.tsx`, `DashboardPage.test.tsx`, `CollectionBrowser.test.tsx`,
`ScanPanel.test.tsx`, `AlbumDetailPage.test.tsx` as needed).

### 1.2 Ordered steps

1. `script.ts` + tests (the six §8 example rows; record the "dominant"
   threshold).
2. `searchKey.ts` + tests. **Decide and document the Unicode normalization form**
   (NFKC unless narrower is safer) and the exact combining-mark code points
   removed; assert maqaf `U+05BE` is preserved. Use a meaningful combining-mark /
   presentation-form test case (not plain `עברית`).
3. `collator.ts` + tests (bucketing, `Intl.Collator(['en','he'],…)`, the §9
   example ordering, determinism, `numeric:true`).
4. `isolate.ts` + `BidiText.tsx` + tests (attributes only; `lang` policy per §8).
5. Wire `collectionQuery.ts` to the helpers; run
   `collectionQuery.test.ts` — add Hebrew cases, **add English regression cases**
   asserting identical filtered result and identical sort order for English-only
   fixtures.
6. Integrate `BidiText` / `isolate` across the mounted components (§1.1), one
   component per commit where practical.
7. CSS safety net + eyebrow fix + clamped-element `dir` audit.
8. Update affected component tests to the new DOM (assert `dir` / `lang` /
   isolate chars, never geometry).
9. Full automated gate from a clean checkout.

### 1.3 Tests to add / update

Per spec §20: script classification, search key (incl. maqaf-preserved and a
meaningful combining-mark case), sort (Hebrew / English / mixed / determinism /
numeric / stable tiebreak), `BidiText` attributes, English search+sort
regression. Update component snapshots/queries for the new `<bdi>` wrappers.

### 1.4 Automated gates

The global gate (above). Additionally: `npm run test:run` must show **no**
reduction in the pre-PR test count except where a test is deliberately
rewritten (documented in the PR).

### 1.5 Human gates

Spec §21 "After PR 1" checks 1–7 on the existing production account, desktop +
one phone width (390–430 px). VoiceOver spot check on one Hebrew card.

### 1.6 Explicitly NOT done in PR 1

- No genre canonicalization. Genre chips render raw values as today.
- No Dashboard `topGenres` source change.
- No curator server change; no `personal_genres` in the curator select.
- No prompt change of any kind (intent, refinement, selection, vision).
- No Vision behaviour change.
- No new webfont; no font-file change.
- No schema / migration / dependency / env / Netlify / Supabase change.

### 1.7 Stop conditions

- A search/sort change cannot preserve English behaviour without a semantic
  change users would notice → STOP, report the specific case.
- `Intl.Collator` behaves non-deterministically in the CI/test runtime → STOP,
  report (do not add an ICU dependency).
- A `BidiText` integration forces a structural change to a shared component that
  ripples beyond the dynamic-field render → STOP, report.

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
- `src/collection/PersonalGenresEditor.tsx` — "already a catalog genre" dedupe
  compares canonical forms (fixes P13); chip render already `BidiText` from PR 1.
- `src/lib/dashboard/insights.ts` — `topGenres` consumes canonical
  `effectiveGenres(item)` input (not `item.release.genres`); `MIN_INSIGHT_ITEMS`
  gate counts records with ≥ 1 effective genre.
- `src/pages/DashboardPage.tsx` — pass the effective-genre-based `topGenres`
  through unchanged; genre chip already `BidiText`.
- `src/lib/curator/candidates.ts` — `normalizeGenres` (candidate side) applies
  `canonicalizeGenres`; `includeGenreMatches` / exclude equality operate on the
  canonical vocabulary; token semantics unchanged.
- `src/lib/curator/intentSchema.ts` — after `normalizeCuratorIntent`, map
  `includeGenres` / `excludeGenres` through `canonicalizeGenre` (level-2
  authoritative normalization); `INTENT_SYSTEM_PROMPT` gains the
  canonical-English-genre instruction (level 1).
- `src/lib/curator/refinementSchema.ts` — same canonicalization via the shared
  `normalizeCuratorIntent` path; `REFINEMENT_SYSTEM_PROMPT` gains the same
  genre-vocabulary instruction.
- `src/lib/curator/selectionSchema.ts` — `SELECTION_SYSTEM_PROMPT` gains:
  reason in the request language; artist/title verbatim, never translated.

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

1. `canonical.ts` + exhaustive tests for every §10.2 row and the unknown
   pass-through / no-guess rule.
2. `effectiveGenres` + `normalizePersonalGenres` canonicalization + tests
   (dedupe `rock`/`רוק`; unknown personal genre preserved; existing persisted
   alias canonicalizes on read).
3. `collectionQuery` genre facet + `?genre=` param; English regression assert.
4. `PersonalGenresEditor` canonical dedupe.
5. `insights.topGenres` → canonical effective input; update `insights.test.ts`
   (one row for `rock`+`רוק`; personally-tagged record counted).
6. `candidates.ts` candidate-side canonicalization; **English regression test**:
   fixed intent + fixed collection → byte-identical filtered + ranked set.
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

The global gate. Plus an explicit assertion in the PR description that the
English-only curator filter/rank output is unchanged (cite the regression
test).

### 2.5 Human gates

Spec §21 "After PR 2" checks 8–13 on the existing production account. This is
the **only** PR whose human gate exercises the real provider; run it **only
after** the automated gate and independent review pass. Telemetry check
(check 12) confirms the two-call budget is intact.

### 2.6 Explicitly NOT done in PR 2

- No response-schema change; `reason` `maxLength` stays 300.
- No model change; no reasoning-effort / token-budget change.
- No change to `includeGenreMatches` token semantics or the include/exclude
  asymmetry.
- No new alias beyond §10.2 (any proposed addition is reported, not added).
- No LLM genre translation / inference.
- No Vision change (PR 3).
- No BiDi work beyond what PR 1 already shipped (genre chips are already
  isolated).
- No schema / migration / dependency / env / Netlify / Supabase change.
- No notes added to model context.

### 2.7 Stop conditions

- Canonicalization changes an English-only collection's filter/rank/insight
  output → STOP, report the case (the map is too broad or applied in the wrong
  place).
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

## PR 3 — Scan + Accessibility + Final Polish

**Goal:** vision preserves the original script; Scan multilingual rendering
completed; final accessibility / BiDi sweep; typography decision; documentation
closeout.

**Risk level: LOW–MEDIUM.** One trusted vision-prompt line needs a real-provider
human retest; the rest is UI/CSS/docs.

### 3.1 Expected scoped files

Modified (runtime):
- `src/lib/vision/openrouter.ts` — `RECOGNITION_SYSTEM_PROMPT` gains the
  preserve-original-script / no-transliteration instruction (spec §15). **No
  schema change, no query-builder change, no model change.**
- `src/catalog/ScanPanel.tsx` — complete the multilingual rendering started in
  PR 1 (candidate list, clues, low-confidence / no-match / provider-error copy
  that interpolates a Hebrew query or record name); `dir="auto"` on any manual
  fallback fields not already covered.
- `src/catalog/DiscoverPanel.tsx` / `src/catalog/CatalogSearchForm.tsx` — final
  BiDi sweep of candidate rendering and the search input (`dir="auto"`).
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

Modified (docs — closeout; this is where the general docs are reconciled):
- `docs/architecture.md` — the `src/lib/i18n/*` modules, `BidiText`, the
  canonical-genre module, and the effective-genre single-source-of-truth flow.
- `docs/ai-design.md` — the three trusted-prompt additions; genre
  canonicalization as an authoritative post-validation normalization step;
  request-language reasons.
- `docs/data-model.md` — note: no migration; genre canonicalization is
  read-time for catalog, write-time for personal; the curator load now includes
  `personal_genres` (resolves the ADR 0006 deferral).
- `docs/security.md` — prompt changes reviewed; no new retained data; model
  output still untrusted; canonicalization is normalization not a trust
  boundary.
- `README.md` — a one-line capability note (multilingual dynamic content).
- `docs/verification.md` — one consolidated "Hebrew & Multilingual Record
  Support" section: automated gate results per PR, human acceptance per PR
  (existing account; no provider-forced-failure test; no signup/email test),
  known limitations, the typography decision.
- `docs/specs/README.md` / `docs/decisions/README.md` — add the 0015 / 0007
  index entries.
- `docs/specs/0015-*.md` / `docs/plans/015-*.md` — status → COMPLETE with the
  final `main` SHA and the three merge/deploy SHAs.
- `docs/decisions/0007-*.md` — status already `accepted`; add the
  implemented-and-verified note.
- `intent.txt` — **only if** product intent / DoD / scope genuinely changed
  (likely a short appendix line that multilingual dynamic content is in scope);
  otherwise untouched.

### 3.2 Ordered steps

1. `RECOGNITION_SYSTEM_PROMPT` line + mocked vision tests (Hebrew recognition
   survives `normalizeRecognition`; `buildCatalogQueryFromRecognition` output
   correct; Latin `visibleText` dedupe still works).
2. Complete `ScanPanel` / `DiscoverPanel` / `CatalogSearchForm` BiDi rendering
   + `dir="auto"` on inputs.
3. Final repo-wide sweep for un-isolated dynamic `aria-label` / `title`
   attributes in mounted components; fix with `isolate()`.
4. Human visual check at phone + desktop widths to decide the typography
   question (spec §13 / P10). Apply the additive fallback stack entries **only**
   if the seam is unacceptable; record the decision either way.
5. Full automated gate from a clean checkout.
6. Documentation closeout (§3.1 docs list). Verify the historical roadmap hash
   is unchanged.

### 3.3 Tests to add / update

Spec §20 "Vision (mocked)" and "UI (attributes only)" groups; ScanPanel /
DiscoverPanel BiDi attribute tests.

### 3.4 Automated gates

The global gate. `npm audit --omit=dev` = 0 (unchanged). The full `npm audit`
dev-only findings are documented, versions unchanged (M12 practice).

### 3.5 Human gates

Spec §21 "After PR 3" checks 14–16: Scan a Hebrew sleeve end to end, Scan an
English sleeve (unchanged), full mobile + desktop regression across all seven
mounted routes. This exercises the real vision provider once.

### 3.6 Explicitly NOT done in PR 3

- No recognition schema change; no query-builder change; no model change.
- No new bundled webfont / font file / `@font-face` (only additive fallback
  family names, and only if human evidence justifies).
- No genre / VIN behaviour change (PR 2 owns that).
- No schema / migration / dependency / env / Netlify / Supabase change.
- No changes to the deferred legacy subtree.
- `intent.txt` body unchanged (appendix only, and only if intent genuinely
  changed).

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
acceptance (§3.5). On acceptance, the enhancement is complete; the closeout docs
in this PR are the final reconciliation.

---

## Cross-PR summary

| | PR 1 | PR 2 | PR 3 |
|---|---|---|---|
| Theme | BiDi + search + sort | canonical genres + VIN | vision + a11y + docs |
| AI behaviour change | none | 3 trusted-prompt lines + server canonicalization | 1 trusted vision-prompt line |
| Schema / migration | none | none | none |
| Real provider in human gate | no | yes (once) | yes (once) |
| Risk | LOW–MEDIUM | MEDIUM | LOW–MEDIUM |
| Starts from | `main` @ `dd3f948` | then-current `main` after PR 1 | then-current `main` after PR 2 |
| New files | 5 + tests | 1 + tests | 0 |
| Approx. modified runtime files | ~15 | ~10 (incl. 1 `.mts`) | ~4 |

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
