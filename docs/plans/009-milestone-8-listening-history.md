# 009 Milestone 8 Listening History Implementation Plan

Status: PLANNED - awaiting human approval before implementation

Milestone: 8 - Listening History

Date: 2026-08-30

Branch: `claude/milestone-8-listening-history`

Baseline: `2affd718481a3c6da745c9f1b99667635a87adff` (Milestone 7 merge on `main`)

Specification: `docs/specs/0009-milestone-8-listening-history.md`

## Current Repository Baseline

- `public.collection_items` (after Milestone 7): `id`, `user_id`
  (`default auth.uid()`), `release_id`, `added_at`, `created_at`, `rating`
  (`smallint`), `is_favorite` (`boolean not null default false`), `notes`
  (`text`). RLS: own-row `select` / `insert` (with a manual-release existence
  check) / `delete` / `update` (Milestone 7 signals). `authenticated` grants:
  `select`, `insert (release_id)`, `delete`, `update (rating, is_favorite,
  notes)`.
- The existing `collection_items` INSERT policy already uses
  `exists (select 1 from public.releases where ...)` - the pattern the
  Milestone 8 `listening_events` INSERT policy reuses.
- No `listening_events` table exists. `docs/data-model.md` and
  `docs/architecture.md` already say `listening_events` is the source of truth
  and that `listening_count` / `last_listened_at` should not be denormalized
  onto `collection_items`.
- `src/lib/supabase/client.ts`: `Database.Tables` has `collection_items`,
  `profiles`, `releases` (no `model_calls`, no `listening_events`).
- `src/lib/supabase/collection.ts`: `loadCollection`, `addManualCollectionItem`,
  `updateManualRelease`, `updateCollectionItemPersonalSignals`,
  `deleteCollectionItem`, `CollectionItemWithRelease`.
- `src/collection/CollectionPanel.tsx`: loads the collection on mount, holds
  `items` state, Milestone 6 filter/sort controls, renders `CollectionForm`,
  `CollectionLibraryControls`, `CollectionItemCard` (which renders
  `CollectionItemPersonalControls`). `handleRemove` deletes a `collection_items`
  row and filters it out of `items`.
- `src/collection/CollectionItemCard.tsx`: title, artist, metadata line, genres
  line, Edit / Remove, and the Milestone 7 personal-controls block.

## Design Decisions

### 1. `listening_events` is the source of truth

One immutable append-only row per play. Count and last-listened are derived,
never stored. No triggers, no materialized aggregates. (Approved principle.)

### 2. Minimal table

`id`, `user_id`, `collection_item_id`, `listened_at`, `created_at`. No `note`,
no `updated_at`, no duration / track / location / mood / device / source /
soft-delete. Both FKs `ON DELETE CASCADE`.

### 3. No Netlify Function

The browser Supabase client + RLS + column grants are the authority. "Mark
played" is `client.from('listening_events').insert({ collection_item_id })`.

### 4. Two indexes

`(user_id, listened_at desc, id desc)` for the history load; `(collection_item_id)`
for the FK cascade scan. The third aspirational index is deferred (see the spec
"Index Decision").

### 5. Append-only for the browser user

`SELECT` + `INSERT (collection_item_id)` grants only; own-row `SELECT` policy;
own-item `INSERT` policy; no `UPDATE`/`DELETE` grant or policy.

### 6. Client helpers, decoupled

`loadListeningEvents(client)` and `addListeningEvent(client, collectionItemId)`
in a small `src/lib/supabase/listeningEvents.ts` (or added to `collection.ts` if
that stays cleaner during implementation). `addListeningEvent` sends **only**
`collection_item_id`. Neither is coupled to the manual-release or personal-
signal helpers.

### 7. Pure derived-summary helper

`src/collection/listeningSummary.ts` -
`summarizeListeningForItem(events, collectionItemId) -> { count, lastListenedAt }`,
order-independent, timestamps compared as `Date`.

### 8. Compact UI, no new route

`CollectionItemCard` gains a "Mark played" button + "Played N times" +
"Last listened" / "Never played". `CollectionPanel` loads events alongside the
collection, derives per-card summaries with `useMemo`, handles "Mark played"
(append to `events` on success; recoverable error on failure; disable the
button while its request is pending), drops an item's events from local state
when the item is removed, and renders a collapsible "Listening history" section
below the list. The history resolves artist/title by matching
`event.collection_item_id` against the loaded `items`.

## Files / Components Affected

```
supabase/migrations/20260901120000_add_listening_events.sql   # NEW
supabase/tests/database/listening_events.test.sql             # NEW (pgTAP)
src/lib/supabase/client.ts            # ListeningEvent type; Database.Tables.listening_events
src/lib/supabase/listeningEvents.ts   # NEW: loadListeningEvents, addListeningEvent
src/lib/supabase/listeningEvents.test.ts   # NEW
src/collection/listeningSummary.ts    # NEW pure helper
src/collection/listeningSummary.test.ts    # NEW
src/collection/ListeningHistory.tsx   # NEW compact collapsible history section
src/collection/CollectionItemCard.tsx # "Mark played" + count + last-listened block
src/collection/CollectionPanel.tsx    # load events; handleMarkPlayed; drop events on remove; render history
src/collection/CollectionPanel.test.tsx  # component tests
src/styles.css                        # small rules for the listening block / history
docs/specs/0009-..., docs/plans/009-...  # status flips at approval / completion
README.md, docs/verification.md, docs/specs/README.md  # status/index, at verification time
```

