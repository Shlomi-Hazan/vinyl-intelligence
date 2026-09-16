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
  tuple to be provider-qualified (§11). The existing MusicBrainz
  duplicate-copy dialog itself is completely unchanged and is never used
  for a Discogs candidate — Discogs uses its own confirmation dialog for
  both the not-owned and already-owned cases (§6).
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

## 6. Discogs fallback UI and confirmation flow (prior-round HIGH 4 foundation; this round's MEDIUM 4, resolved)

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
   own minimal renderer, §3.2 — title/year/country/format-summary/label).
   **[corrected]** Each rendered result already displays real Discogs API
   data (title, year, country, format, label) and therefore carries its
   own compact `DiscogsAttribution` mark (§7), linked to
   `discogsReleaseUrl(providerReleaseId)` — the same
   `derivedProviderPageUrl` `DiscogsSearchResultItem` already computes
   (§3.1). This is in addition to, not instead of, the confirmation
   dialog's own full-variant attribution (§7) — a user sees Discogs
   attribution at both the search-result stage and the confirmation stage,
   exactly as the Terms require adjacency to every place the data is
   directly presented, not only the last one before a write. An "already
   owned" badge is shown directly on a result whose `providerReleaseId`
   matches an owned `(discogs, id)` pair (checked with the already-known
   `providerReleaseId` — no need to wait for the exact lookup for this
   check).
3. User clicks "Review & Add" on one result → client calls `GET
   /api/catalog/search?provider=discogs&releaseId=<id>` (§5.2) — a
   loading/"Finding…" state shown meanwhile.
4. **[corrected, MEDIUM residual]** On success (a real, fully-normalized
   `CatalogCandidate` + genres, §4.1): **one** new confirmation dialog
   (extends the existing `Dialog` component; a genuinely new component for
   Discogs, not a reuse of the existing MusicBrainz-era duplicate-copy
   dialog) renders in **both** the not-owned and already-owned cases,
   always showing the same full, server-verified candidate metadata +
   `DiscogsAttribution` (full variant, §7):
   - **not already owned:** CTA = **"Confirm & Add"**.
   - **already owned:** an additional sentence — the existing approved
     duplicate-copy copy, "You already own this release. Add another
     physical copy to your collection?" — plus CTA = **"Add another
     copy"**.
   Both buttons call the **same** `add(candidate)` path (below). This
   ensures a Discogs "add another copy" confirmation always shows the
   real, exact, server-verified release identity and its required
   attribution — never the generic MusicBrainz-era dialog's copy, which
   has no candidate-metadata display at all (§1's corrected finding: that
   dialog only ever showed static confirmation text, never the release
   itself). **The existing MusicBrainz duplicate-copy dialog is completely
   unchanged and is never used for a Discogs candidate.**
5. On failure (not found / not Vinyl / rate-limited / timeout /
   unavailable): an honest, scoped error shown in the panel — the
   candidate list is unaffected, retry is user-triggered.
6. Confirming the dialog (either CTA) calls the **existing**, unmodified
   `add(candidate)` → `addCatalogReleaseToCollection(client, candidate)` →
   `POST /api/catalog/add` (§5.3) — the **second**, persisting exact
   lookup happens here, server-side, exactly as spec 0018 §9 requires;
   the browser's step-3 preview result is **never** sent as metadata, only
   `provider` + `providerReleaseId`.

This adds a genuinely-live request to the acceptance/local-smoke budgets
beyond the original plan's count (§18).

## 7. Attribution — final enumeration, aggregate rule corrected (HIGH 3 residual, resolved)

**Every plan-level exemption is removed**, including the previously-drafted
"pure aggregate is not Discogs Content" exemption. Attribution renders
wherever Discogs-sourced data is directly presented or used to compute a
visible aggregate, full stop.

