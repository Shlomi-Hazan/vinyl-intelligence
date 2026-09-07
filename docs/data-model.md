# Data Model

As-built section last updated: 2026-09-07 (Milestone 12). The original
2026-08-17 proposal follows "As-Built Schema"; where they differ the as-built
section is authoritative.

---

## As-Built Schema (current, supersedes the 2026-08-17 proposal)

13 version-controlled migrations in `supabase/migrations/`, all applied to the
hosted project (zero pending). Every public table has RLS enabled and
owner-scoped policies; `releases` is globally readable catalog metadata with
trusted-backend writes. Table privileges are granted only to `authenticated`
(plus the explicit least-privilege `service_role` grants noted below); no
`anon` / `public` table grants.

### `profiles`
`id uuid pk references auth.users(id)`, `display_name text`,
`avatar_path text` (nullable), `avatar_updated_at timestamptz` (nullable),
`created_at`, `updated_at`. Created by the `auth.users` insert trigger
(`create_profile_after_auth_user_insert` -> `private.create_profile_for_new_user`,
`SECURITY DEFINER`). RLS: own row select/update; column-scoped update grant on
`display_name`, `avatar_path`, `avatar_updated_at`.

### `releases` (shared catalog metadata)
`id uuid pk`, `created_by uuid references profiles(id) on delete set null`,
`source text not null default 'manual'` (`'manual'` = user-entered/editable,
`'catalog'` = MusicBrainz/read-only), `artist text not null`,
`title text not null`, `release_year integer`, `label text`,
`catalog_number text`, `country text`, `format text`,
`genres text[] not null default '{}'`, `provider text`,
`provider_release_id text`, `provider_release_group_id text`,
`created_at`, `updated_at`. No `cover_url` - artwork is resolved at display time
from `provider_release_id` / `provider_release_group_id` via Cover Art Archive.
`service_role`: SELECT/INSERT/UPDATE (no DELETE).

### `collection_items` (per-user ownership)
`id uuid pk`, `user_id uuid not null default auth.uid() references profiles(id) on delete cascade`,
`release_id uuid not null references releases(id) on delete restrict`,
`added_at`, `created_at`, plus the Milestone 7 / Visual-pass signal columns:
`rating smallint` (1-5, nullable), `is_favorite boolean not null default false`,
`notes text` (nullable), `personal_genres text[] not null default '{}'`,
`custom_cover_path text` (nullable), `custom_cover_updated_at timestamptz`
(nullable). RLS: own rows for all of select/insert/update/delete. Column-scoped
update grant on `rating`, `is_favorite`, `notes`, `personal_genres`,
`custom_cover_path`, `custom_cover_updated_at`. `service_role`: SELECT/INSERT
(no UPDATE/DELETE) - used only to insert the owning row for a verified user in
the catalog-add flow.

### `listening_events` (append-only history)
`id uuid pk`, `user_id uuid not null default auth.uid() references profiles(id) on delete cascade`,
`collection_item_id uuid not null references collection_items(id) on delete cascade`,
`listened_at timestamptz not null default now()`, `created_at`. No denormalized
count / last-listened columns and no counter trigger - both are derived in the
browser from these rows every render. RLS: own rows for select/insert; the
Visual pass added own-row `UPDATE(listened_at)` and `DELETE` so a user can
correct or remove their own play (column-scoped update grant on `listened_at`
only - a play can never be re-pointed to another item or user). See
`docs/decisions/0006`.

### `model_calls` (AI telemetry)
`id uuid pk`, `user_id uuid not null references profiles(id) on delete cascade`,
`feature text not null`, `provider text not null`, `model text not null`,
`success boolean not null`, `latency_ms integer`, `prompt_tokens integer`,
`completion_tokens integer`, `estimated_cost_usd numeric(12,6)`,
`error_category text`, `created_at`. Reads (rate-limit counting) go through the
user's own token + an own-row SELECT policy. Writes go through `service_role`,
which has **INSERT only** on this table. No prompt text, no response body, no
image, no personal free text is stored.

### Storage buckets
`collection-covers` (private, 3 MiB, `image/webp` only) and `profile-avatars`
(private, 1 MiB, `image/webp` only). `storage.objects` policies are per-bucket,
owner-scoped, `authenticated` only (INSERT/SELECT/UPDATE/DELETE); no `anon` /
`public` access; no public listing. Signed URLs are short-TTL and memory-only.

### Deliberately NOT persisted
- `image_identification_attempts` - the recognition flow is ephemeral and
  confirmation-based; nothing about an attempt is stored.
