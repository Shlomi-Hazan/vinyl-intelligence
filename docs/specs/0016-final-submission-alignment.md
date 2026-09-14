# 0016 Final Submission Alignment (Specification)

Status: **PLANNING ONLY — not started.** Post-closeout remediation. Plan:
`docs/plans/016-final-submission-alignment.md`. No decision record — this is
narrow remediation, not a new architecture/product decision (§3).

Baseline `main` when this spec was written:
`7ddd5b08ef9b0ada272ae02a97626dbf8423f142` (PR #28 — Hebrew & Multilingual
Record Support documentation closeout).

---

## 1. Purpose

An independent final course/submission audit compared `intent.txt`,
`AGENTS.md`, `CLAUDE.md`, both roadmaps, every spec/plan/ADR,
`docs/verification.md`, Git/PR history, and actual runtime behavior against
each other, and found a small number of real gaps between approved product
intent and what the repository/product currently and truthfully shows. This
spec locks those findings and the desired final behavior into a checkable
contract **before** any remediation code is written, per the project's own
required loop (Intent → Specification → Context → Plan → Execution →
Verification → Audit trail).

## 2. Audit provenance

Independent final audit against `main` `7ddd5b08...` (post PR #28), comparing:
`intent.txt`, `AGENTS.md`, `CLAUDE.md`,
`docs/roadmaps/2026-08-18-complete-project-roadmap.md`,
`docs/roadmaps/2026-09-02-complete-project-roadmap.md`, every file in
`docs/specs/`, `docs/plans/`, `docs/decisions/`, `docs/verification.md`, the
GitHub PR/merge history, and the current `src/collection/`,
`src/catalog/DiscoverPanel.tsx`, `src/catalog/ScanPanel.tsx` runtime. Findings
A–H below were verified directly against current repository code and
documentation while drafting this spec (see the exact file/line evidence in
each finding).

## 3. Explicit non-goal

**This is not a new product milestone, redesign, or architecture change.** It
is a narrowly-scoped, post-completion remediation making the submitted
repository and product truthfully match the approved intent and the project's
own engineering history. Two small runtime corrections (Findings A and B) and
one documentation reconciliation pass (Findings C–H) — nothing else.

Explicitly out of scope, and a **stop condition** if implementation discovers
otherwise:

- No RAG or vector database.
- No new agent/runtime architecture.
- No database migration expected.
- No new API or provider.
- No model/prompt/schema change.
- No new secrets.
- No dependency change expected.
- No weakening of RLS, anywhere.
- No change to the owned-only curator recommendation guarantee.

If implementation discovers that any of the above is actually required to
satisfy a finding below, **STOP and return to human approval** before
proceeding — do not silently expand scope.

## 4. Findings (locked)

### Finding A — Collection intent completion (HIGH, runtime/product gap)

`intent.txt` §6.4 requires browsing by "listening-related fields" including
"least recently listened / forgotten records" and "most played / least
played," and §36 (Final Product Vision) explicitly promises sorting by rating
and finding records "I haven't played lately." Current Collection
(`src/collection/collectionQuery.ts`, `src/collection/CollectionBrowser.tsx`)
supports search, exact year, decade, genre, favourites-only, and four sorts
(`recently-added`, `artist-asc`, `album-asc`, `year-desc`/`year-asc`) — **no
rating sort/filter and no listening-recency filter/sort exist.**

This is not a missing capability requiring new data: `CollectionBrowser`
already receives `events: ListeningEventRecord[]` and `eventsStatus:
'loading' | 'ready' | 'error'` as props (loaded once by
`CollectionDataProvider`), and `summarizeListeningForItem` (in
`src/collection/listeningSummary.ts`) already derives `{ count,
lastListenedAt }` per item, deterministically, client-side, with no network
call. `item.rating` is already loaded and already displayed (read-only) on
every card/row. The gap is purely in `collectionQuery.ts`'s filter/sort
surface and `CollectionBrowser.tsx`'s controls — the underlying data pipeline
already exists.

An existing, already-approved 30-day default exists in **two** independent
places for the identical "not played recently" concept:
`DEFAULT_RECENT_DAYS = 30` (`src/lib/curator/types.ts`, used by the curator's
`avoidRecentlyPlayed` filter) and `PLAYED_WINDOW_DAYS = 30`
(`src/lib/dashboard/insights.ts`, used by the Dashboard's "played in window"
stat). Collection's new "not played recently" filter must use this same
30-day value — not the Dashboard's separate `REDISCOVER_STALE_DAYS = 60`
(a different, Dashboard-rail-specific staleness threshold, out of scope,
unchanged).

### Finding B — Duplicate-copy contract regression (HIGH, runtime/product regression)

`intent.txt` §19 requires: warn if the exact release is already owned; allow
multiple copies if intentionally confirmed; never silently block a legitimate
duplicate. Milestone 4 originally supported multiple `collection_items`
rows referencing the same `release_id`, and the backend
(`addCatalogReleaseToCollection` → `POST /api/catalog/add`) still allows this
today with no schema constraint against it — confirmed: adding is a plain
authenticated POST with no duplicate check in the request/response shape.

The Visual Experience pass changed **`DiscoverPanel.tsx`** so an already-owned
`providerReleaseId` (via `ownedReleaseIds`, built from the `ownedItems` prop)
renders a plain `<span>In your collection</span>` **instead of** the "Add to
collection" button — confirmed at `src/catalog/DiscoverPanel.tsx` (the
`owned ? <span>...</span> : <Button>...</Button>` branch). There is currently
**no path at all** in Discover to intentionally add a second copy of an
already-owned release.

