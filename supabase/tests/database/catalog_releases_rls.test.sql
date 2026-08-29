begin;

select no_plan();

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'releases'
      and column_name in ('provider', 'provider_release_id', 'provider_release_group_id')
    group by table_schema, table_name
    having count(*) = 3
  ),
  'releases has catalog provider identity columns'
);

select ok(
  exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'releases'
      and con.conname = 'releases_provider_release_identity_unique'
      and con.contype = 'u'
  ),
  'releases has a provider release identity unique constraint'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'releases'
      and policyname = 'Authenticated users can select catalog releases'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  'authenticated catalog select policy exists'
);

select ok(
  not has_column_privilege('authenticated', 'public.releases', 'provider', 'insert'),
  'authenticated browser role cannot insert release provider'
);

select ok(
  not has_column_privilege('authenticated', 'public.releases', 'provider_release_id', 'insert'),
  'authenticated browser role cannot insert provider release id'
);

select ok(
  not has_column_privilege('authenticated', 'public.releases', 'provider_release_group_id', 'insert'),
  'authenticated browser role cannot insert provider release group id'
);

select ok(
  not has_column_privilege('authenticated', 'public.releases', 'provider', 'update'),
  'authenticated browser role cannot update release provider'
);

select ok(
  not has_column_privilege('authenticated', 'public.releases', 'provider_release_id', 'update'),
  'authenticated browser role cannot update provider release id'
);

select ok(
  not has_column_privilege('authenticated', 'public.releases', 'provider_release_group_id', 'update'),
  'authenticated browser role cannot update provider release group id'
);

select ok(
  not has_table_privilege('anon', 'public.releases', 'select'),
  'anon still has no release-table select'
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
    '00000000-0000-4000-8000-0000000004a1',
    'authenticated',
    'authenticated',
    'catalog-a@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-0000000004b2',
    'authenticated',
    'authenticated',
    'catalog-b@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-0000000004c3',
    'authenticated',
    'authenticated',
    'catalog-c@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

select lives_ok(
  $$ insert into public.releases (
       id,
       created_by,
       source,
       provider,
       provider_release_id,
       provider_release_group_id,
       artist,
       title,
       release_year,
       label,
       catalog_number,
       country,
       format
     ) values (
       '40000000-0000-4000-8000-000000000001',
       null,
       'catalog',
       'musicbrainz',
       '11111111-1111-4111-8111-111111111111',
       '22222222-2222-4222-8222-222222222222',
       'Catalog Artist',
       'Catalog Album',
       1973,
       'Harvest',
       'SHVL 804',
       'GB',
       'LP'
     ) $$,
  'service role can create a valid MusicBrainz catalog release'
);

select throws_ok(
  $$ insert into public.releases (
       created_by,
       source,
       provider,
       provider_release_id,
       artist,
       title
     ) values (
       null,
       'catalog',
       'musicbrainz',
       '11111111-1111-4111-8111-111111111111',
       'Duplicate Artist',
       'Duplicate Album'
     ) $$,
  '23505',
  null,
  'provider release identity is unique for catalog rows'
);

select lives_ok(
  $$ insert into public.releases (created_by, source, artist, title)
     values (null, 'manual', 'Orphan Manual Artist', 'Orphan Manual Album') $$,
  'manual row may have null created_by for preserved account-deletion semantics'
);

select lives_ok(
  $$ insert into public.releases (created_by, source, artist, title)
     values (null, 'manual', 'Duplicate Manual Artist', 'Duplicate Manual Album') $$,
  'first null-provider manual row can exist'
);

select lives_ok(
  $$ insert into public.releases (created_by, source, artist, title)
     values (null, 'manual', 'Duplicate Manual Artist', 'Duplicate Manual Album') $$,
  'second null-provider manual row can exist despite provider identity uniqueness'
);

select throws_ok(
  $$ insert into public.releases (
       created_by,
       source,
       provider,
       provider_release_id,
       artist,
       title
     ) values (
       null,
       'manual',
       'musicbrainz',
       null,
       'Invalid Manual Artist',
       'Invalid Manual Album'
     ) $$,
  '23514',
  null,
  'manual release cannot carry provider metadata'
);

select throws_ok(
  $$ insert into public.releases (
       created_by,
       source,
       provider,
       provider_release_id,
       artist,
       title
     ) values (
       null,
       'catalog',
       null,
       '33333333-3333-4333-8333-333333333333',
       'Invalid Catalog Artist',
       'Invalid Catalog Album'
     ) $$,
  '23514',
  null,
  'catalog release requires provider'
);

select throws_ok(
  $$ insert into public.releases (
       created_by,
       source,
       provider,
       provider_release_id,
       artist,
       title
     ) values (
       null,
       'catalog',
       'musicbrainz',
       null,
       'Invalid Catalog Artist',
       'Invalid Catalog Album'
     ) $$,
  '23514',
  null,
  'catalog release requires provider release id'
);

select throws_ok(
  $$ insert into public.releases (
       created_by,
       source,
       provider,
       provider_release_id,
       artist,
       title
     ) values (
       null,
       'catalog',
       'discogs',
       '44444444-4444-4444-8444-444444444444',
       'Invalid Provider Artist',
       'Invalid Provider Album'
     ) $$,
  '23514',
  null,
  'catalog provider is limited to approved MusicBrainz value'
);

select throws_ok(
  $$ insert into public.releases (
       created_by,
       source,
       provider,
       provider_release_id,
       artist,
       title
     ) values (
       '00000000-0000-4000-8000-0000000004a1',
       'catalog',
       'musicbrainz',
       '55555555-5555-4555-8555-555555555555',
       'Owned Catalog Artist',
       'Owned Catalog Album'
     ) $$,
  '23514',
  null,
  'catalog created_by does not represent a browser owner'
);

set local role anon;

select throws_ok(
  $$ select count(*) from public.releases where source = 'catalog' $$,
  '42501',
  null,
  'anon cannot read catalog releases'
);

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000004a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.releases where source = 'catalog'),
  1,
  'authenticated user can read shared catalog metadata'
);

