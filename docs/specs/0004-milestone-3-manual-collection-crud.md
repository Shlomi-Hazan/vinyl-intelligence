# 0004 Milestone 3 Manual Collection CRUD Specification

Status: approved and implemented (automated verification complete; human runtime verification passed)

Milestone: 3 - Manual Collection CRUD

Date: 2026-08-19

Approved: 2026-08-19

Implemented: 2026-08-19

Implementation approval granted after human review of corrected planning commit
`b9b641667e4bbfffb95f87a2b383f47fbb806613`.

## Intent

Implement the first real Vinyl Intelligence product capability after human approval:
an authenticated user can manually add, view, edit, and remove records from
their personal vinyl collection without relying on external catalog APIs, image
recognition, AI, recommendations, listening history, ratings, favorites, or
later milestones.

Manual collection CRUD is deterministic product software. It should use
Supabase Auth and Row Level Security directly from the browser where RLS and
least-privilege grants are sufficient. It must not introduce service-role
credentials, catalog API calls, model calls, RAG, vector databases, or
unnecessary backend complexity.

## User Outcome

After Milestone 3 implementation, a reviewer should be able to verify:

- An authenticated user sees a collection screen.
- A new user sees a clear empty collection state.
- The user can manually add a record with enough metadata to identify it.
- The record appears in the user's collection list.
- The record persists after refresh/sign-out/sign-in.
- The user can edit permitted metadata on their own creator-owned manual
  releases.
- The user can remove one owned collection item.
- Removing a collection item does not delete the referenced release row.
- Loading, success, validation, and recoverable error states remain visible and
  retryable.
- If the session expires, protected collection operations fail visibly and the
  app returns to the existing auth/session boundary rather than fabricating a
  user or write.

## Approved Architectural Context

Milestone 3 must build on the merged Milestone 2 foundation:

- Frontend: Vite + React + TypeScript.
- Database/Auth/Storage: Supabase.
- Browser access uses browser-safe Supabase configuration and RLS.
- Supabase service-role credentials must never be exposed to the browser.
- Privileged/server logic belongs in Netlify Functions only when justified.
- Existing Milestone 2 conventions for explicit `grant`/`revoke`, RLS, private
  helper functions, fixed/empty `search_path`, and behavioral pgTAP tests remain
  the project standard.

## In Scope

- Add version-controlled schema for `public.releases`.
- Add version-controlled schema for `public.collection_items`.
- Add database constraints for manual release metadata and ownership.
- Add least-privilege table grants and RLS policies.
- Add a collection data service for browser Supabase reads/writes.
- Add minimal authenticated collection UI:
  - empty state
  - add form
  - list
  - edit form/state
  - delete/remove action
  - loading/error/success states
- Add focused frontend tests for CRUD behavior and recoverable errors.
- Add database tests for schema, constraints, grants, RLS, ownership, duplicate
  behavior, delete semantics, and release edit rules.
- Update durable verification evidence after implementation.

## Out of Scope

Milestone 3 must not implement:

- Discogs, MusicBrainz, Cover Art Archive, or any catalog search/import.
- Automatic metadata enrichment.
- Cover-image recognition.
- Image upload or Supabase Storage workflows.
- AI curator or model calls.
- Recommendations.
- Ratings.
- Favorites.
- Notes.
- Listening history.
- Conversational refinement.
- Production deployment work.
- Full browse/search/filter experience.
- RAG, vector databases, or multi-agent systems.

## User-Facing Flows

### Authenticated Collection Screen

When `status === 'authenticated'` and a profile is loaded, the protected shell
should show the user's collection capability rather than only the Milestone 2
profile form. The UI can stay minimal and functional. It should not attempt the
final polished collection experience.

### Empty Collection State

If the authenticated user has no `collection_items`, show a clear empty state
and an obvious way to add the first record.

### Manually Add A Record

The add flow should collect the minimal manual release metadata:

- Artist, required.
- Album/title, required.
- Release year, optional.
- Label, optional.
- Catalog number, optional.
- Country, optional.
- Format, optional.

Optional string fields should trim whitespace and store empty values as `NULL`.
The UI should validate obvious issues before submit, while the database remains
authoritative.

No catalog lookup, auto-complete, image upload, or enrichment is allowed in this
milestone.

### List Owned Records

The collection list should show enough information to identify each owned
record:

- Artist.
- Title.
- Optional release year.
- Optional label/catalog/country/format when present.
- Added date or stable ordering context.

The list should be ordered deterministically, initially newest-added first with
an `id` tie-breaker.

