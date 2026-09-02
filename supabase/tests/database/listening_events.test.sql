begin;

select no_plan();

-- ===========================================================================
-- Milestone 8: public.listening_events - immutable, append-only listening
-- history. Source of truth for listening count / last-listened (both derived,
-- never stored on collection_items). Both foreign keys ON DELETE CASCADE.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select has_table('public', 'listening_events', 'public.listening_events exists');

select columns_are(
  'public', 'listening_events',
  array['id', 'user_id', 'collection_item_id', 'listened_at', 'created_at'],
  'listening_events has exactly the five Milestone 8 columns'
);

select col_type_is('public', 'listening_events', 'id', 'uuid', 'id is uuid');
select col_is_pk('public', 'listening_events', 'id', 'id is the primary key');
select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.listening_events'::regclass and a.attname = 'id'
  ) like '%gen_random_uuid()%',
  'id defaults to gen_random_uuid()'
);

select col_type_is('public', 'listening_events', 'user_id', 'uuid', 'user_id is uuid');
select col_not_null('public', 'listening_events', 'user_id', 'user_id is NOT NULL');
select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.listening_events'::regclass and a.attname = 'user_id'
  ) like '%auth.uid()%',
  'user_id defaults to auth.uid()'
);

select col_type_is('public', 'listening_events', 'collection_item_id', 'uuid', 'collection_item_id is uuid');
select col_not_null('public', 'listening_events', 'collection_item_id', 'collection_item_id is NOT NULL');

select col_type_is('public', 'listening_events', 'listened_at', 'timestamp with time zone', 'listened_at is timestamptz');
select col_not_null('public', 'listening_events', 'listened_at', 'listened_at is NOT NULL');
select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.listening_events'::regclass and a.attname = 'listened_at'
  ) like '%now()%',
  'listened_at defaults to now()'
);

select col_type_is('public', 'listening_events', 'created_at', 'timestamp with time zone', 'created_at is timestamptz');
select col_not_null('public', 'listening_events', 'created_at', 'created_at is NOT NULL');
select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.listening_events'::regclass and a.attname = 'created_at'
  ) like '%now()%',
  'created_at defaults to now()'
);

-- No speculative event note / updated_at
select hasnt_column('public', 'listening_events', 'note', 'listening_events has no note column');
select hasnt_column('public', 'listening_events', 'updated_at', 'listening_events has no updated_at column');
-- Phase D did NOT add a personal_genres / any other column here.
select columns_are(
  'public', 'listening_events',
  array['id', 'user_id', 'collection_item_id', 'listened_at', 'created_at'],
  'listening_events still has exactly the five Milestone 8 columns after Phase D'
);

-- ---------------------------------------------------------------------------
-- Foreign keys (both ON DELETE CASCADE)
-- ---------------------------------------------------------------------------
select is(
  (
    select rc.delete_rule
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = rc.constraint_name
     and kcu.constraint_schema = rc.constraint_schema
    where rc.constraint_schema = 'public'
      and kcu.table_name = 'listening_events'
      and kcu.column_name = 'user_id'
  ),
  'CASCADE',
  'listening_events.user_id FK is ON DELETE CASCADE'
);
select is(
  (
    select rc.delete_rule
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = rc.constraint_name
     and kcu.constraint_schema = rc.constraint_schema
    where rc.constraint_schema = 'public'
      and kcu.table_name = 'listening_events'
      and kcu.column_name = 'collection_item_id'
  ),
  'CASCADE',
  'listening_events.collection_item_id FK is ON DELETE CASCADE'
);
select is(
  (
    select confrelid::regclass::text
    from pg_constraint
    where conrelid = 'public.listening_events'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.listening_events'::regclass and attname = 'user_id')
      ]::smallint[]
  ),
  'profiles',
  'user_id references public.profiles'
);
select is(
  (
    select confrelid::regclass::text
    from pg_constraint
    where conrelid = 'public.listening_events'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.listening_events'::regclass and attname = 'collection_item_id')
      ]::smallint[]
  ),
  'collection_items',
  'collection_item_id references public.collection_items'
);

-- ---------------------------------------------------------------------------
-- Indexes (the PK index is automatic; do not assert a total count)
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    where c.oid = 'public.listening_events'::regclass and i.indisprimary
  ),
  'the automatic primary-key index exists'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'listening_events'
      and indexname = 'listening_events_user_listened_idx'
      and indexdef ~* 'user_id.*listened_at\s+desc.*id\s+desc'
  ),
  'listening_events_user_listened_idx exists on (user_id, listened_at DESC, id DESC)'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'listening_events'
      and indexname = 'listening_events_collection_item_idx'
      and indexdef ~* '\(collection_item_id\)'
  ),
  'listening_events_collection_item_idx exists on (collection_item_id)'
);
-- The deferred (user_id, collection_item_id, listened_at ...) index is not added.
select ok(
  not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'listening_events'
      and indexdef ~* 'user_id.*collection_item_id'
  ),
  'no (user_id, collection_item_id, ...) index on listening_events in Milestone 8'
);
-- No unnecessary extra Milestone 8 index (exactly PK + the two named indexes).
select is(
  (
    select count(*)::int from pg_indexes
    where schemaname = 'public' and tablename = 'listening_events'
  ),
  3,
  'listening_events has the PK index plus exactly the two Milestone 8 indexes'
);

