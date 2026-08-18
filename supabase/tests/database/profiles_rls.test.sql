begin;

select plan(43);

select ok(
  to_regclass('public.profiles') is not null,
  'public.profiles exists'
);

select ok(
  exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and i.indisprimary
  ),
  'profiles.id is covered by a primary key'
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
      and child.relname = 'profiles'
      and parent_ns.nspname = 'auth'
      and parent.relname = 'users'
      and con.confdeltype = 'c'
  ),
  'profiles.id references auth.users(id) with on delete cascade'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on public.profiles'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  ),
  2,
  'only two policies exist on profiles'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can select their own profile'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  'self-select policy exists for authenticated role'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update their own profile'
      and cmd = 'UPDATE'
      and roles = array['authenticated']::name[]
  ),
  'self-update policy exists for authenticated role'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'select'),
  'anon has no select privilege on profiles'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'select'),
  'authenticated has select privilege on profiles'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update'),
  'authenticated can update display_name column'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'id', 'update'),
  'authenticated cannot update id column'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'update'),
  'authenticated cannot update created_at column'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'update'),
  'authenticated cannot update updated_at column'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'authenticated has no insert privilege on profiles'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'delete'),
  'authenticated has no delete privilege on profiles'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon has no usage privilege on private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated has no usage privilege on private schema'
);

select ok(
  not has_function_privilege('anon', 'private.create_profile_for_new_user()', 'execute'),
  'anon cannot execute profile creation helper'
);

select ok(
  not has_function_privilege('authenticated', 'private.create_profile_for_new_user()', 'execute'),
  'authenticated cannot execute profile creation helper'
);

select ok(
  not has_function_privilege('anon', 'private.touch_profile_updated_at()', 'execute'),
  'anon cannot execute updated_at helper'
);

select ok(
  not has_function_privilege('authenticated', 'private.touch_profile_updated_at()', 'execute'),
  'authenticated cannot execute updated_at helper'
);

select ok(
  (
    select proacl is not null
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'create_profile_for_new_user'
  ),
  'profile creation helper has explicit function ACL'
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
    'user-a@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Should Not Copy"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-0000000000b2',
    'authenticated',
    'authenticated',
    'user-b@example.test',
    'test-password',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Should Not Copy"}'::jsonb,
    now(),
    now()
  );

select is(
  (
    select count(*)::int
    from public.profiles
    where id in (
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000b2'
    )
  ),
  2,
  'trigger creates exactly one profile for each new auth user'
);

select is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-4000-8000-0000000000a1'
  ),
  null,
  'trigger does not copy display_name metadata'
);

set local role anon;

select throws_ok(
  $$ select count(*) from public.profiles $$,
  '42501',
  null,
  'anon cannot read profiles'
);

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.profiles),
  1,
  'User A can select only User A profile'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where id = '00000000-0000-4000-8000-0000000000b2'
  ),
  0,
  'User A cannot select User B profile'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Alice' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  'User A can update User A display_name'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Mallory' where id = '00000000-0000-4000-8000-0000000000b2' $$,
  'User A cannot update User B profile'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000000c3') $$,
  '42501',
  null,
  'authenticated client cannot insert profiles directly'
);

select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501',
  null,
  'authenticated client cannot delete profiles'
);

select throws_ok(
  $$ update public.profiles set id = '00000000-0000-4000-8000-0000000000d4' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501',
  null,
  'authenticated client cannot update protected id column'
);

select throws_ok(
  $$ update public.profiles set created_at = now() where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501',
  null,
  'authenticated client cannot update protected created_at column'
);

select throws_ok(
  $$ update public.profiles set updated_at = now() where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501',
  null,
  'authenticated client cannot update protected updated_at column'
);

select throws_ok(
  $$ update public.profiles set display_name = '' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  null,
  'blank display_name fails database constraint'
);

select throws_ok(
  $$ update public.profiles set display_name = '   ' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  null,
  'whitespace-only display_name fails database constraint'
);

select throws_ok(
  $$ update public.profiles set display_name = ' Alice ' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  null,
  'untrimmed display_name fails database constraint'
);

select throws_ok(
  $$ update public.profiles set display_name = repeat('a', 81) where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514',
  null,
  'overlong display_name fails database constraint'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Alice Updated' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  'valid display_name succeeds'
);

select throws_ok(
  $$ select private.create_profile_for_new_user() $$,
  '42501',
  null,
  'normal API role cannot invoke profile creation helper'
);

reset role;

select is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-4000-8000-0000000000b2'
  ),
  null,
  'cross-user update did not change User B profile'
);

select ok(
  (
    select updated_at > created_at
    from public.profiles
    where id = '00000000-0000-4000-8000-0000000000a1'
  ),
  'updated_at changes after display_name update'
);

delete from auth.users
where id = '00000000-0000-4000-8000-0000000000b2';

select is(
  (
    select count(*)::int
    from public.profiles
    where id = '00000000-0000-4000-8000-0000000000b2'
  ),
  0,
  'deleting an auth user cascades to its profile'
);

select * from finish();

rollback;
