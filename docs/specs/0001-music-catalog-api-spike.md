# 0001 Music Catalog API Spike

Status: planned

This spike must be completed before implementing the music catalog integration milestone.

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
