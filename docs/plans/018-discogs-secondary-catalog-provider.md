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

Evaluated per the spec's own coupling and confirmed by direct source
inspection (§1, below): the migration (widened provider constraint +
`provider_fetched_at`), the Discogs provider adapter, the extended
search/add contract, the freshness plumbing threaded through both
`loadCollection` and `loadOwnedCollection`, and the UI/attribution surfaces
all sit on one additive-but-interlocking change. Splitting the migration
from the runtime that depends on its new column/constraint would require an
intermediate production state where either the runtime references a column
that doesn't exist yet, or a migrated column sits unused — neither is a
safe independently-deployable boundary. One runtime PR, several coherent
commits inside it (§7), avoids that, exactly matching spec 0017's own
precedent for this project.

## Global constraints (from the spec + `AGENTS.md`)

- No dependency add/upgrade.
- One new environment variable: `DISCOGS_TOKEN` (server-only, §14) — no
  other new environment variable.
- One forward-only database migration (§6). No RLS/grant weakening. No
  authenticated/anon write grant added to catalog `releases` columns.
- No Netlify config change. **No new Netlify Function** — the existing six
  endpoints stay six; `/api/catalog/search` and `/api/catalog/add` gain
  parameters/branches, not siblings (§5).
- No AI/model/prompt change of any kind — zero OpenRouter/Vision/VIN model
  touch-points; VIN's `loadOwnedCollection` gains freshness-safe **data
  plumbing** only (§10).
- No change to Scan's vision recognition flow, schema, or state machine —
  confirmed structurally unnecessary (§1: Scan candidates can never carry
  `provider: 'discogs'` under this spec).
- No change to the duplicate-copy contract's *decision rule* (exact
  `(provider, provider_release_id)` equality) — only widening its identity
  tuple to be provider-qualified (§8).
- No change to manual-add semantics.
- Every automated gate green from a clean checkout before PR B opens; an
  independent review before merge; a human production acceptance before
  PR C starts.
- Any finding that would require a new Function, an OAuth flow, Restricted
  Data (images/Marketplace), a dependency, or a security-contract change →
  **STOP and return to the human** (§21 expands this).

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
based (existing project convention, confirmed in
`netlify/tests/catalog-functions.test.ts`, `src/catalog/DiscoverPanel.test.tsx`,
`src/curator/*.test.tsx`, `netlify/functions/_shared/curator-handlers.mts`'s
own test file).

Deploy step (only after human-approved merge): provision `DISCOGS_TOKEN` in
Netlify (§14), apply the reviewed migration to hosted Supabase, then the
project's existing manual `netlify deploy --prod` workflow — no new
deployment mechanism — then a non-provider smoke (`/`, `/api/health`, one
SPA deep link), then STOP for human production acceptance (§20).

---

## 1. Current-source findings that shaped this plan

Verified by direct inspection at baseline `bb00c7c`, not assumed from the
spec alone.

| Finding | Evidence | Consequence for this plan |
| --- | --- | --- |
| `CatalogProvider` is a single-literal type; `parseAddRequest` hardcodes `payload.provider !== 'musicbrainz'`; the DB check constraint hardcodes `provider = 'musicbrainz'` | `src/lib/catalog/types.ts:1`; `netlify/functions/_shared/catalog-handlers.mts:367`; `supabase/migrations/20260826000100_add_catalog_releases.sql` | Three independent gates, all confirmed, all must change together — this is not a single-point fix. |
| `releases_provider_release_identity_unique` is **already** `unique (provider, provider_release_id)` | same migration | No schema change needed to the identity constraint itself — only to the accepted `provider` values (§6). |
| `CatalogFunctionDependencies` (search/add) is 100% MusicBrainz-shaped (`lookupRelease`, `searchReleases`, `lookupReleaseGroupGenres`, `paceProviderRequest` all typed against `musicbrainz.ts`) | `catalog-handlers.mts:52-59` | A parallel Discogs dependency set is added to the same object, not a new architecture (§5, §9). |
| `parseCatalogSearchRequest` has no `provider` parameter; the search branch always calls the one `searchReleases` dependency | `catalog-handlers.mts:245-306` | A `provider` query parameter is added, default `musicbrainz` (§5). |
| `fetchMusicBrainzJson`'s fetch/timeout/error-mapping shape (`AbortController`, `DEFAULT_TIMEOUT_MS = 8_000`, 429/503→`provider_rate_limited`, 404→`not_found`, non-ok→`provider_unavailable`, abort→`provider_timeout`) | `src/lib/catalog/musicbrainz.ts:443-503` | The Discogs adapter's `fetchDiscogsJson` mirrors this exact shape, swapping the `User-Agent`-only header for `Authorization: Discogs token=...` (+ `User-Agent`), and reusing the same five `CatalogErrorCode` categories — no new error category. |
| `normalizeMusicBrainzRelease` returns `null`/rejects on any missing-or-invalid required field, never persists a partial/guessed value; reuses `musicBrainzReleaseUrl` for the derived page URL | `musicbrainz.ts:393-441` | `normalizeDiscogsRelease` mirrors this exact discipline, using a new `discogsReleaseUrl` helper (§3). |
| `MUSICBRAINZ_RELEASE_ID_PATTERN` lives in the browser-safe `musicbrainzIdentity.ts`, re-exported (not duplicated) by `musicbrainz.ts` | `src/lib/catalog/musicbrainzIdentity.ts` | The Discogs analog (`discogsIdentity.ts`) follows the identical split: pure, dependency-free, browser-safe identity/URL helpers in one file; provider-fetch/timeout logic in a separate server-oriented `discogs.ts` (§3). |
| Exactly two current consumers of persisted release metadata: `loadCollection` (client, feeds Dashboard/Collection/Album-Detail/VIN-card via the single shared `CollectionDataContext`) and `loadOwnedCollection` (server, VIN candidate facts) | `src/lib/supabase/collection.ts`, `src/app/CollectionDataProvider.tsx`, `src/app/collection-data-context.ts`, `netlify/functions/_shared/curator-handlers.mts:331-364` | Confirms spec 0018 §12's own finding precisely — freshness plumbing has exactly two integration points, not an open-ended set (§10). |
| **Four**, not three, existing `AlbumArtwork` callers wire `provider_release_id`/`provider_release_group_id` into `releaseMbid`/`releaseGroupMbid` unconditionally | `src/catalog/DiscoverPanel.tsx:441-443`, `src/pages/AlbumDetailPage.tsx:161-162`, `src/pages/DashboardPage.tsx:46-47`, `src/curator/CuratorRecommendationCard.tsx:79-80` | `DashboardPage.tsx`'s `AlbumMini` and `CuratorRecommendationCard.tsx`'s artwork-prop builder were not named in the spec's own finding table but are structurally identical instances of the same gap — both must be gated in PR B (§12). `ScanPanel.tsx` has the same *pattern* but is confirmed **not** in scope: Scan candidates can only ever be `provider: 'musicbrainz'` (it calls the pre-0017 `searchCatalog` wrapper, which always sends `mode: 'all'` to MusicBrainz only) — no code change needed there. |
| `CollectionItemCard.tsx`'s `metadataLine` and `DashboardPage.tsx`'s `AlbumMini`/insights consume `release.artist`/`title`/`release_year`/`label`/`catalog_number`/`country`/`format` directly from the shared `items` array | `src/collection/CollectionItemCard.tsx:29-36`, `src/pages/DashboardPage.tsx`, `src/lib/dashboard/insights.ts` | These are exactly the fields the §12 freshness contract protects — confirms Collection browse **and** Dashboard are both real, not hypothetical, consumers (matching the spec's own §12 language, now precisely evidenced). |
| `CollectionDataProvider` is the **single** client-side load point (`loadCollection(client)` in one `useEffect`), consumed everywhere via `CollectionDataContext` | `src/app/CollectionDataProvider.tsx:56-82` | The correct, smallest injection point for client-side freshness handling is inside/alongside this one provider, not duplicated per-view (§10). |
| Exactly 6 Netlify Functions exist today (`health`, `catalog-search`, `catalog-add`, `catalog-recognize`, `curator-recommend`, `curator-refine`) | `netlify/functions/*.mts`, `netlify.toml` | The freshness-revalidation operation (§10) must be hosted inside one of these six, not a seventh. |
| `.env.example` has no `DISCOGS_TOKEN` entry; test scripts are `typecheck`/`lint`/`test:run`/`build` exactly as expected | `.env.example`, `package.json` | Confirms the exact gate commands (already listed above) and the exact new env-var addition needed (§14). |

## 2. Chosen designs (resolved — no open behavior-defining implementation choice)

### 2.1 Discogs identity/URL helpers — new sibling module, `src/lib/catalog/discogsIdentity.ts`

Mirrors `musicbrainzIdentity.ts` exactly: a small, dependency-free,
**browser-safe** pure module (no `fetch`, no `AbortController`, no timeout
logic), containing:

- `DISCOGS_RELEASE_ID_PATTERN = /^[1-9][0-9]{0,9}$/` — a bare positive
  integer, 1–10 digits (bounding a Discogs release id well above any
  observed real value — Phase-0's largest observed id, `26770436`, is 8
  digits — without inventing a claimed provider maximum; 10 digits is
  simply a generous, defensive upper bound on string length, not an
  asserted Discogs guarantee). **IDs are validated and carried as strings
  everywhere in the application** — never parsed to a JS `number` — so
  identity is never subject to floating-point/integer-precision loss
  (spec 0018 §26 gate item).
- `discogsReleaseUrl(providerReleaseId: string): string | null` — returns
  `https://www.discogs.com/release/${id}` for an id passing the pattern
  above, `null` otherwise (Phase-0 confirmed `www.discogs.com` — not the
  bare API host — is the correct human-facing release page domain;
  distinct from `api.discogs.com`, which is never linked to from the UI).
- No `discogsWebSearchUrl` equivalent to `musicBrainzWebSearchUrl` — spec
  0018 §3 explicitly cuts an outbound "Search on Discogs" navigation
  feature; not planned.
- No `parseDiscogsReleaseUrl` (URL-paste parser) — spec 0018 §3 explicitly
  cuts the exact-Discogs-URL-import feature; not planned.

### 2.2 Discogs provider adapter — new file, `src/lib/catalog/discogs.ts`

Mirrors `musicbrainz.ts`'s shape and discipline exactly (fetch/timeout,
error mapping, normalization-rejects-rather-than-guesses):

