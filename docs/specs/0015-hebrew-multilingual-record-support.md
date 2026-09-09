# 0015 Hebrew & Multilingual Record Support (Specification)

Status (2026-09-09): **PLANNING ONLY — not started.** Post-M12 enhancement.
Product contract approved by the human 2026-09-09 (this document records it).
Implementation is planned as three sequential PRs; see
`docs/plans/015-hebrew-multilingual-record-support.md`. Decision record:
`docs/decisions/0007-hebrew-multilingual-record-support.md`.

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
10. No regression to any existing English behaviour, security invariant, or
    curator/vision contract.

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

**6.5 Form fields** that accept dynamic content (manual artist/title,
personal-genre input, VIN request textarea, refinement textarea) get
`dir="auto"` so the caret and text align to the typed script. The surrounding
form stays LTR.

**6.6 Mounted surfaces covered** (dynamic-content render sites, from the audit):
Dashboard (recently added / played / rediscover minis, top-genre chips),
Collection grid + list + genre `<option>` list + filter status,
Album Detail (header eyebrow + title, metadata values, genre chips, notes,
remove dialog), History (row heading, edit/delete dialog titles),
Scan (clue chips, catalogue candidate cards, low-confidence/no-match copy that
interpolates a query), Discover / catalogue candidate cards, VIN
(request echo, recommendation cards, reasons, transcript, constraint lists,
refine panel), toasts that interpolate a record name (none do today — keep it
that way; if one is added it must isolate the name), `AlbumArtwork` accessible
name + decorative overlay.

**6.7 CSS.** `bdi { unicode-bidi: isolate }` as a safety net. Audit the existing
`text-overflow: ellipsis; white-space: nowrap` and `-webkit-line-clamp` blocks
so a clamped element carries `dir` (otherwise the ellipsis sits on the wrong
side). Fix P12 (eyebrow letter-spacing / text-transform for Hebrew content).
Desktop grid track definitions are unchanged.

## 7. Search normalization contract

Applies to Collection search and the Collection genre facet only (the
deterministic client-side filter from spec 0007). **No server, no LLM, no DB
query.**

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

- Comparison is: `buildSearchKey(storedField).includes(buildSearchKey(needle))`,
  where the stored field is `` `${artist}\n${title}` `` (unchanged join).
- The genre facet compares `canonicalizeGenre(buildSearchKey(x))` equality.
- The `?q=` and `?genre=` URL parameters are normalized/canonicalized on read so
  a Hebrew-typed or English-typed link resolves to the same result set (fixes
  P14). No parameter is renamed.
- **Original `releases.artist` / `releases.title` / genre values are never
  rewritten for search.** The key is derived per comparison. Collections are
  bounded (`api.max_rows` 1000; already fully in memory) so per-render derivation
  is acceptable; the implementer may memoize.

**Test data requirement:** normalization tests must use a **meaningful**
example that actually contains a Hebrew combining mark or a compatibility /
presentation form (e.g. a niqqud-pointed word such as `עָטוּר` vs `עטור`, or a
Hebrew presentation form `U+FB2A`–`U+FB4F`). Plain `עברית` must **not** be used
as an NFC/NFD case — it has no decomposable mark.

## 8. Language / script policy

A pure `classifyScript(input: string)` returns one of:
`hebrew` (Hebrew-dominant), `latin` (Latin-dominant), `mixed`, `neutral`
(digits / punctuation / whitespace only or empty).

"Dominant" is defined by the implementer as a clear majority of
script-bearing characters (records the threshold in the PR); a string with
meaningful runs of both scripts is `mixed`.

Examples the classifier must satisfy:

| Input | Class |
|---|---|
| `שלום חנוך` | `hebrew` |
| `Radiohead` | `latin` |
| `שלום Hanoch` | `mixed` |
| `אביב גפן - III` | `hebrew` (the `- III` is a minority run) |
| `1979` | `neutral` |
| `` (empty) | `neutral` |

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

1. Bucket every value by leading meaningful script: `latin`, then `hebrew`,
   then `other/neutral` (numbers, symbols).
2. Within `latin`: A–Z via a shared `Intl.Collator` with an **explicit** locale
   list and options — not the host default. Baseline:
   `new Intl.Collator(['en', 'he'], { numeric: true, sensitivity: 'variant', caseFirst: 'false' })`
   (the implementer may refine the options and records the choice in the PR).
