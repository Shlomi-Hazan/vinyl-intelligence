# 018 Discogs Secondary Catalog Provider (Implementation Plan)

Status: **PLANNING ONLY — NOT IMPLEMENTED.**

Spec: `docs/specs/0018-discogs-secondary-catalog-provider.md` — **merged,
human-approved**, the primary behavioral contract; this plan does not
restate its rationale, only how to execute it. ADR:
`docs/decisions/0008-discogs-secondary-catalog-provider.md` — **merged,
human-approved**.

Starting `main` when this plan was written: `bb00c7cace1144c8c9365ab1b784251cf22f42ac`
(the merge commit of PR #39 — Spec 0018 + ADR 0008, PR head
`9bdf98d1801a2452abaeb0d30addde5ca5686f3f`). Accepted production runtime
remains `abff1e86cbc36c754e8645179fa5bbee9ec27afe`, deploy
`6aaa63fe2829c87037fd2cd0` — this plan does not change either. Historical
freeze tags `ase26-final-submission-2026-09-15` and
`ase26-final-submission-2026-09-16` remain untouched. **No implementation
exists yet.**

**Revision note:** this document was corrected by an independent-review
round (3 BLOCKER / 3 HIGH / 1 MEDIUM) after its initial draft. The findings
are folded directly into the sections below, not preserved as a separate
errata list — this document, as it now reads, is the single authoritative
plan.

This plan is operational: another agent should be able to execute PR B or
PR C from this document plus the spec, without re-deriving product intent or
re-inspecting the whole codebase from scratch. Implementation starts only
after this plan is independently reviewed, human-approved, and merged.

**Three PRs. Do not create one giant branch.**

- **PR A** — this planning PR (`plan/discogs-secondary-catalog-provider`).
- **PR B** — one coherent migration + runtime + automated-test implementation
  PR.
- **PR C** — documentation/screenshot closeout PR, opened only after PR B
  is independently reviewed, merged, deployed, and human-accepted.

## Why one runtime PR, not two

Unchanged from the original analysis: the migration, the Discogs provider
adapters, the extended search/add/preview/refresh contract, the freshness
plumbing threaded through both `CollectionDataProvider` and
`loadOwnedCollection`, and the UI/attribution surfaces all sit on one
additive-but-interlocking change. Splitting the migration from the runtime
that depends on its new column/constraint would require an intermediate
production state where either the runtime references a column that doesn't
exist yet, or a migrated column sits unused. One runtime PR, several
coherent commits inside it (§15), avoids that.

## Global constraints (from the spec + `AGENTS.md`)

- No dependency add/upgrade.
- **Two** new environment variables: `DISCOGS_TOKEN` and
  `DISCOGS_USER_AGENT` (both server-only, §12) — no other new environment
  variable.
- One forward-only database migration (§9). No RLS/grant weakening. No
  authenticated/anon write grant added to catalog `releases` columns.
- No Netlify config change. **No new Netlify Function** — the existing six
  endpoints stay six; `/api/catalog/search` and `/api/catalog/add` gain
  parameters/branches, not siblings (§5, §6).
- No AI/model/prompt change of any kind — zero OpenRouter/Vision/VIN model
  touch-points; VIN's `loadOwnedCollection` gains freshness-safe **data
  plumbing** only (§8).
- No change to Scan's vision recognition flow, schema, or state machine —
  confirmed structurally unnecessary (§1: Scan candidates can never carry
  `provider: 'discogs'` under this spec).
- No change to the duplicate-copy contract's *decision rule* (exact
  `(provider, provider_release_id)` equality) — only widening its identity
  tuple to be provider-qualified (§11), and reusing the existing dialog for
  the Discogs case (§6).
- No change to manual-add semantics.
- Every automated gate green from a clean checkout before PR B opens; an
  independent review before merge; a human production acceptance before
  PR C starts.
- Any finding that would require a new Function, an OAuth flow, Restricted
  Data (images/Marketplace), a dependency, or a security-contract change →
  **STOP and return to the human** (§19 expands this).

Automated gate (run for PR B, from a clean checkout):

```
npm ci
git diff --check
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase start
npx supabase test db     # pgTAP
npx supabase db lint
npm audit --omit=dev
```

No real MusicBrainz/Discogs API call and no OpenRouter/model call anywhere in
this gate — every provider interaction in automated tests is mocked/fixture-
based (existing project convention).

Deploy step (only after human-approved merge): provision `DISCOGS_TOKEN` and
`DISCOGS_USER_AGENT` in Netlify (§12), apply the reviewed migration to
hosted Supabase, then the project's existing manual `netlify deploy --prod`
workflow — no new deployment mechanism — then a non-provider smoke (`/`,
`/api/health`, one SPA deep link), then STOP for human production
acceptance (§18).

---

## 1. Current-source findings that shaped this plan

Verified by direct inspection at baseline `bb00c7c`, not assumed from the
spec alone. This table includes the corrections made during independent
review (marked **[corrected]**).

