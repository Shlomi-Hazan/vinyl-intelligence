begin;

select no_plan();

-- ===========================================================================
-- Milestone 6: public.releases.genres text[] - catalog-sourced / manual genre
-- metadata for collection browse/filter. No GIN index in Milestone 6 (client
-- side filtering only). No persisted decade column.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Column shape
-- ---------------------------------------------------------------------------
select has_column('public', 'releases', 'genres', 'public.releases.genres exists');
select col_type_is('public', 'releases', 'genres', 'text[]', 'genres is text[]');
select col_not_null('public', 'releases', 'genres', 'genres is NOT NULL');
select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.releases'::regclass and a.attname = 'genres'
  ) like '%{}%',
  'genres has an empty-array column default'
);

-- Milestone 6 intentionally adds NO GIN index on genres.
select is(
  (
    select count(*)::int
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'releases'
      and indexdef ilike '%using gin%genres%'
  ),
  0,
  'no GIN index on releases.genres in Milestone 6'
);

-- ---------------------------------------------------------------------------
-- Validator function + CHECK constraint
-- ---------------------------------------------------------------------------
select has_function(
  'public', 'release_genres_valid', array['text[]'],
  'public.release_genres_valid(text[]) exists'
);
select ok(
  not has_function_privilege('anon', 'public.release_genres_valid(text[])', 'execute'),
  'anon cannot execute release_genres_valid'
);
select ok(
  has_function_privilege('authenticated', 'public.release_genres_valid(text[])', 'execute'),
  'authenticated can execute release_genres_valid (needed for the manual-write CHECK)'
);
select ok(
  has_function_privilege('service_role', 'public.release_genres_valid(text[])', 'execute'),
  'service_role can execute release_genres_valid (needed for the catalog-write CHECK)'
);

select is(public.release_genres_valid('{}'::text[]), true, 'empty array is valid');
select is(
  public.release_genres_valid(array['jazz', 'hard bop', 'soul-jazz']),
  true,
  'a normal lowercase trimmed genre array is valid'
);
select is(
  public.release_genres_valid(array[
    'a','b','c','d','e','f','g','h','i','j','k','l'
  ]),
  true,
  'exactly 12 genres is valid'
);
select is(
  public.release_genres_valid(array[
    'a','b','c','d','e','f','g','h','i','j','k','l','m'
  ]),
  false,
  '13 genres is invalid'
);
select is(
  public.release_genres_valid(array['jazz', null]::text[]),
  false,
  'a NULL element is invalid'
);
select is(public.release_genres_valid(array['']), false, 'a blank genre is invalid');
select is(public.release_genres_valid(array['  ']), false, 'a whitespace-only genre is invalid');
select is(public.release_genres_valid(array[' jazz']), false, 'a leading-space genre is invalid');
select is(public.release_genres_valid(array['jazz ']), false, 'a trailing-space genre is invalid');
select is(public.release_genres_valid(array['Jazz']), false, 'an uppercase genre is invalid');
select is(
  public.release_genres_valid(array[repeat('a', 41)]),
  false,
  'a genre longer than 40 chars is invalid'
);
select is(
  public.release_genres_valid(array[repeat('a', 40)]),
  true,
  'a genre of exactly 40 chars is valid'
);

-- ---------------------------------------------------------------------------
-- Column privileges (Milestone 6 manual genre editing is human-approved)
-- ---------------------------------------------------------------------------
select ok(
  has_column_privilege('authenticated', 'public.releases', 'genres', 'INSERT'),
  'authenticated can insert releases.genres'
);
select ok(
  has_column_privilege('authenticated', 'public.releases', 'genres', 'UPDATE'),
  'authenticated can update releases.genres'
);
-- unchanged least privilege
select ok(
  not has_column_privilege('authenticated', 'public.releases', 'source', 'INSERT'),
  'authenticated still cannot insert releases.source'
);
select ok(
  not has_column_privilege('authenticated', 'public.releases', 'updated_at', 'UPDATE'),
  'authenticated still cannot update releases.updated_at'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'releases'),
  4,
  'the releases RLS policy set is unchanged (4 policies)'
);

-- ---------------------------------------------------------------------------
-- Behavioral: authenticated manual insert / update / clear of genres
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-0000000006c1',
  'authenticated', 'authenticated', 'genre-probe@example.test',
  'test-password', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000006c1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000006c1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ insert into public.releases (artist, title)
     values ('No Genre Artist', 'No Genre Album') $$,
  'authenticated can create a manual release without a genre'
);

select is(
  (select genres from public.releases where title = 'No Genre Album'),
  '{}'::text[],
  'a release created without genres defaults to an empty array'
);

select lives_ok(
  $$ insert into public.releases (artist, title, genres)
     values ('Genre Artist', 'Genre Album', array['jazz']) $$,
  'authenticated can create a manual release with a genre'
);

select is(
  (select genres from public.releases where title = 'Genre Album'),
  array['jazz'],
  'the manual genre persisted'
);

select throws_ok(
  $$ insert into public.releases (artist, title, genres)
     values ('Bad Genre Artist', 'Bad Genre Album', array['Jazz']) $$,
  '23514',
  null,
  'an uppercase manual genre is rejected by the CHECK constraint'
);

-- updated_at bumps when the genre changes
select set_config('vinyl.updated_before', (
  select updated_at::text from public.releases where title = 'Genre Album'
), true);

select lives_ok(
  $$ update public.releases set genres = array['jazz', 'fusion']
     where title = 'Genre Album' $$,
  'authenticated can edit the manual genre'
);

select ok(
  (select updated_at from public.releases where title = 'Genre Album')
    > (current_setting('vinyl.updated_before'))::timestamptz,
  'updated_at changes when the manual genre changes'
);

select lives_ok(
  $$ update public.releases set genres = '{}'::text[]
     where title = 'Genre Album' $$,
  'authenticated can clear the manual genre'
);

select is(
  (select genres from public.releases where title = 'Genre Album'),
  '{}'::text[],
  'the cleared genre is stored as an empty array'
);

reset role;

-- ---------------------------------------------------------------------------
-- Behavioral: service_role writes catalog genres with its existing privileges
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ set local role service_role;
     insert into public.releases (
       source, provider, provider_release_id, provider_release_group_id,
       artist, title, genres, created_by
     ) values (
       'catalog', 'musicbrainz',
       'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
       'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
       'Catalog Genre Artist', 'Catalog Genre Album',
       array['ambient', 'electronic'], null
     );
     reset role; $$,
  'service_role can insert a catalog release with genres (existing table privilege)'
);

select is(
  (
    select genres from public.releases
    where provider_release_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  array['ambient', 'electronic'],
  'the catalog genres persisted'
);

select lives_ok(
  $$ set local role service_role;
     update public.releases set genres = array['ambient']
       where provider_release_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
     reset role; $$,
  'service_role can update catalog genres (on-conflict upsert path)'
);

select throws_ok(
  $$ set local role service_role;
     insert into public.releases (
       source, provider, provider_release_id, artist, title, genres, created_by
     ) values (
       'catalog', 'musicbrainz',
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
       'Bad Catalog Genre', 'Bad Catalog Genre',
       array['jazz', 'jazz', 'jazz', 'jazz', 'jazz', 'jazz',
             'jazz', 'jazz', 'jazz', 'jazz', 'jazz', 'jazz', 'jazz'],
       null
     ); $$,
  '23514',
  null,
  'a >12-genre catalog write is rejected by the CHECK constraint'
);

select * from finish();

rollback;
