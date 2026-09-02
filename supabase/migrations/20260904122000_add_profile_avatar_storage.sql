-- Phase D: optional profile avatar (a later human-approved extension).
--
-- Initials remain the canonical default AND fallback everywhere the user's
-- avatar is shown (AppShell top-right, sidebar expanded, sidebar collapsed,
-- Settings). A user is never required to upload an image. avatar_path = NULL
-- means "no custom image -> initials".
--
-- Modelled on the Phase 0 custom-cover storage architecture
-- (20260903120000): a private bucket, exactly one canonical WebP object per
-- user, owner-isolated storage.objects RLS, a canonical-path CHECK on the
-- profile column, and a least-privilege column grant. NO signed URL is ever
-- persisted. public.releases and public.collection_items are untouched.

-- ===========================================================================
-- 1. public.profiles - avatar reference columns
-- ===========================================================================
alter table public.profiles
  add column avatar_path text,
  add column avatar_updated_at timestamptz;

-- A non-null avatar_path must be EXACTLY the canonical object name for THIS
-- profile row - built from the row's own id. An arbitrary storage path,
-- another user's prefix, a wrong filename, or a wrong extension can never be
-- persisted (23514).
alter table public.profiles
  add constraint profiles_avatar_path_canonical
  check (
    avatar_path is null
    or avatar_path = id::text || '/avatar.webp'
  );

-- Least privilege: authenticated may now UPDATE exactly display_name (existing)
-- + these two columns, and nothing else (not id / created_at / updated_at).
grant update (avatar_path, avatar_updated_at)
  on table public.profiles
  to authenticated;

-- The Milestone 0 own-profile UPDATE policy already governs every authenticated
-- UPDATE on this table; the column grant above is the privilege boundary. No
-- new RLS policy on public.profiles.

-- ---------------------------------------------------------------------------
-- Extend the updated_at trigger so an avatar change also bumps updated_at.
-- (Recreate the trigger + widen the helper's WHEN - the historical
--  20260818134203 migration is not edited.)
-- ---------------------------------------------------------------------------
drop trigger touch_profile_updated_at_before_display_name_update on public.profiles;

create trigger touch_profile_updated_at_before_profile_update
before update of display_name, avatar_path on public.profiles
for each row
when (
  old.display_name is distinct from new.display_name
  or old.avatar_path is distinct from new.avatar_path
)
execute function private.touch_profile_updated_at();

-- ===========================================================================
-- 2. Private Storage bucket for profile avatars
-- ===========================================================================
-- Created here (not only in supabase/config.toml) so the same definition is
-- applied deterministically by `supabase db reset` locally AND by a hosted
-- migration run. `on conflict (id) do update` makes re-application idempotent
-- and self-healing (private + 1 MiB + webp-only always re-enforced).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  1048576,                 -- 1 MiB (a 512x512 WebP is far smaller)
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ===========================================================================
-- 3. storage.objects RLS - bucket 'profile-avatars' only
-- ===========================================================================
-- storage.objects already has RLS enabled. These four policies are the ONLY
-- access to this bucket. Canonical object name: {auth.uid()}/avatar.webp
--   storage.foldername(name) -> {auth.uid()}   (exactly one segment)
--   storage.filename(name)   -> 'avatar.webp'

create policy "profile-avatars: insert own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'avatar.webp'
);

create policy "profile-avatars: select own avatar"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

create policy "profile-avatars: update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-avatars'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.filename(name) = 'avatar.webp'
  and owner_id = (select auth.uid())::text
);

create policy "profile-avatars: delete own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);
