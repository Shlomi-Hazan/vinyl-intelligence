# Feature Specifications

Use this directory for precise, checkable specs before meaningful implementation work.

A useful spec should include:

- User outcome
- In-scope behavior
- Out-of-scope behavior
- User flow
- Backend behavior
- Database implications
- External API implications
- AI/model behavior, if any
- Error states
- Acceptance criteria
- Verification steps

Existing specs/spikes:

- [0001 Music Catalog API Spike](0001-music-catalog-api-spike.md)
- [0002 Milestone 1 Stack Scaffold](0002-milestone-1-stack-scaffold.md)
- [0003 Milestone 2 Supabase Auth + Profile RLS](0003-milestone-2-supabase-auth-profile-rls.md)
- [0004 Milestone 3 Manual Collection CRUD](0004-milestone-3-manual-collection-crud.md)
- [0005 Milestone 4 Catalog API](0005-milestone-4-catalog-api.md)
- [0006 Milestone 5 Photo Recognition](0006-milestone-5-photo-recognition.md) - implemented and verified (merged)
- [0007 Milestone 6 Browse / Search / Filter](0007-milestone-6-browse-search-filter.md) - implemented and verified (merged)
- [0008 Milestone 7 Ratings / Favorites / Notes](0008-milestone-7-ratings-favorites-notes.md) - implemented and verified (merged)
- [0009 Milestone 8 Listening History](0009-milestone-8-listening-history.md) - implemented and verified (merged in PR #8)
- [0010 Milestone 9 AI Curator](0010-milestone-9-ai-curator.md) - implemented and verified (human runtime PASS 5/5); merged in PR #10
- [0011 Milestone 10 Conversational Refinement](0011-milestone-10-conversational-refinement.md) - implemented and verified (human runtime PASS 4/4); merged in PR #11
- [0012 Visual Experience & Product Identity Pass](0012-visual-experience-product-identity.md) - inserted product-quality pass before Milestone 11. **Phases A-E complete + human-accepted; merged to `main` in PR #13** (Phase 0 was merged earlier in PR #12).
- [0013 Milestone 11 Production Deployment](0013-milestone-11-production-deployment.md) - **COMPLETE** - implemented and production-deployed. Netlify + hosted Supabase deployment; two small pre-deploy AI-hardening items (curator out-of-scope, vision prompt-injection) shipped. M11 completed at `main` `55f514c20be15b9f2656aa1d534598b9938e7396` (PR #14 → #15 → #16). Plan: `docs/plans/013-milestone-11-production-deployment.md`.
- [0014 Milestone 12 Final Hardening](0014-milestone-12-final-hardening.md) - **COMPLETE** - implemented, human-accepted, in production. Verification + documentation-reconciliation pass; human production acceptance (2026-09-07) surfaced two real runtime defects, each fixed on its own reviewed PR (PR #19, PR #20), merged, deployed, and re-verified. Final accepted `main` `c2037b8a09b10da796fa2435f268f316f7bb8442`. Plan: `docs/plans/014-milestone-12-final-hardening.md`.
- [0015 Hebrew & Multilingual Record Support](0015-hebrew-multilingual-record-support.md) - **COMPLETE**, human-accepted in production. Post-M12 enhancement: local BiDi handling, Hebrew-aware search/sort, canonical Hebrew/English genre taxonomy shared by Collection/Dashboard/VIN, Vision original-script preservation, Hebrew-readable small-card typography. Implemented across PR #23, #24, #25, #26, #27; final accepted `main` `59fe823646091b6189fc1a015c7209fbe1f8105b`. Plan: `docs/plans/015-hebrew-multilingual-record-support.md`. Decision: `docs/decisions/0007-hebrew-multilingual-record-support.md`.
- [0016 Final Submission Alignment](0016-final-submission-alignment.md) - PR A (planning, PR #29) merged; **Finding A merged, deployed, and human-accepted** (PR #30, `main` `2430230af12e89b61ac9a54da81ef31e1ad59ad3`, deploy `6aa86ad76bc83b77bc42c651`, acceptance PASS 2026-09-15); **Finding B merged, deployed, and human-accepted** (PR #31, `main` `81812c1f52d56bea84e142d828dd1e1427a0ec4b`, deploy `6aa8783d1835a5e433449dd4`, acceptance PASS 2026-09-15); Findings C-H (documentation reconciliation) are addressed by the PR D documentation-only change represented in current repository/Git history. Narrowly-scoped post-completion remediation triggered by an independent final audit; not a new milestone. Plan: `docs/plans/016-final-submission-alignment.md`.
- [0017 Discover & MusicBrainz Navigation Enhancement](0017-discover-musicbrainz-navigation-enhancement.md) - **RUNTIME COMPLETE, MERGED, DEPLOYED; §23 HUMAN PRODUCTION ACCEPTANCE COMPLETE; PR C documentation closeout MERGED.** A deliberate, human-requested post-freeze usability enhancement (explicit search modes, bounded pagination, an exact MusicBrainz-release-URL lookup, outbound MusicBrainz navigation, and a Record Detail provenance link), discovered during real hands-on final-submission product use - not a new milestone, not an AI feature, no schema/dependency change. Implemented and independently corrected in PR #36 (2 MEDIUM findings fixed); final `main` `abff1e86cbc36c754e8645179fa5bbee9ec27afe`, deploy `6aaa63fe2829c87037fd2cd0`. An 8-step human production smoke passed 2026-09-16, and the remaining spec §23 checks were completed in a second round the same day - all 22 items now have sufficient evidence, §23 acceptance is COMPLETE - see `docs/verification.md` → "Discover & MusicBrainz Navigation Enhancement Evidence" for the full matrix and both rounds' record. Final independent pre-tag audit COMPLETE / PASS (0 BLOCKER / 0 HIGH / 0 MEDIUM) - all of spec §27's Definition of Done is satisfied except its final step: the merged repository commit is the intended target for a new annotated final-submission tag, `ase26-final-submission-2026-09-16`, created only as a separate, external Git-ref action after PR #38 merges - verify the tag's existence/target directly from Git refs. Plan: `docs/plans/017-discover-musicbrainz-navigation-enhancement.md` (PR #35). Documentation closeout (PR C): PR #37, merged (`f347be94daa0e7e4e20e849d8dbcf8b0962840f6`).
- [0018 Discogs Secondary Catalog Provider](0018-discogs-secondary-catalog-provider.md) - **IMPLEMENTED, MERGED, MIGRATION APPLIED, DEPLOYED.** A deliberate, human-requested post-freeze enhancement adding Discogs as an explicit, secondary catalog provider alongside MusicBrainz (MusicBrainz remains primary/default; no OAuth, no Marketplace, no combined-provider ranking/deduplication). Implemented and independently corrected across two review rounds in PR #41; final `main` `b73d7a79769ddd7a1d4a109945eda301fca5f605`, migration `20260917120000_add_discogs_catalog_provider.sql` applied to the hosted project, deployed to production. Several of this spec's own UX/artwork decisions were superseded immediately afterward by real production acceptance - see 0019 below; the body of this spec is preserved unedited as the historical record. Plan: `docs/plans/018-discogs-secondary-catalog-provider.md`. Decision: `docs/decisions/0008-discogs-secondary-catalog-provider.md`.
- [0019 Discogs Discover UX and Provider Artwork](0019-discogs-discover-ux-and-artwork.md) - **IMPLEMENTED.** A focused follow-up to 0018, triggered by real human production acceptance: one shared Discogs/MusicBrainz search area (MusicBrainz still default), a direct (no client-side preview popup) first-add for an unowned Discogs result while the duplicate-copy confirmation is kept, exact Discogs release URL import, compact (not large-block) Discogs attribution presentation, and a new persisted-URL-only Discogs provider-artwork feature (no image binaries stored, gated by the existing six-hour freshness boundary). One new migration, `20260918120000_add_discogs_provider_image.sql` (nullable `provider_image_url`, Discogs-scoped). Plan: `docs/plans/019-discogs-discover-ux-and-artwork.md`.