### Edit Manually Entered Metadata

The user may edit release metadata for manual releases they created. In
Milestone 3, browser-created manual releases are creator-owned rows inside the
future-compatible `releases` table. They are not globally shared catalog rows.

Another user cannot select, update, or attach ownership to a creator-owned
manual release by guessing its UUID.

Editable fields for Milestone 3:

- Artist.
- Title.
- Release year.
- Label.
- Catalog number.
- Country.
- Format.

Source/provenance fields, timestamps, ownership IDs, and future catalog fields
must not be client-editable.

### Remove From Collection

Delete means removing that user's `collection_item`. It does not mean deleting
the referenced release row. It must not remove another user's ownership or a
release still referenced by anyone else.

Orphan release cleanup is explicitly deferred unless a later reviewed migration
adds a safe cleanup path.

### Loading/Error/Success States

CRUD failures should be recoverable:

- Add failure keeps the add form visible.
- Edit failure keeps the existing record UI visible.
- Delete failure keeps the record visible.
- Session/auth failures do not fabricate success.
- Successful operations show a small confirmation/notice.

## Data Model

### `public.releases`

Purpose: metadata describing a musical/physical release.

Recommended Milestone 3 fields:

| Field | Requirement | Notes |
| --- | --- | --- |
| `id uuid` | Primary key, generated by database | Internal release ID. |
| `created_by uuid` | Nullable FK to `public.profiles(id)` with `on delete set null` | Provenance for manual rows. Manual browser inserts must set/default to the current user. |
| `source text` | Not null, default/check `manual` for Milestone 3 | Future migrations can broaden this for catalog imports. |
| `artist text` | Required, trimmed, nonblank | Album-first UI still needs artist identity. |
| `title text` | Required, trimmed, nonblank | Album/release title shown in collection. |
| `release_year int` | Nullable, sensible range | Decade is derived later, not stored now. |
| `label text` | Nullable, trimmed if present | Useful manual identifier. |
| `catalog_number text` | Nullable, trimmed if present | Useful release-level identifier without external APIs. |
| `country text` | Nullable, trimmed if present | Useful release-level disambiguation. |
| `format text` | Nullable, trimmed if present | Example: LP, 12 inch, 7 inch, box set. |
| `created_at timestamptz` | Not null, default `now()` | Audit field. |
| `updated_at timestamptz` | Not null, default `now()` | Updated when editable release metadata changes. |

Fields evaluated and deferred:

- `genres` / `styles`: defer to catalog integration or browse/filter planning to
  avoid premature array validation and UI complexity in this manual CRUD
  milestone.
- `cover_url`: defer because Milestone 3 has no catalog or storage workflow.
- `tracklist`, `formats jsonb`, `metadata_json`, external URLs: defer to
  catalog integration after the API spike.
- `provider`, `provider_release_id`, `provider_master_id`: defer to Milestone 4
  after catalog API design is finalized.
- `decade`: derive from `release_year`; do not redundantly persist now.

### `public.collection_items`

Purpose: ownership of a physical record/release by a user.

Recommended Milestone 3 fields:

| Field | Requirement | Notes |
| --- | --- | --- |
| `id uuid` | Primary key, generated by database | One owned copy/entry. |
| `user_id uuid` | Not null FK to `public.profiles(id)` with `on delete cascade` | Owner. Should default/check to `auth.uid()` for browser inserts. |
| `release_id uuid` | Not null FK to `public.releases(id)` with restrictive delete behavior | The release metadata for this owned item. |
| `added_at timestamptz` | Not null, default `now()` | User-visible order. |
| `created_at timestamptz` | Not null, default `now()` | Audit field. |

Fields intentionally deferred:

- Ratings.
- Favorites.
- Notes.
- Listening count.
- Last listened.
- Listening history.
- Recommendation state.
- AI metadata.
- Entry method/source. If a later milestone needs to record whether an item was
  entered manually, by catalog search, or by photo confirmation, add a clearly
  named field such as `entry_method` after that requirement is specified.

## Shared Release Ownership/Edit Model

Milestone 3 needs a `releases` table before catalog integration, but Milestone 3
manual rows are not yet shared catalog/provider-backed rows. A manual release
row is creator-owned data inside the future-compatible shared table.

### Option A: User-Scoped Release Rows

Each user gets separate release rows even for the same album.

- Pros: simple RLS and no cross-user edit risk.
- Cons: does not reflect future shared/catalog-like release architecture and
  creates more normalization work later.

