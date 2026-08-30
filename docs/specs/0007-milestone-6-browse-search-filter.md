# 0007 Milestone 6 Browse / Search / Filter Specification

Status: implemented and verified (automated + independent implementation review
+ human runtime); merged to `main` in PR #6

Milestone: 6 - Browse / Search / Filter

Date: 2026-08-30

Approved: 2026-08-30 (spec + plan approved with the four Open Questions
answered - see "Open Questions Requiring Human Approval")

Implemented: 2026-08-30

Independent implementation review: 2026-08-30 (0 BLOCKER, 0 MEDIUM after the
retry-pacing + year-range corrections)

Human runtime verification: 2026-08-30 (PASS - 15 human tests; see
`docs/verification.md`)

Branch: `claude/milestone-6-browse-search-filter`

Baseline: `2c125bc006bb2631da8356d8c51daf5ef9772a13` (Milestone 5 merge on `main`)

Human decisions recorded: (1) manual Genre field - APPROVED; (2) genre source -
APPROVED, one best-effort MusicBrainz release-group genre lookup during
confirmed catalog Add; (3) genres shown on collection cards - APPROVED;
(4) standalone genre ADR - NOT REQUIRED, this spec is sufficient.

## Intent

Turn the saved collection into a genuinely usable personal library. An
authenticated user can browse every record they own and narrow it down with
deterministic, local search and filters: by artist or album/title text, by
exact release year, by decade, and (where factual metadata supports it) by
genre. Filters combine predictably, clear easily, and produce honest empty and
no-result states.

This is **collection browsing** over records the user already owns. It is
conceptually and physically separate from the existing Milestone 4 external
MusicBrainz catalog search, which finds *external* releases to add. No LLM call
and no external API request happens when a user browses or changes a filter.

## User Outcome

1. Open the authenticated app shell; the owned collection is visible.
2. Type part of an artist or album name; the list narrows as a deterministic
   local filter (no request).
3. Pick a decade, or an exact year, or a genre (when the collection has genre
   data); the list narrows further, combining with the text search as logical
   AND.
4. See a live result count ("12 of 84 records").
5. Press "Clear filters" to return to the full owned collection.
6. Optionally re-sort (recently added, artist A-Z, album A-Z, year newest, year
   oldest).
7. Empty collection and no-result states are clearly worded and never crash on
   missing metadata.

## In Scope

- A collection-library surface built on the existing `CollectionPanel` list:
  search box, decade selector, exact-year field, genre selector (shown only
  when the loaded collection contains at least one genre), a compact sort
  control, "Clear filters", and a visible result count.
- Deterministic client-side search / filter / sort over the collection already
  loaded through the existing RLS-authoritative browser query. No new Netlify
  Function.
- Genre persistence: one new `public.releases.genres text[]` column
  (default `'{}'`), aligned with `docs/data-model.md`.
- Catalog-add genre enrichment: one additional best-effort deterministic
  MusicBrainz release-group genre lookup during a confirmed catalog Add. If it
  is unavailable, the release is still saved with `genres = '{}'`.
- Manual add/edit: one optional free-text "Genre" input (0-or-1 value stored
  into `genres`). Approved (Open Question 1).
- Decade derived deterministically from `release_year` in the client; never
  stored.
- Focused automated tests (see "Verification Steps"), plus a forward migration
  with pgTAP coverage.

## Out of Scope

- Ratings, favorites, personal notes (Milestone 8).
- Listening history and "recently listened / forgotten / most played" filters
  or sorts (Milestone 9).
- The AI curator / natural-language recommendation (Milestone 10+).
- `styles` / sub-genre metadata (MusicBrainz has no reliable Discogs-style
  "style" field; deferred).
- A second catalog provider, any LLM/RAG/vector-DB genre inference, website
  scraping, a genre-normalization taxonomy, or a batch enrichment pipeline.
- A full-text / trigram database index or any server-side collection search
  endpoint (a personal collection is small enough for client-side filtering).
- Backfilling genre for releases added before this milestone (they simply have
  no genre until re-added or manually edited).
- Any visual redesign beyond the focused library controls; production
  deployment.
- Persisting `decade` as a column.

## User Flow

```text
browser (already authenticated)
  -> loadCollection() through the existing RLS browser query
     (now also selecting releases.genres)
  -> render the full owned collection + library controls
  -> user types search text / picks decade / picks year / picks genre / sorts
     -> pure client-side derivation: filter + sort the in-memory array
     -> update the visible list and the "N of M" count
     -> NO network request, NO MusicBrainz, NO OpenRouter
  -> "Clear filters" -> full owned collection, default sort
```