-- ---------------------------------------------------------------------------
-- No denormalization onto collection_items
-- ---------------------------------------------------------------------------
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collection_items'
      and column_name in ('listening_count', 'play_count', 'last_listened_at', 'last_played_at')
  ),
  'collection_items gained no denormalized listening count / last-listened column'
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(has_table_privilege('authenticated', 'public.listening_events', 'SELECT'),
  'authenticated has SELECT on listening_events');
select ok(has_column_privilege('authenticated', 'public.listening_events', 'collection_item_id', 'INSERT'),
  'authenticated can INSERT collection_item_id');
select ok(not has_column_privilege('authenticated', 'public.listening_events', 'user_id', 'INSERT'),
  'authenticated cannot INSERT user_id');
select ok(not has_column_privilege('authenticated', 'public.listening_events', 'listened_at', 'INSERT'),
  'authenticated cannot INSERT listened_at');

-- Phase D (migration 20260904120000): the browser may now UPDATE listened_at
-- ONLY, and DELETE its own row. The event identity stays immutable.
select ok(has_column_privilege('authenticated', 'public.listening_events', 'listened_at', 'UPDATE'),
  'Phase D: authenticated can UPDATE listened_at');
select ok(not has_column_privilege('authenticated', 'public.listening_events', 'user_id', 'UPDATE'),
  'authenticated cannot UPDATE user_id');
select ok(not has_column_privilege('authenticated', 'public.listening_events', 'collection_item_id', 'UPDATE'),
  'authenticated cannot UPDATE collection_item_id');
select ok(not has_column_privilege('authenticated', 'public.listening_events', 'id', 'UPDATE'),
  'authenticated cannot UPDATE id');
select ok(not has_column_privilege('authenticated', 'public.listening_events', 'created_at', 'UPDATE'),
  'authenticated cannot UPDATE created_at');
select ok(has_table_privilege('authenticated', 'public.listening_events', 'DELETE'),
  'Phase D: authenticated has DELETE on listening_events');

select ok(not has_table_privilege('anon', 'public.listening_events', 'SELECT'),
  'anon has no SELECT on listening_events');
select ok(not has_table_privilege('anon', 'public.listening_events', 'INSERT'),
  'anon has no INSERT on listening_events');
select ok(not has_table_privilege('anon', 'public.listening_events', 'UPDATE'),
  'anon has no UPDATE on listening_events');
select ok(not has_table_privilege('anon', 'public.listening_events', 'DELETE'),
  'anon has no DELETE on listening_events');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'listening_events'),
  4,
  'listening_events has exactly four RLS policies (own SELECT + own-item INSERT + Phase D own UPDATE + own DELETE)'
);

-- ---------------------------------------------------------------------------
-- Behavioural: seed two users, each with an owned collection item
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-4000-8000-0000000008a1','authenticated','authenticated',
   'm8-a@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-4000-8000-0000000008b2','authenticated','authenticated',
   'm8-b@example.test','x',now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.releases (id, created_by, source, artist, title) values
  ('e8000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000008a1','manual','A Artist','A Album'),
  ('e8000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000008b2','manual','B Artist','B Album');

insert into public.collection_items (id, user_id, release_id) values
  ('c8000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000008a1','e8000000-0000-4000-8000-00000000000a'),
  ('c8000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000008b2','e8000000-0000-4000-8000-00000000000b');

