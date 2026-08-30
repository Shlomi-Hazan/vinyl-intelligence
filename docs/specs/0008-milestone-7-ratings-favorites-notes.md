# 0008 Milestone 7 Ratings / Favorites / Notes Specification

Status: PLANNED - awaiting human approval before implementation

Milestone: 7 - Ratings / Favorites / Notes (personal preference signals)

Date: 2026-08-31

Branch: `claude/milestone-7-ratings-favorites-notes`

Baseline: `3583900cc19dae9db9a2e6f37846de7a8af5a665` (Milestone 6 merge on `main`)

## Intent

The authenticated owner of a collection item can attach three personal
preference signals to a record they own - a 1..5 star **rating**, a
**favorite** flag, and a plain-text **note** - and those signals persist and
reload. They are per owned collection entry, so two users who own the same
shared catalog release keep independent ratings, favorites, and notes.

Milestone 7 contains **no AI behaviour**: no OpenRouter, no MusicBrainz, no new
external API, no `model_calls`, no recommendation logic, no listening history.
Its only purpose is to create trustworthy structured preference inputs that the
Milestone 9 curator can later use as grounded facts.

## User Outcome

1. Open the collection. Every owned record - manually entered,
   MusicBrainz-catalog-added, or photo-recognition-confirmed - shows compact
   personal controls.
2. Click the favorite toggle: it flips and persists.
3. Click a star (1..5): the rating is set and persists; clicking "Clear rating"
   returns it to unrated.
4. Type a note (<= 1000 chars) and press "Save note": it persists; an empty or
   whitespace-only note is stored as "no note".
5. Refresh or sign out and back in: the rating, favorite, and note are still
   there.
6. If a save fails, the control shows a recoverable error and does **not**
   display a false "saved" state.

## In Scope

- `public.collection_items.rating` (nullable `smallint`, 1..5, NULL = unrated),
  `is_favorite` (`boolean not null default false`), `notes` (nullable `text`,
  <= 1000 chars, trimmed, empty -> NULL).
- One forward migration adding those columns + CHECK constraints + a
  column-scoped `authenticated` `UPDATE` grant + one RLS `UPDATE` policy, and
  `collection_items.updated_at` + a touch trigger (see Open Questions).
- The existing RLS-authoritative browser collection load returns the three
  signals at the collection-item level.
- One ownership-safe client helper,
  `updateCollectionItemPersonalSignals(client, collectionItemId, signals)`,
  separate from `updateManualRelease`.
- A compact per-item personal-controls UI (favorite toggle, 1..5 rating with a
  clear action, notes textarea + Save), usable for every owned record type,
  independent of the manual-release edit flow.
- pgTAP for the migration/constraints/grants/RLS; client + component tests.
- Human runtime verification (later, small, one test at a time).

## Out of Scope (deferred)

- Any filtering or sorting by favorite or rating. Not required for M7
  acceptance; it is a small later addition on top of the Milestone 6
  deterministic client query (`src/collection/collectionQuery.ts`) and is
  deferred to that point.
- `(user_id, is_favorite)` / `(user_id, rating)` indexes. There is no M7
  server-side query that would use them (see "Index decision"). Deferred to
  Milestone 9 if the curator introduces real candidate queries.
- Half-star / fractional ratings, floating-point ratings, tags, a separate
  `preferences`/`ratings` table, a Netlify Function for saving signals, an
  album-detail page.
- Any use of the signals by the AI curator (Milestone 9+), listening history
  (Milestone 8+), HTML notes / rich text, note history/versioning.
- Backfilling or migrating any existing data (there is nothing to backfill).
- Hosted Supabase migration and production deployment (deployment milestone).

## Personal-data Ownership Boundary