Catalog-add genre enrichment (server-side, unchanged trigger point):

```text
POST /api/catalog/add  (existing, Milestone 4)
  -> authenticate -> pace -> MusicBrainz release lookup (existing)
  -> best-effort MusicBrainz release-group genre lookup (NEW; short timeout,
     no retry, errors swallowed)
  -> upsert releases row with genres (service role; genres may be '{}')
  -> insert collection_item for the verified user (existing)
```

## Backend Behavior

### Collection load (`src/lib/supabase/collection.ts`)

- `loadCollection` adds `genres` to the joined `release` select. Every read
  path that projects the release (`loadCollection`, catalog-add response
  select, manual add/edit response select) returns `genres: string[]`
  (empty array when unset).
- `CollectionItemWithRelease['release']` and the `Release` type gain
  `genres: string[]`.
- No new query, no new RPC, no service-role use in the browser. Row visibility
  stays governed entirely by the existing `collection_items` /
  `releases` RLS policies.

### Client search / filter / sort (deterministic, no I/O)

A single pure function pipeline over the loaded `CollectionItemWithRelease[]`:

- **Search text**: trim; if empty, no text filtering. Otherwise
  case-insensitive substring match against `release.artist` OR `release.title`
  (`.toLocaleLowerCase().includes(...)`). Diacritics are not normalized in
  Milestone 6.
- **Exact year**: if provided and parses to an integer, keep items whose
  `release.release_year === year`. A non-integer / out-of-range entry is
  treated as "no year filter" and shows an inline hint.
- **Decade**: selector offers only the decades actually present in the loaded
  collection. `decadeOf(year) = Math.floor(year / 10) * 10` rendered as
  `"1960s"`, `"1990s"`, `"2000s"`. Items with `release_year === null` match no
  decade and no year filter (they only appear when neither is set).
- **Genre**: selector offers only the distinct genres present in the loaded
  collection (case-insensitive, de-duplicated, sorted). Match is
  case-insensitive membership in `release.genres`. Items with an empty
  `genres` array match no genre filter.
- **Combine**: logical AND across the four categories.
- **Sort** (applied after filtering): `Recently added` (default, existing
  `added_at desc, id desc`), `Artist A-Z`, `Album A-Z`, `Year newest`,
  `Year oldest`. Null years sort last in both year directions. Ties broken by
  the default order for determinism.
- **Clear filters**: resets all four filters and returns to the default sort
  and the full collection.
- No exception on any `null` / missing field; unknown metadata is simply
  non-matching.

### Catalog-add genre enrichment (`netlify/functions/_shared/catalog-handlers.mts` + `src/lib/catalog/musicbrainz.ts`)

- New adapter function `lookupMusicBrainzReleaseGroupGenres(releaseGroupId)`:
  `GET https://musicbrainz.org/ws/2/release-group/<rgid>?inc=genres&fmt=json`,
  same `User-Agent`, a short `AbortController` timeout, `fmt=json`. Returns a
  cleaned `string[]`: MusicBrainz community genre `name` values with
  `count >= 1`, `toLowerCase().trim()`, de-duplicated, capped at 12 entries,
  each 1-40 chars. Any non-2xx, timeout, malformed body, or missing
  `providerReleaseGroupId` yields `[]` and never throws to the caller.
- `handleCatalogAdd` calls it after the existing release lookup (optionally
  after a short additional pace), merges the result into the release payload as
  `genres`, and proceeds. A genre-lookup failure never fails the Add.
- `CatalogCandidate` gains `genres: string[]` (populated only on the add-path
  lookup; the search-path candidates keep `genres: []` - the search endpoint is
  unchanged and makes no extra call).
- The recognition function and the catalog **search** endpoint are unchanged.

### Manual genre input (subject to approval)

- `CollectionForm` gains one optional "Genre" text input.
  `normalizeManualReleaseInput` maps it to `genres: string[]` (`[]` when blank,
  otherwise a single `toLowerCase().trim()` value). `validateManualReleaseInput`
  enforces 1-40 chars when present.
- `addManualCollectionItem` / `updateManualRelease` include `genres` in the
  `releases` insert / update.

## Database Implications

One new forward migration (`20260830120000_add_release_genres.sql`). No
historical migration is edited.

As implemented (a CHECK constraint cannot contain a subquery, so the
element-wise rule is a small validator function):

