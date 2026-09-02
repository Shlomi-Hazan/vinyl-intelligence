import type { IconName } from '../ui/Icon.tsx'

export type NavEntry = {
  to: string
  label: string
  icon: IconName
  /** Shown in the mobile bottom bar (max 4 + More). */
  primaryMobile?: boolean
}

export const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', primaryMobile: true },
  { to: '/collection', label: 'Collection', icon: 'collection', primaryMobile: true },
  { to: '/discover', label: 'Discover', icon: 'discover', primaryMobile: true },
  { to: '/vin', label: 'Ask VIN', icon: 'vin', primaryMobile: true },
  { to: '/scan', label: 'Scan', icon: 'scan' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function pageTitleForPath(pathname: string): string {
  if (pathname.startsWith('/collection/')) {
    return 'Album'
  }
  const match = NAV.find((entry) => entry.to === pathname)
  return match?.label ?? 'Vinyl Intelligence'
}
