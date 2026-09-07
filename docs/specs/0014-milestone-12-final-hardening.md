# 0014 Milestone 12 — Reliability, Security, Telemetry, and Polish (Specification)

Status (2026-09-07): **IN PROGRESS** — approved scope Phases A–D. Verification +
documentation reconciliation only; no feature work, no redesign, no
architecture change, no dependency churn, no CI. Final `M12 COMPLETE` status is
set only after automated verification, independent PR review, and human
production acceptance.

Baseline: `main` = `ee6d695b449e3b7810be3663b5cd5b221fedd059` (PR #18 merged —
the VIN recommendation-card enhancement is on `main`). Production is live at
`https://vinyl-intelligence.netlify.app`, application deploy
`6a9dfeaacb28d21bd0c88eb6` from `main` `ee6d695…`.

References (do not duplicate): `docs/roadmaps/2026-09-02-complete-project-roadmap.md`
§22, `intent.txt`, `docs/security.md`, `docs/verification.md`, `docs/decisions/`,
specs `0010`–`0013`.

Human approval recorded: 2026-09-07 (this message). Corrections applied: Phase E
(legacy dead-code removal) **deferred**; no GitHub Actions / CI; no dependency
upgrades for dev-only audit findings; as-built docs updated **in place**;
`intent.txt` gets an **appendix only**; historical 2026-08-18 roadmap
**byte-unchanged** (hash `cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`);
current roadmap not marked COMPLETE yet; human regression reuses the existing
production account (no repeat signup/email round-trip unless an auth defect
appears); no production deploy unless a real runtime change is later approved.

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
- `docs/roadmaps/2026-09-02-complete-project-roadmap.md` — updated only to record
  M12 **in progress** with the approved scope. **Not** marked COMPLETE.
- `docs/roadmaps/2026-08-18-complete-project-roadmap.md` — byte-for-byte
  unchanged; hash re-verified before the PR.

## 4. Acceptance criteria

- [ ] `git diff --check`, `npm run typecheck`, `npm run lint` (0 warnings),
  `npm run test:run`, `npm run build` pass from a clean `npm ci` checkout.
- [ ] `npx supabase test db` (pgTAP) and `npx supabase db lint` pass locally.
- [ ] `npm audit --omit=dev` = 0; `npm audit --json` findings recorded and
  triaged as dev-only; versions unchanged.
- [ ] Production secret scan: server-secret identifiers and secret-shaped tokens
  absent from the built bundle (no values printed).
- [ ] Unauthenticated `POST /api/curator/recommend` and
  `POST /api/catalog/recognize` → 401 bounded JSON, zero provider calls.
- [ ] `GET https://vinyl-intelligence.netlify.app/api/health` → 200
  `{ "status": "ok" }`.
- [ ] Curator allowed-owned-ID invariant re-proven by an existing test.
- [ ] `.env.example` documents every env-var name; the two attribution headers
  labelled optional; no values.
- [ ] Documentation set reconciled in place; final architecture overview present;
  `docs/verification.md` "Milestone 12" section complete; known limitations
  listed.
- [ ] Historical 2026-08-18 roadmap hash identical to the starting hash.
- [ ] No Phase E deletion; no runtime dependency change; no production/config
  write.
- [ ] One M12 PR open against `main`; not merged; M12 not marked COMPLETE.
- [ ] Human production regression (short, existing account) scheduled as the
  final gate.

## 5. Human acceptance gate (after PR review)

Short production regression with the **existing** account (no repeat
signup/email round-trip unless an auth defect appears):

1. Sign in; open dashboard.
2. Add one manual record; refresh; it persists; open its detail page.
3. One catalog search + add.
4. One photo recognition to a confirmed candidate.
5. One VIN recommendation + one refinement + one out-of-scope request
   ("what is the capital of France") → bounded VIN-only message, no
   recommendation.
6. On a VIN card: **View record**, then **Played now**; listening state updates,
   toast shows.
7. Deep-link refresh of `/collection/<id>`; one forced failure shows an honest
   error, not fake success.
8. ~390px responsive + keyboard-only spot-check on one core flow.
9. Sign out.

Target: ≤ ~6 paid provider calls.

## 6. Definition of done

M12 is complete when: the automated matrix is green from a clean checkout; the
security / AI-safety re-proof passes read-only; the documentation set is
reconciled and the M12 evidence section is written; the M12 PR has passed
independent review; and the human production regression above has passed. Only
then is `M12 COMPLETE` recorded in the current roadmap and this spec.
