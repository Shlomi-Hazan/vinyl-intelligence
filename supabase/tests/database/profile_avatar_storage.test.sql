begin;

select no_plan();

-- ===========================================================================
-- Phase D: optional profile avatar.
--   migration 20260904122000_add_profile_avatar_storage.sql
--
--   * public.profiles.avatar_path / avatar_updated_at (nullable),
--     canonical-path CHECK bound to the row's own id, least-privilege
--     own-row UPDATE grant on exactly those two columns.
--   * private 'profile-avatars' bucket (webp only, 1 MiB).
--   * storage.objects RLS: four owner-isolated policies.
--   * updated_at trigger recreated to also fire on an avatar_path change.
--   * initials remain the default/fallback (a UI concern, not tested here).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles column shape
-- ---------------------------------------------------------------------------
select has_column('public', 'profiles', 'avatar_path', 'avatar_path exists');
select col_type_is('public', 'profiles', 'avatar_path', 'text', 'avatar_path is text');
select col_is_null('public', 'profiles', 'avatar_path', 'avatar_path is nullable');

select has_column('public', 'profiles', 'avatar_updated_at', 'avatar_updated_at exists');
select col_type_is('public', 'profiles', 'avatar_updated_at', 'timestamp with time zone', 'avatar_updated_at is timestamptz');
select col_is_null('public', 'profiles', 'avatar_updated_at', 'avatar_updated_at is nullable');

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_path_canonical'
  ),
  'profiles has the canonical avatar-path CHECK'
);

-- ---------------------------------------------------------------------------
-- Grants: authenticated UPDATE is exactly display_name + the two avatar cols.
-- ---------------------------------------------------------------------------
select ok(has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'authenticated still can UPDATE profiles.display_name');
select ok(has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'UPDATE'),
  'authenticated can UPDATE profiles.avatar_path');
select ok(has_column_privilege('authenticated', 'public.profiles', 'avatar_updated_at', 'UPDATE'),
  'authenticated can UPDATE profiles.avatar_updated_at');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'authenticated cannot UPDATE profiles.id');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE'),
  'authenticated cannot UPDATE profiles.created_at');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE'),
  'authenticated cannot UPDATE profiles.updated_at directly');

-- own-profile RLS is unchanged (still exactly SELECT own + UPDATE own).
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  2,
  'profiles still has exactly two RLS policies'
);

-- ---------------------------------------------------------------------------
-- Seed: two users (profiles are auto-created by the auth trigger)
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-4000-8000-00000000af01','authenticated','authenticated',
   'avatar-a@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-4000-8000-00000000af02','authenticated','authenticated',
   'avatar-b@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

-- ---------------------------------------------------------------------------
-- Canonical-path CHECK (as table owner; RLS aside)
-- Canonical for user A: {userA}/avatar.webp
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.profiles set avatar_path = null
       where id = '00000000-0000-4000-8000-00000000af01' $$,
  'avatar_path NULL accepted'
);
select lives_ok(
  $$ update public.profiles
       set avatar_path = '00000000-0000-4000-8000-00000000af01/avatar.webp'
       where id = '00000000-0000-4000-8000-00000000af01' $$,
  'exact own canonical avatar path accepted'
);
select throws_ok(
  $$ update public.profiles
       set avatar_path = '00000000-0000-4000-8000-00000000af02/avatar.webp'
       where id = '00000000-0000-4000-8000-00000000af01' $$,
  '23514', null, 'another user''s avatar prefix rejected by the CHECK'
);
select throws_ok(
  $$ update public.profiles
       set avatar_path = '00000000-0000-4000-8000-00000000af01/photo.webp'
       where id = '00000000-0000-4000-8000-00000000af01' $$,
  '23514', null, 'wrong filename rejected by the CHECK'
);
select throws_ok(
  $$ update public.profiles
       set avatar_path = '00000000-0000-4000-8000-00000000af01/avatar.png'
       where id = '00000000-0000-4000-8000-00000000af01' $$,
  '23514', null, 'wrong extension rejected by the CHECK'
);
select throws_ok(
  $$ update public.profiles
       set avatar_path = 'anything/at/all/avatar.webp'
       where id = '00000000-0000-4000-8000-00000000af01' $$,
  '23514', null, 'arbitrary storage path rejected by the CHECK'
);

-- reset
update public.profiles set avatar_path = null, avatar_updated_at = null
  where id = '00000000-0000-4000-8000-00000000af01';

-- ---------------------------------------------------------------------------
-- updated_at trigger: an avatar_path change bumps updated_at
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000af01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000af01","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ update public.profiles
       set avatar_path = '00000000-0000-4000-8000-00000000af01/avatar.webp',
           avatar_updated_at = now()
       where id = '00000000-0000-4000-8000-00000000af01' $$,
  'User A can link their avatar object'
);
select ok(
  (select updated_at > created_at from public.profiles
     where id = '00000000-0000-4000-8000-00000000af01'),
  'updated_at was bumped by the avatar change'
);