- `conversation_sessions` / curator transcripts - refinement state lives only in
  browser React memory.
- Signed cover / avatar URLs - minted on demand, never written anywhere.
- `decade` - derived from `release_year` in application logic.
- `listening_count` / `last_listened_at` on `collection_items` - derived from
  `listening_events`.

---

## Initial Data Model (2026-08-17, historical - modeling rationale)

The rest of this document is the proposed relational model from 2026-08-17. It
records the modeling direction and trade-offs; some proposed field names and
optional tables were simplified or dropped during implementation (see the
as-built schema above).

## Modeling Direction

Track the user's collection at collection-item level. Store release-level metadata when a provider has an exact release identifier, but keep the normal UI album-first so users who do not care about pressing details are not forced into expert workflows.

For the initial model, `listening_events` are the source of truth for listening count and last-listened state. Avoid denormalizing `listening_count` and `last_listened_at` into `collection_items` until there is a demonstrated performance or UX need.

The `decade` can be derived from `release_year` in query/application logic or stored later if filtering performance requires it.

## Tables

### profiles

Purpose: project-level user profile linked to the auth provider.

Important fields:

- `id uuid primary key references auth.users(id)`
- `display_name text`
- `created_at timestamptz`
- `updated_at timestamptz`

Relationships:

- One profile owns many collection items, listening events, image attempts, model calls, and optional conversation sessions.

Indexes:

- Primary key on `id`

Ownership/security:

- Users may select and update only their own profile.

### releases

Purpose: normalized external album/release metadata imported from catalog providers.

Important fields:

- `id uuid primary key`
- `provider text not null`
- `provider_release_id text not null`
- `provider_master_id text`
- `artist text not null`
- `album_title text not null`
- `release_title text`
- `release_year int`
- `decade int`
- `genres text[]`
- `styles text[]`
- `label text`
- `country text`
- `formats jsonb`
- `tracklist jsonb`
- `cover_url text`
- `external_url text`
- `metadata_json jsonb`
- `metadata_confidence numeric`
- `created_at timestamptz`
- `updated_at timestamptz`

Relationships:

- One release can appear in many users' collections.

Indexes:

- Unique index on `(provider, provider_release_id)`
- Index on `artist`
- Index on `album_title`
- Index on `release_year`
- Index on `decade`
- GIN index on `genres`
- GIN index on `styles`
- Optional full-text/trigram index for artist/title search after stack approval

Ownership/security:

- Release metadata is shared/reference data. Direct writes should happen through trusted backend paths that validate provider responses.

### collection_items

Purpose: one physical record/release owned by a user.

Important fields:

- `id uuid primary key`
- `user_id uuid not null references profiles(id)`
- `release_id uuid references releases(id)`
- `source text not null` values such as `manual`, `catalog_search`, `image_recognition`
- `rating int` nullable, check 1 through 5
- `favorite boolean default false`
- `personal_notes text`
- `copy_label text` optional user-facing duplicate note
- `date_added timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

As implemented through Milestone 7, `public.collection_items` has
`id`, `user_id`, `release_id`, `added_at`, `created_at`, and the Milestone 7
personal signals `rating smallint` (NULL or 1..5), `is_favorite boolean not
null default false`, and `notes text` (trimmed, <= 1000 chars, or NULL). It has
no `source`, `copy_label`, or `updated_at` column yet. The `(user_id, favorite)`
and `(user_id, rating)` indexes below are deferred until a milestone introduces
a server-side query that needs them (Milestone 7 filters personal signals in the
browser).

Relationships:

- Belongs to a user.
- Optionally references a release.
- Has many listening events.

Indexes:

- Index on `(user_id, date_added desc)`
- Index on `(user_id, release_id)`
- Index on `(user_id, favorite)`
- Index on `(user_id, rating)`

Ownership/security:

- Users may access only their own collection items.
- Exact duplicate release should warn, not silently block. Multiple copies are allowed only when intentionally confirmed.

### listening_events

Purpose: immutable, append-only record of a user playing an owned record. Source
of truth for listening count and last-listened time (both derived in the
browser; see line 11).

As implemented in Milestone 8 (`20260901120000_add_listening_events.sql`):

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null default auth.uid() references profiles(id) on delete cascade`
- `collection_item_id uuid not null references collection_items(id) on delete cascade`
- `listened_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`

No `note`, `updated_at`, `duration`, `source`, or soft-delete column - deferred
until a concrete need exists.

Relationships:

- Belongs to user and collection item. Both foreign keys are `ON DELETE CASCADE`:
  removing an owned collection item (or a profile) removes its listening events.

