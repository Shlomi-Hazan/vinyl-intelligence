# 016 Final Submission Alignment (Implementation Plan)

Status: **FINAL DOCUMENTATION CLOSEOUT (PR D) — current as of 2026-09-15.**
PR A (planning, PR #29) is merged. PR B (Finding A, PR #30) and PR C
(Finding B, PR #31) are each complete: implemented, independently reviewed,
merged, deployed, and human-accepted — see `docs/verification.md` → "Final
Submission Alignment Evidence" for the full record. PR D is this
documentation-only reconciliation of Findings C–H; it changes no runtime
file. The original PR A/B/C/D operational plan below is preserved unchanged
as the plan being executed.
Spec: `docs/specs/0016-final-submission-alignment.md`.
Baseline `main`: `7ddd5b08ef9b0ada272ae02a97626dbf8423f142` (PR #28).

This plan is operational: another agent should be able to execute PR B, PR C,
or PR D from this document plus the spec, without re-deriving product intent.

**Four sequential PRs. Do not create one giant branch. PR B does not start
until PR A (this planning PR) is reviewed and merged. PR C does not start
until PR B is independently reviewed, merged, deployed, and human-accepted
per spec §16. PR D does not start until PR C is independently reviewed,
merged, deployed, and human-accepted per spec §16.**

---

## PR A — this planning PR

**Scope:** `docs/specs/0016-final-submission-alignment.md`,
`docs/plans/016-final-submission-alignment.md`, plus one `docs/specs/README.md`
index-entry line for spec 0016 (adding the new artifact to the index is not
"current-state reconciliation" — that is PR D's job for the *other* stale
entries in that same file, which this PR does not touch).

**Explicitly not in this PR:** no runtime file, no test file, no reconciliation
of any of Findings C–H beyond the one new index line.

**Gate:** documentation-only gate (§"Gates" below, PR-A row).

**Done when:** independently reviewed, merged to `main`. The seven §21
decisions are human-approved as of 2026-09-14 (recorded in spec 0016 §21);
PR B may begin once PR A is merged.

---

## PR B — Collection intent completion (Finding A)

**Depends on:** PR A merged. (§21 decisions 1–5 are already human-approved —
recorded 2026-09-14, spec 0016 §21.)

### Exact likely files

Runtime:
- `src/collection/collectionQuery.ts` — add `rating` to `CollectionFilters`
  (or a dedicated field per the approved shape, §21.1), add the two rating
  sort values to `CollectionSort`/`COLLECTION_SORTS` (§21.2), add a
  `listening` filter dimension (§21.3/§21.5), add a listening-based sort
  value, add the corresponding `matches*`/`compareBySort` branches. This
  module currently has **no** dependency on `ListeningEventRecord` or
  `summarizeListeningForItem` — it will need one, passed in as data (an
  already-computed `Map<string, ListeningSummary>` or the raw `events` array
  plus `now`), keeping the module pure/deterministic and consistent with its
  existing "no network, no LLM" doc comment.
- `src/collection/CollectionBrowser.tsx` — add the new sort options to the
  existing `Select`, add the two new toggle affordances alongside the
  existing `favoritesOnly` chip button, wire the new `?minRating=`/`?listening=`
  URL params through `setFilterParams` exactly like the existing params,
  gate "never played"/"not played recently" truthiness on
  `eventsStatus === 'ready'` (already a prop), pass `rating`/listening
  summary data into `applyCollectionQuery`.
- Possibly `src/collection/listeningSummary.ts` — if a small `isStale(summary,
  now, days)` / `isNeverPlayed(summary)` helper is worth extracting for reuse
  between `collectionQuery.ts` and the sort comparator, add it here rather
  than duplicating logic. Do not move existing dashboard rediscovery logic
  here — `src/lib/dashboard/insights.ts` stays untouched and its own
  `REDISCOVER_STALE_DAYS = 60` is not reused.
- A new local `NOT_PLAYED_RECENTLY_DAYS = 30` constant (or equivalent name) —
  **do not** import `DEFAULT_RECENT_DAYS` from `src/lib/curator/types.ts` or
  `PLAYED_WINDOW_DAYS` from `src/lib/dashboard/insights.ts` into
  `src/collection/`; declare an independent constant with the same value
  (`30`) to avoid coupling the Collection module to the curator or Dashboard
  feature boundaries. If the human prefers importing one of the existing
  constants instead, that's a one-line change — flag it in the PR, don't
  block on it.

Tests:
- `src/collection/collectionQuery.test.ts` — new cases for the rating
  filter/sort and listening filter/sort, using fixed fixtures (like the
  existing tests already do), including: never-played sorts as "most
  stale"; the approved 30-day boundary is exact, not an implementation
  choice — `lastListenedAt < cutoff` → stale, `lastListenedAt >= cutoff` →
  recent (spec §21.3) — test a record exactly at the cutoff, immediately
  before it, and immediately after it; combining a new filter with an
  existing one (e.g. rating + genre); every existing test continuing to
  pass unmodified.
- `src/collection/CollectionBrowser.test.tsx` — new mounted tests for: the
  new sort options appear and are selectable; the new toggle(s) appear,
  toggle, and update the URL; "never played"/"not played recently" never
  render as true while `eventsStatus` is `'loading'`/`'error'` (mirroring the
  existing `playsLabel` loading/error test pattern already in this file); a
  Hebrew-titled record still renders correctly (`<bdi>`, `dir`, `lang`) in
  every new UI slot touched.

### Implementation order

1. Extend `collectionQuery.ts` types/constants/pure functions first, with
   their own unit tests green, before touching any JSX.
2. Wire `CollectionBrowser.tsx` controls + URL params.
3. Add/update mounted tests.
4. Manual local smoke (`npm run dev`, no deploy) with a mixed fixture
   (rated/unrated, played/never-played/stale, Hebrew + English) before
   opening the PR.

### Edge cases to cover explicitly

- `eventsStatus === 'loading'` and `'error'` must never produce a false
  "never played."
- A record with `rating: null` under the rating sort — **approved:** unrated
  records always sort last, in both "Rating (highest)" and "Rating
  (lowest)" (spec 0016 §21.2, human-approved 2026-09-14; consistent with the
  existing `yearSort`'s "unknown always sorts last" convention). Test both
  directions explicitly.
- A record played exactly at the 30-day cutoff timestamp — this boundary is
  **not** an implementation guess: it follows the curator's existing,
  already-approved `avoidRecentlyPlayed` contract (spec 0016 §21.3) — a play
  at or after the cutoff is "recent" and does **not** qualify as stale; only
  never-played or strictly-older-than-cutoff qualifies. Test exactly this
  boundary (one record at the cutoff instant, one just before, one just
  after).
- "Never played" and "stale" are mutually exclusive: selecting one clears
  the other; test that both cannot be simultaneously active via the URL
  params either (e.g. a hand-crafted `?listening=never&listening=stale`-style
  URL, however the approved single-enum param actually serializes, must not
  produce an inconsistent state).
- Combining the active listening filter with `favoritesOnly` and with an
  existing `CollectionFilters` field.
- Empty collection / zero events loaded.
- A Hebrew-titled record under every new sort/filter path.

### Automated gates

`git diff --check`; `npm run typecheck`; `npm run lint`; `npm run test:run`
(record file/test counts against the pre-PR-B baseline); `npm run build`. No
migration, so `npx supabase test db` / `db lint` are re-run only to confirm no
regression, not because a change is expected; `npm audit --omit=dev` must stay
0. No provider call anywhere in this gate.

### Independent review gate

A reviewer confirms: no file outside `src/collection/` (plus the one
`listeningSummary.ts` helper if used) changed; no new dependency; no schema
change; every §21.1–.5 decision was actually implemented as approved (not
reinterpreted); the boundary/edge cases above are covered by tests; existing
Hebrew/multilingual Collection tests still pass unmodified.

### Human acceptance checklist (spec §16)

On the existing production account, after merge + deploy: rating sort (both
directions if approved); the never-played filter; the stale (not-played-in-30-days)
filter, confirming selecting one clears the other (mutually exclusive, never
both active); the new listening-based sort, with never-played items ordered
as designed; combined with at least one existing filter; desktop + mobile;
grid + list view; at least one Hebrew-titled record visible and correctly
rendered. No AI/model call is required for this acceptance round.

### Stop conditions

Any of spec §18's general stop conditions, plus: if `collectionQuery.ts`
cannot stay dependency-free of the curator/dashboard modules without an
awkward re-export, stop and report rather than introducing a cross-feature
import silently.

**PR B is not "done" until this checklist passes on production and the human
confirms acceptance — PR C does not start before that.**

---

## PR C — Duplicate-copy UX restoration (Finding B)

**Depends on:** PR B independently reviewed, merged, deployed, and
human-accepted. (§21 decisions 6–7 are already human-approved — recorded
2026-09-14, spec 0016 §21.)

### Exact likely files

Runtime:
- A new, tiny, **pure** shared helper — e.g.
  `src/lib/catalog/ownedRelease.ts` exporting
  `isExactCatalogReleaseOwned(providerReleaseId, ownedItems)` (or an
  equivalent shared derivation of the owned-`providerReleaseId` set). No
  JSX, no state, no state machine — a pure function only, so Discover and
  Scan can never again silently drift on what counts as "already owned"
  (per §21.7's approved shape — the smallest shared piece, shared
  *semantics* not shared *state*). Confirmation/dialog state (open/closed,
  in-flight, error) is written **independently, locally**, inside each of
  `DiscoverPanel.tsx` and `ScanPanel.tsx` — plain `useState`, matching how
  each surface already manages its own local add/error state today. Do not
  introduce a shared stateful hook or shared confirmation component unless
  writing the two local implementations reveals near-identical code that
  makes a shared *stateless* extraction obviously worthwhile — even then,
  keep it presentation-free.
- `src/catalog/DiscoverPanel.tsx` — replace the current
  `owned ? <span>In your collection</span> : <Button>Add</Button>` branch with:
  owned → "already owned" indicator **and** an "Add another copy" button →
  local confirmation state → `Dialog` → confirm calls the existing
  `add(candidate)` path.
- `src/catalog/ScanPanel.tsx` — add an `ownedItems` prop (currently absent),
  use the shared `isExactCatalogReleaseOwned` helper, and apply the
  identical already-owned / confirm-to-add-another pattern (with its own
  local confirmation state) to the candidates step.
- Wherever `ScanPanel` and `DiscoverPanel` are mounted (their parent page
  components) — pass the already-loaded owned collection data through as a
  prop, mirroring how Discover already receives it today.

Tests:
- `src/catalog/DiscoverPanel.test.tsx` — new cases: already-owned renders the
  indicator + "Add another copy"; cancel makes zero calls to
  `addCatalogReleaseToCollection`; confirm makes exactly one call; the
  not-owned path is unchanged (existing tests keep passing).
- `src/catalog/ScanPanel.test.tsx` — the same three cases, newly added since
  Scan has none of this today; the not-owned path (existing tests) keeps
  passing.
- A small unit test file for the shared pure helper
  (`isExactCatalogReleaseOwned` — owned/not-owned/empty-owned-set cases) is
  worthwhile given it is now the single source of truth both surfaces rely
  on for a security/product-correctness-adjacent check.

### Implementation order

1. Write the shared pure helper + its own unit tests first, in isolation —
   no state, no JSX.
2. Wire it into Discover (the surface that already has `ownedItems`) first,
   with confirmation state written locally in `DiscoverPanel.tsx`; get its
   mounted tests green.
3. Add `ownedItems` to Scan's props and wire the identical pattern, with its
   own local confirmation state in `ScanPanel.tsx`; get its mounted tests
   green.
4. Manual local smoke: add a record, then attempt to add it again through
   both Discover and Scan, confirming the dialog, the count, and the delete
   isolation (delete one copy, confirm the other survives) — no deploy.

### Edge cases to cover explicitly

- Two already-owned copies exist; deleting one via the existing Album Detail
  remove flow leaves exactly one, and Discover/Scan's "owned" check still
  reflects at least-one-owned correctly afterward.
- Rapid double-click / double-submit on "Add another copy" does not create
  two rows (reuse whatever in-flight/disabled-button guard the existing
  single add path already uses).
- A Hebrew-titled already-owned candidate renders the new state correctly
  with existing `BidiText` isolation.
- A failed confirm (network/provider error) shows the surface's existing
  error pattern, not a new one, and leaves the owned/confirming state
  recoverable (user can retry or cancel).

### Automated gates

Same list as PR B's gate section. No schema change expected — pgTAP/db-lint
re-run to confirm no regression. No provider call in any test (all
`addCatalogReleaseToCollection`/`searchCatalog` calls mocked, exactly like
the existing `DiscoverPanel.test.tsx`/`ScanPanel.test.tsx` patterns).

### Independent review gate

A reviewer confirms: identical contract in both surfaces (no drift between
Discover's and Scan's copy/behavior beyond what each surface's existing
layout requires); no backend/schema file touched; the ownership check is
actually the one shared pure helper (not two independent near-duplicate
implementations); confirmation/dialog state stayed local to each surface —
no new shared stateful hook/component was introduced beyond what §21.7
approved; mounted tests exist for both surfaces covering
not-owned/cancel/confirm.

### Human acceptance checklist (spec §16)

On the existing production account, using a record already owned once:
Discover already-owned state (real MusicBrainz search, as Discover already
requires today) → cancel (collection count unchanged) → confirm (exactly one
new copy appears) — then the same sequence in Scan, which requires exactly
one deliberate real Vision recognition to reach its candidate list (unless
an already-existing production state truthfully covers it) plus the normal
MusicBrainz call Scan already makes. Include a Hebrew-titled release in the
exercised set if one is available in the catalog for the test record. **No**
curator call is part of this acceptance — this finding does not touch the
curator. Automated verification for PR C stays zero-provider (mocked/
fixture); this bounded budget applies to human production acceptance only.

### Stop conditions

Spec §18's general stop conditions, plus: if giving `ScanPanel` an
`ownedItems` prop forces a broader prop-drilling change through its mount
point than a single new prop, stop and report the actual shape needed rather
than restructuring the page tree.

**PR C is not "done" until this checklist passes on production and the human
confirms acceptance — PR D does not start before that.**

---

## PR D — Final repository reconciliation / closeout

**Depends on:** PR C independently reviewed, merged, deployed, and
human-accepted (which itself required PR B's own acceptance first — both
runtime PRs are complete and accepted before PR D begins).

**Documentation only.** No runtime, test, CSS, config, or dependency file.

### Exact documentation categories to reconcile

1. `intent.txt` §4.3 — state the overlay-based metadata-control architecture
   truthfully (Finding C). Minimal edit; preserve the original wording's
   intent as historical context per this project's own rule (never delete
   historical planning reasoning — see `AGENTS.md`).
2. `README.md` — advance "Current state" to name, distinctly: the repository/
   documentation HEAD at PR D time, the final accepted production runtime SHA
   (which will be PR C's merge SHA unless something else has shipped between
   PR C and PR D), and the final accepted production deploy ID that actually
   exists at PR D's own time — never predicted in advance. Fix the
   listening-history capabilities bullet to state the M8-then-Visual-pass
   chronology (Finding E/H), matching the wording the Data Model section of
   the same file already gets right.
3. `docs/roadmaps/2026-09-02-complete-project-roadmap.md` — add the real
   post-M12 evolution: the Hebrew & Multilingual Record Support enhancement
   (PR #22 planning through PR #28 closeout) and this final-submission
   remediation (PR A–D), each represented as deliberate later evolution, not
   backdated into the original plan (Finding D). **Never** edit
   `docs/roadmaps/2026-08-18-complete-project-roadmap.md`
   (`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`).
4. `docs/specs/README.md` — correct spec 0013's status to reflect that M11
   shipped; add the missing spec 0014 (M12) entry; remove or clearly relabel
   the stale "Likely milestone specs" placeholder list so it cannot be
   mistaken for current planning (Finding F).
5. `docs/decisions/README.md` and `docs/decisions/0003-openrouter-vision-provider.md`'s
   own status header — move ADR 0003 out of "proposed/pending" into
   "accepted," reflecting that Milestone 5 approved and shipped it; remove
   the now-resolved items from "Initial decisions still pending" (duplicate
   representation, conversation-state persistence), citing where each was
   actually resolved (Finding F).
6. `docs/verification.md` — advance the top "Last updated" metadata line;
   add the PR B and PR C automated-gate + human-acceptance evidence (using
   the real evidence gathered during those PRs, not invented here); add or
   correct the `listening_events` mutability wording everywhere it appears
   in this file (Finding G/H).
7. Any other current architecture/product doc **only if** reconciling 1–6
   above reveals it is genuinely stale as a direct, provable consequence —
   not a general sweep. Report which, if any, and why.

### Rules against retrospective history rewriting

- Never edit `docs/roadmaps/2026-08-18-complete-project-roadmap.md`.
- Never alter an existing spec/plan/ADR Rev-log entry, closeout section, or
  recorded human-acceptance result for a milestone that already shipped —
  add new entries, don't rewrite old ones.
- Never state that Findings A–H (or this remediation) were part of the
  original project plan — they are documented as a later, deliberate,
  audit-triggered correction, exactly like the Visual Experience pass and
  the Hebrew enhancement were each documented as deliberate later evolution
  in their own time.
- Record only SHAs/deploy IDs/dates that actually exist at the time PR D is
  written — never a predicted or placeholder value.

### Gate

`git diff --check`; `git diff --name-only` limited to the categories above;
no `src/`, `netlify/`, `supabase/`, CSS, test, package, env, or config path;
historical roadmap hash unchanged
(`cca3d3c864f213bd25844ff96372e870a411b21be6464c26c68d1bc4127b26a4`). No
provider call. No runtime test run is required solely because documentation
changed.

### Independent review gate

A reviewer confirms every current-state claim in the touched documents is
true as of PR D's own head, every historical claim is preserved, the
2026-08-18 roadmap is untouched, and no scope beyond the categories above was
touched.

**Done when:** independently reviewed and merged. No further PR is implied by
this plan; this closes the remediation.

---

## Gates (reference table)

| PR | Runtime? | Tests? | Migration? | Automated provider calls? | Deploy required? |
|---|---|---|---|---|---|
| A (this) | no | no | no | no | no |
| B | yes (`src/collection/*`) | yes, mocked/fixture | no | no | yes, before human acceptance |
| C | yes (`src/catalog/*`) | yes, mocked/fixture | no | no | yes, before human acceptance |
| D | no | no | no | no | no |

**Automated provider calls are zero for every PR, including PR B and PR C —
implementation and every automated test/gate above use only mocks/fixtures.**
This is distinct from *human production acceptance*, where PR C is
intentionally not provider-free: normal MusicBrainz calls (Discover and Scan
already make them today) plus exactly one bounded real Vision recognition for
the Scan acceptance scenario are allowed/expected, per spec §16 — no curator
call is part of PR C's acceptance. PR B's human acceptance requires no
AI/model call of any kind.

## Sequencing (restated for an executing agent)

**PR B acceptance completes before PR C implementation begins. PR C
acceptance completes before PR D closeout begins.** Do not open PR C's
branch before PR B's human-acceptance checklist has actually passed on
production. Do not open PR D's branch before PR C's has.

## Final execution status (2026-09-15)

This sequencing was followed exactly: PR A (#29) merged →
PR B (#30) implemented, independently reviewed, merged, deployed,
human-accepted (Finding A CLOSED) → PR C (#31) implemented, independently
reviewed, merged, deployed, human-accepted (Finding B CLOSED) → PR D, this
documentation-only reconciliation of Findings C–H. Full evidence:
`docs/verification.md` → "Final Submission Alignment Evidence";
`docs/specs/0016-final-submission-alignment.md` §22. The accepted production
runtime remains PR C's merge, `81812c1f52d56bea84e142d828dd1e1427a0ec4b`
(deploy `6aa8783d1835a5e433449dd4`); PR D changes no runtime file.
