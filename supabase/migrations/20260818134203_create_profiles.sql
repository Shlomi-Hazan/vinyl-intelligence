create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_clean check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 80
    )
  )
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select
on table public.profiles
to authenticated;

grant update (display_name)
on table public.profiles
to authenticated;

create policy "Users can select their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  return new;
end;
$$;

create trigger create_profile_after_auth_user_insert
after insert on auth.users
for each row execute function private.create_profile_for_new_user();

create or replace function private.touch_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger touch_profile_updated_at_before_display_name_update
before update of display_name on public.profiles
for each row
when (old.display_name is distinct from new.display_name)
execute function private.touch_profile_updated_at();

revoke all on function private.create_profile_for_new_user() from public;
revoke all on function private.create_profile_for_new_user() from anon;
revoke all on function private.create_profile_for_new_user() from authenticated;

revoke all on function private.touch_profile_updated_at() from public;
revoke all on function private.touch_profile_updated_at() from anon;
revoke all on function private.touch_profile_updated_at() from authenticated;
