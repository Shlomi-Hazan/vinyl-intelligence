alter table public.releases
  drop constraint releases_source_manual;

alter table public.releases
  add column provider text,
  add column provider_release_id text,
  add column provider_release_group_id text;

alter table public.releases
  add constraint releases_source_manual_or_catalog
  check (source in ('manual', 'catalog')),
  add constraint releases_provider_clean
  check (
    provider is null
    or (
      provider = btrim(provider)
      and char_length(provider) between 1 and 40
    )
  ),
  add constraint releases_provider_release_id_clean
  check (
    provider_release_id is null
    or (
      provider_release_id = btrim(provider_release_id)
      and char_length(provider_release_id) between 1 and 120
    )
  ),
  add constraint releases_provider_release_group_id_clean
  check (
    provider_release_group_id is null
    or (
      provider_release_group_id = btrim(provider_release_group_id)
      and char_length(provider_release_group_id) between 1 and 120
    )
  ),
  add constraint releases_manual_catalog_identity
  check (
    (
      source = 'manual'
      and provider is null
      and provider_release_id is null
      and provider_release_group_id is null
    )
    or (
      source = 'catalog'
      and created_by is null
      and provider is not null
      and provider = 'musicbrainz'
      and provider_release_id is not null
    )
  ),
  add constraint releases_provider_release_identity_unique
  unique (provider, provider_release_id);

create policy "Authenticated users can select catalog releases"
  on public.releases
  for select
  to authenticated
  using (source = 'catalog');
