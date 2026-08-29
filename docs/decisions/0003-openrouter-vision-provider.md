# 0003 OpenRouter Vision Provider For Cover Recognition

Status: proposed (pending human approval with Milestone 5)

Date: 2026-08-29

Relates to: Milestone 5 (`docs/specs/0006-milestone-5-photo-recognition.md`),
`docs/ai-design.md`, `docs/api-integrations.md`, `docs/architecture.md`.

## Context

Milestone 5 is the project's first runtime AI/model call: a single
vision-capable model call that extracts search clues from a photo of a record
cover. `docs/architecture.md` already records OpenRouter (server-side) as the
recommended initial AI provider, subject to verifying exact models, image input
format, structured output support, and cost. `docs/decisions/README.md` lists
"AI provider and exact models" as a pending decision. This ADR resolves it for
the vision use case only; text-model choices for the later curator milestone
remain open.

Priorities for Milestone 5, in order: very low demo cost; acceptable album-cover
recognition; reliable structured (JSON) output; simple integration that reuses
the Milestone 4 server boundary.

## Research (current OpenRouter documentation, 2026-08-29)

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`, server-side
  `Authorization: Bearer <OPENROUTER_API_KEY>`.
- Image input: a user message whose `content` is an array with a `text` part
  and an `image_url` part. `image_url.url` may be an HTTPS URL or a base64
  `data:` URL. Base64 is recommended for local/private images. Supported input
  formats: PNG, JPEG, WebP, GIF. The number of images per request varies by
  model; Milestone 5 sends one.

  ```json
  {
    "model": "google/gemini-3.1-flash-lite-preview",
    "messages": [
      { "role": "user", "content": [
        { "type": "text", "text": "..." },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
      ]}
    ],
    "response_format": { "type": "json_schema", "json_schema": { "name": "cover_recognition", "strict": true, "schema": { "...": "..." } } },
    "max_tokens": 300,
    "temperature": 0
  }
  ```

- Structured output: `response_format` with a JSON schema is supported on
  compatible models, including the Gemini Flash tier.
- Vision models charge for the image as input tokens; the token count depends on
  image resolution, so a client-side downscale directly reduces cost.
- Errors: standard HTTP; `429` rate limit, `5xx` upstream/unavailable, an
  `error` object in the body. No provider-specific retry semantics are assumed.
- Netlify synchronous function limits (relevant to transport): 6 MB
  request/response payload; default 10 s timeout, raisable to 26 s. A single
  Flash-tier vision call fits inside the default; no background function is
  needed.

Candidate models considered (all via OpenRouter, all support image input and
`response_format` JSON schema, 1M context):

| Model | Input $/1M | Output $/1M | Image input $/1M | Stability | Approx cost / recognition* |
| --- | --- | --- | --- | --- | --- |
| `google/gemini-3.1-flash-lite-preview` | 0.25 | 1.50 | 0.25 | preview | ~$0.0006 |
| `google/gemini-3.5-flash` | 1.50 | 9.00 | 1.50 | stable | ~$0.002-0.003 |

*Assumes a downscaled cover (~1000 image tokens), ~400 prompt tokens, ~150
output tokens.

A broad multi-provider comparison was intentionally not performed; the task is
narrow clue extraction, not deep reasoning, and both candidates are more than
adequate for it.

## Decision

- Use **OpenRouter**, server-side, as the vision provider for Milestone 5 cover
  recognition.
- **Primary model: `google/gemini-3.1-flash-lite-preview`** - lowest demo cost,
  vision + strict JSON schema, low latency.
- **Fallback model: `google/gemini-3.5-flash`** - stable, identical request and
  response contract; used if the preview model is withdrawn or its recognition
  quality proves inadequate.
- The model id is read from `OPENROUTER_VISION_MODEL` (defaulting to the
  primary), so switching to the fallback is a configuration change with no code
  change.
- Image transport: base64 `data:` URL in the request body directly to the
  Netlify Function, then to OpenRouter. No Supabase Storage; the image is held
  only in function memory for one request.
- Allowed input formats for Milestone 5: JPEG, PNG, WebP.
- The model output is untrusted and is validated against the Milestone 5
  recognition contract server-side. Model-inferred year/label/catalog number are
  search hints only and are never written to the database. Factual metadata
  comes from the confirmed MusicBrainz release via the Milestone 4 Add path.
- `OPENROUTER_API_KEY` is a server-only secret: never `VITE_`-prefixed, never
  logged, never returned to the browser, never stored in a row.

## Consequences

- Milestone 5 gains a new server secret (`OPENROUTER_API_KEY`) and a new runtime
  dependency on OpenRouter for the recognition feature only.
- Runtime cost is developer-funded but sub-cent per recognition, with one call
  per user action, capped output, a downscaled image, and no automatic retry.
- Automated tests use a fake provider and cost nothing. Human runtime
  verification makes one real paid call per recognition.
- A preview primary model carries withdrawal risk, bounded by the env-selectable
  stable fallback with the same contract.
- The same `chat/completions` + `response_format` integration is reusable by the
  later curator milestone for text intent/explanation calls.

## Alternatives Considered

- **Direct Google / OpenAI / Anthropic APIs.** Rejected for Milestone 5:
  `docs/architecture.md` already selects OpenRouter as the single gateway;
  adding a direct provider SDK increases surface area for no benefit at this
  scale.
- **Stable model as primary (`google/gemini-3.5-flash`).** Viable and
  ~4-5x costlier per call; still cheap in absolute terms. Kept as the fallback
  rather than the default because "very low demo cost" is the stated priority
  and the fallback switch is trivial.
- **Supabase Storage upload then reference by URL.** Rejected as unnecessary:
  the downscaled base64 image is far under the Netlify payload limit, and
  Storage would add a bucket, RLS policies, and a delete-after-use step that
  the "no permanent photo archive" rule would otherwise require anyway.
- **`openrouter/free` router / free vision models.** Rejected: non-deterministic
  model selection and no reliability or structured-output guarantee for a
  feature that needs consistent JSON.
- **A local/offline OCR or CV model.** Out of scope (`intent.txt` section 23);
  no custom CV model or training.
