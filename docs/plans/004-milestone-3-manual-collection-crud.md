# 004 Milestone 3 Manual Collection CRUD Implementation Plan

Status: proposed for human review / implementation approval

Milestone: 3 - Manual Collection CRUD

Date: 2026-08-19

## Objective

After human approval, implement the first product vertical slice:
authenticated users can manually add, view, edit, and remove owned vinyl records
without catalog APIs, image recognition, AI, ratings, favorites, notes, listening
history, or later browse/search/filter work.

## Current Repository State

Planning started from:

- `main` at `030f184af31e712650ed699d456d6a829798b1e7`.
- Local `main` fast-forwarded to match `origin/main`.
- Working tree clean before creating this planning branch.
- Planning branch: `codex/milestone-3-manual-collection-crud`.

Current implementation baseline:

- Vite + React + TypeScript.
- Netlify Functions health endpoint at `/api/health`.
- Supabase Auth browser client.
- Email/password auth with confirmation flow.
- Minimal authenticated profile workflow.
- `public.profiles` migration with RLS, explicit grants, private helper
  functions, and pgTAP tests.
- No `releases`, `collection_items`, catalog, AI, listening, rating, favorite,
  or notes code yet.

## Approved Constraints

- Do not implement Milestone 3 until this plan and the matching specification
  are explicitly approved by the human.
- Use Supabase Auth + RLS directly from the browser where sufficient.
- Do not expose service-role credentials to the browser.
- Do not add Netlify Functions unless a privileged server boundary is justified.
- Do not add dependencies unless implementation later proves a minimal need.
- Preserve Milestone 2 least-privilege conventions.
- Keep UI minimal and functional.

## Proposed Files And Directories

Expected implementation files after approval:

```text
/
├── docs/
│   └── verification.md
├── src/
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── collection/
│   │   ├── CollectionForm.tsx
│   │   ├── CollectionItemCard.tsx
│   │   ├── CollectionPanel.tsx
│   │   └── collection.test.tsx
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts
│   │       ├── collection.ts
│   │       └── profile.ts
│   └── styles.css
└── supabase/
    ├── migrations/
    │   └── <timestamp>_create_manual_collection.sql
    └── tests/
        └── database/
            └── collection_rls.test.sql
```

Implementation may adjust component names if the approved plan is updated, but
the scope must remain manual collection CRUD only.

Do not create:

- Catalog API modules.
- Netlify catalog functions.
- Image upload/storage code.
- AI/model modules.
- Listening/rating/favorite/note modules.
- Router/state-management framework setup.

## Proposed Database Migration

Create one coherent migration after approval, likely named:

```text
supabase/migrations/<timestamp>_create_manual_collection.sql
```

### `public.releases`

Proposed fields:

- `id uuid primary key default gen_random_uuid()`.
- `created_by uuid references public.profiles(id) on delete set null`.
- `source text not null default 'manual'`.
- `artist text not null`.
- `title text not null`.
- `release_year int`.
- `label text`.
- `catalog_number text`.
- `country text`.
- `format text`.
- `provider text`.
- `provider_release_id text`.
- `provider_master_id text`.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.

Proposed constraints:

- `source = 'manual'` for Milestone 3 rows.
- Manual rows must have provider fields null.
- `artist = btrim(artist)` and length `1..160`.
- `title = btrim(title)` and length `1..200`.
- Optional string fields are either null or trim-normalized/nonblank within
  length limits.
- `release_year is null or release_year between 1900 and 2100`.

Do not persist `decade`.

### `public.collection_items`

Proposed fields:

- `id uuid primary key default gen_random_uuid()`.
- `user_id uuid not null references public.profiles(id) on delete cascade`.
- `release_id uuid not null references public.releases(id) on delete restrict`.
- `source text not null default 'manual'`.
- `added_at timestamptz not null default now()`.
- `created_at timestamptz not null default now()`.

Proposed constraints:

- `source = 'manual'` for Milestone 3 rows.
- No unique constraint on `(user_id, release_id)` so multiple physical copies
  can be represented.

### Indexes

Recommended initial indexes:

- `collection_items (user_id, added_at desc, id desc)`.
- `collection_items (user_id, release_id)`.
- `collection_items (release_id)`.
- `releases (created_by)`.
- Optional simple btree indexes on `releases (lower(artist))` and
  `releases (lower(title))` can be deferred until search/filter work unless DB
  tests or query plans show a need now.

## Proposed RLS And Privileges

Follow the Milestone 2 pattern:

- Enable RLS on both tables.
- Revoke all table privileges from `anon` and `authenticated` first.
- Grant only required table/column privileges.
- Use policies scoped to `to authenticated`.
- Do not rely on Supabase defaults.

### Releases

Proposed grants:

- `anon`: no access.
- `authenticated`: `select`.
- `authenticated`: `insert` only on manually writable metadata columns, not
  provider IDs, timestamps, or immutable ownership/provenance columns if DB
  defaults can set them safely.
- `authenticated`: `update` only on manual metadata columns:
  `artist`, `title`, `release_year`, `label`, `catalog_number`, `country`,
  `format`.
- `authenticated`: no delete.

Proposed policies:

- SELECT when:
  - `created_by = auth.uid()`, or
  - a `collection_items` row owned by `auth.uid()` references the release.
- INSERT when:
  - row is manual,
  - current user is the creator via default/check,
  - provider fields are null.
- UPDATE when:
  - row is manual,
  - `created_by = auth.uid()`,
  - provider/source/provenance fields are unchanged,
  - no other user's `collection_items` row references the release.

### Collection Items

Proposed grants:

- `anon`: no access.
- `authenticated`: `select`.
- `authenticated`: `insert` on `release_id` if `user_id` and source can be set
  safely by defaults.
- `authenticated`: no update in Milestone 3.
- `authenticated`: `delete`.

Proposed policies:

- SELECT when `user_id = auth.uid()`.
- INSERT when:
  - `user_id = auth.uid()`,
  - source is manual,
  - referenced release is allowed for the current manual add flow.
- DELETE when `user_id = auth.uid()`.

The implementation must ensure a user cannot insert a collection item pointing
at another user's hidden manual release merely by guessing its UUID.

## Helper Functions

Expected helper needs:

- `updated_at` trigger for `public.releases` because release metadata can be
  edited.

Recommendation:

- Reuse the existing `private` schema convention.
- Add a minimal trigger helper only if required.
- If a helper uses `SECURITY DEFINER`, it must use `set search_path = ''`,
  fully-qualified objects, and explicit `execute` revokes from `public`, `anon`,
  and `authenticated`.
- Do not add a `SECURITY DEFINER` add-record RPC solely for convenience.

## Atomic Manual Add Flow

Recommended service behavior:

1. Normalize and validate input in the browser for UX.
2. Insert a `public.releases` manual row.
3. Insert a `public.collection_items` row referencing the returned release ID.
4. If step 2 fails, show a recoverable add error.
5. If step 3 fails, show a recoverable add error and attempt safe cleanup only
   if the final approved SQL supports deleting the just-created unreferenced
   manual release.
6. If cleanup is unavailable or fails, leave the orphan release row; it is not
   collection ownership and should not appear in the collection list.

Reasoning:

- Ordinary RLS/table operations keep the browser authorization model visible and
  testable.
- A transaction RPC can be considered later if the human rejects orphan manual
  releases, but it should not be introduced without approval.
- A Netlify Function is not justified for this milestone.

## React Implementation Plan

### Types And Service

Add `src/lib/supabase/collection.ts` with:

- `ManualReleaseInput`.
- `CollectionItemWithRelease`.
- `normalizeManualReleaseInput`.
- `validateManualReleaseInput`.
- `loadCollection`.
- `addManualCollectionItem`.
- `updateManualRelease`.
- `deleteCollectionItem`.

The service should:

- Keep Supabase query details out of presentation components.
- Return typed domain values.
- Throw safe errors for UI display.
- Normalize blank optional strings to `null`.
- Never use service-role credentials.

Update `src/lib/supabase/client.ts` type definitions for `releases` and
`collection_items`.

### Components

Add `src/collection/CollectionPanel.tsx`:

- Loads collection for authenticated user.
- Shows loading, empty, error, and success states.
- Hosts add/edit/delete interactions.
- Handles recoverable action errors without leaving the protected shell.

Add `src/collection/CollectionForm.tsx`:

- Used for add and edit.
- Validates required fields and year format/range.
- Trims string input before submit.

Add `src/collection/CollectionItemCard.tsx`:

- Displays one owned record.
- Provides edit/remove controls.

Update `src/App.tsx`:

- Keep existing auth/profile boundary.
- Render collection workflow in the authenticated shell.
- Preserve sign-out and profile display-name capability without adding a router.

## UI Behavior

Keep the UI compact and utilitarian:

- No landing page.
- No final collection browsing polish.
- No search/filter controls yet.
- Clear labels for manual fields.
- Buttons for add/save/cancel/remove/sign out.
- Recoverable error messages stay near the relevant form/action.
- Deleting should require a simple confirmation to avoid accidental removal.

## Testing Plan

### Database Tests

Create:

```text
supabase/tests/database/collection_rls.test.sql
```

Tests should verify:

