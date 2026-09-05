import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // The site lives in a subfolder of a bigger domain, not at a root. Every
  // asset URL the build writes is prefixed with this, and `import.meta.env
  // .BASE_URL` carries it into the router (see src/main.tsx) so the two can
  // never drift apart. Dev serves from the same subpath on purpose: a link
  // that breaks under a prefix should break on the laptop, not in public.
  base: '/little_mind_gym/',
  plugins: [react()],
})
