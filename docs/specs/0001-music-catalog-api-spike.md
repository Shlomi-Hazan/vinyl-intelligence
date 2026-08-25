# 0001 Music Catalog API Spike

Status: dispositioned for M4 - MusicBrainz-first approved; remaining Discogs
empirical comparison deferred by explicit human decision

Original gate:

When this spike was created, it was required to be completed before catalog
implementation. The 2026-08-25 human disposition recorded below explicitly
satisfies that gate for Milestone 4 by approving MusicBrainz-first and deferring
the remaining Discogs empirical comparison.

## Objective

Compare Discogs and MusicBrainz against Vinyl Intelligence's actual catalog requirements and choose a provider based on evidence, not preference.

## Requirements

The chosen provider must support the first catalog-add flow well enough to:

- Search by artist and album/release title.
- Return release-level identifiers.
- Return master/release-group identifiers where available.
- Provide artist, album title, release title or edition, release year, label, country, format, tracklist, genre/style, cover reference, and external URL where available.
- Support an album-first UI while preserving release-level IDs in the database.
- Work safely through Netlify Functions without exposing credentials in the browser.
- Fit a deployed university demo in terms of authentication, rate limits, and terms.

## Sample Searches

Use the same searches for both providers:

- One widely known classic rock album.
- One jazz album with multiple releases.
- One 1990s album.
- One record where edition/release ambiguity is likely.

Record the exact queries used in the completed spike.

## Comparison Rubric

Evaluate each provider on:

- Search result relevance.
- Release disambiguation quality.
- Metadata completeness.
- Genre/style usefulness for filtering and AI recommendations.
- Cover image availability and permitted usage.
- Authentication and secret handling.
- Rate limits and fair-use requirements.
- Response shape and normalization complexity.
- Error/no-match behavior.
- Suitability for Netlify Functions.

## Output Required

The completed spike must include:

- Primary provider recommendation.
- Whether a fallback provider is justified.
- Known gaps and mitigation.
- Example normalized candidate shape.
- Example normalized release shape.
- Acceptance criteria for the catalog integration milestone.

## Non-Goals

- Do not build the catalog integration during the spike.
- Do not add both providers merely to increase API count.
- Do not choose a provider before verifying current official documentation and sample responses.

## Execution Status - 2026-08-20

The spike gate remains active. MusicBrainz was exercised through the current
official read-only API. Discogs was not empirically exercised because the
official developer page returned an automated-access `403` Cloudflare challenge,
and no Discogs credential or current official API reference was available in
this workflow.

Spike status before the 2026-08-25 human disposition:

`IN PROGRESS - BLOCKED ON CURRENT DISCOGS DEVELOPER/API VERIFICATION`

This section records the evidence currently available without treating the spike
as complete. Before the 2026-08-25 human disposition, Milestone 4 implementation
could not begin until this spike was either completed according to the original
rubric or explicitly dispositioned by the human with a recorded reason for
accepting a MusicBrainz-first path without the remaining Discogs empirical
comparison.

### Exact Sample Searches

The same semantic searches are selected for both providers:

1. Widely known classic-rock album:
   `artist:"Pink Floyd" AND release:"The Dark Side of the Moon"`
2. Jazz album with many editions:
   `artist:"Miles Davis" AND release:"Kind of Blue"`
3. 1990s album:
   `artist:"Radiohead" AND release:"OK Computer"`
4. Release/edition ambiguity case:
   `artist:"The Beatles" AND release:"Abbey Road"`

MusicBrainz query shape used:

```text
https://musicbrainz.org/ws/2/release/?query=<exact query>&fmt=json&limit=5
```

User-Agent used for planning requests:

```text
VinylIntelligence/0.1 (planning@example.invalid)
```

The equivalent Discogs semantic searches should use the same artist/title
intent. Exact Discogs API query syntax remains unverified because the official
developer reference was not accessible through this workflow.

### MusicBrainz Empirical Results

#### Pink Floyd - The Dark Side of the Moon

Query:
`artist:"Pink Floyd" AND release:"The Dark Side of the Moon"`

MusicBrainz returned `152` releases. Useful observed examples:

