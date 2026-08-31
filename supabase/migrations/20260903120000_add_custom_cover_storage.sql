-- Visual Experience & Product Identity pass - Phase 0: persistent custom album
-- covers for owned collection items.
--
-- Spec: docs/specs/0012-visual-experience-product-identity.md section 9.
-- ADR:  docs/decisions/0005-visual-experience-and-artwork-architecture.md.
--
-- A user may attach ONE persistent cover image to ONE owned collection item.
-- This is completely separate from the transient photo-recognition upload
-- (which is never persisted and is untouched by this migration).
--
-- Design rules enforced here:
--   * The custom cover is per-user, at the collection-item level. It is NEVER
--     written to the shared public.releases row - one user's photo must not
--     become the release image for every user.
--   * public.releases gains NO cover column. Provider artwork is resolved at
--     display time from the MusicBrainz IDs already stored
--     (provider_release_id / provider_release_group_id) via deterministic Cover
--     Art Archive front-image URLs. No releases.cover_url, no catalog-add
--     provider lookup, no new service_role grant.
--   * The only persisted object per item is the canonical WebP:
--         {user_id}/{collection_item_id}/cover.webp
--     in the private 'collection-covers' bucket. The browser converts any
--     accepted jpeg/png/webp input to WebP before upload; only image/webp is a
--     valid stored object.
--
-- No AI, no external API call, no model_calls change.

-- ===========================================================================
-- 1. public.collection_items - custom cover reference columns
-- ===========================================================================

alter table public.collection_items
  add column custom_cover_path text,
  add column custom_cover_updated_at timestamptz;

-- When set, custom_cover_path must be exactly the canonical object name for
-- THIS row - built from the row's own user_id and id. An arbitrary Storage
-- path can never be persisted, and the column cannot point at another user's
-- folder or another item's folder.
alter table public.collection_items
  add constraint collection_items_custom_cover_path_canonical
  check (
    custom_cover_path is null
    or custom_cover_path = user_id::text || '/' || id::text || '/cover.webp'
  );

-- Least privilege: authenticated may now UPDATE exactly these two columns in
-- addition to the Milestone 7 signal columns (rating / is_favorite / notes) -
-- and nothing else (not id / user_id / release_id / added_at / created_at).
-- service_role and anon are unchanged.
grant update (custom_cover_path, custom_cover_updated_at)
  on public.collection_items
  to authenticated;

-- No new RLS policy: the Milestone 7 own-row UPDATE policy
-- ("Users can update their own collection item signals",
--  using / with check: user_id = auth.uid()) already governs every
-- authenticated UPDATE on this table regardless of column. The column grant
-- above is the privilege boundary.

-- ===========================================================================
-- 2. Private Storage bucket for custom covers
-- ===========================================================================
-- Created here (not only in supabase/config.toml) so the same definition is
-- applied deterministically by `supabase db reset` locally AND by the hosted
-- migration run during Milestone 11 deployment. `on conflict (id) do update`
-- makes re-application idempotent and self-healing even if the local
-- config.toml bucket sync created the row first.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'collection-covers',
  'collection-covers',
  false,
  3145728,                 -- 3 MiB
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- `do update` (not `do nothing`) so re-applying the migration - or applying it
-- to a hosted project where a bucket of this name somehow already exists -
-- always enforces private + 3 MiB + webp-only. The bucket name is unique to
-- this feature, so this cannot clobber an unrelated bucket.

-- ===========================================================================
-- 3. storage.objects RLS - bucket 'collection-covers' only
-- ===========================================================================
-- storage.objects already has RLS enabled with NO policies (default deny for
-- anon and authenticated). These four policies are the ONLY access to the
-- bucket. Every policy re-checks the bucket, the owning user, and - for
-- everything except DELETE - that the referenced collection item is still
-- owned by the caller (defense in depth on top of the column CHECK).
--
-- Canonical object name: {auth.uid()}/{collection_item_id}/cover.webp
--   storage.foldername(name) -> {auth.uid(), collection_item_id}
--   storage.filename(name)   -> 'cover.webp'

-- INSERT: create the canonical cover for an item the caller owns right now.
create policy "collection-covers: insert own item cover"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'collection-covers'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'cover.webp'
  and exists (
    select 1
    from public.collection_items ci
    where ci.id::text = (storage.foldername(name))[2]
      and ci.user_id = (select auth.uid())
  )
);

-- SELECT: read only your own object, for an item you still own.
create policy "collection-covers: select own item cover"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'collection-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
  and exists (
    select 1
    from public.collection_items ci
    where ci.id::text = (storage.foldername(name))[2]
      and ci.user_id = (select auth.uid())
  )
);

-- UPDATE: replace your own object in place; same ownership on both sides.
create policy "collection-covers: update own item cover"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'collection-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
  and exists (
    select 1
    from public.collection_items ci
    where ci.id::text = (storage.foldername(name))[2]
      and ci.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'collection-covers'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'cover.webp'
  and owner_id = (select auth.uid())::text
  and exists (
    select 1
    from public.collection_items ci
    where ci.id::text = (storage.foldername(name))[2]
      and ci.user_id = (select auth.uid())
  )
);

-- DELETE: remove your own object. Deliberately does NOT require the collection
-- item to still exist, so an owned orphan (item deleted first) can still be
-- cleaned up by its owner.
create policy "collection-covers: delete own cover"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'collection-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);