| Finding | Evidence | Consequence for this plan |
| --- | --- | --- |
| `CatalogProvider` is a single-literal type; `parseAddRequest` hardcodes `payload.provider !== 'musicbrainz'`; the DB check constraint hardcodes `provider = 'musicbrainz'` | `src/lib/catalog/types.ts:1`; `netlify/functions/_shared/catalog-handlers.mts:367`; `supabase/migrations/20260826000100_add_catalog_releases.sql` | Three independent gates, all confirmed, all must change together. |
| `releases_provider_release_identity_unique` is **already** `unique (provider, provider_release_id)` | same migration | No schema change needed to the identity constraint itself. |
| **[corrected]** The existing catalog-branch check requires `provider is not null and provider = 'musicbrainz'` — a NULL-safe explicit-`IS NOT NULL` form, not a bare equality | same migration, re-read carefully | The widened constraint must preserve the explicit `IS NOT NULL` test — `provider = ANY(array[...])` alone evaluates to `NULL` (not `TRUE`) for a `NULL` `provider`, and PostgreSQL `CHECK` constraints **pass** on `NULL`, silently permitting a catalog row with no provider at all (§9). |
| `CatalogFunctionDependencies` (search/add) is 100% MusicBrainz-shaped | `catalog-handlers.mts:52-59` | A parallel Discogs dependency set is added to the same object. |
| `parseCatalogSearchRequest` has no `provider` parameter; the search branch always calls the one `searchReleases` dependency; the **existing `releaseId`-only exact-lookup branch has no `provider` concept either** — it validates unconditionally against `MUSICBRAINZ_RELEASE_ID_PATTERN` | `catalog-handlers.mts:245-306` | A `provider` query parameter is added to **both** the normal-search branch and the exact-lookup branch (§5, §6). |
| `fetchMusicBrainzJson`'s fetch/timeout/error-mapping shape | `musicbrainz.ts:443-503` | The Discogs adapter mirrors this shape, using `Authorization: Discogs token=...` + a **dedicated `DISCOGS_USER_AGENT`** (§12 — **[corrected]**, not `MUSICBRAINZ_USER_AGENT`). |
| **[corrected]** Discogs Database Search results and Discogs exact-Release-lookup results are **materially different response shapes**, not the same shape at two call sites | Human-supplied Phase-0 evidence: a search result's `title` field is the **combined** `"כהן - מה שאפשר עם מה שנשאר"` string with no separate artist field, and its `format`/`label`/`catno` are flat scalars/arrays; the exact Release response's `title` is the **title alone**, with a separate `artists_sort`, and `formats`/`labels` as arrays of objects | **Two distinct normalizers are required, not one** (§3/§4) — a search-result normalizer that never attempts to split `"Artist - Title"`, and a separate exact-release normalizer that is the only producer of a real `CatalogCandidate`. |
| `normalizeMusicBrainzRelease` returns `null`/rejects on any missing-or-invalid required field, never persists a partial/guessed value | `musicbrainz.ts:393-441` | `normalizeDiscogsExactRelease` mirrors this discipline (§4). |
| `MUSICBRAINZ_RELEASE_ID_PATTERN` lives in the browser-safe `musicbrainzIdentity.ts`, re-exported (not duplicated) by `musicbrainz.ts` | `musicbrainzIdentity.ts` | The Discogs analog (`discogsIdentity.ts`) follows the identical split. |
| **[corrected]** `RELEASE_FIELD_LIMITS` is already **exported** from `src/lib/supabase/collection.ts` (used for manual-entry validation) — a **second**, private, numerically-identical copy already exists inside `musicbrainz.ts`; these are already two drifting sources today, before this plan touches anything | `collection.ts` (`export const RELEASE_FIELD_LIMITS = {...}`), `musicbrainz.ts` (private `const RELEASE_FIELD_LIMITS = {...}`, private `RELEASE_YEAR_MIN`/`MAX`) | This plan does **not** introduce a third copy. It extracts the shared constants into `catalogFieldLimits.ts` and has `collection.ts` **re-export** from it (mirroring the exact `musicbrainzIdentity.ts`/`musicbrainz.ts` re-export precedent already used in this codebase for `MUSICBRAINZ_RELEASE_ID_PATTERN`), so every existing import of `RELEASE_FIELD_LIMITS` from `collection.ts` keeps working unmodified (§4). |
| Exactly two current consumers of persisted release metadata for **display**: `loadCollection` (client) and `loadOwnedCollection` (server, VIN) | `collection.ts`, `CollectionDataProvider.tsx`, `curator-handlers.mts:331-364` | Confirmed as the two integration points for the freshness pass (§8). |
| **[corrected]** `CollectionItemCard.tsx` is rendered only by `CollectionPanel.tsx`, which is **not imported by any route** (`CollectionPage.tsx`/`AppRoutes.tsx` mount `CollectionBrowser.tsx` instead, confirmed via `grep` of every import site) | `src/collection/CollectionPanel.tsx`, `src/pages/CollectionPage.tsx:4`, `src/app/AppRoutes.tsx:163` | `CollectionItemCard.tsx` is **legacy/unmounted** for the live Collection route — it is **not** treated as the production freshness/attribution surface. **`src/collection/CollectionBrowser.tsx`'s `AlbumCard`/`AlbumRow`** (via its shared `artProps()` helper) is the real, mounted Collection grid/list display, and is added to the in-scope file list (§13). |
| **[corrected]** `src/pages/HistoryPage.tsx` also displays `release.artist`/`release.title` and passes `provider_release_id`/`provider_release_group_id` into `AlbumArtwork` unconditionally | `HistoryPage.tsx:60-61,78-84` | A **fifth** (not fourth) confirmed `AlbumArtwork` caller, and a confirmed additional freshness/attribution-relevant surface (§7, §13). |
| Five (not three, not four) existing `AlbumArtwork` callers wire provider ids into `releaseMbid`/`releaseGroupMbid` unconditionally: `DiscoverPanel.tsx`, `AlbumDetailPage.tsx`, `DashboardPage.tsx`, `CuratorRecommendationCard.tsx`, `HistoryPage.tsx` | as above | All five gated explicitly by `provider === 'musicbrainz'` (§7). `ScanPanel.tsx` remains confirmed out of scope (structurally MusicBrainz-only). |
| **[corrected]** The existing Discover "Add to collection" first-add action calls `addCatalogReleaseToCollection` **directly** on click — there is **no** intermediate confirmation dialog showing candidate metadata today; the existing `confirmingCandidate`/`Dialog` state exists **only** for the "Add another copy?" duplicate-copy confirmation | `DiscoverPanel.tsx:333-358` (`add()`), `:370-377` (`confirmAddAnotherCopy`), `:715-737` (`Dialog`) | The Discogs flow (§6) introduces its **own** new confirmation step — this is a deliberate, spec-compatible elaboration for Discogs specifically (spec 0018 §9 does not forbid an extra read-only preview step; it only requires the server never trust browser metadata, which an extra preview step strengthens, not weakens), **not** an assumption that MusicBrainz's existing dialog already does this. |
| `CatalogCandidate` has **no** `genres` field today — MusicBrainz's own genre enrichment is already a **separate side channel** (`lookupReleaseGroupGenres` returns `string[]`, merged only inside `catalogReleasePayload`, never added to `CatalogCandidate` itself) | `types.ts`, `catalog-handlers.mts:390-411` | The Discogs exact-lookup function must follow the **same** separate-channel shape, not add a field to `CatalogCandidate` (§4). |
| Exactly 6 Netlify Functions exist today | `netlify/functions/*.mts`, `netlify.toml` | The freshness-revalidation and exact-preview operations (§5, §6, §8) are hosted inside two of these six, not a seventh. |
| `.env.example` has no `DISCOGS_TOKEN`/`DISCOGS_USER_AGENT` entry; test scripts are `typecheck`/`lint`/`test:run`/`build` | `.env.example`, `package.json` | Confirms the exact gate commands and the exact two new env-var additions (§12). |

## 2. Chosen designs — module boundary

### 2.1 Discogs identity/URL helpers — new sibling module, `src/lib/catalog/discogsIdentity.ts`

Unchanged from the original plan: mirrors `musicbrainzIdentity.ts` exactly
— a small, dependency-free, browser-safe pure module containing
`DISCOGS_RELEASE_ID_PATTERN = /^[1-9][0-9]{0,9}$/` (a bare positive
integer, 1–10 digits — a generous defensive string-length bound, not a
claimed provider guarantee) and `discogsReleaseUrl(providerReleaseId:
string): string | null` (`https://www.discogs.com/release/${id}` — the
human-facing release page domain, distinct from `api.discogs.com`). **IDs
are validated and carried as strings everywhere** — never parsed to a JS
`number`. No `discogsWebSearchUrl` and no `parseDiscogsReleaseUrl` (both
explicitly cut, spec 0018 §3).

### 2.2 Discogs provider adapter — new file, `src/lib/catalog/discogs.ts`

Contains the shared fetch/timeout/pacing/error-mapping plumbing
(`fetchDiscogsJson`, mirroring `fetchMusicBrainzJson`'s exact shape:
`AbortController`, 429→`provider_rate_limited`, 404→`not_found`, non-ok→
`provider_unavailable`, abort→`provider_timeout`, catch-all→
`provider_unavailable` — the same five existing `CatalogErrorCode` values,
no new category) and the **two distinct normalization functions** (§3, §4)
this correction round requires. `DiscogsError extends Error` mirrors
`MusicBrainzError`'s shape.

### 2.3 Shared field-limit source — `src/lib/catalog/catalogFieldLimits.ts`

**[corrected, §1]** A new, tiny, dependency-free module holding
`RELEASE_FIELD_LIMITS`, `RELEASE_YEAR_MIN`, `RELEASE_YEAR_MAX` — the single
real source. `musicbrainz.ts` is changed to import these instead of
defining its own private copy (no behavior change — same numeric values;
proven by every existing `musicbrainz.test.ts` case continuing to pass
unmodified). `collection.ts` is changed to **re-export**
`RELEASE_FIELD_LIMITS` from this module instead of defining it locally
(`export { RELEASE_FIELD_LIMITS } from '../catalog/catalogFieldLimits.ts'`)
— every existing import of `RELEASE_FIELD_LIMITS` from `collection.ts`
(confirmed at implementation time via `grep`) continues to resolve
unmodified. `discogs.ts` imports the same module. **This is the only
shared, cross-cutting file this plan introduces beyond the Discogs-specific
modules themselves** — not a provider framework, a deduplication of
numbers that were already (undesirably) duplicated before this plan.

## 3. Discogs Database Search — display-only normalizer (BLOCKER 1, resolved)

### 3.1 A distinct, minimal wire/display type — never `CatalogCandidate`

```ts
// src/lib/catalog/discogs.ts
export type DiscogsSearchResultItem = {
  provider: 'discogs'
  providerReleaseId: string          // validated, string, from `id`
  providerReleaseGroupId: string | null   // from `master_id`, string or null
  /**
   * The RAW Discogs Database Search `title` field, displayed exactly as
   * returned (often "Artist - Title", sometimes not - Discogs's own
   * search-result convention is not fully consistent). NEVER split into
   * separate artist/title values - that heuristic is exactly what this
   * correction round forbids. This field exists for DISPLAY/SELECTION only
   * and is never persisted anywhere.
   */
  displayTitle: string
  releaseYear: number | null
  country: string | null
  /** The raw `format` flat string array, joined for display (e.g. "Vinyl, LP, Album"). */
  formatSummary: string | null
  /** Best-effort, sentinel-aware (S4.3's rule, applied identically here) from the flat `label`/`catno` search-result fields. */
  label: string | null
  catalogNumber: string | null
  derivedProviderPageUrl: string
}

export type DiscogsSearchResponse = {
  results: DiscogsSearchResultItem[]
}

export function normalizeDiscogsSearchResult(
  raw: unknown,
): DiscogsSearchResultItem | null
```

