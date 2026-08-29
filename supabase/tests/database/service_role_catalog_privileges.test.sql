begin;

select no_plan();

-- ===========================================================================
-- Milestone 4 blocker regression: the approved server-side catalog persistence
-- path (netlify/functions/_shared/catalog-handlers.mts) runs as the Supabase
-- service role. service_role has BYPASSRLS, but PostgreSQL still enforces
-- ordinary SQL table privileges. Before the fix migration, service_role had no
-- SELECT/INSERT/UPDATE on public.releases or public.collection_items and the
-- add flow failed with SQLSTATE 42501 "permission denied for table releases".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Effective privilege introspection (not policy-name inspection).
-- ---------------------------------------------------------------------------

-- service_role CAN do exactly what the catalog-add flow needs.
select ok(
  has_table_privilege('service_role', 'public.releases', 'SELECT'),
  'service_role has SELECT on public.releases'
);
select ok(
  has_table_privilege('service_role', 'public.releases', 'INSERT'),
  'service_role has INSERT on public.releases'
);
select ok(
  has_table_privilege('service_role', 'public.releases', 'UPDATE'),
  'service_role has UPDATE on public.releases'
);
select ok(
  has_table_privilege('service_role', 'public.collection_items', 'SELECT'),
  'service_role has SELECT on public.collection_items'
);
select ok(
  has_table_privilege('service_role', 'public.collection_items', 'INSERT'),
  'service_role has INSERT on public.collection_items'
);

-- service_role must NOT gain privileges the server path does not use.
select ok(
  not has_table_privilege('service_role', 'public.releases', 'DELETE'),
  'service_role does not have DELETE on public.releases'
);
select ok(
  not has_table_privilege('service_role', 'public.collection_items', 'UPDATE'),
  'service_role does not have UPDATE on public.collection_items'
);
select ok(
  not has_table_privilege('service_role', 'public.collection_items', 'DELETE'),
  'service_role does not have DELETE on public.collection_items'
);

-- The fix must not weaken existing browser-role least privilege.
select ok(
  not has_table_privilege('anon', 'public.releases', 'SELECT'),
  'anon still has no SELECT on public.releases'
);
select ok(
  not has_table_privilege('anon', 'public.collection_items', 'SELECT'),
  'anon still has no SELECT on public.collection_items'
);
select ok(
  not has_table_privilege('authenticated', 'public.releases', 'DELETE'),
  'authenticated still has no DELETE on public.releases'
);
select ok(
  not has_column_privilege('authenticated', 'public.releases', 'provider', 'INSERT'),
  'authenticated still cannot insert the release provider column'
);
select ok(
  not has_column_privilege('authenticated', 'public.releases', 'source', 'UPDATE'),
  'authenticated still cannot update the release source column'
);

-- ---------------------------------------------------------------------------
-- Behavioral proof under the real role. service_role bypasses RLS, so a
-- failure here is an ordinary table-privilege failure, exactly the blocker.
-- ---------------------------------------------------------------------------

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
) values (
  '00000000-0000-4000-8000-0000000009f1',
  'authenticated',
  'authenticated',
  'service-role-privilege-probe@example.test',
  'test-password',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select lives_ok(
  $$ set local role service_role;
     insert into public.releases (
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
       format,
       created_by
     ) values (
       'catalog',
       'musicbrainz',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       'Probe Artist',
       'Probe Album',
       1979,
       'Probe Records',
       'PR-1',
       'GB',
       'LP',
       null
     );
     reset role; $$,
  'service_role can insert a provider-backed catalog release'
);

select lives_ok(
  $$ set local role service_role;
     update public.releases
       set title = 'Probe Album (Remaster)'
       where provider = 'musicbrainz'
         and provider_release_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
     reset role; $$,
  'service_role can update a provider-backed catalog release (upsert on-conflict path)'
);

select lives_ok(
  $$ set local role service_role;
     select count(*) from public.releases
       where provider_release_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
     reset role; $$,
  'service_role can select a provider-backed catalog release'
);

select is(
  (
    select title
    from public.releases
    where provider_release_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'Probe Album (Remaster)',
  'the catalog release persisted by service_role is stored and updated'
);

select lives_ok(
  $$ set local role service_role;
     insert into public.collection_items (user_id, release_id)
       select
         '00000000-0000-4000-8000-0000000009f1',
         id
       from public.releases
       where provider_release_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
     reset role; $$,
  'service_role can insert the owning collection item'
);

select lives_ok(
  $$ set local role service_role;
     select count(*) from public.collection_items
       where user_id = '00000000-0000-4000-8000-0000000009f1';
     reset role; $$,
  'service_role can select the owning collection item'
);

select is(
  (
    select count(*)::int
    from public.collection_items
    where user_id = '00000000-0000-4000-8000-0000000009f1'
  ),
  1,
  'exactly one collection item was persisted by service_role'
);

-- Least-privilege behavior: the blocked operations still throw 42501.
select throws_ok(
  $$ set local role service_role;
     delete from public.releases
       where provider_release_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; $$,
  '42501',
  null,
  'service_role cannot delete from public.releases'
);

select throws_ok(
  $$ set local role service_role;
     update public.collection_items
       set release_id = release_id
       where user_id = '00000000-0000-4000-8000-0000000009f1'; $$,
  '42501',
  null,
  'service_role cannot update public.collection_items'
);

select throws_ok(
  $$ set local role service_role;
     delete from public.collection_items
       where user_id = '00000000-0000-4000-8000-0000000009f1'; $$,
  '42501',
  null,
  'service_role cannot delete from public.collection_items'
);

select * from finish();

rollback;
