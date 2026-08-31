-- Milestone 8: listening history.
--
-- public.listening_events is the single source of truth for "this user played
-- this owned collection item at this time". Each row is an immutable fact.
-- Listening count and last-listened time are DERIVED from these rows in the
-- browser - there is no listening_count / last_listened_at column on
-- collection_items, no counter trigger, and no aggregate.
--
-- Append-only for the browser user: authenticated may SELECT its own events and
-- INSERT an event for a collection item it owns. No UPDATE, no DELETE. Both
-- foreign keys are ON DELETE CASCADE - removing an owned collection item (or a
-- profile) removes its listening events. Milestone 8 has no server-side path,
-- so service_role gets nothing new here.

create table public.listening_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  collection_item_id uuid not null
    references public.collection_items(id) on delete cascade,
  listened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- User history in reverse chronological order (id DESC breaks ties for equal
-- listened_at).
create index listening_events_user_listened_idx
  on public.listening_events (user_id, listened_at desc, id desc);

-- Foreign-key column index: Postgres does not auto-index FK columns, and this
-- one is ON DELETE CASCADE, so a collection-item delete would otherwise
-- seq-scan listening_events.
create index listening_events_collection_item_idx
  on public.listening_events (collection_item_id);

alter table public.listening_events enable row level security;

revoke all on table public.listening_events from anon;
revoke all on table public.listening_events from authenticated;

grant select
  on table public.listening_events
  to authenticated;

grant insert (collection_item_id)
  on table public.listening_events
  to authenticated;

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