`normalizeDiscogsSearchResult` requires only `id` (→ `providerReleaseId`,
validated against `DISCOGS_RELEASE_ID_PATTERN`, reject on failure) and
`title` (→ `displayTitle`, cleaned/length-bounded against
`RELEASE_FIELD_LIMITS.title` — reused as a generic "reasonable display
string" bound here, **not** as an artist/title-specific limit, since this
is one combined string); every other field is optional and passed through
best-effort. **Vinyl pre-filtering at the search stage** uses the raw flat
`format` array's simple string-membership check (`formats.includes('Vinyl')`
— no object-shape assumption, no split needed) to exclude obviously
non-Vinyl results from the UI early; this is a **cheap, non-authoritative**
filter — the authoritative Vinyl gate remains §4's exact-release
normalizer, run again before any persistence, exactly as originally
designed. A search result whose flat `format` array does not include
`'Vinyl'` is dropped before the UI ever sees it.

### 3.2 Search request/response — `GET /api/catalog/search?provider=discogs&q=...`

Calls `GET https://api.discogs.com/database/search?q=<query>&type=release&per_page=10`
(§1 pattern: Phase-0-exercised page size, not a provider guarantee), maps
each raw result through `normalizeDiscogsSearchResult` (dropping `null`s
and non-Vinyl entries), returns **at most the first 5** surviving results.
The handler returns `{ results: DiscogsSearchResultItem[] }` — a
**genuinely distinct response shape** from `CatalogSearchResponse`, not
forced into it. `DiscoverPanel`'s existing `renderCandidate(c:
CatalogCandidate)` is **not** reused for this response — a new, small,
Discogs-specific list-item renderer is added instead (§6), which is
appropriate: these results are always visually distinct from MusicBrainz
candidates regardless (spec 0018 §18), so sharing the exact same rendering
function was never load-bearing.

## 4. Discogs exact Release lookup — the sole `CatalogCandidate` producer

### 4.1 Genre side-channel, matching MusicBrainz's existing pattern

**[corrected, §1]** `CatalogCandidate` gains **no new field**.
`lookupDiscogsRelease` returns a small paired result, exactly mirroring how
`handleCatalogAdd` already separates MusicBrainz's candidate from its
release-group genre lookup:

```ts
// src/lib/catalog/discogs.ts
export type NormalizedDiscogsRelease = {
  candidate: CatalogCandidate
  genres: string[]
}

export async function lookupDiscogsRelease(options: {
  fetchImpl?: FetchFunction
  providerReleaseId: string
  timeoutMs?: number
  token: string
  userAgent: string
}): Promise<NormalizedDiscogsRelease>
// throws DiscogsError('not_found', ...) if the release has no Vinyl
// formats[] entry (the authoritative Vinyl gate, S3.1's search-stage
// filter is only a cheap pre-filter, not a substitute for this).