Names may shift during implementation; the boundary stays: one migration, one
table, two client helpers, one pure helper, a "Mark played" affordance on the
card, and a compact history section.

## Database Implications

- Forward migration only; no historical migration edited.
- New `public.listening_events` table + two FKs (`ON DELETE CASCADE`) + two
  indexes + RLS on + `authenticated` `SELECT` and `INSERT (collection_item_id)`
  grants + two RLS policies (own-row `SELECT`; own-item `INSERT`).
- `collection_items`, `releases`, `profiles`, `model_calls` schema, grants,
  policies, and indexes are **unchanged**. No column added to `collection_items`.
- `service_role` and `anon` get nothing on `listening_events`.
- pgTAP `listening_events.test.sql` per the spec "Automated Verification".

## External API Implications

**None.** No OpenRouter, no MusicBrainz, no new provider, no `model_calls`, no
Netlify Function. The only network calls are the browser Supabase client's own
`select` / `insert`.

## AI / Model Implications

**None.** No model call. `listening_events` is structured data that Milestone 9
may later read.

## Security / Privacy Implications

- Ownership stays RLS-authoritative. The `INSERT` policy's `WITH CHECK` ties the
  event to `auth.uid()` and to a collection item owned by `auth.uid()`.
- No `UPDATE`/`DELETE` for the browser user - events are immutable except by the
  owning-item cascade.
- No service-role key in the browser, no new secret, no new Netlify Function.
- Milestone 7 personal-signal permissions and `releases` RLS are untouched.
- `docs/security.md` already lists `listening_events` as an RLS-protected table
  and notes explanations must be grounded in supplied history - a Milestone 9
  concern, not Milestone 8.

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

1. **Migration + pgTAP.** `20260901120000_add_listening_events.sql` and
   `listening_events.test.sql`. Apply via `supabase db reset`; run
   `supabase test db` (all existing suites must still pass).
2. **TS types + event helpers.** `ListeningEvent` +
   `Database.Tables.listening_events` in `client.ts`; `loadListeningEvents` /
   `addListeningEvent` in `listeningEvents.ts`. Client tests.
3. **Derived-summary helper.** `listeningSummary.ts` + tests.
4. **"Mark played" UI.** Card button + count + last-listened; `CollectionPanel`
   loads events, `handleMarkPlayed`, disable-while-pending, drop-on-remove.
   Component tests.
5. **History UI.** `ListeningHistory.tsx` collapsible section + wire-up +
   styles. Component tests.
6. **Full local verification** (the command block above).
7. **One focused independent implementation review** - fix any BLOCKER /
   meaningful MEDIUM.
8. **Short focused human runtime** - the four checks in the spec, one at a time.
9. **Pre-PR repository evidence gate** - status sync, contradiction scan,
   secret/scope scan; then open the PR against `main`. Do not merge.

## Pre-PR Repository Evidence Gate

Before opening the Milestone 8 PR: spec/plan status reflect actual approvals;
README current status is accurate (M7 merged, M8 verified); `docs/verification.md`
records only checks that ran and distinguishes automated from human evidence;
the deferred items (no denormalized columns, the third index, pagination,
stats/charts) are visible and not represented as defects; no future feature is
represented as implemented; no Milestone 9 work started; historical planning
language stays historical; no secret or real `.env` is staged; the branch
contains only Milestone 8 scope.

## Deadline / Complexity Check

- **Small vertical slice?** Yes: one migration (1 table, 2 FKs, 2 indexes, RLS
  + 2 policies, 2 grants), one `ListeningEvent` type + `Database` entry, two
  ~15-line client helpers, one pure helper, a "Mark played" affordance on the
  card, one small collapsible history component, tests. No new page, no service,
  no dependency, no external API.
- **Speculative field?** None - `note` / `updated_at` / duration / track /
  location / mood / device / source / soft-delete are all rejected.
- **Redundant index?** The third `(user_id, collection_item_id, listened_at
  desc)` index is redundant for Milestone 8 (client-side derivation) - deferred.
- **Netlify Function unnecessary?** Yes - none.
- **Pagination premature?** Yes - deferred, documented as future work.
- **Stretch UI?** Charts / statistics / streaks / trends / "most played" /
  "forgotten gems" - all deferred.
- **Actually Milestone 9 scope?** Any curator query over `listening_events`,
  "avoid recently listened" ranking, conversational refinement, LLM calls.

## Risks / Notes

- `collection_item_id` is a foreign key with `ON DELETE CASCADE` but Postgres
  does not auto-index FK columns; index B (`(collection_item_id)`) is added
  specifically so the cascade delete does not seq-scan `listening_events`.
- The `exists` subquery in the INSERT `WITH CHECK` is the established repo
  pattern (`collection_items` insert policy); it targets a different table so it
  is not recursive.
- "Mark played" is intentionally not debounced across separate clicks - two
  deliberate plays are two real events; only the same in-flight click is
  guarded.
- Loading the full event list into memory is fine for the demo; a long-term
  history needs pagination (deferred).
- Timestamps: rely on the Postgres `now()` default; render with the browser
  locale; tests use fixed ISO values and assert on count / ordering / `Date`
  equality, never full locale strings.

## Human Decisions Required Before Implementation

The three "Open Questions Requiring Human Approval" in the spec: (1) index B
shape (plain vs compound); (2) history artist/album source (client match vs
join); (3) history section placement (collapsible vs always-expanded).

## Stop Point

This plan is PLANNED. Implementation begins only after the human approves this
plan, the specification, and the answers to the Open Questions above.
