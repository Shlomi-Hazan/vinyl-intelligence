# Vinyl Intelligence — Product Specification

**This is the consolidated, final product contract** — what the accepted, deployed application is required to do, as of the current accepted production runtime (`main` `81812c1f52d56bea84e142d828dd1e1427a0ec4b`, deploy `6aa8783d1835a5e433449dd4`; see [`docs/verification.md`](docs/verification.md) for full acceptance evidence).

This document is **not** a milestone history, an implementation diary, or a copy of the README. It is a coherent description of the finished product's behavior. The project's actual evolution — including work later superseded or refined — is preserved in [`docs/specs/`](docs/specs/README.md) and [`docs/plans/`](docs/plans/); see [§40](#40-relationship-to-historical-specifications).

Every requirement below is either already implemented and evidenced, or explicitly marked as a known limitation or non-goal. Nothing here describes aspirational behavior the application does not actually have.

---

## 1. Purpose

Vinyl Intelligence turns a user's personal vinyl collection into a searchable, organized, and conversational music library, so the user can decide what to play from records they actually own — by browsing normally, or by describing a mood in natural language.

## 2. Product Goal

Reduce the friction between a human musical intention and a physical record the user already owns, without pretending to be a streaming service, a marketplace, or a generic chatbot with album data attached.

## 3. Intended User

A vinyl collector with a personal physical collection large enough that browsing purely by memory is no longer reliable.

## 4. Primary Usefulness

The application must be able to answer both:

- **"What do I own?"** — via deterministic browse, search, filter, and sort.
- **"Given what I own, what should I play now, and why?"** — via the AI curator, grounded only in owned records and real signals (rating, favorite, listening history).

## 5. Scope

Authentication and per-user ownership; manual and catalog-assisted collection management; AI-assisted cover recognition with mandatory human confirmation; deterministic browse/search/filter/sort; ratings, favorites, notes, and personal genres; listening history with owner-scoped correction; an AI curator with bounded conversational refinement; duplicate-physical-copy disclosure and confirmation; Hebrew/multilingual dynamic content; a deployed, publicly reachable production instance.

## 6. Out of Scope

Streaming or playback of copyrighted audio; a marketplace or valuation feature; a social network or public profiles; full localization of the application chrome; a custom computer-vision model; shelf-scale recognition of multiple records in one photo; a vector database or retrieval-augmented-generation subsystem; a multi-agent runtime architecture; native mobile apps (the web app is responsive instead); automatic collection mutation without an explicit user action.

## 7. Final System Boundary

```text
Browser SPA (Supabase publishable key only, no privileged credential)
  |
  |---- direct, RLS / Storage-policy authorized ---->  Hosted Supabase
  |       auth · collection CRUD · ratings/favorites/       (Postgres + RLS, Auth,
  |       notes · personal genres · listening-event           Storage — private buckets)
  |       log/correct/delete · profile · custom-cover
  |       upload · avatar upload
  |
  |---- direct, plain <img> hotlink ------------------------>  Cover Art Archive
  |       display-time artwork only - built client-side          (release / release-group
  |       from a MusicBrainz id; no backend call, no                front images)
  |       persisted URL, no proxy
  |
  `---- provider access + privileged catalog persistence -->  Netlify Functions (server-only secrets)
                                                                 |---> Supabase, service-role key
                                                                 |     (catalog add: shared `releases`
                                                                 |      upsert AND the resulting owned
                                                                 |      `collection_items` insert;
                                                                 |      model-call telemetry write)
                                                                 |---> MusicBrainz (catalog search / add)
                                                                 `---> OpenRouter (vision + text models)
```

The browser never holds a privileged credential — it authenticates and reads/writes with the Supabase **publishable** key only. A large share of ordinary user-owned writes (§9–§27: personal signals, personal genres, listening-event log/correct/delete, profile, custom cover, avatar, and a fully browser-direct manual release + collection item when no catalog match applies) are authorized **directly against Supabase**, by Row-Level Security and Storage policies — not by a server-side check. The browser also fetches display-time artwork **directly from Cover Art Archive**, as a plain `<img src>` built client-side from a MusicBrainz id — no backend call, no image proxy, no persisted CAA URL (§22). Netlify Functions handle: calls to MusicBrainz (catalog search/add) and OpenRouter; the privileged **catalog-add** persistence step, which upserts the shared `releases` row *and* inserts the resulting `collection_items` row together, both with service-role authority (this is distinct from — and more privileged than — the browser's own scoped manual-release insert); and the model-call telemetry write. `OPENROUTER_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are both server-only secrets, used only inside these Functions, and neither ever reaches the browser. Postgres RLS is the final authority on every direct-browser write, whether or not application logic is correct.

## 8. Core User Journeys

1. **First use:** sign up, confirm email, land on an empty collection with clear calls to action (add manually, discover, scan).
2. **Grow the collection:** search MusicBrainz and confirm a release, or photograph a cover and confirm a candidate.
3. **Browse:** filter and sort by artist, genre, decade, rating, or listening recency, in Grid or List view.
4. **Curate:** ask VIN a natural-language question and receive a small set of owned-record recommendations with reasons; optionally refine.
5. **Log listening:** mark a record played; watch derived stats update on the Dashboard and in Collection filters.
6. **Correct the record:** rate, favorite, annotate, tag with a personal genre, or replace the cover — all without touching shared catalog facts.

## 9. Authentication & Ownership

- Email + password via Supabase Auth, with built-in email confirmation.
- Every collection-scoped table enforces Row-Level Security keyed on `auth.uid()`; a user can never read or write another user's `collection_items`, `listening_events`, `model_calls`, or Storage objects.
- The browser Supabase client uses only the publishable key; privileged operations (catalog persistence, AI telemetry writes) run server-side with the service-role key, which never reaches the browser.

## 10. Dashboard

A home view showing: total records, favorites, plays in the last 30 days, never-played count, a "Quick VIN" mood-preset entry point, quick actions (add record, scan cover, ask VIN), recently added records, and a "Rediscover" module surfacing records the user owns but rarely plays. All figures are derived directly from the collection and listening tables — none are AI-estimated.

## 11. Collection

The full owned library, browsable in Grid or List view, with search (artist/title), filters (genre, decade, minimum rating, favorites, never-played, not-played-in-30-days — mutually exclusive with never-played), and sorts (recently added, alphabetical, year, rating both directions with unrated always last, least-recently-played). Every control is client-side and deterministic; no filter or sort change triggers a network request beyond the initial page load.

## 12. Manual Record Creation

A record can be added without any catalog lookup when MusicBrainz has no suitable match. Manually-created (`source = 'manual'`) releases remain fully editable by their owner; catalog-sourced releases do not (§32).

## 13. Discover / MusicBrainz Catalog Search

Search in one of three explicit, mutually-exclusive modes — **All** (the default; matches artist or release title), **Artist**, or **Album** — each built into a field-scoped, Lucene-escaped MusicBrainz query server-side, never a raw pass-through of user text. The backend returns normalized candidates (artist, title, year, label, catalog number, country, format, cover reference), five at a time, with a server-computed `hasMore` flag; **Load more** appends the next page (deduplicated by release ID) up to a bounded 20-result window per query. A **"Search on MusicBrainz"** link opens the provider's own full search UI in a new tab when that bounded window still isn't enough.

A user who already knows the exact pressing can paste its MusicBrainz release URL under **"Know the exact release?"**: the client extracts and validates the release ID locally (rejecting any non-`musicbrainz.org`/non-release URL before any network request), sends only that validated ID to the server, and the server performs the same read-only, already-existing exact-release lookup used by catalog-add — the pasted URL string itself is never fetched by the server. The result renders through the same candidate card, ownership check, and duplicate-copy flow as an ordinary search result.

The user picks the correct release; metadata is imported from the confirmed MusicBrainz release, not invented by any model.

## 14. AI Cover Recognition

Photograph or upload a cover (JPEG/PNG/WebP, size-capped, magic-byte validated). A vision model (`google/gemini-3.1-flash-lite` by default) extracts likely identifying clues — artist, title, label, catalog number, an approximate year — under strict structured-output validation. Those clues drive a deterministic MusicBrainz search exactly like Discover's. **The vision model never persists anything and never bypasses catalog confirmation**; a candidate is saved only on explicit user confirm, exactly like a manual catalog add. Low-confidence or no-match results offer "search by text instead" or manual entry, never a silent guess.

**The recognition input photo itself is transient**: it is sent once to the vision Function, used only to extract clues, and is not written to any database or Storage bucket — it is not retained as persistent application data. This is a distinct flow from the optional, intentionally-persisted custom collection cover described in §22.

## 15. Duplicate-Copy Handling

For an exact already-owned MusicBrainz release (matched by provider release ID, never by artist/title similarity):

- The user sees an honest **"In your collection"** indicator — never silence, never a block.
- An explicit **"Add another copy"** action is always available beside it.
- Confirming requires one intentional dialog: *"You already own this release. Add another physical copy to your collection?"* / **Add another copy** / **Cancel**.
- Cancel makes zero writes. Confirm creates exactly one additional `collection_items` row.
- This behavior is identical in Discover and Scan.
- Deleting one physical copy never affects a sibling copy of the same release.
- A not-yet-owned candidate is entirely unaffected — ordinary single-click add, no dialog.
- Ownership is authoritative only once the collection load has actually finished; while it is loading or errored, no candidate is presented as owned *or* not-owned, and no add action is enabled.

## 16. Search / Filtering / Sorting

See §11. Combinable, deterministic, and reflected in the URL (`?minRating=`, `?listening=`, `?sort=`, etc.) so a refreshed or shared link restores the same view.

## 17. Album / Record Detail

Shows catalog facts (year, label, catalog number, country, format, cover) alongside every owner-controlled signal: favorite, 1–5 star rating (or unrated), catalog genres (read-only chips) plus personal genres (editable), a custom-cover upload option, and the listening log for that item.

## 18. Ratings

A 1–5 star rating or unrated, stored per collection item, editable at any time. Used as one input signal to the curator's ranking — never the sole factor, and never forced onto every recommendation.

## 19. Favorites

A boolean flag per collection item, toggleable from Collection, List rows, or Album Detail; usable as a filter and as a curator signal.

## 20. Notes

A private free-text field per collection item. Notes are never sent to any model — not the curator, not vision.

## 21. Personal Genres

User-owned tags layered on top of (never overwriting) the shared catalog `genres` on a release. Effective genre filtering/sorting is the union of catalog and personal genres, computed client-side.

## 22. Artwork & Custom Covers

Cover Art Archive supplies display-time artwork for catalog releases by default; a user may upload their own cover for any item. Unlike a recognition input photo (§14), a custom cover is **intentionally persisted**: it is uploaded directly from the browser to a private, owner-scoped Storage bucket (`collection-covers`), associated with that collection item, and retained until the user replaces or removes it. No cover is ever required.

## 23. Listening History

"Mark played" logs an event; play count and last-listened date are **derived** from the event log at read time — there is no denormalized counter column. History is shown newest-first, grouped by day.

## 24. Listening Corrections / Deletion Rules

`listening_events` were shipped append-only and remain append-only in spirit: a browser user can never re-point a play at a different record or another user's history (those columns carry no write grant at all). A later, deliberate, minimal addition allows an owner to correct the *time* of their own play or delete their own accidental log entry — nothing more.

## 25. VIN — AI Curator

A natural-language request (≤ 800 characters) is interpreted into structured intent by one model call; the backend deterministically filters and ranks the user's own collection into a bounded candidate set (at most 12 candidates); a second model call selects and explains 1–3 recommendations (default 3) strictly from that set. **A recommendation whose ID is not in the allowed candidate set is rejected outright**, never silently substituted or shown anyway. An out-of-scope request (unrelated to choosing something to play) is detected before the second model call is ever made and answered with a fixed, bounded reply.

## 26. Conversational Refinement

A bounded follow-up (at most 3 refinement turns per session) revises the previous structured intent and can exclude previously-shown picks. Conversation state lives in React memory only for the duration of the session — no table, no `sessionStorage`, no `localStorage` — and is cleared by refresh, sign-out, or an explicit "start over." A prior recommendation ID is only honored as an exclusion if it is still in the user's *current* owned set, so refinement can never be tricked into excluding, or otherwise reasoning about, a record the user doesn't own.

## 27. Settings / Profile / Avatar

Display name (shown across the app) and an optional profile avatar (private bucket, cropped to a square, initials shown as the fallback) are user-editable. Account email is shown but changed only through Supabase Auth, not this form.

## 28. Hebrew & Multilingual Dynamic Content

Dynamic, record-owned text — artist, title, label, and catalog/personal genre tags — renders correctly regardless of script:

- **Bidirectional isolation.** Each field is wrapped individually (a `<bdi>`-based `BidiText`/`BidiJoin` component, or the `FSI`/`PDI` Unicode isolate marks in plain-text contexts like a scan clue chip) so a Hebrew value never drags neighboring Latin/English text out of order — never a page-wide `dir="rtl"`.
- **Hebrew-aware search.** Search comparison folds out niqqud (vowel points) and cantillation marks before comparing, so a query matches a title whether or not those marks are present.
- **Deterministic mixed-script sorting.** Alphabetical sorts order Latin-script entries before Hebrew-script entries, deterministically, via a dedicated comparator.
- **Genre aliasing.** One canonical Hebrew/English genre-alias table normalizes a genre value to a single canonical form, shared by Collection, Dashboard, and VIN, so a Hebrew and an English spelling of the same genre are treated as one filterable tag. A user's own personal genre tags go through the same canonicalization as catalog genres — there is no separate, laxer path for them.
- **Personal notes are the one field handled differently, deliberately**: the note field is a plain `<textarea dir="auto">`, relying on the browser's native automatic bidi direction detection rather than the app's per-field isolation component — appropriate for free-text entry the user is actively typing, not a structured display field.
- **VIN** receives genre constraints already canonicalized by the same shared table before it reasons about them, and preserves whatever script the user's request or the matched record uses in its explanation — it does not translate or transliterate.
- **Vision recognition** preserves the original script printed on the sleeve in its extracted clues — no translation, no transliteration.

**The application chrome, navigation, and static copy remain English/left-to-right by design** — this is not a localization project, and there is no cross-script artist/title aliasing (a Hebrew and a Latin-transliterated spelling of the same name are not treated as equivalent).

## 29. AI Runtime Boundaries

Every model call is server-side only, with a server-only API key, a strict JSON output schema, a bounded timeout, and no automatic retry beyond one deliberate catalog-only retry path. Two **independent** per-user rate-limit buckets exist, each 10 attempts per rolling 10-minute window:

- **Cover recognition** (`cover_vision` feature) — checked before every Vision call; a request that would exceed the window is rejected before any provider call is made.
- **Curator intent** (`curator_intent` feature) — checked before every curator intent-extraction call, shared by the **initial recommendation** and **every refinement turn** (a refinement is recorded under the same `curator_intent` feature and checked against the same budget as the initial request). The second curator call (`curator_selection`, the ranking/explanation step) has no separate rate-limit check of its own — it only ever runs after its own turn's intent/refinement call has already passed the shared gate.

(Source: `src/lib/curator/types.ts` — `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MINUTES`, `CURATOR_INTENT_FEATURE`, `CURATOR_SELECTION_FEATURE`; `netlify/functions/_shared/curator-handlers.mts` — `enforceRateLimit`, called identically by `handleCuratorRecommend` and `handleCuratorRefine`; `netlify/functions/_shared/recognition-handlers.mts` — `MAX_RECOGNITIONS_PER_WINDOW`, `RATE_LIMIT_WINDOW_MINUTES`.)

Each provider/model attempt makes a **best-effort** telemetry write to `model_calls` — feature, model, success, latency, token counts, estimated cost, error category; never prompt text, image data, or raw model output. Telemetry writes are deliberately wrapped so a telemetry failure is logged by category and never fails the user's own request — it is a best-effort observability record, not an absolute persistence guarantee.

## 30. Deterministic vs AI Responsibilities

| Deterministic (always) | AI-assisted (never authoritative alone) |
| --- | --- |
| Authentication, authorization, RLS | Cover-clue extraction from a photo |
| Ownership, exact database identity | Natural-language intent/refinement interpretation |
| Filtering, sorting, counting | Candidate ranking language and explanation |
| Persisted catalog facts (from MusicBrainz) | — |
| Listening counts (derived from events) | — |
| Duplicate-copy ownership match (exact ID) | — |

A model can suggest; it can never invent an owned record, a database ID, a rating, a genre fact, or listening history that the backend didn't already establish.

## 31. External Integrations

- **MusicBrainz** — release search and metadata; a documented, free, best-effort-paced public API. No SLA is assumed; failures are surfaced as visible errors, not silent empties.
- **Cover Art Archive** — display-time artwork only, fetched **directly by the browser** (a plain `<img src>` built client-side from a MusicBrainz id) — not a Netlify Function call; no `releases.cover_url` column, no catalog-add-time lookup.
- **OpenRouter** — gateway to the vision and text models listed in §29/§25. A provider outage is a visible, recoverable failure, never a fabricated result.
- **Supabase** — Postgres, Auth, Storage; hosted, least-privilege configured.
- **Netlify** — static hosting + Functions; manual deploy from merged `main`, no CI.

None of these providers' uptime, pricing, or exact response shape is guaranteed by Vinyl Intelligence itself; the application defends against their failure but cannot prevent it.

## 32. Data / Ownership Constraints

- `releases` (shared catalog metadata) is browser-read-only; no user can overwrite another collector's shared facts, catalog-sourced or otherwise.
- `collection_items` are strictly per-user; multiple items may reference the same `release` (intentional duplicate physical copies).
- Manually-created release rows remain owner-editable.
- A `releases` row is unique per `(provider, provider_release_id)` — the only uniqueness constraint in the schema; nothing prevents multiple owned copies of the same release.

## 33. Security / Privacy Requirements

- No server secret is ever sent to the browser, logged, or persisted in a row.
- RLS is enabled on every user-scoped table and Storage bucket; grants are least-privilege and, where relevant, column-scoped (e.g. `listening_events.listened_at` is the only mutable column on an existing row).
- Every uploaded image is validated before use, but the exact validation differs by flow. The **recognition photo** (§14) is checked server-side against a MIME allow-list, a size cap, *and* magic-byte content sniffing (the declared type must match the file's actual signature) before it is ever sent to the vision model; it is discarded after use and never written to storage. A **custom cover or avatar** (§22, §27) is checked client-side against an accepted-MIME allow-list and an input-size cap, then decoded, downscaled/cropped, and re-encoded to WebP entirely in the browser (a corrupt or mislabeled file simply fails to decode) before being uploaded — this path does not perform the same explicit magic-byte signature check as recognition, and is the one kind of upload that is intentionally persisted, in a private, owner-scoped Storage bucket.
- All model output — vision and curator alike — is treated as untrusted and schema-validated before use.
- In-image text is explicitly framed to the vision model as untrusted data, not as instructions.
- The Discover exact-release-URL lookup (§13) is the one place a user-pasted URL string is accepted: the server never fetches it. The client extracts and validates a bare MusicBrainz release ID from the pasted text; only that ID (re-validated server-side) ever reaches a lookup call, which the server itself constructs against `musicbrainz.org` — the same extract-and-validate-an-identifier pattern already used for catalog-add's `providerReleaseId`, never forward-an-arbitrary-URL.

## 34. Error / Loading / Empty / Failure States

Every meaningful flow distinguishes initial, loading, success, empty, validation-error, network/provider-error, and (for catalog/vision/curator) no-match/ambiguous-match states. A provider or model failure is shown as a failure — never as an empty card or a fabricated default recommendation.

## 35. Responsive / Accessibility / Motion Requirements

The application is responsive down to a mobile viewport (bottom tab navigation, stacked filters, no horizontal overflow), respects `prefers-reduced-motion`, and received a dedicated accessibility/contrast correction pass (see the Visual Experience & Product Identity evidence in [`docs/verification.md`](docs/verification.md)).

## 36. Performance Expectations

Route-level code splitting keeps the initial JS entry small; the vision call downscales images client-side before upload to bound both latency and cost; the curator sends the model a bounded candidate set (≤ 12 items) rather than the full collection.

## 37. Deployment / Runtime Assumptions

Netlify static hosting + Functions, hosted Supabase, no custom domain, no CI, manual deploy from a reviewed and merged `main`. The accepted production runtime and deploy ID are recorded in [`docs/roadmaps/2026-09-02-complete-project-roadmap.md`](docs/roadmaps/2026-09-02-complete-project-roadmap.md) and [`docs/verification.md`](docs/verification.md), not restated here as a value that would go stale the moment this document is next read.

## 38. Verification / Acceptance Criteria

A requirement in this document counts as met only if it has: an automated test where the behavior is deterministic, or a recorded human production-acceptance observation where it depends on a real deployed environment or a real AI call. See [`docs/verification.md`](docs/verification.md) for the full evidence, milestone by milestone, including every independent-review finding and its correction.

## 39. Known Limitations

See the README's [Known Limitations](README.md#️-known-limitations) section — no custom domain, no CI, no daily AI spend cap beyond per-request/per-user bounds, single-account production exercise to date, no application-chrome localization, and an open (not blocking) decision on `model_calls` retention duration.

## 40. Relationship to Historical Specifications

This document describes the **current, final** product contract. It does not replace or invalidate the milestone-by-milestone record under [`docs/specs/`](docs/specs/README.md) and [`docs/plans/`](docs/plans/) — those preserve exactly what was proposed, approved, and verified at each stage of the project's evolution, including work later refined or corrected. Where this document and an individual historical spec appear to disagree, this document reflects the accepted final behavior; the historical spec reflects what was true, planned, or approved at the time it was written, and is not rewritten to pretend otherwise.

For the full chronology — including the Visual Experience & Product Identity pass, the Hebrew & Multilingual Record Support enhancement, the Final Submission Alignment remediation that produced the current duplicate-copy and rating/listening-browse behavior described above, and the Discover & MusicBrainz Navigation Enhancement that produced the current search-mode/pagination/exact-lookup behavior described in §13 — see [`docs/roadmaps/2026-09-02-complete-project-roadmap.md`](docs/roadmaps/2026-09-02-complete-project-roadmap.md).

Related current technical documentation: [Architecture](docs/architecture.md) · [Data Model](docs/data-model.md) · [AI Design](docs/ai-design.md) · [API Integrations](docs/api-integrations.md) · [Security](docs/security.md) · [Verification](docs/verification.md).