export function normalizeDiscogsExactRelease(
  release: unknown,
): { candidate: CatalogCandidate; genres: string[] } | null
```

### 4.2 `normalizeDiscogsExactRelease` mapping (unambiguous — exact Release shape only)

| `CatalogCandidate` field | Discogs exact-Release source | Rule |
| --- | --- | --- |
| `provider` | fixed | `'discogs'` |
| `providerReleaseId` | `id` | Required; `String(id)`, validated against `DISCOGS_RELEASE_ID_PATTERN`. |
| `providerReleaseGroupId` | `master_id` | `String(master_id)` if present and non-zero; otherwise `null`. |
| `artist` | `artists_sort` | Required (this field is unambiguous here — no split needed, unlike the search-result shape). Cleaned/length-bounded against `RELEASE_FIELD_LIMITS.artist` (160). |
| `title` | `title` | Required (also unambiguous here — the exact-Release `title` is the title alone). Bounded against `RELEASE_FIELD_LIMITS.title` (200). |
| `releaseYear` | `year`, falling back to a parsed leading 4-digit year from `released` only if `year` is absent/zero | Bounded by `RELEASE_YEAR_MIN`/`MAX` (1900–2100). Out-of-bounds/unparseable → `null`. |
| `country` | `country` | Optional; bounded to 80 chars. |
| `label` / `catalogNumber` | `labels[]` (array of `{ name, catno }` objects — confirmed distinct from the search-result shape's flat fields) | **Sentinel-aware rule (spec 0018 §10.1), unchanged from the original plan**: prefer the first entry whose `name` is non-empty and whose `catno`, trimmed, is non-empty and not case-insensitively `"none"`; otherwise the first entry's `name` with `catalogNumber = null`. Never persists the literal `"none"`. |
| `format` | `formats[]` (array of `{ name, qty, descriptions }` objects) | Only computed for an entry with `name === 'Vinyl'`; a deterministic join of `qty` (when `> "1"`) and `descriptions`, bounded to 80 chars. **No matching entry → the whole lookup throws `not_found`** (the authoritative Vinyl gate). |
| `derivedProviderPageUrl` | (computed) | `discogsReleaseUrl(providerReleaseId)`. |
| `score` | (n/a) | `null`. |
| `transientCoverDisplayUrl` | (fixed) | **`null`, explicitly set** — never populated for a Discogs candidate (§7, images out of scope). |

`genres` (the paired return value, **not** a `CatalogCandidate` field):
from the exact-Release response's flat `genres: string[]` (e.g.
`["Hip Hop"]` — confirmed distinct shape from MusicBrainz's `[{name,
count}]` release-group tag shape) via a new `normalizeDiscogsGenreList`
function in `discogs.ts`. This is **not** claimed to reuse
`normalizeMusicBrainzGenres` (that function's input shape is
array-of-objects; Discogs's is array-of-strings — genuinely different, not
reusable as-is). It *does* reuse the same per-string cleaning rule
`musicbrainz.ts`'s private `normalizeGenreName` already applies (trim,
lowercase, 1–40 chars) — that helper is exported from `musicbrainz.ts` as
part of this PR (a one-line `export` addition, zero behavior change, its
own existing tests continue to pass) and imported by `discogs.ts`, so the
per-string cleaning rule has one real source too, applied to two different
container shapes.

### 4.3 `handleCatalogRefresh`'s and the add path's use of this pairing

Both the add path (§5) and the internal refresh path (§8) call
`lookupDiscogsRelease`, destructure `{ candidate, genres }`, and pass both
into the **existing** `catalogReleasePayload(candidate, genres,
providerFetchedAt)` (extended with one new parameter, §5.3) — the exact
same call shape MusicBrainz's own add path already uses today (`candidate`
from one call, `genres` from a second, separate MusicBrainz call) — Discogs
simply produces both from one call instead of two, with no change to the
persistence function's own contract.

## 5. Search / Add API contract — exact shapes

### 5.1 `GET /api/catalog/search` — `provider` parameter (normal search)

`parseCatalogSearchRequest` gains a `provider` query parameter via
`parseProvider(value: string | null): CatalogProvider` — omitted →
`'musicbrainz'` (100% backward compatible; no existing client sends this
parameter); `'musicbrainz'`/`'discogs'` accepted; anything else →
`invalid_query`.

When `provider === 'discogs'` **and `releaseId` is absent** (the normal
search shape, §3): `mode`, `offset`, `limit` are rejected if present;
`q` is required (same 2–120 char bounds); the handler paces via
`paceDiscogsRequest()` and calls `searchDiscogsReleases`, returning `{
results: DiscogsSearchResultItem[] }` — **not** a `CatalogSearchResponse`
(§3.2's corrected design — this is a genuinely different JSON shape on the
same endpoint, distinguished by the request's own `provider=discogs&q=...`
without `releaseId`).

### 5.2 `GET /api/catalog/search` — `provider` + `releaseId` (the read-only exact-preview lookup, resolving HIGH 4)

**[new in this correction round]** The **existing** MusicBrainz-only
`releaseId`-only exact-lookup branch (§1) gains the same `provider`
parameter. When `provider === 'discogs'` **and** `releaseId` is present
(mutually exclusive with `q`/`mode`/`offset`/`limit`, exactly like the
existing MusicBrainz shape): validate `releaseId` against
`DISCOGS_RELEASE_ID_PATTERN`; pace via `paceDiscogsRequest()`; call
`lookupDiscogsRelease`; return `{ candidates: [candidate], offset: 0,
hasMore: false }` — the **same** `CatalogSearchResponse` shape the
MusicBrainz exact-lookup branch already returns (this reuse is safe and
correct here, unlike §3's search-result shape, because `candidate` here is
already a real, fully-normalized `CatalogCandidate` with no artist/title
ambiguity, §4). **Zero database writes** — this branch never persists
anything, for either provider, today or after this change.

**Why this satisfies the "no Discogs URL-paste feature" requirement:** the
UI never exposes a free-text URL/ID input for Discogs (spec 0018 §3, never
revisited). The **only** caller of `?provider=discogs&releaseId=...` is the
Discogs fallback panel's own internal "Review & Add" click handler (§6),
which already has a `providerReleaseId` from a just-displayed search
result — never user-typed, never a pasted URL. The underlying HTTP
capability is technically general (exactly as MusicBrainz's own
`releaseId` branch technically is), but the **product feature**, as a user
experiences it, is "select a result, see full confirmed details" — not "look
up any ID you type," matching how the original MusicBrainz exact-lookup
branch is itself wrapped by a URL-paste-and-parse UI rather than a bare
ID input.

### 5.3 `POST /api/catalog/add` — Discogs branch (final, second, persisting lookup)

`parseAddRequest`'s provider check widens to `isCatalogProvider(...)`; its
`providerReleaseId` validation branches by provider
(`MUSICBRAINZ_RELEASE_ID_PATTERN` vs `DISCOGS_RELEASE_ID_PATTERN` — never
the wrong one for the wrong provider). `handleCatalogAdd`'s Discogs branch:
paced `lookupDiscogsRelease()` (the **second**, independent, persisting
lookup — deliberate, per spec 0018 §9's "never trust browser metadata"
principle, reused twice: once for the read-only preview §5.2, once here) →
`upsertCatalogRelease` with `provider_fetched_at =
new Date().toISOString()` → the **unchanged** `createCatalogCollectionItem`.

`catalogReleasePayload` gains one new parameter,
`providerFetchedAt: string | null` (explicit `null` for the MusicBrainz
branch, never omitted, so an `upsert` never leaves a stale value on a row
that should never have one) — every existing MusicBrainz-path test's
expected payload assertion needs a mechanical (not behavioral) update for
this one new key (§16).

## 6. Discogs fallback UI and confirmation flow (HIGH 4, resolved)

Per §1's corrected finding, this plan does **not** assume MusicBrainz's
existing dialog does anything beyond duplicate-copy confirmation — the
Discogs flow defines its **own**, spec-compatible sequence:

1. User clicks "Can't find it? **Search Discogs**" (adjacent to the
   existing "Can't find it? Add it manually" line, `DiscoverPanel.tsx:710`
   — resolving spec 0018 §25 Q1) — opens `DiscogsSearchPanel.tsx`, its own
   fully independent React state (mirroring exactly how spec 0017's
   exact-URL-lookup state is already independent from the main search
   state in the same file), never auto-triggered.
2. User submits a free-text query → `GET
   /api/catalog/search?provider=discogs&q=...` (§5.1) → renders a small,
   distinctly-labeled ("Discogs") list of `DiscogsSearchResultItem`s (its
   own minimal renderer, §3.2 — title/year/country/format-summary/label,
   plus a Discogs attribution line, §7). An "already owned" badge is shown
   directly on a result whose `providerReleaseId` matches an owned
   `(discogs, id)` pair (checked with the already-known `providerReleaseId`
   — no need to wait for the exact lookup for this check).
3. User clicks "Review & Add" on one result → client calls `GET
   /api/catalog/search?provider=discogs&releaseId=<id>` (§5.2) — a
   loading/"Finding…" state shown meanwhile.
4. On success (a real, fully-normalized `CatalogCandidate`):
   - if **not** already owned: a **new** confirmation dialog (extends the
     existing `Dialog` component, a sibling of — not a replacement for —
     the existing duplicate-copy dialog) renders the full candidate
     metadata + Discogs attribution (§7) + "Confirm & Add" / "Cancel";
   - if **already owned**: the **existing, unmodified** "Add another
     copy?" `confirmingCandidate`/`Dialog` flow is reused directly with
     this candidate — no new dialog, no regression to the existing
     duplicate-copy contract.
5. On failure (not found / not Vinyl / rate-limited / timeout /
   unavailable): an honest, scoped error shown in the panel — the
   candidate list is unaffected, retry is user-triggered.
6. Confirming either dialog calls the **existing**, unmodified
   `add(candidate)` → `addCatalogReleaseToCollection(client, candidate)` →
   `POST /api/catalog/add` (§5.3) — the **second**, persisting exact
   lookup happens here, server-side, exactly as spec 0018 §9 requires;
   the browser's step-3 preview result is **never** sent as metadata, only
   `provider` + `providerReleaseId`.

This adds a genuinely-live request to the acceptance/local-smoke budgets
beyond the original plan's count (§18).

## 7. Attribution — corrected, full enumeration (HIGH 6, resolved)

**Every plan-level exemption from the original draft is removed.**
Attribution renders wherever Discogs-sourced data is directly presented,
full stop — "not enough layout room" and "preview surface" are not Terms
exceptions, per the audit's explicit correction.

Re-enumerated surfaces, using one shared, compact component (two small
variants — a full line for primary surfaces, a compact inline mark for
tight card layouts):

```tsx
// src/catalog/DiscogsAttribution.tsx
export function DiscogsAttribution({
  releaseUrl,
  compact = false,
}: { releaseUrl: string; compact?: boolean }) {
  return (
    <p className={compact ? 'vi-discogs-attribution vi-discogs-attribution--compact' : 'vi-discogs-attribution'}>
      Data provided by{' '}
      <a href={releaseUrl} target="_blank" rel="noreferrer">
        Discogs
      </a>
      {compact ? null : '.'}
    </p>
  )
}
```

(no `nofollow`, matching the Terms' explicit prohibition.)

| Surface | File | Attribution | Variant |
| --- | --- | --- | --- |
| Discogs search result | `DiscogsSearchPanel.tsx` | **Yes** | full |
| Exact-preview confirmation dialog | new dialog, §6 | **Yes** | full |
| Already-owned "Add another copy?" dialog, when the candidate is Discogs-sourced | existing `Dialog` in `DiscoverPanel.tsx` | **Yes** | full — the dialog gains one conditional line when `confirmingCandidate.provider === 'discogs'` |
| Album Detail (Discogs-backed) | `AlbumDetailPage.tsx` | **Yes** | full, beside "View on Discogs" |
| **[corrected] `CollectionBrowser.tsx` grid card (`AlbumCard`)** | `CollectionBrowser.tsx` | **Yes** | compact — a small inline mark added to the existing meta line for a Discogs-backed item only |
| **[corrected] `CollectionBrowser.tsx` list row (`AlbumRow`)** | `CollectionBrowser.tsx` | **Yes** | compact — same treatment in the row's meta cell |
| **[corrected] Dashboard `AlbumMini`** | `DashboardPage.tsx` | **Yes** | compact — a small inline mark, only when the tile's item is Discogs-backed |
| **[corrected] Dashboard genre-based insight block, if it visibly surfaces a genre value traceable to a specific Discogs-backed release** | `src/lib/dashboard/insights.ts`, `DashboardPage.tsx` | **Conditional** — inspected at implementation time: if an insight (e.g. "top genre") names/links a specific record, that record's own compact mark (already required above, on `AlbumMini`) satisfies this; if an insight is a pure aggregate (a count/percentage with no single traceable record), no per-value attribution is needed since no single piece of Discogs data is "displayed" as such — a purely statistical aggregate is not itself Discogs Content. This distinction, not a blanket exemption, is the resolved rule. | compact where applicable |
| **[corrected] `HistoryPage.tsx` row** | `HistoryPage.tsx` | **Yes** | compact — a small inline mark beside the artist/title for a Discogs-backed entry |
| VIN recommendation card | `CuratorRecommendationCard.tsx` | **Yes** | full |

**Artwork provider-gating extended to the two newly-confirmed surfaces**
(§1): `CollectionBrowser.tsx`'s `artProps()` and `HistoryPage.tsx`'s
`AlbumArtwork` call both gate `releaseMbid`/`releaseGroupMbid` on
`provider === 'musicbrainz'` explicitly, exactly like the other three
callers (§1's full list of five).

App-level, one-time notice — unchanged from the original plan — placed in
`SettingsPage.tsx` (confirmed to exist and to already host other one-time
informational copy); not a new route.

## 8. Six-hour freshness — architecture, expiry, and both integration points (BLOCKER 2, resolved)

### 8.1 Shared pure helper — unchanged in shape from the original plan

```ts
// src/lib/catalog/discogsFreshness.ts
export const DISCOGS_FRESHNESS_WINDOW_MS = 6 * 60 * 60 * 1000   // exactly 6 hours

