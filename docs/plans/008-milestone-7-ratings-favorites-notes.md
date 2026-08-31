# 008 Milestone 7 Ratings / Favorites / Notes Implementation Plan

Status: implemented and verified locally (automated + focused review + human
runtime PASS); merged to `main` in PR #7. Not deployed.

Milestone: 7 - Ratings / Favorites / Notes

Date: 2026-08-30

Approved: 2026-08-30 (four Open Questions resolved; partial-patch helper
correction)

Human runtime verification: 2026-08-30 (PASS)

Branch: `claude/milestone-7-ratings-favorites-notes`

Baseline: `3583900cc19dae9db9a2e6f37846de7a8af5a665` (Milestone 6 merge on `main`)

Specification: `docs/specs/0008-milestone-7-ratings-favorites-notes.md`

## Approved Decisions

- A. **No `collection_items.updated_at`** in Milestone 7 - no column, no
  trigger, no function. Speculative; Milestone 9 may add it if a query needs it.
- B. Note maximum = **1000 characters**.
- C. Favorite/rating browse features (favorite filter, rating filter, rating
  sort) remain **deferred**; `collectionQuery.ts` is not modified.
- D. Save UX: favorite + rating persist immediately; notes only via "Save note".
- Correction: `updateCollectionItemPersonalSignals` uses **partial-patch**
  semantics (`{ rating? , is_favorite? , notes? }`), writing only the keys
  present, so one signal mutation cannot persist an unsaved note or clobber
  another signal from stale state. Required state-safety regression tests A-D.

## Current Repository Baseline

- `public.collection_items` columns today: `id`, `user_id`
  (`default auth.uid()`), `release_id`, `added_at`, `created_at`. **No**
  `updated_at`, `rating`, `is_favorite`, `notes`.
- `collection_items` grants to `authenticated`: `select` (all columns),
  `insert (release_id)`, `delete`. **No `UPDATE` grant.**
- `collection_items` RLS: own-row `select`; own-row `insert` (with a
  manual-release existence check); own-row `delete`. **No `UPDATE` policy.**
- `collection_items` indexes: `(user_id, added_at desc, id desc)`,
  `(user_id, release_id)`, `(release_id)`.
- `src/lib/supabase/client.ts` `CollectionItem` = `{ id, user_id, release_id,
  added_at, created_at }`; the `Database` type's `collection_items.Update` is
  `Record<string, never>` (no updatable columns).
- `src/lib/supabase/collection.ts`: `loadCollection` selects `id, added_at,
  created_at` + a joined `release:releases!inner (...)`;
  `CollectionItemWithRelease = Pick<CollectionItem, 'id' | 'added_at' |
  'created_at'> & { release: Pick<Release, ...> }`; `addManualCollectionItem`,
  `updateManualRelease`, `deleteCollectionItem`.
- `src/collection/CollectionPanel.tsx`: loads the collection, holds `items`
  state, `sortCollection`, Milestone 6 `filters`/`sort` state + controls,
  renders `CollectionForm` (add), `CollectionLibraryControls`, and a list of
  `CollectionItemCard` (+ inline manual edit form). Already takes `userId`.
- `src/collection/CollectionItemCard.tsx`: title, artist, a metadata line, a
  genres line, and Edit / Remove buttons.
- `private.touch_release_updated_at()` (security definer, `set search_path =
  ''`) + `touch_release_updated_at_before_metadata_update` trigger is the
  repository pattern for an `updated_at` bump on selective column changes.

Nothing about ratings, favorites, or notes exists yet in schema, types, or UI.

## Design Decisions

### 1. Signals on `collection_items`, not `releases`

Per the approved ownership direction. Each `collection_items` row is one user's
owned entry; `releases` is shared. No fields are duplicated onto `releases`.

### 2. Minimal forward migration

`rating smallint` (nullable, CHECK 1..5), `is_favorite boolean not null default
false`, `notes text` (nullable, CHECK trimmed + 1..1000 chars). One
column-scoped `grant update (rating, is_favorite, notes)` and one `for update`
RLS policy. **No `updated_at`, no trigger, no function, no index** (approved
decision A + deferred-index decision).

