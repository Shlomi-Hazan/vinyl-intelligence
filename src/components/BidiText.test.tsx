import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BidiText } from './BidiText.tsx'

function renderBidi(text: string) {
  const { container } = render(<BidiText>{text}</BidiText>)
  return container.querySelector('bdi') as HTMLElement
}

describe('BidiText', () => {
  it('always renders a <bdi> with dir="auto"', () => {
    const el = renderBidi('Radiohead')
    expect(el.tagName).toBe('BDI')
    expect(el.getAttribute('dir')).toBe('auto')
  })

  it('sets lang="he" only for a Hebrew-dominant string', () => {
    expect(renderBidi('שלום חנוך').getAttribute('lang')).toBe('he')
  })

  it('does not set lang for Latin / mixed / neutral', () => {
    expect(renderBidi('Radiohead').getAttribute('lang')).toBeNull()
    expect(renderBidi('שלום Hanoch').getAttribute('lang')).toBeNull()
    expect(renderBidi('1979').getAttribute('lang')).toBeNull()
  })

  it('does not set lang="he" merely because a Hebrew character appears', () => {
    expect(renderBidi('The א Team is here now').getAttribute('lang')).toBeNull()
  })

  it('renders the text verbatim and forwards a className', () => {
    const { container } = render(
      <BidiText className="vi-x">מחכים למשיח</BidiText>,
    )
    const el = container.querySelector('bdi') as HTMLElement
    expect(el.textContent).toBe('מחכים למשיח')
    expect(el.className).toBe('vi-x')
  })
})
