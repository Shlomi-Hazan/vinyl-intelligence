# 0009 Milestone 8 Listening History Specification

Status: implemented and verified (automated verification + focused
implementation review [0 BLOCKER, 0 MEDIUM] + human runtime PASS); merged to
`main` in PR #8 (merge commit `9af8beec701cb108b3ed6de7bdf3962fbf938ee3`). Not
deployed; hosted Supabase migration not applied / not verified.

Milestone: 8 - Listening History

Date: 2026-08-30

Branch: `claude/milestone-8-listening-history`

Baseline: `2affd718481a3c6da745c9f1b99667635a87adff` (Milestone 7 merge on `main`)

Approved: 2026-08-30, with the three Open Questions resolved (below) and two
implementation clarifications:

- **Local event state must stay `listened_at DESC, id DESC` immediately.** After
  a successful "Mark played" the returned event is merged and the local array is
  re-sorted with the same deterministic comparator the database uses, so
  equal-timestamp events order by `id DESC` before any refresh - not only after
  a reload.
- **"Two indexes" means two non-primary-key access-pattern indexes.** The
  `id uuid primary key` gives an automatic PK index; the two Milestone 8
  indexes are `listening_events_user_listened_idx` and
  `listening_events_collection_item_idx`. pgTAP asserts the PK exists, both
  named indexes exist with the right columns/ordering, the deferred
  `(user_id, collection_item_id, ...)` index does **not** exist, and no
  unnecessary extra Milestone 8 index was added - it does **not** assert a total
  index count of two.

## Intent

An authenticated user records that they listened to one of their owned records
("Mark played"). Each click appends one immutable `listening_events` row. From
those rows the app derives, per collection item, a **listening count** and a
**last-listened time**, and shows a reverse-chronological **listening history**.
Everything survives refresh. Milestone 8 contains **no AI**: no OpenRouter, no
MusicBrainz, no `model_calls`, no recommendation logic. It only produces
trustworthy structured listening data that the Milestone 9 curator can later
ground facts on.

## User Outcome

1. Open the collection. Every owned record shows "Mark played", a "Played N
   times" count, and either "Last listened: <local time>" or "Never played".
2. Click "Mark played": exactly one listening event is persisted; the count
   increments and the last-listened time updates without a refresh.
3. A compact "Listening history" section lists events newest-first, each showing
   artist, album/title, and the local listened-at time.
4. Refresh or sign out and back in: counts, last-listened times, and the
   history are all still there.
5. If a save fails, the button shows a recoverable error and the count is **not**
   falsely incremented.

## In Scope

- `public.listening_events` - one immutable row per play: `id`, `user_id`
  (default `auth.uid()`), `collection_item_id`, `listened_at` (default `now()`),
  `created_at` (default `now()`). Nothing else.
- One forward migration: the table, two foreign keys (both `ON DELETE
  CASCADE`), two indexes, RLS on, a column-scoped `INSERT` grant and a `SELECT`
  grant for `authenticated`, and two RLS policies (own-row `SELECT`; own-item
  `INSERT`). No `UPDATE`/`DELETE` grant or policy.
- `listening_events` as the **single source of truth**. Count and last-listened
  are **derived**, never stored on `collection_items`. No counter triggers, no
  materialized aggregates.
- Client: `loadListeningEvents(client)` (RLS-authoritative, reverse
  chronological), `addListeningEvent(client, collectionItemId)` (inserts only
  `collection_item_id`), and one pure `summarizeListening` helper.
- UI: a "Mark played" button + count + last-listened / "Never played" on every
  collection card (manual and provider-backed alike); a compact history section
  inside the existing collection experience.
- pgTAP for schema / FKs / cascade / grants / RLS / immutability; client + pure
  + component tests.
- Human runtime verification (later, small, one test at a time).

## Out of Scope (deferred)

- A `listening_count` or `last_listened_at` column on `collection_items`; any
  aggregate/counter trigger or materialized view.
- Editing or deleting a listening event; any "edit play" / "delete play" UI;
  backdated or manual-timestamp entry.
