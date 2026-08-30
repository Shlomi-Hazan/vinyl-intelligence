# 0008 Milestone 7 Ratings / Favorites / Notes Specification

Status: approved and in implementation

Milestone: 7 - Ratings / Favorites / Notes (personal preference signals)

Date: 2026-08-31

Branch: `claude/milestone-7-ratings-favorites-notes`

Baseline: `3583900cc19dae9db9a2e6f37846de7a8af5a665` (Milestone 6 merge on `main`)

Approved: 2026-08-31, with the four Open Questions resolved and a partial-patch
correction to the update helper - see "Open Questions Requiring Human Approval"
and "Client Behaviour".

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
  column-scoped `authenticated` `UPDATE` grant + one RLS `UPDATE` policy. No
  `updated_at` column (approved decision A).
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

One new forward migration, `20260831120000_add_collection_item_signals.sql`.
No historical migration is edited. **No `updated_at` column, no trigger, no new
index** (approved decision A + the deferred-index decision).

```sql
alter table public.collection_items
  add column rating smallint,
  add column is_favorite boolean not null default false,
  add column notes text;

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
```

- `authenticated` currently has `select`, `insert (release_id)`, `delete` on
  `collection_items` and **no** `UPDATE`. This migration adds `UPDATE` on
  exactly `rating`, `is_favorite`, `notes` - not `user_id`, `release_id`,
  `added_at`, `created_at`, `id`.
- `service_role` is not touched. `anon` is not touched (still no access). No
  Netlify Function is involved.
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
  - `loadCollection` selects `rating, is_favorite, notes` alongside `id,
    added_at, created_at`.
  - New `updateCollectionItemPersonalSignals(client, collectionItemId, patch)`
    with **partial-patch** semantics (approved correction):
    ```ts
    type CollectionItemPersonalSignalsPatch = {
      rating?: number | null
      is_favorite?: boolean
      notes?: string | null
    }
    ```
    The helper: requires at least one of the three supported keys; rejects any
    other key; normalizes and validates **only** the keys present
    (`rating` -> `null` or integer 1..5, else throw; `notes` -> trim, empty ->
    `null`, else <= 1000 chars or throw; `is_favorite` -> boolean or throw);
    builds an `update` payload containing **only** the present keys; never
    includes `id` / `user_id` / `release_id` / `added_at` / `created_at`; then
    `client.from('collection_items').update(payload).eq('id', collectionItemId)
    .select('id, rating, is_favorite, notes').single()` and returns the saved
    `{ id, rating, is_favorite, notes }` for a safe state merge; surfaces
    Supabase/PostgREST errors.
  - `updateManualRelease` is not modified and is not coupled to this helper.

Partial-patch semantics prevent the state-clobber / implicit-save class of bug:
toggling Favorite while a note draft is unsaved sends `{ is_favorite }` only and
does **not** persist the note; saving a note sends `{ notes }` only and does not
touch Favorite or Rating; no signal mutation ever writes another signal from
stale local state.

## Loading / Saving Behaviour

- Load: the three signals arrive with the normal `loadCollection` and are held
  in `CollectionPanel`'s `items` state.
