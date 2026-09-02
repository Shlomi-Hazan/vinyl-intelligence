import { useEffect, useRef, type ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  eyebrow?: string
  actions?: ReactNode
  /** Move focus here on mount so route changes are announced to AT. */
  focusOnMount?: boolean
}

export function PageHeader({
  title,
  eyebrow,
  actions,
  focusOnMount = true,
}: PageHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (focusOnMount) {
      headingRef.current?.focus()
    }
  }, [focusOnMount, title])

  return (
    <header className="vi-page-header">
      <div className="vi-page-header__titles">
        {eyebrow ? <p className="vi-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
      </div>
      {actions ? <div className="vi-page-header__actions">{actions}</div> : null}
    </header>
  )
}
