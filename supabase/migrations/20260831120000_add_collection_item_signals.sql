-- Milestone 7: personal preference signals on owned collection items.
--
-- rating / is_favorite / notes describe one user's relationship to one owned
-- entry, so they live on public.collection_items (per-user), never on the
-- shared public.releases row. Two collection_items pointing at the same
-- release_id keep independent values.
--
-- No AI, no external API, no model_calls. No Netlify Function - the browser
-- Supabase client plus RLS and column-level grants are the authority.
--
-- Deliberately NOT added in Milestone 7: an updated_at column / touch trigger
-- (nothing consumes such a timestamp yet), and (user_id, is_favorite) /
-- (user_id, rating) indexes (M7 filters/sorts the owned collection in the
-- browser; there is no server-side query that would use them). Both may be
-- added in a later milestone if an actual requirement appears.

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
      or (
        notes = btrim(notes)
        and char_length(notes) between 1 and 1000
      )
    );

-- Least privilege: authenticated may UPDATE exactly the three personal-signal
-- columns and nothing else (not id / user_id / release_id / added_at /
-- created_at). service_role and anon are unchanged.
grant update (rating, is_favorite, notes)
  on public.collection_items
  to authenticated;

-- The only new RLS policy: own-row UPDATE. USING blocks touching another
-- user's row; WITH CHECK blocks re-assigning user_id. release_id is already
-- unreachable because there is no update(release_id) grant.
create policy "Users can update their own collection item signals"
  on public.collection_items
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
