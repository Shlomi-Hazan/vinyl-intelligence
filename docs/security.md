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
- Do not log secrets or unnecessary personal content.

## Authentication and Authorization

If Supabase is selected:

- Use Supabase Auth as the identity source.
- Link application user data through `auth.users`.
- Use RLS policies on user-owned tables.
- Use server-side functions for privileged writes and external API calls.

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
- Short retention by default unless a retention decision is approved
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

Costly endpoints should have:

- Auth requirement
- Reasonable request size limits
- Rate protection
- Hard retry limits
- Telemetry for provider, model, latency, token usage, and failure category

## Open Privacy Decisions

- Are uploaded cover images retained after a successful identification?
- Are chat transcripts stored, or only summarized bounded intent?
- How long are model-call audit records retained?
- Are user notes included in recommendation context by default?