- Save: a small `CollectionItemPersonalControls` component (rendered by
  `CollectionItemCard` for every item) holds local `rating` / `is_favorite` /
  `noteDraft` state seeded from the item.
  - Favorite change calls the helper with `{ is_favorite: next }` only; rating
    change calls `{ rating: next }`; "Clear rating" calls `{ rating: null }`.
    These persist immediately (optimistic); on success the parent `items` entry
    is merged from the returned saved values; on error the local control
    reverts and an inline error shows.
  - "Save note" calls `{ notes: noteDraft }` only. A note draft is never
    persisted by a favorite or rating change.
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
  existing migrations; `rating` is `smallint` and nullable, `is_favorite` is
  `boolean` NOT NULL default `false`, `notes` is `text` nullable; `rating`
  NULL / 1 / 5 accepted; **`0` and `6` rejected by the rating-range CHECK**
  (the test does not assume `1.5` fails with `23514` - `smallint` coercion may
  intervene before the constraint; a stable direct-SQL fractional case may be
  recorded separately as an observed result but is not a core schema
  assertion); `notes` NULL accepted, 1000-char accepted, 1001-char rejected,
  whitespace-only rejected; `authenticated` has `UPDATE` on `rating` /
  `is_favorite` / `notes` only and NOT on `id` / `user_id` / `release_id` /
  `added_at` / `created_at`; behavioural under `SET LOCAL ROLE authenticated` +
  jwt claims - user A updates own signals; user A's `UPDATE` targeting user B's
  row **affects zero rows** (RLS `USING` filters it; PostgreSQL does not raise);
  user A setting `user_id` to another user is rejected by `WITH CHECK`
  (`SQLSTATE 42501`); user A setting `release_id` is rejected because there is
  no column grant (`SQLSTATE 42501`); `anon` cannot read or write
  `collection_items`; existing M2-M6 RLS behaviour intact; existing suites pass
  on a clean reset.
- **Client** (`collection.test.ts`): `loadCollection` selects and maps
  `rating` / `is_favorite` / `notes` at the **item** level (not under
  `release`); `updateCollectionItemPersonalSignals` with a partial patch sends
  **only** the keys present, scopes with `.eq('id', ...)`, requires at least
  one supported key, rejects an unsupported key, normalizes whitespace-only
  notes to `null`, rejects an over-1000 note / a fractional (`1.5`) or
  out-of-range rating **before any write**, and surfaces Supabase errors.
- **Component** (`CollectionItemPersonalControls` test): controls render for a
  manual item and a catalog item; favorite toggle persists and merges state;
  rating 1..5 persists; "Clear rating" writes `{ rating: null }`; "Save note"
  persists `{ notes }`; whitespace note -> `null`; over-limit note blocked with
  a message; a rejected update reverts the control and shows a recoverable
  error with no "saved" state; a re-render with mocked persisted values shows
  them.
- **State-safety regression** (required, from the approved partial-patch
  correction):
  - A: unsaved note draft + toggle Favorite -> the update payload is
    `{ is_favorite }` only; the note is NOT persisted.
  - B: unsaved note draft + set Rating -> payload is `{ rating }` only; the
    note is NOT persisted.
  - C: existing favorite + rating present, edit + "Save note" -> payload is
    `{ notes }` only; favorite and rating are unchanged.
  - D: sequential favorite then rating updates each send a single-key payload
    and merge correctly into the parent item state; no full-object write.

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

Resolved with the human on 2026-08-31:

1. **`collection_items.updated_at` + touch trigger.** DECISION: **do not add**
   in Milestone 7 - no `updated_at` column, no `touch_collection_item_updated_at`
   function, no signal-update trigger. Nothing in M7 consumes such a timestamp;
   adding it now is speculative. Milestone 9 may add it if an actual query
   requires it.
2. **Note maximum length.** DECISION: **1000 characters** (approved).
3. **Filtering/sorting.** DECISION: favorite-only filtering, rating filtering,
   and rating sorting remain **DEFERRED**. The Milestone 6
   `src/collection/collectionQuery.ts` layer is not modified for these.
4. **Save UX.** DECISION: favorite persists immediately; rating persists
   immediately; notes persist **only** through an explicit "Save note".

Plus an approved design correction: the update helper uses **partial-patch**
semantics, not a full-triple write (see "Client Behaviour" and the state-safety
regression tests).

## Stop Point

Historical pre-implementation gate, satisfied. It read:

> This specification is PLANNED. Do not begin Milestone 7 implementation until
> the human approves this spec and the implementation plan, including the
> answers to the Open Questions above.

The human approved the spec and plan with all four Open Questions resolved and
the partial-patch correction, and directed implementation on this branch.
Current status is at the top of this document.