**`ScanPanel.tsx` has no owned-release awareness whatsoever** — confirmed: it
receives no `ownedItems` prop and contains no reference to it. A Scan
candidate for an already-owned release can be confirmed and added silently,
with **no warning of any kind**.

The product now has two different wrong behaviors for the same case: Discover
silently *blocks* a legitimate second copy; Scan silently *allows* one with no
disclosure. Neither matches the approved intent.

### Finding C — Living intent drift (MEDIUM, documentation reconciliation)

`intent.txt` §4.3 still broadly lists "Override metadata" as something the
user must be able to do. `docs/decisions/0006-listening-event-mutability-and-profile-avatar.md`
(human-approved, accepted) deliberately narrowed this: catalog (MusicBrainz)
`releases` rows are shared, browser-read-only, and never per-user-writable;
user control over an owned item is expressed through **overlays** — personal
genres, rating, favourite, notes, custom cover artwork, and listening
history — plus catalog candidate correction/rejection and the manual-entry
fallback at add-time. Manually-entered (`source = 'manual'`) release rows
remain user-editable. `intent.txt`'s current wording is broad enough to be
misread as "the user can edit any record's stored MusicBrainz facts," which
is not, and must never become, true. This finding is documentation-only: it
does **not** propose changing behavior, RLS, or the overlay architecture —
only stating it accurately in the living intent document, while preserving
the original §4.3 reasoning as historical context.

### Finding D — Current roadmap is stale (HIGH, documentation/reviewability)

