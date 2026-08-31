begin;

select no_plan();

-- ===========================================================================
-- Visual Experience Phase 0: custom album covers.
--   migration 20260903120000_add_custom_cover_storage.sql
--
--   * public.collection_items.custom_cover_path / custom_cover_updated_at
--     (nullable), canonical-path CHECK bound to the row's own user_id + id,
--     least-privilege own-row UPDATE grant on exactly those two columns.
--   * private 'collection-covers' bucket (webp only, 3 MiB).
--   * storage.objects RLS: four policies, bucket-scoped, user+item bound.
--   * releases.cover_url is NOT added.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Column shape
-- ---------------------------------------------------------------------------
select has_column('public', 'collection_items', 'custom_cover_path', 'custom_cover_path exists');
select col_type_is('public', 'collection_items', 'custom_cover_path', 'text', 'custom_cover_path is text');
select col_is_null('public', 'collection_items', 'custom_cover_path', 'custom_cover_path is nullable');

select has_column('public', 'collection_items', 'custom_cover_updated_at', 'custom_cover_updated_at exists');
select col_type_is('public', 'collection_items', 'custom_cover_updated_at', 'timestamp with time zone', 'custom_cover_updated_at is timestamptz');
select col_is_null('public', 'collection_items', 'custom_cover_updated_at', 'custom_cover_updated_at is nullable');

-- releases.cover_url must NOT exist (provider artwork is resolved at display
-- time from the MusicBrainz IDs, not persisted).
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'releases'
      and column_name = 'cover_url'
  ),
  'public.releases has NO cover_url column'
);

-- ---------------------------------------------------------------------------
-- Seed: two users, one owned release + collection item each
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-4000-8000-0000000c0f01','authenticated','authenticated',
   'cover-user-a@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-4000-8000-0000000c0f02','authenticated','authenticated',
   'cover-user-b@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.releases (id, created_by, source, artist, title)
values
  ('c0f00000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000c0f01','manual','Cover Artist A','Cover Album A'),
  ('c0f00000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000c0f02','manual','Cover Artist B','Cover Album B');

insert into public.collection_items (id, user_id, release_id)
values
  ('c0fc0000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000c0f01','c0f00000-0000-4000-8000-00000000000a'),
  ('c0fc0000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000c0f02','c0f00000-0000-4000-8000-00000000000b');

-- ---------------------------------------------------------------------------
-- Canonical-path CHECK (evaluated as table owner; RLS aside)
-- Canonical for item A: {userA}/{itemA}/cover.webp
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.collection_items set custom_cover_path = null
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  'custom_cover_path NULL accepted'
);
select lives_ok(
  $$ update public.collection_items
       set custom_cover_path = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  'exact own-row canonical path accepted'
);
select throws_ok(
  $$ update public.collection_items
       set custom_cover_path = '00000000-0000-4000-8000-0000000c0f02/c0fc0000-0000-4000-8000-00000000000a/cover.webp'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'wrong user prefix rejected by canonical-path CHECK'
);
select throws_ok(
  $$ update public.collection_items
       set custom_cover_path = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000b/cover.webp'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'wrong collection-item id rejected by canonical-path CHECK'
);
select throws_ok(
  $$ update public.collection_items
       set custom_cover_path = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.png'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'wrong extension (.png) rejected by canonical-path CHECK'
);
select throws_ok(
  $$ update public.collection_items
       set custom_cover_path = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/photo.webp'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'wrong filename rejected by canonical-path CHECK'
);
select throws_ok(
  $$ update public.collection_items
       set custom_cover_path = 'anything/at/all/cover.webp'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'arbitrary storage path rejected by canonical-path CHECK'
);

-- reset before the behavioural section
update public.collection_items
  set custom_cover_path = null, custom_cover_updated_at = null
  where id = 'c0fc0000-0000-4000-8000-00000000000a';

-- ---------------------------------------------------------------------------
-- Grants: authenticated UPDATE is exactly the M7 signals + the two new
-- columns, and nothing else.
-- ---------------------------------------------------------------------------
select ok(has_column_privilege('authenticated', 'public.collection_items', 'custom_cover_path', 'UPDATE'),
  'authenticated can UPDATE collection_items.custom_cover_path');
