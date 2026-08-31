# 0004 OpenRouter Text Models For The AI Curator

Status: ACCEPTED 2026-08-31 (with the human correction: separate models per
stage - see Decision)

Date: 2026-08-31

Relates to: Milestone 9 (`docs/specs/0010-milestone-9-ai-curator.md`,
`docs/plans/010-milestone-9-ai-curator.md`), `docs/ai-design.md`,
`docs/api-integrations.md`, `docs/decisions/0003-openrouter-vision-provider.md`.

## Context

Milestone 9 is the AI curator: a single-turn workflow that makes **two**
server-side OpenRouter text-completion calls per successful request -
(1) structured intent extraction from a free-text listening request, and
(2) selection of <= 3 records from a backend-built allowed candidate set of
<= 12, each with a short grounded explanation. `docs/decisions/README.md` lists
"AI text models for the curator milestone" as a pending decision; ADR 0003
resolved only the vision model. This ADR resolves the curator text models.

Priorities, in order: very low demo cost (target: cents per request, far below
the <= $5/run budget); reliable strict JSON (`response_format` json_schema);
acceptable intent + explanation quality for a small personal collection; reuse
of the Milestone 5 OpenRouter server boundary; low interactive latency.

## Research (official OpenRouter documentation and model pages, 2026-08-31; no completion calls made)

- **Structured outputs** (`openrouter.ai/docs/features/structured-outputs`):
  `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`.
  `strict: true` enables native strict mode where supported; "enforcement varies
  by provider ... exact compliance is not guaranteed on every endpoint".
  Supported families include OpenAI, **Google Gemini**, Anthropic, Fireworks.
  Filter: `openrouter.ai/models?supported_parameters=structured_outputs`.
  Consequence: **backend structural validation stays authoritative** (the
  project already does strict manual validation of untrusted model output).
- **`google/gemini-3.1-flash-lite`** (`openrouter.ai/google/gemini-3.1-flash-lite`):
  input **$0.25 / 1M**, output **$1.50 / 1M**; context 1,048,576; up to 65,536
  completion tokens; structured outputs via `response_format`: **yes**;
  `temperature` / `max_tokens` supported; GA / "high stability" (~99.97%
  availability, two providers with automatic failover). Pricing unchanged since
  ADR 0003.
- **`google/gemini-3.5-flash`** (`openrouter.ai/google/gemini-3.5-flash`):
  input **$1.50 / 1M**, output **$9.00 / 1M**; context 1M; structured outputs
  via `response_format`: yes; multi-provider failover. Pricing unchanged since
  ADR 0003.
- Newer Gemini Flash entries exist (`gemini-3.5-flash-lite` at $0.30 / $2.50,
  `gemini-3.6-flash`, `gemini-3.7-flash`, `~google/gemini-flash-latest`). None
  undercuts `3.1-flash-lite` on price, and `3.1-flash-lite` is GA with a proven
  Milestone 5 integration. AGENTS.md scope control and "prefer existing
  known-good families" -> no reason to move.
- Usage / cost reporting: OpenRouter returns `usage` (prompt/completion tokens)
  and often `usage.cost`; the Milestone 5 client already consumes both.
- Latency: Flash-Lite is documented as low-latency and Milestone 5 human runtime
  confirmed one call is interactive-acceptable; two small text calls stay well
  within an interactive budget and the Netlify 60s sync limit. Each call keeps
  its own ~15s application `AbortController` timeout.

Estimated tokens / cost for one **normal successful** curator request with the
accepted per-stage configuration (flash-lite intent + flash-3.5 selection):

| Call | model | ~input tok | ~output tok | ~cost |
| --- | --- | --- | --- | --- |
| #1 intent | `google/gemini-3.1-flash-lite` | ~500-700 | ~100-120 | ~$0.0003 |
| #2 selection (12 candidates, minimal reasoning) | `google/gemini-3.5-flash` | ~1700 | ~350-500 | ~$0.006-0.008 |
| **total** | | | | **~$0.007** |

