# 0014 Milestone 12 — Reliability, Security, Telemetry, and Polish (Specification)

Status (2026-09-07): **COMPLETE.** Approved scope Phases A–D (verification +
documentation reconciliation) plus two runtime corrections found during human
acceptance (PR #19, PR #20). Automated gate green, independent PR review passed,
human production acceptance passed 2026-09-07.

- **Final accepted runtime `main`:** `c2037b8a09b10da796fa2435f268f316f7bb8442`
  (after PR #19 → PR #20).
- **Final accepted production deploy:** `6a9eaf39df3f13d430f76828`
  (`https://vinyl-intelligence.netlify.app`).
- **Human production acceptance:** 2026-09-07 (existing account; see
  `docs/verification.md` → "Milestone 12 — Human production acceptance").

**Runtime corrections during acceptance (M12 verification found two real
defects):**
1. **PR #19** — the transient VIN session was lost on `VIN → View record → back`
   navigation. Fixed by lifting exactly that transient state into a client-only
   `CuratorSessionProvider` mounted above the route outlet (no curator
   contract / prompt / model / schema change; React-memory-only persistence
   contract unchanged). Merged to `main` as `a74d689593eb796b6d347cb771ca8f3122491abb`.
2. **PR #20** — a shared mobile app-shell defect: `.vi-main` kept
   `grid-column: 2` at the mobile breakpoint after the grid collapsed to one
   column, creating an implicit column that shifted every route right and
   squeezed it to its content width (surfaced as History looking compressed on a
   phone). Fixed with `.vi-main { grid-column: 1 }` in the mobile block, plus the
   History-row polish from `104d32b`. Merged to `main` as
   `c2037b8a09b10da796fa2435f268f316f7bb8442`.

Baseline when M12 began: `main` = `ee6d695b449e3b7810be3663b5cd5b221fedd059`
(PR #18 merged — the VIN recommendation-card enhancement).

References (do not duplicate): `docs/roadmaps/2026-09-02-complete-project-roadmap.md`
§22, `intent.txt`, `docs/security.md`, `docs/verification.md`, `docs/decisions/`,
specs `0010`–`0013`.

Human approval recorded: 2026-09-07. Corrections applied: Phase E (legacy
dead-code removal) **deferred**; no GitHub Actions / CI; no dependency upgrades
for dev-only audit findings; as-built docs updated **in place**; `intent.txt`
gets an **appendix only**; historical 2026-08-18 roadmap **byte-unchanged**
(hash `cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`); human
acceptance reused the existing production account (no repeat signup/email
round-trip). Two production deploys were made from merged `main` for the runtime
corrections (PR #19 → deploy `6a9e9d455dae76f2dfda6ca5`; PR #20 → deploy
`6a9eaf39df3f13d430f76828`, the final accepted one).

---

## 1. Objective

Prove — from a clean checkout and against the live production site — that every
shipped flow and its failure paths, the security boundaries, the AI-safety
invariants, telemetry, and performance budgets still hold; reconcile the
documentation set to as-built reality; and produce one consolidated Milestone 12
evidence record plus a final architecture overview.

M12 changes code **only** if Phase A/B surfaces a real reliability / security /
correctness defect, and then only with a proportional, local, tested fix.

## 2. Scope

**In scope (Phases A–D):**
- A — clean-checkout automated verification (full gate + pgTAP + audit).
- B — read-only security + AI-safety re-proof (code + pgTAP + live 401/health/
  bundle scan); complete `.env.example` with the two optional OpenRouter
  attribution variable names.
- C — reliability + performance evidence map; re-measure the production bundle.
- D — documentation reconciliation to as-built + the consolidated
  `docs/verification.md` "Milestone 12" section + one PR.

**Deferred (not in M12):** Phase E — removal of the unmounted legacy subtree
(`CollectionPanel`, `CatalogPanel`, `CatalogPhotoPanel`, `CollectionItemCard`,
`CollectionItemPersonalControls`, `CollectionLibraryControls`, `ListeningHistory`,
`CatalogCandidateList`, `CatalogCandidateCard`, `CatalogSearchForm`, and the
related tests). Recorded as optional low-risk future cleanup; removing ~10
components and ~1,800 test lines now adds regression risk and is not required
for submission readiness.

**Non-goals:** new features; UI redesign; architecture replacement; RAG / vector
DB; multi-agent; new external APIs; analytics/telemetry infrastructure; a CI
pipeline; dependency force-upgrades; broad refactoring; custom domain / SMTP /
continuous deployment; daily/global spend-cap infrastructure; rewriting
historical artifacts; cosmetic rewrites of working code.

## 3. Requirements

### 3.1 Functional / reliability
- Every acceptance area in `docs/verification.md` §"Acceptance Areas" maps to an
  existing automated test, pgTAP assertion, or a recorded human check.
- Failure paths are documented with their covering evidence: catalog outage /
  rate-limit / malformed response / no match; vision provider outage / timeout /
  malformed output / oversized-or-unsupported image; curator provider outage /
  malformed output / out-of-scope / empty candidate set; Supabase error; auth
  expiry; duplicate record.
- The full automated matrix passes from a genuinely clean checkout.
- `GET /api/health` returns `{ "status": "ok" }` in production.

### 3.2 Security / AI-safety
- No server secret in the repo, the built browser bundle, or client-visible
  network traffic; no secret / unnecessary personal content in Function logs.
- `.env` git-ignored; only `.env.example` tracked; `.env.example` documents
  **all** env-var names (no values), including the two optional attribution
  headers, labelled optional.
- RLS enabled + owner-scoped on every public table and both storage buckets
  (pgTAP, unchanged).
- `service_role` is INSERT-only on `model_calls` and is never used to read
  `collection_items` / `listening_events` / `profiles`.
- Unauthenticated `POST /api/curator/recommend` and `POST /api/catalog/recognize`
  reject (401) before any provider call — code-verified and one live check.
- Curator recommendation IDs are always from the backend-generated allowed
  owned-candidate set; out-of-set IDs are rejected; the model receives no notes,
  no user id, no provider/release ids, no exact timestamps, no secrets.
- Refinement conversation state is bounded and never persisted (no table, no
  `sessionStorage` / `localStorage`, no server memory); no permanent transcript.
- Image recognition is confirmation-based; vision output is advisory; all
  in-image text is treated as untrusted data (M11 Phase A2 system message).
- Image uploads enforce MIME + magic-byte + size; signed cover / avatar URLs are
  memory-only.

### 3.3 Telemetry
- `model_calls` records provider, feature, success/failure, latency, token usage,
  error category — verified, not expanded.
- Function error logging is category-only; no secrets, no raw provider bodies.
- No new telemetry/analytics infrastructure.

### 3.4 Performance
- Entry route JS ≤ 200 kB gzip (currently ~135 kB); chunk table recorded.
- Every route behind `React.lazy`; landing/auth do not eagerly pull
  authenticated pages.
- One post-auth data load via `CollectionDataProvider`; no filter-triggered
  network calls.
- Curator input ≤ 800 chars; ≤ 12 candidates; projected fact object only.
- Images downscaled client-side before upload; `MAX_IMAGE_BYTES` enforced
  server-side.
- Caching added only where a measured need exists (expected: none).

### 3.5 Dependencies
- `npm audit --omit=dev` = 0.
- `npm audit` (incl. dev) findings triaged in `docs/verification.md` as
  runtime vs dev-only; **no version changes** unless a genuine runtime
  vulnerability is found.

### 3.6 Documentation (as-built, in place)
- `README.md` — shipped (not "planned") capabilities, current production status,
  current env-var names, concise setup notes, known limitations.
- `docs/architecture.md`, `docs/data-model.md`, `docs/ai-design.md`,
  `docs/api-integrations.md` — updated in place to as-built, each carrying a
  short "Current as-built …; supersedes the 2026-08-17 proposal" note. No second
  parallel architecture document.
- `docs/security.md` — reconcile the aspirational `image_identification_attempts`
  / `conversation_sessions` table list (never implemented; ephemeral by design)
  and promote resolved privacy decisions; keep the service-role / RLS / grant /
  upload / signed-URL boundaries explicit.
- `intent.txt` — **appendix only**: a concise "Resolved decisions" section
  mapping the formerly-open §34 items to their ADR/spec evidence. Original body
  unchanged.
- `docs/verification.md` — one consolidated "Milestone 12" section: exact
  commands, actual outputs/counts, dependency triage, security re-proof,
  performance snapshot, known limitations, and the remaining human-acceptance
  gate.
- `docs/roadmaps/2026-09-02-complete-project-roadmap.md` — M12 marked
  **COMPLETE**; overall status M0–M12 complete / production accepted /
  submission-ready.
- `docs/roadmaps/2026-08-18-complete-project-roadmap.md` — byte-for-byte
  unchanged; hash re-verified.

## 4. Acceptance criteria

- [x] `git diff --check`, `npm run typecheck`, `npm run lint` (0 warnings),
  `npm run test:run`, `npm run build` pass from a clean `npm ci` checkout.
  *(Final suite: 62 files / 658 tests after PR #19.)*
- [x] `npx supabase test db` (pgTAP, 10 files / 507) and `npx supabase db lint`
  pass locally.
- [x] `npm audit --omit=dev` = 0; `npm audit --json` findings recorded and
  triaged as dev-only; versions unchanged.
- [x] Production secret scan: server-secret identifiers and secret-shaped tokens
  absent from the built bundle (no values printed).
- [x] Unauthenticated `POST /api/curator/recommend` and
  `POST /api/catalog/recognize` → 401 bounded JSON, zero provider calls.
- [x] `GET https://vinyl-intelligence.netlify.app/api/health` → 200
  `{ "status": "ok" }`.
- [x] Curator allowed-owned-ID invariant re-proven by an existing test
  (`selectionSchema.ts:165` + `selectionSchema.test.ts`).
- [x] `.env.example` documents every env-var name; the two attribution headers
  labelled optional; no values.
- [x] Documentation set reconciled in place; final architecture overview present;
  `docs/verification.md` "Milestone 12" section complete; known limitations
  listed.
- [x] Historical 2026-08-18 roadmap hash identical to the starting hash
  (`cca3d3c8…64f213bd…b26a4`).
- [x] No Phase E deletion; no runtime dependency change. *(Two production
  deploys were made for the PR #19 / PR #20 runtime corrections, both from
  merged `main` and human-approved.)*
- [x] M12 PR reviewed and merged; the two runtime-fix PRs (#19, #20) reviewed,
  merged, deployed, and human-verified.
- [x] Human production regression run on the existing account — **PASS**
  (§5 below; `docs/verification.md`).

## 5. Human acceptance gate — run 2026-09-07, existing account — PASS

Performed by the human against `https://vinyl-intelligence.netlify.app` (no
repeat signup / email-confirmation flow; an existing account was used):

- manual collection persistence — **PASS**
- catalog add — **PASS**
- photo recognition (to a confirmed candidate) — **PASS**
- VIN recommendation — **PASS**
- VIN refinement — **PASS**
- out-of-scope VIN request → bounded VIN-only message, no recommendation —
  **PASS**
- **PR #19 (VIN session lifetime):** View record → return preserves the
  recommendation / reason / refinement — **PASS**; "Played now" after return —
  **PASS**; "Start over" clears the session and it stays clear — **PASS**;
  Dashboard "Quick VIN" seeds the textarea once with no auto-submit — **PASS**;
  a new Quick VIN replaces an existing active VIN session — **PASS**; a browser
  refresh clears the transient VIN state (intentional privacy boundary) —
  **PASS**; `/collection/<id>` deep-link refresh — **PASS**
- **PR #20 (mobile shell + History rows):** History verified on a real phone on
  the draft deploy — **PASS**; History verified again on production — **PASS**
- keyboard focus / Shift+Tab / activation — **PASS**
- sign out, then protected-route access after sign out (redirects to auth) —
  **PASS**

**Not performed / not claimed:** no forced-provider-failure human test was run
(automated coverage of provider-failure and model-safety behaviour is recorded
in the milestone-specific verification sections); no signup / email-confirmation
flow was re-tested (an existing account was used, and that flow was verified in
Milestone 11).

## 6. Definition of done — MET (2026-09-07)

M12 was complete when: the automated matrix was green from a clean checkout; the
security / AI-safety re-proof passed read-only; the documentation set was
reconciled and the M12 evidence section written; the M12 PR passed independent
review; the two runtime-correction PRs (#19, #20) were reviewed, merged,
deployed, and verified; and the human production regression above passed. All of
that is done. **`M12 COMPLETE`** — and, with M0–M11 already complete, **M0–M12
complete / production accepted / submission-ready.** Final accepted `main`
`c2037b8a09b10da796fa2435f268f316f7bb8442`, production deploy
`6a9eaf39df3f13d430f76828`.