### Option B: Shared Release Rows With Creator/Provenance Ownership

One `releases` table exists, but manual rows carry `created_by` provenance and
editing is constrained to the creator.

- Pros: preserves the shared table shape needed later, supports manual CRUD now,
  and prevents arbitrary cross-user edits.
- Cons: manual duplicate rows are expected until catalog normalization exists.

### Option C: Shared/Immutable Releases Plus Replacement/Relink Corrections

Releases are immutable after creation; edits create a replacement release and
relink the user's collection item.

- Pros: strongest protection for shared metadata.
- Cons: heavier UI/service behavior for a first manual CRUD milestone.

### Option D: Manual Draft Releases Plus Later Canonical Releases

Treat Milestone 3 manual releases as creator-owned draft/reference rows in the
shared `releases` table. Do not expose cross-user manual release discovery yet.
Catalog integration can later introduce canonical provider-backed rows and
relink collection items after user confirmation.

- Pros: combines safety with a future-compatible schema.
- Cons: manual duplicate rows are expected until catalog normalization exists.

### Recommendation

Use Option D, implemented as a constrained form of Option B.

For Milestone 3:

- Manual release rows live in `public.releases`.
- Browser-created release rows are `source = 'manual'`.
- Manual rows have `created_by = auth.uid()`.
- Normal authenticated users can select only their own manual release rows.
- Normal authenticated users can update only their own manual release rows.
- Another user must not be able to attach a `collection_item` to that manual
  release by guessing its UUID.
- Users cannot delete releases through normal browser access.
- Two different users manually describing the same album will create separate
  manual release rows for now.
- Do not implement a cross-user
  `not exists (select 1 from collection_items ...)` edit policy.
- Do not add a `security definer` authorization helper merely to determine
  whether another user references a release.
- Keep the Milestone 3 RLS graph simple and non-recursive.

This avoids cross-user edit vulnerabilities, keeps Milestone 4 from being boxed
into a user-scoped-only model, and allows later catalog matching to canonicalize
or relink manual rows deliberately.

Future Milestone 4 provider-backed/canonical releases may introduce broader
sharing with separately reviewed policies. Do not pre-implement those sharing
rules in Milestone 3.

## Duplicate Semantics

Milestone 3 manual add does not perform text-based release deduplication.

Each ordinary manual Add Record flow may create:

1. A new creator-owned manual release row.
2. One collection item referencing that release.

Therefore, if the same user enters identical metadata twice:

- Two manual release rows and two collection items may be created.
- This is acceptable.
- Do not silently deduplicate by artist/title/year text.
- Do not add a unique constraint that blocks multiple physical copies.
- `(user_id, release_id)` should remain non-unique so future canonical catalog
  releases can support multiple owned copies.

Two different users manually describe the same album:

- They create separate manual release rows in Milestone 3.
- No automatic cross-user deduplication happens.

If multiple collection items reference the same release, editing that release
naturally changes the release metadata shown for all those copies. This is
acceptable for same-user duplicate copies and future canonical releases.

Catalog integration later identifies two manual rows as the same canonical
release:

- Milestone 4 or a later normalization task may create/use a provider-backed
  canonical release row and relink collection items after explicit review.
- Do not do automatic deduplication in Milestone 3.

## Delete Semantics

Deleting a collection item removes only the current user's ownership row.

It must not:

- Delete the referenced release row.
- Delete another user's collection item.
- Cascade unexpectedly through release metadata.

Recommended foreign key direction:

- `collection_items.user_id -> profiles.id on delete cascade`.
- `collection_items.release_id -> releases.id` with restrictive release delete
  behavior.

Release orphan cleanup is deferred. Orphan manual release rows are acceptable in
Milestone 3 because they are not exposed as collection ownership and can be
handled later by an explicit, reviewed cleanup strategy.

## RLS And Privilege Matrix

Milestone 3 should use explicit `revoke`/`grant` statements and RLS. Do not rely
on Supabase defaults.

| Role | Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- | --- |
| `anon` | `releases` | Deny | Deny | Deny | Deny |
| `anon` | `collection_items` | Deny | Deny | Deny | Deny |
| `authenticated` | `releases` | Allow own manual releases only | Allow own manual release insert only | Allow safe metadata columns on own manual releases only | Deny |
| `authenticated` | `collection_items` | Allow own items only | Allow own item referencing an own manual release | Deny for Milestone 3 | Allow own items only |

Column-level grants should prevent browser users from mutating:

- `id`
- `created_by`
- `user_id`
- `release_id` after insert
- `source`
- timestamps

