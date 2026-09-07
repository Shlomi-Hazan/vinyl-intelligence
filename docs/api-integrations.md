# API Integrations

As-built section last updated: 2026-09-07 (Milestone 12). The verification /
spike material below is preserved as the selection rationale.

---

## As-Built Integrations (current, supersedes the 2026-08-17 plan)

Four external services, all reached only through Netlify Functions where a
secret or privileged access is involved. Browser-visible calls are limited to
Cover Art Archive image URLs (public, no key) and the browser Supabase client
(publishable key, RLS authoritative).

| Service | Used for | Auth | Where it runs | Notes |
| --- | --- | --- | --- | --- |
| **MusicBrainz** (`https://musicbrainz.org/ws/2/`) | release search + release / release-group lookup for the catalog-add flow; best-effort release-group genre tags | `MUSICBRAINZ_USER_AGENT` header, no key | `netlify/functions/_shared/catalog-handlers.mts` (`/api/catalog/search`, `/api/catalog/add`) | selected over Discogs (`docs/decisions/0002`); paced to <= 1 req/s; response shape validated; timeouts + bounded errors |
| **Cover Art Archive** (`https://coverartarchive.org/release[-group]/{mbid}/front-{size}`) | display-time album artwork | none (public) | browser `<img src>` built client-side in `src/media/AlbumArtwork.tsx` | no key, no proxy, no persisted URL, no `releases.cover_url`; advances to the next tier on `<img>` error, never loops |
| **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`) | vision cover recognition; curator intent extraction; curator selection/explanation; refinement | `OPENROUTER_API_KEY` (server-only) + optional `OPENROUTER_APP_URL` / `OPENROUTER_APP_TITLE` attribution headers | `netlify/functions/_shared/recognition-handlers.mts`, `curator-handlers.mts` | models: `google/gemini-3.1-flash-lite` (vision + curator intent), `google/gemini-3.5-flash` (curator selection). `temperature: 0`, strict `response_format` json_schema, bounded `max_tokens` (intent 300 / refinement 430 / selection 1200), `provider: { require_parameters: true }`; selection sends `reasoning: { effort }`. Per-user rate limits; `model_calls` telemetry; all output strict-validated as untrusted. Decisions `0003`, `0004`. |
| **Supabase** (hosted project `dlkaljnywnrhzfxcfklx`) | Postgres + RLS, Auth (built-in email), Storage (two private webp-only buckets) | browser: publishable key + user JWT (RLS); server: `SUPABASE_SERVICE_ROLE_KEY` with explicit least-privilege grants | browser client + Netlify Functions | service role is INSERT-only on `model_calls`; SELECT/INSERT/UPDATE on `releases`; SELECT/INSERT on `collection_items`; never used to read user collection/history/profile for the curator |

Not integrated: Discogs (evaluated, not selected); any preview/streaming
provider; any analytics service.

---

## Historical: pre-implementation plan and provider spike (2026-08-17)

Do not implement external integrations until exact provider capabilities, terms, authentication, rate limits, and cost are verified.

Before implementing the music catalog integration, complete a small documented API spike comparing Discogs and MusicBrainz against the requirements below. Do not select a provider simply based on preference.

## Music Catalog Requirements

The application needs:

- Artist name
- Album/release title
- Release-level identifier
- Master/release-group identifier where available
- Release year
- Genres and styles/subgenres
- Label
- Country
- Format
- Tracklist
- Cover image reference or legally usable image URL
- External source URL
- Search by artist/title
- Optional search by barcode/catalog number later

## Required Music Catalog API Spike

Create or update a short spike document before implementation. It should compare Discogs and MusicBrainz using the same sample searches and the same rubric.

Minimum sample searches:

- One widely known classic rock album
- One jazz album with multiple releases
- One 1990s album
- One record where edition/release ambiguity is likely

Comparison criteria:

- Search quality by artist/title
- Release-level identifier support
- Master/release-group identifier support
- Metadata completeness for artist, title, year, genre/style, label, country, format, tracklist, and cover reference
- Cover image legality and technical availability
- Authentication requirements
- Rate limits and fair-use expectations
- Error/no-match behavior
- Terms suitability for a deployed university demo
- Implementation complexity with Netlify Functions
- Fit with album-first UI plus release-level identifiers

Spike output:

- Recommendation for primary provider
- Whether a fallback provider is justified
- Known gaps and mitigation
- Example normalized response shape
- Acceptance criteria for the integration milestone

## Discogs

Role: strong catalog candidate because the product is vinyl/release oriented.

Needs verification before implementation:

- Current authentication model for database search
- Current rate limits and response headers
- Whether release lookup includes the needed fields without marketplace scope
- Terms for cover image display and caching
- Whether a personal token is enough for this project or OAuth is required
- Whether API usage is acceptable for a deployed university demo
- Exact fields returned by `/database/search` and `/releases/{release_id}`

Automated lookup note:

- Official Discogs developer documentation at `https://www.discogs.com/developers` should be treated as the source of truth, but the automated documentation fetch was not reliable in this session.
- Do not rely on secondary summaries without checking the official developer page manually before implementation.

