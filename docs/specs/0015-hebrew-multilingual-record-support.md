# 0015 Hebrew & Multilingual Record Support (Specification)

Status (2026-09-09): **PLANNING ONLY — not started.** Post-M12 enhancement.
Product contract approved by the human 2026-09-09 (this document records it).
Implementation is planned as **three sequential implementation PRs, then one
documentation-only closeout PR** (the M12 final-closeout pattern); see
`docs/plans/015-hebrew-multilingual-record-support.md`. Decision record:
`docs/decisions/0007-hebrew-multilingual-record-support.md`.

Rev 2 (2026-09-09): independent review corrections — final closeout moved to a
separate docs-only PR (no implementation PR may claim post-merge evidence); the
English-compatibility contract now names the approved personal-genre /
alias-dedupe deltas explicitly; the genre facet (`availableGenres`,
`matchesGenre`, `?genre=`) moves entirely to the canonical-genre PR so PR 1 has
no genre-semantics change; the ambiguous Hebrew alias `פאנק` is removed from the
map; the script-dominance rule is fully specified; the real-provider human-test
budget is bounded.

Rev 3 (2026-09-09): implementation-readiness micro-corrections —
`buildSearchKey` is comparison-only and never runs on a write path (§7, §12);
`CollectionBrowser` keeps `?q=` raw (only orthographic variants fold, no
cross-script aliasing) (§7, §19.4); native `<option>` labels are not wrapped in
`<bdi>` — `dir`/`lang` go on the `<option>` (§6.6); `PageHeader` keeps its
`string` API and stable-`title` focus contract (§6.9); sort labels stay
English-only (`Artist alphabetical` / `Album alphabetical`) (§9); Goal 10
narrowed to allow the §19.2 deltas; `H(שלום חנוך) = 8` corrected (§8); the
`AlbumArtwork` fallback isolates title and artist separately (§6.7).

Rev 4 (2026-09-09): final implementation-readiness corrections — the sort uses
**two script-specific `Intl.Collator` singletons** (`'en'` / `'he'`), never a
`['en','he']` fallback array (§9); PR 1 gives `dir="auto"` to **every mounted
free-text input/textarea**, including the primary catalog-search box moved out
of PR 3 (§6.5); PR 1's BiDi scope explicitly covers the VIN recommendation
`reason`, the full `PersonalGenresEditor` display, and the `AlbumDetailPage`
remove-dialog title isolation, so PR 2 stays an AI/genre-semantics change with
no BiDi repair (§6.8, §14).

