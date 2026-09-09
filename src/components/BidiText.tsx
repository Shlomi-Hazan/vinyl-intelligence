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