select ok(has_column_privilege('authenticated', 'public.collection_items', 'custom_cover_updated_at', 'UPDATE'),
  'authenticated can UPDATE collection_items.custom_cover_updated_at');
select ok(has_column_privilege('authenticated', 'public.collection_items', 'rating', 'UPDATE'),
  'authenticated still can UPDATE collection_items.rating');
select ok(has_column_privilege('authenticated', 'public.collection_items', 'is_favorite', 'UPDATE'),
  'authenticated still can UPDATE collection_items.is_favorite');
select ok(has_column_privilege('authenticated', 'public.collection_items', 'notes', 'UPDATE'),
  'authenticated still can UPDATE collection_items.notes');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'id', 'UPDATE'),
  'authenticated cannot UPDATE collection_items.id');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'user_id', 'UPDATE'),
  'authenticated cannot UPDATE collection_items.user_id');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'release_id', 'UPDATE'),
  'authenticated cannot UPDATE collection_items.release_id');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'added_at', 'UPDATE'),
  'authenticated cannot UPDATE collection_items.added_at');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'created_at', 'UPDATE'),
  'authenticated cannot UPDATE collection_items.created_at');

-- collection_items still has exactly the 4 M7-era policies (no new one added).
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'collection_items'),
  4,
  'collection_items still has 4 RLS policies (no new policy for custom covers)'
);

-- ---------------------------------------------------------------------------
-- collection_items behavioural (authenticated)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0f01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000c0f01","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ update public.collection_items
       set custom_cover_path = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp',
           custom_cover_updated_at = now()
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  'User A can set custom cover fields on their own item'
);
select is(
  (select custom_cover_path from public.collection_items where id = 'c0fc0000-0000-4000-8000-00000000000a'),
  '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp',
  'User A custom_cover_path persisted'
);

-- Cross-user UPDATE: RLS USING filters the row out - 0 rows, no error.
select lives_ok(
  $$ update public.collection_items
       set custom_cover_updated_at = now()
       where id = 'c0fc0000-0000-4000-8000-00000000000b' $$,
  'User A UPDATE targeting User B item runs without error (0 rows)'
);

-- Column-privilege failures are independent of RLS.
select throws_ok(
  $$ update public.collection_items set user_id = '00000000-0000-4000-8000-0000000c0f02'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'User A cannot change user_id (no column grant)'
);
select throws_ok(
  $$ update public.collection_items set release_id = 'c0f00000-0000-4000-8000-00000000000b'
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'User A cannot change release_id (no column grant)'
);

reset role;
select is(
  (select custom_cover_updated_at from public.collection_items where id = 'c0fc0000-0000-4000-8000-00000000000b'),
  null::timestamptz,
  'User B item untouched by User A cross-user attempt'
);

set local role anon;
select throws_ok(
  $$ update public.collection_items set custom_cover_path = null
       where id = 'c0fc0000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'anon cannot update collection_items'
);
reset role;

-- ---------------------------------------------------------------------------
-- Bucket configuration
-- ---------------------------------------------------------------------------
select is(
  (select public from storage.buckets where id = 'collection-covers'),
  false, 'collection-covers bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'collection-covers'),
  3145728::bigint, 'collection-covers file size limit is 3 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'collection-covers'),
  array['image/webp'], 'collection-covers allows only image/webp'
);

-- ---------------------------------------------------------------------------
-- storage.objects policy shape
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'RLS is enabled on storage.objects'
);
select is(
  (select count(*)::int from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'collection-covers:%'),
  4, 'four collection-covers policies on storage.objects'
);
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
  and policyname = 'collection-covers: insert own item cover' and cmd = 'INSERT'),
  'INSERT policy present');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
  and policyname = 'collection-covers: select own item cover' and cmd = 'SELECT'),
  'SELECT policy present');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
  and policyname = 'collection-covers: update own item cover' and cmd = 'UPDATE'),
  'UPDATE policy present');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
  and policyname = 'collection-covers: delete own cover' and cmd = 'DELETE'),
  'DELETE policy present');