- A per-listen note (the Milestone 7 personal note already covers annotation);
  track-level listening, duration, location, mood, device, source/provider
  fields, soft-delete columns, `updated_at`.
- Charts, statistics dashboards, streaks, trends, "most played", "forgotten
  gems".
- Pagination of listening history (see "History Load").
- A third `(user_id, collection_item_id, listened_at desc)` index (see "Index
  Decision").
- Any AI-curator use of the data (Milestone 9+), conversational refinement,
  OpenRouter, MusicBrainz, a Netlify Function.
- Hosted Supabase migration, production deployment, production verification.

## Event Source-of-Truth Principle

`public.listening_events` is the only place listening data lives. For each
collection item:

- `listeningCount` = the number of `listening_events` rows for that
  `collection_item_id`.
- `lastListenedAt` = the newest `listened_at` among those rows, or `null` if
  there are none.

Neither value is persisted on `collection_items`. `docs/data-model.md` and
`docs/architecture.md` already establish this direction.

## Event Semantics

- Each row is an immutable fact: *this user played this owned collection item at
  this time*.
- `listened_at` is set once by the `now()` default at insert; there is no
  normal path to change it afterward (no `UPDATE` grant, no `UPDATE` policy).
- Two separate deliberate "Mark played" clicks (after the first request
  completes) are two legitimate events. The UI only guards against
  double-submitting the *same* click while its request is pending.

## Immutable Behaviour

Through the browser Supabase client the authenticated user can only `SELECT`
their own events and `INSERT` an event for an item they own. There is no
`UPDATE` or `DELETE` grant and no `UPDATE`/`DELETE` policy, so `listened_at`
cannot be changed and an event cannot be removed after creation (except by the
`ON DELETE CASCADE` when the owning collection item is deleted).

## Schema (as implemented)

One new forward migration, `20260901120000_add_listening_events.sql` (applied and
verified locally; see `docs/verification.md`). No historical migration is edited.
The DDL below matches the committed migration exactly.

```sql
create table public.listening_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  collection_item_id uuid not null
    references public.collection_items(id) on delete cascade,
  listened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index listening_events_user_listened_idx
  on public.listening_events (user_id, listened_at desc, id desc);

create index listening_events_collection_item_idx
  on public.listening_events (collection_item_id);

alter table public.listening_events enable row level security;

revoke all on table public.listening_events from anon;
revoke all on table public.listening_events from authenticated;

grant select on table public.listening_events to authenticated;
grant insert (collection_item_id) on table public.listening_events to authenticated;

create policy "Users can select their own listening events"
  on public.listening_events
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert listening events for their own collection items"
  on public.listening_events
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.collection_items
      where collection_items.id = listening_events.collection_item_id
        and collection_items.user_id = (select auth.uid())
    )
  );
```

No `note`, no `updated_at`, no other columns. `service_role` is not granted
anything on this table (Milestone 8 has no server-side path). `anon` has no
access.

## FK / Delete Semantics

- `user_id -> profiles(id) ON DELETE CASCADE` (mirrors `collection_items.user_id`).
- `collection_item_id -> collection_items(id) ON DELETE CASCADE`. Milestone 8
  history is scoped to the user's **current** owned collection; if an owned
  item is removed, its listening events are removed with it. No archival /
  orphan-history infrastructure. The existing collection-delete workflow is not
  otherwise changed - `deleteCollectionItem` already deletes the
  `collection_items` row, and the database cascade handles the events. The
  client drops that item's events from local state so the in-memory history
  matches.
- pgTAP asserts: deleting an owned `collection_items` row removes its
  `listening_events` rows.

## Grants

- `authenticated`: `SELECT` (all columns) + `INSERT (collection_item_id)` only.
  No `UPDATE`, no `DELETE`.
- Defaults supply `id`, `user_id = auth.uid()`, `listened_at = now()`,
  `created_at = now()`.
- `anon`: nothing. `service_role`: nothing new. Milestone 7 personal-signal
  permissions and all `releases` RLS are unchanged.

## RLS Policies

- `for select`: `using (user_id = (select auth.uid()))`.
- `for insert`: `with check (user_id = (select auth.uid()) and exists (... the
  collection_item belongs to auth.uid() ...))`. The `exists` subquery over
  `public.collection_items` mirrors the existing `collection_items` INSERT
  policy pattern (which does `exists (select 1 from public.releases ...)`); it
  is not recursive (different table). The explicit
  `collection_items.user_id = auth.uid()` inside the subquery is
  defence-in-depth (it also holds under `collection_items` own RLS).
- No `UPDATE` or `DELETE` policy.

## Index Decision

- **A: `(user_id, listened_at desc, id desc)`** - justified. `loadListeningEvents`
  filters by user (RLS) and orders `listened_at desc, id desc`; this index
  serves that query directly.
- **B: `(collection_item_id)`** - justified by the `ON DELETE CASCADE` on
  `collection_item_id`: when a `collection_items` row is deleted PostgreSQL
  scans `listening_events` for matching rows, and Postgres does not
  auto-index foreign-key columns. A plain index keeps that cascade cheap.
- **Deferred: `(user_id, collection_item_id, listened_at desc)`** (from
  `docs/data-model.md`). Milestone 8 derives per-item count / last-listened in
  the browser from the already-loaded event list, so there is no server-side
  per-`(user, item)` query for this index to serve. Add it in Milestone 9
  only if the curator introduces such a query. Keeping the two justified
  indexes is preferred over the three aspirational ones.
- **Deferred: extending B to `(collection_item_id, listened_at desc, id desc)`**
  - only pays off if Milestone 9 adds a server-side per-item aggregate.

## Client Behaviour

- `src/lib/supabase/client.ts`: new `ListeningEvent` type
  `{ id, user_id, collection_item_id, listened_at, created_at }`;
  `Database.Tables.listening_events` with `Row: ListeningEvent`,
  `Insert: { collection_item_id: string }` (structurally can carry nothing
  else), `Update: Record<string, never>`.
- `src/lib/supabase/collection.ts` (or a small `listeningEvents.ts`):
  - `loadListeningEvents(client): Promise<ListeningEvent[]>` -
    `.from('listening_events').select('id, collection_item_id, listened_at,
    created_at').order('listened_at', { ascending: false }).order('id',
    { ascending: false })`. RLS restricts to the caller's own events.
  - `addListeningEvent(client, collectionItemId): Promise<ListeningEvent>` -
    `.from('listening_events').insert({ collection_item_id: collectionItemId })
    .select('id, collection_item_id, listened_at, created_at').single()`. Sends
    **only** `collection_item_id`; never `user_id`, never `release_id`; relies
    on defaults; surfaces Supabase/PostgREST errors.
  - Neither helper is coupled to `updateManualRelease` or
    `updateCollectionItemPersonalSignals`.

## Derived Count / Last-Listened Behaviour

Pure, deterministic, unit-tested helper in `src/collection/listeningSummary.ts`:

```ts
type ListeningSummary = { count: number; lastListenedAt: string | null }

// order-independent
function summarizeListeningForItem(
  events: ListeningEvent[],
  collectionItemId: string,
): ListeningSummary
```

- `count` = events whose `collection_item_id` matches.
- `lastListenedAt` = the newest `listened_at` among matches (compared as
  `Date` timestamps, not raw string compare), or `null` if none.
- 0 events -> `{ count: 0, lastListenedAt: null }`.
- Different collection items are independent.
- The helper does not care about the input order.

`CollectionPanel` derives each card's summary from its `events` state with
`useMemo`; nothing is persisted on `collection_items`.

## History Load

- `loadListeningEvents(client)` returns the authenticated user's events ordered
  `listened_at DESC, id DESC` (the `id` tie-breaker makes equal-timestamp
  ordering deterministic).
- For the current demo-sized collection/history it is acceptable to load all of
  the user's events into memory. **Pagination is deferred**; a large long-term
  history would need it (a `.range(...)` / cursor on the same ordering), noted
  here as future work.
- The history view resolves each event's artist / album by matching
  `event.collection_item_id` against the already-loaded collection `items` in
  `CollectionPanel` (no extra join). Because `collection_item_id` is
  `ON DELETE CASCADE`, every event always references a current owned item, so
  the match always resolves.

## UI / History Behaviour

- Every `CollectionItemCard` gains a personal-listening block:
  - a "Mark played" button;
  - "Played N times" (N derived; "Played 0 times" / "Never played" when none);
  - "Last listened: <local time>" when `lastListenedAt` is set, otherwise
    "Never played".
- A compact **"Listening history"** section inside `CollectionPanel` (a
  collapsible block below the collection list - no dedicated route): the user's
  events newest-first, each line showing `artist - title - <local listened
  time>`. Empty state: "No plays recorded yet."
- No charts, no statistics, no streaks, no "most played".

## Loading / Saving / Error States

| Case | Handling |
| --- | --- |
| Collection + events load on mount | both fetched (in parallel); an events-load failure shows a recoverable inline message and a Retry, and does not block the collection list |
| "Mark played" click | the button is disabled while its own request is pending (prevents a double-submit of that click); on success one event is appended to local state and the count/last-listened update; on failure an inline `role="alert"` recoverable message is shown and the count is unchanged |
| Two deliberate clicks after the first completes | two legitimate events - no debounce blocks a later real play |
| Owned collection item removed | the DB cascade removes its events; the client also removes them from local `events` state |
| RLS rejects an insert (e.g. not the owner) | surfaced as a recoverable error; no event appears |

## Accessibility

- "Mark played": a `<button>` with a clear label; disabled state while pending
  is conveyed by `disabled` + the label ("Marking...").
- Count and last-listened are plain text next to the button.
- The history section has a heading; its collapse toggle uses a `<button>` with
  `aria-expanded`.
- Error messages use `role="alert"` next to their control.
- Dates are rendered via the browser locale (`toLocaleString`); no colour-only
  state.

## Acceptance Criteria

- A "Mark played" click on any owned record (manual or provider-backed) inserts
  exactly one `listening_events` row and updates the visible count and
  last-listened time without a refresh.
- Count and last-listened are **derived** from `listening_events`; no such
  column exists on `collection_items`.
- The listening history renders the user's events newest-first with artist,
  title, and local time; equal timestamps order deterministically by `id`.
- All values persist across refresh and re-login.
- A pending "Mark played" cannot be double-submitted; a failed save shows a
  recoverable error and does not increment the count.
- Through the browser client, `authenticated` can `SELECT` only their own
  events and `INSERT` only for a collection item they own; `UPDATE` and
  `DELETE` are denied; `anon` has no access (verified by pgTAP).
- Deleting an owned collection item removes its listening events (cascade,
  verified by pgTAP).
- Zero OpenRouter calls, zero MusicBrainz calls, zero `model_calls`, no new
  Netlify Function, no new dependency.
- Existing Milestone 1-7 automated tests and manual flows still pass.

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

- **pgTAP** (`listening_events.test.sql`):
  - schema: table exists; `id uuid` PK default `gen_random_uuid()`;
    `user_id uuid not null` default `auth.uid()`; `collection_item_id uuid not
    null`; `listened_at timestamptz not null` default `now()`;
    `created_at timestamptz not null` default `now()`; no other columns; the FK
    to `profiles(id)` and the FK to `collection_items(id)` exist, both
    `ON DELETE CASCADE`.
  - indexes: the automatic primary-key index exists;
    `listening_events_user_listened_idx` on `(user_id, listened_at desc,
    id desc)` exists with that column order; `listening_events_collection_item_idx`
    on `(collection_item_id)` exists; the deferred
    `(user_id, collection_item_id, listened_at ...)` index does **not** exist;
    no unnecessary extra Milestone 8 index was added. (The test does **not**
    assert a total index count of two.)
  - no speculative `listening_count` / `last_listened_at` / `play_count` /
    `last_played_at` column was added to `collection_items`.
  - privileges: `authenticated` has `SELECT` and `INSERT (collection_item_id)`
    and **not** `INSERT (user_id)` / `INSERT (listened_at)` / `UPDATE` /
    `DELETE`; `anon` has no privilege.
  - behavioural (`SET LOCAL ROLE authenticated` + jwt): User A can insert an
    event for User A's collection item; User A **cannot** insert an event for
    User B's collection item (WITH CHECK -> the actual PostgreSQL behaviour is
    asserted, not assumed); User A sees only User A's events and User B sees
    only User B's; an authenticated `UPDATE listened_at` and an authenticated
    `DELETE` both fail; `anon` `SELECT`/`INSERT` fail.
  - cascade: after inserting events, deleting the owning `collection_items` row
    removes the matching `listening_events` rows.
  - existing M2-M7 suites still pass on a clean reset.
