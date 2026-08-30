begin;

select no_plan();

-- ===========================================================================
-- Milestone 5 model-call telemetry (public.model_calls).
--
-- The recognition Netlify Function inserts rows as the Supabase service role.
-- service_role has BYPASSRLS, but PostgreSQL still enforces ordinary table
-- privileges, so this file checks BOTH the effective grants (has_table_privilege)
-- AND the behavioral result under SET LOCAL ROLE, so the Milestone 4
-- BYPASSRLS/grant mistake cannot recur. Inserts are self-isolating (unique
-- synthetic user ids) so the file passes without a clean reset.
-- ===========================================================================

-- Schema shape ---------------------------------------------------------------

select has_table('public', 'model_calls', 'public.model_calls exists');

select columns_are(
  'public',
  'model_calls',
  array[
    'id', 'user_id', 'feature', 'provider', 'model', 'success',
    'latency_ms', 'prompt_tokens', 'completion_tokens', 'estimated_cost_usd',
    'error_category', 'created_at'
  ],
  'public.model_calls has exactly the approved Milestone 5 columns'
);

select col_is_pk('public', 'model_calls', 'id', 'id is the primary key');

select fk_ok(
  'public', 'model_calls', 'user_id',
  'public', 'profiles', 'id',
  'model_calls.user_id references profiles.id'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'model_calls'
      and indexname = 'model_calls_user_created_idx'
  ),
  'model_calls has the (user_id, created_at desc) index'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.model_calls'::regclass),
  'row level security is enabled on public.model_calls'
);

-- Policy: exactly one, SELECT, authenticated -------------------------------

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'model_calls'),
  1,
  'public.model_calls has exactly one RLS policy'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'model_calls'
      and policyname = 'Users can select their own model calls'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  'the only policy is the authenticated own-row SELECT policy'
);

-- Effective table privileges ----------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.model_calls', 'SELECT'),
  'authenticated has SELECT on public.model_calls'
);
select ok(
  not has_table_privilege('authenticated', 'public.model_calls', 'INSERT'),
  'authenticated has no INSERT on public.model_calls'
);
select ok(
  not has_table_privilege('authenticated', 'public.model_calls', 'UPDATE'),
  'authenticated has no UPDATE on public.model_calls'
);
select ok(
  not has_table_privilege('authenticated', 'public.model_calls', 'DELETE'),
  'authenticated has no DELETE on public.model_calls'
);

select ok(
  not has_table_privilege('anon', 'public.model_calls', 'SELECT'),
  'anon has no SELECT on public.model_calls'
);
select ok(
  not has_table_privilege('anon', 'public.model_calls', 'INSERT'),
  'anon has no INSERT on public.model_calls'
);

select ok(
  has_table_privilege('service_role', 'public.model_calls', 'INSERT'),
  'service_role has INSERT on public.model_calls'
);
select ok(
  not has_table_privilege('service_role', 'public.model_calls', 'SELECT'),
  'service_role has no SELECT on public.model_calls (insert-only telemetry)'
);
select ok(
  not has_table_privilege('service_role', 'public.model_calls', 'UPDATE'),
  'service_role has no UPDATE on public.model_calls'
);
select ok(
  not has_table_privilege('service_role', 'public.model_calls', 'DELETE'),
  'service_role has no DELETE on public.model_calls'
);

-- Seed two runtime-style users ------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-00000000c501',
    'authenticated', 'authenticated', 'model-calls-a@example.test',
    'test-password', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-4000-8000-00000000c502',
    'authenticated', 'authenticated', 'model-calls-b@example.test',
    'test-password', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

-- Behavioral: service_role can insert, cannot read/update/delete -------------

select lives_ok(
  $$ set local role service_role;
     insert into public.model_calls (
       user_id, feature, provider, model, success,
       latency_ms, prompt_tokens, completion_tokens, estimated_cost_usd,
       error_category
     ) values (
       '00000000-0000-4000-8000-00000000c501',
       'cover_vision', 'openrouter', 'google/gemini-3.1-flash-lite', true,
       1234, 420, 150, 0.000600, null
     );
     reset role; $$,
  'service_role can insert a cover_vision telemetry row'
);

select lives_ok(
  $$ set local role service_role;
     insert into public.model_calls (
       user_id, feature, provider, model, success, error_category
     ) values (
       '00000000-0000-4000-8000-00000000c501',
       'cover_vision', 'openrouter', 'google/gemini-3.1-flash-lite', false,
       'provider_timeout'
     );
     reset role; $$,
  'service_role can insert a failed-call telemetry row with null metrics'
);

select throws_ok(
  $$ set local role service_role;
     select count(*) from public.model_calls; $$,
  '42501',
  null,
  'service_role cannot select from public.model_calls'
);

select throws_ok(
  $$ set local role service_role;
     update public.model_calls set success = false
     where user_id = '00000000-0000-4000-8000-00000000c501'; $$,
  '42501',
  null,
  'service_role cannot update public.model_calls'
);

select throws_ok(
  $$ set local role service_role;
     delete from public.model_calls
     where user_id = '00000000-0000-4000-8000-00000000c501'; $$,
  '42501',
  null,
  'service_role cannot delete from public.model_calls'
);

-- Behavioral: RLS ownership -------------------------------------------------

select is(
  (select count(*)::int from public.model_calls
   where user_id = '00000000-0000-4000-8000-00000000c501'),
  2,
  'both telemetry rows are present for user A (checked as superuser)'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000c502","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.model_calls),
  0,
  'user B cannot read user A model-call rows through RLS'
);

select throws_ok(
  $$ insert into public.model_calls (user_id, feature, provider, model, success)
     values ('00000000-0000-4000-8000-00000000c502',
             'cover_vision', 'openrouter', 'google/gemini-3.1-flash-lite', true) $$,
  '42501',
  null,
  'authenticated browser role cannot insert model_calls rows'
);

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000c501","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.model_calls),
  2,
  'user A reads only their own two model-call rows through RLS'
);

reset role;

-- Check constraints --------------------------------------------------------

select throws_ok(
  $$ insert into public.model_calls (user_id, feature, provider, model, success)
     values ('00000000-0000-4000-8000-00000000c501',
             'curator_intent', 'openrouter', 'x', true) $$,
  '23514',
  null,
  'feature is constrained to the Milestone 5 allow-list'
);

select throws_ok(
  $$ insert into public.model_calls (user_id, feature, provider, model, success)
     values ('00000000-0000-4000-8000-00000000c501',
             'cover_vision', '   ', 'x', true) $$,
  '23514',
  null,
  'blank provider is rejected'
);

select throws_ok(
  $$ insert into public.model_calls
       (user_id, feature, provider, model, success, prompt_tokens)
     values ('00000000-0000-4000-8000-00000000c501',
             'cover_vision', 'openrouter', 'x', true, -1) $$,
  '23514',
  null,
  'negative token counts are rejected'
);

select throws_ok(
  $$ insert into public.model_calls
       (user_id, feature, provider, model, success, estimated_cost_usd)
     values ('00000000-0000-4000-8000-00000000c501',
             'cover_vision', 'openrouter', 'x', true, -0.01) $$,
  '23514',
  null,
  'negative estimated cost is rejected'
);

select * from finish();

rollback;
