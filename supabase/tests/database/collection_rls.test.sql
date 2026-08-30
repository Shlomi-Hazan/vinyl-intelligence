begin;

select no_plan();

select ok(to_regclass('public.releases') is not null, 'public.releases exists');
select ok(to_regclass('public.collection_items') is not null, 'public.collection_items exists');

select ok(
  exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'releases'
      and i.indisprimary
  ),
  'releases has a primary key'
);

select ok(
  exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'collection_items'
      and i.indisprimary
  ),
  'collection_items has a primary key'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'releases'
      and column_name in (
        'id',
        'created_by',
        'source',
        'artist',
        'title',
        'release_year',
        'label',
        'catalog_number',
        'country',
        'format',
        'created_at',
        'updated_at'
      )
    group by table_schema, table_name
    having count(*) = 12
  ),
  'releases has expected Milestone 3 columns'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collection_items'
      and column_name in ('id', 'user_id', 'release_id', 'added_at', 'created_at')
    group by table_schema, table_name
    having count(*) = 5
  ),
  'collection_items has expected Milestone 3 columns'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'releases'
      and column_name in (
        'provider_master_id',
        'styles',
        'cover_url',
        'tracklist',
        'metadata_json',
        'decade'
      )
  ),
  'releases does not include deferred provider master/filter columns'
);
-- `genres` moved from deferred to implemented in Milestone 6; its shape,
-- constraint, and privileges are covered by release_genres.test.sql.

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collection_items'
      and column_name in ('source', 'entry_method', 'decade')
  ),
  'collection_items does not include source, entry_method, or decade'
);

select ok(
  exists (
    select 1
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where con.contype = 'f'
      and child_ns.nspname = 'public'
      and child.relname = 'releases'
      and parent_ns.nspname = 'public'
      and parent.relname = 'profiles'
      and con.confdeltype = 'n'
  ),
  'releases.created_by references profiles(id) with on delete set null'
);

select ok(
  exists (
    select 1
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where con.contype = 'f'
      and child_ns.nspname = 'public'
      and child.relname = 'collection_items'
      and parent_ns.nspname = 'public'
      and parent.relname = 'profiles'
      and con.confdeltype = 'c'
  ),
  'collection_items.user_id references profiles(id) with on delete cascade'
);

select ok(
  exists (
    select 1
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where con.contype = 'f'
      and child_ns.nspname = 'public'
      and child.relname = 'collection_items'
      and parent_ns.nspname = 'public'
      and parent.relname = 'releases'
      and con.confdeltype = 'r'
  ),
  'collection_items.release_id references releases(id) with restrict delete behavior'
);

select ok((select relrowsecurity from pg_class where oid = 'public.releases'::regclass), 'RLS is enabled on releases');
select ok((select relrowsecurity from pg_class where oid = 'public.collection_items'::regclass), 'RLS is enabled on collection_items');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'releases'),
  4,
  'only four policies exist on releases after catalog read policy'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'collection_items'),
  4,
  'four policies exist on collection_items (own-row select/insert/delete + Milestone 7 own-row signals UPDATE)'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'releases'
      and (
        coalesce(qual, '') ilike '%collection_items%'
        or coalesce(with_check, '') ilike '%collection_items%'
      )
  ),
  'release policies do not depend on collection_items'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'collection_items'
      and (
        coalesce(qual, '') ilike '% from public.collection_items%'
        or coalesce(with_check, '') ilike '% from public.collection_items%'
      )
  ),
  'collection_items policies do not query collection_items recursively'
);

select ok(not has_table_privilege('anon', 'public.releases', 'select'), 'anon has no releases select');
select ok(not has_table_privilege('anon', 'public.releases', 'insert'), 'anon has no releases insert');
select ok(not has_table_privilege('anon', 'public.releases', 'update'), 'anon has no releases update');
select ok(not has_table_privilege('anon', 'public.releases', 'delete'), 'anon has no releases delete');
select ok(not has_table_privilege('anon', 'public.collection_items', 'select'), 'anon has no collection_items select');
select ok(not has_table_privilege('anon', 'public.collection_items', 'insert'), 'anon has no collection_items insert');
select ok(not has_table_privilege('anon', 'public.collection_items', 'update'), 'anon has no collection_items update');
select ok(not has_table_privilege('anon', 'public.collection_items', 'delete'), 'anon has no collection_items delete');

