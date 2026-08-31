# Vinyl Intelligence — Complete Project Roadmap

**Project:** Vinyl Intelligence  
**Course:** Agentic Software Engineering (ASE-26)  
**Repository:** `Shlomi-Hazan/vinyl-intelligence`  
**Primary build workflow:** Human-directed Codex / agentic software engineering  
**Roadmap version:** 2026-08-18  
**Scope:** Full project plan from foundation through production-ready final polish

---

## Table of Contents

1. [Project Mission](#1-project-mission)
2. [What Success Means](#2-what-success-means)
3. [Product Principles](#3-product-principles)
4. [Approved Architecture](#4-approved-architecture)
5. [Core Data and Security Boundaries](#5-core-data-and-security-boundaries)
6. [Agentic Engineering Workflow](#6-agentic-engineering-workflow)
7. [Global Verification Standard](#7-global-verification-standard)
8. [Milestone Summary](#8-milestone-summary)
9. [Milestone 0 — Foundation](#9-milestone-0--foundation)
10. [Milestone 1 — Stack Scaffold](#10-milestone-1--stack-scaffold)
11. [Milestone 2 — Supabase Auth + Profile/RLS](#11-milestone-2--supabase-auth--profilerls)
12. [Milestone 3 — Manual Collection CRUD](#12-milestone-3--manual-collection-crud)
13. [Milestone 4 — Music Catalog API Integration](#13-milestone-4--music-catalog-api-integration)
14. [Milestone 5 — AI Photo Recognition + Candidate Confirmation](#14-milestone-5--ai-photo-recognition--candidate-confirmation)
15. [Milestone 6 — Browse, Search, Sort, and Filter](#15-milestone-6--browse-search-sort-and-filter)
16. [Milestone 7 — Ratings, Favorites, and Notes](#16-milestone-7--ratings-favorites-and-notes)
17. [Milestone 8 — Listening History](#17-milestone-8--listening-history)
18. [Milestone 9 — AI Curator](#18-milestone-9--ai-curator)
19. [Milestone 10 — Conversational Refinement](#19-milestone-10--conversational-refinement)
20. [Milestone 11 — Production Deployment](#20-milestone-11--production-deployment)
21. [Milestone 12 — Reliability, Security, Telemetry, and Polish](#21-milestone-12--reliability-security-telemetry-and-polish)
22. [Cross-Milestone Dependency Map](#22-cross-milestone-dependency-map)
23. [Expected Final User Journey](#23-expected-final-user-journey)
24. [Repository Audit Trail](#24-repository-audit-trail)
25. [Definition of Done](#25-definition-of-done)
26. [Explicit Non-Goals](#26-explicit-non-goals)

---

# 1. Project Mission

Vinyl Intelligence is an AI-powered web application for vinyl collectors that turns a personal physical record collection into an intelligent, searchable, conversational music library.

The product must answer two different classes of question:

- **Deterministic library questions:** “What records do I own?”, “Show me jazz from the 1970s”, “What did I play last week?”
- **Human-intent questions:** “I had a stressful day; give me something relaxing but not sleepy”, “Surprise me with something I forgot I own”, “Give me 90s rock that I have not played recently.”

The project is **not** intended to become a generic music recommender or a chatbot with album data attached. The intelligence must operate over the user’s real owned collection.

The central product idea is:

> **A personal vinyl collection that becomes intelligent.**

---

# 2. What Success Means

The finished project should demonstrate both a useful product and disciplined agentic software engineering.

Success requires:

- A real deployed web application.
- Secure user authentication and per-user data isolation.
- A persistent personal vinyl collection.
- Manual collection management that works without AI.
- External music catalog integration.
- AI-assisted album-cover recognition with visible uncertainty and user confirmation.
- Fast deterministic browsing/search/filtering.
- Ratings, favorites, notes, and listening history.
- An AI curator that recommends only records the user owns.
- Bounded conversational follow-up.
- No silent hallucinated ownership, metadata, history, or record IDs.
- Clear security boundaries between browser, database, privileged backend logic, and external APIs.
- Specifications, plans, ADRs, verification evidence, coherent commits, and PR history that show how the human directed the coding agent.

The final repository should make the engineering process understandable to a reviewer even without access to the original chat history.

---

# 3. Product Principles

## 3.1 Use AI only where cognition adds value

AI is appropriate for:

- Natural-language musical intent.
- Mood/vibe interpretation.
- Album-cover vision recognition.
- Recommendation reasoning.
- Recommendation explanations.
- Short conversational refinements.

Deterministic software should handle:

- Authentication.
- Authorization.
- CRUD.
- Exact search.
- Filtering.
- Sorting.
- Database integrity.
- Listening-event storage.
- Validation.
- Counting.
- Derived fields such as decade.
- API caching and normalization where practical.

## 3.2 The owned collection is the recommendation boundary

For the core “what should I play?” experience, every recommended album must be drawn from the authenticated user’s owned collection.

The model must never be allowed to invent an album ID or quietly recommend an external album as though the user owns it.

## 3.3 Manual control is first-class

The application must remain useful without AI.

The user must always be able to:

- Add records manually.
- Edit records.
- Delete records.
- Search normally.
- Browse normally.
- Filter normally.
- Correct AI recognition.
- Reject AI candidates.
- Enter data manually when APIs fail.
- Choose an album without opening the curator.

## 3.4 Uncertainty must be visible

Vision recognition is advisory until confirmed.

The image pipeline must be:

```text
image
-> vision extraction
-> external catalog search
-> normalized candidates
-> user confirmation
-> persistence
```

No uncertain vision result may be silently persisted.

## 3.5 Structured truth beats model-generated truth

Authoritative structured metadata should come from the chosen music catalog wherever possible.

The model may help extract clues, interpret intent, rank candidates, or explain results, but it should not replace structured sources for fields that can be reliably obtained elsewhere.

## 3.6 Keep the architecture proportional

Do not add complexity only to make the project sound more “AI”.

In particular:

- No core RAG/vector database.
- No unjustified multi-agent architecture.
- No permanent full curator transcript storage for the MVP.
- No autonomous collection modification without confirmation.

---

# 4. Approved Architecture

The initial architecture is approved and should remain the default unless a later ADR explicitly changes it.

## Frontend

- **Vite**
- **React**
- **TypeScript**

Responsibilities:

- Authentication UI.
- Collection UI.
- Browse/search/filter UX.
- Ratings/favorites/notes.
- Listening-history UX.
- Photo-upload UX.
- AI curator UX.
- Client-side interaction state.

## Privileged backend

- **Netlify Functions**

Responsibilities include privileged or secret-bearing operations such as:

- External music catalog calls requiring server-side handling.
- LLM calls.
- Vision-model calls.
- Recommendation orchestration.
- Validation around external/model responses.
- Any use of elevated server credentials if later required and explicitly approved.

Normal browser-to-Supabase user-owned workflows should not be routed through Netlify Functions merely for ceremony.

## Database, authentication, storage

- **Supabase Postgres**
- **Supabase Auth**
- **Supabase Storage** where required

Supabase RLS is a central security boundary.

## Deployment

- **Netlify**

## Source control and review

- **GitHub**
- One branch per meaningful milestone.
- Human-reviewed PR before merge to `main`.

## Rejected/Deferred architecture choices

- Next.js: unnecessary for the approved SPA needs.
- RAG/vector DB: not justified for structured personal collection data.
- Multi-agent system: not justified by default.
- Permanent curator transcript storage: deferred for privacy and scope.
- Supabase Edge Functions as primary privileged backend: not chosen; Netlify Functions are the approved backend boundary.

---

# 5. Core Data and Security Boundaries

The exact schema must be introduced incrementally by milestone, but these boundaries are already approved.

## 5.1 Shared release data vs ownership

The intended model separates:

- `releases` — normalized release/catalog information.
- `collection_items` — the authenticated user’s ownership of a release or manually entered record.

This prevents catalog identity from being confused with ownership.

## 5.2 Profiles

Milestone 2 establishes a minimal user profile:

- `id`
- nullable `display_name`
- `created_at`
- `updated_at`

The profile is owned by the matching authenticated user.

## 5.3 Listening events

`listening_events` should initially remain the source of truth for:

- Listening history.
- Listening count.
- Last-listened time.
- Recent/forgotten calculations.

Do not prematurely denormalize `listening_count` or `last_listened_at` onto collection items unless a measured performance need appears.

## 5.4 AI telemetry

A lightweight `model_calls` style audit/telemetry concept may be introduced when AI functionality is implemented.

It should remain proportional and privacy-conscious rather than becoming a large observability subsystem.

## 5.5 Temporary cover uploads

Uploaded record-cover photos should be temporary.

The normal goal is to identify the release and then delete temporary uploaded imagery unless a later requirement explicitly approves retention.

## 5.6 Browser credentials

The browser may use:

- Supabase project URL.
- Supabase publishable key.

The browser must never receive:

- Supabase service-role/secret key.
- LLM provider secret.
- Catalog secret requiring server-side protection.
- Other privileged credentials.

## 5.7 RLS and least privilege

RLS protects which rows a user can access.

Database grants must also protect which operations and columns an API role may mutate.

Do not assume that RLS alone is a complete authorization system.

---

# 6. Agentic Engineering Workflow

Every meaningful milestone follows the same pipeline:

```text
Intent
-> Specification
-> Context
-> Plan
-> Human Approval
-> Execution
-> Verification
-> Independent Review
-> Audit Trail
-> Pull Request
-> Human Merge
```

## 6.1 Intent

Confirm that the work still advances the product defined by `intent.txt`.

If a proposed feature changes the product concept materially, update intent first and get explicit approval.

## 6.2 Specification

Before coding, create a milestone specification containing:

- User outcome.
- Functional requirements.
- Non-functional requirements.
- Security requirements.
- Data implications.
- API implications.
- AI/model implications.
- Failure behavior.
- Acceptance criteria.
- Explicit non-goals.

## 6.3 Context

The agent must inspect relevant existing code and documentation before planning.

It should identify:

- Existing architecture.
- Existing conventions.
- Existing tests.
- Database state.
- Dependency state.
- Current branch/base.
- Previous milestone constraints.

## 6.4 Plan

The implementation plan should state:

- Files/components expected to change.
- Database migrations.
- Dependencies.
- Security controls.
- API integration steps.
- Test strategy.
- Manual verification.
- Commit sequence.
- Stop conditions.

## 6.5 Human approval

No implementation should begin until the specification and plan have been explicitly approved by the human.

The approval should be recorded in the repository.

## 6.6 Execution

Implementation must stay inside the approved milestone.

Agents should prefer:

- Small coherent commits.
- Reversible changes.
- Explicit boundaries.
- No speculative future-feature code.

## 6.7 Verification

“Codex says it works” is not verification.

Automated checks plus independent review are required.

## 6.8 Audit trail

Each milestone should leave behind enough evidence to reconstruct:

- What was intended.
- What was approved.
- What changed.
- How it was tested.
- What remains incomplete.
- Why major decisions were made.

---

# 7. Global Verification Standard

Before a milestone may be declared complete, run the checks relevant to that milestone.

At minimum, where applicable:

```text
typecheck
lint
unit/integration tests
database tests
build
local runtime smoke test
manual browser verification
security/secret scan
scope/diff review
dependency audit
```

Additional rules:

- Never use `npm audit fix --force` as a reflexive fix.
- Production-reachable high/critical findings require explicit review.
- Dev-only findings should be triaged, documented, and not hidden.
- Model outputs are untrusted inputs and must be validated.
- External API responses are untrusted inputs and must be normalized/validated.
- File uploads must be validated.
- No milestone should be marked implemented if a required local verification step is blocked.
- Hosted smoke tests may supplement deterministic local tests, not replace them where local verification is required.

---

# 8. Milestone Summary

| Milestone | Name | Primary Outcome | Status |
|---|---|---|---|
| 0 | Foundation | Intent, workflow, architecture, initial decisions | **Complete** |
| 1 | Stack Scaffold | Vite/React/TS + Netlify Functions working baseline | **Complete** |
| 2 | Supabase Auth + Profile/RLS | Secure authenticated user boundary | **In Progress** |
| 3 | Manual Collection CRUD | Users can manage owned records manually | Planned |
| 4 | Music Catalog API | External release search and normalized metadata | Planned |
| 5 | AI Photo Recognition | Photo -> clues -> candidates -> confirmation | Planned |
| 6 | Browse/Search/Filter | Fast deterministic library exploration | Planned |
| 7 | Ratings/Favorites/Notes | Personal preference signals | Planned |
| 8 | Listening History | Timestamped listening behavior | Planned |
| 9 | AI Curator | Safe owned-collection recommendations | Planned |
| 10 | Conversational Refinement | Bounded multi-turn recommendation refinement | Planned |
| 11 | Production Deployment | Real hosted application | Planned |
| 12 | Reliability/Security/Telemetry/Polish | Final hardening and submission readiness | Planned |

---

# 9. Milestone 0 — Foundation

## Objective

Create the source-of-truth project foundation before application development.

## Scope

Milestone 0 establishes:

- Product intent.
- User problem.
- Core product principles.
- AI boundaries.
- Agentic workflow.
- Security principles.
- Initial architecture.
- Catalog API spike requirement.
- Repository conventions.
- Git/branch discipline.

## Primary deliverables

- `intent.txt`
- `AGENTS.md`
- Initial architecture ADR.
- Initial music-catalog API spike specification.
- GitHub repository.
- Initial branch/commit discipline.

## Key decisions

- Vinyl Intelligence is an intelligent personal collection system, not a generic music recommendation product.
- Manual library mode and AI curator mode are equally important.
- Vite + React + TypeScript frontend.
- Netlify Functions privileged backend.
- Supabase database/auth/storage.
- Netlify deployment.
- No RAG in core scope.
- No unjustified multi-agent architecture.
- Release-level identity with album-first UX.
- Temporary uploaded cover images.
- Listening events remain initial listening-history source of truth.
- Lightweight model-call telemetry only.

## Acceptance criteria

Milestone 0 is complete when:

- Product intent is explicit.
- Agent instructions exist.
- Initial architecture is human-approved.
- Major AI/non-AI responsibilities are separated.
- Security expectations are written.
- Git workflow is defined.
- Future implementation can begin without the agent inventing the product.

## Status

**Complete.**

---

# 10. Milestone 1 — Stack Scaffold

## Objective

Create the smallest trustworthy executable application foundation.

## Scope

- Vite.
- React.
- TypeScript.
- Node 24 project contract.
- npm lockfile.
- ESLint.
- Type checking.
- Vitest.
- React Testing Library.
- jsdom.
- Netlify Vite integration.
- Netlify Function health endpoint.
- Minimal starter UI.
- Local build/test workflow.

## Key implementation contract

- `.nvmrc` uses Node 24.
- `package.json` engine contract remains Node 24 compatible.
- Netlify function exposes a public health endpoint.
- No product features are introduced yet.
- No Supabase.
- No authentication.
- No catalog API.
- No LLM.
- No image recognition.
- No premature feature architecture.

## Verification

Expected checks include:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Local runtime must confirm:

- Root application renders.
- `/api/health` returns a valid success payload.

Dependency audit should separate production and development reachability.

## Exit condition

The repo has a clean, reproducible frontend/backend scaffold on which Milestone 2 can safely build.

## Status

**Complete and merged to `main`.**

---

# 11. Milestone 2 — Supabase Auth + Profile/RLS

## Objective

Establish the first real authenticated user boundary and prove that user-owned data can be protected correctly.

## User outcome

A user can:

- Sign up with email/password.
- Confirm their email.
- Sign in.
- Remain authenticated after refresh.
- View their own profile.
- Update their own display name.
- Sign out.

No collection features are added yet.

## Authentication scope

Included:

- Email + password.
- Hosted email confirmation behavior.
- Local Mailpit confirmation flow.
- Session initialization.
- Auth state subscription.
- Sign-out.

Not included:

- OAuth.
- Magic-link-only flow.
- MFA.
- Password-reset UX.
- Social login.

## Profile schema

`public.profiles`:

- `id uuid primary key`
- FK to `auth.users(id)` with `ON DELETE CASCADE`
- `display_name` nullable
- `created_at timestamptz`
- `updated_at timestamptz`

`display_name` rules:

- `NULL` allowed.
- Otherwise trim-normalized.
- Cannot be blank after trimming.
- Maximum length 80.

## Profile creation

A database trigger on `auth.users` creates exactly one profile.

Security requirements:

- SECURITY DEFINER helper.
- Fixed/empty `search_path`.
- Fully qualified object references.
- Prefer helper in a non-exposed `private` schema.
- Normal API roles must not be allowed to invoke the helper as RPC.
- Trigger copies only the new user ID; it does not trust signup metadata for `display_name`.

## Database permissions

Expected least-privilege intent:

```sql
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select
on table public.profiles
to authenticated;

grant update (display_name)
on table public.profiles
to authenticated;
```

Authenticated browser users receive:

- Read own profile.
- Update own `display_name`.

They do not receive normal:

- Insert.
- Delete.
- ID mutation.
- Timestamp mutation.

## RLS

Select own row only.

Update own row only.

Both row-policy and column privileges must be tested.

## Browser integration

Use:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never expose service-role credentials.

Auth state callback should remain synchronous/lightweight. Profile fetching belongs in a separate effect/service keyed to the authenticated user/session.

## Local infrastructure

- Supabase CLI as a project dev dependency.
- CLI version pinned.
- Docker-compatible runtime required.
- Local Supabase stack.
- Local Mailpit.
- Email confirmations intentionally enabled locally.

## Required database behavior tests

Tests should prove at least:

- User A can select A.
- A cannot select B.
- Anonymous cannot read profiles.
- A can update A’s display name.
- A cannot update B.
- Authenticated client cannot directly insert a profile.
- Authenticated client cannot delete a profile.
- Authenticated client cannot modify `id`.
- Authenticated client cannot modify `created_at`.
- Authenticated client cannot modify `updated_at`.
- New auth user produces exactly one profile.
- Signup metadata is not silently copied into protected profile data.
- Trigger helper is not executable by normal API roles.
- Deleting auth user cascades to profile.
- Invalid blank display name fails.
- Overlong display name fails.
- Untrimmed stored display name fails.
- Valid display name succeeds.
- `updated_at` changes through the database mechanism.
- Explicit grants match the intended least-privilege contract.

## Frontend tests

Cover:

- Loading state.
- Unauthenticated state.
- Password sign-in.
- Signup confirmation-pending state.
- Authenticated shell.
- Sign-out.
- Display-name validation/update.
- Missing-profile controlled state.
- Error handling.

## Verification gate

Required local Supabase commands should include:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

Plus normal frontend checks.

## Current status

**In progress.**

Planning and implementation authorization have been approved. Implementation must still pass full verification and human review before PR/merge.

---

# 12. Milestone 3 — Manual Collection CRUD

## Objective

Make the application genuinely useful as a personal vinyl collection even without external APIs or AI.

## User outcome

An authenticated user can:

- Create a collection record manually.
- View owned records.
- Edit an owned record.
- Delete an owned record.
- Never access another user’s collection.

## Data model

Introduce the collection ownership boundary.

Likely concepts:

- `releases`
- `collection_items`

The exact migration should be specified before implementation.

The design should support release-level identity while keeping the normal UI album-first.

## Manual-entry requirements

The manual fallback must remain permanent even after catalog integration is added.

At minimum, the user should be able to capture enough information for the record to remain useful if an external API cannot identify it.

Potential fields should be selected intentionally during specification rather than dumping every possible catalog field into the first migration.

## Security

RLS and explicit grants must prove:

- User A can access only A’s owned collection rows.
- User B cannot see or mutate A’s ownership.
- Browser roles cannot mutate protected ownership/security columns.
- Any shared release table has appropriate access semantics distinct from personal ownership.

## UI

Expected baseline:

- Collection list.
- Empty state.
- Add record form.
- Record detail/edit state.
- Delete confirmation.
- Clear success/error states.

## Tests

Include:

- CRUD behavior.
- Validation.
- Per-user ownership isolation.
- Cross-user update/delete denial.
- Empty-state behavior.
- Refresh persistence.
- Database constraints.

## Non-goals

- Catalog search.
- Cover recognition.
- AI recommendations.
- Listening history.
- Advanced filters.

## Exit condition

The app already functions as a secure manual vinyl collection manager.

---

# 13. Milestone 4 — Music Catalog API Integration

## Objective

Let users search external music metadata and add a confirmed release without manually typing all metadata.

## Mandatory pre-implementation spike

Before choosing the provider, compare:

- Discogs
- MusicBrainz, with Cover Art Archive where appropriate

The decision must be evidence-based using current documentation and real sample responses.

## Comparison rubric

Evaluate:

- Search relevance.
- Release ambiguity.
- Release-level IDs.
- Master/release-group IDs.
- Artist/title metadata.
- Year.
- Label.
- Country.
- Format.
- Tracklist.
- Genre/style usefulness.
- Cover availability.
- Authentication model.
- Rate limits.
- Terms/fair-use.
- Netlify Function suitability.
- Normalization effort.
- No-match/error behavior.

## Sample search strategy

Use the same test cases for each provider:

- Well-known classic-rock album.
- Jazz album with many releases.
- 1990s album.
- Release with edition ambiguity.

## Architecture

Catalog calls that need privileged handling should run through Netlify Functions.

The browser should consume a normalized internal API shape, not bind the product directly to a provider-specific response.

## Add flow

```text
manual query
-> backend catalog search
-> normalized candidates
-> user chooses release
-> backend fetch/normalize release
-> confirmation
-> persist release + ownership
```

## Security

- Secrets remain server-side.
- Query input validated.
- External responses validated.
- Errors normalized.
- Rate limits handled gracefully.

## Non-goals

- Image recognition.
- Curator recommendations.
- Integrating both providers simply to increase API count.

## Exit condition

Users can reliably search a catalog, identify the intended release, confirm it, and add it to their own collection.

---

# 14. Milestone 5 — AI Photo Recognition + Candidate Confirmation

## Objective

Deliver the major “wow” flow: identify a vinyl record from a cover image while preserving user control and structured truth.

## Model-provider decision

Before implementation, verify a current vision-capable model/provider.

OpenRouter may be considered, but the choice must be made from current evidence regarding:

- Vision capability.
- Structured output reliability.
- Cost.
- Latency.
- Model availability.
- Provider terms.
- Server-side API integration.
- Privacy implications.

## Required flow

```text
upload image
-> validate image
-> temporary processing
-> vision model extracts identifying clues
-> validate model output
-> catalog search
-> normalized release candidates
-> show uncertainty/candidates to user
-> user confirms
-> persist confirmed release/collection item
-> delete temporary image
```

## Vision output

The model should extract clues such as:

- Artist text.
- Album title text.
- Visible artwork clues.
- Potential edition/release hints.

These are search clues, not authoritative permanent metadata.

## Confidence

Any model confidence score is advisory/debug information only.

It must not be treated as calibrated truth.

## User control

If recognition is ambiguous:

- Show multiple candidates.
- Allow edited search terms.
- Allow another image.
- Allow manual entry.
- Never silently persist the top guess.

## Upload security

Specify:

- Allowed MIME types.
- Size limits.
- File validation.
- Temporary storage strategy.
- Cleanup behavior.
- Failure cleanup.
- No secret leakage.
- No unnecessary image retention.

## Testing

Cover:

- Clear successful image.
- Ambiguous release.
- No match.
- Invalid upload.
- Oversized upload.
- Vision malformed output.
- Catalog failure.
- User rejects candidates.
- User confirms candidate.
- Temporary image cleanup.
- No persistence before confirmation.

## Non-goals

- Multi-record shelf scanning.
- Automatic bulk collection creation.
- Permanent user cover-photo archive.

## Exit condition

A user can photograph/upload a cover and safely reach a confirmed structured collection record.

---

# 15. Milestone 6 — Browse, Search, Sort, and Filter

## Objective

Make classic library mode excellent and deterministic.

## User outcome

The user can quickly understand and navigate a growing collection without using AI.

## Search

Support normal search across useful fields such as:

- Artist.
- Album/release title.
- Genre.
- Style where available.
- Year/decade.

## Filters

Expected useful filters include:

- Genre.
- Style/subgenre.
- Year.
- Decade.
- Favorites where available later.
- Rating where available later.
- Recently added.
- Recently listened where available later.
- Least recently listened where available later.

Milestone 6 should implement what the current data model supports and leave clean extension points for signals introduced in Milestones 7 and 8.

## Sorting

Potential deterministic sorts:

- Artist.
- Album.
- Release year.
- Date added.
- Rating when available.
- Listening recency when available.
- Play count when available.

## Derived decade

Decade should be derived deterministically from release year rather than being authored by an LLM.

## Performance

For the expected university/demo collection size:

- Interactions should feel immediate.
- Avoid model calls for deterministic browsing.
- Queries should be indexed where evidence shows it matters.

## UX

Include:

- Empty state.
- No-results state.
- Active-filter visibility.
- Easy filter reset.
- Clear collection-card/detail presentation.
- Responsive behavior.

## Verification

Prove:

- Search accuracy.
- Filter combinations.
- Correct per-user isolation.
- Sort behavior.
- No AI/network dependency for ordinary browsing.
- Reasonable performance.

## Exit condition

The collection is pleasant to browse as a normal music-library application.

---

# 16. Milestone 7 — Ratings, Favorites, and Notes

## Objective

Add explicit personal preference signals that improve both manual use and future recommendation quality.

## User outcome

The user can:

- Rate an owned record.
- Favorite/unfavorite it.
- Add/edit personal notes.
- See these values persist.
- Use them in library views where appropriate.

## Data design

Decide whether these fields belong directly on `collection_items` or in another user-owned structure.

The simplest design should be preferred unless there is a demonstrated reason for more abstraction.

## Rating behavior

Rating must be well-defined:

- Allowed scale.
- Nullable/unrated state.
- Database validation.
- UI validation.

## Notes

Notes are personal user-authored content.

Security/privacy expectations:

- Only owner can read/write their note.
- Avoid unnecessary logging.
- Do not send personal notes to an LLM unless required by an explicitly approved recommendation behavior.

## Recommendation future-readiness

Ratings/favorites should become signals, not absolute rules.

For example, the curator should not always choose the highest-rated record if the user requests novelty or something forgotten.

## Verification

Prove:

- Owner-only access.
- Rating constraints.
- Favorite toggling.
- Note editing.
- Refresh persistence.
- Search/filter integration where implemented.

## Exit condition

The collection contains meaningful explicit preference signals for later recommendation logic.

---

# 17. Milestone 8 — Listening History

## Objective

Track actual listening behavior so the application can reason about recency, frequency, and rediscovery.

## User outcome

The user can:

- Mark an album as played/listened now.
- See recent listening history.
- See last-listened context.
- Support future prompts such as “not something I played recently.”

## Source of truth

Use timestamped `listening_events`.

Do not initially store duplicate listening counters or last-listened timestamps on `collection_items` unless a measured need justifies denormalization.

## Expected data

A listening event should minimally associate:

- Authenticated user.
- Owned collection item.
- Timestamp.

Exact schema should enforce ownership integrity.

## Derived insights

From event data, deterministic queries can derive:

- Play count.
- Last listened.
- Recently listened.
- Least recently listened.
- Never listened.
- Frequently played.
- Forgotten/overlooked candidates.

## History UI

Provide a clear recent-history view.

Potential actions:

- Mark played.
- Inspect recent plays.
- Navigate from event to collection item.

## Security

A user must not:

- Create listening events for another user’s collection.
- Read another user’s history.
- Modify protected ownership IDs.

## Verification

Test:

- Event creation.
- Recency ordering.
- Count derivation.
- Last-listened derivation.
- Cross-user denial.
- Delete/cascade implications.
- Multiple listens of the same record.
- Never-listened record behavior.

## Exit condition

The system has trustworthy behavioral data required by the AI curator.

---

# 18. Milestone 9 — AI Curator

## Objective

Build the central AI recommendation experience while guaranteeing that recommendations stay inside the user’s owned collection.

## Core safety invariant

> The LLM may select only from backend-generated allowed collection-item IDs.

The model must never be asked to invent or freely generate owned album IDs.

## Recommended orchestration

```text
user natural-language request
-> LLM converts request to structured intent
-> validate structured intent
-> deterministic owned-collection retrieval/filtering
-> deterministic ranking / candidate reduction
-> small allowed candidate set
-> LLM selects/explains using allowed IDs only
-> validate model selection against allowed IDs
-> return recommendation cards
```

## Structured intent

The specification should define a bounded schema for concepts such as:

- Desired mood.
- Desired genres.
- Excluded genres.
- Decades.
- Energy.
- Familiarity/novelty.
- Recency constraints.
- Social context.
- Number of recommendations.

The exact schema should be introduced only after testing representative prompts.

## Candidate retrieval

Do not dump the entire collection into the model by default.

Use database logic first to retrieve a manageable relevant set.

## Ranking signals

Potential deterministic/model-assisted signals:

- Explicit request.
- Genre/style fit.
- Decade/year.
- Rating.
- Favorite status.
- Last listened.
- Play frequency.
- Novelty.
- Exclusions.
- Rediscovery.
- User-requested constraints.

## Recommendation output

Default should be a small number of strong options, for example:

- Three recommendations.
- One marked as best match.

Each may include:

- Cover.
- Artist.
- Album.
- Year.
- Relevant genre/style.
- Explanation grounded in provided data.
- Personal context such as listening recency when known.

## Validation

Reject:

- Malformed structured intent.
- Invalid IDs.
- IDs outside the allowed candidate set.
- Invented ownership.
- Invented history.
- Invented ratings.
- Unsupported metadata claims.

A safe deterministic fallback should exist for model failure where practical.

## Model security

- All model calls server-side.
- Secrets never enter browser bundle.
- Inputs/outputs bounded and validated.
- Timeouts/retries intentional.
- Cost limits considered.
- Prompt injection risk considered, especially for user notes or external metadata.
- No arbitrary tool execution.

## Telemetry

Add lightweight model-call evidence sufficient to debug:

- Model/provider.
- Operation type.
- Timing.
- Success/failure.
- Token/cost metadata where safely available.

Avoid unnecessary storage of full sensitive prompts/transcripts.

## Verification

Use a representative prompt matrix:

- Calm after stressful day.
- Energetic for friends.
- 90s and not recently played.
- No jazz.
- Surprise me.
- Forgotten record.
- High-rated but not recent.
- Conflicting constraints.
- Empty candidate result.
- Malformed model output.
- Out-of-set malicious/incorrect ID.

## Exit condition

The app can safely translate vague human intent into personalized recommendations from the authenticated user’s real collection.

---

# 19. Milestone 10 — Conversational Refinement

## Objective

Allow short multi-turn refinement without introducing uncontrolled long-term conversational memory.

## Example

```text
User: I want classic rock.

Curator: Do you want something energetic, mellow, or surprising?

User: Mellow, and preferably something I have not played recently.
```

The second turn should retain the relevant first-turn constraint.

## State model

Use bounded structured conversation state.

Do not store permanent full chat transcripts for the MVP.

Potential state includes:

- Current structured recommendation intent.
- Current exclusions.
- Previous candidate IDs.
- Rejected suggestion IDs.
- Selected refinement attributes.
- Short expiry/session boundary.

## Required behaviors

Support useful follow-ups such as:

- “More energetic.”
- “Not that one.”
- “Something older.”
- “No jazz.”
- “Give me another three.”
- “Prefer something I have not played recently.”

## Safety

Every turn still uses the Milestone 9 owned-candidate invariant.

Conversation state never gives the LLM permission to select outside backend-provided allowed IDs.

## State reset

Provide predictable behavior for:

- New recommendation session.
- Sign-out.
- Expired/cleared conversation state.
- Contradictory refinement.

## Verification

Test:

- Constraint carry-forward.
- New exclusion.
- Rejected suggestion not immediately repeated when appropriate.
- Reset behavior.
- User switch isolation.
- Malformed previous state.
- Model failure.
- No transcript persistence beyond approved design.

## Exit condition

The curator feels conversational while remaining bounded, deterministic where possible, and privacy-conscious.

---

# 20. Milestone 11 — Production Deployment

## Objective

Turn the verified local application into a real hosted system.

## Deployment target

- Netlify frontend + Netlify Functions.
- Hosted Supabase project.

## Environment configuration

Configure production environment variables securely.

Examples may include:

- Supabase URL.
- Supabase publishable key.
- Server-only catalog credentials.
- Server-only AI/provider credentials.
- Server-only privileged Supabase secret only if a specific approved backend need exists.

Never commit production secrets.

## Supabase production setup

Apply version-controlled migrations.

Do not rely on undocumented dashboard-only schema changes.

Verify:

- RLS enabled.
- Grants correct.
- Auth redirect URLs.
- Email confirmation behavior.
- Storage policies where used.
- Database triggers.
- Production-safe origins/configuration.

## Netlify setup

Verify:

- Production build.
- SPA routing.
- Netlify Functions.
- `/api/health`.
- Environment variables.
- Function runtime compatibility.
- Logs free of secrets.
- Reasonable timeouts.

## Hosted smoke test

Perform a fresh-account end-to-end test:

```text
sign up
-> confirm
-> sign in
-> profile
-> add manual record
-> catalog add
-> image recognition
-> browse/filter
-> rate/favorite/note
-> mark listened
-> curator recommendation
-> conversational refinement
-> sign out
```

Only exercise features that have actually been implemented and approved.

## Security validation

Confirm:

- No service key in browser assets.
- No API provider key exposed.
- RLS works against hosted DB.
- Cross-user access denied.
- Upload handling safe.
- Function endpoints validate inputs.
- Error messages do not leak secrets.

## Failure handling

Production should have understandable behavior for:

- Catalog outage.
- AI provider outage.
- Supabase error.
- Rate limit.
- Invalid upload.
- No catalog match.
- Empty recommendation candidate set.

## Exit condition

A reviewer can use a stable hosted application through its core flows.

---

# 21. Milestone 12 — Reliability, Security, Telemetry, and Polish

## Objective

Perform final cross-system hardening and make the project submission-ready.

This milestone is not permission for uncontrolled feature expansion.

## Reliability review

Test major flows repeatedly:

- Authentication.
- Manual CRUD.
- Catalog add.
- Image recognition.
- Search/filter.
- Ratings/favorites/notes.
- Listening history.
- AI recommendations.
- Conversation refinement.

Exercise failure paths, not only happy paths.

## Security review

Re-check:

- RLS policies.
- Column grants.
- Function privileges.
- Secrets.
- `.env` tracking.
- Service-role usage.
- Server/client separation.
- Upload validation.
- Model input/output validation.
- External API validation.
- Cross-user access.
- Auth-state handling.
- Logging/privacy.

## Dependency review

Run and document:

```bash
npm audit --omit=dev
npm audit --json
```

Triage rather than blindly force-upgrading.

Verify runtime dependencies separately from development-tool findings.

## AI safety review

Prove again that:

- Curator recommends only allowed owned IDs.
- Model cannot invent database truth.
- Out-of-set IDs are rejected.
- Image guesses require user confirmation.
- AI failure has controlled behavior.
- Conversation state remains bounded.
- Full permanent transcripts are not silently introduced.

## Telemetry

Keep telemetry useful but modest.

Potential final signals:

- Health endpoint.
- Function error logging.
- Catalog-call success/failure.
- Model-call success/failure/latency.
- No secret logging.
- No unnecessary personal-data logging.

## UX polish

Review:

- Loading states.
- Error states.
- Empty states.
- Confirmation states.
- Mobile/responsive layout.
- Accessibility basics.
- Keyboard/form behavior.
- Consistent terminology.
- Clear AI uncertainty.
- Clear recommendation explanations.
- Clear distinction between owned collection and external catalog candidates.

## Performance

Check:

- Production bundle.
- Database query behavior.
- Search responsiveness.
- Excessive duplicate network calls.
- LLM payload size.
- Image upload limits.
- Catalog/API caching where justified.

## Documentation

Final repository should contain:

- Current README/project overview.
- Intent.
- AGENTS instructions.
- ADRs.
- Specs.
- Plans.
- Verification evidence.
- Setup instructions.
- Local development instructions.
- Required environment-variable documentation.
- Known limitations.
- Final architecture overview.

## Final regression

Run the complete verification suite from a clean checkout where practical.

## Exit condition

The project is stable, explainable, secure enough for its intended scope, reproducible, and ready for final academic review/demo.

---

# 22. Cross-Milestone Dependency Map

```text
M0 Foundation
 |
 v
M1 Stack Scaffold
 |
 v
M2 Auth + Profile/RLS
 |
 v
M3 Manual Collection CRUD
 |
 +--------------------+
 |                    |
 v                    |
M4 Catalog API        |
 |                    |
 v                    |
M5 Photo Recognition |
 |                    |
 +---------+----------+
           |
           v
M6 Browse/Search/Filter
 |
 v
M7 Ratings/Favorites/Notes
 |
 v
M8 Listening History
 |
 v
M9 AI Curator
 |
 v
M10 Conversational Refinement
 |
 v
M11 Production Deployment
 |
 v
M12 Reliability/Security/Telemetry/Polish
```

This order is intentional.

The AI curator is delayed until the application has trustworthy:

- Authentication.
- Ownership.
- Collection data.
- Structured metadata.
- Preference signals.
- Listening-history signals.

That keeps the AI layer grounded in real application state instead of building a chat demo first and trying to bolt truth onto it later.

---

# 23. Expected Final User Journey

## First use

1. User opens Vinyl Intelligence.
2. User creates an account.
3. User confirms email.
4. User signs in.
5. User receives a secure personal profile and empty collection.

## Adding records manually

1. User chooses Add Record.
2. User may enter a record completely manually.
3. Record becomes part of the authenticated user’s collection.
4. Another user cannot see it.

## Adding from catalog

1. User searches artist/title.
2. Backend queries chosen catalog.
3. User sees normalized candidates.
4. User selects the correct release.
5. User confirms.
6. Structured metadata is stored and ownership is created.

## Adding from a photo

1. User uploads a cover.
2. Vision model extracts clues.
3. Backend searches catalog.
4. App shows likely candidates.
5. User confirms the right release.
6. Only the confirmed result is persisted.
7. Temporary image is cleaned up.

## Normal library use

The user can:

- Browse.
- Search.
- Filter.
- Sort.
- Rate.
- Favorite.
- Add notes.
- Mark records as played.
- Inspect listening history.

## AI curator

User asks:

> “I had a stressful day. Give me something relaxing but not sleepy, and preferably something I have not played recently.”

The system:

1. Interprets intent into structured constraints.
2. Queries only the user’s collection.
3. Reduces to a safe candidate set.
4. Gives the model only allowed candidates.
5. Validates returned IDs.
6. Returns a few grounded recommendations.
7. Explains why each fits.

## Follow-up

User says:

> “A little more energetic, and not jazz.”

The system carries forward only relevant bounded state, re-runs retrieval/ranking, and returns new owned candidates.

---

# 24. Repository Audit Trail

The repository should tell the story of the engineering process.

## Source-of-truth documents

Expected long-lived documents include:

```text
intent.txt
AGENTS.md
docs/decisions/
docs/specs/
docs/plans/
docs/verification.md
```

## For each milestone

Create or update:

- Specification.
- Implementation plan.
- Human approval state.
- Verification evidence.
- Relevant ADR if a material architecture decision changes.
- Coherent implementation commits.
- Pull request.

## Branch discipline

Each meaningful milestone should use its own branch, generally:

```text
codex/milestone-N-description
```

No unrelated milestones in the same branch.

## Commit discipline

Prefer multiple meaningful commits, for example:

```text
docs: approve milestone N implementation
chore: add required foundation
db: add ...
feat: add ...
test: verify ...
docs: record milestone N verification
```

Exact grouping depends on the work, but avoid one giant unreviewable commit.

## Pull request description

Every milestone PR should explain:

- Specification.
- Implementation summary.
- Verification performed.
- Security implications.
- Known gaps.
- Anything deferred.

## Independent verification

Before merge:

- Inspect the actual GitHub diff.
- Verify claimed commits.
- Check branch/base relationship.
- Confirm scope.
- Read critical SQL/security logic.
- Check package versions when relevant.
- Check tests actually exercise the required behavior.
- Perform human runtime verification where required.

The agent’s final report is evidence to inspect, not truth to accept automatically.

---

# 25. Definition of Done

The entire Vinyl Intelligence project is done only when:

- Milestones 0–12 are completed or an explicitly approved scope reduction is documented.
- Every implemented milestone has a specification and plan.
- Every milestone implementation received explicit human authorization.
- Core milestones were independently reviewed before merge.
- The application is deployed.
- Auth works.
- RLS protects user-owned data.
- Manual collection CRUD works.
- Catalog integration works.
- Photo recognition requires user confirmation.
- Browse/search/filter work without AI.
- Ratings/favorites/notes work.
- Listening history works.
- Curator recommendations are restricted to owned IDs.
- Conversation refinement remains bounded.
- No browser secrets are exposed.
- No unjustified RAG/vector DB has been added.
- No unjustified multi-agent design has been added.
- Relevant typecheck/lint/tests/build checks pass.
- Database verification passes.
- Production smoke testing passes.
- Known security/dependency findings are documented.
- Final repository documentation is coherent.
- Audit trail makes the human-agent engineering process reviewable.
- Final demo can explain not only **what was built**, but **why each major choice was made and how it was verified**.

---

# 26. Explicit Non-Goals

Unless later explicitly approved through the same specification/plan/approval process, the project should not expand into:

- Streaming music playback.
- Social networking.
- Marketplace/buy-sell functionality.
- Generic external music recommendations as the core curator behavior.
- Autonomous AI modification of the collection.
- Bulk shelf scanning as an MVP requirement.
- Permanent storage of uploaded cover photos.
- Permanent storage of full AI curator transcripts.
- RAG/vector search infrastructure.
- Multiple AI agents added merely for architecture theater.
- OAuth/social login in the current authentication milestone.
- Large analytics/observability infrastructure.
- Unrelated external APIs added merely to increase integration count.

---

## Final Engineering Principle

The strongest version of Vinyl Intelligence is not the one with the largest number of AI calls.

It is the version in which deterministic software establishes trustworthy identity, ownership, metadata, history, and constraints — and AI is then applied precisely where human ambiguity, visual recognition, and recommendation reasoning genuinely benefit from it.

That is also the central engineering story of the project:

> **Build truth first. Add intelligence on top of truth. Verify both.**