- Release MBID `24824319-9bb8-3d1e-a2c5-b8b864dafd1b`, release-group MBID
  `f5093c06-23e3-404f-aeaa-40f72885ee3a`, US, 1973, Harvest, catalog
  `SMAS-11163`, `12" Vinyl`.
- Release MBID `3fde611f-de09-46c9-8233-731b3e2ed76f`, same release-group,
  Yugoslavia, 1973, Harvest, catalog `LQEMI-73009`, `12" Vinyl`,
  disambiguation `quadraphonic`.
- A bootleg and a live/withdrawn digital result also appeared in the top five,
  so user confirmation and status/disambiguation display are required.

Search usefulness:

- Strong release-level and release-group IDs.
- Good edition disambiguation through country, date, label, catalog number,
  format, status, and disambiguation.
- Multiple plausible results mean automatic persistence is unsafe.

#### Miles Davis - Kind of Blue

Query:
`artist:"Miles Davis" AND release:"Kind of Blue"`

MusicBrainz returned `135` releases. Useful observed examples:

- Release MBID `e32a3f0b-1c19-3170-bb1c-650893774744`, release-group MBID
  `8e8a594f-2175-38c7-a871-abb68ec363e7`, US, 1987, Columbia, catalog
  `CK 40579`, CD.
- Release MBID `e8324f18-31cd-4a2f-877b-08affdccfff1`, same release-group,
  US, 2004, Columbia, catalog `CN 90887`, DualDisc.
- Release MBID `375526b3-aa4a-4cf5-9078-e3688a229dd4`, same release-group,
  US, 1987, Columbia, catalog `CJ 40579`, `12" Vinyl`, promotion status.

Search usefulness:

- Good demonstration of edition density and release-group grouping.
- Useful release metadata appears in search results.
- Some edition details still require user judgment.

#### Radiohead - OK Computer

Query:
`artist:"Radiohead" AND release:"OK Computer"`

MusicBrainz returned `38` releases. Useful observed examples:

- Release MBID `4b3d18cc-8937-36f4-8de0-481088be58e6`, release-group MBID
  `b1392450-e666-3926-a536-22c65f834433`, Canada, 1997-06-17, EMI Music
  Canada, catalog `7243 8 55229 2 5`, CD.
- Release MBID `541a0976-ca45-3c0f-89e5-26bc376f58d1`, same release-group,
  UK, 1997-06-16, Parlophone, catalog `NODATA 02`, two `12" Vinyl` media.
- Release MBID `9c1e5e9e-9f40-4cd8-94a4-785fa5d0b613`, same release-group,
  Poland, 1997, Parlophone, catalog `7243 8 55229 4 9`, cassette.

Search usefulness:

- Strong enough to distinguish country/format/catalog variants.
- Release-group MBID cleanly groups the album across releases.

#### The Beatles - Abbey Road

Query:
`artist:"The Beatles" AND release:"Abbey Road"`

MusicBrainz returned `94` releases. Useful observed examples:

- Release MBID `cf754b8b-fc50-47b5-b460-a94c61b2fef3`, release-group MBID
  `9162580e-5df4-32de-80cc-f45a8d8a9b1d`, worldwide, 2019-09-27, UMC,
  digital media, disambiguation `remastered`.
- Release MBID `c15a59e7-194c-437d-b8b0-c2eaebd806c2`, same release-group,
  US, 1976, Capitol Records, catalog `SO-383`, `12" Vinyl`.
- Release MBID `e50d234a-3737-4f57-a363-0ce3b083d80f`, same release-group,
  Europe, 1992, Apple/Parlophone, catalog `CDP 7 46446 2`, CD,
  disambiguation `Europe reissue; Made in UK`.

Search usefulness:

- Good release/edition ambiguity case.
- Top result is not necessarily the physical vinyl edition a collector owns.
- Candidate confirmation and visible edition metadata are mandatory.

### MusicBrainz Spike Assessment

- Relevance: good for exact artist/title searches, but highly edition-dense
  results need UI confirmation.