- **Client** (`listeningEvents.test.ts`): `loadListeningEvents` selects the four
  fields and requests `listened_at desc` then `id desc`; `addListeningEvent`
  sends exactly `{ collection_item_id }` and `.eq`-less insert + `.select().single()`;
  an insert error propagates and yields no event object.
- **Pure** (`listeningSummary.test.ts`): 0 events -> `{ count: 0,
  lastListenedAt: null }`; 1 event -> `{ count: 1, lastListenedAt: <that> }`;
  multiple events -> correct count and the newest timestamp; two items stay
  independent; shuffled input order gives the same result.
- **Component** (`CollectionPanel` / card): "Never played" state; a successful
  "Mark played" updates count + last-listened; the button is disabled while its
  request is pending so a rapid second click on the same action does not fire a
  second insert; a failed "Mark played" leaves the count unchanged and shows a
  recoverable error; the history list renders newest-first; a re-render with a
  mocked persisted event set shows the persisted count/history; both a manual
  and a provider-backed collection item support "Mark played".

## Human Runtime Plan (later - not part of this planning step)

Local app + local Supabase, one test at a time:

1. Mark Pink Floyd played once -> "Played 1 time", last-listened appears ->
   refresh -> still 1.
2. Mark Pink Floyd played a second time -> "Played 2 times"; the history shows
   two events newest-first -> refresh persists.