// age <= 6h -> fresh; age > 6h -> stale (the boundary itself, "= 6h", is
// treated as still fresh - an open interval on the stale side - since the
// Terms' own wording ("more than six (6) hours older") is itself a strict
// inequality on the stale condition).
export function isDiscogsRowFresh(
  provider: string | null,
  providerFetchedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (provider !== 'discogs') return true
  if (!providerFetchedAt) return false   // NULL is defensively stale, never fresh
  const fetchedAtMs = Date.parse(providerFetchedAt)
  if (!Number.isFinite(fetchedAtMs)) return false
  return now - fetchedAtMs <= DISCOGS_FRESHNESS_WINDOW_MS
}

/** Milliseconds until a currently-fresh row becomes stale; 0 if already stale/non-Discogs. */
export function msUntilStale(
  provider: string | null,
  providerFetchedAt: string | null,
  now: number = Date.now(),
): number {
  if (!isDiscogsRowFresh(provider, providerFetchedAt, now)) return 0
  const fetchedAtMs = Date.parse(providerFetchedAt as string)
  return Math.max(0, DISCOGS_FRESHNESS_WINDOW_MS - (now - fetchedAtMs))
}
```

### 8.2 Client-side: `CollectionDataProvider` — reconciliation pass + one-shot expiry timer

**[corrected — the original plan checked freshness only once, at load;
this left a hole for a tab that stays mounted past the 6-hour boundary.]**

A new internal function, `reconcileDiscogsFreshness(items)`, run:

1. **Once, immediately after every `loadCollection` resolution** (mount
   and every `reload()`/`invalidate()`), exactly as originally planned:
   partition into fresh-or-non-Discogs (pass through) and stale-Discogs;
   if none are stale, skip straight to `setItems`. Otherwise, revalidate
   the stale items **sequentially, one at a time** (`for...of` with
   `await`, **not** `Promise.allSettled` fan-out — **[corrected, MEDIUM
   7]**: a personal collection's stale-Discogs subset is realistically
   tiny, and sequential requests are the honest match for a
   best-effort, in-process, non-guaranteed pacer, §12) via
   `refreshDiscogsCollectionItem(client, providerReleaseId)` (§8.4). Each
   result updates that item's release fields (success) or sets
   `discogsUnavailable: true` (failure) — the item is never removed from
   the array.
2. **On a one-shot timer, scheduled for the earliest upcoming staleness
   deadline among the currently-fresh Discogs items** — computed via
   `msUntilStale` over the current `items`, `Math.min` across all
   Discogs-provider entries, `setTimeout` for that duration (a sensible
   floor, e.g. 1000ms, guards against a pathological near-zero delay). When
   the timer fires, it re-runs the **same** reconciliation pass (step 1's
   logic, not a duplicate) over the current `items` in state, then
   re-schedules the next timer based on the new minimum. This is a single
   scheduled deadline per relevant state change — **not polling** (no
   repeating interval; the timer is cleared and freshly recomputed on
   every `items` update via the `useEffect`'s own cleanup function).
3. **On the browser's `visibilitychange` event becoming `'visible'`**
   (**[new, resolving the "reload failure/visibility-resume" requirement]**):
   immediately re-run the same reconciliation pass once. This closes the
   gap where a backgrounded/suspended tab's `setTimeout` may have been
   throttled or the JS execution paused by the OS for longer than the
   scheduled delay — on resume, freshness is authoritatively re-checked
   rather than trusting a possibly-late timer. This is event-driven, not
   interval-driven, and fires at most once per visibility transition — not
   polling.
4. A full page reload/remount naturally re-runs step 1 from scratch via
   the existing `loadCollection` effect, providing a third, independent
   safety net for the "long suspension" case even if the OS fully tore
   down the tab's JS.

`status`/`error` (the collection's own load phase) are **not** gated on
this reconciliation pass completing — exactly as originally planned,
preserving Milestone 8's "a failure of one thing never blanks something
else" principle.

### 8.3 Server-side: `loadOwnedCollection` — sequential, in-process

**[corrected, MEDIUM 7]**: revalidation of stale Discogs items within one
`loadOwnedCollection` call is **sequential**, not parallel — matching the
client-side correction above, and matching the honest characterization of
the shared pacer (§12) as an in-process, best-effort throttle, not a
verified global limiter. On success: best-effort `upsertCatalogRelease`
with the refreshed data (benefiting the client's next load too) and use
the refreshed facts for that item's `CuratorCollectionItem`. On failure:
**that item is filtered out of `items` entirely for this one request**
(unchanged from the original plan) — `CuratorCollectionItem`'s required
fields have no partial-presence shape, and silently sending stale values is
exactly what spec 0018 §12 forbids. No prompt/schema/model change.

### 8.4 `refreshDiscogsCollectionItem` — client wrapper for the internal refresh operation

Unchanged in shape from the original plan: a thin `client.ts` wrapper
posting `{ action: 'refresh', provider: 'discogs', providerReleaseId }` to
the **existing** `/api/catalog/add` endpoint. Server-side
(`handleCatalogRefresh`, in `catalog-handlers.mts`, invoked from
`handleCatalogAdd`'s existing entrypoint when `action === 'refresh'` is
present — the thin `netlify/functions/catalog-add.mts` entrypoint file
itself stays byte-identical): authenticate → validate ID → **verify the
authenticated user actually owns a collection item referencing a
`(discogs, id)` releases row** (the guard that keeps this "revalidate
something I own," never a general-purpose lookup) → paced
`lookupDiscogsRelease()` → `upsertCatalogRelease` with a fresh
`provider_fetched_at` → **no** `createCatalogCollectionItem` call →
return the refreshed pairing.

### 8.5 UI treatment of `discogsUnavailable` — unchanged in shape, surfaces expanded

Per the corrected surface list (§1, §7), every one of the five confirmed
`AlbumArtwork`/metadata-displaying callers checks the new optional
`discogsUnavailable` flag and substitutes an honest "Catalog details
unavailable — Retry" treatment **for the provider-derived fields only**
(never the whole item, never a full-page error):

- `CollectionBrowser.tsx`'s `AlbumCard`/`AlbumRow` meta line —
  **[corrected]**, not `CollectionItemCard.tsx` (legacy/unmounted, §1).
- `AlbumDetailPage.tsx`'s metadata block — unchanged from the original
  plan; the "View on Discogs" link still renders (a valid ID is still a
  valid ID regardless of metadata freshness).
- `DashboardPage.tsx`'s `AlbumMini` — **[corrected]**: title/artist remain
  shown (identity fields, not "current provider facts" in the sense spec
  0018 §12 targets — the user already confirmed them at add time and they
  are not re-derived from a live API field the way year/label/catalog/
  country/format are); year/label/catalog/country/format-level facts,
  wherever `AlbumMini`/insights actually surface them, are gated.
- `HistoryPage.tsx`'s row — **[new, §1]**: title/artist likewise shown
  (identity, same reasoning); no other provider-derived field is displayed
  there (confirmed by inspection, §1), so no further gating is needed on
  this surface beyond the artwork gate (§7).
- `CuratorRecommendationCard.tsx` — cannot recommend an item VIN's own
  server-side pass (§8.3) already excluded for staleness, so no additional
  gating logic is needed there beyond the artwork gate.

The application never crashes or shows a full-page error because one
Discogs record is stale/unavailable; every other item in the same view is
completely unaffected.

## 9. Database migration — NULL-safe constraint (BLOCKER 3, resolved)

**[corrected]** The widened check constraint now explicitly preserves the
`IS NOT NULL` test the current production constraint already has —
`provider = ANY(array[...])` alone is **not** safe, since PostgreSQL
`CHECK` constraints pass on `NULL` (a `NULL` `provider` would make the
whole `AND`-chain evaluate to `NULL`, which `CHECK` treats as satisfied,
silently admitting a catalog row with **no** provider at all):

```sql
-- Widen the catalog-identity constraint to accept the approved secondary
-- provider (spec 0018 / ADR 0008), preserving the explicit NOT NULL test
-- the production constraint already has. Existing MusicBrainz and manual
-- rows are unaffected; no backfill.
alter table public.releases
  drop constraint releases_manual_catalog_identity;