One shared component, two variants (full line for primary surfaces,
compact inline mark for tight card layouts) — unchanged in shape from the
prior correction round:

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
| **[corrected] Discogs search result row** | `DiscogsSearchPanel.tsx` | **Yes** | compact |
| The Discogs exact-preview confirmation dialog (§6 step 4, both CTA cases) | new dialog, `DiscogsSearchPanel.tsx` or `DiscoverPanel.tsx` | **Yes** | full |
| Album Detail (Discogs-backed, fresh) | `AlbumDetailPage.tsx` | **Yes** | full, beside "View on Discogs" |
| `CollectionBrowser.tsx` grid card (`AlbumCard`), fresh | `CollectionBrowser.tsx` | **Yes** | compact |
| `CollectionBrowser.tsx` list row (`AlbumRow`), fresh | `CollectionBrowser.tsx` | **Yes** | compact |
| Dashboard `AlbumMini`, fresh | `DashboardPage.tsx` | **Yes** | compact |
| **[corrected] Dashboard genre/decade insight block** | `src/lib/dashboard/insights.ts`, `DashboardPage.tsx` | **Resolved rule (no aggregate exemption):** if the rendered insight's computation included **at least one currently-fresh** Discogs-backed item's provider-derived value (e.g. its catalog genre or release year contributed to the shown breakdown), the insight block carries one compact attribution mark. Per §8.4's masking rule, a **stale/unavailable** Discogs item's provider-derived fields are already excluded from these computations entirely (not merely unattributed) — so this rule only ever fires for a block that genuinely used live Discogs data, never a block that happens to include an unavailable item's absent value. | compact where applicable |
| `HistoryPage.tsx` row, fresh | `HistoryPage.tsx` | **Yes** | compact |
| VIN recommendation card | `CuratorRecommendationCard.tsx` | **Yes** | full |

**No attribution on purely user-owned values** — rating, favourite, notes,
personal genres, listening timestamp/count — these are never Discogs
Content regardless of the item's provider (explicit, per the audit's
instruction, not merely an omission).

