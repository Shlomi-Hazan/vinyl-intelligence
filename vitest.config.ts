import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['**/.netlify/**', '**/dist/**', '**/node_modules/**'],
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