```sql
-- Pure, deterministic, IMMUTABLE. In `public`, not `private`, because a CHECK
-- function runs in the DML executor's security context and `authenticated`
-- has no USAGE on `private`. Examines only its argument.
create or replace function public.release_genres_valid(genres text[])
returns boolean language sql immutable parallel safe set search_path = ''
as $$
  select
    genres is not null
    and coalesce(array_length(genres, 1), 0) <= 12
    and coalesce(
      (
        select bool_and(
          g is not null and g = btrim(g) and g = lower(g)
          and char_length(g) between 1 and 40
        )
        from unnest(genres) as g
      ),
      true
    );
$$;

revoke all on function public.release_genres_valid(text[]) from public;
grant execute on function public.release_genres_valid(text[]) to authenticated;
grant execute on function public.release_genres_valid(text[]) to service_role;

alter table public.releases
  add column genres text[] not null default '{}';

alter table public.releases
  add constraint releases_genres_valid check (public.release_genres_valid(genres));

-- Manual genre editing (APPROVED).
grant insert (genres) on table public.releases to authenticated;
grant update (genres) on table public.releases to authenticated;
-- touch_release_updated_at_before_metadata_update is recreated with `genres`
-- added to its `before update of ...` column list and its `when (...)` clause.
```

**No GIN index in Milestone 6.** Filtering is client-side over the already
loaded owned collection; there is no database genre-containment query, so an
unused GIN index would be pure write overhead. Add one in a later milestone if
server-side genre querying is introduced.

- `service_role` already holds table-level `select, insert, update` on
  `public.releases` (migration `20260829120000`), so catalog-add genre writes
  need no new grant.
- RLS policies are unchanged: `genres` is an ordinary column on an
  already-governed row. The catalog policy still gates by `source = 'catalog'`;
  the manual policies still gate by `created_by` + `source = 'manual'`.
- `releases_manual_catalog_identity` and all other constraints are unchanged.
- No `decade` column. No change to `collection_items`.

## External API Implications