-- ---------------------------------------------------------------------------
-- storage.objects behavioural - User A
-- canonical A: {userA}/{itemA}/cover.webp
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0f01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000c0f01","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ('collection-covers',
             '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp',
             '00000000-0000-4000-8000-0000000c0f01',
             '{"mimetype":"image/webp","size":2048}'::jsonb) $$,
  'User A can insert the canonical cover for their own item'
);
select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp'),
  1, 'User A can select their own cover object'
);

-- item not owned by A
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('collection-covers',
             '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000b/cover.webp',
             '00000000-0000-4000-8000-0000000c0f01') $$,
  '42501', null, 'User A cannot insert a cover for an item they do not own'
);
-- wrong filename
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('collection-covers',
             '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/evil.webp',
             '00000000-0000-4000-8000-0000000c0f01') $$,
  '42501', null, 'User A cannot insert a non-canonical filename'
);
-- extra nested segment
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('collection-covers',
             '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/x/cover.webp',
             '00000000-0000-4000-8000-0000000c0f01') $$,
  '42501', null, 'User A cannot insert a deeper path'
);
-- wrong bucket (no policy for it -> RLS deny)
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('some-other-bucket',
             '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp',
             '00000000-0000-4000-8000-0000000c0f01') $$,
  '42501', null, 'User A cannot insert into a different bucket'
);
-- own uid folder + another user's item id
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('collection-covers',
             '00000000-0000-4000-8000-0000000c0f02/c0fc0000-0000-4000-8000-00000000000a/cover.webp',
             '00000000-0000-4000-8000-0000000c0f01') $$,
  '42501', null, 'User A cannot insert under a folder that is not their uid'
);

select lives_ok(
  $$ update storage.objects set metadata = '{"mimetype":"image/webp","size":4096}'::jsonb
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp' $$,
  'User A can update (replace) their own cover object'
);

reset role;

-- ---------------------------------------------------------------------------
-- storage.objects behavioural - User B cannot reach User A's object
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0f02', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000c0f02","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp'),
  0, 'User B cannot select User A cover object'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('collection-covers',
             '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp',
             '00000000-0000-4000-8000-0000000c0f02') $$,
  '42501', null, 'User B cannot insert into User A folder'
);
-- cross-user UPDATE: USING filters the row -> 0 rows, no error
select lives_ok(
  $$ update storage.objects set metadata = '{"hacked":true}'::jsonb
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp' $$,
  'User B UPDATE targeting User A object runs without error (0 rows)'
);
-- cross-user DELETE: needs the API GUC to pass the protect trigger; RLS still
-- filters the row so nothing is deleted.
set local "storage.allow_delete_query" = 'true';
select lives_ok(
  $$ delete from storage.objects
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp' $$,
  'User B DELETE targeting User A object runs without error (0 rows)'
);

reset role;
select is(
  (select (metadata->>'hacked') from storage.objects
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp'),
  null, 'User A object metadata was not modified by User B'
);
select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp'),
  1, 'User A object still exists after User B delete attempt'
);

-- ---------------------------------------------------------------------------
-- storage.objects - User A can delete their own object (orphan cleanup path)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0f01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000c0f01","role":"authenticated"}', true);
set local role authenticated;
set local "storage.allow_delete_query" = 'true';

select lives_ok(
  $$ delete from storage.objects
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp' $$,
  'User A can delete their own cover object'
);
select is(
  (select count(*)::int from storage.objects
     where name = '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp'),
  0, 'User A cover object removed'
);

reset role;

-- ---------------------------------------------------------------------------
-- anon has no access to the bucket
-- ---------------------------------------------------------------------------
set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'collection-covers'),
  0, 'anon cannot select collection-covers objects'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('collection-covers',
             '00000000-0000-4000-8000-0000000c0f01/c0fc0000-0000-4000-8000-00000000000a/cover.webp',
             '00000000-0000-4000-8000-0000000c0f01') $$,
  '42501', null, 'anon cannot insert into collection-covers'
);
reset role;

select * from finish();

rollback;
