-- Widen the catalog-identity constraint to accept the approved secondary
-- provider (spec 0018 / ADR 0008), preserving the explicit NOT NULL test
-- the production constraint already has. Existing MusicBrainz and manual
-- rows are unaffected; no backfill.
alter table public.releases
  drop constraint releases_manual_catalog_identity;

alter table public.releases
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
      and provider in ('musicbrainz', 'discogs')
      and provider_release_id is not null
    )
  );

-- Freshness marker (spec 0018 S12). Nullable at the column level - existing
-- MusicBrainz/manual rows carry NULL and are never subject to the freshness
-- check (application-level guard, discogsFreshness.ts).
alter table public.releases
  add column provider_fetched_at timestamptz;

-- Provider-qualified: a Discogs row must always carry a fetched-at
-- timestamp; non-Discogs rows are unaffected (a NULL provider here would
-- already have been rejected by the constraint above, so `provider is
-- distinct from 'discogs'` is safe and does not re-introduce a NULL-passes
-- gap of its own for this specific column).
alter table public.releases
  add constraint releases_discogs_requires_fetched_at
  check (
    provider is distinct from 'discogs'
    or provider_fetched_at is not null
  );