Indexes (as implemented):

- automatic primary-key index on `(id)`
- `listening_events_user_listened_idx` on `(user_id, listened_at desc, id desc)`
  - reverse-chronological per-user history; `id desc` is the equal-timestamp
    tie-break
- `listening_events_collection_item_idx` on `(collection_item_id)`
  - Postgres does not auto-index FK columns, and this one is `ON DELETE CASCADE`

The earlier aspirational `(user_id, collection_item_id, listened_at desc)` index
was **not** added: Milestone 8 derives per-item counts client-side from the
already-loaded rows, so there is no server query that composite index would
serve.

Ownership/security:

- RLS: `authenticated` may `SELECT` its own rows and `INSERT` an event only for a
  collection item it owns. No `UPDATE`, no `DELETE` grant - rows are immutable
  from the browser. The insert grant is column-scoped to `collection_item_id`
  (`user_id` / `listened_at` come from column defaults).
- Listening count and last-listened values are derived from this table in the
  browser; no denormalized column or counter trigger exists.

### image_identification_attempts

Purpose: audit and recovery record for cover-photo recognition attempts.

Important fields:

- `id uuid primary key`
- `user_id uuid not null references profiles(id)`
- `storage_path text`
- `retained_until timestamptz`
- `image_mime_type text`
- `image_size_bytes int`
- `extracted_artist text`
- `extracted_album text`
- `extracted_text jsonb`
- `vision_confidence numeric` advisory/debug only, never authoritative probability
- `catalog_query jsonb`
- `candidate_results jsonb`
- `selected_release_id uuid references releases(id)`
- `selected_collection_item_id uuid references collection_items(id)`
- `status text not null` values such as `uploaded`, `vision_failed`, `no_match`, `candidates_found`, `confirmed`, `rejected`, `expired`
- `error_category text`
- `created_at timestamptz`
- `updated_at timestamptz`

Relationships:

- Belongs to user.
- May link to selected release and created collection item after confirmation.

Indexes:

- Index on `(user_id, created_at desc)`
- Index on `(user_id, status)`

Ownership/security:

- Users may access only their own attempts.
- Uploaded cover photos are temporary and should be deleted after the identification flow unless future retention is explicitly approved.
- The model output is not authoritative and must not directly create collection records.

### model_calls

Purpose: lightweight, non-sensitive audit/telemetry for AI/model usage, latency, cost, and failure category.

Important fields:

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `feature text not null`. As implemented: Milestone 5 allowed only
  `cover_vision`; Milestone 9 widens the allow-list to `cover_vision`,
  `curator_intent`, `curator_selection` via a forward migration. (The earlier
  sketch name `curator_explanation` is not used - it is `curator_selection`.)
  Milestone 10 (`POST /api/curator/refine`) adds **no** feature: a refinement's
  intent call reuses `curator_intent` and its selection call reuses
  `curator_selection`, so refinements count against the same request/cost
  budget. No migration or conversation table.
- `provider text not null`
- `model text not null`
- `request_kind text not null`
- `input_schema_version text`
- `output_schema_version text`
- `success boolean not null`
- `latency_ms int`
- `prompt_tokens int`
- `completion_tokens int`
- `estimated_cost_usd numeric`
- `error_category text`
- `trace_id text`
- `created_at timestamptz`

Relationships:

- Usually belongs to a user.

Indexes:

- Index on `(user_id, created_at desc)`
- Index on `(feature, created_at desc)`
- Index on `(success, created_at desc)`

Ownership/security:

- Do not store raw prompts or images by default.
- Do not permanently store full AI curator chat transcripts for MVP.
- Keep this table lightweight. It is not intended to become a large observability subsystem.
- Users should not access other users' call records.

### conversation_sessions optional

Purpose: bounded structured state for short curator follow-up conversations if persistence becomes necessary.

Important fields:

- `id uuid primary key`
- `user_id uuid not null references profiles(id)`
- `state_summary jsonb`
- `current_constraints jsonb`
- `expires_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Relationships:

- Belongs to user.

Indexes:

- Index on `(user_id, updated_at desc)`
- Index on `(expires_at)`

Ownership/security:

- Store summarized intent and constraints, not uncontrolled long-term model memory.
- Do not permanently store full AI curator chat transcripts for MVP.

## Open Decisions

- Exact duplicate-copy representation and prompt wording
- Whether conversation sessions persist in the database or remain ephemeral for MVP implementation
- Exact enum values for source/status/feature fields
- Whether shared release metadata can be edited by users or only user-specific overrides are allowed
