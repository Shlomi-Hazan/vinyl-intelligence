import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Keep per-tab draft persistence (sessionStorage) from leaking between tests.
afterEach(() => {
  try {
    window.sessionStorage.clear()
  } catch {
    // Some environments do not expose sessionStorage; nothing to clear.
  }
})
