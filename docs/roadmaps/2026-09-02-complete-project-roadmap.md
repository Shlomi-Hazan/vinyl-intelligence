# Vinyl Intelligence — Complete Project Roadmap (Current)

**Project:** Vinyl Intelligence
**Course:** Agentic Software Engineering (ASE-26)
**Repository:** `Shlomi-Hazan/vinyl-intelligence`
**Primary build workflow:** Human-directed agentic software engineering (Codex, then Claude Code)
**Roadmap version:** 2026-09-02 (current)
**Supersedes:** `docs/roadmaps/2026-08-18-complete-project-roadmap.md` — preserved unchanged as the historical snapshot
**Scope:** Full project plan from foundation through production-ready final polish, updated to record the project's actual evolution after Milestone 10

---

## How this roadmap relates to the 2026-08-18 snapshot

The 2026-08-18 roadmap is an **intentional historical snapshot** of the plan as it stood before implementation of Milestones 3–12. It remains in the repository, unchanged, for auditability. Do not edit it.

This document is the **current** roadmap. The project mission, product principles, approved architecture, data/security boundaries, agentic workflow, and verification philosophy are **unchanged** from the snapshot and are reproduced here for a self-contained read. What changed is the **execution history and one inserted pass**:

- Milestones 0–10 are **complete and merged to `main`**.
- After Milestone 10, before starting Milestone 11 (Production Deployment), the human assessed the application as functionally rich but **not yet at the intended product-experience quality for production**. Deploying directly after M10 would have shipped a development / demo interface rather than the intended polished record-collector product.
- The human therefore **deliberately inserted a dedicated pre-M11 product-quality pass**: the **Visual Experience & Product Identity Pass**. This was **not part of the 2026-08-18 plan** — it is a documented mid-project evolution.
- That pass is now **complete on the feature branch and human-accepted (Phases A–E)**, but is **not yet merged** as of this roadmap's date.
- **Milestone 11 has not started.** Production deployment has not started. No hosted Supabase migration has been applied.
- **Milestone 12 is unchanged** and still follows M11. The inserted pass does **not** replace M12.

```text
original 2026-08-18 roadmap
  -> project executed M0..M10
  -> human judged pre-deployment product quality insufficient
  -> human inserted the Visual Experience & Product Identity Pass (Phase 0 + A..E)
  -> pass completed and accepted on the feature branch
  -> M11 Production Deployment becomes the next milestone
```

---

## Table of Contents