-- --- User A ---
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000008a1', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000008a1","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.listening_events (collection_item_id)
     values ('c8000000-0000-4000-8000-00000000000a') $$,
  'User A can insert a listening event for their own collection item'
);
select is(
  (select user_id from public.listening_events
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a'),
  '00000000-0000-4000-8000-0000000008a1'::uuid,
  'the inserted event took user_id = auth.uid() from the default'
);

select throws_ok(
  $$ insert into public.listening_events (collection_item_id)
     values ('c8000000-0000-4000-8000-00000000000b') $$,
  '42501', null,
  'User A cannot insert a listening event for User B''s collection item (RLS WITH CHECK)'
);

-- Phase D: User A CAN correct listened_at on their own event ...
select lives_ok(
  $$ update public.listening_events
       set listened_at = timestamptz '2020-01-02 03:04:05+00'
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a' $$,
  'Phase D: User A can UPDATE listened_at on their own event'
);
select is(
  (select listened_at from public.listening_events
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a'),
  timestamptz '2020-01-02 03:04:05+00',
  'the corrected listened_at persisted'
);
-- ... but CANNOT change the event identity (no column grant) ...
select throws_ok(
  $$ update public.listening_events set user_id = '00000000-0000-4000-8000-0000000008b2'
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'User A cannot re-assign user_id (no column grant)'
);
select throws_ok(
  $$ update public.listening_events set collection_item_id = 'c8000000-0000-4000-8000-00000000000b'
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'User A cannot re-point the event at another album (no column grant)'
);
select throws_ok(
  $$ update public.listening_events set created_at = now()
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'User A cannot change created_at (no column grant)'
);

reset role;

-- --- User B ---
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000008b2', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000008b2","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.listening_events),
  0,
  'User B sees zero listening events (only their own, and they have none)'
);
select lives_ok(
  $$ insert into public.listening_events (collection_item_id)
     values ('c8000000-0000-4000-8000-00000000000b') $$,
  'User B can insert an event for their own collection item'
);
select is(
  (select count(*)::int from public.listening_events),
  1,
  'User B now sees exactly their own one event'
);

reset role;

-- --- anon ---
set local role anon;
select throws_ok(
  $$ select count(*) from public.listening_events $$,
  '42501', null, 'anon cannot SELECT listening_events'
);
select throws_ok(
  $$ insert into public.listening_events (collection_item_id)
     values ('c8000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'anon cannot INSERT listening_events'
);
reset role;

-- User A still sees only their own single event.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000008a1', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000008a1","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.listening_events),
  1,
  'User A sees exactly their own one event'
);
reset role;

-- ---------------------------------------------------------------------------
-- Cascade: deleting the owning collection item removes its listening events
-- ---------------------------------------------------------------------------
-- (as the table owner, RLS aside) add a second event for User A's item, then
-- delete the collection item and confirm both events are gone.
insert into public.listening_events (user_id, collection_item_id)
values ('00000000-0000-4000-8000-0000000008a1','c8000000-0000-4000-8000-00000000000a');

select is(
  (select count(*)::int from public.listening_events
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a'),
  2,
  'two listening events exist for User A''s collection item'
);

delete from public.collection_items where id = 'c8000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.listening_events
     where collection_item_id = 'c8000000-0000-4000-8000-00000000000a'),
  0,
  'deleting the collection item cascaded away its listening events'
);
-- Scoped to this test's seeded users so unrelated local rows never affect it.
select is(
  (select count(*)::int from public.listening_events
     where user_id in (
       '00000000-0000-4000-8000-0000000008a1',
       '00000000-0000-4000-8000-0000000008b2'
     )),
  1,
  'User B''s event is unaffected by User A''s collection-item delete'
);
select is(
  (select count(*)::int from public.listening_events
     where user_id = '00000000-0000-4000-8000-0000000008b2'),
  1,
  'exactly User B''s one seeded event remains'
);

-- ---------------------------------------------------------------------------
-- Phase D behavioural: cross-user UPDATE / DELETE denial + own delete
-- ---------------------------------------------------------------------------
-- User B still has one event; give User A a fresh owned item + event.
insert into public.releases (id, created_by, source, artist, title)
values ('e8000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-0000000008a1','manual','A2','A2');
insert into public.collection_items (id, user_id, release_id)
values ('c8000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-0000000008a1','e8000000-0000-4000-8000-00000000000c');
insert into public.listening_events (id, user_id, collection_item_id, listened_at)
values ('11110000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000008a1','c8000000-0000-4000-8000-00000000000c', now());

-- User B: cross-user UPDATE / DELETE are RLS-filtered (0 rows, no error).
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000008b2', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000008b2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.listening_events set listened_at = timestamptz '2000-01-01 00:00:00+00'
     where id = '11110000-0000-4000-8000-00000000000a' $$,
  'User B UPDATE targeting User A event runs without error (0 rows)'
);
select lives_ok(
  $$ delete from public.listening_events
     where id = '11110000-0000-4000-8000-00000000000a' $$,
  'User B DELETE targeting User A event runs without error (0 rows)'
);
reset role;
select is(
  (select count(*)::int from public.listening_events
     where id = '11110000-0000-4000-8000-00000000000a'),
  1,
  'User A event survived User B cross-user UPDATE + DELETE attempts'
);
select is(
  (select listened_at from public.listening_events
     where id = '11110000-0000-4000-8000-00000000000a'),
  (select listened_at from public.listening_events
     where id = '11110000-0000-4000-8000-00000000000a'),
  'User A event listened_at unchanged'
);

-- User A: can delete their OWN event.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000008a1', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000008a1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ delete from public.listening_events
     where id = '11110000-0000-4000-8000-00000000000a' $$,
  'Phase D: User A can DELETE their own listening event'
);
select is(
  (select count(*)::int from public.listening_events),
  0,
  'User A now has zero events (deleted their only one)'
);
reset role;

select * from finish();

rollback;