`docs/roadmaps/2026-09-02-complete-project-roadmap.md` calls itself "(Current)"
in its own title and states "Project status (2026-09-07): M0–M12 COMPLETE...
current `main` `c2037b8a...`" — confirmed by direct inspection, this is the
entire extent of its current-state material. It contains no mention of the
Hebrew & Multilingual Record Support enhancement (planning PR #22; runtime PRs
#23–#27; documentation closeout PR #28), even though that work is
human-approved, fully merged, deployed, and human-accepted, and `main` is now
`7ddd5b08...` — newer than the document's own claimed "current" state. The
2026-08-18 historical snapshot (sha256
`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`) is
correctly untouched and must remain so; this finding is about the **other**,
currently-mutable roadmap only.

### Finding E — README current-state drift (HIGH, documentation/reviewability)

`README.md`'s "Project Status" section still names the pre-Hebrew M12 state
(`main c2037b8a...`, deploy `6a9eaf39...`, dated 2026-09-07) as "Current
state," even though the repository/documentation HEAD, the final accepted
runtime, and the final accepted production deploy have all since advanced
through the Hebrew enhancement. Separately, the "Capabilities (shipped)"
bullet says *"Append-only listening history... a user may correct or delete
their own play"* in one sentence — internally self-contradictory (confirmed
at `README.md`'s capabilities list) even though the **Data Model** section
elsewhere in the same file already states the correct chronology correctly
(M8 shipped append-only; the Visual Experience pass later added an
owner-scoped `UPDATE(listened_at)` + `DELETE` grant, per ADR 0006). The
capabilities bullet needs to match the chronology the rest of the file
already gets right, not invent a new fact.

### Finding F — Spec/ADR index status drift (HIGH, documentation/reviewability)

`docs/specs/README.md` lists spec `0013` (Milestone 11) as "**PLANNING
ONLY** (not started)" even though Milestone 11 is long since implemented and
in production (confirmed: `README.md`, `docs/verification.md`, and the
current roadmap all describe M11 as complete). Spec `0014` (Milestone 12
final hardening) is missing from the index entirely, despite M12 being
complete and its own spec/plan files existing on disk
(`docs/specs/0014-milestone-12-final-hardening.md`,
`docs/plans/014-milestone-12-final-hardening.md`). The trailing "Likely
milestone specs" placeholder list duplicates milestones that already shipped
under different filenames, which can mislead a final-state reviewer.

`docs/decisions/README.md` lists ADR `0003` (OpenRouter Vision Provider)
under "Proposed decisions (pending human approval)" — but ADR 0003's **own**
status header already reads `Status: proposed (pending human approval with
Milestone 5)` (confirmed by direct inspection), even though Milestone 5
(Photo Recognition) is complete and vision recognition using exactly this
provider decision is live in production. The "Initial decisions still
pending" list includes "Exact duplicate-copy representation" and "Whether
bounded structured conversation state is persisted or kept ephemeral" — both
resolved during implementation (duplicate copies: multiple `collection_items`
per `release_id`, confirmed by Finding B's own evidence that this still works
at the schema level; conversation state: React-memory-only, confirmed
resolved in ADR 0006 / spec 0011 / the M9–M10 verification record).

### Finding G — Verification log current-metadata/coverage drift (MEDIUM, documentation/verification coverage)

`docs/verification.md` begins with a "Last updated: 2026-09-07" header even
though the file now also contains the completed Hebrew/Multilingual
2026-09-14 evidence appended after it (confirmed: the file's own consolidated
Hebrew section is dated/evidenced 2026-09-14, but the top-of-file metadata
line was never advanced). Beyond that metadata drift, the file's
Search/Filtering acceptance coverage does not yet cover the actual `intent.txt`
requirement this spec restores in Finding A (rating-based behavior,
listening-recency filtering/sorting), and its duplicate-handling verification
covers backend semantics only, not the mounted Discover+Scan UX contract this
spec restores in Finding B. Both will need new acceptance entries once PR B
and PR C are implemented and accepted — not authored speculatively now.

### Finding H — Listening-event current wording (MEDIUM, documentation precision)

The same self-contradiction as Finding E's second half recurs wherever a
document calls `listening_events` simply "append-only" in the same breath as
describing correction/deletion, without the two-step chronology. Correct
statement, to be used consistently: Milestone 8 originally shipped
`listening_events` as **append-only**; the Visual Experience pass (Phase D)
and ADR 0006 **deliberately, minimally superseded** that with an
owner-scoped `listened_at` correction and delete grant; a play can still
never be re-pointed to another user's or another item's row (the `UPDATE`
grant is column-scoped to `listened_at` only). This is a precision fix, not a
behavior change — the current runtime behavior is already correct and
already documented correctly in at least one place in most of these files;
the fix is consistency, not correction of behavior.

## 5. Exact desired final product behavior

**Collection (Finding A).** A logged-in user can, from the existing
Collection view, without navigating away or waiting on a network request:

- Sort by rating (exact direction(s): see §21 open decision).
- See which records have never been played.
- See which records have not been played in the last 30 days.
- Combine any of the above with existing search/genre/year/decade/favourites
  filters and with the existing grid/list view toggle.
- Trust that "never played" is only ever shown once listening-event data has
  actually finished loading — never guessed from a loading or errored state.

**Discover + Scan (Finding B).** In both surfaces, when a catalog candidate's
exact `providerReleaseId` is already owned:

- The user sees an honest "already owned" indicator (not silence, not a
  block).
- The user can still choose to add another physical copy through an explicit,
  separate action.
- Adding another copy requires one intentional confirmation step (a dialog),
  distinct from the ordinary single-click add for a not-yet-owned candidate.
- Cancelling that confirmation leaves the collection unchanged — no owned
  count in either direction.
- Confirming creates exactly one additional `collection_item` row for that
  release (never zero, never more than one per confirmation).
- Deleting one physical copy never deletes or otherwise affects a sibling
  copy of the same release.

**Documentation (Findings C–H).** After both runtime corrections are merged,
deployed, and human-accepted, the living documents accurately state: the
current overlay-based metadata-control architecture (not "override
metadata" broadly); the real post-M12 roadmap evolution (Hebrew enhancement
named, historical roadmap still untouched); accurate current-state pointers
in README (repo HEAD vs. final accepted runtime vs. final accepted deploy,
each named individually); a spec/ADR index that reflects what has actually
shipped; a `docs/verification.md` current-metadata line and coverage that
matches its own content; and one consistent, chronologically accurate
statement of the `listening_events` mutability history everywhere it appears.

## 6. Runtime boundaries

Finding A and Finding B are the only runtime work in this remediation, and
both stay entirely inside the existing deterministic client-side collection
layer and the existing catalog-add client call:

- Finding A: `src/collection/collectionQuery.ts`,
  `src/collection/CollectionBrowser.tsx`, and their tests only. No new data
  source; `events`/`eventsStatus`/`rating` are already loaded and passed in.
- Finding B: `src/catalog/DiscoverPanel.tsx`, `src/catalog/ScanPanel.tsx`, a
  new small shared confirmation helper, and their tests. The existing
  `addCatalogReleaseToCollection` client call and `POST /api/catalog/add`
  backend function are reused unchanged — this is a frontend UX gate change,
  not a new backend capability.

No other runtime surface (Dashboard, History, Settings, Album Detail, the
curator, Vision) is touched by Findings A or B.

## 7. Data/database implications

**None.** No migration is expected for either Finding A or Finding B. Finding
A reads existing loaded data (`items`, `events`) purely client-side. Finding B
adds no new column, table, or constraint — the database already permits
multiple `collection_items` rows per `release_id` per user (confirmed:
Milestone 4's original design, never constrained against, still true today
per Finding B's evidence), so the fix is UI-only. If implementation discovers
a database change is actually needed for either finding, **STOP** per §3.

## 8. AI/provider implications

**None.** Neither finding touches the curator, Vision, or any OpenRouter call.
No prompt, schema, model, or token-budget change. No provider call is needed
to implement, test, or verify either finding — all automated tests are
mocked/fixture-based exactly like the existing `collectionQuery.test.ts` and
`CollectionBrowser.test.tsx`/`DiscoverPanel.test.tsx`/`ScanPanel.test.tsx`
suites.

## 9. Security/privacy implications

**None expected.** Finding A introduces no new data exposure — rating and
listening events are already loaded under the existing RLS-authoritative
query for the authenticated owner only, and the new filters/sorts operate
purely client-side over data the user already has. Finding B introduces no
new persistence path or privilege — the same `POST /api/catalog/add` auth +
RLS + service-role-insert-only contract applies to a confirmed second copy
exactly as it does to a first copy today. No new secret, no new environment
variable, no RLS policy change, no owned-only-recommendation guarantee change
(the curator is untouched).

## 10. UX states

**Finding A** (Collection):

- Initial: existing filters plus the new rating sort option and the new
  listening-based filter/sort options, all inactive by default (no behavior
  change for a user who touches nothing).
- Loading: while `eventsStatus === 'loading'`, listening-based filters must
  not silently apply as if every record were never played — either disabled
  with an honest hint, or excluded from the active filter set until data is
  ready (implementation decides the least surprising of the two; see plan
  016).
- Error: while `eventsStatus === 'error'`, the same rule applies — an
  unknown/errored listening state is never treated as "never played."
- Combined-filter empty state: reuses the existing "no records match" empty
  state; no new empty-state copy is invented unless the existing one reads
  incorrectly for a listening-only filter (implementation decides; report if
  a new empty state is genuinely needed).
- Mobile/desktop: both existing grid and list views must expose the new
  controls without introducing horizontal overflow (matches the existing
  spec 0015 §16 non-overflow contract, inherited, not re-specified here).

**Finding B** (Discover + Scan):

- Not owned: unchanged — the existing "Add to collection" / "This is it — add"
  single-click flow, exactly as today.
- Already owned, not yet confirmed: an honest "You already own this" state
  plus an explicit "Add another copy" affordance — never a silent block,
  never a silent allow.
- Confirming: the existing `Dialog` primitive (`src/ui/Dialog.tsx`), focus-
  trapped, Escape-to-cancel, matching every other confirmation dialog in the
  app (e.g. `AlbumDetailPage`'s remove-from-collection dialog).
- Cancelled: returns to the "already owned" state, no write occurred.
- Confirmed, in flight: the same disabled/"Adding…" affordance the existing
  single-click add already uses.
- Confirmed, succeeded: the same success path each surface already has
  (Scan's `success` step; Discover's `onCollectionChanged` refresh).
- Confirmed, failed: the same error-surfacing pattern each surface already
  uses for a failed add (Scan's `addError`; Discover's per-candidate
  `addErrors`) — no new failure-copy invented beyond what already exists.

## 11. Accessibility expectations

No new accessibility pattern is introduced. The new Collection controls
follow the existing `SegmentedControl`/`Select`/toggle-button conventions
already used for sort/genre/favourites (labelled, keyboard-operable, visible
focus). The new confirmation dialog reuses the existing `Dialog` primitive's
already-verified focus trap, Escape handling, and focus-restore behavior — no
new dialog implementation. Any new interactive control gets an accessible
name exactly like its neighbors (e.g. `aria-pressed` on a toggle, matching
the existing `favoritesOnly` button).

## 12. Multilingual regression expectations

Neither finding touches script classification, BiDi isolation, search-key
normalization, sorting collators, or genre canonicalization — those stay
exactly as spec 0015 left them. Required regression coverage: a Hebrew-titled
record must still render correctly (existing `<bdi>` isolation unaffected) in
every new/changed Collection row/card layout slot from Finding A, and the
"already owned" / "Add another copy" state in Finding B must render a
Hebrew artist/title correctly using the existing `BidiText` pattern already
used elsewhere on each candidate card — no new multilingual behavior, only
confirmation that the existing pattern was not broken by the new controls.

## 13. Deterministic behavior contract

Both findings' entire acceptance criteria must hold with **zero** network
request, **zero** LLM call, and **zero** database write caused merely by
changing a filter, sort, or view toggle (Finding A), and **zero** database
write caused merely by viewing an "already owned" state (Finding B) — a write
happens only on an explicit, confirmed user action, exactly as every other
Collection/Discover/Scan write already works today.

## 14. Acceptance criteria

**Finding A:**

1. A rating sort option exists and orders the visible collection by
   `item.rating` per the approved direction(s) (§21).
2. A "never played" filter/state exists, computed from `summarizeListeningForItem`
   returning `count === 0`, and is only ever asserted true once
   `eventsStatus === 'ready'`.
3. A "not played in the last 30 days" filter/state exists, using the same
   30-day value as `DEFAULT_RECENT_DAYS`/`PLAYED_WINDOW_DAYS`, computed from
   `lastListenedAt` (or never-played) relative to render time.
4. At least one listening-based **sort** exists (least-recently-played /
   rediscovery-oriented), with never-played items ordered consistently with
   the existing Dashboard `rediscover` convention (never-played sorts as
   "most stale," i.e. first, in a least-recently-played ordering).
5. Every existing filter/sort/search/genre/year/decade/favourites/view-toggle
   behavior is provably unchanged (locked by existing tests continuing to
   pass unmodified, plus new tests for the new behavior only).
6. All of the above works with zero network request beyond what the page
   already loads once on mount.
7. An unknown/loading/errored listening-data state never renders as if a
   record were confirmed never-played.
8. A record with a Hebrew title/artist renders correctly (existing BiDi
   isolation) in every new UI slot introduced.

**Finding B:**

1. An already-owned candidate in Discover shows an honest "already owned"
   state **and** an "Add another copy" affordance (never only one or the
   other).
2. An already-owned candidate in Scan's candidate list shows the same honest
   state and the same affordance (parity with Discover).
3. Cancelling the confirmation makes zero database write.
4. Confirming makes exactly one `POST /api/catalog/add` call resulting in
   exactly one new `collection_item` row.
5. Deleting one copy (existing Album Detail "Remove from collection" flow,
   unchanged) never removes a sibling copy of the same release.
6. No schema, RLS, or `POST /api/catalog/add` request/response contract
   change.
7. No AI/provider call anywhere in the flow.
8. Mounted UI tests exist for both Discover and Scan covering: not-owned
   (unchanged single-click path), already-owned + cancel (no write), and
   already-owned + confirm (exactly one write).

## 15. Verification strategy

Both findings are verified the same way every prior milestone in this
repository has been: automated gate from a clean checkout (typecheck, lint,
`vitest run`, build; no DB/schema change so pgTAP/db-lint are re-run only as
a confirmation that nothing regressed, not because a change is expected
there), an independent PR review, then human production runtime acceptance
after merge and deploy — see plan 016 for the exact per-PR gate and
acceptance checklists. No provider call is used anywhere in verification for
either finding.

## 16. Human production acceptance criteria

**PR B (Collection):** on the existing production account, exercise rating
sort, never-played filter, not-played-recently filter, the new
listening-based sort, each combined with at least one existing filter, on
both desktop and mobile, in both grid and list views, including at least one
Hebrew-titled record in the visible set.

**PR C (Duplicates):** on the existing production account, using a record
already owned once, exercise: Discover already-owned state → cancel (no
change) → confirm (exactly one new copy) and the same sequence in Scan,
including at least one Hebrew-titled release if a Hebrew candidate is
available in the catalog for the test record.

Neither acceptance round requires a new signup/email test, a
provider-forced-failure test, or any additional real Vision/curator call —
consistent with this project's established acceptance practice.

## 17. Documentation-closeout criteria (PR D)

PR D may begin only after **both** PR B and PR C are merged, deployed, and
human-accepted per §16. It reconciles, and only reconciles (no new
capability, no redesign):

- `intent.txt` §4.3 (Finding C) — state the overlay-based architecture
  truthfully, preserving the original reasoning as historical context.
- `README.md` — current-state pointers (Finding E) and the
  listening-history capabilities bullet (Finding E/H).
- `docs/roadmaps/2026-09-02-complete-project-roadmap.md` — the real
  post-M12 evolution (Finding D). The 2026-08-18 historical roadmap is
  **never** touched (byte-identical,
  `cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`).
- `docs/specs/README.md` and `docs/decisions/README.md`, plus ADR 0003's own
  status header (Finding F).
- `docs/verification.md` current-metadata line, plus new acceptance-evidence
  entries for PR B and PR C, plus the consistent `listening_events` wording
  (Findings G, H).
- Any other current architecture/product doc **only if** drafting PR D
  reveals it is genuinely stale as a direct consequence of Findings A–H —
  not a general documentation sweep.

PR D records the actual final SHAs and production deploy evidence that exist
at the time it is written — it never predicts them in advance.

## 18. Stop conditions / scope-escalation conditions

STOP and return to human approval if implementation discovers:

- A database migration is actually needed for Finding A or B.
- The curator's owned-only recommendation guarantee would need to change.
- RLS would need to be weakened or a new privileged write path added.
- A new dependency is needed to build the rating/listening controls or the
  duplicate-confirmation dialog.
- Discover and Scan's existing candidate-rendering markup cannot both host
  the new state without a broader refactor than "add one state, one
  affordance, one dialog."
- Any of the §21 open UX decisions was silently resolved by a prior
  agent/session without a recorded human answer.

## 19. Historical-artifact preservation rules

- The 2026-08-18 roadmap snapshot is never edited (hash locked, §17).
- Every existing spec/plan/ADR Rev-log entry, closeout section, and
  human-acceptance record already written for prior milestones and for the
  Hebrew enhancement stays exactly as written — PR D adds new current-state
  facts, it does not rewrite history to make it look like these findings
  were anticipated earlier.
- This spec's own findings (A–H) are themselves a permanent audit-trail
  record of what was wrong and when it was found — they are not deleted or
  softened once fixed; PR D's reconciliation says what is *now* true and
  points back here for what was found and why.

## 20. Course/reviewability outcome

A reviewer who reads `intent.txt`, the two roadmaps, the spec/plan/ADR
indexes, `docs/verification.md`, and the actual product after PR D merges
should find every current-state claim true, every historical claim
preserved as history, the Hebrew enhancement correctly represented as
deliberate later evolution (not part of the original plan, not silently
absorbed into it), and the two real product-intent gaps (Findings A and B)
closed with the same reviewed-PR, human-accepted discipline as every other
milestone in this repository.

## 21. Open decisions requiring human approval before PR B/C implementation begins

These are **not** resolved by this spec. A recommendation is proposed for
each, grounded in an existing convention already in this codebase, but none
should be treated as approved until the human confirms.

1. **Exact rating filter shape.** *Proposed:* a minimum-rating threshold
   (`rating >= N`), mirroring the curator's existing `minRating` field
   exactly (same semantics, same name if reused as a query param) — not an
   exact-rating-only filter. *Needs approval.*
2. **Exact rating sort direction(s).** *Proposed:* two sort entries, "Rating
   (highest)" and "Rating (lowest)," mirroring the existing
   `year-desc`/`year-asc` two-entry convention rather than one bidirectional
   toggle. *Needs approval.*
3. **Exact listening-filter labels and shape.** *Proposed:* two toggle
   affordances styled like the existing `favoritesOnly` chip — "Never
   played" and "Not played in 30 days" — rather than a single combined
   dropdown. *Needs approval.*
4. **Exact ordering for never-played items in the new listening-based
   sort.** *Proposed:* never-played items sort first (as "most stale"),
   mirroring the Dashboard `rediscover` convention
   (`lastMs ?? Number.NEGATIVE_INFINITY`, ascending). *Needs approval.*
5. **Query-string parameter names/serialization.** *Proposed:* extend the
   existing `?genre=`/`?year=`/`?decade=`/`?sort=`/`?fav=1` pattern with
   `?minRating=N` and a single `?listening=never|stale` enum (rather than
   two separate booleans), consistent with `sort` already being one enum
   param. *Needs approval.*
6. **Duplicate-confirmation dialog copy.** *Proposed:* "You already own
   this release. Add another physical copy to your collection?" with
   "Add another copy" / "Cancel" buttons. *Needs approval.*
7. **Shared component vs. shared helper for Discover/Scan duplicate
   handling.** *Proposed:* a shared, small, presentation-free helper
   (state/decision logic only — "is this owned," "confirm," "cancel"), with
   each surface keeping its own existing candidate-card JSX, rather than a
   new shared React component — avoids the deeper refactor the audit
   explicitly warned against. *Needs approval.*

## References (do not duplicate)

`intent.txt` §4.3, §6.4, §19, §36; `AGENTS.md` (Scope Control, Verification,
Git/PR discipline); `docs/decisions/0006-listening-event-mutability-and-profile-avatar.md`;
`docs/specs/0007-milestone-6-browse-search-filter.md`;
`docs/specs/0009-milestone-8-listening-history.md`;
`docs/specs/0012-visual-experience-product-identity.md`;
`docs/specs/0015-hebrew-multilingual-record-support.md`;
`docs/decisions/0003-openrouter-vision-provider.md`;
`docs/roadmaps/2026-08-18-complete-project-roadmap.md` (never edited);
`docs/roadmaps/2026-09-02-complete-project-roadmap.md`.
