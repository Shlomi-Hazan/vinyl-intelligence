-- Phase D: user-owned personal genres on a collection item.
--
-- HUMAN-RUNTIME FINDING: the Album Detail page exposed the generic manual
-- "Edit metadata" form even for MusicBrainz catalog releases; saving a genre
-- there fails, because catalog releases have source='catalog' /
-- created_by=NULL and the browser UPDATE RLS on public.releases only permits
-- created_by = auth.uid() AND source = 'manual'.
--
-- Rather than weaken shared-release security, a user's own extra genres for an
-- album in THEIR collection are stored here, on the collection item they own -
-- governed entirely by the existing Milestone 7 own-row UPDATE policy on
-- public.collection_items. The shared public.releases row is NEVER touched.
--
-- Validation reuses the existing pure validator public.release_genres_valid
-- (non-null, <= 12 entries, each trimmed + lowercase + 1..40 chars). The
-- browser client additionally de-duplicates after normalisation.

alter table public.collection_items
  add column personal_genres text[] not null default '{}';

alter table public.collection_items
  add constraint collection_items_personal_genres_valid
  check (public.release_genres_valid(personal_genres));

-- Least privilege: authenticated may now UPDATE personal_genres in addition to
-- the Milestone 7 signal columns + the Phase 0 custom-cover columns - and
-- nothing else (still not id / user_id / release_id / added_at / created_at).
grant update (personal_genres)
  on table public.collection_items
  to authenticated;

-- No new RLS policy: the Milestone 7 own-row UPDATE policy
-- ("Users can update their own collection item signals",
--  using / with check: user_id = auth.uid()) already governs every
-- authenticated UPDATE on this table regardless of column. The column grant
-- above is the privilege boundary.