### 3. No Netlify Function

The browser Supabase client, RLS, and column grants are the authority. Saving a
rating is `client.from('collection_items').update({...}).eq('id', ...)`.

### 4. No new indexes

See the spec "Index decision" - deferred to Milestone 9.

### 5. Partial-patch client helper, decoupled from `updateManualRelease`

`updateCollectionItemPersonalSignals(client, collectionItemId, patch)` in
`collection.ts`, where `patch` is
`{ rating?: number | null; is_favorite?: boolean; notes?: string | null }`.
It requires at least one supported key, rejects any other key, normalizes and
validates only the present keys, `update`s a payload of only the present keys
(never `id` / `user_id` / `release_id` / `added_at` / `created_at`), scopes with
`.eq('id', collectionItemId)`, and returns the saved
`{ id, rating, is_favorite, notes }`. It never touches `releases` and is never
called by the manual-release edit path.

### 6. Compact per-item UI

A new `src/collection/CollectionItemPersonalControls.tsx`, rendered by
`CollectionItemCard` (or `CollectionPanel`) for **every** item regardless of
`release.source`. Favorite toggle + 1..5 stars + "Clear rating" +
notes `<textarea>` + "Save note". Local state seeded from the item; favorite
and rating persist on interaction (optimistic, revert on error); notes persist
on "Save note". On success the parent updates that `items` entry in place. No
card redesign - a `.collection-card-personal` block and a small style rule.

### 7. Notes are plain text

Rendered `{item.notes}` (escaped by React). No `dangerouslySetInnerHTML`, no
sanitizer dependency. Client trims and maps empty -> `null`; `maxLength={1000}`
on the textarea; helper + DB CHECK enforce the bound.

### 8. Filtering / sorting deferred

Not in M7. If later wanted, a `favoritesOnly` boolean and a `rating-desc` sort
are one small addition each to `src/collection/collectionQuery.ts` and its
tests. Documented as deferred, not a defect.

## Files / Components Affected

```
supabase/migrations/20260831120000_add_collection_item_signals.sql   # NEW
supabase/tests/database/collection_item_signals.test.sql             # NEW (pgTAP)
src/lib/supabase/client.ts             # CollectionItem + rating/is_favorite/notes;
                                       # collection_items.Update allows those 3 columns
src/lib/supabase/collection.ts         # CollectionItemWithRelease + item-level signals;
                                       # loadCollection select; updateCollectionItemPersonalSignals
src/lib/supabase/collection.test.ts    # load mapping + helper tests
src/collection/CollectionItemPersonalControls.tsx   # NEW compact controls
src/collection/CollectionItemCard.tsx  # render the personal controls block
src/collection/CollectionPanel.tsx     # pass a save handler / update items state on success
src/collection/CollectionPanel.test.tsx  # component tests
src/styles.css                         # .collection-card-personal
docs/specs/0008-..., docs/plans/008-...  # status flips at approval / completion
README.md, docs/verification.md, docs/specs/README.md  # status/index, at verification time
```

## Database Implications

- Forward migration only; no historical migration edited.
- `collection_items` gains `rating`, `is_favorite`, `notes`,
  `collection_items_rating_range` and `collection_items_notes_clean` CHECK
  constraints, a column-scoped `authenticated` `UPDATE` grant on exactly those
  three columns, and one `for update` RLS policy (`using` + `with check` on
  `user_id = auth.uid()`). No `updated_at`, no trigger, no index.
- `service_role` untouched. `anon` untouched (still no access).
- Existing `collection_items` policies, grants, indexes, and the
  `releases` / `profiles` / `model_calls` schema are unchanged.
- pgTAP `collection_item_signals.test.sql` per the spec "Automated
  verification".

## External API Implications

**None.** No OpenRouter, no MusicBrainz, no Cover Art Archive, no new provider,
no `model_calls`. Zero network calls beyond the browser Supabase client's own
`update`.

## AI / Model Implications

**None.** No model call. The signals are structured user input that Milestone 9
may later read as grounded facts.