- Disambiguation: strong release-level MBIDs plus release-group MBIDs.
- Metadata completeness: useful artist/title/year/label/country/format/catalog
  number in observed samples.
- Genre/style: MusicBrainz genres/tags exist but are not necessary for M4 and
  should remain deferred unless a later filtering/recommendation milestone needs
  them.
- Cover: Cover Art Archive can be reached by MusicBrainz MBIDs, but cover art
  should remain optional and not block add.
- Auth/secrets: normal read-only MusicBrainz metadata does not require an API
  key, but does require a meaningful User-Agent.
- Rate/fair use: official guidance requires roughly one request per second per
  source IP unless otherwise agreed; excessive requests can receive HTTP `503`.
- Normalization complexity: manageable for a first provider, but raw payloads
  should be hidden behind a normalized candidate/release contract.
- Error/no-match: HTTP and empty-result states can be represented as recoverable
  UI states.
- Netlify suitability: good fit for authenticated server-side proxying,
  application identification, response validation, and persistence.

### Discogs Current Verification Status

Official Discogs Terms of Use checked, last updated May 27 2025:

- <https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use>

Official developer reference attempted:

- <https://www.discogs.com/developers>

Observed blocker:

- `https://www.discogs.com/developers` returned HTTP `403` with a Cloudflare
  challenge to automated retrieval.
- No Discogs credential is available in this workflow.
- The current official search endpoint, authentication mechanism, rate-limit
  headers, pagination, and response shape therefore remain unverified here.

Current Discogs terms facts that matter:

- API content mixes CC0 Data and Restricted Data.
- Release metadata categories such as release titles, notes, dates, formats,
  track listings, barcodes/identifiers, credits, versions, external links,
  artist names, and label metadata are listed as CC0 data.
- Images, marketplace data, and user data are Restricted Data.
- Discogs may apply rate limits and field restrictions.
- Rate limits and technical limitations must not be circumvented.
- API content may not be displayed if it is more than six hours older than the
  information on Discogs.
- API content should not be cached or stored longer than necessary to provide
  service to users.
- Public-facing API use has attribution obligations, including "Data provided
  by Discogs" next to Discogs API data with an appropriate link.

Impact on M4:

- Persistent shared canonical release rows based on Discogs data would need a
  freshness, caching, attribution, and restricted-data design before Discogs can
  be implemented safely.
- Discogs remains deferred, not rejected.

### Pre-Disposition Provisional Recommendation

`PROVISIONAL RECOMMENDATION:` MusicBrainz plus optional Cover Art Archive
appears to be the smallest M4 path, subject to completion or explicit human
disposition of this spike.

At that point, this was not a final provider selection. The human still needed
to either approve completing the Discogs empirical comparison later or
explicitly accept the MusicBrainz-first path despite the Discogs verification
blocker. That explicit disposition is now recorded below.

## Human Disposition For Milestone 4 - 2026-08-25

The human reviewed the corrected Milestone 4 planning package, the independent
verification, the MusicBrainz empirical evidence above, and the current Discogs
verification blocker.

Decision:

- MusicBrainz-first is accepted for Milestone 4.
- The remaining Discogs empirical comparison is explicitly deferred.
- Discogs is deferred, not rejected.
- The Discogs comparison may be reopened in a later reviewed milestone if
  MusicBrainz coverage proves insufficient for physical/vinyl editions.

Reason:

- MusicBrainz was empirically exercised against the four planned sample
  searches.
- MusicBrainz provides the release-level identifiers and normalized factual
  metadata required for the first catalog-add vertical slice.
- Normal read-only MusicBrainz use requires no provider API key.
- The current official Discogs developer reference could not be independently
  retrieved in this workflow due to HTTP `403` / Cloudflare challenge.
- Current official Discogs Terms introduce freshness, caching, attribution, and
  restricted-data obligations that add unnecessary complexity to the first
  catalog milestone.
- Milestone 4 is intended to prove one safe deterministic catalog integration,
  not to maximize provider count.

Current implementation impact:

- This spike is no longer an implementation blocker for Milestone 4.
- The original comparison rubric remains preserved as historical planning
  evidence and as a guide if Discogs is revisited later.
