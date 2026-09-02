-- Phase D (Visual Experience pass): owner-scoped listening-event management.
--
-- Milestone 8 (migration 20260901120000) intentionally shipped
-- public.listening_events as APPEND-ONLY for the browser user: SELECT own +
-- INSERT own (collection_item_id only). No UPDATE, no DELETE.
--
-- A Phase D human review approved two narrow product additions to History:
--   * correct a mistyped listened_at on an OWN event
--   * delete an accidental OWN listen
--
-- This migration adds the MINIMUM least-privilege surface for exactly that.
-- The event's identity stays immutable to the browser: NO grant on id /
-- user_id / collection_item_id / created_at, so a browser user can never
-- re-point an event at another album or another user, and the "which album was
-- listened to" fact can only be changed by delete + re-log (the supported
-- flow). The historical Milestone 8 migration is unchanged.

-- ---------------------------------------------------------------------------
-- Column-scoped UPDATE: listened_at ONLY. DELETE: whole own row.
-- ---------------------------------------------------------------------------
grant update (listened_at)
  on table public.listening_events
  to authenticated;

grant delete
  on table public.listening_events
  to authenticated;

-- anon and service_role are unchanged (Milestone 8 has no server-side path).

-- ---------------------------------------------------------------------------
-- RLS: own rows only, on both sides of the UPDATE.
-- ---------------------------------------------------------------------------
create policy "Users can update the time of their own listening events"
  on public.listening_events
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own listening events"
  on public.listening_events
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
