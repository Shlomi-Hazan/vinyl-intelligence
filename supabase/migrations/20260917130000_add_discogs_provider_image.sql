-- Discogs provider artwork (spec 0018 follow-up / PR C, §7-§11): a nullable
-- provider-scoped image URL string only - never image bytes. Discogs Images
-- are Restricted Data under the Discogs API Terms, not CC0 catalog metadata,
-- so only the provider's own URL is ever persisted; the binary is never
-- downloaded into Supabase Storage.
--
-- Freshness is NOT tracked independently here - `provider_fetched_at`
-- (existing) remains the single authoritative freshness clock for every
-- Discogs-derived field, this one included.
alter table public.releases
  add column provider_image_url text;

alter table public.releases
  add constraint releases_provider_image_url_clean
  check (
    provider_image_url is null
    or (
      provider_image_url = btrim(provider_image_url)
      and char_length(provider_image_url) between 1 and 1000
    )
  );

-- Defense in depth: this column only ever has a real use for a Discogs row
-- (MusicBrainz artwork is derived at render time from the Cover Art Archive
-- by mbid, never persisted here; a manual row has no provider at all). A
-- non-null value on any other row is a bug, not a valid state - reject it
-- rather than silently accept unused data. Never required to be present
-- (missing Discogs artwork is valid), so this is a "scoped to" constraint,
-- not a "required for" constraint - the opposite direction from
-- `releases_discogs_requires_fetched_at`.
alter table public.releases
  add constraint releases_provider_image_url_scoped_to_discogs
  check (
    provider_image_url is null
    or provider = 'discogs'
  );