alter table public.releases
  add constraint releases_manual_catalog_identity
  check (
    (
      source = 'manual'
      and provider is null
      and provider_release_id is null
      and provider_release_group_id is null
    )
    or (
      source = 'catalog'
      and created_by is null
      and provider is not null
      and provider in ('musicbrainz', 'discogs')
      and provider_release_id is not null
    )
  );

-- Freshness marker (spec 0018 S12). Nullable at the column level - existing
-- MusicBrainz/manual rows carry NULL and are never subject to the freshness
-- check (application-level guard, discogsFreshness.ts).
alter table public.releases
  add column provider_fetched_at timestamptz;

-- Provider-qualified: a Discogs row must always carry a fetched-at
-- timestamp; non-Discogs rows are unaffected (a NULL provider here would
-- already have been rejected by the constraint above, so `provider is
-- distinct from 'discogs'` is safe and does not re-introduce a NULL-passes
-- gap of its own for this specific column).
alter table public.releases
  add constraint releases_discogs_requires_fetched_at
  check (
    provider is distinct from 'discogs'
    or provider_fetched_at is not null
  );
```

**pgTAP additions**, `supabase/tests/database/catalog_releases_rls.test.sql`
(**[corrected/added]**, resolving BLOCKER 3's own explicit requirement):

- a Discogs-provider fixture row (`provider = 'discogs'`, a realistic
  numeric `provider_release_id`, a non-null `provider_fetched_at`) inserts
  successfully;
- **a `source = 'catalog'` row with `provider = NULL` is rejected** — the
  specific regression test this correction round requires, proving the
  `IS NOT NULL` fix actually closes the gap;
- the composite unique constraint still rejects a duplicate
  `(discogs, <same id>)` pair;
- a Discogs-provider row with `provider_fetched_at = NULL` is rejected by
  `releases_discogs_requires_fetched_at`;
- a MusicBrainz-provider row with `provider_fetched_at = NULL` is accepted
  (the freshness constraint is provider-qualified, not universal);
- an invalid, non-null provider value (neither `musicbrainz` nor
  `discogs`) for a `source = 'catalog'` row is still rejected;
- existing manual-row and existing-provider-value assertions in the file
  continue to pass unmodified (regression).

## 10. Metadata trust boundary — confirmed satisfied by design

Unchanged from the original plan's reasoning, now strengthened by §6's
explicit two-lookup design: no browser-supplied artist/title/year/etc. is
ever accepted as authoritative anywhere in this plan — the read-only
preview (§5.2) and the persisting add (§5.3) both independently call
`lookupDiscogsRelease` fresh; nothing the browser displays during the
preview step is ever sent back to the server as metadata, only `provider` +
`providerReleaseId`.

## 11. Ownership, duplicates, and `provider` propagation

Unchanged from the original plan: `isExactCatalogReleaseOwned` gains a
`provider` parameter, comparing `(provider, providerReleaseId)` together;
every existing call site (`DiscoverPanel.tsx`, `ScanPanel.tsx`) updated
mechanically (no behavior change for MusicBrainz, since `provider` is
always `'musicbrainz'` there already). `provider` is loaded into
`CollectionItemWithRelease['release']` (`collection.ts`'s `select` and
type, optional field, matching the existing optionality of its sibling
identity fields). Cross-provider duplicates remain explicitly unsolved
(spec 0018 §7) — no fuzzy matching added.

## 12. Rate limit / resilience — corrected scope claims and User-Agent (MEDIUM 7, resolved)

**[corrected]** The Discogs pacer is an **in-process, best-effort
throttle** — not described as a process-wide or cross-instance limiter.
Netlify Functions may run as separate serverless instances; a
module-scoped clock only serializes calls made within the same warm
instance. This is the **same** limitation the existing
`nextMusicBrainzRequestAt` clock already silently has today (not newly
introduced by this plan) — this plan documents it honestly for Discogs
rather than repeating the earlier draft's overstated "shared clock" framing.

**[corrected]** Pacing interval: `DISCOGS_PACING_MS = 1_500` (≈40
requests/minute in the best case a single warm instance achieves) — **not**
described as "comfortably under" the observed 60/minute; it is a
deliberately conservative margin **below** a single non-guaranteed
observation (§1's Phase-0 evidence), chosen because the true sustained
limit could plausibly be lower than one observation shows, and because
this in-process pacer cannot enforce a true cross-instance ceiling anyway
— the margin is a defensive posture, not a compliance guarantee. Combined
with sequential (not parallel) stale-refresh reconciliation (§8.2/§8.3),
actual call volume for this feature is low regardless (one search, one
preview, one add-lookup, and a small, sequential number of freshness
revalidations per collection load).

**Explicit decision: no automatic retry on a Discogs 429/503** — unchanged
from the original plan. Timeout: `DEFAULT_TIMEOUT_MS = 8_000`, matching
MusicBrainz's existing value.

**[corrected] `DISCOGS_USER_AGENT` — its own dedicated server-only
environment variable**, never a reuse of `MUSICBRAINZ_USER_AGENT` under a
disguised generic name. `.env.example` gains **two** new lines:

```
# Server-only Discogs configuration (spec 0018). Do not expose in browser code.
DISCOGS_TOKEN=
DISCOGS_USER_AGENT="VinylIntelligence/0.0.0 (contact@example.com)"
```

(matching the exact descriptive format ADR 0002 already established for
`MUSICBRAINZ_USER_AGENT`). Read server-side via the existing
`requiredEnv(env, 'DISCOGS_USER_AGENT')` pattern.

## 13. Secret / environment plan

Unchanged in discipline from the original plan, updated for the second
variable: `DISCOGS_TOKEN` and `DISCOGS_USER_AGENT`, both server-only, both
provisioned by the human through the existing Netlify environment-variable
workflow — this plan does not inspect, request, print, or infer either
value.

## 14. Exact likely files affected — corrected

**New:**

- `src/lib/catalog/discogsIdentity.ts` + `.test.ts`.
- `src/lib/catalog/discogs.ts` (adapter, pacer, error mapping, **two**
  normalizers, genre-list normalizer) + `.test.ts`.
- `src/lib/catalog/discogsFreshness.ts` (`isDiscogsRowFresh`,
  `msUntilStale`) + `.test.ts`.
- `src/lib/catalog/catalogFieldLimits.ts` (extracted shared constants).
- `src/catalog/DiscogsAttribution.tsx` (full + compact variants).
- `src/catalog/DiscogsSearchPanel.tsx` (search results + "Review & Add" +
  the new confirmation dialog logic, §6) + `.test.ts`.
- `supabase/migrations/<timestamp>_add_discogs_catalog_provider.sql`
  (described here, created during PR B only).

**Modified:**

- `src/lib/catalog/types.ts` — `CatalogProvider` widened. **No `genres`
  field added to `CatalogCandidate`.**
- `src/lib/catalog/client.ts` — `refreshDiscogsCollectionItem`; a small
  wrapper for the exact-preview lookup (§5.2); existing
  `addCatalogReleaseToCollection` unchanged.
- `src/lib/catalog/client.test.ts`.
- `src/lib/catalog/musicbrainz.ts` — imports field limits from
  `catalogFieldLimits.ts`; **exports `normalizeGenreName`** (one-line
  change, §4.2); existing tests must pass unmodified (regression proof).
- `src/lib/supabase/collection.ts` — `provider` loaded/typed (§11);
  **re-exports `RELEASE_FIELD_LIMITS` from `catalogFieldLimits.ts`**
  instead of defining it (§1/§2.3) — every existing importer unaffected.
- `src/lib/supabase/collection.test.ts`.
- `src/lib/catalog/ownedRelease.ts` + `.test.ts` — provider-qualified
  signature.
- `src/app/CollectionDataProvider.tsx` — reconciliation pass, one-shot
  expiry timer, `visibilitychange` listener (§8.2).
- `src/app/CollectionDataProvider.test.tsx`.
- `netlify/functions/_shared/catalog-handlers.mts` — `provider` param on
  both search branches (§5.1, §5.2), widened add validation, Discogs add
  branch (§5.3), new `handleCatalogRefresh` (§8.4), `catalogReleasePayload`
  gains `providerFetchedAt`.
- `netlify/tests/catalog-functions.test.ts` — extended for all of the
  above; existing MusicBrainz-path payload assertions updated only for the
  new key (mechanical).
- `netlify/functions/_shared/curator-handlers.mts` — `loadOwnedCollection`
  sequential freshness pass (§8.3).
- the existing curator handler test file covering `loadOwnedCollection`
  (confirmed exact filename at implementation time) — extended, zero real
  model/provider calls.
- `src/pages/AlbumDetailPage.tsx` — provider-aware provenance block,
  provider-gated artwork, `discogsUnavailable` state, attribution.
- `src/pages/AlbumDetailPage.test.tsx`.
- **`src/collection/CollectionBrowser.tsx`** — **[corrected, replaces
  `CollectionItemCard.tsx` as the primary Collection-surface change]**:
  `artProps()` provider-gated; `AlbumCard`/`AlbumRow` meta lines gain
  compact attribution and the `discogsUnavailable` treatment.
- **`src/collection/CollectionBrowser.test.tsx`** (confirmed exact
  filename at implementation time).
- **`src/pages/HistoryPage.tsx`** — **[new]** provider-gated artwork,
  compact attribution, `discogsUnavailable`-aware display for any
  provider-derived field it shows (confirmed at implementation time to be
  title/artist only, §1, which are not gated per §8.5's identity-field
  reasoning — so this file's change may reduce to the artwork gate +
  attribution mark alone; confirmed, not assumed, when the file is
  actually opened for implementation).
- **`src/pages/HistoryPage.test.tsx`**.
- `src/pages/DashboardPage.tsx` — provider-gated artwork (`AlbumMini`),
  compact attribution, insight-block treatment per §7's conditional rule.
- `src/pages/DashboardPage.test.tsx`.
- `src/curator/CuratorRecommendationCard.tsx` — provider-gated artwork,
  full attribution.
- the existing test file covering `CuratorRecommendationCard` (confirmed
  exact filename at implementation time).
- `src/catalog/DiscoverPanel.tsx` — mounts `DiscogsSearchPanel.tsx`'s entry
  point (§6); provider-gated artwork; `isExactCatalogReleaseOwned` call
  site updated; the existing duplicate-copy `Dialog` gains one conditional
  Discogs-attribution line.
- `src/catalog/DiscoverPanel.test.tsx`.
- `src/pages/SettingsPage.tsx` + `.test.tsx` — app-level notice.
- `supabase/tests/database/catalog_releases_rls.test.sql` — Discogs
  fixture, the NULL-provider regression test, freshness-constraint tests.
- `.env.example` — **two** new lines (`DISCOGS_TOKEN`,
  `DISCOGS_USER_AGENT`).

**Explicitly not modified:** `src/media/AlbumArtwork.tsx`,
`src/media/coverArtUrl.ts`, `src/catalog/ScanPanel.tsx`,
`netlify/functions/catalog-search.mts`, `netlify/functions/catalog-add.mts`
(both thin entrypoints stay byte-identical), `netlify.toml`,
`package.json`, any curator prompt/schema file, any VIN model-config file.
**`src/collection/CollectionItemCard.tsx` / `CollectionPanel.tsx` are
confirmed legacy/unmounted for the live Collection route and are not
touched** — if a future audit finds either genuinely reachable through
some path this plan's inspection missed, that is a §19 stop condition, not
a silent scope expansion.

## 15. Implementation order

1. `catalogFieldLimits.ts` extraction (`musicbrainz.ts` + `collection.ts`
   both updated to the single source); confirm both files' existing tests
   pass unmodified.
2. `discogsIdentity.ts` + tests.
3. `discogs.ts`: `fetchDiscogsJson`, pacer, `normalizeDiscogsSearchResult`
   (§3), `normalizeDiscogsExactRelease` + `lookupDiscogsRelease` +
   `normalizeDiscogsGenreList` (§4) — including the `HSV005`/`"none"`
   sentinel fixture and the search-vs-exact shape-divergence fixtures
   (combined `"Artist - Title"` string never split). `musicbrainz.ts`
   exports `normalizeGenreName`.
4. `discogsFreshness.ts` + tests (`isDiscogsRowFresh`, `msUntilStale`,
   including the NULL/malformed-timestamp/exact-6h-boundary cases).
5. `types.ts`: widen `CatalogProvider`.
6. `catalog-handlers.mts`: `provider` on both search branches,
   `handleCatalogRefresh`, widened add validation + Discogs branch,
   `catalogReleasePayload` change. Get `catalog-functions.test.ts` green.
7. `client.ts`: preview-lookup wrapper, `refreshDiscogsCollectionItem`.
8. `ownedRelease.ts`: provider-qualified signature; update both call sites.
9. `collection.ts`: load/type `provider`; re-export `RELEASE_FIELD_LIMITS`.
10. `CollectionDataProvider.tsx`: reconciliation pass, expiry timer,
    `visibilitychange` listener.
11. `curator-handlers.mts`: `loadOwnedCollection` sequential freshness
    pass — after step 10, for the same reason as the original plan (shared
    primitives finalized first, client-side integration proven before
    duplicating server-side).
12. `DiscogsAttribution.tsx`.
13. `DiscoverPanel.tsx` + `DiscogsSearchPanel.tsx`: fallback UI, the new
    confirmation dialog, the existing duplicate-copy dialog's one new
    conditional line, artwork gating, `isExactCatalogReleaseOwned` call
    site.
14. `AlbumDetailPage.tsx`: provenance block, artwork gating,
    `discogsUnavailable`, attribution.
15. `CollectionBrowser.tsx`, `HistoryPage.tsx`, `DashboardPage.tsx`,
    `CuratorRecommendationCard.tsx`: artwork gating, attribution,
    `discogsUnavailable` where applicable (§8.5/§7's per-surface rules).
16. `SettingsPage.tsx`: app-level notice.
17. The migration file + pgTAP additions — written now, applied only per
    §17's deploy-order gate.
18. Full automated gate from a clean checkout.
19. Local manual smoke (§16) — no deploy yet.

## 16. Local manual smoke and independent review gate

**Tier 1** (no real provider call): unchanged in spirit from the original
plan, extended to exercise the new confirmation-dialog step and the
`discogsUnavailable` degraded state on `CollectionBrowser`/`HistoryPage`
fixtures (not just Album Detail).

**Tier 2** (real Discogs/MusicBrainz, permission-gated): **updated budget**
— at most **6** real Discogs requests (one search, one preview lookup, one
add-lookup, one refresh-path exercise, two in reserve) and 0 real
MusicBrainz requests, for this local-smoke round specifically (distinct
from the human-acceptance budget, §18).

**Independent review gate** — unchanged bar (0 BLOCKER/HIGH/MEDIUM),
additionally confirming: the search-result and exact-release normalizers
are genuinely distinct functions, never conflated; the NULL-safe migration
constraint is exactly as specified; `CollectionBrowser.tsx`/`HistoryPage.tsx`
(not `CollectionItemCard.tsx`) carry the production freshness/attribution
treatment; attribution renders on every surface §7 lists, with no silent
re-introduction of a "preview surface" exemption; the Discogs pacer/
User-Agent are genuinely independent from MusicBrainz's; stale-refresh
reconciliation is sequential, not parallel, on both the client and server
paths.

## 17. Database / deploy order

Unchanged in sequence from the original plan: (1) PR B review passes; (2)
merge; (3) human provisions `DISCOGS_TOKEN` **and `DISCOGS_USER_AGENT`**;
(4) apply the reviewed migration; (5) verify; (6) deploy; (7) non-provider
smoke; (8) human acceptance (§18).

## 18. Human production acceptance — updated budget

Script unchanged in structure from the original plan (mandatory Hebrew
scenario, §1's corrected flow: search → review/preview → confirm → add),
now explicitly including a step verifying the new confirmation dialog
shows the exact, server-confirmed metadata (not the raw search-result
`displayTitle`) before the user confirms.

**Live-request budget (all figures include retries), updated for the
two-lookup flow (§6):**

- **Discogs requests: hard cap 10** (1 search, 1 preview lookup, 1
  add-time persisting lookup, up to 2 more for the duplicate-copy re-add
  check — itself now 1 preview + 1 add-lookup per re-add attempt — up to 3
  in reserve for unplanned retries — stop and ask before request 11).
- **MusicBrainz requests: hard cap 2** (unchanged — this feature does not
  change MusicBrainz behavior).
- **OpenRouter/Vision/VIN requests: 0** (unchanged).

No forced live 6-hour staleness wait is required — the automated freshness
tests (§8.1's exhaustive boundary cases, §8.2/§8.3's integration tests) are
sufficient evidence.

## 19. Stop conditions

Unchanged in spirit from the original plan, with two additions from this
correction round:

- the read-only exact-preview lookup (§5.2) is found, during
  implementation, to be usable as a de facto "paste any Discogs ID" feature
  in a way this plan's UI-never-exposes-free-text-input reasoning did not
  anticipate — stop and ask rather than silently shipping an unintended
  user-facing capability;
- `CollectionItemCard.tsx`/`CollectionPanel.tsx` are found to be reachable
  through some mounted path this plan's inspection missed — stop and
  report rather than silently expanding the file list.

(All other original stop conditions — seventh Function, broad
Collection/VIN rewrite, Discogs Terms drift, Restricted Data, OAuth, new
AI call, tag movement, new dependency — unchanged.)

## 20. Current-official-docs re-verification gate — corrected scope

**[corrected, MEDIUM 7]** This plan's own research encountered the same
HTTP 403 spec 0018 already documented for the **developer/API-reference
page** (`https://www.discogs.com/developers`) — that page's technical
details (the exact Database Search parameter names this plan relies on:
`q`, `type`, `per_page`; the `/releases/{id}` and `/database/search`
endpoint paths and response field names §3/§4's mapping tables depend on)
remain this gate's actual subject, and must be independently confirmed by
the human directly in a browser before PR B locks them.

**The API Terms of Use page, separately, has already been confirmed
independently accessible and its clauses reviewed** (per this correction
round) — the six-hour freshness clause, the attribution wording, the
CC0/Restricted classification, and the commercial-use clause are treated
as already-verified for planning purposes and are **not** re-listed as
part of this open gate. (Spec 0018 §5.2's own text, which this plan does
not modify, still accurately describes that document's own historical
research attempt — this correction changes only this plan's own framing of
what remains open for it, not spec 0018's text.)

**Evidence classification** (unchanged structure, updated for this
correction's specific decisions):

| Decision | Basis |
| --- | --- |
| DB schema shape, existing constraint text (including the `IS NOT NULL` fix), existing Function/dependency shapes, `CollectionBrowser`/`HistoryPage` as the real mounted surfaces | **A — repository evidence** |
| Personal-token header auth works; Database Search **and exact-Release response field shapes, including their divergence** (§1); Hebrew query support; observed rate-limit headers | **B — Phase-0 empirical evidence** (one observation, not an eternal guarantee) |
| CC0/Restricted classification; six-hour freshness rule; attribution wording; commercial-use clause | **C — official Terms**, independently confirmed accessible this round |
| Provider boundary; identity contract; freshness mechanism shape (incl. the expiry timer + visibility-resume design); the two-lookup confirm flow; attribution surface enumeration; Vinyl-only gate; images/OAuth/Marketplace exclusion | **D — Vinyl Intelligence product decision** |
| Exact Database Search parameter names beyond `q`/`type`/`per_page`; exact current developer-reference endpoint documentation wording | **Not independently confirmed by A–D** — the §20 gate's subject |

## 21. Timebox — updated

The additional confirmation-dialog step, the two normalizer functions, the
expiry-timer/visibility-resume mechanism, and the two newly-confirmed
Collection/History surfaces add real, non-trivial scope beyond the
original draft's estimate:

- PR B runtime implementation: **14–18 hours** (up from 10–14 — the search/
  exact-release shape split, the second confirmation dialog, and two
  additional mounted-surface updates are the main drivers).
- Independent review + one correction round: **3–5 hours** (unchanged).
- Deploy + bounded human acceptance: **1–2 hours** (unchanged).
- Documentation closeout (PR C): **2–3 hours** (unchanged).

**Total: roughly 20–28 hours**, still within a 3–4 day window if each day
yields several focused hours, with the same slack-budgeting caveat as
before. **Features that must not be sacrificed under time pressure**
(unchanged, restated): provider-qualified identity; server-only secret;
exact server lookup before persistence (now twice, by design); Vinyl-only
validation; freshness compliance (including the expiry mechanism, not just
load-time checking); attribution on every confirmed surface; RLS/security;
Hebrew correctness; MusicBrainz regression safety.

## 22. Traceability (spec 0018 → this plan) — updated

| Spec 0018 section | Plan section | Test/evidence |
| --- | --- | --- |
| §6 provider boundary | §6 | `DiscogsSearchPanel.test.tsx` — no auto-fire |
| §7 identity | §11 | `ownedRelease.test.ts` |
| §8 search | §3 | `discogs.test.ts` (search-result normalizer, no artist/title split) |
| §9 exact lookup/trust | §4, §5.2, §5.3, §6, §10 | `discogs.test.ts`, `catalog-functions.test.ts` (two-lookup flow) |
| §10 normalization | §4.2 | `discogs.test.ts` (incl. §10.1 fixture) |
| §12 freshness | §8 | `discogsFreshness.test.ts`, `CollectionDataProvider.test.tsx` (incl. expiry timer + visibility), curator handler test |
| §13 attribution | §7 | every listed surface's test file, incl. `CollectionBrowser.test.tsx`, `HistoryPage.test.tsx` |
| §14 artwork | §7, §8.5 | each of the five callers' test files |
| §15 API contract | §5 | `catalog-functions.test.ts` |
| §16 security | §5.2, §5.3, §10, §13 | `catalog-functions.test.ts` |
| §17 resilience | §12 | `discogs.test.ts` (pacer, no-retry, sequential reconciliation) |
| §19 multilingual | §4.2, §18 | `discogs.test.ts` Hebrew fixture; human acceptance |
| §20 migration | §9 | `catalog_releases_rls.test.sql` (incl. the new NULL-provider regression) |
| §21 verification | full plan | traceability above |

## 23. Unresolved behavior-defining questions

**None.** Every BLOCKER/HIGH/MEDIUM finding from this correction round is
resolved above with an exact design, not deferred to implementation time:
the search-result/exact-release normalizer split (§3/§4); the freshness
expiry + visibility-resume mechanism and the corrected mounted-surface list
(§8, §1); the NULL-safe migration constraint (§9); the two-lookup
confirm-before-persist flow (§6); the genre side-channel type contract and
the single shared field-limits source (§2.3, §4.1); the full,
un-exempted attribution surface enumeration (§7); the corrected pacer
scope claim, pacing margin, and dedicated `DISCOGS_USER_AGENT` (§12); the
narrowed, accurate re-verification gate (§20). The one remaining item —
independent human re-verification of the Discogs developer/API-reference
page's technical details (§20) — is a precondition-gate for starting PR B,
not an unresolved implementation design question.