**A `discogsUnavailable` item shows no attribution mark for the fields it
is currently masking** (§8.4) — there is nothing Discogs-sourced being
displayed for those fields in that state, so nothing to attribute; the
"View on Discogs" link (safe, identity-only, §8.4) may still carry its own
attribution independent of field freshness, since that link itself is
always Discogs-sourced data (the release's own page).

**Artwork provider-gating** extends to all five confirmed
`AlbumArtwork` callers (§1): `CollectionBrowser.tsx`'s `artProps()`,
`HistoryPage.tsx`, `DashboardPage.tsx`'s `AlbumMini`,
`CuratorRecommendationCard.tsx`, and `DiscoverPanel.tsx`'s
`renderCandidate`, all gate `releaseMbid`/`releaseGroupMbid` on
`provider === 'musicbrainz'` explicitly. Artwork rendering itself is
**never** affected by freshness — a Discogs item's artwork is always
either the user's own custom cover (user-owned, safe) or the generic
branded fallback (Vinyl Intelligence's own SVG, not provider data at all)
— so artwork is outside the `discogsUnavailable` masking rule entirely,
fresh or stale.

App-level, one-time notice — unchanged — placed in `SettingsPage.tsx`; not
a new route.

## 8. Six-hour freshness — complete data flow, no-stale-window, exact expiry (BLOCKER 1 + BLOCKER 2, resolved)

### 8.0 `provider_fetched_at` — exact client/server data flow (BLOCKER 2, resolved)

**Type contract:**

```ts
// src/lib/supabase/collection.ts
export type CollectionItemWithRelease = Pick<
  CollectionItem,
  'id' | 'added_at' | 'created_at' | 'rating' | 'is_favorite' | 'notes'
> & {
  custom_cover_path?: string | null
  custom_cover_updated_at?: string | null
  personal_genres?: string[]
  /**
   * Set (never persisted) by CollectionDataProvider's freshness pass
   * (S8.2) when this item's Discogs provider metadata could not be
   * confirmed fresh at classification time. Absent/false for every
   * non-Discogs item and every successfully-revalidated Discogs item.
   */
  discogsUnavailable?: boolean
  release: Pick<
    Release,
    | 'id' | 'artist' | 'title' | 'release_year' | 'label'
    | 'catalog_number' | 'country' | 'format' | 'genres' | 'updated_at'
  > & {
    provider?: CatalogProvider | null            // NEW
    provider_release_id?: string | null
    provider_release_group_id?: string | null
    provider_fetched_at?: string | null          // NEW
    source?: 'manual' | 'catalog' | null
  }
}
```

**`loadCollection`'s Supabase `select`** (`collection.ts`) gains `provider`
and `provider_fetched_at` alongside its existing
`provider_release_id`/`provider_release_group_id`/`source` — every
existing selector call site in this file (the initial `loadCollection`
query and, if any post-mutation collection-item re-select exists in the
same file, confirmed at implementation time) is updated identically, so no
code path can read a `CollectionItemWithRelease` missing these two fields.

**`loadOwnedCollection`'s `release` sub-select**
(`curator-handlers.mts:352`) gains `provider, provider_release_id,
provider_fetched_at` — the minimum needed to make the freshness decision
(§8.3) before any candidate-fact construction. `CuratorCollectionRow`'s
type gains these three fields on its `release` shape (server-internal only
— **not** added to `CuratorCollectionItem`, the type actually sent onward
to candidate-selection/prompt construction, which stays completely
unchanged, per the existing "no model/prompt/schema change" constraint).

**The refresh operation's exact response contract** (§8.2's server-side
counterpart, `handleCatalogRefresh`):

```ts
// netlify/functions/_shared/catalog-handlers.mts
export type DiscogsRefreshResponse = {
  candidate: CatalogCandidate
  genres: string[]
  providerFetchedAt: string   // the exact ISO timestamp the server persisted
}
```

The server generates **one** timestamp,
`const providerFetchedAt = new Date().toISOString()`, immediately after a
successful `lookupDiscogsRelease` call, inside `handleCatalogRefresh` (and,
identically, inside `handleCatalogAdd`'s Discogs branch, §5.3). That exact
string value is both **persisted** (as `provider_fetched_at`, via the
shared persistence helper, §8.3) and **returned** to the caller in the
response body. **The browser uses this returned value — never
`Date.now()` — when updating its in-memory `provider_fetched_at` and
recomputing the next expiry deadline (§8.2)**, so the client's freshness
clock is always anchored to the exact value actually stored in the
database, never to an approximation drifting from network latency between
the server's timestamp generation and the client's receipt of the
response.

### 8.1 Shared pure helper — unchanged from the prior correction round

```ts
// src/lib/catalog/discogsFreshness.ts
export const DISCOGS_FRESHNESS_WINDOW_MS = 6 * 60 * 60 * 1000   // exactly 6 hours

// age <= 6h -> fresh; age > 6h -> stale.
export function isDiscogsRowFresh(
  provider: string | null,
  providerFetchedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (provider !== 'discogs') return true
  if (!providerFetchedAt) return false
  const fetchedAtMs = Date.parse(providerFetchedAt)
  if (!Number.isFinite(fetchedAtMs)) return false
  return now - fetchedAtMs <= DISCOGS_FRESHNESS_WINDOW_MS
}

/**
 * Exact milliseconds until a currently-fresh row crosses the six-hour
 * boundary and becomes stale - NOT floored/rounded to any minimum delay
 * (S8.2's corrected timer relies on this being exact, not padded).
 * 0 for an already-stale or non-Discogs row.
 */
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

### 8.2 Client-side: `CollectionDataProvider` — mask-first, then revalidate; exact one-shot expiry

**[corrected — the prior draft did not guarantee stale metadata could
never render even transiently before an async refresh resolved, and its
timer had an arbitrary floor that could leave a stale-display window past
the six-hour boundary. Both gaps are closed below.]**

A new pure function, `maskStaleDiscogsItems(items, now)`, run
**synchronously**:

```ts
function maskStaleDiscogsItems(
  items: CollectionItemWithRelease[],
  now: number,
): CollectionItemWithRelease[] {
  return items.map((item) =>
    isDiscogsRowFresh(item.release.provider ?? null, item.release.provider_fetched_at ?? null, now)
      ? item
      : { ...item, discogsUnavailable: true },
  )
}
```

**Load-time sequence (no stale-display window):**

1. `loadCollection(client)` resolves with the raw `items`.
2. **Before `setItems` is ever called**, synchronously compute
   `masked = maskStaleDiscogsItems(items, Date.now())`.
3. `setItems(masked)`; `setStatus('ready')`. **This is the only state a
   `ready`-status consumer ever observes for a Discogs item that was not
   already fresh** — a stale row's provider-derived fields are never
   published even for one render before the async refresh below resolves.
4. Only *after* the masked state is published, asynchronously and
   **sequentially** (§12's corrected pacer scope), attempt
   `refreshDiscogsCollectionItem` (§8.2.1) for each item that was masked in
   step 2. On success: replace that item's release fields with the
   refreshed values, set `provider_fetched_at` to the response's own
   `providerFetchedAt` (§8.0 — never `Date.now()`), and clear
   `discogsUnavailable`. On failure: the item stays exactly as masked in
   step 2 (no change needed — it is already correctly marked).

**Exact one-shot expiry timer (no floor, no stale window):**

After every `items` update, compute
`Math.min` of `msUntilStale(item.release.provider, item.release.provider_fetched_at)`
over every **currently-fresh** (not already masked) Discogs item in
`items`. If none are fresh-with-a-Discogs-provider, no timer is scheduled.
Otherwise, `setTimeout(reconcile, delay)` where `delay` is that **exact**
computed value — **no artificial floor is applied**; a delay of `0` (or
any small value) fires immediately/soon, which is correct, not a bug, for
an item whose deadline has already effectively arrived. `reconcile`, when
it fires:

1. Reads the **current** `items` from state (via a ref or functional
   `setState`, not a closed-over stale value from when the timer was
   scheduled).
2. Applies `maskStaleDiscogsItems` again — **synchronously masking any
   item that just crossed the boundary before anything else happens** —
   and calls `setItems` with the newly-masked array immediately (the same
   mask-first discipline as the load-time sequence, applied here too, per
   the audit's explicit requirement that this rule apply "when an expiry
   timer or visibility-resume check discovers newly stale rows").
3. Only then, asynchronously and sequentially, attempts revalidation for
   the newly-masked items (identical to step 4 above).
4. Schedules the next timer based on the new minimum.

This guarantees a fresh row is re-evaluated and masked **at the instant**
it crosses the six-hour boundary (bounded only by ordinary JS
event-loop/timer-scheduling precision, not by any deliberately-added
floor) — never left displaying stale metadata past its deadline while the
tab remains mounted.

**Visibility-resume:** on the browser's `visibilitychange` event becoming
`'visible'`, immediately run the **same** mask-then-revalidate sequence
once (steps 2–4 above) over the current `items`. This closes the gap where
a backgrounded/suspended tab's `setTimeout` may have been throttled or
paused by the OS for longer than its scheduled delay — on resume, freshness
is authoritatively re-checked and re-masked rather than trusting a
possibly-late timer. Event-driven, not interval-driven — fires at most
once per visibility transition, never polling.

A full page reload/remount re-runs the load-time sequence from scratch,
providing a third, independent safety net for a suspension long enough
that the OS fully tore down the tab's JS.

`status`/`error` (the collection's own load phase) are **not** gated on
the asynchronous revalidation step completing — only on the **synchronous
masking** having already been applied before `setItems`/`'ready'`, per the
sequence above.

#### 8.2.1 `refreshDiscogsCollectionItem` — client wrapper

A thin `client.ts` wrapper posting `{ action: 'refresh', provider:
'discogs', providerReleaseId }` to the **existing** `/api/catalog/add`
endpoint, returning the `DiscogsRefreshResponse` shape (§8.0).

### 8.3 Server-side: `loadOwnedCollection` — sequential, shared persistence helper

**[corrected — the prior draft's "best-effort `upsertCatalogRelease`"
referred to a private function in a different module with no defined
import boundary. Resolved below.]**

`upsertCatalogRelease` (currently a private function inside
`catalog-handlers.mts`) is **extracted** into a new shared module,
`netlify/functions/_shared/catalogPersistence.mts`, and **exported**:

```ts
// netlify/functions/_shared/catalogPersistence.mts
export async function upsertCatalogRelease(
  env: Environment,
  createClientImpl: SupabaseFactory,
  candidate: CatalogCandidate,
  genres: string[],
  providerFetchedAt: string | null,
): Promise<CatalogReleaseRow>
```

Both `catalog-handlers.mts` (its add and refresh paths, §5.3, §8.2.1's
server side) and `curator-handlers.mts` (`loadOwnedCollection`'s
best-effort refresh, below) import this **same** function — there is
exactly one persistence implementation, with a real, named module boundary
between the two Netlify Function handler files, not an informal
cross-module reference to a private symbol.

`loadOwnedCollection`'s freshness pass, using the corrected §8.0 select
fields: partition into fresh-or-non-Discogs (pass through unchanged) and
stale-Discogs (via `isDiscogsRowFresh`); revalidate stale items
**sequentially** (§12); on success, call the shared
`upsertCatalogRelease` (best-effort — its own failure does not fail the
VIN request; the refreshed facts are still used for this request's
candidate construction even if the persistence write itself fails, since
persistence is a convenience for the *next* load, not a precondition for
*this* request's correctness) and use the refreshed facts for that item's
`CuratorCollectionItem`; on failure, **that item is filtered out of
`items` entirely for this one request** — unchanged from the original
plan. No prompt/schema/model change.

### 8.4 UI/derived-data treatment of `discogsUnavailable` — identity-field exception fully removed (BLOCKER 1, resolved)

**[corrected — the prior draft's "identity fields (title/artist) may still
be shown" exception directly contradicted spec 0018 §12, which names
`artist`/`title`/`release_year`/`genres` explicitly as gated fields. That
exception is removed in full, everywhere, including Album Detail and
Collection.]**

**When `discogsUnavailable === true`, no provider-derived value may be
displayed or used in any visible derived computation** — this includes
`artist`, `title`, `release_year`, `label`, `catalog_number`, `country`,
`format`, and catalog `genres`. The **only** data that may remain visible
for such an item is: its ownership/collection-item existence; the user's
own `rating`/`is_favorite`/`notes`/`personal_genres`; listening
timestamp/count; the user's own custom artwork; and the "View on Discogs"
link/exact provider identity (safe — derived only from the already-
validated `provider_release_id`, never from fetched metadata).

Per-surface treatment:

- **`CollectionBrowser.tsx`'s `AlbumCard`/`AlbumRow`:** the title
  position shows a fixed placeholder ("Catalog details unavailable") in
  place of `item.release.title`; the artist/meta line is replaced with a
  "Retry" action (calling `refreshDiscogsCollectionItem` for just this
  item); the item **remains** in the grid/list (not removed), remains
  navigable to Album Detail, and its rating/favourite/quick-actions
  controls remain fully functional (all user-owned, safe). Artwork is
  unaffected (§7).
- **`AlbumDetailPage.tsx`:** the page's own `<h1>` title and artist byline
  — **[corrected, no longer exempted]** — are replaced with a placeholder
  ("Record details unavailable") plus a page-level "Retry" action, exactly
  like the existing metadata `<dl>` block's year/label/catalog/country/
  format fields (already gated in the prior round, unchanged here); the
  "View on Discogs" link still renders (safe, above); rating, favourite,
  notes, personal genres, listening controls, and custom-cover-upload all
  remain fully functional and visible (all user-owned/identity-safe).
- **`DashboardPage.tsx`'s `AlbumMini`:** **[corrected, no longer
  exempted]** — title/artist text replaced with a short placeholder
  ("Unavailable"); the tile still links through to Album Detail (where the
  full Retry affordance lives); artwork unaffected.
- **`HistoryPage.tsx`'s row:** **[corrected, no longer exempted]** —
  artist/title replaced with "Record details unavailable"; the listen
  timestamp and play count remain shown (not provider-derived); artwork
  unaffected.
- **`CuratorRecommendationCard.tsx`:** cannot recommend an item VIN's own
  server-side pass (§8.3) already excluded for staleness — no additional
  gating logic needed here beyond the artwork gate (§7).

**Filtering, sorting, and search must not use a masked item's
provider-derived fields** (`CollectionBrowser.tsx`'s `applyCollectionQuery`,
`availableDecades`, `availableGenres`): for a `discogsUnavailable` item,
its `artist`/`title`/`release_year`/catalog `genres` are treated as
**absent** (not matched by a text search targeting them, not counted
toward a decade/genre filter's available options derived from them, not
used as a sort key — falling back to whatever this codebase's existing
convention already is for a missing/null value in each of those cases, not
a new convention invented here) for exactly as long as the item stays
masked. The item's **personal** genres, rating, favourite, and listening
recency remain fully usable in filtering/sorting, since those are never
provider-derived. The item itself is never removed from `items.length`/"N
of M records" counts.

**Dashboard insight computations** (`src/lib/dashboard/insights.ts`) —
genre and decade breakdowns specifically — **exclude** a masked item's
provider-derived `genres`/`release_year` from their computation entirely
until it is unmasked (this is also what makes §7's attribution rule for
these blocks correct: a masked item can never cause an insight block to
require attribution, since its data was never included in the first
place). Non-provider-derived aggregate stats (total record count,
favourites count, listening-based stats) are **unaffected** by masking —
those never depended on provider data.

**VIN behavior is unchanged from the prior round**: an unrevalidatable
stale Discogs item is excluded from that curator request's candidate pool
entirely (§8.3) — this is a stronger guarantee than masking (exclusion,
not display substitution), already fully compliant with spec 0018 §12,
and is not modified by this correction.

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
- `src/catalog/DiscogsSearchPanel.tsx` (search results, each carrying its
  own compact `DiscogsAttribution` mark, §7 + "Review & Add" + the new
  confirmation dialog logic, §6, used for both the not-owned and
  already-owned Discogs cases) + `.test.ts`.
- `netlify/functions/_shared/catalogPersistence.mts` — the extracted,
  exported `upsertCatalogRelease` (§8.3), imported by both
  `catalog-handlers.mts` and `curator-handlers.mts`.
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
- `src/app/CollectionDataProvider.tsx` — mask-then-revalidate load
  sequence, exact one-shot expiry timer, `visibilitychange` listener
  (§8.2).
- `src/app/CollectionDataProvider.test.tsx` — including fake-timer tests
  for the exact six-hour boundary (§16).
- `netlify/functions/_shared/catalog-handlers.mts` — `provider` param on
  both search branches (§5.1, §5.2), widened add validation, Discogs add
  branch (§5.3), new `handleCatalogRefresh` returning
  `DiscogsRefreshResponse` (§8.0, §8.2.1); `upsertCatalogRelease` **moved
  out** to `catalogPersistence.mts` (§8.3), imported back in;
  `catalogReleasePayload` gains `providerFetchedAt`.
- `netlify/tests/catalog-functions.test.ts` — extended for all of the
  above; existing MusicBrainz-path payload assertions updated only for the
  new key (mechanical).
- `netlify/functions/_shared/curator-handlers.mts` — `provider`/
  `provider_release_id`/`provider_fetched_at` added to the release
  sub-select; `loadOwnedCollection` sequential freshness pass importing
  the shared `catalogPersistence.mts::upsertCatalogRelease` (§8.3).
- the existing curator handler test file covering `loadOwnedCollection`
  (confirmed exact filename at implementation time) — extended, zero real
  model/provider calls.
- `src/pages/AlbumDetailPage.tsx` — provider-aware provenance block,
  provider-gated artwork, full `discogsUnavailable` treatment (title,
  artist, and every metadata field masked — §8.4), attribution.
- `src/pages/AlbumDetailPage.test.tsx`.
- **`src/collection/CollectionBrowser.tsx`** — **[replaces
  `CollectionItemCard.tsx` as the primary Collection-surface change]**:
  `artProps()` provider-gated; `AlbumCard`/`AlbumRow` gain compact
  attribution and the full `discogsUnavailable` placeholder treatment
  (§8.4); `applyCollectionQuery`/`availableDecades`/`availableGenres`
  treat a masked item's provider-derived fields as absent for
  search/filter/sort (§8.4).
- **`src/collection/collectionQuery.ts`** (or the exact file(s) backing
  `applyCollectionQuery`/`availableDecades`/`availableGenres`, confirmed at
  implementation time) — the same absent-for-filtering treatment.
- **`src/collection/CollectionBrowser.test.tsx`** (confirmed exact
  filename at implementation time) — including a masked-item
  filter/sort-exclusion test.
- **`src/pages/HistoryPage.tsx`** — provider-gated artwork, compact
  attribution, full `discogsUnavailable` treatment (artist/title replaced
  with "Record details unavailable"; listen timestamp/count unaffected,
  §8.4).
- **`src/pages/HistoryPage.test.tsx`**.
- `src/pages/DashboardPage.tsx` — provider-gated artwork (`AlbumMini`,
  title/artist masked per §8.4), compact attribution.
- **`src/lib/dashboard/insights.ts`** — genre/decade breakdown functions
  exclude a masked item's provider-derived `genres`/`release_year` from
  their computation (§8.4); non-provider-derived aggregates unaffected.
- `src/pages/DashboardPage.test.tsx` — including an insight-exclusion test
  for a masked item and the attribution-on-fresh-contribution test (§7).
- `src/curator/CuratorRecommendationCard.tsx` — provider-gated artwork,
  full attribution.
- the existing test file covering `CuratorRecommendationCard` (confirmed
  exact filename at implementation time).
- `src/catalog/DiscoverPanel.tsx` — mounts `DiscogsSearchPanel.tsx`'s entry
  point (§6); provider-gated artwork; `isExactCatalogReleaseOwned` call
  site updated. **The existing MusicBrainz duplicate-copy `Dialog` is not
  modified** — Discogs's own new dialog (in `DiscogsSearchPanel.tsx`)
  handles both the not-owned and already-owned Discogs cases (§6).
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
6. `catalogPersistence.mts`: extract `upsertCatalogRelease` out of
   `catalog-handlers.mts` (mechanical move, gains the `providerFetchedAt`
   parameter), confirm `catalog-functions.test.ts` still passes with only
   the import path changed — proves the extraction itself is behavior-neutral
   before any Discogs logic is added on top.
7. `catalog-handlers.mts`: `provider` on both search branches,
   `handleCatalogRefresh` (returning `DiscogsRefreshResponse`), widened add
   validation + Discogs branch, `catalogReleasePayload` change. Get
   `catalog-functions.test.ts` green.
8. `client.ts`: preview-lookup wrapper, `refreshDiscogsCollectionItem`.
9. `ownedRelease.ts`: provider-qualified signature; update both call sites.
10. `collection.ts`: load/type `provider` + `provider_fetched_at`;
    re-export `RELEASE_FIELD_LIMITS`.
11. `discogsFreshness.ts` fake-timer-tested boundary cases finalized here
    if not already exhaustive from step 4 (just-below/exactly/just-after
    six hours).
12. `CollectionDataProvider.tsx`: the mask-then-revalidate load sequence,
    the exact one-shot expiry timer, the `visibilitychange` listener. Get
    its test green, including the fake-timer boundary tests (§16), before
    touching any consuming UI component — every downstream component only
    ever needs to read `discogsUnavailable`, never compute freshness
    itself.
13. `curator-handlers.mts`: `provider`/`provider_release_id`/
    `provider_fetched_at` in the release sub-select; `loadOwnedCollection`
    sequential freshness pass importing the shared
    `catalogPersistence.mts::upsertCatalogRelease` — after step 12, for the
    same reason as before (client-side integration proven first).
14. `DiscogsAttribution.tsx`.
15. `DiscoverPanel.tsx` + `DiscogsSearchPanel.tsx`: fallback UI, the new
    confirmation dialog (used for both the not-owned and already-owned
    Discogs cases — the existing MusicBrainz dialog is not touched),
    artwork gating, `isExactCatalogReleaseOwned` call site.
16. `AlbumDetailPage.tsx`: provenance block, artwork gating, the full
    `discogsUnavailable` treatment (title/artist included), attribution.
17. `CollectionBrowser.tsx` (+ its filter/sort helper file), `HistoryPage.tsx`,
    `DashboardPage.tsx` (+ `insights.ts`), `CuratorRecommendationCard.tsx`:
    artwork gating, attribution, the full `discogsUnavailable` placeholder
    treatment and filter/insight-exclusion rules (§8.4/§7's per-surface
    rules).
18. `SettingsPage.tsx`: app-level notice.
19. The migration file + pgTAP additions — written now, applied only per
    §17's deploy-order gate.
20. Full automated gate from a clean checkout.
21. Local manual smoke (§16) — no deploy yet.

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

**Required fake-timer test cases for `CollectionDataProvider`/
`discogsFreshness.ts`** (§8, mandatory, not optional coverage):

- `provider_fetched_at` just below six hours old → classified fresh, no
  mask, no revalidation call.
- exactly six hours old → still classified fresh (the boundary itself is
  inclusive of fresh, per §8.1's "age <= 6h = fresh").
- one millisecond past six hours old → classified stale;
  `discogsUnavailable` is `true` in the **very same** `setItems` call that
  first publishes the item as `ready` — never a later render.
- the one-shot expiry timer fires at (or immediately after) the exact
  computed deadline and masks the affected item **before** its
  revalidation request is even issued (assert the masked state is set
  first, via a synchronous check, before resolving the mocked revalidation
  promise).
- a `visibilitychange` → `'visible'` event triggers the identical
  mask-then-revalidate sequence for an item that became stale while the
  tab was hidden.
- a successful revalidation updates `provider_fetched_at` to the **exact**
  `providerFetchedAt` string the mocked server response returned — not a
  value derived from `Date.now()` at the client.
- a failed revalidation leaves `discogsUnavailable: true` and does not
  restore any provider-derived field.

**Independent review gate** — unchanged bar (0 BLOCKER/HIGH/MEDIUM),
additionally confirming: the search-result and exact-release normalizers
are genuinely distinct functions, never conflated; the NULL-safe migration
constraint is exactly as specified; `CollectionBrowser.tsx`/`HistoryPage.tsx`
(not `CollectionItemCard.tsx`) carry the production freshness/attribution
treatment; **no surface displays a masked item's title, artist, release
year, label, catalog number, country, format, or catalog genres** — the
identity-field exception is fully absent from the implementation, not just
the plan text; attribution renders on every surface §7 lists, with no
silent re-introduction of a "preview surface" or "pure aggregate" exemption;
the Discogs pacer/User-Agent are genuinely independent from MusicBrainz's;
stale-refresh reconciliation is sequential, not parallel, on both the
client and server paths; the Discogs duplicate-copy case renders the new
exact-metadata dialog, never the generic MusicBrainz-era dialog; the
`upsertCatalogRelease` persistence helper is a single, shared, exported
function imported by both `catalog-handlers.mts` and
`curator-handlers.mts`, not two independent implementations.

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
mask-first/exact-expiry freshness mechanism, the shared persistence-helper
extraction, and the full (no-exception) masking/filtering/insight
treatment across five display surfaces add real, non-trivial scope beyond
the original draft's estimate:

- PR B runtime implementation: **17–22 hours** (up from 14–18 — this
  round's corrections replace a single-dialog reuse with a genuinely new
  dialog used twice, add a `catalogPersistence.mts` extraction step, and
  extend masking from "gate five metadata fields on four surfaces" to
  "gate all seven provider-derived fields, including title/artist, on
  five surfaces plus filtering/sorting/insights logic").
- Independent review + one correction round: **3–5 hours** (unchanged).
- Deploy + bounded human acceptance: **1–2 hours** (unchanged).
- Documentation closeout (PR C): **2–3 hours** (unchanged).

**Total: roughly 23–32 hours**, still plausible within a 3–4 day window
only if each day yields several focused hours; this is now close enough to
the upper edge of that window that the slack-budgeting caveat from earlier
rounds becomes a firmer scheduling risk, not just a caveat — if actual
implementation time tracks toward the top of this range, that is itself
useful signal to flag to the human early, not a reason to quietly cut
scope from the MUST-HAVE list below. **Features that must not be
sacrificed under time pressure** (unchanged, restated, now including this
round's corrections explicitly): provider-qualified identity; server-only
secret; exact server lookup before persistence (twice, by design); Vinyl-only
validation; **complete** freshness compliance (the exact expiry mechanism,
the mask-before-publish sequencing, and the full field list — title/artist
included, no identity-field exception); attribution on every confirmed
surface with no aggregate exemption; the Discogs-specific confirmation
dialog for both add cases; RLS/security; Hebrew correctness; MusicBrainz
regression safety.

## 22. Traceability (spec 0018 → this plan) — updated

| Spec 0018 section | Plan section | Test/evidence |
| --- | --- | --- |
| §6 provider boundary | §6 | `DiscogsSearchPanel.test.tsx` — no auto-fire, attribution present on every rendered result |
| §7 identity | §11 | `ownedRelease.test.ts` |
| §8 search | §3 | `discogs.test.ts` (search-result normalizer, no artist/title split) |
| §9 exact lookup/trust | §4, §5.2, §5.3, §6, §10 | `discogs.test.ts`, `catalog-functions.test.ts` (two-lookup flow) |
| §10 normalization | §4.2 | `discogs.test.ts` (incl. §10.1 fixture) |
| §12 freshness | §8.0–§8.4 | `discogsFreshness.test.ts` (exact 6h boundary), `CollectionDataProvider.test.tsx` (mask-before-publish, expiry timer, visibility resume, server-timestamp usage), curator handler test, `CollectionBrowser`/`DashboardPage`/`insights.ts` masked-exclusion tests |
| §13 attribution | §7 | every listed surface's test file, incl. `CollectionBrowser.test.tsx`, `HistoryPage.test.tsx`, `DashboardPage.test.tsx` (insight-attribution rule) |
| §14 artwork | §7, §8.4 | each of the five callers' test files |
| §15 API contract | §5 | `catalog-functions.test.ts` |
| §16 security | §5.2, §5.3, §10, §13 | `catalog-functions.test.ts` |
| §17 resilience | §12 | `discogs.test.ts` (pacer, no-retry, sequential reconciliation) |
| §19 multilingual | §4.2, §18 | `discogs.test.ts` Hebrew fixture; human acceptance |
| §20 migration | §9 | `catalog_releases_rls.test.sql` (incl. the new NULL-provider regression) |
| §21 verification | full plan | traceability above |

## 23. Unresolved behavior-defining questions

**None.** Every finding from both correction rounds is resolved above with
an exact design, not deferred to implementation time. From this final
round specifically: the identity-field display exception is removed in
full — no provider-derived field (artist, title, release year, label,
catalog number, country, format, catalog genres) is ever displayed or used
in a visible derived computation for a masked Discogs item, on any surface
(§8.4); the exact `provider_fetched_at` client/server data flow, including
the `CollectionItemWithRelease`/`loadCollection`/`loadOwnedCollection`
select fields and the `DiscogsRefreshResponse` type carrying the
server-generated timestamp back to the client (§8.0); the mask-before-publish
sequencing that guarantees no stale-display window, on load, on timer
expiry, and on visibility resume (§8.2); the exact, floor-free six-hour
expiry timer (§8.1/§8.2); the shared, exported `catalogPersistence.mts`
persistence-helper boundary between `catalog-handlers.mts` and
`curator-handlers.mts` (§8.3); the corrected attribution rule for
derived/aggregate blocks — traceable-to-a-fresh-value requires attribution,
no blanket aggregate exemption (§7); and the single, Discogs-specific
confirmation dialog used for both the not-owned and already-owned cases
(§6). From the prior round, still in force and not reopened: the
search-result/exact-release normalizer split (§3/§4); the NULL-safe
migration constraint (§9); the genre side-channel type contract and the
single shared field-limits source (§2.3, §4.1); the corrected pacer scope
claim, pacing margin, and dedicated `DISCOGS_USER_AGENT` (§12); the
narrowed, accurate re-verification gate (§20). The one remaining item —
independent human re-verification of the Discogs developer/API-reference
page's technical details (§20) — is a precondition-gate for starting PR B,
not an unresolved implementation design question.