3. Mark the provider-backed Miles Davis played once -> its count becomes 1
   while Pink Floyd stays 2 -> refresh persists.
4. Final history shows the newest event first and all three events.

Cross-user RLS stays pgTAP evidence, not browser gymnastics. Distinguish
agent-run automated evidence from human-observed evidence in
`docs/verification.md`. Do not claim production verification.

## Milestone 9 Readiness (not implemented here)

Milestone 8 gives Milestone 9 the raw data to ground facts like "you played
this yesterday", "you have played this 8 times", "you have not played this yet",
and "avoid things I listened to recently" - by counting / max-ing / date-range
filtering `listening_events` for the user's candidate items. Milestone 8
implements **none** of that: no curator query, no ranking, no LLM call.

## Open Questions Requiring Human Approval

Resolved with the human on 2026-08-30:

1. **Index B shape.** DECISION: **plain `(collection_item_id)` only.** Not the
   compound `(collection_item_id, listened_at desc, id desc)`, and **not** the
   deferred `(user_id, collection_item_id, listened_at desc)`. Milestone 8 runs
   no server-side per-item listening aggregate; the plain index is justified by
   the FK cascade lookup.
2. **History artist/album source.** DECISION: resolve artist/title by matching
   `event.collection_item_id` against the already-loaded owned collection items
   in `CollectionPanel`. **No `releases` join** in `loadListeningEvents`.
3. **History section placement.** DECISION: a compact collapsible "Listening
   history" section inside `CollectionPanel` below the collection list. No
   dedicated route, no dashboard.

## Stop Point

Historical pre-implementation gate, satisfied. It read:

> This specification is PLANNED. Do not begin Milestone 8 implementation until
> the human approves this spec and the implementation plan, including the
> answers to the Open Questions above.

The human approved the spec and plan with all three Open Questions resolved and
the two implementation clarifications above, and directed implementation on this
branch. Current status is at the top of this document.
