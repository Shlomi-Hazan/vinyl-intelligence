# 007 Milestone 6 Browse / Search / Filter Implementation Plan

Status: PLANNED - awaiting human approval before implementation

Milestone: 6 - Browse / Search / Filter

Date: 2026-08-30

Branch: `claude/milestone-6-browse-search-filter`

Baseline: `2c125bc006bb2631da8356d8c51daf5ef9772a13` (Milestone 5 merge on `main`)

Specification: `docs/specs/0007-milestone-6-browse-search-filter.md`

## Current Repository Baseline

Milestone 5 is merged. In place and reused by Milestone 6:

- `public.releases` columns: `id, created_by, source ('manual'|'catalog'),
  artist, title, release_year, label, catalog_number, country, format,
  provider, provider_release_id, provider_release_group_id, created_at,
  updated_at`. **No `genres` / `styles` / `decade` column.**
- `public.collection_items`: `id, user_id, release_id, added_at, created_at`
  with `(user_id, added_at desc, id desc)` and other indexes; full RLS.
- `src/lib/supabase/collection.ts`: `ManualReleaseInput`,
  `normalizeManualReleaseInput`, `validateManualReleaseInput`,
  `RELEASE_FIELD_LIMITS`, `loadCollection` (joins the release fields above,
  ordered `added_at desc, id desc`), `addManualCollectionItem`,
  `updateManualRelease`, `deleteCollectionItem`, `CollectionItemWithRelease`.
- `src/collection/CollectionPanel.tsx`: loads the collection, `sortCollection`
  (`added_at desc, id desc`), renders `CollectionForm mode="add"` + the sorted
  list of `CollectionItemCard` + inline edit forms. Takes `userId` (Milestone 5
  session-draft scoping).
- `src/collection/CollectionForm.tsx`: 7-field manual add/edit form.
- `src/collection/CollectionItemCard.tsx`: `metadataLine` =
  `year / label / catalog_number / country / format`.
- `src/lib/catalog/musicbrainz.ts`: `searchMusicBrainzReleases`,
  `lookupMusicBrainzRelease` (`inc=artist-credits+labels+release-groups+media`),
  `buildMusicBrainzLookupUrl`, `MusicBrainzError`, `FetchFunction`.
- `src/lib/catalog/types.ts`: `CatalogCandidate` (no genre), `CatalogErrorCode`.
- `netlify/functions/_shared/catalog-handlers.mts`: `handleCatalogSearch` /
  `handleCatalogAdd`; `handleCatalogAdd` = authenticate -> pace -> release
  lookup (retry once on 429) -> `upsertCatalogRelease` (service role) ->
  `createCatalogCollectionItem`. `catalogReleasePayload(candidate)` builds the
  `releases` upsert row.
- `supabase/migrations/20260829120000_grant_service_role_catalog_privileges.sql`:
  `service_role` has table-level `select, insert, update` on `public.releases`.
- `docs/data-model.md` already lists `genres text[]`, `styles text[]`,
  `decade int` (decade "can be derived ... or stored later if filtering
  performance requires it") and a GIN index on `genres` - Milestone 6's
  `genres` column follows that documented direction.

## Design Decisions

### 1. Filtering boundary: client-side (Option A)

Load the user's owned collection once through the existing RLS-authoritative
browser query, then search / filter / sort deterministically in memory.

Rationale: a personal vinyl collection is small (tens to low thousands of
rows). Client-side filtering is instant, has no network cost, cannot leak
another user's data (the query already returns only the caller's rows via RLS),
and needs no new Netlify Function or database index for search. A server-side
filter endpoint would add a privileged surface to filter data the browser can
already read - explicitly discouraged by the milestone brief. If a collection
ever grows past a few thousand records, pagination or server-side filtering can
be added later without changing the RLS model.

### 2. Genre persistence: `releases.genres text[]`

One forward migration adds `genres text[] not null default '{}'` to
`public.releases`, a check constraint (each element trimmed, lowercase,
1-40 chars; at most 12 elements; no null element), and a GIN index. This
matches `docs/data-model.md`. `styles` is **not** added - MusicBrainz has no
reliable Discogs-style "style" field.

`decade` is **not** stored; it is derived in the client
(`Math.floor(year / 10) * 10`).

### 3. Genre source: one best-effort MusicBrainz release-group lookup on Add

`src/lib/catalog/musicbrainz.ts` gains
`lookupMusicBrainzReleaseGroupGenres(releaseGroupId, fetchOptions)`:

- `GET https://musicbrainz.org/ws/2/release-group/<rgid>?inc=genres&fmt=json`
- same `User-Agent`, `Accept: application/json`, an `AbortController` timeout
  (~6-8 s), no retry.
- parses `payload.genres` (array of `{ name, count, id }`), keeps `name` where
  `count >= 1`, `toLowerCase().trim()`, filters to 1-40 chars, de-duplicates,
  caps at 12.
