import { Fragment } from 'react'
import { classifyScript } from '../lib/i18n/script.ts'

/*
 * BidiText - render ONE dynamic field (a title, an artist, a genre, a note, a
 * recommendation reason, a transcript line) with local bidirectional isolation.
 *
 * Locked by spec `docs/specs/0015-hebrew-multilingual-record-support.md` §6 / §8:
 *   - always `<bdi dir="auto">` so the run's direction cannot leak into or
 *     reorder the surrounding English chrome;
 *   - `lang="he"` ONLY when `classifyScript` returns `hebrew` (Hebrew-dominant),
 *     never merely because the string contains a Hebrew character;
 *   - `latin` / `mixed` / `neutral` -> no `lang` override.
 *
 * Never wrap a whole English sentence in `BidiText`, and never nest it inside a
 * native `<option>` (put `dir`/`lang` on the `<option>` element instead).
 *
 * `className` is forwarded so a single-field truncation container
 * (`.vi-albumcard__title`, `.vi-art__title`, ...) can BE the `<bdi>` element and
 * therefore be direction-aware, instead of an outer LTR `<span>` owning the
 * ellipsis.
 */

type BidiTextProps = {
  children: string
  className?: string
}

export function BidiText({ children, className }: BidiTextProps) {
  const lang = classifyScript(children) === 'hebrew' ? 'he' : undefined
  return (
    <bdi dir="auto" lang={lang} className={className}>
      {children}
    </bdi>
  )
}

/*
 * BidiJoin - render a list of SEPARATE dynamic fields (e.g. year, label, genre,
 * country, format) each in its own `<bdi>`, joined by a literal LTR chrome
 * separator that stays OUTSIDE the isolates. One Hebrew field can never
 * determine the direction/lang of the whole composite or reorder the neutral /
 * Latin segments. Blank parts are dropped by the caller; order is preserved.
 */
type BidiJoinProps = {
  parts: readonly string[]
  separator?: string
}

export function BidiJoin({ parts, separator = ' · ' }: BidiJoinProps) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? separator : ''}
          <BidiText>{part}</BidiText>
        </Fragment>
      ))}
    </>
  )
}