3. Within `hebrew`: א–ת via the same collator.
4. `other/neutral` last.
5. Existing stable tiebreak preserved: original array index
   (`a.index - b.index` in `applyCollectionQuery`).

**Example** — artists `ABBA, Radiohead, David Bowie, אריק איינשטיין, רביד פלוטניק, שלום חנוך`,
sort *Artist A–Z / א–ת*:

```
ABBA
David Bowie
Radiohead
אריק איינשטיין
רביד פלוטניק
שלום חנוך
```

**Determinism:** deterministic given the shipped runtime (full-ICU Node ≥ 24,
evergreen browsers). The script-bucketing step is fully deterministic
regardless of ICU. Tests assert **relative** order, never raw `compare()`
return values.

**UI:** the sort labels may become `Artist A–Z / א–ת` and `Album A–Z / א–ת`
(`COLLECTION_SORTS` label strings). Dashboard/insights ASCII sorts
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
| `פאנק`, `punk` | `punk` |
| `מטאל`, `metal` | `metal` |
| `רגאיי`, `reggae` | `reggae` |
| `קלאסי`, `classical` | `classical` |
| `אלקטרוני`, `electronic` | `electronic` |
| `פולק`, `folk` | `folk` |
| `סול`, `soul` | `soul` |
| `רוק מתקדם`, `progressive rock` | `progressive rock` |
| `רוק ישראלי`, `israeli rock` | `israeli rock` |
| `מזרחית`, `mizrahi` | `mizrahi` |

**10.3 Expanding the map** requires reporting each proposed alias for product
approval. The implementer does **not** add aliases unilaterally.

**10.4 Unknown genre.** Normalized safely, passed through, never guessed, never
translated. A VIN `includeGenres: ["זמר עברי"]` (not in the map, not owned)
produces an honest `no_match`, not a crash and not a wrong bucket.

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
| Invisible formatting controls | App-layer normalization (`buildSearchKey` on the write path where appropriate, and the personal-genre normalizer) should strip undesirable bidi control characters / NBSP where they would otherwise be stored. This is an application choice; it is **not** evidence for a migration. `btrim(x) = x` does not necessarily fail on an unrecognized leading control character — it may simply leave it and the equality still passes. |

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
the server candidate data, never from model text.

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

- **English collections:** search, sort, genre filter, Dashboard insights, and
  VIN must behave **identically** to today for English-only data. Regression
  tests lock this (fixed intent + fixed collection → byte-identical filtered /
  ranked set; fixed artist list → identical order).
- **Existing persisted Hebrew personal genres:** canonicalize correctly at
  read/use time; no backfill, no migration (§11.3).
- **Bookmarked / shared filter URLs:** `?q=` and `?genre=` resolve to the same
  set whether typed in Hebrew or English after normalization; no parameter
  renamed or removed.
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

**Script classification:** the six §8 example rows.

**Search key:** geresh/apostrophe equality; gershayim/quote equality;
maqaf/hyphen/dash equality; NBSP + whitespace-run collapse; a **meaningful**
combining-mark or compatibility-form case (§7 — not plain `עברית`); maqaf is
**preserved** (not stripped as a "mark"); English case-insensitive match still
works; Turkish-locale dotted/dotless `i` does not break the key (locale-
independent lower).

**Sort:** Hebrew-only list in א–ת order; English-only in A–Z; mixed list in
`latin` bucket then `hebrew` bucket; determinism across two runs; `numeric:true`
orders `Vol. 2` before `Vol. 10`; stable tiebreak preserved.

**Canonical genre:** every alias row in §10.2 (all variants → canonical);
`includeGenreMatches('rock','progressive rock')` still true; an unknown Hebrew
genre passes through unchanged and is never mapped; `effectiveGenres` dedupes
`release.genres=['rock']` + `personal_genres=['רוק']` → `['rock']`;
`normalizePersonalGenres(['רוק'])` → `['rock']`;
`normalizePersonalGenres(['זמר עברי'])` → `['זמר עברי']`;
`PersonalGenresEditor` rejects `רוק` when the catalog already has `rock`.

**Dashboard consistency:** `topGenres` counts `רוק`+`rock` as one row and
includes a personally-tagged record; same effective input as Collection.

**VIN (mocked model):**
- model intent `{inScope:true, intent:{includeGenres:['רוק'], decades:[1970], …}}`
  → server canonicalizes → a `genres:['rock'], year:1975` candidate is filtered
  **in**;
