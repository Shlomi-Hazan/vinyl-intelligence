# 0001 Approved Initial Architecture

Status: accepted

Date: 2026-08-17

## Context

The project intent defines Vinyl Intelligence as a real deployed web application with separate browser, backend, database, and deployment responsibilities. A human architecture review approved the initial stack and several product/data boundaries before application scaffolding.

## Decision

Use the following initial architecture:

- Frontend: Vite + React + TypeScript
- Backend: Netlify Functions for privileged server-side logic
- Database/Auth/Storage: Supabase
- Deployment: Netlify
- Source control: GitHub

Approved product/data boundaries:

- Database supports release-level identifiers.
- Normal UI remains album-first.
- Uploaded cover photos are temporary and should be deleted after the identification flow unless future retention is explicitly approved.
- Do not permanently store full AI curator chat transcripts for MVP.
- Store only bounded structured conversation state if persistence becomes necessary.
- Do not use RAG.
- Do not introduce a multi-agent architecture unless later justified.
- `listening_events` is initially the source of truth for listening count and last-listened state.
- Avoid denormalizing `listening_count` and `last_listened_at` into `collection_items` until there is a demonstrated need.
- Treat model-reported vision confidence as advisory/debug information only.
- Keep `model_calls` lightweight audit/telemetry, not a large observability subsystem.

## Consequences

- Vite keeps the frontend lightweight, while Netlify Functions provide the privileged backend boundary required by `intent.txt`.
- Supabase RLS remains central for user-owned data protection.
- Listening history queries may initially compute counts and recency from `listening_events`; denormalization can be revisited if performance requires it.
- Photo upload cleanup must be part of the photo-identification specification and implementation plan.
- The AI curator must not rely on permanently stored transcripts for MVP follow-up behavior.

## Alternatives Considered

- Next.js API routes: reasonable but unnecessary for the approved Vite frontend.
- Supabase Edge Functions: close to the database, but Netlify Functions were approved for privileged backend logic.
- Persisted chat transcripts: deferred for privacy and MVP scope control.
- RAG/vector database: rejected for core scope because the project operates mainly over structured personal collection data.