-- cross-user profile UPDATE is RLS-filtered (0 rows, no error)
select lives_ok(
  $$ update public.profiles set avatar_updated_at = now()
       where id = '00000000-0000-4000-8000-00000000af02' $$,
  'User A UPDATE targeting User B profile runs without error (0 rows)'
);
reset role;
select is(
  (select avatar_updated_at from public.profiles where id = '00000000-0000-4000-8000-00000000af02'),
  null::timestamptz,
  'User B profile untouched by User A cross-user attempt'
);

-- ---------------------------------------------------------------------------
-- Bucket configuration
-- ---------------------------------------------------------------------------
select is((select public from storage.buckets where id = 'profile-avatars'),
  false, 'profile-avatars bucket is private');
select is((select file_size_limit from storage.buckets where id = 'profile-avatars'),
  1048576::bigint, 'profile-avatars file size limit is 1 MiB');
select is((select allowed_mime_types from storage.buckets where id = 'profile-avatars'),
  array['image/webp'], 'profile-avatars allows only image/webp');

-- ---------------------------------------------------------------------------
-- storage.objects policy shape
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'profile-avatars:%'),
  4, 'four profile-avatars policies on storage.objects'
);

-- ---------------------------------------------------------------------------
-- storage.objects behavioural - User A
-- canonical A: {userA}/avatar.webp
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000af01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000af01","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ('profile-avatars',
             '00000000-0000-4000-8000-00000000af01/avatar.webp',
             '00000000-0000-4000-8000-00000000af01',
             '{"mimetype":"image/webp","size":4096}'::jsonb) $$,
  'User A can insert their own canonical avatar'
);
select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp'),
  1, 'User A can select their own avatar object'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('profile-avatars',
             '00000000-0000-4000-8000-00000000af01/evil.webp',
             '00000000-0000-4000-8000-00000000af01') $$,
  '42501', null, 'User A cannot insert a non-canonical filename'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('profile-avatars',
             '00000000-0000-4000-8000-00000000af01/x/avatar.webp',
             '00000000-0000-4000-8000-00000000af01') $$,
  '42501', null, 'User A cannot insert a deeper path'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('profile-avatars',
             '00000000-0000-4000-8000-00000000af02/avatar.webp',
             '00000000-0000-4000-8000-00000000af01') $$,
  '42501', null, 'User A cannot insert under another user''s folder'
);
select lives_ok(
  $$ update storage.objects set metadata = '{"mimetype":"image/webp","size":8192}'::jsonb
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp' $$,
  'User A can replace their own avatar object'
);
reset role;

-- ---------------------------------------------------------------------------
-- User B cannot reach User A's avatar
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000af02', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000af02","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp'),
  0, 'User B cannot select User A avatar object'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('profile-avatars',
             '00000000-0000-4000-8000-00000000af01/avatar.webp',
             '00000000-0000-4000-8000-00000000af02') $$,
  '42501', null, 'User B cannot insert into User A folder'
);
select lives_ok(
  $$ update storage.objects set metadata = '{"hacked":true}'::jsonb
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp' $$,
  'User B UPDATE targeting User A avatar runs without error (0 rows)'
);
set local "storage.allow_delete_query" = 'true';
select lives_ok(
  $$ delete from storage.objects
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp' $$,
  'User B DELETE targeting User A avatar runs without error (0 rows)'
);
reset role;
select is(
  (select (metadata->>'hacked') from storage.objects
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp'),
  null, 'User A avatar metadata not modified by User B');
select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp'),
  1, 'User A avatar object still exists after User B delete attempt');

-- ---------------------------------------------------------------------------
-- User A can delete their own avatar (Remove photo -> initials)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000af01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000af01","role":"authenticated"}', true);
set local role authenticated;
set local "storage.allow_delete_query" = 'true';
select lives_ok(
  $$ delete from storage.objects
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp' $$,
  'User A can delete their own avatar object'
);
select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-00000000af01/avatar.webp'),
  0, 'User A avatar object removed'
);
reset role;

-- ---------------------------------------------------------------------------
-- anon has no access to the bucket
-- ---------------------------------------------------------------------------
set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'profile-avatars'),
  0, 'anon cannot select profile-avatars objects'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('profile-avatars',
             '00000000-0000-4000-8000-00000000af01/avatar.webp',
             '00000000-0000-4000-8000-00000000af01') $$,
  '42501', null, 'anon cannot insert into profile-avatars'
);
reset role;

select * from finish();

rollback;