- model intent `excludeGenres:['רוק']` → a `rock` candidate is excluded;
- English `includeGenres:['rock']` → filtered/ranked set **byte-identical** to
  pre-change (regression guard);
- refinement `"בלי רוק"` → `excludeGenres` canonicalized; English refinement
  unchanged;
- selection: Hebrew `request` + Hebrew-named candidate → mocked model returns a
  Hebrew `reason` and the verbatim Hebrew artist/title; `validateSelection`
  still rejects an out-of-set id and still assembles card facts from
  `candidatesById`;
- server select includes `personal_genres` (assert the select string / mocked
  row shape);
- telemetry: an out-of-scope Hebrew request records exactly one `curator_intent`
  row and zero `curator_selection`.

**Vision (mocked):** recognition returning Hebrew `artist` / `albumTitle` /
`visibleText` survives `normalizeRecognition` unchanged and produces the correct
`buildCatalogQueryFromRecognition` output; mixed-case Latin `visibleText` dedupe
still works.

**UI (attributes only):** `BidiText` sets `dir="auto"` always, `lang="he"` for
`hebrew`, no `lang` for `latin` / `mixed` / `neutral`; a Hebrew VIN
recommendation card wraps title/artist in `<bdi>` and its `aria-label` contains
the isolate characters; History row heading isolated; Scan candidate cards
isolated.

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
4. Sort *Artist A–Z / א–ת*: English block, then Hebrew block in א–ת order; same
   result on reload.
5. Album Detail of a Hebrew record: header/eyebrow render correctly, no
   letter-spacing artefacts.
6. History with Hebrew plays: rows read correctly; mobile layout still correct.
7. VoiceOver spot check: a Hebrew title in a card is announced as Hebrew.

**After PR 2 (genres + VIN):**
8. Tag one English `rock` record; add personal genre `רוק` to another. Dashboard
   "Top genres" shows one `rock` row counting both; Collection genre filter
   `rock` returns both; the personal genre saved as `rock`.
9. VIN `"תן לי רוק רגוע משנות ה-70"` → owned 70s rock records, **Hebrew
   reasons**, best-match marked, artist/album names in original script.
10. VIN refine `"בלי רוק"` → rock records drop out of the next set.
11. VIN English regression: an equivalent English request behaves as before.
12. VIN out-of-scope Hebrew (`"כתוב לי שיר"`) → out-of-scope notice, no
    recommendation, one `curator_intent` telemetry row, zero `curator_selection`.
13. VIN unknown Hebrew genre → honest "no owned records match", not a crash.

**After PR 3 (scan + polish):**
14. Scan a Hebrew sleeve → clues show Hebrew artist/title; catalogue candidates
    render right-to-left; confirm → record added with Hebrew metadata.
15. Scan an English sleeve → unchanged.
16. Full mobile + desktop regression across Dashboard / Collection / Discover /
    Scan / Ask VIN / History / Settings: chrome still English/LTR, content
    gutter unchanged, no overflow.

## 22. Definition of Done

- All three PRs merged to `main`, each reviewed independently, each deployed from
  merged `main`, each human-accepted per §21.
- Every automated gate green from a clean checkout for the final `main`.
- English behaviour verified unchanged (search, sort, genre filter, Dashboard,
  VIN) by regression tests and human spot check.
- Hebrew and mixed records display, search, sort, filter, recommend, and scan
  correctly, desktop and mobile; chrome unchanged.
- One canonical effective-genre taxonomy across Collection, Dashboard, and VIN;
  the curator server loads `personal_genres`.
- Hebrew VIN requests/refinements canonicalize deterministically server-side;
  no genuine listening request is silently reduced to `no_match` by language;
  reasons are in the request language; artist/title never translated.
- Cover recognition preserves the original script.
- No schema/migration change; no dependency change; no new secret/env var; no
  new bundled webfont (unless PR 3 human visual evidence justifies a fallback
  family name — additive stack entry only, no new file).
- All curator/vision security invariants (§18) hold; pgTAP unchanged and green.
- `docs/decisions/0007-*` accepted; at implementation closeout,
  `docs/architecture.md`, `docs/ai-design.md`, `docs/data-model.md`,
  `docs/security.md`, `README.md`, `docs/verification.md`, and the
  `docs/specs/README.md` / `docs/decisions/README.md` indexes are reconciled
  (closeout, not part of this planning PR).
- Historical roadmap `docs/roadmaps/2026-08-18-complete-project-roadmap.md`
  byte-unchanged
  (`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`).
