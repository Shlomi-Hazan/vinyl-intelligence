# 🔎 Vinyl Intelligence — Visual Inspect

*A fast reviewer walkthrough of the final product.*

If you have five to ten minutes to inspect this project, this is the path: nine stops, each pointing at the strongest evidence for one claim the project makes. For the full contract see [`../SPEC.md`](../SPEC.md); for step-by-step usage see [`USER_GUIDE.md`](USER_GUIDE.md); for the complete engineering evidence trail see [`verification.md`](verification.md).

Live application: **<https://vinyl-intelligence.netlify.app>**

## Table of Contents

1. [Dashboard — deterministic stats, AI entry points](#1-dashboard--deterministic-stats-ai-entry-points)
2. [Collection controls — Finding A evidence](#2-collection-controls--finding-a-evidence)
3. [Record detail — the metadata boundary](#3-record-detail--the-metadata-boundary)
4. [Duplicate-copy handling — Finding B evidence](#4-duplicate-copy-handling--finding-b-evidence)
5. [Scan — vision privacy and confirm-before-save](#5-scan--vision-privacy-and-confirm-before-save)
6. [VIN — the recommendation boundary](#6-vin--the-recommendation-boundary)
7. [History — Hebrew rendering + owner-scoped correction](#7-history--hebrew-rendering--owner-scoped-correction)
8. [Mobile — responsive, no overflow](#8-mobile--responsive-no-overflow)
9. [Where to go deeper](#9-where-to-go-deeper)

---

## 1. Dashboard — deterministic stats, AI entry points

<p align="center"><img src="assets/inspect/01-dashboard-overview.png" alt="Annotated Dashboard" width="820"></p>

**What to inspect:** the four stat cards (records, favorites, played in 30 days, never-played) are derived directly from the collection and listening tables — nothing here is AI-guessed. "Quick VIN" and "Quick actions" are the two on-ramps into AI-assisted flows (curator, vision recognition); both are optional, never required to use the app.

## 2. Collection controls — Finding A evidence

<p align="center"><img src="assets/inspect/02-collection-controls.png" alt="Annotated Collection filters" width="820"></p>

**What to inspect:** minimum-rating filter, rating sort (both directions, unrated always last), and two mutually-exclusive listening-recency filters ("Never played" / "Not played in 30 days") plus a "Least recently played" sort. This is the exact capability the Final Submission Alignment's Finding A restored — see [`specs/0016-final-submission-alignment.md`](specs/0016-final-submission-alignment.md) and the "Final Submission Alignment Evidence" section of [`verification.md`](verification.md) for the independent-review correction history and human-acceptance record.

## 3. Record detail — the metadata boundary

<p align="center"><img src="assets/inspect/03-record-detail.png" alt="Annotated record detail" width="820"></p>

**What to inspect:** catalog genres are read-only chips (shared MusicBrainz data); "Your genres" is a separate, editable, owner-scoped overlay. This is the concrete UI evidence for the deterministic/shared-vs-owned data boundary described in [`../SPEC.md`](../SPEC.md) §30/§32 and [ADR 0006](decisions/0006-listening-event-mutability-and-profile-avatar.md).

## 4. Duplicate-copy handling — Finding B evidence

<p align="center"><img src="assets/inspect/04-duplicate-copy-handling.png" alt="Annotated duplicate-copy dialog" width="700"></p>

**What to inspect:** the exact approved confirmation copy, captured live against a real already-owned MusicBrainz release. This is Finding B's restored contract — an already-owned release is disclosed honestly, never blocked, and a second physical copy requires exactly one intentional confirmation. Cancel makes zero writes; Confirm creates exactly one row. Identical behavior exists in Scan. Full independent-review chronology (including the corrected post-add stale-ownership race) is in `verification.md`.

## 5. Scan — vision privacy and confirm-before-save

<p align="center"><img src="assets/inspect/05-scan-vision-privacy.png" alt="Annotated Scan page" width="820"></p>

**What to inspect:** the four-step progress indicator (Photo → Analyse → Catalogue → **Confirm**) makes the "never auto-added" contract visible in the UI itself, and the privacy note under the drop zone states the photo is never saved. This screenshot is deliberately captured **before** any analysis is triggered — no Vision API call was made to produce this documentation.

## 6. VIN — the recommendation boundary

<p align="center"><img src="assets/inspect/06-vin-owned-only.png" alt="Annotated Ask VIN page" width="820"></p>

**What to inspect:** the explicit on-screen guarantee ("VIN recommends only from records you own") and the bounded input (800-character cap, live counter). The enforcement itself is server-side, not just a UI promise — see [`../SPEC.md`](../SPEC.md) §25 and the candidate-validation code referenced in `verification.md`'s AI/curator evidence. This screenshot is captured **before** any request is sent — no OpenRouter call was made to produce this documentation.

## 7. History — Hebrew rendering + owner-scoped correction

<p align="center"><img src="assets/inspect/07-history-hebrew.png" alt="Annotated listening history" width="820"></p>

**What to inspect:** a real Hebrew-titled play logged alongside English ones, rendering correctly without breaking the row layout, next to the owner-scoped **Edit time** / **Delete** controls that ADR 0006 deliberately and minimally added on top of the originally-append-only listening log.

## 8. Mobile — responsive, no overflow

<p align="center"><img src="assets/inspect/08-mobile-responsive.png" alt="Annotated mobile Collection view" width="420"></p>

**What to inspect:** the same Collection filters stack vertically with no horizontal overflow, and primary navigation collapses into a bottom tab bar — evidence for the Visual Experience & Product Identity pass's responsive requirement.

## 9. Where to go deeper

| Question | Where to look |
| --- | --- |
| What exactly is the product contract? | [`../SPEC.md`](../SPEC.md) |
| How do I use every screen? | [`USER_GUIDE.md`](USER_GUIDE.md) |
| What's the system architecture? | [`architecture.md`](architecture.md) |
| What AI models are used, and how are they bounded? | [`ai-design.md`](ai-design.md) |
| What's the database schema and RLS posture? | [`data-model.md`](data-model.md), [`security.md`](security.md) |
| What was actually verified, and by whom? | [`verification.md`](verification.md) |
| How did the project evolve, milestone by milestone? | [`roadmaps/2026-09-02-complete-project-roadmap.md`](roadmaps/2026-09-02-complete-project-roadmap.md) |
| What did the *original* plan look like before implementation? | [`roadmaps/2026-08-18-complete-project-roadmap.md`](roadmaps/2026-08-18-complete-project-roadmap.md) (preserved unchanged) |
| Every milestone spec / ADR | [`specs/README.md`](specs/README.md) · [`decisions/README.md`](decisions/README.md) |

No screenshot in this guide or in [`USER_GUIDE.md`](USER_GUIDE.md) triggered a real Vision or curator model call — every AI-adjacent screen was captured in its safe, pre-call state, exactly as a cost-conscious reviewer would want.
