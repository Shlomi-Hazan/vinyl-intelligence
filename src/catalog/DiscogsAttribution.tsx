/**
 * The mandatory Discogs attribution mark (spec 0018 §13) - rendered directly
 * adjacent to any Discogs-sourced data displayed to a user, always as small,
 * muted supporting microcopy (spec 0018 follow-up §6) - never a section
 * title, primary metadata, a CTA, or a central content block; see
 * `.vi-discogs-attribution` in pages.css. Both variants carry the EXACT
 * required phrase, including the trailing period - "Data provided by
 * Discogs." - the Terms require the phrase verbatim, and `compact` only
 * controls layout density, never the wording (spec 0018 follow-up §6,
 * corrected: an earlier compact variant dropped the period, which this
 * fixes). `compact` is a tight inline mark for card/row layouts; the full
 * variant is used for primary surfaces (the confirmation dialog, Album
 * Detail, VIN cards). No `nofollow` - the Terms explicitly require a normal
 * hyperlink. The trailing "↗" is purely a decorative external-link cue,
 * placed after the required phrase - `aria-hidden` so it never becomes part
 * of the link's accessible name.
 */
export function DiscogsAttribution({
  releaseUrl,
  compact = false,
}: {
  releaseUrl: string
  compact?: boolean
}) {
  return (
    <p
      className={
        compact
          ? 'vi-discogs-attribution vi-discogs-attribution--compact'
          : 'vi-discogs-attribution'
      }
    >
      Data provided by{' '}
      <a href={releaseUrl} target="_blank" rel="noreferrer">
        Discogs
      </a>
      .{' '}
      <span aria-hidden="true">↗</span>
    </p>
  )
}
