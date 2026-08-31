# Security and Privacy

Last updated: 2026-08-17.

Security is part of the product definition. The app handles personal collections, uploads, API credentials, and costly model calls.

## Non-Negotiables

- No API secrets in the browser.
- No service-role keys in client code.
- No `.env` files or credentials in Git.
- Enforce per-user ownership in backend logic and database policies.
- Treat model output as untrusted input.
- Validate external API responses before storing.
- Validate image upload type and size.
- Do not persist uncertain image recognition as a collection record.
- Delete temporary uploaded cover photos after the identification flow unless future retention is explicitly approved.
- Do not permanently store full AI curator chat transcripts for MVP.
- Do not log secrets or unnecessary personal content.

## Authentication and Authorization

Supabase is approved for database, authentication, and storage:

- Use Supabase Auth as the identity source.
- Link application user data through `auth.users`.
- Use RLS policies on user-owned tables.
- Use Netlify Functions for privileged writes, external API calls, LLM calls, and image-recognition orchestration.

Tables requiring strict ownership:

- `profiles`
- `collection_items`
- `listening_events`
- `image_identification_attempts`
- `model_calls`
- `conversation_sessions` if persisted

Shared metadata table:

- `releases` can be globally readable if it contains public catalog metadata, but writes should go through trusted backend logic.

## Secrets

Never commit:

- Catalog API tokens
- LLM provider keys
- Supabase service-role keys
- OAuth secrets
- Local `.env` files
- Authentication tokens

Future `.env.example` should document names only, not values.

## Uploads

Cover-photo uploads must enforce:

- Allowed MIME types
- Maximum file size
- Authenticated user ownership
- Temporary retention only
- Deletion after the identification flow unless a future retention reason is explicitly approved
- Safe storage path structure
- No public bucket listing

The image-recognition workflow must be confirmation-based.

## Model Output Safety

For recommendations:

- Backend creates allowed candidate IDs.
- LLM may choose only from the allowed candidate IDs.
- Backend validates returned IDs before responding.
- Explanations must be grounded in supplied metadata/history.

For image recognition:

- Vision output is a clue source, not authoritative metadata.
- Model-reported confidence is advisory/debug only and never authoritative probability.
- Catalog API data is preferred where available.
- User confirmation is required before persistence.

## External API Safety

- Use timeouts.
- Handle rate limits.
- Validate response shape.
- Cache safe metadata where appropriate.
- Avoid logging raw responses if they include private or unnecessary fields.
- Keep provider-specific logic behind service boundaries.

## Abuse and Cost Controls

Costly Netlify Function endpoints should have:

- Auth requirement
- Reasonable request size limits
- Rate protection
- Hard retry limits
- Telemetry for provider, model, latency, token usage, and failure category

## Open Privacy Decisions

- How long are model-call audit records retained?
- Whether bounded structured conversation state is persisted or kept ephemeral for the MVP implementation

## Resolved Privacy Decisions

- **Are user notes included in recommendation context by default?** No. As of
  Milestone 9 (`docs/specs/0010-milestone-9-ai-curator.md`), Milestone 7 personal
  notes are never sent to any curator model. Rating, favorite, and listening
  history provide the personal signal; user-authored free text would enlarge the
  prompt-injection and privacy surface. The curator also never receives the
  authenticated user id, `created_by`, release/provider ids, exact timestamps, or
  any secret - only a projected fact object per allowed candidate.
- **Milestone 9 curator data access:** the recommendation candidate set is read
  through the authenticated user's token and RLS. `service_role` is not used to
  read `collection_items`, `listening_events`, or `profiles`; its only
  `model_calls` privilege remains INSERT.
- **Milestone 10 conversation state (resolved):** bounded refinement state is
  **not persisted** - it lives only in browser React memory (no database table,
  no `sessionStorage` / `localStorage`, no server memory) and is cleared by
  refresh / logout / "Start over". `POST /api/curator/refine` reuses the
  Milestone 9 RLS + `service_role` boundary exactly (no privilege widening, no
  new table/policy). Client-supplied prior context (`previousIntent`,
  `previousRecommendationIds`) is **semantic input only** - prior IDs are
  intersected against a fresh RLS-owned read before they can affect the
  candidate set, and never grant or deny ownership. The refinement model
  receives only the prior validated intent + the two request texts - not prior
  recommendation IDs, prior AI reason text, the transcript, or Milestone 7
  notes.