- `public.releases` exists.
- `public.collection_items` exists.
- Primary keys exist.
- Foreign keys and delete behavior match the plan.
- RLS is enabled on both tables.
- Expected policies exist and broad unintended policies do not.
- `anon` has no access to either table.
- `authenticated` grants are column-limited.
- User A can insert/select/delete User A collection items.
- User A cannot select/delete User B collection items.
- User A cannot insert a collection item for User B.
- User A cannot attach a collection item to User B's hidden manual release.
- User A can edit allowed metadata on User A manual release.
- User A cannot update source/provider/ownership/timestamp fields.
- User A cannot edit User B release metadata.
- User A cannot edit a release referenced by another user's collection item.
- Direct release delete is denied to authenticated users.
- Duplicate collection items for the same user/release are allowed.
- Deleting one duplicate leaves the other.
- Invalid artist/title/year/optional-string metadata is rejected by database
  constraints.
- `decade` is not a persisted column.

Retain the existing profile tests.

### Frontend Tests

Add or extend tests to cover:

- Authenticated empty collection state.
- Loading existing collection.
- Add success.
- Add recoverable error.
- Edit success.
- Edit recoverable error.
- Delete success.
- Delete recoverable error.
- Required artist/title validation.
- Release-year validation.
- Session/auth boundary behavior.

Mock the Supabase service boundary for component tests where practical. Do not
require a live Supabase stack for normal React tests.

### General Verification Commands

Before claiming implementation complete, run:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
npm audit --omit=dev
npm audit --json
git diff --check
```

Also run secret/scope scans verifying:

- No service-role key or secret was committed.
- No real `.env` was committed.
- No local Supabase runtime artifacts were staged.
- No catalog/API/AI/listening/rating/favorite/note code was introduced.

## Human Runtime Verification Plan

After implementation and automated verification, the human should verify:

- Sign in with a local test account.
- See the collection screen.
- See an empty state if no records exist.
- Add a record manually.
- Refresh and confirm persistence.
- Edit the record.
- Refresh and confirm edit persistence.
- Add another record.
- Remove one record.
- Confirm the remaining item is correct.
- Sign out and sign in again.
- Confirm collection persistence.
- Check `/api/health`.

Human runtime verification should be recorded separately in `docs/verification.md`
after it actually happens.

## Verification Evidence To Record

After implementation, update `docs/verification.md` with:

- Date.
- Branch.
- Implementation commits.
- Migration filename.
- Schema summary.
- RLS/grant summary.
- Frontend test count.
- DB test count.
- Typecheck/lint/build results.
- Supabase reset/test/lint results.
- Audit results and triage.
- Secret/scope scan results.
- Codex local runtime checks.
- Known gaps.
- Human runtime verification status.

## Implementation Commit Strategy

Suggested commits after approval:

1. `docs: approve milestone 3 implementation`
   - status metadata only.
2. `db: add manual collection schema and RLS`
   - migration and database tests.
3. `feat: add manual collection workflow`
   - services, React components, frontend tests.
4. `docs: record milestone 3 verification`
   - verification evidence and implemented status after checks pass.

Do not squash or rewrite existing milestone history.

## Rollback And Recovery

- If implementation is wrong before merge, add corrective commits on the branch.
- If a migration is wrong before it reaches a shared remote project, create a
  corrected migration during review rather than using dashboard-only changes.
- If a migration reaches a shared remote Supabase project and must be reversed,
  add a deliberate rollback migration; do not mutate schema manually through the
  dashboard.
- If release ownership semantics are rejected in review, stop and revise the
  spec/plan before changing SQL.

## Known Risks

- Release metadata edit rules are the main security risk: loose policies could
  let one user change data another user sees.
- Ordinary two-step browser insert can leave orphan manual releases if the
  collection item insert fails.
- Duplicate copies may be visually ambiguous until later ownership fields or
  detail views exist.
- Deferring genres/styles means Milestone 3 manual records will not yet support
  genre/style filtering.
- Future catalog normalization must deliberately reconcile manual rows rather
  than assuming they are canonical.

## Human Decisions Required Before Implementation

- Approve or revise the recommended manual release ownership/edit model.
- Approve allowing duplicate collection items for the same user/release.
- Approve deferring release orphan cleanup.
- Approve ordinary browser Supabase inserts with RLS and best-effort cleanup
  rather than adding a transaction RPC/helper.
- Approve the proposed minimal release fields.
- Approve deferring `genres`, `styles`, and `cover_url` from Milestone 3.
- Approve denying normal `collection_items` UPDATE in Milestone 3.
- Approve the proposed RLS/privilege matrix.
- Approve whether the authenticated UI should show collection and profile
  controls on one screen for Milestone 3.
- Grant explicit implementation approval for Milestone 3.

## Stop Point

Stop here until human review and explicit implementation approval.

Do not install dependencies, create migrations, write SQL, create collection
components, alter Supabase types, or implement Milestone 3 from this plan until
the human explicitly approves implementation.
