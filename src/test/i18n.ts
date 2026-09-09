/**
 * Test helpers for the multilingual UI (spec 0015).
 *
 * `BidiText` wraps dynamic fields in `<bdi>` and `isolate()` wraps dynamic runs
 * in Unicode FSI/PDI controls inside string attributes (aria-label / title).
 * Those controls are invisible to users and ignored by screen readers, but
 * Testing Library's accessible-name computation keeps them, so name-based
 * queries need to compare against a stripped form.
 */

// U+2066-U+2069 (LRI/RLI/FSI/PDI), U+202A-U+202E (LRE/RLE/PDF/LRO/RLO),
// U+200E/U+200F (LRM/RLM), U+061C (ALM).
const BIDI_CONTROLS = new RegExp(
  `[${[0x061c, 0x200e, 0x200f].map((c) => String.fromCodePoint(c)).join('')}` +
    `${String.fromCodePoint(0x202a)}-${String.fromCodePoint(0x202e)}` +
    `${String.fromCodePoint(0x2066)}-${String.fromCodePoint(0x2069)}]`,
  'gu',
)

/** Remove Unicode bidi isolate / embedding / override control characters. */
export function stripBidi(value: string): string {
  return value.replace(BIDI_CONTROLS, '')
}

/**
 * A Testing Library `name` matcher that ignores bidi control characters, e.g.
 * `getByRole('img', { name: nameIgnoringBidi('Pink Floyd - Meddle') })`.
 */
export function nameIgnoringBidi(
  expected: string,
): (accessibleName: string) => boolean {
  return (accessibleName) => stripBidi(accessibleName) === expected
}

/**
 * A Testing Library `getByText` matcher that ignores bidi control characters,
 * e.g. `getByText(textIgnoringBidi('Genres: rock'))`. Matches the element that
 * directly contains the text.
 */
export function textIgnoringBidi(
  expected: string,
): (content: string) => boolean {
  return (content) => stripBidi(content).trim() === expected
}