The signals live on `public.collection_items`, **not** `public.releases`.
`releases` is shared release/catalog metadata; a rating/favorite/note describes
one user's relationship to one owned entry. Two `collection_items` pointing at
the same `release_id` (same user's duplicate copies, or two different users)
each carry their own independent `rating` / `is_favorite` / `notes`.

## Rating Semantics

- Type: `smallint`, nullable.
- Valid stored values: `NULL` or an integer `1, 2, 3, 4, or 5`.
- `NULL` means "unrated" and is the initial state for every collection item.
- The UI offers exactly the integers 1..5 plus an explicit "Clear rating"
  action that writes `NULL`. There is no other way to produce an invalid value
  from the UI.
- The client helper rejects anything that is not `null` or an integer in
  `1..5` before writing; the DB CHECK constraint is the backstop.
- No 0, no 6+, no decimals, no half-stars.

## Favorite Semantics

- Type: `boolean`, `NOT NULL`, `DEFAULT false`.
- Every collection item starts `false`.
- The UI toggle flips it; the change persists on click (optimistic UI with
  rollback on error).

## Note Semantics

- Type: `text`, nullable.
- Plain text only. Rendered by normal escaped React text interpolation
  (`{item.notes}`); **never** `dangerouslySetInnerHTML`, and **no** HTML
  sanitizer dependency. "Sanitized in UI" means "treated and rendered as plain
  text, not HTML".
- The client trims the input before persistence; an empty or whitespace-only
  result is stored as `NULL`.
- Maximum length: **1000 characters** (after trim). Enforced client-side before
  the write and by a DB CHECK constraint. The textarea also sets
  `maxLength={1000}`.
- Persisted via an explicit "Save note" action (not on every keystroke).
- A saved note reloads with the collection.

## Database Implications

One new forward migration, `2026083100xxxx_add_collection_item_signals.sql`.
No historical migration is edited.

```sql
alter table public.collection_items
  add column rating smallint,
  add column is_favorite boolean not null default false,
  add column notes text,
  add column updated_at timestamptz not null default now();  -- see Open Question 1

alter table public.collection_items
  add constraint collection_items_rating_range
    check (rating is null or rating between 1 and 5),
  add constraint collection_items_notes_clean
    check (
      notes is null
      or (notes = btrim(notes) and char_length(notes) between 1 and 1000)
    );

-- Least privilege: exactly the three personal-signal columns, nothing else.
grant update (rating, is_favorite, notes)
  on public.collection_items
  to authenticated;

create policy "Users can update their own collection item signals"
  on public.collection_items
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Only if Open Question 1 is "add updated_at":
create trigger touch_collection_item_updated_at_before_signal_update
before update of rating, is_favorite, notes on public.collection_items
for each row
when (
  old.rating is distinct from new.rating
  or old.is_favorite is distinct from new.is_favorite
  or old.notes is distinct from new.notes
)
execute function private.touch_collection_item_updated_at();  -- new security-definer fn, mirrors private.touch_release_updated_at
```

- `authenticated` currently has `select`, `insert (release_id)`, `delete` on
  `collection_items` and **no** `UPDATE`. This migration adds `UPDATE` on
  exactly `rating`, `is_favorite`, `notes` - not `user_id`, `release_id`,
  `added_at`, `created_at`, `id`.
- `service_role` is not touched. No Netlify Function is involved.
- The `notes = btrim(notes)` check pairs with the client's trim-then-null
  normalization, matching the repository's existing `*_clean` constraint style.

## RLS / Grants

- Existing `collection_items` policies (own-row `select`, own-row `insert` with
  the manual-release check, own-row `delete`) are unchanged.
- New `for update` policy: `using (user_id = auth.uid())` and
  `with check (user_id = auth.uid())`. `USING` blocks updating another user's
  row; `WITH CHECK` blocks moving a row to another user.
- `release_id` cannot be changed through this path because there is no
  `update (release_id)` column grant (and the policy would also not care - the
  grant is the hard stop).
- `anon` still has no access to `collection_items`.

## Client Behaviour

- `src/lib/supabase/client.ts`: `CollectionItem` gains `rating: number | null`,
  `is_favorite: boolean`, `notes: string | null`. `collection_items` `Update`
  type allows exactly those three.
- `src/lib/supabase/collection.ts`:
  - `CollectionItemWithRelease` gains `rating`, `is_favorite`, `notes` at the
    **item** level (not under `release`).
  - `loadCollection` selects `rating, is_favorite, notes` (and `updated_at` if
    added) alongside `id, added_at, created_at`.
  - New `updateCollectionItemPersonalSignals(client, collectionItemId, {
    rating, is_favorite, notes })`: normalizes (`notes` trim -> `null` when
    empty), validates (`rating` is `null` or integer 1..5; trimmed `notes`
    length <= 1000) and throws a friendly `Error` before any write; then
    `client.from('collection_items').update({...}).eq('id', collectionItemId)
    .select('id, rating, is_favorite, notes').single()` and surfaces
    Supabase/PostgREST errors.
  - `updateManualRelease` is not modified and is not coupled to this helper.

## Loading / Saving Behaviour

- Load: the three signals arrive with the normal `loadCollection` and are held
  in `CollectionPanel`'s `items` state.
- Save: a small `CollectionItemPersonalControls` component (rendered by
  `CollectionItemCard` or `CollectionPanel` for every item) holds local
  `rating` / `is_favorite` / `notes` state seeded from the item.
  - Favorite and rating changes call `updateCollectionItemPersonalSignals`
    immediately with the new full triple; on success the parent `items` entry
    is updated in place; on error the local state reverts and an inline error
    shows.
  - Notes: local edits are not persisted until "Save note" is pressed;
    success/error handled the same way.
- Personal signals are per collection item, so no cross-copy synchronization is
  needed (unlike manual-release edits, which fan out to same-release copies).

## Error States

| Case | Handling |
| --- | --- |
| Favorite/rating save fails (network, RLS, DB) | revert the optimistic control to its last-saved value; inline recoverable message; never show "saved" |
| Note save fails | keep the edited text in the textarea; inline recoverable message; the persisted value is unchanged |
| Note over 1000 chars (after trim) | blocked client-side before the write with a message; textarea `maxLength` also caps typing; DB CHECK is the backstop |
| Invalid rating reaches the helper | helper throws before writing (not reachable from the UI) |
| Collection load fails | existing recoverable load error + Retry (unchanged) |

## Accessibility

- Favorite: `<button aria-pressed={isFavorite} aria-label="Favorite this record">`.
- Rating: five `<button>`s, each `aria-label="Rate N star(s)"` and
  `aria-pressed` for the currently selected value, plus a "Clear rating"
  button shown only when a rating is set. Keyboard-operable as ordinary
  buttons.
- Notes: a `<label for>`-associated `<textarea>`, a live character count with
  `aria-live="polite"`, and a "Save note" button.
- Inline error messages use `role="alert"` and sit next to their control.
- No colour-only state: favorite and rating states have text/`aria` state, not
  just colour.

## Acceptance Criteria

- A rating of 1..5 set on any owned record persists and reloads; clearing it
  returns the stored value to `NULL` and reloads as unrated.
- A favorite toggle persists and reloads for any owned record type.
- A note <= 1000 chars persists and reloads; a whitespace-only note is stored
  and reloads as "no note"; a note over 1000 chars is rejected before the
  write.
- Personal controls work for manual, catalog-added, and
  photo-recognition-confirmed records, independent of the manual-release edit
  flow.
- User A can update only their own `rating` / `is_favorite` / `notes`
  (verified by pgTAP). User A cannot update User B's item, cannot change
  `user_id`, and cannot change `release_id` through the M7 path.
- `anon` has no access to `collection_items`.
- Notes are rendered as escaped plain text; no `dangerouslySetInnerHTML`, no
  sanitizer dependency added.
- A failed save shows a recoverable error and no false "saved" state.
- Zero OpenRouter calls, zero MusicBrainz calls, zero `model_calls` rows, no
  new Netlify Function.
- Existing Milestone 1-6 automated tests and manual flows still pass.

## Automated Verification

Agent-run / local; no external calls:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
npm audit --omit=dev
```

Plus a branch-diff secret/scope scan.

Focused tests to add:

- **pgTAP** (`collection_item_signals.test.sql`): migration applies after all
  existing migrations; `rating` / `is_favorite` / `notes` columns exist with
  the right types and defaults (`is_favorite` NOT NULL default `false`);
  `rating` NULL / 1 / 5 accepted, `0` / `6` / non-integer rejected (`23514`);
  `notes` NULL accepted, 1000-char accepted, 1001-char rejected, whitespace-only
  rejected; `authenticated` has `UPDATE` on `rating` / `is_favorite` / `notes`
  only and NOT on `user_id` / `release_id` / `added_at` / `created_at` / `id`;
  behavioural under `SET LOCAL ROLE authenticated` + jwt claims - user A updates
  own signals; user A's update of user B's row is a no-op / blocked; user A
  cannot set `user_id` to another user (WITH CHECK); user A cannot set
  `release_id` (no grant); `anon` cannot read or write `collection_items`;
  `updated_at` bumps on a signal change (if added); existing suites still pass
  on a clean reset.
- **Client** (`collection.test.ts`): `loadCollection` selects and maps
  `rating` / `is_favorite` / `notes` at the item level (not under `release`);
  `updateCollectionItemPersonalSignals` sends exactly those three fields,
  scopes with `.eq('id', ...)`, normalizes whitespace-only notes to `null`,
  rejects an over-1000 note and an out-of-range rating before any write, and
  surfaces Supabase errors.
- **Component** (`CollectionPanel.test.tsx` / a personal-controls test):
  controls render for a manual item and a catalog item; favorite toggle
  persists and updates state; rating 1..5 persists; "Clear rating" writes
  `null`; "Save note" persists; whitespace note -> `null`; over-limit note
  blocked with a message; a rejected update reverts the control and shows a
  recoverable error with no "saved" state; a re-render with mocked persisted
  values shows them.

## Human Runtime Plan (later - not part of this planning step)

Local app + local Supabase, one test at a time:

1. Favorite a record; refresh; still favorited.
2. Rate a record 4 stars; refresh; still 4. Clear the rating; refresh; unrated.
3. Add a note; refresh; note still there. Clear the note; refresh; gone.
4. Repeat 1-3 on a MusicBrainz-catalog-added record.
5. Ownership / cross-user RLS is covered by pgTAP, not browser gymnastics.

Distinguish agent-run automated evidence from human-observed evidence in
`docs/verification.md`. Do not claim production verification.

## Index Decision

The old roadmap (`docs/plans/001-initial-project-plan.md`) and
`docs/data-model.md` list `(user_id, is_favorite)` and `(user_id, rating)`
indexes. **Milestone 7 deliberately adds neither.** M7 loads the owned
collection through the existing `(user_id, added_at desc, id desc)` path and
manipulates the signals in memory in the browser; there is no `WHERE
is_favorite` or `ORDER BY rating` query issued to Postgres. A speculative index
here is write overhead with no read to serve. These indexes are deferred to
**Milestone 9**, to be added (if measurement justifies them) alongside the
curator's first real server-side candidate queries over `collection_items`.

## Open Questions Requiring Human Approval

1. **`collection_items.updated_at` + touch trigger.** Recommended: add it. It
   is small (one column, one security-definer trigger mirroring
   `private.touch_release_updated_at`), preserves auditability of when a
   personal signal last changed, and gives Milestone 9 a cheap "recently
   rated / recently favorited" ordering key. The alternative is to defer it;
   `collection_items` currently has no `updated_at`.
2. **Note maximum length = 1000 characters.** Confirm, or set a different cap.
3. **Filtering/sorting.** Confirm that favorite-filtering and rating-sorting
   are fully deferred (recommended - smallest slice), rather than adding a
   minimal "Favorites only" toggle now.
4. **Save UX.** Confirm favorite + rating persist immediately (optimistic) and
   notes use an explicit "Save note" button, rather than one combined "Save
   personal signals" action for all three.

## Stop Point

This specification is PLANNED. Do not begin Milestone 7 implementation until
the human approves this spec and the implementation plan
(`docs/plans/008-milestone-7-ratings-favorites-notes.md`), including the answers
to the Open Questions above.
