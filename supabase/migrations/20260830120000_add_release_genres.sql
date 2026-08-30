-- Milestone 6: genre metadata on public.releases for collection browse/filter.
--
-- MusicBrainz genres are community-curated, subjective tags - not objective
-- facts. They are stored as catalog-sourced metadata; a human may also supply a
-- manual genre. No model ever invents or infers a genre.
--
-- Milestone 6 filtering is deterministic and client-side over the already
-- loaded, RLS-authoritative owned collection. There is no database genre
-- containment query yet, so this migration deliberately does NOT add a GIN
-- index and does NOT add a persisted decade column. Add a GIN index in a later
-- milestone if server-side genre querying is introduced.

-- Pure, deterministic validator for the genres array. Lives in `public` (not
-- `private`) because it is evaluated by a CHECK constraint in the security
-- context of the DML executor, and `authenticated` has no USAGE on `private`.
-- It only inspects its argument: no table reads, no external state.
create or replace function public.release_genres_valid(genres text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    genres is not null
    and coalesce(array_length(genres, 1), 0) <= 12
    and coalesce(
      (
        select bool_and(
          g is not null
          and g = btrim(g)
          and g = lower(g)
          and char_length(g) between 1 and 40
        )
        from unnest(genres) as g
      ),
      true
    );
$$;

revoke all on function public.release_genres_valid(text[]) from public;
grant execute on function public.release_genres_valid(text[]) to authenticated;
grant execute on function public.release_genres_valid(text[]) to service_role;

alter table public.releases
  add column genres text[] not null default '{}';

alter table public.releases
  add constraint releases_genres_valid
  check (public.release_genres_valid(genres));

-- Manual genre editing (Milestone 6, human-approved). Column-level grants only;
-- source / provider / created_by / updated_at column privileges are unchanged.
grant insert (genres) on table public.releases to authenticated;
grant update (genres) on table public.releases to authenticated;

-- service_role already holds table-level INSERT/UPDATE on public.releases
-- (migration 20260829120000); no new grant is required for catalog genre
-- writes.

-- Extend the metadata-change trigger so an edited genre also bumps updated_at.
drop trigger touch_release_updated_at_before_metadata_update on public.releases;

create trigger touch_release_updated_at_before_metadata_update
before update of
  artist, title, release_year, label, catalog_number, country, format, genres
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
  or old.genres is distinct from new.genres
)
execute function private.touch_release_updated_at();