select ok(has_table_privilege('authenticated', 'public.releases', 'select'), 'authenticated can select releases subject to RLS');
select ok(has_column_privilege('authenticated', 'public.releases', 'artist', 'insert'), 'authenticated can insert release artist');
select ok(has_column_privilege('authenticated', 'public.releases', 'title', 'insert'), 'authenticated can insert release title');
select ok(has_column_privilege('authenticated', 'public.releases', 'release_year', 'insert'), 'authenticated can insert release release_year');
select ok(has_column_privilege('authenticated', 'public.releases', 'label', 'insert'), 'authenticated can insert release label');
select ok(has_column_privilege('authenticated', 'public.releases', 'catalog_number', 'insert'), 'authenticated can insert release catalog_number');
select ok(has_column_privilege('authenticated', 'public.releases', 'country', 'insert'), 'authenticated can insert release country');
select ok(has_column_privilege('authenticated', 'public.releases', 'format', 'insert'), 'authenticated can insert release format');
select ok(not has_column_privilege('authenticated', 'public.releases', 'id', 'insert'), 'authenticated cannot insert release id');
select ok(not has_column_privilege('authenticated', 'public.releases', 'created_by', 'insert'), 'authenticated cannot insert release created_by');
select ok(not has_column_privilege('authenticated', 'public.releases', 'source', 'insert'), 'authenticated cannot insert release source');
select ok(not has_column_privilege('authenticated', 'public.releases', 'created_at', 'insert'), 'authenticated cannot insert release created_at');
select ok(not has_column_privilege('authenticated', 'public.releases', 'updated_at', 'insert'), 'authenticated cannot insert release updated_at');
select ok(has_column_privilege('authenticated', 'public.releases', 'format', 'update'), 'authenticated can update release format');
select ok(not has_column_privilege('authenticated', 'public.releases', 'id', 'update'), 'authenticated cannot update release id');
select ok(not has_column_privilege('authenticated', 'public.releases', 'created_by', 'update'), 'authenticated cannot update release created_by');
select ok(not has_column_privilege('authenticated', 'public.releases', 'source', 'update'), 'authenticated cannot update release source');
select ok(not has_column_privilege('authenticated', 'public.releases', 'created_at', 'update'), 'authenticated cannot update release created_at');
select ok(not has_column_privilege('authenticated', 'public.releases', 'updated_at', 'update'), 'authenticated cannot update release updated_at');
select ok(not has_table_privilege('authenticated', 'public.releases', 'delete'), 'authenticated cannot delete releases');

select ok(has_table_privilege('authenticated', 'public.collection_items', 'select'), 'authenticated can select collection_items subject to RLS');
select ok(has_column_privilege('authenticated', 'public.collection_items', 'release_id', 'insert'), 'authenticated can insert collection_item release_id');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'id', 'insert'), 'authenticated cannot insert collection_item id directly');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'user_id', 'insert'), 'authenticated cannot insert collection_item user_id directly');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'added_at', 'insert'), 'authenticated cannot insert collection_item added_at directly');
select ok(not has_column_privilege('authenticated', 'public.collection_items', 'created_at', 'insert'), 'authenticated cannot insert collection_item created_at directly');
select ok(not has_table_privilege('authenticated', 'public.collection_items', 'update'), 'authenticated cannot update collection_items');
select ok(has_table_privilege('authenticated', 'public.collection_items', 'delete'), 'authenticated can delete own collection_items subject to RLS');

select ok(
  not has_function_privilege('anon', 'private.touch_release_updated_at()', 'execute'),
  'anon cannot execute release updated_at helper'
);

select ok(
  not has_function_privilege('authenticated', 'private.touch_release_updated_at()', 'execute'),
  'authenticated cannot execute release updated_at helper'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-0000000000a1',
    'authenticated',
    'authenticated',
    'collection-a@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-0000000000b2',
    'authenticated',
    'authenticated',
    'collection-b@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-0000000000c3',
    'authenticated',
    'authenticated',
    'collection-c@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role anon;

select throws_ok(
  $$ select count(*) from public.releases $$,
  '42501',
  null,
  'anon cannot read releases'
);

select throws_ok(
  $$ select count(*) from public.collection_items $$,
  '42501',
  null,
  'anon cannot read collection_items'
);

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ insert into public.releases (artist, title, release_year, label, catalog_number, country, format)
     values ('Artist A', 'Album A', 1977, 'Label A', 'CAT-1', 'US', 'LP') $$,
  'User A can insert own manual release'
);

select is(
  (select count(*)::int from public.releases where artist = 'Artist A' and title = 'Album A'),
  1,
  'User A can select own manual release'
);

