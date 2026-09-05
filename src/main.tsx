// First, so the global utilities cannot outrank a CSS module that opts out of them.
import './styles/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ProgressProvider } from './lib/progress'
import { App } from './App'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {/* Not a literal: it follows `base` in vite.config.ts, so moving the
        site to another folder stays a one-line change. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ProgressProvider>
        <App />
      </ProgressProvider>
    </BrowserRouter>
  </StrictMode>,
)
