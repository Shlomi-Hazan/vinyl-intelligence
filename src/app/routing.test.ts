import { describe, expect, it } from 'vitest'
import { safeInternalPath } from './routing.ts'

describe('safeInternalPath', () => {
  it('accepts allow-listed internal protected routes', () => {
    for (const path of [
      '/dashboard',
      '/collection',
      '/collection/abc-123',
      '/discover',
      '/scan',
      '/vin',
      '/history',
      '/settings',
      '/collection?sort=year',
      '/vin#top',
    ]) {
      expect(safeInternalPath(path)).toBe(path)
    }
  })

  it('rejects anything outside the allow-list (no open redirect)', () => {
    for (const bad of [
      '/',
      '/auth',
      '/nope',
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'http://evil.com/collection',
      '/collection\n/evil',
      '/collection <script>',
      'collection',
      '',
      '   ',
      undefined,
      null,
      42,
      '/'.padEnd(600, 'a'),
    ]) {
      expect(safeInternalPath(bad)).toBeNull()
    }
  })
})