select lives_ok(
  $$ update public.releases
     set title = 'Album A Updated', format = 'Gatefold LP'
     where artist = 'Artist A' and title = 'Album A' $$,
  'User A can update own manual release metadata'
);

select lives_ok(
  $$ insert into public.collection_items (release_id)
     select id from public.releases where title = 'Album A Updated' limit 1 $$,
  'User A can insert own collection item for own release'
);

select is(
  (select count(*)::int from public.collection_items),
  1,
  'User A can select own collection item'
);

select lives_ok(
  $$ insert into public.collection_items (release_id)
     select id from public.releases where title = 'Album A Updated' limit 1 $$,
  'User A can insert duplicate collection item for the same release'
);

select is(
  (select count(*)::int from public.collection_items),
  2,
  'duplicate collection items for the same release are allowed'
);

select lives_ok(
  $$ delete from public.collection_items
     where id = (select id from public.collection_items order by created_at, id limit 1) $$,
  'User A can delete one own duplicate collection item'
);

select is(
  (select count(*)::int from public.collection_items),
  1,
  'deleting one duplicate leaves the other duplicate'
);

select lives_ok(
  $$ insert into public.releases (artist, title)
     values ('Same Artist', 'Same Album') $$,
  'User A can insert first identical metadata manual release'
);

select lives_ok(
  $$ insert into public.releases (artist, title)
     values ('Same Artist', 'Same Album') $$,
  'User A can insert second identical metadata manual release'
);

select is(
  (select count(*)::int from public.releases where artist = 'Same Artist' and title = 'Same Album'),
  2,
  'identical metadata may create two manual release rows'
);

select lives_ok(
  $$ insert into public.releases (artist, title)
     values ('Orphan Artist', 'Orphan Album') $$,
  'User A can create an own manual release without a collection item'
);

select is(
  (
    select count(*)::int
    from public.collection_items ci
    join public.releases r on r.id = ci.release_id
    where r.title = 'Orphan Album'
  ),
  0,
  'orphan manual release does not appear in collection_items-based collection query'
);

select throws_ok(
  $$ insert into public.collection_items (user_id, release_id)
     select '00000000-0000-4000-8000-0000000000b2'::uuid, id
     from public.releases
     where title = 'Album A Updated'
     limit 1 $$,
  '42501',
  null,
  'User A cannot insert a collection item for User B'
);

select throws_ok(
  $$ update public.collection_items set added_at = now() $$,
  '42501',
  null,
  'collection_items update is denied'
);

select throws_ok(
  $$ update public.releases set id = gen_random_uuid() where title = 'Album A Updated' $$,
  '42501',
  null,
  'User A cannot update immutable release id'
);

select throws_ok(
  $$ update public.releases set created_by = '00000000-0000-4000-8000-0000000000b2' where title = 'Album A Updated' $$,
  '42501',
  null,
  'User A cannot update release created_by'
);

select throws_ok(
  $$ update public.releases set source = 'catalog' where title = 'Album A Updated' $$,
  '42501',
  null,
  'User A cannot update release source'
);

select throws_ok(
  $$ update public.releases set created_at = now() where title = 'Album A Updated' $$,
  '42501',
  null,
  'User A cannot update release created_at'
);

select throws_ok(
  $$ update public.releases set updated_at = now() where title = 'Album A Updated' $$,
  '42501',
  null,
  'User A cannot update release updated_at directly'
);

select throws_ok(
  $$ delete from public.releases where title = 'Album A Updated' $$,
  '42501',
  null,
  'User A cannot delete releases'
);

select throws_ok(
  $$ insert into public.releases (artist, title) values (' Bad Artist', 'Valid Title') $$,
  '23514',
  null,
  'untrimmed artist fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title) values ('', 'Valid Title') $$,
  '23514',
  null,
  'blank artist fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title) values (repeat('a', 161), 'Valid Title') $$,
  '23514',
  null,
  'overlong artist fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title) values ('Valid Artist', '') $$,
  '23514',
  null,
  'blank title fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title) values ('Valid Artist', '   ') $$,
  '23514',
  null,
  'whitespace-only title fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title) values ('Valid Artist', ' Title ') $$,
  '23514',
  null,
  'untrimmed title fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title) values ('Valid Artist', repeat('t', 201)) $$,
  '23514',
  null,
  'overlong title fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, release_year) values ('Valid Artist', 'Valid Title', 1899) $$,
  '23514',
  null,
  'release year before 1900 fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, release_year) values ('Valid Artist', 'Valid Title', 2101) $$,
  '23514',
  null,
  'release year after 2100 fails database constraint'
);