RLS policy intent:

- `releases` SELECT: `created_by = auth.uid()` and `source = 'manual'`.
- `releases` INSERT: current user creates a manual row for themselves.
- `releases` UPDATE: current user updates their own manual row only.
- `collection_items` SELECT: `user_id = auth.uid()`.
- `collection_items` INSERT: `user_id = auth.uid()` and `release_id` references
  an own manual release.
- `collection_items` DELETE: `user_id = auth.uid()`.
- No collection item UPDATE policy in Milestone 3 unless the human approves a
  mutable ownership field.

No service-role key is required for this milestone.

## Atomicity

Manual add normally requires:

1. Insert a manual release.
2. Insert a collection item referencing that release.

Recommended Milestone 3 approach:

- Use ordinary browser Supabase inserts guarded by grants/RLS.
- Insert the manual release first.
- Insert the collection item second.
- Do not add a transaction RPC.
- Do not add a Netlify Function.
- Do not grant authenticated browser `DELETE` on `releases`.
- If collection item insertion fails after release insertion, a creator-owned
  orphan manual release may remain.
- This is an accepted Milestone 3 tradeoff.
- The collection UI must load from `collection_items`, so orphan releases must
  not appear as owned records.
- Explicit orphan cleanup remains deferred.

Do not introduce a privileged Netlify Function or `SECURITY DEFINER` helper for
this milestone's add flow.

## Validation And Constraints

Database constraints are authoritative. React validation is for usability only.

Recommended constraints:

- `artist`: trim-normalized, nonblank, max 160 characters.
- `title`: trim-normalized, nonblank, max 200 characters.
- `release_year`: nullable; if present, between 1900 and 2100.
- `label`: nullable; if present, trim-normalized and max 160 characters.
- `catalog_number`: nullable; if present, trim-normalized and max 120
  characters.
- `country`: nullable; if present, trim-normalized and max 80 characters.
- `format`: nullable; if present, trim-normalized and max 80 characters.
- Optional strings are normalized to `NULL` when blank.
- `source` is constrained to `manual` for Milestone 3.
- `user_id` and `created_by` must match the authenticated user through defaults,
  RLS checks, or both.

## Query Strategy

The collection list should load through `collection_items` joined to `releases`.

Initial select shape should be equivalent to:

```text
collection_items:
  id
  added_at
  created_at
  release:
    id
    artist
    title
    release_year
    label
    catalog_number
    country
    format
```

Ordering:

- `added_at desc`
- `id desc` as a stable tie-breaker

Pagination is not required in Milestone 3. It can be added in browse/search/filter
work if collection size or UX requires it. Full search/filter is out of scope.

## React And Service Architecture

Recommended frontend structure:

```text
src/
├── collection/
│   ├── CollectionPanel.tsx
│   ├── CollectionForm.tsx
│   ├── CollectionItemCard.tsx
│   └── collection.test.tsx
└── lib/
    └── supabase/
        └── collection.ts
```

Responsibilities:

- `collection.ts`: database-facing types, normalization, validation helpers,
  load/add/update/delete service functions.
- `CollectionPanel`: owns collection screen state and calls the service.
- `CollectionForm`: add/edit form presentation and client-side validation.
- `CollectionItemCard`: display one owned item and expose edit/remove actions.
- `App.tsx`: route authenticated users into the collection/profile shell without
  adding a router library.

Do not add a state-management framework. Local React state is enough for this
milestone.

## Testing Requirements

Database tests must behaviorally verify:

- `releases` and `collection_items` schema exists.
- Required primary keys and foreign keys exist.
- Delete behavior matches the specification.
- RLS is enabled on both tables.
- Expected policies exist and broad unintended policies do not.
- `anon` has no access.
- Authenticated grants are column-limited as specified.
- User A cannot select User B manual release.
- User A cannot update User B manual release.
- User A can select/insert/delete only User A collection items.
- User A cannot select/delete User B collection items.
- User A cannot insert a collection item for User B.
- User A cannot attach a collection item to a release owned only by User B.
- User A can edit allowed metadata on User A manual release.
- User A cannot edit User B release metadata.
- Direct browser release delete is denied.
- `collection_items` UPDATE remains denied.
- Duplicate collection items for the same user/release are allowed.
- Deleting one duplicate removes only that collection item.
- Entering identical metadata twice may create two manual release rows and two
  collection items.
- Orphan manual releases do not appear in a collection-items-based collection
  query.
