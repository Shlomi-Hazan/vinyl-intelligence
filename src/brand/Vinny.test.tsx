import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Vinny, type VinnyState } from './Vinny.tsx'

const CASES: Array<[VinnyState, string]> = [
  ['idle', '/vinny/vinny-idle.png'],
  ['thinking', '/vinny/vinny-thinking.png'],
  ['success', '/vinny/vinny-success.png'],
  ['no-match', '/vinny/vinny-no-match.png'],
  ['empty', '/vinny/vinny-empty.png'],
]

describe('Vinny', () => {
  it.each(CASES)('state "%s" renders the approved asset %s', (state, src) => {
    const { container } = render(<Vinny state={state} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe(src)
    // keeps the asset's aspect ratio via width/height attributes
    expect(img.getAttribute('width')).toBe('120')
    expect(img.getAttribute('height')).toBe('150')
  })

  it('is decorative (aria-hidden, empty alt) without a label', () => {
    const { container } = render(<Vinny state="idle" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('aria-hidden')).toBe('true')
    expect(img.getAttribute('alt')).toBe('')
  })

  it('exposes a concise label when one carries meaning', () => {
    const { container } = render(<Vinny state="no-match" label="VIN found no match" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('alt')).toBe('VIN found no match')
    expect(img.getAttribute('aria-hidden')).toBeNull()
  })

  it('the thinking state carries the bob-animation modifier class', () => {
    const { container } = render(<Vinny state="thinking" />)
    expect(container.querySelector('img')?.className).toContain('vi-vinny--thinking')
  })
})