select lives_ok(
  $$ insert into public.releases (artist, title, release_year) values ('Boundary Artist', 'Boundary Year 1900', 1900) $$,
  'release year boundary 1900 succeeds'
);

select lives_ok(
  $$ insert into public.releases (artist, title, release_year) values ('Boundary Artist', 'Boundary Year 2100', 2100) $$,
  'release year boundary 2100 succeeds'
);

select throws_ok(
  $$ insert into public.releases (artist, title, label) values ('Valid Artist', 'Valid Title', ' Label ') $$,
  '23514',
  null,
  'untrimmed optional label fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, label) values ('Valid Artist', 'Valid Title', '') $$,
  '23514',
  null,
  'blank optional label fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, catalog_number) values ('Valid Artist', 'Valid Title', ' CAT-1 ') $$,
  '23514',
  null,
  'untrimmed catalog_number fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, catalog_number) values ('Valid Artist', 'Valid Title', repeat('c', 121)) $$,
  '23514',
  null,
  'overlong catalog_number fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, country) values ('Valid Artist', 'Valid Title', ' US ') $$,
  '23514',
  null,
  'untrimmed country fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, country) values ('Valid Artist', 'Valid Title', repeat('u', 81)) $$,
  '23514',
  null,
  'overlong country fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, format) values ('Valid Artist', 'Valid Title', ' LP ') $$,
  '23514',
  null,
  'untrimmed format fails database constraint'
);

select throws_ok(
  $$ insert into public.releases (artist, title, format) values ('Valid Artist', 'Valid Title', repeat('f', 81)) $$,
  '23514',
  null,
  'overlong format fails database constraint'
);

select lives_ok(
  $$ insert into public.releases (artist, title, release_year, label, catalog_number, country, format)
     values ('Valid Artist', 'Valid Title', 2000, null, 'CAT-OK', 'GB', '12 inch') $$,
  'valid nullable/optional metadata succeeds'
);

select ok(
  (
    select updated_at > created_at
    from public.releases
    where title = 'Album A Updated'
    limit 1
  ),
  'release updated_at changes when editable metadata changes'
);

reset role;

insert into public.releases (
  id,
  created_by,
  source,
  artist,
  title
) values (
  '10000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000b2',
  'manual',
  'Artist B',
  'Album B'
);

insert into public.collection_items (
  id,
  user_id,
  release_id
) values (
  '20000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000b2',
  '10000000-0000-4000-8000-0000000000b2'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.releases where title = 'Album B'),
  0,
  'User A cannot select User B manual release'
);

select lives_ok(
  $$ update public.releases set title = 'Hijacked Album B' where id = '10000000-0000-4000-8000-0000000000b2' $$,
  'User A update against User B manual release is safely filtered by RLS'
);

reset role;

select is(
  (select title from public.releases where id = '10000000-0000-4000-8000-0000000000b2'),
  'Album B',
  'User A cannot update User B manual release'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ insert into public.collection_items (release_id)
     values ('10000000-0000-4000-8000-0000000000b2') $$,
  '42501',
  null,
  'User A cannot attach collection item to User B manual release by guessed UUID'
);

select is(
  (select count(*)::int from public.collection_items where release_id = '10000000-0000-4000-8000-0000000000b2'),
  0,
  'User A cannot see User B collection item'
);

select lives_ok(
  $$ delete from public.collection_items where release_id = '10000000-0000-4000-8000-0000000000b2' $$,
  'User A delete against User B collection item is safely filtered by RLS'
);

reset role;

select is(
  (select count(*)::int from public.collection_items where id = '20000000-0000-4000-8000-0000000000b2'),
  1,
  'User A cannot delete User B collection item'
);

select throws_ok(
  $$ delete from public.releases where id = '10000000-0000-4000-8000-0000000000b2' $$,
  '23503',
  null,
  'restrictive release FK prevents deleting a referenced release'
);

insert into public.releases (
  id,
  created_by,
  source,
  artist,
  title
) values (
  '10000000-0000-4000-8000-0000000000c3',
  '00000000-0000-4000-8000-0000000000c3',
  'manual',
  'Artist C',
  'Album C'
);

delete from auth.users
where id = '00000000-0000-4000-8000-0000000000c3';

select is(
  (select created_by from public.releases where id = '10000000-0000-4000-8000-0000000000c3'),
  null,
  'deleting profile owner sets releases.created_by to null'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.releases where id = '10000000-0000-4000-8000-0000000000c3'),
  0,
  'release with null created_by is inaccessible to normal authenticated users'
);

select * from finish();

rollback;