1. [Project Mission](#1-project-mission)
2. [What Success Means](#2-what-success-means)
3. [Product Principles](#3-product-principles)
4. [Approved Architecture](#4-approved-architecture)
5. [Core Data and Security Boundaries](#5-core-data-and-security-boundaries)
6. [Agentic Engineering Workflow](#6-agentic-engineering-workflow)
7. [Global Verification Standard](#7-global-verification-standard)
8. [Milestone Summary and Status](#8-milestone-summary-and-status)
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
20. [Inserted Pass — Visual Experience & Product Identity](#20-inserted-pass--visual-experience--product-identity)
21. [Milestone 11 — Production Deployment](#21-milestone-11--production-deployment)
22. [Milestone 12 — Reliability, Security, Telemetry, and Polish](#22-milestone-12--reliability-security-telemetry-and-polish)
23. [Cross-Milestone Dependency Map](#23-cross-milestone-dependency-map)
24. [Expected Final User Journey](#24-expected-final-user-journey)
25. [Repository Audit Trail](#25-repository-audit-trail)
26. [Definition of Done](#26-definition-of-done)
27. [Explicit Non-Goals](#27-explicit-non-goals)

---

# 1. Project Mission

Vinyl Intelligence is an AI-powered web application for vinyl collectors that turns a personal physical record collection into an intelligent, searchable, conversational music library.

The product must answer two different classes of question:

- **Deterministic library questions:** "What records do I own?", "Show me jazz from the 1970s", "What did I play last week?"
- **Human-intent questions:** "I had a stressful day; give me something relaxing but not sleepy", "Surprise me with something I forgot I own", "Give me 90s rock that I have not played recently."

The project is **not** intended to become a generic music recommender or a chatbot with album data attached. The intelligence must operate over the user's real owned collection.

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
- **A polished, coherent product experience** — not a development interface (added emphasis after the inserted Visual Experience & Product Identity pass).
- Specifications, plans, ADRs, verification evidence, coherent commits, and PR history that show how the human directed the coding agent.

The final repository should make the engineering process understandable to a reviewer even without access to the original chat history.

---

# 3. Product Principles

*(Unchanged from the 2026-08-18 snapshot.)*

## 3.1 Use AI only where cognition adds value

AI is appropriate for: natural-language musical intent, mood/vibe interpretation, album-cover vision recognition, recommendation reasoning, recommendation explanations, short conversational refinements.

Deterministic software should handle: authentication, authorization, CRUD, exact search, filtering, sorting, database integrity, listening-event storage, validation, counting, derived fields such as decade, API caching and normalization where practical.

## 3.2 The owned collection is the recommendation boundary

For the core "what should I play?" experience, every recommended album must be drawn from the authenticated user's owned collection. The model must never invent an album ID or quietly recommend an external album as though the user owns it.

## 3.3 Manual control is first-class

The application must remain useful without AI. The user must always be able to add/edit/delete records, search/browse/filter normally, correct AI recognition, reject AI candidates, enter data manually when APIs fail, and choose an album without opening the curator.

## 3.4 Uncertainty must be visible

Vision recognition is advisory until confirmed:

```text
image -> vision extraction -> external catalog search -> normalized candidates -> user confirmation -> persistence
```

No uncertain vision result may be silently persisted.

## 3.5 Structured truth beats model-generated truth

Authoritative structured metadata should come from the chosen music catalog wherever possible. The model may extract clues, interpret intent, rank candidates, or explain results, but not replace structured sources for fields obtainable elsewhere.

## 3.6 Keep the architecture proportional

Do not add complexity only to sound more "AI": no core RAG/vector database, no unjustified multi-agent architecture, no permanent full curator transcript storage for the MVP, no autonomous collection modification without confirmation.

## 3.7 Product experience is part of the product (clarified by the inserted pass)

A functionally complete application is not the same as a shippable product. Before production deployment the interface must be coherent, responsive, accessible, and identifiably *Vinyl Intelligence*, not a scaffold. This principle motivated the inserted Visual Experience & Product Identity pass; it does not authorize scope creep in features.

---

# 4. Approved Architecture

The initial architecture remains approved and is the default unless a later ADR explicitly changes it. No architecture principle was reversed by the inserted pass.

## Frontend

- **Vite + React + TypeScript** — authentication UI, collection UI, browse/search/filter UX, ratings/favorites/notes, listening-history UX, photo-upload UX, AI curator UX, client-side interaction state.
- Added during the inserted pass (ADR `0005`): **`react-router-dom` v7** — the one runtime dependency added by the pass — for real multi-page routing, guarded route groups, deep-linkable album detail, and route-level code splitting.

## Privileged backend

- **Netlify Functions** — external music catalog calls requiring server-side handling, LLM calls, vision-model calls, recommendation orchestration, validation around external/model responses, elevated server credentials where explicitly approved. Normal browser-to-Supabase user-owned workflows are not routed through Netlify Functions merely for ceremony.

## Database, authentication, storage

- **Supabase Postgres + Auth + Storage.** Supabase RLS is a central security boundary. The inserted pass added two private Storage buckets (custom album covers, profile avatars), each owner-scoped by RLS and only reachable with short-lived signed URLs that are never persisted.

## Deployment

- **Netlify** (frontend + Functions), **hosted Supabase** project. Not yet configured — that is Milestone 11.

## Source control and review

- **GitHub.** One branch per meaningful milestone (or named pass). Human-reviewed PR before merge to `main`.

## Rejected / deferred architecture choices

Next.js, RAG/vector DB, default multi-agent system, permanent curator transcript storage, Supabase Edge Functions as the primary privileged backend — all still rejected/deferred. The inserted pass added **no** motion library, icon library, image/CDN library, or cropping dependency; fonts are self-hosted; artwork is resolved at display time from stored MusicBrainz IDs with no `releases.cover_url`.

---

# 5. Core Data and Security Boundaries

The enduring boundaries from the snapshot are unchanged. Schema introduced incrementally by milestone; the inserted pass added forward migrations only (never edited history).

## 5.1 Shared release data vs ownership

`releases` (normalized catalog information, shared, read-only to the browser) is separate from `collection_items` (the authenticated user's ownership). Catalog identity is never confused with ownership.

## 5.2 Profiles

`public.profiles`: `id`, nullable `display_name`, `created_at`, `updated_at`, owned by the matching authenticated user. The inserted pass (Phase D) added nullable `avatar_path` / `avatar_updated_at` with a canonical-path CHECK and a column-scoped `UPDATE` grant.

## 5.3 Listening events

`listening_events` is the source of truth for listening history, count, last-listened, and recent/forgotten calculations. `listening_count` / `last_listened_at` are **not** denormalized onto `collection_items`. M8 shipped append-only; the inserted pass (Phase D, human-approved) added the **minimum** owner-scoped correction affordance: a column-scoped `UPDATE (listened_at)` grant + `DELETE` grant + own-row RLS for both, anon denied. A listen can never be re-pointed at another album or user.

## 5.4 AI telemetry

A lightweight `model_calls` audit/telemetry concept exists (M9). It remains proportional and privacy-conscious. The inserted pass did not change it.

## 5.5 Cover imagery

- **Uploaded recognition photos (M5):** temporary; deleted after identification.
- **User custom album covers (inserted pass, Phase 0):** deliberate, persistent, owner-scoped — one canonical `cover.webp` per collection item in a private `collection-covers` bucket, `collection_items.custom_cover_path`, four `storage.objects` RLS policies. ADR `0005`.
- **Provider artwork (inserted pass, Phase C):** resolved **at display time** in the browser from stored MusicBrainz release / release-group IDs via Cover Art Archive `<img>` URLs, with a branded CSS/SVG fallback. No backend call, no persisted provider URL, no proxy.
- **Profile avatars (inserted pass, Phase D):** optional; one canonical `avatar.webp` per user in a private `profile-avatars` bucket; initials are the permanent default and fallback. ADR `0006`.

## 5.6 Browser credentials

Browser may use the Supabase project URL and publishable key only. It must never receive the service-role/secret key, any LLM provider secret, any catalog secret, or other privileged credentials. Verified again in the inserted pass code review (no `service_role` in any browser path; no signed URL persisted or logged).

## 5.7 RLS and least privilege

RLS protects which rows a user can access; database grants protect which operations and columns an API role may mutate. RLS alone is not a complete authorization system. Every inserted-pass migration ships with pgTAP proving both the row policy and the column/operation grant, including the negative cases.

---

# 6. Agentic Engineering Workflow

*(Unchanged from the 2026-08-18 snapshot.)*

Every meaningful milestone — and the inserted pass, phase by phase — follows the same pipeline:

```text
Intent -> Specification -> Context -> Plan -> Human Approval -> Execution -> Verification -> Independent Review -> Audit Trail -> Pull Request -> Human Merge
```

- **Intent:** confirm the work still advances the product defined by `intent.txt`.
- **Specification:** user outcome, functional/non-functional/security requirements, data/API/AI implications, failure behavior, acceptance criteria, explicit non-goals.
- **Context:** inspect existing code, conventions, tests, DB state, dependencies, branch/base, prior constraints.
- **Plan:** files/migrations/dependencies/security controls/API steps/test strategy/manual verification/commit sequence/stop conditions.
- **Human approval:** no implementation begins until the spec and plan are explicitly approved and recorded.
- **Execution:** stay inside the approved milestone/phase; small coherent reversible commits; no speculative future-feature code.
- **Verification:** automated checks plus independent review. "The agent says it works" is not verification.
- **Audit trail:** enough evidence to reconstruct intent, approval, changes, tests, gaps, and the reasoning behind major decisions.

The inserted pass followed this loop per phase (A–E), with a **single focused end-of-pass code review** rather than per-phase review loops, plus page-by-page human visual acceptance.

---

# 7. Global Verification Standard

*(Unchanged from the 2026-08-18 snapshot.)*

Before a milestone or pass phase may be declared complete, run the relevant checks:

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

Additional rules: never `npm audit fix --force` reflexively; production-reachable high/critical findings require explicit review; dev-only findings are triaged and documented, not hidden; model outputs and external API responses are untrusted inputs and must be validated; file uploads must be validated; no milestone/phase is marked implemented if a required local verification step is blocked; hosted smoke tests supplement, not replace, deterministic local verification.

The inserted pass added, as standing verification for its surface area: measured reduced-motion audit (`getAnimations()` empty under `prefers-reduced-motion`), measured responsive audit (0 horizontal overflow, 64px topbar invariant across route × viewport matrix), measured contrast ratios, and a bundle-budget check (initial route JS < 200 kB gzip).

---

# 8. Milestone Summary and Status

| Milestone / Pass | Name | Primary Outcome | Status |
|---|---|---|---|
| 0 | Foundation | Intent, workflow, architecture, initial decisions | **Complete — merged** |
| 1 | Stack Scaffold | Vite/React/TS + Netlify Functions baseline | **Complete — merged** |
| 2 | Supabase Auth + Profile/RLS | Secure authenticated user boundary | **Complete — merged (PR #2)** |
| 3 | Manual Collection CRUD | Users manage owned records manually | **Complete — merged (PR #3)** |
| 4 | Music Catalog API | External release search + normalized metadata (MusicBrainz) | **Complete — merged (PR #4)** |
| 5 | AI Photo Recognition | Photo → clues → candidates → confirmation | **Complete — merged (PR #5)** |
| 6 | Browse / Search / Filter | Fast deterministic library exploration | **Complete — merged (PR #6)** |
| 7 | Ratings / Favorites / Notes | Personal preference signals | **Complete — merged (PR #7)** |
| 8 | Listening History | Timestamped listening behavior (append-only) | **Complete — merged (PR #8)** |
| 9 | AI Curator | Safe owned-collection recommendations | **Complete — merged (PR #10)** |
| 10 | Conversational Refinement | Bounded multi-turn recommendation refinement | **Complete — merged (PR #11)** |
| — | **Visual Experience & Product Identity Pass** (inserted pre-M11) | Premium coherent product experience | **Phase 0 merged (PR #12); Phases A–E complete + human accepted, on branch, PR open, not merged** |
| 11 | Production Deployment | Real hosted application | **Not started** |
| 12 | Reliability / Security / Telemetry / Polish | Final hardening and submission readiness | **Not started** |

`origin/main` HEAD at this roadmap's date: `945ed3d20bf5e5e1d94d60e7d104a3351b19bc38` (the Phase 0 merge).

---

# 9. Milestone 0 — Foundation

**Objective:** create the source-of-truth project foundation before application development.

**Delivered:** `intent.txt`, `AGENTS.md`, initial architecture ADR (`docs/decisions/0001`), music-catalog API spike spec, GitHub repository, branch/commit discipline. Key decisions: Vinyl Intelligence is an intelligent personal collection system (not a generic recommender); manual + AI curator modes equally important; Vite + React + TS frontend; Netlify Functions privileged backend; Supabase database/auth/storage; Netlify deployment; no core RAG; no unjustified multi-agent; release-level identity with album-first UX; temporary uploaded cover images; listening events as the listening-history source of truth; lightweight model-call telemetry only.

**Status: Complete — merged.**

---

# 10. Milestone 1 — Stack Scaffold

**Objective:** the smallest trustworthy executable application foundation.

**Delivered:** Vite + React + TypeScript, Node 24 project contract, npm lockfile, ESLint, type checking, Vitest + React Testing Library + jsdom, Netlify Vite integration, `/api/health` Netlify function, minimal starter UI, local build/test workflow. No product features, no Supabase, no auth, no catalog, no LLM, no image recognition.

**Status: Complete — merged.**

---

# 11. Milestone 2 — Supabase Auth + Profile/RLS

**Objective:** establish the first real authenticated user boundary and prove user-owned data can be protected.

**Delivered:** email + password sign-up/confirm/sign-in/refresh/sign-out; `public.profiles` (`id` FK to `auth.users` `ON DELETE CASCADE`, nullable trim-normalized `display_name` max 80, timestamps); `SECURITY DEFINER` profile-creation trigger in a non-exposed `private` schema with fixed `search_path`; least-privilege grants (authenticated: `select` own + `update (display_name)` own only); own-row RLS for select and update; browser uses `VITE_SUPABASE_URL` + publishable key only. pgTAP proves per-user isolation, anon denial, column/timestamp immutability, exactly-one-profile-per-user, trigger not RPC-executable, cascade on delete, and display-name validation. Frontend tests cover loading / unauthenticated / sign-in / confirmation-pending / authenticated shell / sign-out / display-name / missing-profile / error states.

**Spec/plan/verification:** `docs/specs/0003`, `docs/plans/003`, `docs/verification.md`.

**Status: Complete — merged (PR #2).**

---

# 12. Milestone 3 — Manual Collection CRUD

**Objective:** make the application genuinely useful as a personal vinyl collection even without external APIs or AI.

**Delivered:** the `releases` / `collection_items` ownership boundary; manual create/read/edit/delete of owned records; intentional manual field set (artist, title, release year, label, catalog number, country, format, one optional genre); per-user RLS + column grants; collection list, empty state, add form, detail/edit, delete confirmation, success/error states. pgTAP + frontend tests prove CRUD, validation, per-user ownership isolation, cross-user denial, empty state, refresh persistence, DB constraints.

**Spec/plan/verification:** `docs/specs/0004`, `docs/plans/004`, `docs/verification.md`.

**Status: Complete — merged (PR #3).**

---

# 13. Milestone 4 — Music Catalog API Integration

**Objective:** let users search external music metadata and add a confirmed release without typing all metadata.

**Delivered:** evidence-based provider spike → **MusicBrainz** (with Cover Art Archive for display-time imagery) chosen; ADR `0002`. Catalog search + release fetch/normalize run through a Netlify Function (`MUSICBRAINZ_USER_AGENT` server-side); the browser consumes a normalized internal shape. Add flow: query → backend search → normalized candidates → user selects release → backend fetch/normalize → confirmation → persist release + ownership. Best-effort paced release-group genre lookup on add (never overwrites existing genres). Duplicate copies allowed. Query input + external responses validated; errors normalized; rate limits handled.

**Spec/plan/verification:** `docs/specs/0005`, `docs/plans/005`, `docs/decisions/0002`, `docs/verification.md`.

**Status: Complete — merged (PR #4).**

---

# 14. Milestone 5 — AI Photo Recognition + Candidate Confirmation

**Objective:** the "wow" flow — identify a vinyl record from a cover image while preserving user control and structured truth.

**Delivered:** current-evidence vision-provider decision (OpenRouter, `google/gemini-3.1-flash-lite`; ADR `0003`). Flow: upload → validate image (MIME + size) → temporary processing → vision model extracts search clues → validate structured model output → catalog search → normalized candidates → show uncertainty → user confirms → persist confirmed release/collection item → delete temporary image. Model confidence is advisory/debug only. Ambiguity shows multiple candidates, allows edited search terms / another image / manual entry; the top guess is never silently persisted. Per-tab `sessionStorage` draft persistence for clues/query (UI-state only, no auto-submit). Provider-only retry does not re-run Vision. Tests cover clear success, ambiguous release, no match, invalid/oversized upload, malformed vision output, catalog failure, reject/confirm, temporary-image cleanup, no-persist-before-confirmation.

**Spec/plan/verification:** `docs/specs/0006`, `docs/plans/006`, `docs/decisions/0003`, `docs/verification.md`.

**Status: Complete — merged (PR #5).**

---

# 15. Milestone 6 — Browse, Search, Sort, and Filter

**Objective:** make classic library mode excellent and deterministic.

**Delivered:** deterministic client-side search (artist / title), exact-year filter, decade filter (derived from year, never LLM-authored), genre filter, logical-AND combination, clear-filters, result count, five compact sorts (recently added, artist A–Z, album A–Z, year newest/oldest). No LLM and no network request on a filter change. `releases.genres` populated from MusicBrainz genre tags + an optional manual Genre field. Empty state distinct from no-results state; active filters visible; responsive. Tests prove search accuracy, filter combinations, per-user isolation, sort behavior, no AI/network dependency, reasonable performance.

**Spec/plan/verification:** `docs/specs/0007`, `docs/plans/007`, `docs/verification.md`.

**Status: Complete — merged (PR #6).**

---

# 16. Milestone 7 — Ratings, Favorites, and Notes

**Objective:** add explicit personal preference signals for manual use and future recommendation quality.

**Delivered:** on `collection_items` — a 1..5 rating (nullable / unrated), a favorite flag, a plain-text personal note (≤ 1000 chars). Partial-patch saves via the browser Supabase client with an own-row `UPDATE` policy scoped to exactly the three signal columns (toggling favorite never persists an unsaved note draft; saving a note never clobbers rating/favorite). DB + UI validation for the rating scale. Notes are owner-only; not sent to an LLM unless an explicitly approved recommendation behavior requires it. Ratings/favorites are signals, not absolute rules. Tests prove owner-only access, rating constraints, favorite toggling, note editing, refresh persistence, search/filter integration.

**Spec/plan/verification:** `docs/specs/0008`, `docs/plans/008`, `docs/verification.md`.

**Status: Complete — merged (PR #7).**

---

# 17. Milestone 8 — Listening History

**Objective:** track actual listening behavior to reason about recency, frequency, and rediscovery.

**Delivered:** immutable **append-only** `listening_events` (authenticated user, owned collection item, timestamp) as the source of truth; "Mark played" on every owned record; browser-derived play count and last-listened time (no denormalized columns, no counter triggers); a compact collapsible reverse-chronological history. Grants at M8: authenticated `SELECT` own + `INSERT (collection_item_id)` own only — **no `UPDATE` / `DELETE`**; own-item `INSERT` RLS; both foreign keys `ON DELETE CASCADE`. Tests prove event creation, recency ordering, count/last-listened derivation, cross-user denial, cascade implications, multiple listens, never-listened behavior.

*Note:* the inserted pass (Phase D) later added a minimum owner-scoped `UPDATE (listened_at)` + `DELETE` affordance — see [section 20](#20-inserted-pass--visual-experience--product-identity) and ADR `0006`. M8's append-only history is not rewritten.

**Spec/plan/verification:** `docs/specs/0009`, `docs/plans/009`, `docs/verification.md`.

**Status: Complete — merged (PR #8).**

---

# 18. Milestone 9 — AI Curator

**Objective:** the central AI recommendation experience, guaranteed to stay inside the user's owned collection.

**Core safety invariant:** the LLM may select only from backend-generated allowed collection-item IDs; it is never asked to invent or freely generate owned album IDs.

**Delivered:** `POST /api/curator/recommend` — a single-turn natural-language request produces a small grounded recommendation set drawn only from owned records. Two-stage OpenRouter pipeline: intent extraction (`google/gemini-3.1-flash-lite`) → validate structured intent → deterministic hard filter + rank over the RLS-owned collection/history → ≤ 12 allowed candidates → selection/explanation (`google/gemini-3.5-flash`) using allowed IDs only → strict allowed-ID validation of the model's choice. Default output: 3 recommendations, one marked best match. Per-user rate limit; `model_calls` telemetry (provider, operation, timing, success/failure, token/cost metadata where safe). No `service_role` collection read; no new table beyond a `model_calls` feature-allow-list widening. Representative prompt matrix verified (calm-after-stress, energetic-for-friends, 90s-not-recent, no-jazz, surprise-me, forgotten record, high-rated-not-recent, conflicting constraints, empty candidate set, malformed model output, out-of-set malicious ID).

**Spec/plan/verification:** `docs/specs/0010`, `docs/plans/010`, `docs/decisions/0004`, `docs/verification.md`.

**Status: Complete — merged (PR #10).**

---

# 19. Milestone 10 — Conversational Refinement

**Objective:** short multi-turn refinement without uncontrolled long-term conversational memory.

**Delivered:** `POST /api/curator/refine` — a bounded follow-up (max 1 initial + 3 refinements per local session) returns a new owned-only recommendation set that refines the previous interpreted intent. The model returns a complete revised `CuratorIntent`; retrieval reads fresh RLS-owned data every turn; "something else" structurally excludes prior picks. Conversation state is **React-memory-only** — no table, no `sessionStorage` / `localStorage`, no permanent transcript. The shared `curator_intent` rate budget applies; no migration. Every turn still enforces the M9 owned-candidate invariant. Predictable reset on new session / sign-out / expired state / contradictory refinement. Tests prove constraint carry-forward, new exclusion, non-repeat of rejected suggestions, reset behavior, user-switch isolation, malformed prior state, model failure, no transcript persistence.

**Spec/plan/verification:** `docs/specs/0011`, `docs/plans/011`, `docs/verification.md`.

**Status: Complete — merged (PR #11).**

---

# 20. Inserted Pass — Visual Experience & Product Identity

**(Inserted Pre-M11 Product Quality Pass — NOT part of the 2026-08-18 roadmap.)**

## Why this pass was inserted

Milestones 0–10 completed the core **functional** product: secure auth, owned collection, catalog integration, photo recognition, deterministic browsing, preference signals, listening history, a grounded AI curator, and bounded conversational refinement. All of it worked and was verified.

But the interface was a **development / demo shell**: a single scrolling page with no routing, no product identity, no album artwork, and utilitarian styling. Before Milestone 11 (Production Deployment), the human assessed that deploying as-is would ship something that *worked* but did not *look or feel like a product a vinyl collector would choose to use*.

The human therefore **deliberately inserted a dedicated pre-M11 product-quality pass** to transform the accepted functional application into the intended premium record-collector product experience — **without changing the product concept, the AI boundaries, or the security model**.

This pass is documented as a first-class effort:

- **Specification:** `docs/specs/0012-visual-experience-product-identity.md`
- **Plan:** `docs/plans/012-visual-experience-product-identity.md`
- **Decisions:** `docs/decisions/0005` (routing dependency, custom-cover storage, display-time provider artwork), `docs/decisions/0006` (listening-event mutability, user-owned personal genres, optional profile avatar)
- **Verification:** `docs/verification.md` — sections "Visual Experience Pass — Phase 0 / Phase A / Phase B Evidence", "Phase C …", "Phase D", "Phase E"

## Product / architecture preserved (non-negotiable for this pass)

- M9 / M10 curator request and response contracts are **byte-for-byte unchanged**; no `netlify/`, `src/lib/curator/`, or `src/lib/vision/` file was modified.
- Provider artwork remains a **display-time browser concern** resolved from stored MusicBrainz IDs; **no `releases.cover_url`**, no catalog-add lookup, no proxy.
- No browser `service_role` exposure; signed URLs are **memory-only**, never persisted or logged.
- Custom covers and profile avatars are **owner-scoped** (RLS + bucket config + pgTAP).
- Catalog `releases` remain **shared and read-only** to the browser.
- Existing auth / RLS / grant boundaries preserved; every new migration is **forward-only** with pgTAP for both the row policy and the column/operation grant.

## Phases

### Phase 0 — Custom-cover architecture & storage
Private `collection-covers` Storage bucket (webp only), `collection_items.custom_cover_path` + `custom_cover_updated_at` + canonical-path CHECK, four `storage.objects` RLS policies, column grant. Migration `20260903120000_add_custom_cover_storage.sql`.
**Status: COMPLETE — merged separately to `main` in PR #12** (merge commit `945ed3d20bf5e5e1d94d60e7d104a3351b19bc38`).

### Phase A — Design system, routing, AppShell, transitional hosts
Design tokens (warm charcoal / ivory / bronze / green; Fraunces / Inter / IBM Plex Mono; `clamp()` type scale; motion tokens). `react-router-dom` v7 with 10 real routes + auth guards + deep links + route-level `React.lazy`. AppShell (64px topbar invariant, collapsible sidebar → icon rail → mobile bottom nav). `CollectionDataProvider` as the single post-auth data source. Transitional page hosts for every M2–M10 feature. Fallback `AlbumArtwork`.
**Status: COMPLETE + HUMAN ACCEPTED** (independently audited and corrected).

### Phase B — Landing, Auth, Dashboard, route-level code splitting
Full cinematic landing page; redesigned split-layout auth; real data-driven dashboard (derived data only); route-level code splitting (entry chunk materially reduced). Canonical five Vinny (VIN curator character) image assets; bronze V·I glyph as a single token.
**Status: COMPLETE + HUMAN ACCEPTED.**

### Phase C — Artwork system, Collection, Discover, Scan
One canonical `AlbumArtwork` component with a four-tier precedence: custom signed cover → Cover Art Archive release front → CAA release-group front → branded CSS/SVG fallback (advance on `<img>` error, never loop). Custom-cover management UI. Collection populated experience (cover grid / compact list, search/filter/sort, favourites/ratings/notes/mark-played, filtered-empty ≠ collection-empty). Discover and Scan redesigned with honest, distinct states (analyzing ≠ searching catalog; no-match ≠ technical error; no silent persist). Plus a shared-shell top-bar height fix.
**Status: COMPLETE + HUMAN ACCEPTED.**

### Phase D — Album Detail, History, Settings, avatar, personal genres, listening-event edit/delete
- **Migration `20260904120000`** — owner-scoped `UPDATE (listened_at)` + `DELETE` on `listening_events` (M8 append-only superseded by the minimum; anon denied; other columns immutable to the browser).
- **Migration `20260904121000`** — `collection_items.personal_genres text[]` (owner-scoped, CHECK reuses the release-genre validator). Fixes finding 8D-2: catalog releases are read-only to the browser, so owners add their own genres on the item they own rather than weakening `releases` RLS. Browsing/filtering uses effective genres = catalog ∪ personal, unioned client-side, neither source mutated.
- **Migration `20260904122000`** — optional profile avatar: `profiles.avatar_path` / `avatar_updated_at`, private `profile-avatars` bucket (webp, 1 MiB), four owner-isolated `storage.objects` policies. Initials are the permanent default and fallback everywhere; a shared `UserAvatar` component owns photo + initials + failed-image fallback.
- **History** rebuilt as a day-grouped listening journal (browser-local Today / Yesterday / date), real thumbnails, per-play time correction and deletion via the Dialog primitive.
- **Album Detail** rebuilt as the definitive record page: album-focused hero, real catalog metadata only, filled-heart favourite + star rating + notes, truthful listening section, catalog metadata **read-only** (manual releases keep the edit form; catalog releases show an explanation), user-owned genre chips, "Remove from collection" via a Dialog distinct from deleting a listen.
- **Settings** rebuilt to PROFILE (avatar, display name, read-only account email) + ACCOUNT (sign out); no invented settings.
- ADR `0006`.
**Status: COMPLETE + HUMAN ACCEPTED.**

### Phase E — Motion, responsive, accessibility, performance, final focused review
Motion vocabulary finalised (duration tokens aligned to the approved values; standard `:active` compression; suppressed under `prefers-reduced-motion`). Measured reduced-motion audit (`getAnimations()` empty on every route). Measured responsive audit — 10 authenticated routes × {1280, 768, 390, 360}: **0 horizontal overflow, 64px topbar invariant, one `<h1>` per route**; nav contract verified. Accessibility corrections: Collection search focus ring, mobile "More" drawer keyboard trap + focus return, ≥ 44px bottom-nav touch targets, canonical SVG rating stars (filled/outline geometry, not colour only). Contrast re-verified against actual rendered surfaces — all combinations pass WCAG AA. Route code splitting confirmed material; **entry JS ≈ 135 kB gzip, below the 200 kB target**. LOW findings 22A–C addressed (personal-genres wording, catalog-duplicate genre guard, mounted `*`-glyph rating). **One reserved end-of-pass focused code review: 0 BLOCKER, 0 HIGH, 0 MEDIUM, remaining LOW/NOTE only** — the one MEDIUM cascade finding (`.legacy-host button` outranking `.vi-btn`) was fixed by commit `8226328` with the narrow `.legacy-host button:where(:not(.vi-btn))` selector and its hover pair, then visually human-verified.
**Status: COMPLETE + HUMAN ACCEPTED.**

## Current state of the pass

- Phase 0 is **merged** to `main` (PR #12).
- Phases A–E are **complete and human-accepted**, implemented on branch `claude/visual-experience-product-identity-ui`.
- As of this roadmap's date the A–E work is **not yet merged**; the final PR for it is being opened now.
- **Milestone 11 has not started.** Production deployment has not started. **No hosted Supabase migration has been applied.**

## Relationship to Milestone 12

This pass handled the major **pre-deployment** product / UI transformation. It does **not** replace Milestone 12. M12 remains responsible for **post-deployment / submission hardening**: reliability re-testing of every flow (including failure paths), a security re-check, telemetry review, production-behavior verification, final regression from a clean checkout, final academic/submission readiness, and remaining low-risk cleanup (e.g. the deferred legacy unmounted-component subtree). M12 is **not** another UI redesign.

---

# 21. Milestone 11 — Production Deployment

**Objective:** turn the verified local application into a real hosted system.

**Not started.** When it begins:

- **Deployment target:** Netlify frontend + Netlify Functions; hosted Supabase project.
- **Environment configuration:** production env vars set securely (Supabase URL + publishable key in the browser; server-only catalog and AI/provider credentials; privileged Supabase secret only for a specific approved backend need). Never commit production secrets.
- **Supabase production setup:** apply the **version-controlled migrations**, including the inserted-pass forward migrations that are **currently local-only** — `20260903120000` (custom-cover storage, already merged), `20260904120000` (listening-event management), `20260904121000` (personal genres), `20260904122000` (profile avatar storage). Verify RLS enabled, grants correct, auth redirect URLs, email confirmation behavior, Storage bucket policies (`collection-covers`, `profile-avatars`), database triggers, production-safe origins.
- **Netlify setup:** production build, SPA routing (`public/_redirects`), Netlify Functions, `/api/health`, env vars, function runtime compatibility, logs free of secrets, reasonable timeouts.
- **Hosted smoke test:** a fresh-account end-to-end run of every implemented flow — sign up → confirm → sign in → profile → add manual record → catalog add → image recognition → browse/filter → rate/favorite/note → mark listened → History edit/delete → curator recommendation → conversational refinement → custom cover → profile avatar → sign out.
- **Security validation:** no service key or provider key in browser assets; hosted RLS works; cross-user access denied; upload handling safe; function endpoints validate inputs; error messages leak no secrets; signed URLs remain memory-only in production.
- **Failure handling:** understandable production behavior for catalog outage, AI provider outage, Supabase error, rate limit, invalid upload, no catalog match, empty recommendation candidate set.

**Exit condition:** a reviewer can use a stable hosted application through its core flows.

---

# 22. Milestone 12 — Reliability, Security, Telemetry, and Polish

**Objective:** final cross-system hardening and submission readiness. **Not** permission for uncontrolled feature expansion, and **not** another full UI redesign — the inserted Visual Experience & Product Identity pass already handled the product/UI transformation.

**Not started.** Scope when it begins:

- **Reliability review:** repeatedly exercise every major flow *and its failure paths* — auth, manual CRUD, catalog add, image recognition, search/filter, ratings/favorites/notes, listening history (incl. edit/delete), AI recommendations, conversation refinement, custom covers, profile avatar.
- **Security review:** re-check RLS policies, column grants, function privileges, secrets, `.env` tracking, service-role usage, server/client separation, upload validation, model input/output validation, external API validation, cross-user access, auth-state handling, logging/privacy, signed-URL handling.
- **Dependency review:** `npm audit --omit=dev` + `npm audit --json`, triaged not force-upgraded; runtime vs dev findings separated.
- **AI safety review:** prove again the curator recommends only allowed owned IDs, the model cannot invent DB truth, out-of-set IDs are rejected, image guesses require confirmation, AI failure is controlled, conversation state stays bounded, no permanent transcripts.
- **Telemetry:** keep it useful but modest — health endpoint, function error logging, catalog and model call success/failure/latency; no secret or unnecessary personal-data logging.
- **UX polish:** final review of loading / error / empty / confirmation states, mobile/responsive, accessibility basics, keyboard/form behavior, consistent terminology, clear AI uncertainty, clear recommendation explanations, clear owned-vs-catalog distinction. (Most of this was completed in the inserted pass; M12 is a final regression check, not a redesign.)
- **Performance:** production bundle, DB query behavior, search responsiveness, duplicate network calls, LLM payload size, image upload limits, caching where justified.
- **Documentation:** current README/overview, intent, AGENTS, ADRs, specs, plans, verification evidence, setup and local-dev instructions, required env-var documentation, known limitations, final architecture overview, and both roadmaps (historical + current).
- **Final regression:** run the complete verification suite from a clean checkout.
- **Remaining low-risk cleanup:** e.g. the deferred legacy unmounted-component subtree (`CollectionPanel` / `CatalogPanel` / `CatalogPhotoPanel` / `CollectionItemCard` + tests).

**Exit condition:** the project is stable, explainable, secure enough for its intended scope, reproducible, and ready for final academic review/demo.

---

# 23. Cross-Milestone Dependency Map

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
M5 Photo Recognition  |
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
[INSERTED] Visual Experience & Product Identity Pass
           (Phase 0 merged; Phases A-E complete + accepted, PR open, not merged)
 |
 v
M11 Production Deployment
 |
 v
M12 Reliability / Security / Telemetry / Final Polish
```

This order is intentional. The AI curator is delayed until authentication, ownership, collection data, structured metadata, preference signals, and listening-history signals are all trustworthy. The Visual Experience & Product Identity pass is deliberately placed **after** the functional product is complete and **before** production deployment: it is a product-quality gate, not a feature milestone, and it must not destabilize the verified M0–M10 behavior.

---

# 24. Expected Final User Journey

*(Unchanged in substance from the 2026-08-18 snapshot; the inserted pass changed how it looks and feels, not what it does.)*

**First use:** open Vinyl Intelligence → create an account → confirm email → sign in → secure personal profile + empty collection.

**Add manually:** Add Record → enter a record completely manually → it joins the authenticated user's collection; another user cannot see it.

**Add from catalog:** search artist/title → backend queries MusicBrainz → normalized candidates → select the correct release → confirm → structured metadata stored, ownership created.

**Add from a photo:** upload a cover → vision model extracts clues → backend searches the catalog → likely candidates → confirm the right release → only the confirmed result is persisted → temporary image cleaned up.

**Normal library use:** browse the cover grid or compact list, search, filter, sort, rate, favourite, add notes, mark records as played, inspect and correct listening history, upload a custom cover, add personal genres.

**AI curator:** "I had a stressful day. Give me something relaxing but not sleepy, and preferably something I have not played recently." → intent interpreted into structured constraints → only the user's collection queried → reduced to a safe candidate set → model given allowed candidates only → returned IDs validated → a few grounded recommendations, each explained.

**Follow-up:** "A little more energetic, and not jazz." → only relevant bounded state carried forward → retrieval/ranking re-run → new owned candidates.

**Profile:** set a display name, optionally upload a profile photo (initials otherwise), sign out.

---

# 25. Repository Audit Trail

The repository should tell the story of the engineering process.

**Source-of-truth documents:** `intent.txt`, `AGENTS.md`, `docs/decisions/`, `docs/specs/`, `docs/plans/`, `docs/verification.md`, `docs/roadmaps/` (both the 2026-08-18 historical snapshot and this 2026-09-02 current roadmap).

**For each milestone and inserted-pass phase:** specification, implementation plan, recorded human approval, verification evidence, an ADR where a material architecture decision changed, coherent implementation commits, a pull request.

**Branch discipline:** each meaningful milestone / pass uses its own branch (`codex/milestone-N-…`, `claude/milestone-N-…`, or `claude/visual-experience-product-identity-ui` for the inserted pass). No unrelated efforts share a branch. An in-progress branch is not renamed merely because the implementing agent changes.

**Commit discipline:** multiple meaningful commits per effort (`docs: approve …`, `db: add …`, `feat: add …`, `test: verify …`, `docs: record … verification`), never one giant unreviewable commit.

**Pull request description:** specification, implementation summary, verification performed, security implications, known gaps, anything deferred.

**Independent verification before merge:** inspect the actual GitHub diff, verify claimed commits, check branch/base, confirm scope, read critical SQL/security logic, check package versions, confirm tests exercise the required behavior, perform human runtime verification where required. The agent's final report is evidence to inspect, not truth to accept automatically.

---

# 26. Definition of Done

The entire Vinyl Intelligence project is done only when:

- Milestones 0–12 are completed (or an explicitly approved, documented scope reduction), and the inserted Visual Experience & Product Identity pass is merged.
- Every implemented milestone and pass phase has a specification and plan, received explicit human authorization, and was independently reviewed before merge.
- The application is **deployed**.
- Auth works; RLS protects user-owned data.
- Manual collection CRUD works; catalog integration works; photo recognition requires user confirmation.
- Browse/search/filter work without AI.
- Ratings/favorites/notes work; listening history works (including the owner-scoped edit/delete affordance).
- Curator recommendations are restricted to owned IDs; conversation refinement remains bounded.
- No browser secrets are exposed; no signed URL is persisted or logged.
- No unjustified RAG/vector DB or multi-agent design has been added.
- The product experience is coherent, responsive, accessible, and identifiably *Vinyl Intelligence* — verified by the inserted pass and re-checked in M12.
- Relevant typecheck/lint/tests/build pass; database verification passes; production smoke testing passes.
- Known security/dependency findings are documented.
- Final repository documentation is coherent, including both roadmaps.
- The audit trail makes the human–agent engineering process reviewable, including the mid-project decision to insert the product-quality pass.
- The final demo can explain not only **what was built**, but **why each major choice was made — including the inserted pass — and how it was verified**.

---

# 27. Explicit Non-Goals

*(Unchanged from the 2026-08-18 snapshot.)*

Unless later explicitly approved through the same specification / plan / approval process, the project should not expand into: streaming music playback; social networking; marketplace / buy-sell functionality; generic external music recommendations as the core curator behavior; autonomous AI modification of the collection; bulk shelf scanning as an MVP requirement; permanent storage of uploaded *recognition* photos; permanent storage of full AI curator transcripts; RAG/vector search infrastructure; multiple AI agents added merely for architecture theater; OAuth/social login in the current authentication scope; large analytics/observability infrastructure; unrelated external APIs added merely to increase integration count.

The inserted Visual Experience & Product Identity pass did **not** add any of these. It added routing, a design system, two private owner-scoped Storage buckets (custom covers, profile avatars), display-time provider artwork, user-owned personal genres, and a minimum owner-scoped listening-event correction affordance — all within the existing product concept and security model.

---

## Final Engineering Principle

The strongest version of Vinyl Intelligence is not the one with the largest number of AI calls. It is the version in which deterministic software establishes trustworthy identity, ownership, metadata, history, and constraints — AI is applied precisely where human ambiguity, visual recognition, and recommendation reasoning genuinely benefit from it — **and the whole thing is presented as a product a collector would actually want to open.**

> **Build truth first. Add intelligence on top of truth. Make it a product. Verify all three.**
