-- Milestone 5: minimal model-call telemetry.
--
-- One row per runtime AI/model call. Milestone 5 records exactly one feature,
-- 'cover_vision', for the authenticated cover-recognition function. Later AI
-- milestones widen the feature check with a forward migration.
--
-- The recognition Netlify Function inserts these rows with the Supabase service
-- role, mirroring the Milestone 4 server-side persistence boundary. Milestone 4
-- proved that service_role has BYPASSRLS but still needs ordinary table
-- privileges, so service_role is granted INSERT explicitly here (and nothing
-- else). Browser roles get read-only access to their own rows.
--
-- This table never stores the uploaded image, the prompt text, the raw provider
-- response, the API key, or any user-supplied secret.

create table public.model_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,
  provider text not null,
  model text not null,
  success boolean not null,
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  estimated_cost_usd numeric(12, 6),
  error_category text,
  created_at timestamptz not null default now(),
  constraint model_calls_feature_allowed check (feature in ('cover_vision')),
  constraint model_calls_provider_clean check (
    provider = btrim(provider)
    and char_length(provider) between 1 and 40
  ),
  constraint model_calls_model_clean check (
    model = btrim(model)
    and char_length(model) between 1 and 120
  ),
  constraint model_calls_error_category_clean check (
    error_category is null
    or (
      error_category = btrim(error_category)
      and char_length(error_category) between 1 and 60
    )
  ),
  constraint model_calls_nonneg_metrics check (
    (latency_ms is null or latency_ms >= 0)
    and (prompt_tokens is null or prompt_tokens >= 0)
    and (completion_tokens is null or completion_tokens >= 0)
    and (estimated_cost_usd is null or estimated_cost_usd >= 0)
  )
);

create index model_calls_user_created_idx
on public.model_calls (user_id, created_at desc);

alter table public.model_calls enable row level security;

revoke all on table public.model_calls from anon;
revoke all on table public.model_calls from authenticated;

grant select
on table public.model_calls
to authenticated;

grant insert
on table public.model_calls
to service_role;

create policy "Users can select their own model calls"
on public.model_calls
for select
to authenticated
using (user_id = (select auth.uid()));
