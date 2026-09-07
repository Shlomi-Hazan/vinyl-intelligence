# 014 Milestone 12 — Reliability, Security, Telemetry, and Polish (Implementation Plan)

Status (2026-09-07): **COMPLETE.**
Spec: `docs/specs/0014-milestone-12-final-hardening.md`.
M12 verification branch: `claude/milestone-12-final-hardening` (PR #19).
Baseline `main` when M12 began: `ee6d695b449e3b7810be3663b5cd5b221fedd059`.
Final accepted `main`: `c2037b8a09b10da796fa2435f268f316f7bb8442`.
Final accepted production deploy: `6a9eaf39df3f13d430f76828`.

Human-approved scope: Phases **A–D** (verification + documentation
reconciliation). Phase **E deferred** (legacy unmounted subtree stays). No CI.
No dependency upgrades for dev-only audit findings. As-built docs updated in
place. `intent.txt` appendix only. Historical 2026-08-18 roadmap byte-unchanged
(`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`).

**Runtime corrections found during M12 acceptance (each its own reviewed PR,
merged, deployed, human-verified):**
- **PR #19** (`40797d4` → merge `a74d689593eb796b6d347cb771ca8f3122491abb`):
  transient VIN session lost on `VIN → View record → back`. `CuratorSessionProvider`
  lifts exactly that `CuratorPanel` state above the route outlet; a Quick VIN
  seed is a plain event-handler reset+set in `DashboardPage`. React-memory-only
  persistence contract and every curator contract unchanged. Suite after this
  fix: 62 files / 658 tests.
- **PR #20** (`104d32b` + `c360b8f` → merge `c2037b8a09b10da796fa2435f268f316f7bb8442`):
  shared mobile app-shell defect — `.vi-main` kept `grid-column: 2` after the
  mobile grid collapsed to one column, creating an implicit column that shifted
  every route right and squeezed it. Fixed with `.vi-main { grid-column: 1 }` in
  the mobile block, plus History-row mobile polish. CSS only.

Full evidence: `docs/verification.md` → "Milestone 12 …".

---

## Phase A — Clean-checkout automated verification

**Purpose:** prove the full automated matrix green from a genuinely clean
checkout; record actual outputs/counts (no pre-invented numbers).

**Steps (temp clone where practical):**
```
git clone <repo> <tmp> && cd <tmp> && git checkout claude/milestone-12-final-hardening
npm ci
git diff --check
npm run typecheck
npm run lint
npm run test:run
npm run build            # record entry gzip + chunk table
npx supabase start
npx supabase test db     # pgTAP
npx supabase db lint
npm audit --omit=dev
npm audit --json         # full triage
```

**Constraints:** no real OpenRouter / MusicBrainz / Cover Art Archive calls; no
hosted Supabase mutation; no Netlify mutation. Add a test ONLY if a genuine
M12-required invariant is not already proven — not to raise coverage numbers.

**Defect handling:** a real defect → STOP and report before a behavioral fix,
unless the fix is obviously tiny, local, and in-scope.

**Likely files:** none (or ≤1 small test if a real gap is found).
**Hosted/production interaction:** none. **Real provider call:** none.
**Expected commits:** 0 code commits unless a real gap/defect is fixed.

## Phase B — Security / AI-safety re-proof (read-only)

**Purpose:** re-prove every boundary in spec §3.2 against code + pgTAP + the
live site.

**Code review (read-only):** server/browser secret separation; `requiredEnv`
usage; RLS/grants; `model_calls` INSERT-only service role; curator allowed-ID
validation + rejection of out-of-set IDs; curator prompt inputs (no notes / no
user id / no provider ids); bounded refinement state; no transcript persistence;
vision confirmation-before-persist; untrusted-image framing; upload validation;
signed-URL non-persistence; provider-error bounding.

**pgTAP:** from Phase A.

**Production READ-ONLY checks (zero provider calls):**
```
GET  https://vinyl-intelligence.netlify.app/api/health              => 200 {"status":"ok"}
POST https://vinyl-intelligence.netlify.app/api/curator/recommend   => 401 (no auth)
POST https://vinyl-intelligence.netlify.app/api/catalog/recognize   => 401 (no auth)
```
Fetch the production root HTML → its referenced JS/CSS assets → scan for
`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `sk-or-v1-`,
`sb_secret_<key>`, `service_role`, `Bearer sk-or`. Report present/absent only;
never print a matched value. (The bare `sb_secret_` prefix literal inside
bundled `@supabase/supabase-js` is a known non-finding.)

**Change:** `.env.example` — add `OPENROUTER_APP_URL` and `OPENROUTER_APP_TITLE`
with a comment marking them optional (OpenRouter `HTTP-Referer` / `X-Title`
attribution headers). No values.

**Likely files:** `.env.example`.
**Hosted/production interaction:** read-only HTTP only. **Real provider call:**
none. **Expected commits:** `chore(m12): complete environment documentation`.

## Phase C — Reliability / performance evidence

**Purpose:** evidence map, not refactoring.

- Map every major flow + failure path → covering test / pgTAP / prior human
  evidence.
- Re-measure from the Phase A build: entry gzip, per-route chunk sizes, route
  splitting; confirm no eager authenticated-page import from landing/auth.
- Confirm bounded curator input (800) + candidate cap (12); image
  downscale/upload limits; single post-auth `CollectionDataProvider` load; no
  filter-triggered network calls.
- Add caching/optimization ONLY if a measured regression exists (expected:
  none).

**Likely files:** none. **Hosted/production interaction:** none. **Real provider
call:** none. **Expected commits:** 0 (feeds Phase D).

## Phase D — Documentation reconciliation + M12 evidence + PR

**Purpose:** bring the doc set to as-built (in place); write the consolidated
M12 evidence; open the PR.

**Files:**
- `README.md` — shipped capabilities, production status, current env-var names,
  concise setup, known limitations.
- `docs/architecture.md` — as-built: React Router + route-level `React.lazy`;
  Netlify Functions privileged boundary (six functions); Supabase
  Postgres/Auth/Storage; private `collection-covers` + `profile-avatars`
  buckets; client-side Cover Art Archive display-time artwork (no
  `releases.cover_url`); MusicBrainz catalog; OpenRouter model roles
  (`gemini-3.1-flash-lite` vision + curator intent, `gemini-3.5-flash` curator
  selection); deployed topology; explicit "no RAG, no multi-agent". Short
  "supersedes the 2026-08-17 proposal" note.
- `docs/data-model.md` — implemented tables/columns: `profiles`
  (+`display_name`, `avatar_path`, `avatar_updated_at`), `releases`
  (+`provider_release_id`, `provider_release_group_id`, `genres`, `source`),
  `collection_items` (+`rating`, `is_favorite`, `notes`, `personal_genres`,
  `custom_cover_path`, `custom_cover_updated_at`), `listening_events`
  (append-only + owner `UPDATE(listened_at)` / `DELETE`), `model_calls`
  (INSERT-only service role). Note what was deliberately NOT persisted
  (`image_identification_attempts`, `conversation_sessions`, curator
  transcripts, signed URLs).
- `docs/ai-design.md` — M9 two-call pipeline; M10 bounded refinement; M11
  `{ inScope, intent }` wrapper; M11 vision trusted-system / untrusted-image
  framing; strict JSON schemas; allowed-ID validation; no notes / no
  transcripts.
- `docs/api-integrations.md` — MusicBrainz, Cover Art Archive, OpenRouter,
  Supabase; exact current browser vs Netlify-Function responsibilities.
- `docs/security.md` — reconcile the non-implemented table list; promote
  resolved privacy decisions; keep boundaries explicit.
- `intent.txt` — append a "Resolved decisions" section only (map §34 items to
  ADR/spec). Body unchanged.
- `docs/verification.md` — one "Milestone 12" section (spec §4 acceptance +
  actual results + dependency triage + security re-proof + performance snapshot
  + known limitations + human-acceptance gate).
- `docs/roadmaps/2026-09-02-complete-project-roadmap.md` — M12 marked
  **COMPLETE** (done); overall status M0–M12 complete / production accepted /
  submission-ready.

**Known limitations (factual, proportional):** no custom domain; no Git CI /
continuous deployment; Supabase built-in email sender (no custom SMTP); manual
deploy from merged `main`; dev-only `npm audit` findings (14 high, all build/QA
tooling); production testing primarily with one human test account; deferred
unmounted legacy subtree. (These are intentional non-goals, not defects.)

**Hosted/production interaction:** none. **Real provider call:** none.
**Expected commits:**
- `docs(m12): reconcile architecture, data-model, AI, and integration docs`
- `docs(m12): reconcile security notes and intent decisions appendix`
- `docs(m12): record verification evidence and submission readiness`

**Then:** final gate → push → open ONE PR `feat: milestone 12 — final hardening
and submission readiness`, base `main`. Do not merge. Do not deploy. Do not mark
M12 COMPLETE.

## Final gate before PR

```
git diff --check
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase test db && npx supabase db lint
```
+ `npm audit` results recorded; historical roadmap hash identical
(`cca3d3c8…`); no secret values introduced; no Phase E deletion; no runtime
dependency change; no production/config write.

## Commit shape (adapt only if necessary)

1. `docs(m12): approve final hardening specification and plan`
2. `chore(m12): complete environment documentation`
3. `docs(m12): reconcile architecture, security, and integration docs`
4. `docs(m12): record verification evidence and submission readiness`

If no code/test change is required, none is invented.

## After the PR — done (2026-09-07)

Independent review passed. Human production regression (spec §5) found two real
runtime defects; each was fixed on its own reviewed PR (#19, #20), merged, and
deployed from merged `main`. History and the VIN session flows were re-verified
by the human on production — **PASS**. `M12 COMPLETE` is now recorded in
`docs/specs/0014`, this plan, `docs/verification.md`, `README.md`, and
`docs/roadmaps/2026-09-02-complete-project-roadmap.md`. Final accepted `main`
`c2037b8a09b10da796fa2435f268f316f7bb8442`; production deploy
`6a9eaf39df3f13d430f76828`.
