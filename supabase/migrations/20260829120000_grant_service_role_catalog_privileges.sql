-- Milestone 4 blocker fix: service-role catalog persistence privileges.
--
-- The approved Milestone 4 server-side catalog persistence path
-- (netlify/functions/_shared/catalog-handlers.mts) uses the Supabase service
-- role to upsert a provider-backed row in public.releases and to insert the
-- owning row in public.collection_items for the verified authenticated user.
--
-- service_role has the BYPASSRLS attribute, but PostgreSQL still enforces
-- ordinary SQL table privileges independently of Row Level Security. The
-- Milestone 3 and Milestone 4 migrations granted table privileges only to
-- anon and authenticated, so service_role was left without SELECT/INSERT/
-- UPDATE on these tables and the add flow failed with:
--   ERROR 42501: permission denied for table releases
--
-- Grant the least privilege the catalog-add flow actually needs and nothing
-- more. In particular service_role is intentionally NOT granted DELETE on
-- public.releases, and NOT granted UPDATE or DELETE on
-- public.collection_items. Browser (anon/authenticated) grants and all RLS
-- policies are unchanged.

grant select, insert, update
on table public.releases
to service_role;

grant select, insert
on table public.collection_items
to service_role;