select throws_ok(
  $$ insert into public.releases (
       source,
       provider,
       provider_release_id,
       artist,
       title
     ) values (
       'catalog',
       'musicbrainz',
       '66666666-6666-4666-8666-666666666666',
       'Browser Catalog Artist',
       'Browser Catalog Album'
     ) $$,
  '42501',
  null,
  'authenticated browser cannot directly insert catalog release'
);

select lives_ok(
  $$ update public.releases
     set title = 'Browser Mutated Catalog Album'
     where id = '40000000-0000-4000-8000-000000000001' $$,
  'authenticated browser update against catalog release is safely filtered by RLS'
);

reset role;

select is(
  (
    select title
    from public.releases
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  'Catalog Album',
  'authenticated browser cannot mutate shared catalog metadata'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000004a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ update public.releases
     set provider_release_id = '77777777-7777-4777-8777-777777777777'
     where id = '40000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'authenticated browser cannot update provider identity columns'
);

select throws_ok(
  $$ update public.releases
     set source = 'manual'
     where id = '40000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'authenticated browser cannot update release source'
);

select throws_ok(
  $$ delete from public.releases
     where id = '40000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'authenticated browser cannot delete catalog releases'
);

select throws_ok(
  $$ insert into public.collection_items (release_id)
     values ('40000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'authenticated browser cannot attach catalog ownership through manual insert path'
);

reset role;

insert into public.collection_items (
  id,
  user_id,
  release_id
) values (
  '41000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000004a1',
  '40000000-0000-4000-8000-000000000001'
);

insert into public.collection_items (
  id,
  user_id,
  release_id
) values (
  '41000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-0000000004a1',
  '40000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000004a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.collection_items where release_id = '40000000-0000-4000-8000-000000000001'),
  2,
  'duplicate owned copies can reference the same canonical catalog release'
);

select lives_ok(
  $$ delete from public.collection_items
     where id = '41000000-0000-4000-8000-000000000001' $$,
  'authenticated user can delete one owned catalog collection item'
);

select is(
  (select count(*)::int from public.collection_items where release_id = '40000000-0000-4000-8000-000000000001'),
  1,
  'deleting one catalog copy leaves the other owned copy'
);

reset role;

insert into public.releases (
  id,
  created_by,
  source,
  artist,
  title
) values (
  '42000000-0000-4000-8000-0000000004c3',
  '00000000-0000-4000-8000-0000000004c3',
  'manual',
  'Manual Delete Artist',
  'Manual Delete Album'
);

delete from auth.users
where id = '00000000-0000-4000-8000-0000000004c3';

select is(
  (select created_by from public.releases where id = '42000000-0000-4000-8000-0000000004c3'),
  null,
  'existing profile deletion still sets manual release created_by to null'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000004a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.releases where id = '42000000-0000-4000-8000-0000000004c3'),
  0,
  'null-owner manual release remains inaccessible to normal authenticated users'
);

select * from finish();

rollback;