Current posture:

- Discogs is a strong candidate because the product is vinyl/release oriented.
- It is not selected yet. Selection requires the documented API spike.

## MusicBrainz

Role: strong open metadata alternative or fallback catalog.

Verified from official MusicBrainz documentation:

- API root is `https://musicbrainz.org/ws/2/`.
- The API exposes entities including `release` and `release-group`.
- `inc=` parameters can include related data such as artist credits, labels, recordings, release groups, media, tags, and genres depending on entity.
- Applications must use a meaningful User-Agent.
- Unless otherwise agreed, clients should not exceed one request per second from an IP address.
- Cover art is handled through Cover Art Archive endpoints such as `/release/{mbid}/`.

Open questions:

- Whether MusicBrainz genres/styles are rich enough for recommendation quality.
- Whether release search and disambiguation feels good for normal vinyl collectors.
- Whether cover art availability is sufficient for demo data.

Current posture:

- Use MusicBrainz if open access and predictable limits matter more than vinyl-specific release depth.
- Consider storing both Discogs and MusicBrainz IDs only if one provider is insufficient. Do not integrate both just to increase API count.

Sources:

- MusicBrainz API: https://musicbrainz.org/doc/MusicBrainz_API
- MusicBrainz rate limiting: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- Cover Art Archive API: https://musicbrainz.org/doc/Cover_Art_Archive/API

## AI Provider

Role: server-side text and vision model access.

Requirements:

- Text model for structured intent extraction
- Text model for grounded recommendation explanation
- Vision-capable model for cover clue extraction
- Structured output or JSON-schema support for machine-consumed calls
- Usage reporting for token/cost telemetry
- Reasonable latency for interactive flows
- Server-side API key handling

OpenRouter current documentation findings:

- Structured outputs can be requested with `response_format` using JSON Schema on compatible models.
- Model support varies, so exact model compatibility must be checked before implementation.
- The models API exposes model metadata and supported parameters.
- Image inputs are sent through chat completions to vision-capable models using an `image_url` content part.
- Images can be provided as public URLs or base64 data URLs; supported formats include PNG, JPEG, WebP, and GIF.

Resolved (as implemented):

- Cover-image analysis: `google/gemini-3.1-flash-lite`
  (`docs/decisions/0003-openrouter-vision-provider.md`, Milestone 5).
- Curator intent extraction: `google/gemini-3.1-flash-lite`; curator
  selection + explanation: `google/gemini-3.5-flash` with
  `reasoning: { effort: "minimal" }` and `max_tokens = 1200`
  (`docs/decisions/0004-openrouter-curator-text-models.md`, Milestone 9). Both
  curator calls: `temperature: 0`, strict `response_format` json_schema,
  `provider: { require_parameters: true }`. Measured demo cost ~$0.006-0.007 per
  successful curator request (Milestone 9 human runtime; see
  `docs/verification.md`).

Still open:

- Whether one provider/model can satisfy both structured output and vision
  requirements reliably (not needed - separate models per use).

Sources:

- OpenRouter structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- OpenRouter model metadata: https://openrouter.ai/docs/guides/overview/models
- OpenRouter image inputs: https://openrouter.ai/docs/guides/overview/multimodal/image-understanding

## Supabase

Role: database, auth, storage, possibly serverless functions.

Required confirmation before migrations:

- RLS policies for each table
- Storage bucket access policy for upload attempts
- Service-role usage only in trusted backend contexts
- Local development flow and environment variable names

Verified from official Supabase documentation:

- Supabase Storage is designed to work with Postgres Row Level Security.
- Storage uploads require RLS policies.
- Service keys bypass RLS and must not be shared publicly.

Source:

- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control

## Initial API Recommendation

For first implementation planning:

1. Use Netlify Functions as the server-side integration boundary.
2. Use Supabase for persistent storage of normalized release metadata.
3. Run the Discogs/MusicBrainz API spike before choosing the primary music catalog provider.
4. Choose OpenRouter only after selecting exact models that support needed structured output and image input.