- returns `string[]`; on any non-2xx, timeout, malformed body, or missing
  `releaseGroupId` returns `[]` and never throws.

`handleCatalogAdd` calls it after the existing release lookup (with a short
extra `paceProviderRequest()` between the two GETs), then merges the result into
`catalogReleasePayload` as `genres`. A genre-lookup failure is swallowed; the
release is upserted with `genres = '{}'` and the Add succeeds normally.

Release-group genres are chosen over release-level genres because MusicBrainz
community genre votes concentrate at the release-group level; release-level
`inc=genres` coverage is too sparse to back a real filter. This is
`docs/specs/0005-...`-confirmed API capability, not new research.

The catalog **search** endpoint and the Milestone 5 recognition endpoint are
unchanged and add no call. `CatalogCandidate` gains `genres: string[]`,
populated only by the add-path lookup (search candidates carry `[]`).

### 4. Manual genre input (pending Open Question 1)

If approved: one optional "Genre" text input on `CollectionForm`, normalized to
a 0-or-1-element `genres` array, validated 1-40 chars when present, written by
`addManualCollectionItem` / `updateManualRelease`. Requires extending the
`authenticated` `insert (genres)` / `update (genres)` column grants and the
`private.touch_release_updated_at` trigger's `before update of ...` column list
and `when` clause. If not approved: manual records keep `genres = '{}'` and are
always shown until a genre filter is set.

### 5. Client search / filter / sort pipeline

New pure module `src/collection/collectionQuery.ts`:

```ts
export type CollectionFilters = {
  search: string
  year: string        // raw input; parsed defensively
  decade: string      // e.g. "1960s" | ""
  genre: string       // e.g. "jazz" | ""
}

export type CollectionSort =
  | 'recently-added' | 'artist-asc' | 'album-asc'
  | 'year-desc' | 'year-asc'

export const EMPTY_FILTERS: CollectionFilters
export function decadeLabel(year: number): string          // 1967 -> "1960s"
export function availableDecades(items): string[]           // present in data, sorted
export function availableGenres(items): string[]            // distinct, lowercase, sorted
export function applyCollectionQuery(
  items: CollectionItemWithRelease[],
  filters: CollectionFilters,
  sort: CollectionSort,
): CollectionItemWithRelease[]
```

Semantics exactly as the spec's "Client search / filter / sort" section:
trim + case-insensitive substring on artist OR title; exact integer year;
decade from `release_year`; case-insensitive genre membership; logical AND;
null year / empty genres are simply non-matching; sorts are total orders with
null years last and a deterministic tiebreak on the default order.

`CollectionPanel` holds `filters` + `sort` state, derives the visible list with
`useMemo(() => applyCollectionQuery(items, filters, sort), [items, filters, sort])`,
and renders the controls + a `"{visible.length} of {items.length} records"`
count. No effect, no fetch, is triggered by a filter or sort change.

### 6. UI (small, reuses existing styles)

A `CollectionLibraryControls` sub-component above the existing list:

- search `<input type="search">`
- decade `<select>` (options from `availableDecades`; hidden if none)
- exact-year `<input inputMode="numeric">` (optional; inline hint on bad input)
- genre `<select>` (options from `availableGenres`; hidden if the collection
  has no genres)
- sort `<select>` (5 options)
- "Clear filters" `<button>` (enabled only when a filter is active)
- result count text

Reuse `.catalog-form` / `.collection-panel` / `.field-hint` / `.auth-actions`
styles; add a small `.collection-library-controls` grid rule. No routing, no
new page, no redesign. Basic responsive only.

`CollectionItemCard.metadataLine` optionally appends genres (Open Question 3).

## Files / Components Affected

```
supabase/migrations/20260830xxxxxx_add_release_genres.sql   # NEW
supabase/tests/database/release_genres.test.sql             # NEW (pgTAP)
src/lib/supabase/client.ts            # Release type: + genres: string[]
src/lib/supabase/collection.ts        # loadCollection select + genres;
                                      # ManualReleaseInput/normalize/validate (if manual field);
                                      # add/update write genres
src/lib/catalog/types.ts              # CatalogCandidate: + genres: string[]
src/lib/catalog/musicbrainz.ts        # + lookupMusicBrainzReleaseGroupGenres, build URL, normalize
netlify/functions/_shared/catalog-handlers.mts  # best-effort genre lookup in handleCatalogAdd;
                                      # catalogReleasePayload + genres; add-response select + genres
src/collection/collectionQuery.ts     # NEW pure filter/sort pipeline
src/collection/collectionQuery.test.ts# NEW
src/collection/CollectionLibraryControls.tsx   # NEW
src/collection/CollectionPanel.tsx    # filter/sort state, controls, count, filtered list
src/collection/CollectionForm.tsx     # optional Genre input (if approved)
src/collection/CollectionItemCard.tsx # optional genre on metadata line (Open Question 3)
src/collection/CollectionPanel.test.tsx         # controls, count, no-results, zero provider calls
src/collection/CollectionForm? / manual tests   # genre field (if approved)
src/styles.css                        # .collection-library-controls
docs/specs/0007-..., docs/plans/007-...          # status flips at approval / completion
README.md, docs/verification.md, docs/specs/README.md  # status/index, at verification time
```

