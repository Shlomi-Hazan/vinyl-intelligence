/**
 * The mandatory Discogs attribution mark (spec 0018 §13) - rendered directly
 * adjacent to any Discogs-sourced data displayed to a user. `compact` is a
 * tight inline mark for card/row layouts; the full variant is used for
 * primary surfaces (the confirmation dialog, Album Detail, VIN cards). No
 * `nofollow` - the Terms explicitly require a normal hyperlink.
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
      {compact ? null : '.'}
    </p>
  )
}
