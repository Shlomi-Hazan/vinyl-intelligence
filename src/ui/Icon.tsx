/*
 * Minimal original inline-SVG icon set (1.5px stroke, 24x24, currentColor).
 * No icon npm dependency. Add glyphs here as pages need them.
 */

export type IconName =
  | 'dashboard'
  | 'collection'
  | 'discover'
  | 'scan'
  | 'vin'
  | 'history'
  | 'settings'
  | 'more'
  | 'plus'
  | 'search'
  | 'star'
  | 'heart'
  | 'play'
  | 'close'
  | 'check'
  | 'alert'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'arrow-down'
  | 'grid'
  | 'list'
  | 'panel-left'
  | 'external'

const PATHS: Record<IconName, string> = {
  dashboard: 'M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7V11h-7v9Zm0-16v5h7V4h-7Z',
  collection: 'M4 5h16M4 12h16M4 19h16',
  discover: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  scan:
    'M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  vin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  history: 'M12 7v5l3 2M4 12a8 8 0 1 0 3-6.2M4 5v4h4',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8.4 3a8.4 8.4 0 0 0-.2-1.8l2-1.5-2-3.4-2.3 1a7 7 0 0 0-3-1.7L14.5 2h-5l-.4 2.9a7 7 0 0 0-3 1.7l-2.3-1-2 3.4 2 1.5A8.4 8.4 0 0 0 3.6 12c0 .6.1 1.2.2 1.8l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 3 1.7l.4 2.9h5l.4-2.9a7 7 0 0 0 3-1.7l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  star: 'M12 3.5l2.7 5.6 6 .9-4.3 4.3 1 6.1L12 17.6 6.6 20.4l1-6.1L3.3 10l6-.9L12 3.5Z',
  heart:
    'M12 20s-7-4.5-9.2-8.4A4.9 4.9 0 0 1 12 6a4.9 4.9 0 0 1 9.2 5.6C19 15.5 12 20 12 20Z',
  play: 'M8 5v14l11-7-11-7Z',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 13l4 4L19 7',
  alert: 'M12 3l10 18H2L12 3Zm0 6v6m0 3h.01',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  'panel-left': 'M4 5h16v14H4V5Zm6 0v14',
  external: 'M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4',
}

type IconProps = {
  name: IconName
  size?: number
  className?: string
  title?: string
}

export function Icon({ name, size = 20, className, title }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
