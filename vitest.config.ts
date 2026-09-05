// Kept apart from vite.config.ts on purpose: vitest brings its own copy of
// Vite, and mixing the two sets of plugin types breaks `tsc -b`. Vitest picks
// this file up ahead of vite.config.ts, so the app build never sees it.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
