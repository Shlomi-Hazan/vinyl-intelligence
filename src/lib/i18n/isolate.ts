/**
 * Wrap a dynamic run in Unicode bidi-isolate controls for a STRING-ONLY context
 * (e.g. an `aria-label` or `title` attribute) where a `<bdi>` element cannot be
 * used. In markup, use `<BidiText>` / `<bdi dir="auto">` instead.
 *
 * FSI (U+2068) ... PDI (U+2069) isolate the run's directionality from the
 * surrounding text so an English sentence containing a Hebrew title is not
 * reordered. The underlying text is never modified or persisted - the controls
 * are added only to the transient attribute value.
 */

/** First Strong Isolate (U+2068). */
export const FSI = String.fromCodePoint(0x2068)
/** Pop Directional Isolate (U+2069). */
export const PDI = String.fromCodePoint(0x2069)

export function isolate(text: string): string {
  if (text.length === 0) {
    return ''
  }
  return `${FSI}${text}${PDI}`
}
