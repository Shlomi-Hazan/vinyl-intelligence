# Initial Data Model

Last updated: 2026-08-17.

This is a proposed relational model. Do not create production migrations until reviewed.

## Modeling Direction

Track the user's collection at collection-item level. Store release-level metadata when a provider has an exact release identifier, but keep the normal UI album-first so users who do not care about pressing details are not forced into expert workflows.

Derived fields such as `decade`, `listening_count`, and `last_listened_at` may be denormalized for fast UI and recommendation queries, provided write paths keep them correct.

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
- `listening_count int default 0`
- `last_listened_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Relationships:

- Belongs to a user.
- Optionally references a release.
- Has many listening events.

Indexes:

- Index on `(user_id, date_added desc)`
- Index on `(user_id, release_id)`
- Index on `(user_id, favorite)`
- Index on `(user_id, rating)`
- Index on `(user_id, last_listened_at)`

Ownership/security:

- Users may access only their own collection items.
- Exact duplicate release should warn, not silently block. Multiple copies are allowed only when intentionally confirmed.

### listening_events

Purpose: immutable record of a user playing an owned record.

Important fields:

- `id uuid primary key`
- `user_id uuid not null references profiles(id)`
- `collection_item_id uuid not null references collection_items(id)`
- `listened_at timestamptz not null`
- `note text`
- `created_at timestamptz`

Relationships:

- Belongs to user and collection item.

Indexes:

- Index on `(user_id, listened_at desc)`
- Index on `(collection_item_id, listened_at desc)`

Ownership/security:

- User can create events only for collection items they own.
- Write path should update `collection_items.listening_count` and `last_listened_at`.

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
- `vision_confidence numeric`
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
- Uploaded images should not be retained forever by default.
- The model output is not authoritative and must not directly create collection records.

### model_calls

Purpose: non-sensitive audit of AI/model usage, latency, cost, and failure category.

Important fields:

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `feature text not null` values such as `curator_intent`, `curator_explanation`, `cover_vision`
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
- If transcript/debug storage is added, it needs explicit retention and privacy rules.
- Users should not access other users' call records.

### conversation_sessions optional

Purpose: bounded state for short curator follow-up conversations.

Important fields:

- `id uuid primary key`
- `user_id uuid not null references profiles(id)`
- `state_summary jsonb`
- `current_constraints jsonb`
- `last_user_intent text`
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
- Decide before implementation whether chat transcripts are retained.

## Open Decisions

- Exact release-level vs album-level semantics in UI and duplicate prompts
- Whether raw uploaded cover images are deleted immediately, retained temporarily, or retained after user confirmation
- Whether conversation sessions persist in the database or remain ephemeral for MVP
- Exact enum values for source/status/feature fields
- Whether shared release metadata can be edited by users or only user-specific overrides are allowed
