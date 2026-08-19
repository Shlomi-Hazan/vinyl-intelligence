create table public.releases (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  source text not null default 'manual',
  artist text not null,
  title text not null,
  release_year integer,
  label text,
  catalog_number text,
  country text,
  format text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint releases_source_manual check (source = 'manual'),
  constraint releases_artist_clean check (
    artist = btrim(artist)
    and char_length(artist) between 1 and 160
  ),
  constraint releases_title_clean check (
    title = btrim(title)
    and char_length(title) between 1 and 200
  ),
  constraint releases_release_year_range check (
    release_year is null
    or release_year between 1900 and 2100
  ),
  constraint releases_label_clean check (
    label is null
    or (
      label = btrim(label)
      and char_length(label) between 1 and 160
    )
  ),
  constraint releases_catalog_number_clean check (
    catalog_number is null
    or (
      catalog_number = btrim(catalog_number)
      and char_length(catalog_number) between 1 and 120
    )
  ),
  constraint releases_country_clean check (
    country is null
    or (
      country = btrim(country)
      and char_length(country) between 1 and 80
    )
  ),
  constraint releases_format_clean check (
    format is null
    or (
      format = btrim(format)
      and char_length(format) between 1 and 80
    )
  )
);

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete restrict,
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index collection_items_user_added_idx
on public.collection_items (user_id, added_at desc, id desc);

create index collection_items_user_release_idx
on public.collection_items (user_id, release_id);

create index collection_items_release_idx
on public.collection_items (release_id);

create index releases_created_by_idx
on public.releases (created_by);

alter table public.releases enable row level security;
alter table public.collection_items enable row level security;

revoke all on table public.releases from anon;
revoke all on table public.releases from authenticated;
revoke all on table public.collection_items from anon;
revoke all on table public.collection_items from authenticated;

grant select
on table public.releases
to authenticated;

grant insert (
  artist,
  title,
  release_year,
  label,
  catalog_number,
  country,
  format
)
on table public.releases
to authenticated;

grant update (
  artist,
  title,
  release_year,
  label,
  catalog_number,
  country,
  format
)
on table public.releases
to authenticated;

grant select
on table public.collection_items
to authenticated;

grant insert (release_id)
on table public.collection_items
to authenticated;

grant delete
on table public.collection_items
to authenticated;

create policy "Users can select their own manual releases"
on public.releases
for select
to authenticated
using (
  created_by = (select auth.uid())
  and source = 'manual'
);

create policy "Users can insert their own manual releases"
on public.releases
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and source = 'manual'
);

create policy "Users can update their own manual releases"
on public.releases
for update
to authenticated
using (
  created_by = (select auth.uid())
  and source = 'manual'
)
with check (
  created_by = (select auth.uid())
  and source = 'manual'
);

create policy "Users can select their own collection items"
on public.collection_items
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can insert their own collection items"
on public.collection_items
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.releases
    where releases.id = collection_items.release_id
      and releases.created_by = (select auth.uid())
      and releases.source = 'manual'
  )
);

create policy "Users can delete their own collection items"
on public.collection_items
for delete
to authenticated
using (user_id = (select auth.uid()));

create or replace function private.touch_release_updated_at()
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

create trigger touch_release_updated_at_before_metadata_update
before update of artist, title, release_year, label, catalog_number, country, format
on public.releases
for each row
when (
  old.artist is distinct from new.artist
  or old.title is distinct from new.title
  or old.release_year is distinct from new.release_year
  or old.label is distinct from new.label
  or old.catalog_number is distinct from new.catalog_number
  or old.country is distinct from new.country
  or old.format is distinct from new.format
)
execute function private.touch_release_updated_at();

revoke all on function private.touch_release_updated_at() from public;
revoke all on function private.touch_release_updated_at() from anon;
revoke all on function private.touch_release_updated_at() from authenticated;