Rev 5 (2026-09-09, PR #23 pre-merge review): §7 free-text search compares the
artist and title as SEPARATE fields (`buildSearchKey(artist).includes(needle) ||
buildSearchKey(title).includes(needle)`), preserving the spec-0007 artist-OR-title
contract — the earlier joined `` `${artist}\n${title}` `` phrasing is removed
because `buildSearchKey` collapses the newline and would have introduced a new
cross-field match. §9 other/neutral order clarified as true Unicode
scalar-code-point comparison (not UTF-16 `<`). No status change; general docs
untouched.

Baseline `main` when this spec was written:
`dd3f9485c44d84fdc8a285c2889bdbe1cf779e1b` (PR #21 — M12 final closeout).

This spec supersedes nothing. It extends earlier milestone contracts in three
places, each noted inline:

- **Spec 0007 (Browse / Search / Filter)** — the deterministic client-side
  collection search and sort gain script-aware normalization and an explicit
  `Intl.Collator` policy.
- **Spec 0010 / 0011 (AI Curator + Refinement)** and **ADR 0006 §Consequences**
  — the curator server load now includes `collection_items.personal_genres`
  (ADR 0006 explicitly deferred this "VIN integration"), and validated model
  genre output is canonicalized server-side before hard filtering. No curator
  security or schema contract changes.
- **Spec 0006 (Photo Recognition)** — the vision system prompt gains a
  preserve-original-script instruction. No recognition schema change.

References (do not duplicate): `intent.txt` §4.4, §15, §16, §29; `AGENTS.md`
(AI Boundaries, Recommendation Safety, Image Recognition, Security, Scope
Control); `docs/ai-design.md`; `docs/data-model.md`; `docs/security.md`;
`docs/decisions/0004`, `0005`, `0006`.

---

## 1. Purpose

Vinyl Intelligence already stores Unicode metadata and production has already
returned Hebrew MusicBrainz results. This enhancement makes user- and
record-owned **dynamic content** first-class multilingual content — Hebrew in
particular — so that Hebrew and English records coexist naturally in one
collection.

Examples that must work end to end: `שלום חנוך` / `מחכים למשיח`,
`אריק איינשטיין` / `שבלול`, `טונה`, `רביד פלוטניק`, `אביב גפן`.

The **application chrome stays English and left-to-right**. This is not a
translation or localization project. The goal is correct handling of the
listener's own records and words.

## 2. Current-state problem

Evidence gathered in the pre-spec audit (against `HEAD dd3f948`):

| # | Problem | Where | Severity |
|---|---|---|---|
| P1 | No bidirectional-text handling anywhere. `grep` for `dir=`, `<bdi`, `unicode-bidi`, `Intl.Collator` across `src/` and `netlify/` returns nothing. Mixed Hebrew/English strings (`` `${artist} - ${title}` ``, `View {title} by {artist}`, `Genres: {…}`, transcript `recommended {titles}`) reorder and mis-place punctuation. | `src/media/AlbumArtwork.tsx:118`, `src/curator/CuratorRecommendationCard.tsx:182,199`, `src/pages/HistoryPage.tsx:59`, `src/pages/AlbumDetailPage.tsx:139,250`, `src/curator/CuratorPanel.tsx:51`, `src/curator/CuratorTranscript.tsx:11`, `src/catalog/ScanPanel.tsx:99,466`, `src/catalog/CatalogCandidateCard.tsx:33` | HIGH |
| P2 | Collection artist/title sort uses `String.prototype.localeCompare()` with **no locale argument** → order depends on the host default locale and the ICU build; no defined mixed-script policy. | `src/collection/collectionQuery.ts:203-205` | MEDIUM |
| P3 | Collection search is a raw lowercased substring match. It does not tolerate NFC/NFKC differences, Hebrew combining marks (niqqud / cantillation), geresh/gershayim vs ASCII quote, maqaf vs hyphen, or whitespace/NBSP runs. | `src/collection/collectionQuery.ts:129-137,159-170` | MEDIUM |
| P4 | **No genre canonicalization exists.** Schema/normalizers only trim + lowercase + dedupe. `רוק`, `Rock`, `rock` are distinct tokens in the effective taxonomy. | `src/lib/curator/intentSchema.ts:131-171`, `src/lib/supabase/collection.ts:499-540`, `src/lib/catalog/musicbrainz.ts:229-274` | HIGH |
| P5 | The three genre consumers already disagree **today, in English**: Collection filter uses `effectiveGenres(item)` (catalog ∪ personal); Dashboard `topGenres` reads `item.release.genres` only; the curator server select loads `release.genres` only (no `personal_genres`). | `src/collection/collectionQuery.ts:57-59`, `src/lib/dashboard/insights.ts:227-244`, `netlify/functions/_shared/curator-handlers.mts:320,342-346` | MEDIUM |
| P6 | A Hebrew VIN request that yields a Hebrew genre constraint (`includeGenres: ["רוק"]`) passes schema validation, then `includeGenreMatches("רוק","rock")` returns false for every candidate → the request is silently reduced to `no_match`. A Hebrew `excludeGenres: ["רוק"]` is silently inert (`["rock"].includes("רוק")` is false). | `src/lib/curator/candidates.ts:88-112,132-147` | HIGH |
| P7 | The intent / refinement prompts never tell the model to emit genre constraints in canonical English; the server never canonicalizes model genre output. | `src/lib/curator/intentSchema.ts:82-118`, `src/lib/curator/refinementSchema.ts:31-72` | HIGH (pairs with P6) |
| P8 | The selection prompt has no response-language instruction; a Hebrew request may get an English `reason` (model-dependent, not guaranteed). | `src/lib/curator/selectionSchema.ts:52-75` | MEDIUM |
| P9 | The vision system prompt does not require preserving the original script; the model may transliterate `שלום חנוך` → `Shalom Hanoch`. | `src/lib/vision/openrouter.ts:62-80` | MEDIUM |
| P10 | Bundled fonts are Latin-subset only (verified: 0 Hebrew codepoints in all three `.woff2`); no explicit Hebrew fallback family is named in the stacks. Hebrew renders through `system-ui` / `Georgia` fallback — acceptable but visually seamed. | `public/fonts/README.md`, `src/styles/tokens.css:62-66` | LOW |
| P11 | No `lang` / `dir` on any dynamic Hebrew content, including `aria-label` strings — screen readers mispronounce Hebrew and read mixed runs in the wrong order. | throughout mounted components | MEDIUM |
| P12 | `AlbumDetailPage` passes `release.artist` as the `PageHeader` eyebrow, which CSS renders `text-transform: uppercase; letter-spacing: 0.13em` — letter-spacing on Hebrew forces inter-letter gaps and detaches combining marks. | `src/pages/AlbumDetailPage.tsx:139`, `src/styles/pages.css:73-74` | MEDIUM |
| P13 | `PersonalGenresEditor` blocks a personal genre that duplicates a catalog genre by comparing lowercased raw strings; after canonicalization it must compare **canonical** forms or `רוק` can be added when the catalog already has `rock`. | `src/collection/PersonalGenresEditor.tsx:68,83` | MEDIUM (regression risk) |
| P14 | `?genre=` / `?q=` URL params are matched by exact post-lowercase equality; a bookmarked `?genre=רוק` only matches Hebrew-stored genres. | `src/collection/CollectionBrowser.tsx:98`, `src/collection/collectionQuery.ts:159-170` | MEDIUM |

**No database schema/constraint blocks Hebrew storage** — see §12. **No
migration is required.**

## 3. Goals

1. Hebrew and mixed Hebrew/English record metadata display correctly on every
   mounted surface, desktop and mobile, without altering the English/LTR chrome.
2. Bidirectional isolation of every dynamic field so surrounding English
   punctuation and layout never reorder unexpectedly.
3. Hebrew-aware, deterministic Collection search that tolerates the normalization
   differences listed in §7 — **without ever rewriting stored metadata**.
4. Deterministic sort: English A–Z and Hebrew א–ת, with an explicit mixed-script
   bucket order, independent of the host default locale.
5. One canonical effective-genre taxonomy shared by Collection, Dashboard, and
   VIN, built from a **closed, deterministic** alias map (§ genre contract).
6. Hebrew VIN requests and refinements behave correctly: genre constraints are
   canonicalized deterministically server-side; a genuine listening request is
   never silently reduced to `no_match` by a language mismatch.
7. Recommendation reasons are written in the language of the user's request;
   artist and album names are always the verbatim authoritative candidate facts.
8. Cover recognition preserves the original visible script.
9. Accessibility: correct `lang` / `dir` / isolation for dynamic Hebrew content
   while `<html lang="en">` stays.
10. No regression to existing English behaviour, security invariants, or the
    curator/vision contracts — **except** the explicitly approved compatibility
    deltas in §19.2 (personal genres begin participating in Dashboard insights
    and VIN candidate genres; approved aliases dedupe to one canonical genre).

## 4. Non-goals

Explicitly out of scope for this enhancement:

- Full Hebrew UI translation / localization of the application chrome.
- RTL application chrome; changing `<html lang="en">` or the document direction.
- Automatic artist/title transliteration in either direction.
- Cross-script aliasing such as `Shalom Hanoch` ↔ `שלום חנוך` (may be a future
  optional enhancement; not built here).
- Replacing MusicBrainz, Cover Art Archive, Supabase, or OpenRouter.
- RAG / vector search / embeddings for genre or anything else.
- Country- or Israel-specific product logic; vinyl-format filtering.
- Dependency upgrades or additions (no new runtime dependency; no new bundled
  webfont by default).
- A database migration — **unless** later implementation evidence proves one is
  genuinely necessary, in which case implementation STOPS and returns to the
  human (see §12, §17).
- LLM-driven genre translation or genre inference of any kind.
- Model changes; response-schema changes; changes to nonce / untrusted-data
  framing; relaxation of allowed-candidate-ID validation.
- Touching the deferred, unmounted legacy component subtree (`CollectionPanel`,
  `CatalogPanel`, `CatalogPhotoPanel`, `CollectionItemCard`, `ListeningHistory`)
  — M12 deferred it and it stays deferred.

## 5. Terminology

| Term | Meaning in this spec |
|---|---|
| **Chrome** | Fixed application UI: navigation, buttons, headings, labels, empty/loading/error copy. Always English, always LTR. |
| **Dynamic content** | Values that come from a record, the catalog, the user, or a model: artist, album/release title, label, genre, personal genre, notes, the VIN request text, VIN refinement text, VIN recommendation reasons, transcript lines, recognition clues. |
| **BiDi isolation** | Wrapping a dynamic run so its directionality cannot leak into or reorder the surrounding text. In markup: `<bdi dir="auto">`. In a plain string (e.g. `aria-label`): `U+2068` (FSI) … `U+2069` (PDI). |
| **Search key** | A derived, normalized string used **only** for search comparison. Never stored, never displayed, never written back. |
| **Canonical genre** | The single lowercase English string a known alias resolves to (e.g. `rock`). Produced by the closed alias map. |
| **Effective genres** | The canonicalized, deduplicated union of a record's catalog genres and its owner's personal genres. The only genre set the filter / insight / ranking paths consume. |
| **Catalog genre** | A genre on the shared `releases` row (from MusicBrainz or a manual release). Raw persisted value is never rewritten. |
| **Personal genre** | A genre the owner added on their own `collection_items` row. Owner-owned; canonicalized at the write-normalization boundary (§ personal-genre policy). |
| **Script buckets** | For sorting: `latin`, `hebrew`, `other/neutral`. |
| **Hebrew-dominant / Latin-dominant / mixed / neutral** | Script classification of a string (§ language/script policy). |

## 6. BiDi policy

**6.1 Chrome is unchanged.** No `dir` attribute on the root, `AppShell`,
navigation, or any static label. `<html lang="en">` stays.

**6.2 Every dynamic field is BiDi-isolated.** A shared `BidiText` primitive
renders `<bdi dir="auto" lang={…}>` (see §8 for `lang`). It wraps **one field**
(a title, an artist, a label, a genre chip, a note, a reason, a transcript
line), never a phrase.

**6.3 Sentence-level containers isolate only the dynamic run.** For UI like
`Remove "{title}"?`, `Genres: {list}`, `recommended {a}, {b}`, the surrounding
English stays `dir="ltr"` and only the interpolated dynamic value is wrapped in
`<bdi>`. Applying `dir="auto"` to the whole sentence is **incorrect** here — a
leading Hebrew value would flip the entire sentence (see §Risk R1).

**6.4 `aria-label` / plain-string contexts** use Unicode isolate controls
(`U+2068` … `U+2069`) around the dynamic run via an `isolate()` helper, because
those contexts cannot contain elements.

**6.5 Every mounted free-text input/textarea that can hold Hebrew/mixed user or
record text gets `dir="auto"`** so the caret and editable text align to the
typed script. Only the editable text direction changes — the surrounding form
and chrome stay LTR, no stored value is rewritten, no validation/semantics
change. The full PR 1 list:

- collection search input (`CollectionBrowser`)
- `CollectionForm` free-text metadata fields — at minimum `artist`, `title`,
  `label`, `country`, `genre`; `releaseYear` stays numeric / LTR;
  `catalogNumber` / `format` may also take it if the shared generic input makes
  it simpler and neutral/Latin values do not regress
- `PersonalGenresEditor` personal-genre draft input
- `AlbumDetailPage` → `NotesEditor` `<textarea>`
- Dashboard Quick VIN input
- the primary catalog-search query input (`CatalogSearchForm`) — done in PR 1,
  not deferred to PR 3
- curator request textarea and refinement textarea

Scan-only manual fallback fields that are genuinely part of the Scan
final-polish path may stay in PR 3.

**6.6 Native `<option>` elements are NOT wrapped.** A native `<option>` may not
contain a `<bdi>` / `BidiText` element — its child must be a plain string. For a
dynamic option label (the genre facet `<option>`), keep the child a plain
string and put the direction/language on the `<option>` itself where the browser
honours it, e.g. `<option value="רוק" dir="auto" lang="he">רוק</option>` (`lang`
from `classifyScript`, `hebrew` only). The `<select>` stays LTR. In PR 1 the
option **value** and genre semantics are unchanged — only the rendered
direction/lang may change.

**6.7 `AlbumArtwork` decorative fallback isolates each field separately.** The
fallback overlay carries a separate title and artist. Each is wrapped in its own
`BidiText` (or `<bdi dir="auto">`) so `Hebrew title + English artist` and
`English title + Hebrew artist` both read correctly. The overlay is
`aria-hidden` (the accessible name comes from the `role="img"` `aria-label`,
which uses `isolate()` per §6.4). The parent artwork box layout is unchanged.

**6.8 Mounted surfaces covered** (dynamic-content render sites, from the audit):
Dashboard (recently added / played / rediscover minis, top-genre chips),
Collection grid + list + genre `<option>` labels (per §6.6) + filter status,
Album Detail (header eyebrow + title, metadata values, genre chips, notes,
remove dialog), History (row heading, edit/delete dialog titles),
Scan (clue chips, catalogue candidate cards, low-confidence/no-match copy that
interpolates a query), Discover / catalogue candidate cards, VIN
(request echo, recommendation cards, **`recommendation.reason`** — isolated in
PR 1 as preparation for the request-language reason PR 2 introduces, so PR 2 is
not a BiDi repair — title, artist, per-value genres, transcript, constraint
lists, refine panel), `PersonalGenresEditor` (catalog + personal genre chips,
and `isolate(genre)` inside the `Remove {genre}` `aria-label`), toasts that
interpolate a record name (none do today — keep it that way; if one is added it
must isolate the name), `AlbumArtwork` accessible name + decorative overlay
(per §6.7).

**6.9 `PageHeader` keeps its string API and focus contract.** `PageHeader`'s
props stay `title: string` and `eyebrow?: string` — they are **not** widened to
`ReactNode`. `PageHeader` itself renders each dynamic string through the
BiDi primitive internally. The existing focus-on-route-change effect stays keyed
on the stable `title` **string** (`useEffect(..., [focusOnMount, title])`), so
it does not observe a new JSX object every render and the current accessibility
focus behaviour does not regress.

**6.10 CSS.** `bdi { unicode-bidi: isolate }` as a safety net. Audit the existing
`text-overflow: ellipsis; white-space: nowrap` and `-webkit-line-clamp` blocks
so a clamped element carries `dir` (otherwise the ellipsis sits on the wrong
side). Fix P12 (eyebrow letter-spacing / text-transform for Hebrew content).
Desktop grid track definitions are unchanged.

## 7. Search normalization contract

Applies to the Collection **free-text search** only — the `?q=` / `matchesSearch`
path of the deterministic client-side filter from spec 0007. **No server, no
LLM, no DB query.**

The Collection **genre facet** (`availableGenres`, `matchesGenre`, the `?genre=`
URL parameter) is **out of scope for `buildSearchKey`**; its
normalization/canonicalization is specified in §10 / §13 and lands with the
canonical-genre work (plan PR 2), not with the free-text search work (plan
PR 1). PR 1 makes **no genre-semantics change**.

A pure `buildSearchKey(input: string): string` derives a comparison key by, in
order:

1. **Unicode compatibility normalization** suitable for a search key — prefer
   **NFKC** unless implementation evidence shows a narrower form is safer
   (the implementer records the chosen form and the evidence in the PR).
2. **Remove only actual Hebrew combining marks** — cantillation and niqqud
   (points). The implementation must target the specific point/accent code
   points and must **not** remove Hebrew *punctuation* that shares the broad
   `U+05xx` area (notably **maqaf `U+05BE`**, geresh `U+05F3`, gershayim
   `U+05F4`, sof pasuq `U+05C3`, paseq `U+05C0`). The audit's broad
   `[֑-ׇ]` strip is **rejected** because that range includes maqaf.
3. **Fold punctuation variants** to one canonical form each:
   - geresh `U+05F3`, ASCII apostrophe `'`, right single quote `U+2019`,
     modifier prime `U+02B9` → one form;
   - gershayim `U+05F4`, ASCII quote `"`, right double quote `U+201D`,
     modifier double-prime `U+02BA` → one form;
   - maqaf `U+05BE`, hyphen-minus `-`, non-breaking hyphen `U+2011`,
     en dash `U+2013`, em dash `U+2014` → one form.
4. **Collapse whitespace**, including NBSP `U+00A0` and other Unicode spaces,
   to a single ASCII space; trim.
5. **Locale-independent lowercase** (`String.prototype.toLowerCase()`, **not**
   `toLocaleLowerCase()`).

**Rules:**

- `buildSearchKey` is **comparison-only**: it is never persisted, never used to
  rewrite `artist` / `title` / `label` / `notes`, and never runs in a DB
  INSERT/UPDATE normalization path. It strips niqqud and folds punctuation, so
  applying it to persisted metadata would violate the original-metadata
  preservation contract. (Personal genres have their own dedicated
  canonicalization/write policy — §11 — which is unrelated to `buildSearchKey`.)
- Data flow: `?q=` → `filters.search` → the search input, then `matchesSearch`
  derives `needle = buildSearchKey(query)` and compares it against the **artist
  and the title as SEPARATE fields** — the historical Collection contract
  (spec 0007) is a substring of `artist` OR `title`, never a cross-field join:
  `buildSearchKey(artist).includes(needle) || buildSearchKey(title).includes(needle)`.
  The query text is unchanged **apart from the pre-existing leading/trailing
  whitespace trim** performed when `CollectionBrowser` serializes `?q`
  (`if (f.search.trim()) p.set('q', f.search.trim())` — unchanged runtime
  behaviour). `CollectionBrowser` **never** writes `buildSearchKey(q)` or any
  multilingual-normalized form (niqqud removal, punctuation folding, lowercasing)
  into the URL or the input. No parameter is renamed. (Rev-note: an earlier
  draft compared a joined `` `${artist}\n${title}` `` string; that is corrected
  here to preserve the approved artist-OR-title semantics — `buildSearchKey`
  collapses the newline, which would otherwise have introduced a new cross-field
  match.)
- What `buildSearchKey` resolves to the same key: **orthographic variants** of
  the same text — niqqud presence/absence, geresh/gershayim vs ASCII quote,
  maqaf vs hyphen/dash, Unicode compatibility/presentation forms, whitespace
  runs / NBSP, and case. It does **not** bridge scripts:
  cross-script aliasing / transliteration (`Shalom Hanoch` ↔ `שלום חנוך`) is a
  non-goal (§4) — a Hebrew query matches Hebrew-script stored text, an English
  query matches Latin-script stored text.
- The `?genre=` parameter is **not** touched in the free-text search work; its
  canonicalization is specified in §10 / §13 and lands with plan PR 2 (fixes
  P14 there).
- **Original `releases.artist` / `releases.title` values are never rewritten for
  search.** The key is derived per comparison. Collections are bounded
  (`api.max_rows` 1000; already fully in memory) so per-render derivation is
  acceptable; the implementer may memoize.

**Test data requirement:** normalization tests must use a **meaningful**
example that actually contains a Hebrew combining mark or a compatibility /
presentation form (e.g. a niqqud-pointed word such as `עָטוּר` vs `עטור`, or a
Hebrew presentation form `U+FB2A`–`U+FB4F`). Plain `עברית` must **not** be used
as an NFC/NFD case — it has no decomposable mark.

## 8. Language / script policy

A pure `classifyScript(input: string)` returns one of `hebrew`, `latin`,
`mixed`, `neutral`.

**Exact deterministic rule (locked — no implementer discretion):**

1. Count `H` = number of **Hebrew letters** and `L` = number of **Latin
   letters** in the input.
2. Count **letters only**. Ignore digits, punctuation, whitespace, and Hebrew
   combining marks / niqqud / cantillation.
3. Classification:
   - `H == 0 && L == 0` → `neutral`
   - `H > 0 && L == 0` → `hebrew`
   - `L > 0 && H == 0` → `latin`
   - both present:
     - `H >= 2 * L` → `hebrew`
     - `L >= 2 * H` → `latin`
     - otherwise → `mixed`

Required examples (all must hold):

| Input | H | L | Class |
|---|---|---|---|
| `שלום חנוך` | 8 | 0 | `hebrew` (ש·ל·ו·ם + ח·נ·ו·ך) |
| `Radiohead` | 0 | 9 | `latin` |
| `שלום Hanoch` | 4 | 6 | `mixed` (6 < 2·4 and 4 < 2·6) |
| `אביב גפן - III` | 7 | 3 | `hebrew` (7 ≥ 2·3) |
| `1979` | 0 | 0 | `neutral` |
| `` (empty) | 0 | 0 | `neutral` |

**`BidiText` behaviour:**

- Always: `<bdi dir="auto">` around the field.
- `lang="he"` is set **only** when `classifyScript` returns `hebrew`.
- `latin` → no `lang` override (inherits document `en`).
- `mixed` / `neutral` → **no `lang` override**. `dir="auto"` handles direction;
  an incorrect single-language override on genuinely mixed content is worse than
  none.

`BidiText` must **not** set `lang="he"` merely because the string contains any
Hebrew character.

## 9. Sorting contract

Extends spec 0007. Applies to the Collection `artist-asc` and `album-asc` sorts.

**Ordering:**

1. Bucket every value by its leading meaningful script: `latin`, then `hebrew`,
   then `other/neutral` (numbers, symbols, empty).
2. **Script-specific collators — a locale *array* is a prioritized fallback
   request, not a per-string policy, so it is NOT used.** Two module-level
   singletons:
   - Latin bucket: `new Intl.Collator('en', APPROVED_OPTIONS)`
   - Hebrew bucket: `new Intl.Collator('he', APPROVED_OPTIONS)`

   `APPROVED_OPTIONS` baseline: `{ numeric: true, sensitivity: 'variant', caseFirst: 'false' }`
   (the implementer may refine and records the choice + rationale in the PR).
3. Compare **Latin-vs-Latin** with the `en` collator, **Hebrew-vs-Hebrew** with
   the `he` collator. Cross-bucket order is fixed by step 1 (Latin < Hebrew <
   other/neutral), so no collator is asked to compare across scripts.
4. `other/neutral` bucket: deterministic **Unicode scalar code-point**
   lexicographic comparison — iterate whole code points so a supplementary
   (non-BMP) character compares by its real scalar value, not by its UTF-16
   surrogate units (a plain string `<` would be UTF-16 code-unit order, which
   differs for non-BMP). No collator. Then the step-5 tiebreak. Locale-
   independent.
5. Existing stable tiebreak preserved for every bucket: original array index
   (`a.index - b.index` in `applyCollectionQuery`).

**Example** — artists `ABBA, Radiohead, David Bowie, אריק איינשטיין, רביד פלוטניק, שלום חנוך`,
sort *Artist alphabetical*:

```
ABBA
David Bowie
Radiohead
אריק איינשטיין
רביד פלוטניק
שלום חנוך
```

**Sort flow (locked):** `value → leading-script bucket → Latin bucket before
Hebrew bucket before other/neutral → Latin-vs-Latin compared with the `en`
collator, Hebrew-vs-Hebrew with the `he` collator, other/neutral by code point →
stable original-index tiebreak`. `numeric: true` applies within the `en` and
`he` collators.

**Determinism:** deterministic given the shipped runtime (full-ICU Node ≥ 24,
evergreen browsers). The script-bucketing step is fully deterministic
regardless of ICU. Tests assert **relative** order, never raw `compare()`
return values.

**UI:** the sort labels stay **English-only** — chrome is English (§6.1). Rename
the two `COLLECTION_SORTS` label strings from `Artist A-Z` / `Album A-Z` to
**`Artist alphabetical`** / **`Album alphabetical`** (a Latin-then-Hebrew list is
not "A–Z"). The sort **values** (`artist-asc`, `album-asc`) and the `?sort=` URL
contract are **unchanged**. Dashboard/insights ASCII sorts
(`added_at` / `id` / `decade` / `ms`) are unchanged; their `localeCompare`
tiebreaks on ASCII genre/decade strings (`insights.ts:222,250`) are unchanged.

## 10. Canonical genre contract

**10.1 A closed, deterministic alias map.** A pure
`canonicalizeGenre(raw: string): string`:

- Normalizes the input (trim, collapse whitespace, fold the same
  punctuation variants as §7, locale-independent lowercase).
- If the normalized value (or a case/punctuation/spacing variant of it) is a
  **known alias**, returns the canonical English value.
- Otherwise returns the **normalized input unchanged** — never guessed, never
  translated, never sent to an LLM.

**10.2 Approved initial alias table.** Case / punctuation / spacing variants of
each alias normalize to the same canonical output.

| Alias(es) | Canonical |
|---|---|
| `רוק`, `rock` | `rock` |
| `ג'אז`, `ג׳אז`, `jazz` | `jazz` |
| `היפ הופ`, `היפ-הופ`, `hip hop`, `hip-hop` | `hip hop` |
| `פופ`, `pop` | `pop` |
| `בלוז`, `blues` | `blues` |
| `punk` | `punk` |
| `מטאל`, `metal` | `metal` |
| `רגאיי`, `reggae` | `reggae` |
| `קלאסי`, `classical` | `classical` |
| `אלקטרוני`, `electronic` | `electronic` |
| `פולק`, `folk` | `folk` |
| `סול`, `soul` | `soul` |
| `רוק מתקדם`, `progressive rock` | `progressive rock` |
| `רוק ישראלי`, `israeli rock` | `israeli rock` |
| `מזרחית`, `mizrahi` | `mizrahi` |

The table has **15 canonical outputs**. Hebrew `פאנק` is **deliberately not
mapped** — it is ambiguous between "punk" and "funk", so mapping it either way
would violate the conservative / no-guess contract. `פאנק` passes through
unchanged (§10.4) until a future explicitly approved disambiguation strategy
exists. `punk` (English) still canonicalizes to `punk`.

**10.3 Expanding the map** requires reporting each proposed alias for product
approval. The implementer does **not** add aliases unilaterally, and does **not**
add `פאנק → punk` or `פאנק → funk`.

**10.4 Unknown genre.** Normalized safely, passed through, never guessed, never
translated. A VIN `includeGenres: ["זמר עברי"]` or `["פאנק"]` (not in the map,
not owned) produces an honest `no_match`, not a crash and not a wrong bucket.

**10.5 Where canonicalization runs** — read/use time for catalog genres,
write-normalization boundary for personal genres (see §11):

```
catalog genres (raw, persisted)  +  personal genres (canonicalized on write)
                         │
                         ▼   canonicalizeGenres() at read/use
                 canonical effective genres
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 Collection filter  Dashboard insights  VIN candidate filter / rank
```

## 11. Catalog-vs-personal genre persistence policy

Resolves the ambiguity flagged in the audit and consistent with ADR 0006 §2.

**11.1 Catalog / MusicBrainz genres.**

- The raw persisted values on the shared `releases` row are **never** rewritten
  — not translated, not canonicalized on write, not touched by any per-user
  action. RLS already blocks browser writes to catalog `releases` rows; that
  stays.
- Canonicalization for catalog genres happens **only at effective/read/use
  time**, inside the genre accessor.

**11.2 Personal genres** (`collection_items.personal_genres`, owner-owned).

- Known conservative aliases from the §10.2 map **are** canonicalized to
  canonical English **at the personal-genre write-normalization boundary**
  (`normalizePersonalGenres`). So a user who adds `רוק` may see it saved as
  `rock`.
- Unknown / ambiguous personal genres are normalized safely and **preserved as
  entered** — no invented English translation.
- The write path stays within the existing column-scoped `UPDATE
  (personal_genres)` grant and own-row RLS; no schema or grant change.
- `PersonalGenresEditor`'s "already a catalog genre" dedupe check compares
  **canonical** forms after this change (fixes P13).

**11.3 Backward compatibility.** Any personal Hebrew alias already persisted in
production (e.g. a stored `רוק`) is canonicalized correctly at read/use time by
the same accessor, so existing rows behave correctly with **no data migration
and no backfill**. A subsequent user edit of that record's personal genres
re-normalizes and may persist the canonical form; that is acceptable and
expected.

## 12. Data / DB conclusion

**No migration is required.** Evidence:

| Concern | Evidence |
|---|---|
| Text columns | `releases.artist/title/label/catalog_number/country/format` and `collection_items.notes` are `text`; `char_length()` limits count code points, not bytes; Hebrew strings are well within limits. (`supabase/migrations/20260819000100`) |
| Genre arrays | `releases.genres` / `collection_items.personal_genres` are `text[]` validated by `public.release_genres_valid`: `g = btrim(g) and g = lower(g) and char_length(g) between 1 and 40`. Hebrew is caseless, so `g = lower(g)` holds; `btrim` is a no-op on Hebrew letters and points. (`20260830120000`, `20260904121000`) |
| Encoding / collation | Supabase Postgres is UTF-8; `text` stores any Unicode; all filtering/sorting for this enhancement is client-side (spec 0007 deliberately added no GIN index). |
| Invisible formatting controls | `btrim(x) = x` does not necessarily fail on an unrecognized leading bidi control / NBSP — it may leave the character and the equality still passes. This is **not** evidence for a migration. |

**`buildSearchKey` must never run on a write path.** It is comparison-only
(§7): it strips niqqud and folds punctuation, so using it to normalize persisted
`artist` / `title` / `label` / `notes` would violate the original-metadata
preservation contract. If undesirable invisible-control sanitization of
persisted text is ever genuinely needed, it must be a **separate,
narrowly-scoped sanitizer** (strip only bidi controls / NBSP, nothing else),
justified by concrete evidence — **not** introduced in this planning PR and
**not** `buildSearchKey`. Personal genres keep their own dedicated
canonicalization/write policy (§11.2), which is unrelated.

If implementation nonetheless surfaces a concrete case where correct Hebrew
storage or retrieval is impossible without a schema change, implementation
**STOPS** and the finding (with exact evidence) is returned to the human before
any migration is written.

## 13. Collection / Dashboard / VIN consistency contract

One effective-genre interpretation across all three:

- **Collection** filter, genre facet, and `availableGenres` consume
  `effectiveGenres(item)` → canonical.
- **Dashboard** `insights.topGenres` consumes the **same** canonical
  `effectiveGenres` input (today it reads `item.release.genres` only — P5).
  Its `MIN_INSIGHT_ITEMS` gate then counts records with ≥ 1 effective genre.
- **VIN** server `loadOwnedCollection` selects `collection_items.personal_genres`
  in addition to `release.genres` (ADR 0006 §Consequences deferred this), and
  the candidate genre list is the canonical effective set.
- Album Detail may still display the raw catalog chips ("as tagged") separately
  for transparency, but every **filter / rank / insight** path uses the
  canonical effective set.

`collection_items.notes` remains **excluded** from all model context (unchanged
from spec 0010 / 0011 / `docs/security.md`).

## 14. VIN contract

All current curator security and model contracts are maintained. Explicitly
**unchanged**: the two-call pipeline and its model roles (ADR 0004); the strict
JSON schemas (`curator_intent_result`, `curator_refinement`,
`curator_selection`); `provider: { require_parameters: true }`; `temperature: 0`;
the `{ inScope, intent }` scope wrapper; the nonce-fenced untrusted-data blocks
and `untrustedFramingNote`; allowed-candidate-ID validation and rejection of
out-of-set IDs; the ≤ 12 backend-generated candidate cap; the bounded refinement
state; per-user rate limits; `model_calls` telemetry shape; "notes / user id /
provider ids never sent to the model"; exactly two provider calls per successful
request (one for a no-match, zero for an empty collection / out-of-scope).

**No model change. No response-schema change. No allowed-ID relaxation. No
change to nonce / untrusted-data framing. No notes sent to the model.**

**Two-level genre defense:**

1. **Trusted prompt (level 1).** `INTENT_SYSTEM_PROMPT` and
   `REFINEMENT_SYSTEM_PROMPT` gain one instruction: emit `includeGenres` /
   `excludeGenres` values as lowercase English genre names (e.g. `rock`, `jazz`,
   `hip hop`), regardless of the request language.

2. **Authoritative deterministic normalization (level 2).** After the existing
   `normalizeCuratorIntent` validation, each `includeGenres` / `excludeGenres`
   entry is passed through `canonicalizeGenre` **server-side**, before hard
   filtering. This runs whether or not the model followed the prompt. It is a
   normalization step of the same kind as the existing trim / lowercase / dedupe
   and the "exclusion dominates" rule; it does not relax any schema check and
   does not expand curator authority.

The candidate genre list on the other side of `includeGenreMatches` /
`excludeGenres` equality is the canonical effective set (§13), so both sides
share one vocabulary. `includeGenreMatches` keeps its current token-subsequence
semantics; `excludeGenres` keeps exact canonical equality (the deliberate
asymmetry from spec 0010 / M11 Phase H is preserved).

**Selection prompt** (`SELECTION_SYSTEM_PROMPT`) gains: write each `reason` in
the language of the USER REQUEST; copy artist and album names verbatim from the
candidate facts — never translate or transliterate them. The `reason`
`maxLength` (300) already accommodates Hebrew; **no schema change**. Card facts
(artist, title, year, genres, rating, favorite, play data) continue to come from
the server candidate data, never from model text. The `CuratorRecommendationCard`
already renders a Hebrew `reason` / title / artist / genre correctly — those are
BiDi-isolated in PR 1 — so this prompt change is a behaviour change, not a UI
repair.

**`no_match` / constraint display** (`describeConstraints`, `CuratorTranscript`)
then shows canonical English genres, plus the Hebrew `mood` text — all
BiDi-isolated per §6.

## 15. Vision contract

Extends spec 0006. The recognition JSON schema is **unchanged** — `artist`,
`albumTitle`, `label`, `catalogNumber`, `notes` are already `['string','null']`
and `visibleText` is a string array; all Unicode-capable
(`src/lib/vision/openrouter.ts:28-57`).

`RECOGNITION_SYSTEM_PROMPT` gains: preserve `artist`, `albumTitle`, `label`,
`catalogNumber`, and `visibleText` in the original script printed on the cover;
do not translate or transliterate; report Latin text only when Latin text is
actually printed on the sleeve.

Downstream is already Unicode-safe and unchanged:
`normalizeRecognition` / `cleanText` slice by UTF-16 unit (Hebrew is BMP);
`normalizeVisibleText` dedupes by `.toLowerCase()`;
`buildCatalogQueryFromRecognition` only collapses whitespace and slices to 120;
`URLSearchParams` percent-encodes the Hebrew query for MusicBrainz (production
has already returned Hebrew results). The Scan candidate UI and clue chips get
BiDi isolation per §6. **No query-builder change, no schema change, no model
change.**

## 16. Accessibility contract

- `<html lang="en">` stays.
- Dynamic Hebrew content: `BidiText` emits `dir="auto"` always and `lang="he"`
  only for Hebrew-dominant strings (§8).
- `aria-label` / plain-string contexts: `isolate()` around the dynamic run
  (`U+2068`/`U+2069`), not `dir="auto"` on the whole English sentence.
- Native `<option>`: attributes on the `<option>` itself, plain-string child
  (§6.6).
- `AlbumArtwork` decorative fallback: title and artist each isolated separately
  (§6.7).
- Clamped / ellipsized elements carry `dir` so the truncation marker is placed
  correctly.
- Fix P12: neutralize `letter-spacing` and `text-transform` on the
  `.vi-page-header__eyebrow` when its content is Hebrew (scoped `:lang(he)` or a
  modifier class — implementer's choice).
- No visual-geometry assertions in automated tests (jsdom has no BiDi engine);
  assert attributes (`dir`, `lang`, presence of isolate characters).
- Screen-reader spot checks are part of human acceptance (§18).

## 17. Data / DB conclusion (summary)

**NO migration required.** See §12 for evidence. If implementation proves
otherwise, STOP and return the evidence to the human.

## 18. Security invariants

Unchanged and re-affirmed:

- All provider secrets stay server-side; no new secret; no new environment
  variable.
- Model output stays untrusted: schema validation, allowed-ID validation, and
  the nonce-fenced untrusted blocks are unchanged. Genre canonicalization is a
  post-validation normalization, not a trust boundary change.
- `canonicalizeGenre` is pure, closed, deterministic, and never calls a model.
- Vision confirmation-before-persist is unchanged; recognition images are still
  never persisted.
- `collection_items.notes` is still never sent to any model.
- Upload validation (type / size) is unchanged.
- No per-user write to a shared `releases` row (catalog genres stay read-only to
  the browser).
- Displayed user/record text stays escaped by React; `BidiText` adds isolation,
  not `dangerouslySetInnerHTML`.
- Prompt changes are trusted `system`-message text, version-controlled, and
  reviewed; they add no data to any request and retain nothing new.

## 19. Compatibility / backward-compatibility

**19.1 What must NOT change for English data:**

- **English free-text search and sort** behave exactly as today for English
  input (search is still a case-insensitive substring match; an all-English
  artist/title list sorts in the same order, now via a pinned `en`
  `Intl.Collator` rather than the host default locale — asserted with a fixed
  English fixture).
- **Canonical English catalog-genre semantics** are unchanged: `rock` is still
  `rock`, an already-canonical English catalog genre is untouched by the alias
  map.

**19.2 Approved intentional deltas (these ARE expected to change behaviour):**

- **Personal genres begin participating in Dashboard genre insights.** An
  English-only collection that has any `personal_genres` may show different
  "Top genres" counts / gate behaviour after PR 2. This is the §13 consistency
  fix.
- **Personal genres begin participating in VIN candidate genres.** An
  English-only collection with `personal_genres` may filter / rank differently
  in VIN after PR 2, because the curator server now loads `personal_genres`
  (closing the ADR 0006 deferral).
- **Approved aliases dedupe to one canonical genre.** `רוק`/`Rock`/`rock`
  collapse to a single `rock` row/value everywhere.

**19.3 No other English behaviour may change.** Any English-visible
search/sort/filter/insight/rank change **beyond** the three deltas in §19.2 is a
defect → STOP (plan PR 2 §2.7).

**19.4 Regression fixtures.** A "byte-identical curator filter/rank" regression
fixture **must** use `personal_genres: []` and already-canonical English catalog
genres — that is the configuration in which the output is required to be
unchanged. A fixture with non-empty `personal_genres` or a non-canonical alias
tests one of the §19.2 deltas, not the no-change guarantee.

- **Existing persisted Hebrew personal genres:** canonicalize correctly at
  read/use time; no backfill, no migration (§11.3).
- **Bookmarked / shared filter URLs:** `?q=` and `?sort=` keep their exact
  current contract — the query text is written to `?q=` unchanged apart from the
  pre-existing leading/trailing whitespace trim; no multilingual-normalized form
  is ever written into the URL or input. Two `?q=` links whose values are
  **orthographic variants of the same text** (niqqud, punctuation form,
  whitespace, case) now resolve to the same records because `buildSearchKey`
  folds them at comparison time; a Hebrew query and an English query are still
  distinct (no cross-script aliasing — §4). `?genre=` is unchanged in PR 1;
  PR 2 canonicalizes its value on read. No parameter renamed
  or removed.
- **`sessionStorage` collection-view key and catalog-search draft:** unaffected
  (they store view mode / query text, not genre tokens).
- **Curator refinement `context.previousIntent`:** already round-trips through
  `normalizeCuratorIntent`; adding canonicalization there is idempotent for
  English and safe for a stored Hebrew alias.
- **Dashboard top-genre counts** for a mixed collection **will change** (a
  `רוק` + `rock` split collapses to one row; personally-tagged records now
  count). This is the intended consistency fix; it is called out for human
  acceptance (§18 / plan PR 2).

## 20. Test requirements

Automated (Vitest unit/integration + existing Netlify function tests in
`netlify/tests/`; pgTAP unchanged). **No real provider call in any test.**

**Script classification:** the six §8 example rows exactly, including
`H(שלום חנוך) == 8`, `H(אביב גפן - III) == 7 / L == 3 → hebrew`,
`שלום Hanoch → mixed`.

**Search key:** `buildSearchKey` is comparison-only (no test persists it or
feeds it to a write path); geresh/apostrophe equality; gershayim/quote equality;
maqaf/hyphen/dash equality; NBSP + whitespace-run collapse; a **meaningful**
combining-mark or compatibility-form case (§7 — not plain `עברית`); maqaf is
**preserved** (not stripped as a "mark"); English case-insensitive match still
works; Turkish-locale dotted/dotless `i` does not break the key (locale-
independent lower); a Hebrew query does **not** match Latin-script stored text
and vice versa (no cross-script aliasing).

**Sort:** Hebrew-only list in א–ת order (via the `he` collator); English-only in
A–Z (via the `en` collator); mixed list = Latin bucket then Hebrew bucket then
other/neutral; a value that would sort differently under `['en','he']` vs a
dedicated `he` collator confirms the script-specific collators are wired
(not a fallback array); `other/neutral` (a numeric / symbol name) sorts by code
point deterministically; determinism across two runs; `numeric:true` orders
`Vol. 2` before `Vol. 10` within a bucket; stable original-index tiebreak
preserved in every bucket. The two renamed `COLLECTION_SORTS` labels are
`Artist alphabetical` / `Album alphabetical` (English-only, no Hebrew glyphs in
chrome) and the sort **values** / `?sort=` contract are unchanged.

**Canonical genre:** every alias row in §10.2 (all variants → canonical, 15
canonical outputs); `includeGenreMatches('rock','progressive rock')` still true;
an unknown Hebrew genre passes through unchanged and is never mapped;
**`canonicalizeGenre('פאנק')` returns `'פאנק'` unchanged** (ambiguous punk/funk —
deliberately not mapped) while `canonicalizeGenre('punk')` returns `'punk'`;
`effectiveGenres` dedupes `release.genres=['rock']` + `personal_genres=['רוק']`
→ `['rock']`; `normalizePersonalGenres(['רוק'])` → `['rock']`;
`normalizePersonalGenres(['זמר עברי'])` → `['זמר עברי']`;
`normalizePersonalGenres(['פאנק'])` → `['פאנק']`;
`PersonalGenresEditor` rejects `רוק` when the catalog already has `rock`.

**Dashboard consistency:** `topGenres` counts `רוק`+`rock` as one row and
includes a personally-tagged record; same effective input as Collection.

**VIN (mocked model — no live provider call):**
- model intent `{inScope:true, intent:{includeGenres:['רוק'], decades:[1970], …}}`
  → server canonicalizes → a `genres:['rock'], year:1975` candidate is filtered
  **in**;
- model intent `excludeGenres:['רוק']` → a `rock` candidate is excluded;
- **English regression guard:** with a fixture of `personal_genres: []` and
  already-canonical English catalog genres, `includeGenres:['rock']` produces a
  filtered + ranked set **byte-identical** to pre-change;
- refinement `"בלי רוק"` → `excludeGenres` canonicalized; English refinement with
  the §19.4 fixture unchanged;
- selection: Hebrew `request` + Hebrew-named candidate → mocked model returns a
  Hebrew `reason` and the verbatim Hebrew artist/title; `validateSelection`
  still rejects an out-of-set id and still assembles card facts from
  `candidatesById`;
- server select includes `personal_genres` (assert the select string / mocked
  row shape); candidate genres are the canonical effective set;
- telemetry: an out-of-scope Hebrew request records exactly one `curator_intent`
  row and zero `curator_selection`.

English regression, out-of-scope Hebrew, and unknown-Hebrew-genre behaviour are
covered here as **mocked** regression tests; they do **not** require a live
provider call in human acceptance (§21) unless a new defect specifically needs
one.

**Vision (mocked):** recognition returning Hebrew `artist` / `albumTitle` /
`visibleText` survives `normalizeRecognition` unchanged and produces the correct
`buildCatalogQueryFromRecognition` output; mixed-case Latin `visibleText` dedupe
still works.

**UI (attributes only):** `BidiText` sets `dir="auto"` always, `lang="he"` for
`hebrew`, no `lang` for `latin` / `mixed` / `neutral`; `BidiText` renders as a
`<bdi>` (never nested inside an `<option>`); a Hebrew VIN recommendation card
wraps title/artist in `<bdi>` and its `aria-label` contains the isolate
characters; History row heading isolated; Scan candidate cards isolated; the
genre-facet `<option>` carries `dir`/`lang` on the `<option>` itself with a
plain-string child; the `AlbumArtwork` fallback wraps title and artist in
separate `<bdi>` elements; `PageHeader` keeps `title: string` / `eyebrow?:
string` and the focus effect still depends on the `title` string (no new object
identity per render).

**Every automated gate must pass from a clean checkout** before each PR opens:
`npm run typecheck`, `npm run lint` (0 warnings), `npm run test:run`,
`npm run build`, `npx supabase test db`, `npx supabase db lint`,
`npm audit --omit=dev`.

## 21. Human acceptance requirements

On the existing production account, after each PR merges and deploys (existing
M12 practice — no new account, no email-flow test unless an auth defect appears).
A **provider-forced-failure** human test is **not** required and must not be
claimed. Signup / email-confirmation flows are **not** re-exercised.

**After PR 1 (foundation):**
1. Add ≥ 3 Hebrew records manually alongside existing English ones.
2. Collection grid + list: Hebrew titles/artists read right-to-left within their
   cells; English unchanged; no horizontal overflow at 390–430 px or on desktop.
3. Search `שלום`, `חנוך`, `ג'אז` (ASCII apostrophe) find Hebrew records;
   `bowie` still works.
4. Sort *Artist alphabetical* (English label): the Latin-script artists appear
   first in A–Z order, then the Hebrew-script artists in א–ת order; same result
   on reload.
5. Album Detail of a Hebrew record: header/eyebrow render correctly, no
   letter-spacing artefacts.
6. History with Hebrew plays: rows read correctly; mobile layout still correct.
7. VoiceOver spot check: a Hebrew title in a card is announced as Hebrew.

**After PR 2 (genres + VIN).** Real-provider budget: **exactly two Hebrew VIN
interactions (≈ 4 model calls total** — the pipeline makes two per successful
interaction). No English, out-of-scope, or unknown-genre live calls (those are
mocked regression per §20).

8. **(no provider)** Tag one English `rock` record; add personal genre `רוק` to
   another. Dashboard "Top genres" shows one `rock` row counting both;
   Collection genre filter `rock` returns both; the personal genre saved as
   `rock`.
9. **Live interaction A — one Hebrew initial VIN request** that exercises Hebrew
   free text and includes an approved canonicalizable Hebrew genre, e.g.
   `"תן לי רוק רגוע משנות ה-70"`. Verify: Hebrew recommendation reason;
   original-script artist/title (not transliterated); best-match marked; only
   owned records; correct owned-candidate filtering (70s rock).
10. **Live interaction B — one Hebrew refinement**, e.g. `"בלי רוק"`. Verify the
    refinement canonicalizes and rock records drop out of the next set.

**After PR 3 (scan + polish).** Real-provider budget: **one Hebrew Vision
recognition call.**

11. **Live — scan one Hebrew sleeve** → clues show Hebrew artist/title;
    catalogue candidates render right-to-left; confirm → record added with
    Hebrew metadata.
12. **(no provider)** Scan an English sleeve behaves as before — covered by
    mocked regression (§20); re-run live only if a defect appears.
13. **(no provider)** Full mobile + desktop regression across Dashboard /
    Collection / Discover / Scan / Ask VIN / History / Settings: chrome still
    English/LTR, content gutter unchanged, no overflow.

## 22. Definition of Done

The enhancement is **three implementation PRs followed by one
documentation-only closeout PR** (the M12 final-closeout pattern). No
implementation PR may claim evidence — a merge SHA, a deploy SHA, a "final
`main`", a human acceptance result — that can only exist after it merges.

**Implementation PRs (1, 2, 3) — done when:**

- Each is independently reviewed, human-approved, merged with a normal merge
  commit, deployed from merged `main`, and human-accepted per §21 (with the
  §21 real-provider budget — ≈ 4 model calls in PR 2, one Vision call in PR 3).
- Every automated gate is green from a clean checkout for that PR's head.
- English behaviour is verified unchanged per §19.1 / §19.3 (no change beyond
  the §19.2 deltas), locked by the §19.4 regression fixtures and a human spot
  check.
- PR 1: Hebrew/mixed records display, free-text search, and sort correctly on
  every mounted surface, desktop + mobile; chrome unchanged; **no
  genre-semantics change**.
- PR 2: one canonical effective-genre taxonomy across Collection, Dashboard, and
  VIN; the curator server loads `personal_genres`; Hebrew VIN
  requests/refinements canonicalize deterministically server-side; no genuine
  listening request is silently reduced to `no_match` by language; reasons are
  in the request language; artist/title never translated; all curator security
  invariants (§18) hold.
- PR 3: cover recognition preserves the original script; Scan renders Hebrew
  correctly; the accessibility/BiDi sweep is complete; the typography decision
  is made and recorded; pgTAP unchanged and green.
- No schema/migration change; no dependency change; no new secret/env var; no
  new bundled webfont (PR 3 may add a Hebrew fallback **family name** to a CSS
  stack only if human visual evidence justifies it — additive entry only, no
  new file).
- `docs/decisions/0007-*` stays `accepted`.

**Final documentation-only closeout PR — done when** (after PR 3 production
acceptance):

- `docs/specs/0015-*` and `docs/plans/015-*` status → **COMPLETE**, with the
  final `main` SHA, the three implementation-PR merge SHAs, and the three
  production deploy SHAs.
- The final human acceptance evidence for all three PRs is recorded in
  `docs/verification.md` (existing account; no provider-forced-failure test; no
  signup/email test; the exact real-provider call counts).
- `docs/architecture.md`, `docs/ai-design.md`, `docs/data-model.md`,
  `docs/security.md`, `README.md` are reconciled to as-built.
- `docs/specs/README.md` and `docs/decisions/README.md` gain the 0015 / 0007
  index entries; `docs/decisions/0007-*` gets an "implemented and verified" note.
- `intent.txt` is updated **only if** product intent / stakeholders /
  constraints / DoD / scope genuinely changed (likely a one-line appendix that
  multilingual dynamic content is in scope); otherwise untouched.
- This PR changes **documentation only** — no runtime / CSS / test / config /
  dependency change, no deploy, no provider call.
- Historical roadmap `docs/roadmaps/2026-08-18-complete-project-roadmap.md`
  byte-unchanged
  (`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`).
