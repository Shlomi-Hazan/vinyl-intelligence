begin;

select no_plan();

-- ===========================================================================
-- Milestone 7: public.collection_items personal preference signals -
-- rating (smallint 1..5 or NULL), is_favorite (boolean NOT NULL default
-- false), notes (text, trimmed, 1..1000 chars or NULL). Least-privilege
-- own-row UPDATE for authenticated on exactly those three columns.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Column shape
-- ---------------------------------------------------------------------------
select has_column('public', 'collection_items', 'rating', 'rating exists');
select col_type_is('public', 'collection_items', 'rating', 'smallint', 'rating is smallint');
select col_is_null('public', 'collection_items', 'rating', 'rating is nullable');

select has_column('public', 'collection_items', 'is_favorite', 'is_favorite exists');
select col_type_is('public', 'collection_items', 'is_favorite', 'boolean', 'is_favorite is boolean');
select col_not_null('public', 'collection_items', 'is_favorite', 'is_favorite is NOT NULL');
select col_default_is('public', 'collection_items', 'is_favorite', 'false', 'is_favorite defaults to false');

select has_column('public', 'collection_items', 'notes', 'notes exists');
select col_type_is('public', 'collection_items', 'notes', 'text', 'notes is text');
select col_is_null('public', 'collection_items', 'notes', 'notes is nullable');

-- Milestone 7 intentionally adds no updated_at column and no signal indexes.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collection_items'
      and column_name = 'updated_at'
  ),
  'collection_items has no updated_at column in Milestone 7'
);
select is(
  (
    select count(*)::int from pg_indexes
    where schemaname = 'public' and tablename = 'collection_items'
      and (indexdef ilike '%is_favorite%' or indexdef ilike '%rating%')
  ),
  0,
  'no is_favorite / rating index on collection_items in Milestone 7'
);

-- ---------------------------------------------------------------------------
-- CHECK constraints (evaluated as the table owner, RLS aside)
-- ---------------------------------------------------------------------------
-- Seed one release + auth users to attach collection_items to.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-4000-8000-0000000007a1','authenticated','authenticated',
   'm7-user-a@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-4000-8000-0000000007b2','authenticated','authenticated',
   'm7-user-b@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.releases (id, created_by, source, artist, title)
values
  ('77777777-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000007a1','manual','Signals Artist A','Signals Album A'),
  ('77777777-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000007b2','manual','Signals Artist B','Signals Album B');

insert into public.collection_items (id, user_id, release_id)
values
  ('cccccccc-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000007a1','77777777-0000-4000-8000-00000000000a'),
  ('cccccccc-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000007b2','77777777-0000-4000-8000-00000000000b');

select lives_ok(
  $$ update public.collection_items set rating = null where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  'rating NULL accepted'
);
select lives_ok(
  $$ update public.collection_items set rating = 1 where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  'rating 1 accepted'
);
select lives_ok(
  $$ update public.collection_items set rating = 5 where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  'rating 5 accepted'
);
-- Only the rating-range CHECK boundary is asserted with 23514; fractional
-- input is a smallint coercion concern, not this constraint, so it is not
-- asserted here.
select throws_ok(
  $$ update public.collection_items set rating = 0 where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '23514', null, 'rating 0 rejected by the rating-range CHECK'
);
select throws_ok(
  $$ update public.collection_items set rating = 6 where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '23514', null, 'rating 6 rejected by the rating-range CHECK'
);

select lives_ok(
  $$ update public.collection_items set notes = null where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  'notes NULL accepted'
);
select lives_ok(
  $$ update public.collection_items set notes = repeat('a', 1000) where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  'notes of exactly 1000 chars accepted'
);
select throws_ok(
  $$ update public.collection_items set notes = repeat('a', 1001) where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '23514', null, 'notes of 1001 chars rejected'
);
select throws_ok(
  $$ update public.collection_items set notes = '   ' where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '23514', null, 'whitespace-only notes rejected'
);
select throws_ok(
  $$ update public.collection_items set notes = ' leading space' where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '23514', null, 'untrimmed notes rejected'
);

-- reset the row before the RLS behavioural section
update public.collection_items
  set rating = null, is_favorite = false, notes = null
  where id = 'cccccccc-0000-4000-8000-00000000000a';

-- ---------------------------------------------------------------------------
-- Grants: authenticated may UPDATE exactly rating / is_favorite / notes
-- ---------------------------------------------------------------------------
select ok(has_column_privilege('authenticated', 'public.collection_items', 'rating', 'UPDATE'),
  'authenticated can UPDATE collection_items.rating');
select ok(has_column_privilege('authenticated', 'public.collection_items', 'is_favorite', 'UPDATE'),
  'authenticated can UPDATE collection_items.is_favorite');
select ok(has_column_privilege('authenticated', 'public.collection_items', 'notes', 'UPDATE'),
  'authenticated can UPDATE collection_items.notes');
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

