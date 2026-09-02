# 0006 Listening-Event Mutability & Optional Profile Avatar

Status: **accepted** 2026-09-02 (human Phase D approval, spec `0012`,
Visual Experience & Product Identity pass). Implemented on branch
`claude/visual-experience-product-identity-ui`, **not merged**; migrations
`20260904120000`, `20260904121000`, `20260904122000` applied locally only,
**not** to hosted Supabase.

Date: 2026-09-02

## Context

Phase D of the Visual Experience pass rebuilds History, Album Detail, and
Settings into deep product surfaces. Three data-layer questions surfaced that
change or extend earlier milestone contracts and therefore need a record:

1. **Milestone 8 shipped `listening_events` as append-only** - the browser can
   `INSERT` a play and `SELECT` its own, nothing else. The redesigned History
   journal wants to let a collector fix a wrong play time and remove an
   accidental play. Does M8's deliberate immutability still hold?
2. **Finding 8D-2:** Album Detail exposed the generic "edit metadata" form for
   MusicBrainz catalog releases. Saving a genre failed, because catalog releases
   are `source='catalog'` / `created_by=NULL` and the browser `UPDATE` policy on
   `public.releases` only permits `created_by = auth.uid() AND source='manual'`.
   How should a collector add genre information to a catalog record?
3. **Optional profile photo** - Settings needs a profile section. Should the
   product carry user-uploaded avatars, and if so with what storage/security
   model?

## Decision

### 1. Owner-scoped `listened_at` correction and play deletion - yes, minimally

M8's append-only stance was the right default and its history is **not
rewritten**. Phase D supersedes only the minimum:

- a **column-scoped** `UPDATE (listened_at)` grant (never id, user_id,
  collection_item_id, or created_at) and a `DELETE` grant, both to
  `authenticated` only;
- own-row RLS policies for `UPDATE` and `DELETE` (`user_id = auth.uid()`);
- `anon` gets neither.

A listen can therefore never be re-pointed at another album or another user, and
a collector can only touch their own plays. This is a correction affordance, not
a general edit surface.

### 2. User-owned personal genres, not weakened catalog RLS

Catalog metadata stays **read-only** to the browser - the shared `releases` row
that many collectors reference must not be mutable by any one of them. Instead,
`collection_items` gains `personal_genres text[] not null default '{}'`
(owner-scoped by the existing M7 collection-item RLS, column-scoped `UPDATE`
grant, CHECK reusing `public.release_genres_valid`). The UI shows catalog genres
as read-only chips and "Your genres" as editable chips. Browsing and filtering
use **effective genres** = the union of `release.genres` and `personal_genres`,
computed client-side; neither source is mutated. The Album Detail edit form is
shown only for manual releases; catalog releases show an explanation instead of
a form RLS would reject.

### 3. Optional profile avatar - private bucket, initials always the fallback

`profiles` gains `avatar_path` / `avatar_updated_at` (nullable; canonical
`{userId}/avatar.webp` CHECK bound to the row's own id; column-scoped grant).
A private `profile-avatars` bucket (webp only, 1 MiB) holds one canonical object
per user, with four owner-isolated `storage.objects` policies **modelled
directly on the Phase 0 custom-cover storage architecture** (0005). The browser
normalises any JPEG/PNG/WebP to a centre-cropped ~512px WebP client-side (no
external service, no cropping dependency) and uploads it directly; RLS + bucket
config are the authority.

The signed URL is treated as a **bearer credential**: memory-only cache with an
early re-sign margin, and it is **never** written to the profile row,
`localStorage`, `sessionStorage`, a log, telemetry, or an error message.

**Initials are the default and the fallback in every state** - no photo, URL
still resolving, signing failed, or the `<img>` itself errored. A broken-image
glyph is never shown. One shared `UserAvatar` component owns photo + initials +
circle geometry + failed-image fallback and is the only avatar renderer in the
app (AppShell topbar, sidebar account control expanded + collapsed rail,
Settings preview). `AuthProvider.refreshProfile()` propagates a mutation to
every avatar without a reload.

The avatar is a **human-approved Phase D extension**, not a course requirement;
it must never become mandatory.

## Consequences

- `listening_events` is no longer strictly append-only, but the browser's write
  surface is still tightly bounded (one mutable column + own-row delete). pgTAP
  proves the negative cases (cannot touch other columns, other users' rows, or
  as anon).
- A record can now carry genre information the catalog lacks without any shared
  data being mutated; recommendations that read genres will see the richer set
  once VIN integration is done (**deferred** - it would touch the
  `curator-handlers.mts` Netlify function / M9-M10 candidate contract; section
  8D-2.F permits deferral).
- One new private bucket and one new (small) stored object per user who opts in.
  Orphan-object cleanup on account deletion is an existing gap tracked for a
  later sweep function (same as custom covers).
- Three forward migrations; hosted application of all Phase D migrations is a
  Milestone 11 / deployment step, not done here.

## Alternatives considered

- **Keep `listening_events` fully immutable; delete + re-add to "edit".** Worse
  UX (loses `created_at`, needs a DELETE grant anyway) for no security gain.
- **Let the browser UPDATE catalog `releases` when it only adds genres.** Any
  per-user write to a shared row is a data-integrity and abuse risk; rejected.
- **Store personal genres as a manual-release clone per user.** Duplicates
  catalog rows, breaks the release-level identity the catalog provides.
- **Public avatar bucket / avatar URL persisted on the profile row.** Simpler,
  but leaks a stable public URL for every user's face and diverges from the
  established custom-cover private-bucket + signed-URL model; rejected.
- **A cropping library (react-easy-crop etc.) or an image CDN.** Unnecessary
  dependency / third-party request; a deterministic centre-crop on a canvas is
  enough for a small avatar.
- **No avatar at all (initials only).** Considered and acceptable; the human
  approved the optional photo as long as initials stay the default and fallback.