```ts
// src/lib/catalog/discogs.ts
const DISCOGS_API_BASE_URL = 'https://api.discogs.com'
const DISCOGS_PROVIDER = 'discogs'
const DEFAULT_TIMEOUT_MS = 8_000          // matches musicbrainz.ts
const DISCOGS_SEARCH_PAGE_SIZE = 10       // Phase-0 exercised per_page=10;
                                            // filtered down to <=5 Vinyl
                                            // candidates before the UI sees
                                            // them (spec 0018 S8) - a
                                            // provider fetch-page-size
                                            // choice, not a provider
                                            // guarantee.

export class DiscogsError extends Error {
  readonly code: CatalogErrorCode
  readonly status?: number
}

export type DiscogsFetchOptions = {
  fetchImpl?: FetchFunction
  timeoutMs?: number
  token: string        // sent as `Authorization: Discogs token=${token}`
  userAgent: string     // Discogs also expects a descriptive User-Agent
}

export type DiscogsSearchOptions = DiscogsFetchOptions & { query: string }

export type DiscogsSearchPage = {
  candidates: CatalogCandidate[]   // already Vinyl-filtered, already capped at 5
}

export async function searchDiscogsReleases(
  options: DiscogsSearchOptions,
): Promise<DiscogsSearchPage>

export async function lookupDiscogsRelease(options: {
  fetchImpl?: FetchFunction
  providerReleaseId: string
  timeoutMs?: number
  token: string
  userAgent: string
}): Promise<CatalogCandidate>   // throws DiscogsError('not_found', ...)
                                 // if the release is not Vinyl-format (§2.4)

export function normalizeDiscogsRelease(release: unknown): CatalogCandidate | null
```

`fetchDiscogsJson` (internal, unexported, mirrors
`fetchMusicBrainzJson` line-for-line) maps: 429 → `provider_rate_limited`;
404 → `not_found`; any other non-ok → `provider_unavailable`; `AbortError`
→ `provider_timeout`; anything else → `provider_unavailable`. Same five
`CatalogErrorCode` values MusicBrainz already uses — **no new error
category is introduced.**

**Why a new module and not folding into `musicbrainz.ts`:** exactly the
same reasoning `musicbrainzIdentity.ts` was split out for (spec 0017) —
`musicbrainz.ts` and `discogs.ts` each contain provider-specific
fetch/timeout/pacing logic; nothing should import one to get the other.
`catalog-handlers.mts` imports both, exactly as it already imports
`musicbrainz.ts` today.

### 2.3 Discogs search-result → `CatalogCandidate` mapping

Per spec 0018 §10/§10.1, implemented in `normalizeDiscogsRelease`:

| `CatalogCandidate` field | Discogs source | Rule |
| --- | --- | --- |
| `provider` | fixed | `'discogs'` |
| `providerReleaseId` | `id` | Required; `String(id)` (Discogs Database Search results return a JSON number here; the Release-lookup response's `id` is also numeric) — converted to a string **once, at the normalization boundary**, and never parsed back to a number anywhere downstream. Validated against `DISCOGS_RELEASE_ID_PATTERN`; reject (`return null`) if it fails. |
| `providerReleaseGroupId` | `master_id` | `String(master_id)` if present and non-zero (Discogs uses `0`/absent to mean "no master" — both map to `null`, mirroring the spec's own "may be nullable" language); otherwise `null`. Never required. |
| `artist` | `artists_sort` | Required; cleaned/length-bounded against `RELEASE_FIELD_LIMITS.artist` (160 — reusing the existing shared constant already defined in `musicbrainz.ts`, extracted to a small shared `catalogFieldLimits.ts` module in this PR so both adapters import the same limits, §4). Reject if empty after cleaning or exceeding the bound (never truncate). |
| `title` | `title` | Required; same treatment, `RELEASE_FIELD_LIMITS.title` (200). |
| `releaseYear` | `year`, falling back to a parsed leading 4-digit year from `released` only if `year` is absent/zero | Bounded by the existing shared `RELEASE_YEAR_MIN`/`MAX` (1900–2100, also extracted to the shared limits module). Out-of-bounds or unparseable → `null`, never fabricated. |
| `country` | `country` | Optional; bounded to 80 chars (existing `RELEASE_FIELD_LIMITS.country`). |
| `label` / `catalogNumber` | `labels[]` | **Sentinel-aware rule (spec 0018 §10.1), implemented exactly as specified:** prefer the first entry whose `name` is non-empty **and** whose `catno`, trimmed, is non-empty and not case-insensitively equal to `"none"`; use that entry's `name`/`catno`. Otherwise, `label` = the first entry's `name` if any label exists at all, `catalogNumber` = `null`. Never persists the literal string `"none"`. |
| `format` (Vinyl summary string) | `formats[]` | Only computed for a format entry whose `name === 'Vinyl'` (case-sensitive match against Discogs' own documented enum value, confirmed present in Phase-0 evidence) — a deterministic join of that entry's `qty` (when `> "1"`) and `descriptions` (e.g. `"Vinyl, LP, Album"` or `"2 x Vinyl, LP"` when `qty > 1`), bounded to 80 chars (existing `RELEASE_FIELD_LIMITS.format`). If no `formats[]` entry has `name === 'Vinyl'`, `normalizeDiscogsRelease` **returns `null`** — this is the Vinyl-eligibility gate (spec 0018 §8), implemented once, here, not duplicated as a separate filter step. |
| `genres` | `genres` (Discogs) | Passed through the existing `release_genres_valid`-compatible cleaning already used for MusicBrainz genres (trim, lowercase, dedupe, ≤12 entries of ≤40 chars) — reusing the existing shared genre-cleaning helper already used by `normalizeMusicBrainzRelease`, not a new implementation. |
| `derivedProviderPageUrl` | (computed) | `discogsReleaseUrl(providerReleaseId)` (§2.1) — `null` only if `providerReleaseId` itself failed validation, in which case the whole candidate was already rejected above. |
| `score` | (not applicable) | `null` — Discogs Database Search does not return a MusicBrainz-style relevance score in the fields Phase-0 confirmed; `CatalogCandidate.score` already tolerates `null` (used today only for MusicBrainz result ordering hints, which Discogs's small, unpaginated v1 result set does not need). |
| `provider_fetched_at` (DB column, not a `CatalogCandidate` field) | (application-generated) | Set by the handler (§9), not by `normalizeDiscogsRelease` — the normalizer is a pure function with no clock access, matching `normalizeMusicBrainzRelease`'s existing purity. |

### 2.4 Vinyl-only eligibility — implemented once, in the normalizer

Per spec 0018 §8, a candidate whose Discogs format metadata does not
identify Vinyl must never be offered for add. Rather than fetching a larger
page and filtering twice (once for display candidates, once again at
add-time), **`normalizeDiscogsRelease` itself returns `null` for any
release with no `formats[]` entry named `'Vinyl'`**, at both call sites
(search-result mapping and exact-lookup-before-persist, §9) — so a non-Vinyl
release can never reach the UI as a candidate, and can never reach
persistence, via the exact same code path. This is the "filter the
already-fetched, already-verified response shape" mechanism spec 0018 §8
itself requires (no invented `format=Vinyl` query parameter).

### 2.5 Search request/response shape

`searchDiscogsReleases` calls
`GET https://api.discogs.com/database/search?q=<query>&type=release&per_page=10`
(§2.2's `DISCOGS_SEARCH_PAGE_SIZE`), authenticated via the
`Authorization: Discogs token=...` header, maps each raw result through
`normalizeDiscogsRelease` (dropping `null`s — non-Vinyl or malformed
entries silently excluded, matching `normalizeMusicBrainzRelease`'s own
per-entry-reject discipline), and returns **at most the first 5** surviving
candidates (`.slice(0, 5)`) — the hard UI cap from spec 0018 §8. No
provider `page`/pagination parameter is ever sent beyond the single
fetched page; "Load more" is not implemented for Discogs (confirmed cut).

### 2.6 `types.ts` changes

```ts
// src/lib/catalog/types.ts
export type CatalogProvider = 'musicbrainz' | 'discogs'
```

No other change to `types.ts` — `CatalogCandidate`, `CatalogSearchResponse`,
`CatalogErrorCode` are all already provider-shaped or provider-agnostic
(confirmed by §1's own inspection: `CatalogCandidate.provider` already
exists as a field, just constrained by the old narrower type).

### 2.7 Shared field-limit extraction (small, mechanical refactor)

`RELEASE_FIELD_LIMITS`/`RELEASE_YEAR_MIN`/`RELEASE_YEAR_MAX` currently live
as private constants inside `musicbrainz.ts`. This plan extracts them to a
new, tiny, dependency-free `src/lib/catalog/catalogFieldLimits.ts` module
(pure constants only, no logic), imported by both `musicbrainz.ts`
(unchanged behavior — confirmed by its existing, unmodified tests
continuing to pass) and the new `discogs.ts`. This is the **only** shared
provider-adapter-internal file introduced beyond the two Discogs-specific
modules — deliberately not a "provider framework," just deduplicating four
already-duplicated-in-spirit numeric constants so Discogs and MusicBrainz
can't silently drift on field-length bounds.

## 3. Search / Add API contract — exact shapes

### 3.1 `GET /api/catalog/search` — `provider` parameter

`parseCatalogSearchRequest` (`catalog-handlers.mts`) gains a `provider`
query parameter, parsed by a new `parseProvider(value: string | null):
CatalogProvider`:

- omitted → `'musicbrainz'` (every existing client request is
  byte-for-byte unaffected — no client sends this parameter today, so the
  default preserves 100% backward compatibility);
- `'musicbrainz'` or `'discogs'` → accepted;
- anything else → `invalid_query` (400), never silently coerced (mirrors
  the existing `parseMode`'s own omitted-vs-invalid distinction, spec 0017
  §8.1's precedent).

When `provider === 'discogs'`:

- `mode`, `offset`, and `releaseId` are **rejected if present**
  (`invalid_query`) — mirroring the existing `releaseId`-mutual-exclusivity
  check's own shape (§1's `parseCatalogSearchRequest`), since none of those
  MusicBrainz-specific concepts apply to the bounded, unpaginated,
  single-mode Discogs search;
- `limit` is **rejected if present** — v1 Discogs search has one fixed
  internal page size (§2.5), not a client-tunable one;
- `q` is required, same `SEARCH_QUERY_MIN_LENGTH`/`MAX_LENGTH` bounds
  (2–120 chars) already enforced for MusicBrainz — reused, not
  reimplemented;
- the handler calls `dependencies.paceDiscogsRequest()` (§13, its own
  independent pacer — never `paceMusicBrainzRequest`), then
  `dependencies.searchDiscogsReleases({ query, token, userAgent })`, and
  returns `{ candidates, offset: 0, hasMore: false }` — the exact same
  `CatalogSearchResponse` shape a MusicBrainz search returns, so
  `DiscoverPanel`'s existing candidate-rendering/ownership/duplicate-copy
  code needs **zero new branches** to render a Discogs result (spec 0018
  §18's own reasoning, confirmed implementable).

When `provider` is omitted or `'musicbrainz'`: **byte-identical existing
behavior**, confirmed by every existing `catalog-functions.test.ts` case
continuing to pass unmodified.

### 3.2 `POST /api/catalog/add` — `provider` value and Discogs branch

`parseAddRequest` widens its provider check from `payload.provider !==
'musicbrainz'` to `!isCatalogProvider(payload.provider)` (a small new
guard against the widened union), and its `providerReleaseId` validation
branches by provider: `MUSICBRAINZ_RELEASE_ID_PATTERN` for
`'musicbrainz'`, `DISCOGS_RELEASE_ID_PATTERN` for `'discogs'` — **never**
the wrong pattern for the wrong provider (spec 0018 §15, confirmed as a
hard requirement, not a suggestion).

`handleCatalogAdd` branches its lookup/enrichment call by `provider`:

- `'musicbrainz'`: **byte-identical existing code path** (exact lookup →
  optional release-group genre enrichment → upsert → create collection
  item).
- `'discogs'`: paced via `paceDiscogsRequest()` → `lookupDiscogsRelease()`
  (§2.2 — this call itself enforces the Vinyl-only gate via
  `normalizeDiscogsRelease`, §2.4, so a non-Vinyl release throws `not_found`
  here rather than being silently added) → **no genre-enrichment call**
  (Discogs's Release response already includes `genres` directly, §2.3 —
  no second request needed, unlike MusicBrainz's separate release-group
  genre lookup) → `upsertCatalogRelease` (unchanged function, already
  provider-parametric per §1's finding) with `provider_fetched_at` set to
  `new Date().toISOString()` at the moment of this successful lookup → the
  existing, unchanged `createCatalogCollectionItem`.

### 3.3 `catalogReleasePayload` gains `provider_fetched_at`

```ts
// catalog-handlers.mts, extended
function catalogReleasePayload(
  candidate: CatalogCandidate,
  genres: string[],
  providerFetchedAt: string | null,   // NEW param, null for MusicBrainz
) {
  const payload = {
    // ...existing fields, unchanged...
    provider_fetched_at: providerFetchedAt,
  }
  // ...unchanged genre-omission logic...
}
```

`handleCatalogAdd`'s MusicBrainz branch passes `providerFetchedAt: null`
(explicit, not omitted — an `upsert` must not leave a stale
`provider_fetched_at` on a row if it were ever somehow set, though for
MusicBrainz it never is) — confirmed this does not change any existing
MusicBrainz test's expected payload shape beyond the one new key, which
every existing test's payload-shape assertion will need updating for (a
mechanical, not behavioral, test update, §17).

## 4. Six-hour freshness — the resolved implementation

Per spec 0018 §12/§25 Q2, the plan below is the smallest centralized
mechanism, distinguished as required (spec 0018 §26/task §12) from the
explicitly out-of-scope user-facing "paste a Discogs URL" feature: this
mechanism has **no free-text/URL input at all** — it only ever operates on
a `providerReleaseId` the server already has from an existing, owned
`releases` row. It is pure internal revalidation plumbing, never exposed as
a search/import action.

### 4.1 A new internal request shape on the *existing* `/api/catalog/add` Function

`parseAddRequest`'s existing strict shape check (`keys.length !== 2 ||
!keys.includes('provider') || !keys.includes('providerReleaseId')`) is
extended to recognize a **second, distinct** request shape on the same
endpoint:

```ts
// New, internal-only request shape - never surfaced as a user-facing
// "search/add" action; the client only ever sends this for a
// providerReleaseId it already owns (verified server-side, below).
{ action: 'refresh', provider: 'discogs', providerReleaseId: string }
```

distinguished from the existing add shape by the presence of the `action`
key (the existing shape has exactly the two keys `provider` +
`providerReleaseId`, no `action` — so the two shapes never collide, and
every existing client request, which never sends `action`, is completely
unaffected). `action: 'refresh'` is **only** valid for `provider:
'discogs'` (MusicBrainz has no freshness contract, §1) — any other
combination is `invalid_query`.

**Why extend `/api/catalog/add` rather than `/api/catalog/search`:** the
search Function's existing `releaseId`-only exact-lookup branch (§1) *is*
the MusicBrainz-specific "paste an exact URL" user feature's server side —
explicitly not extended to Discogs (spec 0018 §3). Reusing that same
branch's shape for an unrelated internal Discogs operation would blur
exactly the distinction the task requires keeping clear. `/api/catalog/add`
has no such pre-existing "exact lookup as a feature" meaning to collide
with — its only existing meaning is "persist a confirmed candidate," which
"revalidate an already-persisted candidate" is a natural, narrow sibling
of, not a repurposing.

`handleCatalogRefresh` (a new function in `catalog-handlers.mts`, called
from `handleCatalogAdd`'s existing entrypoint when `action === 'refresh'`
is detected — the thin `netlify/functions/catalog-add.mts` entrypoint file
itself is **unchanged**, still just `handleCatalogAdd(request)`):

1. authenticate the Supabase user (existing `authenticateRequest`,
   unchanged);
2. validate `providerReleaseId` against `DISCOGS_RELEASE_ID_PATTERN`;
3. **verify the authenticated user actually owns a collection item
   referencing a `releases` row with `provider = 'discogs' AND
   provider_release_id = <id>`** — a single `select` scoped by the
   verified user's own RLS-authoritative `collection_items` (via the
   existing publishable-key/user-token client, not service-role) — if no
   such owned row exists, reject with `not_found`. **This is the guard
   that keeps this operation "revalidate something I already own," never
   "look up any Discogs release on demand"** — it cannot be used as an
   unauthenticated or ownership-free Discogs proxy;
4. paced `lookupDiscogsRelease()` (§2.2) — identical Vinyl-gate/error-
   mapping as the add path;
5. `upsertCatalogRelease` with the refreshed metadata and a new
   `provider_fetched_at` (the **same** upsert function §3.2 already uses —
   no second persistence code path);
6. **no** `createCatalogCollectionItem` call — this operation never creates
   a new collection item, only refreshes the shared `releases` row an
   existing item already points to;
7. return the refreshed `CatalogCandidate` (same normalized shape) so the
   caller can update its own in-memory view without a second round trip.

### 4.2 Freshness helper — shared by client and server call sites

A small, pure, dependency-free helper,
`src/lib/catalog/discogsFreshness.ts`:

```ts
export const DISCOGS_FRESHNESS_WINDOW_MS = 6 * 60 * 60 * 1000   // 6 hours

export function isDiscogsRowFresh(
  provider: string | null,
  providerFetchedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (provider !== 'discogs') return true   // non-Discogs rows are never
                                              // subject to this check
  if (!providerFetchedAt) return false       // NULL is defensively stale,
                                              // never fresh (spec S12)
  const fetchedAtMs = Date.parse(providerFetchedAt)
  if (!Number.isFinite(fetchedAtMs)) return false
  return now - fetchedAtMs < DISCOGS_FRESHNESS_WINDOW_MS
}
```

Imported by **both** `loadOwnedCollection` (server, §4.4) and
`CollectionDataProvider` (client, §4.3) — this is the one shared
implementation the spec's own §12 language anticipates, and the only
"shared provider/freshness helper" this plan introduces (task §6's own
guidance: use the smallest abstraction, not a framework).

### 4.3 Client-side: `CollectionDataProvider` freshness pass

After `loadCollection(client)` resolves with `items`, `CollectionDataProvider`
runs one additional, bounded step **before** calling `setItems`:

1. Partition `items` into fresh/non-Discogs items (pass through unchanged)
   and stale-Discogs items (`provider === 'discogs' &&
   !isDiscogsRowFresh(...)`).
2. If there are zero stale-Discogs items (the overwhelmingly common case —
   most users own zero or very few Discogs-backed records), skip straight
   to `setItems(items)` — **no extra network activity for a collection with
   no Discogs records or only fresh ones.**
3. Otherwise, for each stale item (bounded — a personal collection's
   Discogs-sourced subset is realistically small, and there is no
   pagination/unbounded-fan-out risk since this is the user's own already-
   loaded collection, not a search result), call a new client helper
   `refreshDiscogsCollectionItem(client, providerReleaseId)` — a thin
   wrapper posting the §4.1 `{ action: 'refresh', ... }` shape to the
   existing `/api/catalog/add` endpoint via the existing `requestCatalog`
   plumbing (`client.ts`) — **in parallel** (`Promise.allSettled`, not
   sequential — these are independent, already-owned releases, not a rate-
   limited search burst against a shared budget in the same sense §13
   governs a live user-triggered search).
4. For each settled refresh: on success, replace that item's `release`
   fields in the array with the refreshed candidate's normalized values
   (re-shaped into the `CollectionItemWithRelease['release']` shape) and a
   fresh `provider_fetched_at`; on failure, **mark that specific item**
   with a new, additive, optional field on the in-memory (not
   database-persisted-by-the-client) item shape:
   `discogsUnavailable: true` — the item **remains in the array** (so the
   rest of the app doesn't lose track of the collection item entirely —
   the user still owns it), but its provider-derived display fields are
   treated as unavailable by consumers (§4.5).
5. Call `setItems` once, with the fully-reconciled array, then proceed to
   `setStatus('ready')` exactly as today — **`status` is not delayed
   waiting for Discogs refreshes to know a collection genuinely has zero
   items or the load itself failed**; refreshing happens as a fast-follow
   pass over an already-successfully-loaded collection, not a precondition
   for the collection being considered loaded. (This preserves Milestone
   8's own "a failure of one thing never blanks something else" principle,
   §13/existing file comment, extended one step further.)

**No polling.** This pass runs exactly once per `loadCollection` resolution
(i.e., once per mount and once per explicit `reload()`/`invalidate()`) —
never on an interval, matching spec 0018 §17's "no background polling"
requirement exactly.

### 4.4 Server-side: `loadOwnedCollection` freshness pass

`loadOwnedCollection`'s existing `select` (`curator-handlers.mts:352`)
gains `provider, provider_release_id, provider_fetched_at` to its release
sub-select. `normalizeCollectionRow` (and its `CuratorCollectionRow`/
`CuratorCollectionItem` types) does **not** gain these as new *output*
fields — `CuratorCollectionItem`'s shape sent onward to intent-matching/
candidate-selection/prompt construction is **completely unchanged** (no
model/prompt/schema change, per the global constraints).

Instead, `loadOwnedCollection` itself, after the initial Supabase read and
before returning `items`, applies exactly the same partition-and-refresh
logic as §4.3, but server-side and synchronous with the request (VIN's own
existing per-request latency budget already tolerates one extra bounded
provider call — mirroring how `handleCatalogAdd` already makes up to two
sequential MusicBrainz calls today, §1):

1. Partition into fresh-or-non-Discogs (pass through) and stale-Discogs.
2. For each stale item (again bounded — the same realistically-small
   Discogs subset of one user's own collection), attempt
   `lookupDiscogsRelease()` **directly, in-process** (no HTTP round-trip
   to another Function — `curator-handlers.mts` imports `discogs.ts`
   exactly as `catalog-handlers.mts` does; both are ordinary TypeScript
   modules, not separate processes), paced via the **same** independent
   Discogs pacer as the catalog Functions (§13 — pacing is a shared
   in-process singleton across every Discogs call site in the whole
   Netlify Functions bundle, exactly mirroring how
   `nextMusicBrainzRequestAt` is already a single module-scoped clock
   MusicBrainz calls from *any* handler share today).
3. On success: best-effort `upsertCatalogRelease` with the refreshed data
   (so the client-side view benefits from this revalidation too on its
   next load — a nice-to-have consistency benefit, not a correctness
   requirement) and use the refreshed `artist`/`title`/`release_year`/
   `genres` for that item's `CuratorCollectionItem` facts.
4. On failure (or if the item was stale and revalidation could not be
   attempted, though the code above always attempts it): **that item is
   filtered out of `items` entirely for this request** —
   `normalizeCollectionRow` is not called for it, and it is not present in
   VIN's candidate pool for this one request. This is the smallest correct
   choice: `CuratorCollectionItem`'s `artist`/`title`/`release_year`/
   `genres` fields are all required (non-optional) — there is no
   "half-present" shape to send instead, and silently sending stale values
   is exactly what spec 0018 §12 forbids. The user's other owned records
   are completely unaffected; only the specific unrevalidatable Discogs
   record is excluded from *this one curator request's* candidate pool
   (not deleted, not marked unowned in the database — purely a per-request
   candidate-set exclusion).
5. This exclusion is silent to the curator model (no prompt/schema
   change) — VIN simply has one fewer candidate to choose from for that
   request, exactly as if the user's collection were smaller by one item
   for that request. No error surfaces to the VIN chat UI because of this
   — a stale-and-unrevalidatable Discogs record is not a VIN failure, it
   is a normal, bounded, silent candidate-pool adjustment.

### 4.5 UI treatment of a `discogsUnavailable` item

Per task §13's requirement to inspect actual rendering paths rather than
prescribe a generic "show an error": every consumer of
`CollectionItemWithRelease` that displays provider-derived text fields
checks the new optional `discogsUnavailable` flag (§4.3) and, when `true`,
renders a small, localized, honest substitution **in place of the
provider-derived fields only** — never a full-page error, never removing
the item from any list:

- **`CollectionItemCard.tsx`** (`metadataLine`): when
  `discogsUnavailable`, the metadata line reads "Catalog details
  unavailable — Retry" instead of year/label/catalog-number/country/format;
  "Retry" is a small inline button calling the same
  `refreshDiscogsCollectionItem` helper (§4.3) for just this one item,
  then re-running the partition pass for just this item on success —
  a **user-triggered, bounded, single-item retry**, never automatic.
- **`AlbumDetailPage.tsx`**: the metadata `<dl>` block (spec 0017's
  existing shape) shows "Catalog details temporarily unavailable" in place
  of the year/label/catalog-number/country/format `<dt>`/`<dd>` pairs, plus
  the same inline Retry action; the "View on Discogs" provenance link
  (§7) still renders if `provider_release_id` itself is present and valid
  — the *link* is always safe to show (it's just a URL derived from an ID
  the app already has), only the *provider-fetched metadata text* is
  gated.
- **`DashboardPage.tsx`**'s `AlbumMini`/insights: artwork still renders via
  the branded fallback (§12; a Discogs item never uses CAA regardless of
  freshness); the title/artist text shown in `AlbumMini` is **not** gated
  by freshness (title/artist are the two fields least likely to
  meaningfully change and are already known from the original add-time
  confirmation) — only year/label/catalog/country/format-level "current
  provider facts" are subject to the freshness gate, matching spec 0018
  §12's own "provider-derived metadata" framing, which the plan interprets
  as the fields §10's mapping table populates from a live Discogs
  response, not the identity/title pair the user already confirmed.
  Dashboard's genre-based insights (`src/lib/dashboard/insights.ts`)
  silently use whatever `genres` value is currently in memory — a stale
  genre tag in an aggregate stat is a materially lower-stakes concern than
  displaying stale year/label facts as if newly verified, and gating every
  insight computation on a live provider check is exactly the
  disproportionate broad rewrite task §12/§21 warns against building; not
  planned.
- **`CuratorRecommendationCard.tsx`**: cannot recommend an item VIN's own
  server-side pass (§4.4) already excluded for staleness — so this
  component never needs its own gating logic for *whether* to recommend;
  it only needs the same artwork provider-gating as every other caller
  (§12), which is unrelated to freshness.
- **The application does not crash, block, or show a full-page error**
  because one Discogs record is stale/unavailable — every existing
  MusicBrainz/manual item in the same collection view renders exactly as
  it does today, unaffected, satisfying task §13's explicit requirement.

## 5. Attribution — enumerated surfaces (spec 0018 §13)

A single small, reusable component, `src/catalog/DiscogsAttribution.tsx`:

```tsx
export function DiscogsAttribution({ releaseUrl }: { releaseUrl: string }) {
  return (
    <p className="vi-discogs-attribution">
      Data provided by{' '}
      <a href={releaseUrl} target="_blank" rel="noreferrer">
        Discogs
      </a>
      .
    </p>
  )
}
```

(`rel="noreferrer"` matches the existing external-link idiom already used
for every MusicBrainz outbound link in this app, spec 0017 §19 — it does
**not** include `nofollow`, which the Terms prohibit, spec 0018 §13.)

Rendered, per direct inspection of every actual `CollectionItemWithRelease`/
`CatalogCandidate` consumer (task §15's own instruction — enumerated below,
not assumed):

| Surface | File | Attribution required? | Placement |
| --- | --- | --- | --- |
| Discogs search candidate card | new Discogs fallback panel (§6) | **Yes** | Inside each candidate's card, below its metadata line — reusing the same `renderCandidate`-equivalent extraction pattern spec 0017 already established for Discover. |
| Add confirmation | existing confirm dialog (shared, unchanged component) | **Yes** | The dialog already shows the candidate's own card content (existing pattern) — the attribution already present on that card is visible in the dialog; no separate dialog-specific copy needed. |
| Album Detail (Discogs-backed owned record) | `AlbumDetailPage.tsx` | **Yes** | Directly beside the new "View on Discogs" provenance row (§7), mirroring where "View on MusicBrainz" sits today. |
| Collection grid/list card | `CollectionItemCard.tsx` | **No** — confirmed by inspection: the card shows only `metadataLine` (year/label/catno/country/format) and title/artist, with no dedicated space for a second line of legal text without a layout change task §17/§18 explicitly says to avoid; the Terms require attribution "directly adjacent to... data... displayed" — Record Detail (the page whose entire purpose is presenting that data in full) is the surface this plan treats as satisfying the requirement, with the compact card treated as a preview/navigation surface pointing to Record Detail, not a first presentation of the data in its own right. **This interpretation is recorded here explicitly as a plan-level product decision** (task §15's own instruction to decide and record, not merely enumerate) — if the human disagrees at review time, adding a compact attribution mark to the card is a small, isolated follow-up, not a re-architecture. |
| Dashboard `AlbumMini` | `DashboardPage.tsx` | **No**, same reasoning as the Collection card — a small thumbnail+title tile with no room for legal text, linking through to Record Detail. |
| VIN recommendation card | `CuratorRecommendationCard.tsx` | **Yes** — this card presents album metadata as the primary subject of user attention (not a passing thumbnail), including a "View record" link into Album Detail; attribution renders in the same place the card already has room for supplementary text, matching the card's existing information density. |
| History | inspected: listening-history rows show only title/artist/timestamp (`src/history`-equivalent components), no provider-derived catalog fields (label/catalog-number/country/format/genre) | **No** — confirmed no Discogs-sourced *data* is presented there beyond the title/artist pair every other surface already covers. |

App-level, one-time notice — *"This application uses Discogs' API but is
not affiliated with, sponsored or endorsed by Discogs. 'Discogs' is a
trademark of Zink Media, LLC."* — placed in the existing Settings/Profile
page (`src/pages/SettingsPage.tsx`, confirmed to exist and to already host
other one-time informational copy in this app), in a small new "Data
Sources" or equivalent section — **not** a new route (task §15's own
explicit preference), and not the app footer (this app has no persistent
global footer today, confirmed by inspection — inventing one would be a
UI-shape change outside this plan's scope).

## 6. Discogs fallback UI

Extends `DiscoverPanel.tsx` with one new, clearly-separate affordance
immediately adjacent to the existing "Can't find it? Add it manually" line
(`DiscoverPanel.tsx:710`, confirmed location) — per spec 0018 §25 Q1, this
plan resolves that open question in favor of this placement (adjacent, not
a separate page/route): "Can't find it? **Search Discogs**" — a new
button that reveals a small, self-contained sub-panel with its own free-
text input, its own "Find on Discogs" submit action, and its own bounded
result list (reusing the exact same candidate-card rendering
(`renderCandidate`-equivalent) DiscoverPanel already extracted for spec
0017, extended with the Discogs attribution line, §5).

This sub-panel is **entirely separate React state** from the existing
MusicBrainz search state (mirroring exactly how spec 0017's own exact-URL-
lookup state (`exactUrlInput`/`exactUrlPhase`/etc., §1) is already fully
independent from the main search state in this same file) — never
interleaved, never auto-triggered by a MusicBrainz search completing or
failing (spec 0018 §6's "no automatic fallback" requirement, enforced by
construction: nothing in the new sub-panel's state is ever set except by
its own explicit user action).

Discogs results render with a visible **"Discogs"** label distinct from the
existing MusicBrainz candidate styling (a small badge/text, not a redesign)
— satisfying spec 0018 §18's "clearly labeled, never implying dedup"
requirement.

## 7. Artwork and provenance — every confirmed caller

Per §1's finding (four callers, not three), each is updated identically:
the `releaseMbid`/`releaseGroupMbid` props are only ever populated when the
release's `provider === 'musicbrainz'` (or, for `DiscoverPanel`'s Discogs
sub-panel, never at all — a Discogs `CatalogCandidate` simply never has
values that would map to those props in the first place, since
`normalizeDiscogsRelease` never populates anything CAA-shaped).

- `src/catalog/DiscoverPanel.tsx` — the **existing** `renderCandidate`
  continues to gate on `provider === 'musicbrainz'`explicitly (a one-line
  change: `releaseMbid={c.provider === 'musicbrainz' ? c.providerReleaseId : null}`,
  same for the release-group id) rather than relying on `isMbid()`'s regex
  guard to fail safely by accident (spec 0018 §14's explicit requirement).
  The new Discogs sub-panel's own candidate rendering never passes these
  props at all.
- `src/pages/AlbumDetailPage.tsx` — same explicit gate, plus (§7 below) a
  new provider-aware provenance block replacing the unconditional
  MusicBrainz-only one.
- `src/pages/DashboardPage.tsx`'s `AlbumMini` — same explicit gate.
- `src/curator/CuratorRecommendationCard.tsx` — same explicit gate.
- `src/catalog/ScanPanel.tsx` — **no change** (§1: structurally
  MusicBrainz-only, confirmed).
- `src/media/AlbumArtwork.tsx` / `src/media/coverArtUrl.ts` — **no change**
  (already safe by construction, §1) — this plan makes every caller
  explicit rather than relying on that safety net, but does not touch the
  component itself.

`AlbumDetailPage.tsx`'s provenance block becomes:

```ts
const catalogLink =
  !editable && release.provider === 'musicbrainz' && release.provider_release_id
    ? { label: 'View on MusicBrainz', url: musicBrainzReleaseUrl(release.provider_release_id) }
    : !editable && release.provider === 'discogs' && release.provider_release_id
      ? { label: 'View on Discogs', url: discogsReleaseUrl(release.provider_release_id) }
      : null
```

with the surrounding `<dt>MusicBrainz</dt>`/`"Catalog details come from
MusicBrainz"` copy similarly branching on `release.provider` (a Discogs
row shows `<dt>Discogs</dt>`/"Catalog details come from Discogs"). This
requires `release.provider` to actually be loaded (§8).

## 8. Ownership, duplicates, and `provider` propagation

`isExactCatalogReleaseOwned` (`ownedRelease.ts`) changes signature:

```ts
// Before
export function isExactCatalogReleaseOwned(
  providerReleaseId: string,
  ownedItems: readonly CollectionItemWithRelease[],
): boolean

// After
export function isExactCatalogReleaseOwned(
  provider: CatalogProvider,
  providerReleaseId: string,
  ownedItems: readonly CollectionItemWithRelease[],
): boolean {
  return ownedItems.some(
    (item) =>
      item.release.provider === provider
      && item.release.provider_release_id === providerReleaseId,
  )
}
```

Every existing call site (`DiscoverPanel.tsx`, `ScanPanel.tsx`) is updated
to pass `c.provider` as the new first argument — a mechanical signature
change, not a behavior change for any existing MusicBrainz call site
(since `provider` is always `'musicbrainz'` there already, the added
comparison is always true for those calls, so results are identical).

**`provider` must be loaded into `CollectionItemWithRelease['release']`**
(`src/lib/supabase/collection.ts`): `loadCollection`'s Supabase `select`
gains `provider` alongside its existing `provider_release_id`,
`provider_release_group_id`, `source`; the TypeScript type gains
`provider?: CatalogProvider | null` (optional, matching the existing
optionality of the sibling provider-identity fields, so pre-existing test
fixtures that don't set it remain valid — mirroring exactly how
`provider_release_id ?? null` is already handled everywhere it's
consumed).

Cross-provider duplicates remain **explicitly unsolved** (spec 0018 §7) —
no fuzzy matching is added; `isExactCatalogReleaseOwned`'s new
provider-qualified comparison makes this explicit rather than accidental
(a MusicBrainz UUID and a Discogs numeric string were already
non-colliding by construction; the new signature makes the *intent*
explicit for a future reader, not just the *outcome*).

## 9. Metadata trust boundary (spec 0018 §9) — confirmed satisfied by design

No browser-supplied artist/title/year/etc. is ever accepted as
authoritative: the add path (§3.2) and the refresh path (§4.1) both only
ever accept `provider` + `providerReleaseId` from the browser, and both
perform a fresh server-side `lookupDiscogsRelease()` call before any
persistence — identical in spirit to the existing MusicBrainz add path.
Nothing in this plan introduces a code path where browser-supplied
metadata reaches `upsertCatalogRelease`.

## 10. Database migration (described here; created and applied only during PR B, per §0's constraints — **not created by this planning PR**)

One new forward-only migration,
`supabase/migrations/<timestamp>_add_discogs_catalog_provider.sql`:

```sql
-- Widen the catalog-identity constraint to accept the approved secondary
-- provider (spec 0018 / ADR 0008). Existing MusicBrainz and manual rows are
-- unaffected; no backfill.
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
      and provider = any (array['musicbrainz', 'discogs'])
      and provider_release_id is not null
    )
  );

-- Freshness marker (spec 0018 S12). Nullable at the column level - existing
-- MusicBrainz/manual rows carry NULL and are never subject to the freshness
-- check (application-level guard, discogsFreshness.ts). A Discogs-provider
-- row is required, by a separate provider-qualified constraint below, to
-- always carry a non-null value.
alter table public.releases
  add column provider_fetched_at timestamptz;

alter table public.releases
  add constraint releases_discogs_requires_fetched_at
  check (
    provider is distinct from 'discogs'
    or provider_fetched_at is not null
  );
```

This satisfies every §11/§20 requirement: `unique (provider,
provider_release_id)` is untouched (not dropped, not recreated); every
existing MusicBrainz row already has `provider = 'musicbrainz'`, which the
widened `IN`-style check still accepts, and `provider_fetched_at` defaults
to `NULL` for it (column addition with no default, applied to existing
rows, is always `NULL` — no backfill statement needed or written); every
manual row is untouched by both constraint branches; `provider_release_group_id`
remains nullable (unchanged); no RLS policy is touched; no grant is
touched — `provider_fetched_at` needs the **same** grants `provider`/
`provider_release_id` already have today (service-role
insert/update via the existing table-level grant from migration
`20260829120000`; no authenticated/anon write grant, confirmed not needed
since the browser never writes this column directly).

**pgTAP additions** to `supabase/tests/database/catalog_releases_rls.test.sql`:

- a Discogs-provider fixture row (`provider = 'discogs'`, a realistic
  numeric `provider_release_id`, a non-null `provider_fetched_at`) inserts
  successfully;
- the composite unique constraint still rejects a duplicate
  `(discogs, <same id>)` pair;
- a Discogs-provider row with `provider_fetched_at = NULL` is **rejected**
  by `releases_discogs_requires_fetched_at`;
- a MusicBrainz-provider row with `provider_fetched_at = NULL` is
  **accepted** (the constraint is provider-qualified, not universal);
- an invalid provider value (neither `musicbrainz` nor `discogs`) for a
  `source = 'catalog'` row is still rejected;
- existing manual-row and existing-provider-value assertions in the file
  continue to pass unmodified (regression).

No RLS-grant pgTAP file needs a new test — `service_role_catalog_privileges.test.sql`
already asserts table-level (not column-level) grants, which are unaffected
by adding one nullable column.

## 11. Secret / environment plan

- `.env.example` gains one new line, alongside the existing
  `MUSICBRAINZ_USER_AGENT`:
  ```
  DISCOGS_TOKEN=
  ```
  with a one-line comment matching the file's existing style (`# Server-only
  Discogs configuration (spec 0018). Do not expose in browser code.`).
- `DISCOGS_TOKEN` is read server-side only, via the same `requiredEnv(env,
  'DISCOGS_TOKEN')` pattern already used for `MUSICBRAINZ_USER_AGENT`/
  `SUPABASE_SERVICE_ROLE_KEY` — never a `VITE_`-prefixed name, never
  imported by any file under `src/` (only `netlify/functions/**`).
- **No token value is ever logged, echoed in an error message, included in
  a generated URL, or present in any test fixture** — automated tests use a
  literal placeholder string (e.g. `'test-discogs-token'`) exactly as
  existing MusicBrainz tests already use a placeholder `userAgent`.
- **Production provisioning is the human's responsibility**, through the
  project's already-established Netlify environment-variable workflow
  (the same mechanism already used for `MUSICBRAINZ_USER_AGENT`,
  `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — this plan does not
  inspect, request, print, or infer the human's actual token value at any
  point, matching the task's explicit instruction and the earlier spec/ADR
  planning's own discipline.
- Deploy-order placement: §20 step 4, **before** the migration is applied
  and before deploy, so the newly-deployed runtime never starts without
  its required secret present.

## 12. Rate limit / resilience — Discogs pacer

A new, independent module-scoped pacer in `discogs.ts`, structurally
identical to `paceMusicBrainzRequest` but **not the same clock**:

```ts
const DISCOGS_PACING_MS = 1_000   // conservative: Phase-0 observed a
                                    // 60/minute authenticated limit (a
                                    // single observation, not a permanent
                                    // guarantee, spec 0018 S5.3) - pacing
                                    // to 1/second stays comfortably under
                                    // that even if the true limit is
                                    // materially lower, and keeps this
                                    // pacer's shape identical to
                                    // MusicBrainz's for review simplicity
let nextDiscogsRequestAt = 0

async function paceDiscogsRequest(): Promise<void> { /* identical shape to
  paceMusicBrainzRequest, own clock variable */ }
```

**Explicit decision: no automatic retry on a Discogs 429/503.** Unlike
MusicBrainz's existing single bounded rate-limit retry (reserved for the
add-time exact lookup only), this plan does **not** add an equivalent
Discogs retry — Discogs's observed 60/minute limit is generous relative to
this feature's low expected call volume (one search, one add-lookup, and a
small number of freshness revalidations per collection load), and adding a
second, provider-specific retry policy this early adds review surface
without a demonstrated need. A 429/503 from Discogs maps to the existing
`provider_rate_limited` category and surfaces as the existing, honest
"MusicBrainz is rate limiting or temporarily unavailable"-style message
(text adjusted to name Discogs), with **user-triggered retry only**
(re-clicking "Find on Discogs", or the §4.5 per-item Retry button) — never
an automatic background retry. This satisfies task §18's "no unbounded
retry... explicit decision" requirement by explicitly choosing zero
automatic retries, not by omission.

Timeout: `DEFAULT_TIMEOUT_MS = 8_000`, identical to MusicBrainz's existing
value (no evidence Discogs needs a different one; reusing the same
constant name pattern, defined once in `discogs.ts`, keeps the two
adapters' defensive postures visibly aligned during review).

## 13. Exact likely files affected

**New:**

- `src/lib/catalog/discogsIdentity.ts` — ID pattern, `discogsReleaseUrl`.
- `src/lib/catalog/discogsIdentity.test.ts`.
- `src/lib/catalog/discogs.ts` — search/lookup adapter, pacer, error
  mapping, normalization.
- `src/lib/catalog/discogs.test.ts`.
- `src/lib/catalog/discogsFreshness.ts` — `isDiscogsRowFresh`.
- `src/lib/catalog/discogsFreshness.test.ts`.
- `src/lib/catalog/catalogFieldLimits.ts` — extracted shared constants
  (§2.7).
- `src/catalog/DiscogsAttribution.tsx` — shared attribution component
  (§5).
- `src/catalog/DiscogsSearchPanel.tsx` — the new fallback sub-panel (§6),
  mounted from within `DiscoverPanel.tsx`.
- `src/catalog/DiscogsSearchPanel.test.tsx`.
- `supabase/migrations/<timestamp>_add_discogs_catalog_provider.sql`
  (described here, **created during PR B only**).

**Modified:**

- `src/lib/catalog/types.ts` — `CatalogProvider` widened.
- `src/lib/catalog/client.ts` — new `refreshDiscogsCollectionItem` wrapper
  posting the `{ action: 'refresh', ... }` shape; existing
  `addCatalogReleaseToCollection` unchanged (already provider-parametric
  per §1).
- `src/lib/catalog/client.test.ts`.
- `src/lib/catalog/musicbrainz.ts` — imports field limits from
  `catalogFieldLimits.ts` instead of defining them locally (no behavior
  change; existing tests must continue passing unmodified as the
  regression proof).
- `src/lib/catalog/ownedRelease.ts` — provider-qualified signature (§8).
- `src/lib/catalog/ownedRelease.test.ts`.
- `src/lib/supabase/collection.ts` — `provider` loaded/typed (§8).
- `src/lib/supabase/collection.test.ts`.
- `src/app/CollectionDataProvider.tsx` — freshness pass (§4.3).
- `src/app/CollectionDataProvider.test.tsx`.
- `src/app/collection-data-integration.test.tsx` — extended if this file's
  existing scope covers cross-component freshness behavior; confirmed at
  implementation time.
- `netlify/functions/_shared/catalog-handlers.mts` — `provider` search
  param, widened add validation, Discogs add branch, new
  `handleCatalogRefresh` (§3, §4.1), `catalogReleasePayload` gains
  `provider_fetched_at`.
- `netlify/tests/catalog-functions.test.ts` — extended for all of the
  above; existing MusicBrainz-path assertions updated only for the new
  `provider_fetched_at: null` payload key (mechanical), otherwise
  unmodified.
- `netlify/functions/_shared/curator-handlers.mts` — `loadOwnedCollection`
  freshness pass (§4.4).
- relevant curator handler test file (confirmed exact filename at
  implementation time — the existing curator test suite covering
  `loadOwnedCollection`/candidate construction) — extended for the
  freshness-exclusion behavior, with zero real model/provider calls.
- `src/pages/AlbumDetailPage.tsx` — provider-aware provenance block (§7),
  provider-gated artwork props, `discogsUnavailable` degraded state (§4.5).
- `src/pages/AlbumDetailPage.test.tsx`.
- `src/pages/DashboardPage.tsx` — provider-gated artwork props (§7).
- `src/pages/DashboardPage.test.tsx` (confirmed exists at plan time —
  extended if it asserts artwork-prop wiring; otherwise unchanged).
- `src/collection/CollectionItemCard.tsx` — `discogsUnavailable` degraded
  metadata line + Retry (§4.5).
- `src/collection/CollectionItemCard.test.tsx` (confirmed exists; check at
  implementation time for the exact current filename/coverage).
- `src/curator/CuratorRecommendationCard.tsx` — provider-gated artwork
  props (§7).
- `src/curator/CuratorRecommendationCard.test.tsx` (or the nearest existing
  test file covering this component — confirmed at implementation time).
- `src/catalog/DiscoverPanel.tsx` — mounts the new "Can't find it? Search
  Discogs" entry point (§6); provider-gated artwork props (§7);
  `isExactCatalogReleaseOwned` call site updated (§8).
- `src/catalog/DiscoverPanel.test.tsx` — new Discogs-entry-point
  assertions.
- `src/pages/SettingsPage.tsx` — one-time app-level Discogs notice (§5).
- `src/pages/SettingsPage.test.tsx`.
- `supabase/tests/database/catalog_releases_rls.test.sql` — Discogs
  fixture + constraint assertions (§10).
- `.env.example` — `DISCOGS_TOKEN` line (§11).

**Explicitly not modified** (confirmed no change needed): `src/media/AlbumArtwork.tsx`,
`src/media/coverArtUrl.ts`, `src/catalog/ScanPanel.tsx`,
`netlify/functions/catalog-search.mts`, `netlify/functions/catalog-add.mts`
(both thin entrypoints stay byte-identical — all new logic lives in the
already-shared `_shared/catalog-handlers.mts`), `netlify.toml`,
`package.json`, any curator prompt/schema file, any VIN model-config file.

## 14. Implementation order

1. `catalogFieldLimits.ts` extraction; confirm `musicbrainz.test.ts` passes
   unmodified (proves zero behavior drift from the refactor alone).
2. `discogsIdentity.ts` + its own unit tests, fully in isolation.
3. `discogs.ts` (adapter, normalization, Vinyl gate, pacer) + its own unit
   tests, including the full malformed-response and label/catno-sentinel
   matrix (§2.3's `HSV005` fixture). No other file imports it yet.
4. `discogsFreshness.ts` + its own unit tests (pure function, trivial to
   test exhaustively: fresh, stale, null, non-Discogs, malformed
   timestamp).
5. `types.ts`: widen `CatalogProvider`.
6. `catalog-handlers.mts`: `provider` search param, widened add
   validation, Discogs add branch, `handleCatalogRefresh`,
   `catalogReleasePayload` change. Get `catalog-functions.test.ts` green.
7. `client.ts`: `refreshDiscogsCollectionItem`. Get `client.test.ts` green.
8. `ownedRelease.ts`: provider-qualified signature; update both existing
   call sites. Get `ownedRelease.test.ts` green.
9. `collection.ts`: load/type `provider`. Get `collection.test.ts` green.
10. `CollectionDataProvider.tsx`: freshness pass. Get its test green.
11. `curator-handlers.mts`: `loadOwnedCollection` freshness pass. Get its
    test green — this is deliberately **after** step 10, not before,
    because both consume the same `discogsFreshness.ts`/`discogs.ts`
    primitives finalized in steps 3–4, and getting the client-side
    consumer right first surfaces any adapter-shape issue before
    duplicating the same integration server-side.
12. `DiscogsAttribution.tsx`.
13. `DiscoverPanel.tsx` + `DiscogsSearchPanel.tsx`: the fallback UI,
    artwork gating, `isExactCatalogReleaseOwned` call-site update. Run
    `DiscoverPanel.test.tsx`/`DiscogsSearchPanel.test.tsx` after this step.
14. `AlbumDetailPage.tsx`: provenance block, artwork gating,
    `discogsUnavailable` state.
15. `DashboardPage.tsx`, `CuratorRecommendationCard.tsx`,
    `CollectionItemCard.tsx`: artwork gating (both) and `discogsUnavailable`
    degraded state (the latter two).
16. `SettingsPage.tsx`: app-level notice.
17. The migration file (§10) + pgTAP additions — written now, **applied
    only per §20's deploy-order gate**, never against hosted Supabase
    during PR B's own local development/test loop beyond the local
    `supabase start`/`supabase test db` sandbox this project's existing
    gate already uses.
18. Full automated gate from a clean checkout.
19. Local manual smoke (§18, below) — no deploy yet.

## 15. Local manual smoke (before opening PR B, no deploy)

`npm run dev`, no production account required. Split into two tiers,
mirroring spec 0017's own precedent:

**Tier 1 — non-provider UI smoke, runs without permission (no real
Discogs/MusicBrainz call):** the new "Can't find it? Search Discogs" entry
point renders and opens/closes; typing and submitting with no
authorization does nothing until the button is pressed (proves no
auto-fire); the Settings page shows the new app-level notice; a
manually-constructed fixture collection item with `provider: 'discogs'`
and a stale `provider_fetched_at` (achievable via the existing dev-mode
fixture/mock seams this project's test suite already uses, not a real
provider call) renders the `discogsUnavailable` degraded state correctly
in Collection and Album Detail; desktop and one mobile viewport layout.

**Tier 2 — real-Discogs/MusicBrainz local smoke, OPTIONAL and
permission-gated:** mocked automated coverage (§17) is the pre-PR evidence
on its own; Tier 2 is not required to open PR B. **Before making any real
local provider request, STOP and obtain explicit human permission**,
exactly as spec 0017's own plan required. If granted, predeclare a bounded
maximum (this plan proposes **at most 4 real Discogs requests and 0 real
MusicBrainz requests** for this local-smoke round, since MusicBrainz
behavior is unchanged and does not need re-verification) — one Discogs
search, one exact lookup/add, one refresh-path exercise, one reserved for
an unplanned retry. If permission is not given, skip Tier 2 entirely.

## 16. Independent review gate

A reviewer confirms: every item in §2–§13 was implemented as decided here
(not silently reinterpreted); the Discogs adapter's fetch/timeout/error
mapping matches `musicbrainz.ts`'s existing pattern exactly (§2.2); the
§10.1 label/catno sentinel rule is implemented exactly as specified,
verified against the `HSV005` fixture; the freshness invariant (§4) is
enforced at both confirmed integration points and nowhere silently
bypassed; `handleCatalogRefresh`'s ownership guard (§4.1 step 3) genuinely
prevents an unauthenticated/ownership-free Discogs lookup; no seventh
Netlify Function was created; `DISCOGS_TOKEN` never appears in any
response body, log line, generated URL, or test fixture; the migration
(§10) is forward-only and does not weaken RLS/grants; every artwork caller
(§7) is explicitly provider-gated; attribution renders exactly where §5
specifies; no file outside §13's list changed; no OAuth/Restricted-Data/
model/dependency change; test adequacy against spec 0018 §21's full
acceptance-item list.

**Required bar: 0 BLOCKER / 0 HIGH / 0 MEDIUM** — matching this project's
established bar throughout.

## 17. Automated verification — spec 0018 §21 traceability

| Spec 0018 §21 item | Implementation | Test file | Mechanism |
| --- | --- | --- | --- |
| MusicBrainz search unchanged | no change to `musicbrainz.ts` search path | `musicbrainz.test.ts`, `catalog-functions.test.ts` | regression, mocked |
| Explicit Discogs search succeeds, bounded, Vinyl-only | `discogs.ts::searchDiscogsReleases` | `discogs.test.ts` | mocked `fetchImpl` |
| No Discogs call before explicit action | `DiscogsSearchPanel.tsx` state isolation | `DiscoverPanel.test.tsx`/`DiscogsSearchPanel.test.tsx` | render + assert zero network calls until submit |
| Hebrew query survives | `discogs.ts` normalization is script-agnostic (no ASCII-only validation) | `discogs.test.ts` | fixture using the verified Phase-0 Hebrew strings |
| Candidate bound (≤5) | `.slice(0, 5)` in `searchDiscogsReleases` | `discogs.test.ts` | mocked 10-result page → assert 5 returned |
| Non-Vinyl excluded | `normalizeDiscogsRelease`'s Vinyl gate (§2.4) | `discogs.test.ts` | fixture mirroring the `20370835` digital release |
| §10.1 label/catno sentinel rule | `normalizeDiscogsRelease` | `discogs.test.ts` | the `HSV005`/`"none"` fixture, both branches |
| Provider-qualified ownership | `ownedRelease.ts` | `ownedRelease.test.ts` | same-numbered-looking cross-provider fixture |
| Separate ID validators | `discogsIdentity.ts` vs `musicbrainzIdentity.ts` | both `*.test.ts` files | each rejects the other's shape |
| Exact lookup before persist | `handleCatalogAdd`'s Discogs branch | `catalog-functions.test.ts` | assert `lookupDiscogsRelease` called, browser metadata discarded |
| Token server-only, never leaked | `requiredEnv`, no browser import | `catalog-functions.test.ts` | assert response/error bodies never contain the test token string |
| Provider-aware `AlbumArtwork` callers | §7's four call sites | each component's test file | assert `releaseMbid` prop is `null` for a Discogs fixture |
| Discogs rows never use CAA | same as above | same | assert no CAA URL constructed |
| Custom cover still works | unchanged `AlbumArtwork` tier-1 logic | `AlbumDetailPage.test.tsx` | regression fixture |
| Attribution renders correctly | `DiscogsAttribution.tsx` + its call sites | each surface's test file | assert text + `href` + no `nofollow` |
| DB constraint accepts Discogs, rejects invalid | migration (§10) | `catalog_releases_rls.test.sql` | pgTAP |
| Manual semantics preserved | unchanged manual branch | same file | pgTAP regression |
| RLS/grants preserved | no policy/grant change | `catalog_releases_rls.test.sql`, `service_role_catalog_privileges.test.sql` | pgTAP regression |
| Freshness ≤6h path | `isDiscogsRowFresh` + both integration points | `discogsFreshness.test.ts`, `CollectionDataProvider.test.tsx`, curator test | unit + integration |
| Stale >6h → revalidate | §4.3/§4.4 | same files | integration, mocked Discogs response |
| Failed revalidation never shown as current | §4.3 step 4, §4.4 step 4 | same files | integration, mocked failure |
| `NULL` `provider_fetched_at` treated as stale | `isDiscogsRowFresh` | `discogsFreshness.test.ts` | unit |
| VIN excludes freshness-unestablished metadata | `loadOwnedCollection` filter (§4.4 step 4) | curator handler test | mocked, zero real model call |
| Cross-provider equivalence never inferred | no dedupe logic added anywhere | `ownedRelease.test.ts`, `DiscoverPanel.test.tsx` | regression assertion (two distinct items persist) |

Full existing automated gate (top of document) run from a clean checkout;
`npm run test:run` file/test counts recorded against the pre-PR-B baseline
in the PR description, exactly as spec 0017's own PR did.

## 18. PR decomposition

**PR A** — this plan (current). **PR B** — one coherent runtime + migration
+ automated-test implementation PR, in the commit order of §14 (roughly
6–8 commits: field-limit extraction; Discogs identity+adapter+freshness
primitives; catalog-handlers provider branching + refresh operation;
client+ownedRelease+collection provider plumbing; CollectionDataProvider+
curator-handlers freshness integration; Discogs UI+attribution+artwork
gating; migration+pgTAP; final gate fixes if needed) — matching spec
0018/task §22's preferred A/B/C shape; no concrete repository-coupling
reason was found during this plan's own inspection to split runtime work
further, and doing so would risk exactly the "half-implemented schema/
provider contract" intermediate state the task explicitly warns against.
**PR C** — documentation/screenshot closeout, opened only after PR B is
independently reviewed, merged, deployed, and human-accepted.

## 19. Database / deploy order

1. PR B's independent code-audit review passes (0 BLOCKER/HIGH/MEDIUM).
2. PR B approved and merged (normal merge commit, this project's
   established Git discipline).
3. Human provisions/confirms `DISCOGS_TOKEN` in the Netlify production
   environment (§11) — a human action, not performed by this plan or by
   PR B's own automation.
4. The reviewed forward migration (§10) is applied to hosted Supabase
   (`supabase db push` or the project's existing established migration-
   application workflow — the exact command matches whatever the project
   already uses for every prior migration; not newly invented here).
5. Migration/RLS/grant verification against hosted Supabase (a read-only
   check that the new constraint/column exist and existing rows are
   unaffected — no data is written as part of this verification).
6. Deploy merged `main` (`netlify deploy --prod`, the existing manual
   workflow — no new deployment mechanism).
7. Non-provider safe technical smoke: `/`, `/api/health`, `/discover`
   (page loads, no forced search).
8. Bounded human production acceptance (§20).

This order is chosen because the runtime code (step 2) never assumes the
new column/constraint exist until it actually needs them at request time —
the migration (step 4) can safely land any time after merge and before
deploy without an intermediate broken state, and provisioning the secret
(step 3) before the migration/deploy means the newly-deployed runtime is
never live without `DISCOGS_TOKEN` already present. No alternative
ordering was found necessary by inspecting this project's existing
deployment tooling (no CI, manual deploy, matching every prior enhancement
in this repository's history).

## 20. Human production acceptance

Bounded script, built around the mandatory verified scenario:

**Setup checks (no provider call):** `/api/health` returns `{"status":
"ok"}`; existing MusicBrainz Discover search still works exactly as
before (a query already known to work, e.g. one of the existing example
chips) — proves zero MusicBrainz regression.

**Mandatory Discogs scenario** — query `כהן מה שאפשר עם מה שנשאר`:

1. Confirm Discogs is **not** queried automatically alongside the
   MusicBrainz search for the same term (inspect network activity or the
   UI's own state — no Discogs results appear until "Search Discogs" is
   explicitly clicked).
2. Click "Can't find it? Search Discogs"; submit the query.
3. Confirm the Hebrew text renders correctly throughout.
4. Confirm at least one physical Vinyl candidate appears (phrased
   conditionally, per spec 0018 §5.3/§21 — if release `26770295` or an
   equivalent currently-valid Discogs Vinyl release of the same work is
   still present).
5. Confirm a non-Vinyl result (if the same query happens to also match one
   in a live re-run) is not shown/addable as a candidate.
6. Confirm the Discogs attribution text and link appear on the candidate
   card, and the link opens the correct discogs.com release page.
7. Confirm the release-specific metadata (label/catalog-number/country/
   format) is enough to distinguish the two vinyl editions observed in
   Phase-0.
8. Select the candidate; confirm the explicit Add confirmation step still
   appears (no automatic persistence).
9. Confirm; verify the exact server-side Release lookup happened before
   persistence (indirect evidence: the added record's metadata matches
   the live Discogs release, not whatever the search-result card
   displayed, proving the server re-fetched rather than trusting the
   browser).
10. Confirm the added record appears correctly in the Collection, with
    correct Hebrew metadata and correct provider provenance ("View on
    Discogs" on its Album Detail page, pointing at the exact release).
11. Confirm no Discogs cover image was fetched/displayed at any point
    (branded fallback shown); confirm the user's custom-cover-upload
    still works normally for this record.
12. Confirm duplicate-copy behavior is provider-qualified: re-finding and
    re-adding the exact same Discogs release shows "In your collection" /
    "Add another copy," while a MusicBrainz release of a conceptually
    similar album remains a separate, unrelated candidate (no false
    cross-provider duplicate flag, and no false negative on the real
    same-provider duplicate).

**Live-request budget for this acceptance round (all figures include
retries):**

- **Discogs requests: hard cap 8** (1 search, 1 add-time exact lookup, up
  to 2 more for the duplicate-copy re-add check, up to 4 in reserve for
  unplanned retries/re-verification — stop and ask before request 9).
- **MusicBrainz requests: hard cap 2** (one sanity-check search proving no
  regression — retries included; this feature does not change MusicBrainz
  behavior, so a large budget is not needed).
- **OpenRouter/Vision/VIN requests: 0.** This feature makes no model call
  of any kind; the automated freshness tests (§17) are the evidence for
  VIN's data-plumbing correctness — **no live VIN/Vision call is
  authorized for this acceptance round** unless a genuine defect
  surfaces during acceptance that specifically requires one to diagnose,
  in which case the human must explicitly authorize that call separately,
  matching this project's established practice.

No forced live production wait for an actual 6-hour staleness window is
required or proposed — the automated freshness tests (§17) are treated as
sufficient evidence for that contract, per the task's own explicit
permission to rely on them.

## 21. Stop conditions

Implementation must stop and return to the human if, during PR B:

- satisfying spec 0018 turns out to require a seventh Netlify Function
  (this plan's own analysis in §4.1 found it does not — but if
  implementation discovers the ownership-guard step, §4.1 step 3, cannot
  be safely performed inside the existing `/api/catalog/add` Function for
  a reason this plan did not anticipate, stop rather than adding one
  silently);
- the freshness-safe Collection/VIN handling designed in §4 is found to
  require touching a materially broader set of files than §13 lists (a
  genuine, not cosmetic, architecture expansion);
- the live Discogs API's actual auth/search/response behavior materially
  differs from Phase-0's empirical evidence or this plan's §2–§4 design
  assumptions;
- current official Discogs Terms, upon the human's own direct
  re-verification (spec 0018 §25 Q4), are found to materially differ from
  §5.2's reviewed clauses;
- the required migration is found to need any RLS/grant weakening, or any
  change to manual-release semantics, beyond §10's described shape;
- implementation is found to require any Discogs Restricted Data (images,
  Marketplace, user data) to satisfy any requirement in this plan;
- implementation is found to require OAuth or Discogs account access of
  any kind;
- implementation is found to require any new AI/model call, prompt
  change, or schema change to satisfy the VIN freshness requirement (§4.4
  is designed specifically to avoid this — if it's found insufficient,
  stop rather than silently adding a model-facing change);
- implementation would require moving, deleting, or recreating either
  existing freeze tag;
- a new runtime dependency is found to be genuinely necessary.

## 22. Current-official-docs re-verification gate (spec 0018 §25 Q4)

Before PR B locks any detail this plan's own research could not
independently confirm (both `https://www.discogs.com/developers` and the
API Terms of Use page returned HTTP 403 to this plan's own automated fetch
tooling, exactly as ADR 0002/spec 0018 already encountered), **the human
must directly open the live Discogs developer documentation and Terms of
Use page in a browser and confirm**: the exact Database Search
query-parameter names this plan relies on (`q`, `type`, `per_page` — §2.5);
the `/releases/{id}` and `/database/search` endpoint paths and response
field names this plan's §2.3 mapping table depends on; the six-hour
freshness clause's exact current wording; the attribution wording's exact
current text; and the commercial-use clause's exact current wording. This
gate is a precondition for opening PR B, not a task performed by PR B
itself.

**Evidence classification for every implementation decision in this
plan**, per task §27:

| Decision | Basis |
| --- | --- |
| DB schema shape, existing constraint text, existing Function/dependency shapes | **A — repository evidence** (direct inspection, cited throughout §1) |
| Personal-token header auth works; Database Search/Release lookup response fields; Hebrew query support; observed rate-limit headers | **B — Phase-0 empirical evidence** (spec 0018 §5.1, not re-performed by this plan) |
| CC0/Restricted classification; six-hour freshness rule; attribution wording; commercial-use clause | **C — official Terms** (spec 0018 §5.2, pending the §22 human re-verification gate above) |
| Provider boundary; identity contract; freshness mechanism shape; attribution surfaces; Vinyl-only gate; images/OAuth/Marketplace exclusion; no automatic fallback | **D — Vinyl Intelligence product decision** (spec 0018 §6–§19, ADR 0008) |
| Exact Database Search parameter names beyond `q`/`type`; exact current Terms wording | **Not independently confirmed by A–D** — explicitly the §22 gate's subject, not invented here |

## 23. Timebox

Anchored to this project's own demonstrated pace on the comparably-scoped
spec 0017 enhancement (the most recent precedent):

- PR B runtime implementation: **10–14 hours** (a new provider adapter +
  identity module mirroring existing patterns closely, provider branching
  across one shared handler file, four artwork-caller updates, one new UI
  sub-panel, freshness plumbing at two integration points, one migration —
  larger than spec 0017's own PR B in provider-adapter surface, smaller in
  UI-redesign surface since no multi-mode/pagination UI is being built).
- Independent review + one correction round (this project's consistent
  historical pattern): **3–5 hours.**
- Deploy + bounded human acceptance: **1–2 hours.**
- Documentation closeout (PR C, mirroring spec 0017's own PR C pattern,
  now a well-worn process in this repository): **2–3 hours.**

**Total: roughly 16–24 hours**, consistent with the earlier Phase-0
feasibility audit's own estimate and comfortably within a 3–4 day window
if each day yields several focused hours, with the same caveat that
project's own history (spec 0017 needed one runtime correction round and
three documentation follow-up rounds) suggests budgeting slack rather than
assuming a single clean pass.

**Features that must not be sacrificed under time pressure** (unchanged
from spec 0018's own list, restated here as the plan's own commitment):
provider-qualified identity; server-only secret; exact server lookup
before persistence; Vinyl-only validation; freshness compliance;
attribution; RLS/security; Hebrew correctness; MusicBrainz regression
safety.

**If time pressure increases, the first cuts, in order, are:** (1) the
Dashboard/VIN-card attribution decision in §5 could be revisited to skip
those two surfaces entirely if even the "No, confirmed by inspection"
reasoning is contested at review — but this plan does not recommend
pre-emptively weakening it; (2) the §15 Tier 2 live local smoke is already
optional; (3) nothing in the MUST-HAVE list (spec 0018 §11, restated
above) is a candidate for cutting — if the timeline cannot accommodate all
of it, that is itself a §21 stop condition, not a reason to silently ship
a partial freshness/attribution contract.

## 24. Traceability (spec 0018 → this plan)

| Spec 0018 section | Plan section | Test/evidence |
| --- | --- | --- |
| §6 provider boundary | §6 | `DiscoverPanel.test.tsx`/`DiscogsSearchPanel.test.tsx` — no auto-fire |
| §7 identity | §8 | `ownedRelease.test.ts` |
| §8 search | §2.5, §3.1 | `discogs.test.ts`, `catalog-functions.test.ts` |
| §9 exact lookup/trust | §3.2, §9 | `catalog-functions.test.ts` |
| §10 normalization | §2.3 | `discogs.test.ts` (incl. §10.1 fixture) |
| §12 freshness | §4 | `discogsFreshness.test.ts`, `CollectionDataProvider.test.tsx`, curator handler test |
| §13 attribution | §5 | each surface's test file |
| §14 artwork | §7 | each caller's test file |
| §15 API contract | §3, §4.1 | `catalog-functions.test.ts` |
| §16 security | §9, §11 | `catalog-functions.test.ts` (token/forged-metadata assertions) |
| §17 resilience | §12 | `discogs.test.ts` (pacer, no-retry) |
| §19 multilingual | §2.3, §20 | `discogs.test.ts` Hebrew fixture; human acceptance |
| §20 migration | §10 | `catalog_releases_rls.test.sql` |
| §21 verification | §17 | full traceability table above |

## 25. Unresolved behavior-defining questions

**None.** Every item spec 0018 §25 left open for this plan is resolved
above: UI placement of the Discogs fallback entry point (§6 — adjacent to
"Can't find it? Add it manually"); the exact shared freshness mechanism
(§4, two confirmed integration points, one shared pure helper); the
bounded-retry decision (§12 — explicitly zero automatic Discogs retries).
The one remaining item — independent human re-verification of the current
official Discogs documentation/Terms (§22) — is a precondition-gate for
starting PR B, not an unresolved implementation design question; every
implementation decision in this plan is traceable to repository evidence,
Phase-0 empirical evidence, the currently-reviewed Terms text, or an
explicit Vinyl Intelligence product decision (§22's classification table),
with no invented provider guarantee.
