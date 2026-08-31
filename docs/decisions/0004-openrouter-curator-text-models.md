# 0004 OpenRouter Text Models For The AI Curator

Status: proposed (pending human approval with Milestone 9)

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

Estimated tokens / cost for one **normal successful** curator request with
`google/gemini-3.1-flash-lite` on both calls:

| Call | ~input tok | ~output tok | ~cost |
| --- | --- | --- | --- |
| #1 intent | ~700 | ~120 | ~$0.00036 |
| #2 selection (12 candidates) | ~1400 | ~220 | ~$0.00068 |
| **total** | | | **~$0.001** |

`no_match` (call #1 only): ~$0.0004. Empty collection: $0. The 10-request
per-user window costs roughly $0.01. With `google/gemini-3.5-flash` on call #2
only: ~$0.0045 per request.

## Decision

- Use **OpenRouter**, server-side, for both curator text calls - the same
  `POST https://openrouter.ai/api/v1/chat/completions` boundary as Milestone 5.
  No new provider.
- **Default model for both calls: `google/gemini-3.1-flash-lite`** (GA / stable)
  - lowest demo cost, `response_format` json_schema, low latency, already
  integrated. The intent task is narrow classification; the selection task is
  "pick <= 3 of <= 12 supplied ids and write one short grounded sentence each" -
  both are well within Flash-Lite.
- **Manually selectable alternative for call #2: `google/gemini-3.5-flash`**
  (GA / stable) - identical request/response contract; documented for a human to
  switch to if Flash-Lite explanation quality proves inadequate in human
  runtime. ~4-5x the call-#2 cost, still well under a cent.
- Model ids are read from env with defaults:
  - `OPENROUTER_CURATOR_MODEL` (default `google/gemini-3.1-flash-lite`) - used
    for both calls. A single seam keeps configuration minimal; if call-specific
    models are ever needed, a second env var can be added without a contract
    change.
- Both calls use `temperature: 0` for determinism and auditability, a bounded
  `max_tokens` (intent ~250, selection ~500), and `response_format` strict
  json_schema.
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
  and reuses the existing `OPENROUTER_API_KEY` secret. One new optional env var
  (`OPENROUTER_CURATOR_MODEL`).
- Runtime cost is developer-funded; ~$0.001 per normal request (estimate, not a
  guarantee), bounded by two calls per user action, capped output, a 12-candidate
  cap, a 10-request / 10-minute per-user limit, and no automatic retry.
- Automated tests use a fake provider and cost nothing. Human runtime makes real
  paid text calls (two per successful recommendation).
- The `chat/completions` + `response_format` integration and the strict
  manual-validation approach are shared with Milestone 5; no new library.
- If Flash-Lite explanations are weak, a human sets
  `OPENROUTER_CURATOR_MODEL=google/gemini-3.5-flash`; no code change.

## Alternatives Considered

- **`google/gemini-3.5-flash` as the default for both calls.** Viable, ~6x the
  per-request cost (still sub-cent). Rejected as the default because "very low
  demo cost" is the stated priority and the env override is trivial; kept as the
  documented call-#2 alternative.
- **`google/gemini-3.5-flash-lite`** ($0.30 / $2.50). Slightly newer, ~20-40%
  costlier than `3.1-flash-lite`, no proven integration here, no capability the
  task needs that `3.1-flash-lite` lacks. Rejected.
- **A separate cheaper model for intent and a stronger model for selection.**
  Adds a second env var and a second pricing row for a task Flash-Lite already
  handles. Rejected for simplicity; revisitable if human runtime shows a
  specific weakness.
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