-- Phase D (migration 20260904121000): owner-added personal genres, on the
-- collection item the user owns - the shared releases row is never touched.
select has_column('public', 'collection_items', 'personal_genres', 'personal_genres exists');
select col_type_is('public', 'collection_items', 'personal_genres', 'text[]', 'personal_genres is text[]');
select col_not_null('public', 'collection_items', 'personal_genres', 'personal_genres is NOT NULL');
select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.collection_items'::regclass and a.attname = 'personal_genres'
  ) like '%''{}''%',
  'personal_genres defaults to an empty array'
);
select ok(has_column_privilege('authenticated', 'public.collection_items', 'personal_genres', 'UPDATE'),
  'Phase D: authenticated can UPDATE collection_items.personal_genres');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.collection_items'::regclass
      and conname = 'collection_items_personal_genres_valid'
  ),
  'personal_genres has a validity CHECK (reuses public.release_genres_valid)'
);

-- Exactly the four collection_items policies (3 existing + 1 new UPDATE).
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'collection_items'),
  4,
  'collection_items has 4 RLS policies (own-row select/insert/delete + the new own-row UPDATE)'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collection_items'
      and policyname = 'Users can update their own collection item signals'
      and cmd = 'UPDATE'
  ),
  'the new UPDATE policy exists'
);

-- ---------------------------------------------------------------------------
-- Behavioural under the authenticated role
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000007a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ update public.collection_items
       set rating = 4, is_favorite = true, notes = 'a personal note'
       where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  'User A can update the personal signals on their own collection item'
);
select is(
  (select rating from public.collection_items where id = 'cccccccc-0000-4000-8000-00000000000a'),
  4::smallint,
  'User A''s rating persisted'
);
select is(
  (select notes from public.collection_items where id = 'cccccccc-0000-4000-8000-00000000000a'),
  'a personal note',
  'User A''s note persisted'
);

-- Cross-user UPDATE: RLS USING filters the row out - zero rows affected, NO error.
select lives_ok(
  $$ update public.collection_items set is_favorite = true
       where id = 'cccccccc-0000-4000-8000-00000000000b' $$,
  'User A''s UPDATE targeting User B''s item runs without error'
);

-- Phase D: personal genres - add to own item, cannot touch User B's, and the
-- shared releases row is never written.
select lives_ok(
  $$ update public.collection_items set personal_genres = array['rap','west coast hip hop']
       where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  'User A can set personal_genres on their own item'
);
select is(
  (select personal_genres from public.collection_items where id = 'cccccccc-0000-4000-8000-00000000000a'),
  array['rap','west coast hip hop'],
  'personal_genres persisted on User A''s item'
);
select throws_ok(
  $$ update public.collection_items set personal_genres = array['UPPERCASE']
       where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '23514', null,
  'an un-normalised personal genre is rejected by the CHECK'
);
select lives_ok(
  $$ update public.collection_items set personal_genres = array['rap']
       where id = 'cccccccc-0000-4000-8000-00000000000b' $$,
  'User A''s personal_genres UPDATE targeting User B''s item runs without error (0 rows)'
);
reset role;
select is(
  (select personal_genres from public.collection_items where id = 'cccccccc-0000-4000-8000-00000000000b'),
  '{}'::text[],
  'User B''s personal_genres untouched by User A''s cross-user attempt'
);
-- the shared releases row of User A's item still has whatever it had (no write)
select is(
  (select array_length(genres, 1) from public.releases
     where id = (select release_id from public.collection_items where id = 'cccccccc-0000-4000-8000-00000000000a')),
  null,
  'the shared release row was not modified by a personal-genre change'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000007a1', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
set local role authenticated;

-- Ownership / release-id mutation is a column-privilege failure (42501),
-- independent of RLS.
select throws_ok(
  $$ update public.collection_items set user_id = '00000000-0000-4000-8000-0000000007b2'
       where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '42501', null,
  'User A cannot change user_id (no column grant)'
);
select throws_ok(
  $$ update public.collection_items set release_id = '77777777-0000-4000-8000-00000000000b'
       where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '42501', null,
  'User A cannot change release_id (no column grant)'
);

reset role;

-- User B's item is untouched by User A's cross-user attempt.
select is(
  (select is_favorite from public.collection_items where id = 'cccccccc-0000-4000-8000-00000000000b'),
  false,
  'User B''s is_favorite was not changed by User A'
);

-- ---------------------------------------------------------------------------
-- anon has no access to collection_items (unchanged)
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select count(*) from public.collection_items $$,
  '42501', null, 'anon cannot read collection_items'
);
select throws_ok(
  $$ update public.collection_items set is_favorite = true
       where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
  '42501', null, 'anon cannot update collection_items'
);
reset role;

select * from finish();

rollback;