## Security / Privacy Implications

- Ownership stays RLS-authoritative. The new `for update` policy plus the
  column-scoped grant mean `authenticated` can change only their own row's
  `rating` / `is_favorite` / `notes` - not `user_id`, `release_id`, `added_at`,
  `created_at`, `id`, and not any other user's row.
- No service-role key in the browser. No new secret. No new Netlify Function.
- Notes are user-authored plain text, rendered escaped; no HTML execution path.
- `docs/security.md` open question "Are user notes included in recommendation
  context by default?" is a Milestone 9 decision, not M7.

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

Plus the focused tests in the spec, a branch-diff secret/scope scan, and the
human runtime plan. Distinguish agent-run automated evidence from human
evidence in `docs/verification.md`. Do not claim production verification.

## Incremental Implementation Steps (after approval)

1. **Migration + pgTAP.** `20260831120000_add_collection_item_signals.sql` and
   `collection_item_signals.test.sql`. Apply via `supabase db reset`; run
   `supabase test db` (all existing suites must still pass).
2. **TS database types.** Hand-edit `src/lib/supabase/client.ts`:
   `CollectionItem` gains the fields; `collection_items.Update` allows exactly
   `rating` / `is_favorite` / `notes`.
3. **Collection load + update helper.** `CollectionItemWithRelease` +
   item-level signals; `loadCollection` select; `updateCollectionItemPersonalSignals`
   with normalization/validation. Client tests.
4. **Compact UI.** `CollectionItemPersonalControls` + wire-up in
   `CollectionItemCard` / `CollectionPanel` + `styles.css`. Component tests.
5. **Full local verification** (the command block above).
6. **Independent implementation review** - fix any BLOCKER / meaningful MEDIUM.
7. **Focused human runtime** - the five checks in the spec, one at a time.
8. **Pre-PR repository evidence gate** - status sync, contradiction scan,
   secret/scope scan; then open the PR against `main`. Do not merge.

## Pre-PR Repository Evidence Gate

Before opening the Milestone 7 PR: spec/plan status reflect actual approvals;
README current status is accurate (M6 merged, M7 verified); `docs/verification.md`
records only checks that ran and distinguishes automated from human evidence;
the deferred items (favorite/rating filtering-sorting, the two indexes) are
visible and not represented as defects; no future feature is represented as
implemented; no Milestone 8+ work started; historical planning language stays
historical; no secret or real `.env` is staged; the branch contains only
Milestone 7 scope.

## Deadline / Complexity Check

- **Small vertical slice?** Yes: one migration (3 columns, 2 CHECKs, 1 column
  grant, 1 policy - no trigger, no index), one `CollectionItem` type edit, one
  `loadCollection` select edit, one partial-patch helper, one compact control
  component, tests. No new page, no new service, no new dependency.
- **Unnecessary abstraction?** Avoided: no `preferences`/`signals` table, no
  generic "editable field" framework, no Netlify Function, no album-detail
  architecture.
- **Speculative migration field?** None - `updated_at` was rejected (decision
  A).
- **Unnecessary backend function?** None.
- **Premature index?** The favorite/rating indexes - explicitly deferred.
- **Actually M8/M9 scope?** Favorite-filtering / rating-sorting (deferred);
  any curator use of the signals (M9); listening history (M8+).

## Risks / Notes

- Optimistic favorite/rating UI must revert cleanly on a failed save and never
  show a false "saved" state - covered by a focused test.
- The partial-patch helper must send only the mutated key so an unsaved note
  draft is never persisted by a favorite/rating change - covered by the
  state-safety regression tests (A-D).
- Personal signals are per collection item; duplicate copies of the same
  release are independent, which is the intended behaviour (no cross-copy
  fan-out, unlike manual-release edits).

## Stop Point

Historical pre-implementation gate, satisfied. It read:

> This plan is PLANNED. Implementation begins only after the human approves
> this plan, the specification, and the answers to the Open Questions above.

The human approved and directed implementation on this branch with all four
Open Questions resolved (see "Approved Decisions" at the top) and the
partial-patch correction.