`no_match` (call #1 only): ~$0.0003. Empty collection: $0. The 10-request
per-user window costs roughly $0.07. If both env vars are set to
`google/gemini-3.1-flash-lite`, a normal request is ~$0.001. All under a cent
per request and well under the <= $5/run budget. Actual OpenRouter usage/cost
telemetry is authoritative. (Human Runtime Test 1's failed selection call
measured 1667 in / 484 out / $0.00686 with medium reasoning; minimal reasoning
should cut both the reasoning tokens and the latency.)

## Decision

- Use **OpenRouter**, server-side, for both curator text calls - the same
  `POST https://openrouter.ai/api/v1/chat/completions` boundary as Milestone 5.
  No new provider.
- **Separate models per stage** (human correction, 2026-08-31):
  - **Call #1 - intent extraction: `google/gemini-3.1-flash-lite`** (GA), env
    `OPENROUTER_CURATOR_INTENT_MODEL`. Cheap structured classification; strict
    `response_format` json_schema; low latency.
  - **Call #2 - selection + explanation: `google/gemini-3.5-flash`** (GA), env
    `OPENROUTER_CURATOR_SELECTION_MODEL`. This is the core user-facing cognitive
    task and gets the stronger model; the additional demo cost is negligible
    (~$0.004 vs ~$0.0007 for call #2).
  - There is **no** single `OPENROUTER_CURATOR_MODEL` seam. Either env var may be
    set independently (e.g. call #2 back to `google/gemini-3.1-flash-lite` for
    the cheapest configuration, or call #1 up to a stronger model if intent
    quality is weak in human runtime).
- Both calls use `temperature: 0` for determinism and auditability,
  `response_format` strict json_schema, and `provider: { require_parameters: true }`
  so OpenRouter only routes to an endpoint that honours those parameters.
  - Call #1 (intent): `max_tokens = 250`, no `reasoning` override.
  - Call #2 (selection): `max_tokens = 1200` and `reasoning: { effort: "minimal" }`.
    Human Runtime Test 1 (2026-08-31) showed `google/gemini-3.5-flash` defaults
    to "medium" reasoning effort and returned `finish_reason: "length"`
    (1667 in / 484 out / $0.00686), truncating the selection JSON before it
    closed. Selecting <= 3 of <= 12 already-filtered candidates does not need
    medium reasoning; minimal effort + a larger output budget removes the
    truncation without touching validation, models, or the schema.
- Telemetry (`model_calls`) records the **actual** model resolved for each stage
  (`curator_intent` row -> the intent model, `curator_selection` row -> the
  selection model), falling back to the provider-reported model id where
  available.
- **Exactly two** provider calls per successful request; one for `no_match`;
  zero for an empty collection. No automatic retry, no automatic cross-model
  fallback. A failed call is recoverable by the user pressing Recommend again.
- Model output is untrusted: validated against the Milestone 9 intent and
  selection schemas server-side (`docs/specs/0010` sections 8 and 15). The model
  may select only from backend-generated allowed `collection_item` ids; any
  out-of-set id rejects the whole response. Displayed card facts come from the
  backend, never from model output.
- `OPENROUTER_API_KEY` remains a server-only secret: never `VITE_`-prefixed,
  never logged, never returned to the browser, never stored in a row. The user
  request text, prompts, candidate payload, and raw model output are never
  persisted.

## Consequences

- Milestone 9 adds a runtime dependency on OpenRouter for the curator feature
  and reuses the existing `OPENROUTER_API_KEY` secret. Two new optional env vars
  (`OPENROUTER_CURATOR_INTENT_MODEL`, `OPENROUTER_CURATOR_SELECTION_MODEL`),
  documented in `.env.example` (names + default examples only).
- Runtime cost is developer-funded; ~$0.0044 per normal request (estimate, not a
  guarantee), bounded by two calls per user action, capped output, a 12-candidate
  cap, a 10-request / 10-minute per-user limit, and no automatic retry.
- Automated tests use a fake provider and cost nothing. Human runtime makes real
  paid text calls (two per successful recommendation).
- The `chat/completions` + `response_format` integration and the strict
  manual-validation approach are shared with Milestone 5; no new library.
- If human runtime shows call #1 needs more capability, set
  `OPENROUTER_CURATOR_INTENT_MODEL`; if call #2 is over-powered for the
  collection size, set `OPENROUTER_CURATOR_SELECTION_MODEL=google/gemini-3.1-flash-lite`.
  No code change either way.

## Alternatives Considered

- **`google/gemini-3.1-flash-lite` for both calls (the originally proposed
  single-seam default).** ~$0.001 per request. Rejected by the human in favour
  of the stronger call-#2 model: selection + explanation is the core user-facing
  cognitive task and the extra ~$0.004 per request is negligible for a course
  demo. Kept as a documented override (`OPENROUTER_CURATOR_SELECTION_MODEL`).
- **`google/gemini-3.5-flash` for both calls.** ~$0.006 per request. Rejected:
  intent extraction is narrow classification that Flash-Lite handles fine and it
  is the higher-frequency call (it also fires for `no_match` and rate-limit
  probing).
- **`google/gemini-3.5-flash-lite`** ($0.30 / $2.50). Slightly newer, ~20-40%
  costlier than `3.1-flash-lite`, no proven integration here, no capability the
  intent task needs that `3.1-flash-lite` lacks. Rejected for call #1.
- **A single `OPENROUTER_CURATOR_MODEL` seam.** Rejected: the two stages have
  genuinely different capability/cost trade-offs, and per-stage telemetry +
  per-stage tuning are worth one extra env var.
- **Direct Google / OpenAI / Anthropic APIs.** `docs/architecture.md` selects
  OpenRouter as the single gateway; a direct SDK adds surface for no benefit at
  this scale. Rejected.
- **`openrouter/auto` / free-tier text models.** Non-deterministic model
  selection and no structured-output guarantee for a feature that needs
  consistent JSON. Rejected.
- **Adding a schema-validation dependency (zod/ajv) for the model output.** The
  validation surface is small and must be authoritative regardless of the
  library; the project already validates untrusted structured output manually
  (`src/lib/vision/openrouter.ts`). Rejected for Milestone 9.
