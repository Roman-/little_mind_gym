import type { ReactNode } from 'react'
import { SETTINGS_KEY, SettingsProvider } from '../lib/settings'
import type { Settings } from '../lib/settings'

/**
 * A wrapper for `render`, so a board can be drawn under the settings a test
 * wants to play by. Boards ask the settings whether a move that breaks a rule
 * is offered or refused up front, and the shell always draws them inside the
 * provider, so a test that draws one on its own has to as well.
 *
 * Anything left out takes its default, which is what a child gets on a first
 * visit: `render(board, { wrapper: underSettings() })` plays the collection as
 * it ships.
 *
 * The choices go into `localStorage` first, because the provider reads them
 * once as it mounts. Call it in the `render` call itself, never earlier.
 */
export function underSettings(settings: Partial<Settings> = {}) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, settings }))
  return ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>
}