- Invalid metadata is rejected at the database layer.
- No provider fields are present in the Milestone 3 schema.
- Decade is not persisted.
- No unintended RLS recursion or cross-table policy dependency is introduced.

Frontend tests must cover:

- Authenticated empty state.
- Loading existing collection.
- Add success.
- Add recoverable error.
- Edit success.
- Edit recoverable error.
- Delete success.
- Delete recoverable error.
- Validation for required fields and release year.
- Session/auth boundary behavior.

General verification remains required:

- `npm run typecheck`
- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npx supabase db reset`
- `npx supabase test db`
- `npx supabase db lint`
- `npm audit --omit=dev`
- Full `npm audit --json` triage without forced/breaking remediation.
- Secret and scope scans.

## Human Runtime Verification Plan

After implementation, human browser verification should include:

- Sign in.
- See empty or existing collection.
- Manually add a record.
- Refresh and confirm persistence.
- Edit the record.
- Refresh and confirm edit persistence.
- Add another record.
- Remove one record.
- Confirm the remaining ownership is correct.
- Sign out and sign back in.
- Confirm collection persistence.
- Confirm `/api/health` still returns `{"status":"ok"}`.

Do not claim human runtime verification before it occurs.

## Compatibility With Later Milestones

Milestone 4 catalog integration:

- The `releases` table already exists and can receive provider identifier fields
  in a reviewed Milestone 4 migration after catalog API design is finalized.
- Manual rows can later be matched or relinked to canonical catalog rows after
  the documented API spike.

Milestone 5 photo recognition:

- Candidate confirmation can create or link to a release and then create a
  collection item only after user confirmation.

Milestone 6 browse/search/filter:

- Collection list queries already join ownership to release metadata.
- Year filtering can use `release_year`.
- Decade can be derived from `release_year`.
- Genre/style fields can be added through catalog/search planning instead of
  being prematurely hand-modeled here.

Milestones 7-10:

- Ratings/favorites/notes can be added as user-owned columns or related tables
  on/near `collection_items`.
- Listening history can reference `collection_items`.
- AI curator candidate sets can be generated from user-owned `collection_items`.
- Conversational refinement remains separate and must not recommend outside the
  owned collection.

## Acceptance Criteria

- Human-approved specification and implementation plan exist before
  implementation begins.
- No implementation commit occurs before explicit human approval.
- User-facing manual CRUD works for authenticated users.
- Anonymous users cannot read or write collection/release data.
- User ownership is enforced by RLS and behavioral tests.
- Cross-user release edit vulnerabilities are prevented.
- Duplicate semantics match this document.
- Delete semantics match this document.
- No catalog/API/AI/later-milestone code is introduced.
- All required frontend, database, build, audit, secret, and scope checks pass
  before completion is claimed.

## Human Decisions Required Before Implementation

Resolved by human review before implementation approval:

- Manual release rows are creator-owned data inside the future-compatible
  shared `releases` table.
- Normal authenticated users may select and update only their own manual
  releases in Milestone 3.
- Another user must not be able to attach a collection item to a manual release
  by guessing its UUID.
- Milestone 3 must not implement cross-user `not exists` release edit policies
  or `SECURITY DEFINER` authorization helpers for release reference checks.
- Provider columns are deferred to Milestone 4.
- `collection_items.source` is removed from the Milestone 3 schema.
- Text-based release deduplication is not performed in Milestone 3.
- Duplicate collection items for the same user/release remain allowed.
- Ordinary browser Supabase inserts with RLS are used; no transaction RPC or
  Netlify Function is added for manual add.
- Browser users are not granted release delete; orphan manual release cleanup is
  explicitly deferred.
- Minimal release metadata is limited to artist, title, release year, label,
  catalog number, country, and format.
- `genres`, `styles`, `cover_url`, provider fields, tracklists, raw metadata,
  and persisted decade are deferred.
- `collection_items` permissions are own-only select/insert/delete, with update
  denied.
- Collection and existing profile/sign-out controls stay in the same
  authenticated screen/shell.

Implementation approval gate:

- Satisfied. Explicit implementation approval for Milestone 3 was granted after
  this corrected specification and implementation plan were independently
  reviewed.

Runtime verification gate:

- Satisfied. Human runtime verification passed and is recorded in
  `docs/verification.md`.

## Stop Point

This historical stop point was satisfied before implementation began.

At that historical point, no further Milestone 3 work was to begin until the
implemented database/RLS and frontend/service changes received the required
human review and runtime verification. Those gates were subsequently satisfied
and are recorded in `docs/verification.md`.