- One provider only: MusicBrainz, via the existing server-side adapter,
  `User-Agent`, timeout, `429`/`503` -> `provider_rate_limited` handling, and
  best-effort per-instance pacing. The repo's Milestone 4 spike already
  confirms `inc=genres` is supported on `release` and `release-group` lookups
  (`docs/specs/0005-...` "release lookups can include ... tags and genres
  through `inc=`").
- Exactly one additional GET per confirmed catalog Add (the release-group
  genre lookup), best-effort. The catalog **search** path is unchanged and adds
  no call. Browsing / filtering the collection makes **zero** external
  requests.
- No Cover Art Archive, no Discogs, no second provider, no submissions to
  MusicBrainz.

## AI / Model Behavior

None. Milestone 6 introduces no model call. Genre comes only from persisted
factual MusicBrainz metadata (or the user's own optional manual entry). No
inference, no enrichment model, no RAG.

## Error States

Every case is recoverable and local to the collection surface.

| Case | Handling |
| --- | --- |
| Collection load fails | existing recoverable error + Retry (unchanged) |
| Collection is empty | existing empty state; library controls hidden or disabled |
| Search / filters match nothing | clear "No records match these filters" state with a "Clear filters" action; the count shows "0 of M" |
| `release_year` is null | item matches no year/decade filter; still shown when neither is set; never throws |
| `genres` is empty | item matches no genre filter; still shown otherwise |
| Loaded collection has no genres at all | genre selector hidden (or disabled with a hint); year/decade/text still work |
| Invalid exact-year input | treated as no year filter + inline hint; no crash |
| Catalog-add genre lookup fails / times out / rgid missing | release saved with `genres = '{}'`; Add still succeeds; no user-visible error |
| MusicBrainz `429`/`503` on the genre lookup | swallowed (best-effort); the existing release lookup's rate-limit handling is unchanged |

## Acceptance Criteria

- With no filters, every record the user owns is shown, with a correct total
  count.
- Search matches artist or title, case-insensitively, on partial input, after
  trimming surrounding whitespace; empty search does no text filtering.
- Exact-year filter keeps only that year; decade filter is derived correctly
  (1967 -> 1960s, 1999 -> 1990s, 2000 -> 2000s).
- Genre filter (when genre data exists) matches case-insensitively against
  persisted factual/manual metadata only; never inferred.
- Filter categories combine as logical AND; "Clear filters" restores the full
  owned collection and default sort.
- Null `release_year` and empty `genres` never crash and behave predictably.
- The no-results state is clear and offers a way back.
- Sort options behave deterministically, including null-year ordering.
- Only the authenticated user's own records are ever shown (RLS unchanged).
- Browsing or changing any filter triggers **zero** MusicBrainz requests and
  **zero** OpenRouter requests.
- A confirmed catalog Add persists MusicBrainz genre when available and still
  succeeds when it is not.
- If the manual Genre field is approved: a manual record can be saved and
  edited with a genre, and it participates in the genre filter.
- Existing Milestone 1-5 automated tests and manual flows still pass.
- No new secret, no service-role use in the browser, no new Netlify Function,
  no Milestone 7+ scope.

## Verification Steps

Automated (agent-run / local; no real external calls):

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
npm audit --omit=dev
```

Plus a branch-diff secret/scope scan.

Focused tests to add:

- Client filter pipeline (pure unit tests): full collection with no filters;
  artist match; title match; case-insensitive partial match; surrounding
  whitespace trimmed; exact year; decade derivation incl. `2000 -> 2000s`;
  genre match (case-insensitive); combined AND filters; null `release_year`
  handling; empty `genres` handling; no-results; "Clear filters"; each sort
  option incl. null-year ordering; "owned collection only" (the pipeline never
  invents rows).
- `CollectionPanel` component tests: controls render; result count updates;
  genre selector hidden when no genre data; no-results state; a filter change
  calls neither `searchCatalog` nor any recognition/OpenRouter client (asserted
  via mocks) - zero provider calls on filter.
- MusicBrainz adapter: `lookupMusicBrainzReleaseGroupGenres` builds the correct
  URL, parses/cleans genres, returns `[]` on 404 / 503 / timeout / malformed /
  missing rgid, never throws.
- `handleCatalogAdd`: genre persisted when the release-group lookup returns
  genres; Add still succeeds (release saved with `genres = '{}'`) when the
  genre lookup fails; the genre lookup is best-effort (its failure is not
  surfaced).
- Manual path: `normalizeManualReleaseInput` / `validateManualReleaseInput`
  handle the genre field; `addManualCollectionItem` / `updateManualRelease`
  write `genres`; the Milestone 5 add-form `sessionStorage` draft preserves it.
- Database pgTAP (`release_genres.test.sql`): `genres` column exists with the
  default and check constraint; **an explicit assertion that no GIN index
  exists** (Milestone 6 adds none); the check rejects blank / untrimmed /
  uppercase / overlong / too-many entries; `authenticated` column grants for
  `genres` are correct; `service_role` can write `genres` on a catalog
  release; RLS is unchanged; `updated_at` bumps on a genre change; existing
  suites still pass on a clean reset.

Human runtime test plan:

1. Sign in with a collection that has catalog-added and manual records.
2. Add one record by catalog search; confirm it gains a genre (Supabase Studio
   or the genre filter).
3. Browse: confirm every owned record is listed with a correct count.
4. Search "part of an artist" and "part of a title", mixed case; confirm
   case-insensitive partial matching.
5. Filter by a decade, then also by a genre; confirm logical AND and the count.
6. Enter an exact year; confirm only that year remains.
7. "Clear filters"; confirm the full collection returns.
8. Try each sort option; confirm ordering, including records with no year.
9. Confirm a record with no genre still appears until a genre filter is set.
10. Confirm no network request fires on any filter change (dev tools).
11. Confirm Milestone 4 catalog search and Milestone 5 photo recognition still
    work and remain separate from collection browsing.
12. Confirm `/api/health` still returns `{"status":"ok"}`.

Distinguish agent-run automated evidence (no real calls) from human runtime
evidence in `docs/verification.md`. Do not claim production verification.

## Open Questions Requiring Human Approval

Resolved with the human before implementation:

1. **Manual Genre field.** APPROVED. One optional free-text "Genre" input on the
   manual add/edit form, stored as a 0-or-1-element `genres` array.
2. **Genre source.** APPROVED: one additional best-effort MusicBrainz
   release-group genre lookup during a confirmed catalog Add (not the sparse
   release-level option, not deferral).
3. **Genre display on cards.** APPROVED. Genres are shown on the collection
   card.
4. **Standalone genre ADR.** NOT REQUIRED. This spec section is sufficient; the
   provider and trust boundary are unchanged from Milestone 4.

## Stop Point

Historical pre-implementation gate, satisfied. It read:

> This specification is PLANNED. Do not begin Milestone 6 implementation until
> the human approves this spec and the implementation plan, including the
> answers to the Open Questions above.

The human approved the spec and plan with all four Open Questions answered and
directed implementation on this branch. Implementation is complete; automated
verification, an independent implementation review (0 BLOCKER, 0 MEDIUM), and
human runtime verification (PASS) have all passed. Current status is at the top
of this document; full evidence is in `docs/verification.md`.