Names may shift during implementation; the boundary stays: one migration, one
pure client pipeline, one small controls component, one best-effort adapter
call, reuse of the existing collection load and catalog add paths.

## Database Implications

- Forward migration only; no historical migration edited.
- `releases.genres text[] not null default '{}'` + `releases_genres_clean`
  check + `releases_genres_gin_idx`.
- `authenticated` gains column grants `insert (genres)` / `update (genres)` on
  `releases` **only if** the manual Genre field is approved; the
  `touch_release_updated_at` trigger's column list / `when` clause extended to
  match.
- `service_role` needs no new grant (table-level `insert, update` already
  present).
- RLS policies unchanged. `releases_manual_catalog_identity` and every other
  constraint unchanged. No `collection_items` change. No `decade` column.
- pgTAP `release_genres.test.sql`: column + default + check (reject
  blank/untrimmed/uppercase/overlong/>12); GIN index present; `authenticated`
  `genres` column privileges correct (if applicable); `service_role` can write
  `genres` on a `source='catalog'` row; a browser role still cannot escalate;
  M2-M5 suites still pass on a clean reset.

## External API Implications

- MusicBrainz only, existing adapter conventions. One extra best-effort GET per
  confirmed catalog Add (release-group genres). Search path unchanged.
- Browsing / filtering / sorting the collection triggers **zero** external
  requests (MusicBrainz or OpenRouter) - enforced by tests that assert the
  catalog/recognition clients are never called on a filter change.
- No new provider, no Cover Art Archive, no MusicBrainz submissions.

## Security / Privacy Implications

- Collection ownership stays RLS-authoritative; the browser query already
  returns only `auth.uid()`'s rows. Client-side filtering cannot widen that.
- No new Netlify Function, no new secret, no service-role key in the browser.
- The genre lookup runs server-side inside the existing authenticated
  `handleCatalogAdd`, with the existing `User-Agent` and timeout; it reads
  public MusicBrainz data only and writes `genres` through the existing
  service-role `releases` upsert.
- No cross-user visibility; no AI call anywhere in Milestone 6.

## AI / Model Implications

None. No model call is added. Genre is persisted factual metadata or the user's
own manual entry - never inferred.

## Verification

Run before opening the PR:

```bash
git diff --check
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
npm audit --omit=dev
```

Plus the focused tests listed in the spec, a branch-diff secret/scope scan, and
the human runtime test plan in the spec. Distinguish agent-run automated
evidence (no real external calls) from human runtime evidence in
`docs/verification.md`. Do not claim production verification.

## Pre-PR Repository Evidence Gate

Before opening the Milestone 6 PR, verify: spec/plan status reflect actual
approvals; README current status is accurate and separates implemented from
planned; `docs/verification.md` records only checks that actually ran and
distinguishes automated from human evidence; the genre-coverage limitation
(releases added before Milestone 6 have no genre; release-group lookup is
best-effort) is visible; no future feature is represented as implemented; no
Milestone 7+ work started; historical planning language stays historical; no
secret or real `.env` is staged; the branch contains only Milestone 6 scope.

## Risks / Notes

- MusicBrainz genre coverage is uneven even at release-group level; some added
  records will legitimately have no genre. The genre selector is shown only
  when data exists, so the feature degrades honestly.
- The extra Add GET marginally increases MusicBrainz load; mitigated by being
  one call per explicit user Add, sequential, paced, best-effort, no retry.
- Records added before this milestone have `genres = '{}'` until re-added or
  (if the manual field ships) manually edited. No backfill in Milestone 6.
- Client-side filtering assumes the whole collection is loaded; if pagination
  is introduced later, filtering must move server-side or operate on the loaded
  page only - out of scope now.
- Diacritic-insensitive search is out of scope for Milestone 6.

## Human Decisions Required Before Implementation

See "Open Questions Requiring Human Approval" in the spec:

1. Add the optional manual Genre field? (recommended yes)
2. Genre source: one best-effort release-group GET per Add (recommended) vs.
   sparse release-level only vs. defer genre.
3. Show genres on the collection card? (recommended yes)
4. Standalone ADR for the genre decision? (recommended: not needed)

## Stop Point

This plan is PLANNED. Implementation begins only after the human approves this
plan, the specification, and the answers to the Open Questions above.
