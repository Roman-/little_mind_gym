import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const KEY = 'little-mind-gym:settings:v1'

export interface Settings {
  /** Let a move that breaks a rule be made, shown to be wrong, and undone. */
  allowForbiddenMoves: boolean
  /** Show how many moves have been made under the board. */
  showMoveCount: boolean
  /** Play the small sounds a move makes. */
  sound: boolean
}

export type SettingKey = keyof Settings

export const DEFAULTS: Settings = {
  allowForbiddenMoves: true,
  showMoveCount: false,
  sound: true,
}

const KEYS = Object.keys(DEFAULTS) as SettingKey[]

/**
 * Everything a stored value is allowed to do to the settings, as one pure
 * function — a missing key, a key we have since dropped, a hand-edited string
 * and a truncated file all land on the default rather than on `false`, which
 * would silently turn a setting off.
 */
export function settingsFrom(raw: string | null): Settings {
  try {
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return DEFAULTS
    const stored = (parsed.settings ?? {}) as Partial<Record<SettingKey, unknown>>
    const out = { ...DEFAULTS }
    for (const key of KEYS) {
      if (typeof stored[key] === 'boolean') out[key] = stored[key]
    }
    return out
  } catch {
    return DEFAULTS
  }
}

function read(): Settings {
  try {
    return settingsFrom(localStorage.getItem(KEY))
  } catch {
    // Reading storage can throw on its own, before any parsing happens.
    return DEFAULTS
  }
}

function write(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, settings }))
  } catch {
    /* a full or blocked store just means the choice lasts this visit only */
  }
}

interface Ctx {
  settings: Settings
  set: (key: SettingKey, value: boolean) => void
}

const SettingsContext = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => read())

  useEffect(() => {
    write(settings)
  }, [settings])

  const set = useCallback((key: SettingKey, value: boolean) => {
    setSettings((cur) => (cur[key] === value ? cur : { ...cur, [key]: value }))
  }, [])

  const value = useMemo(() => ({ settings, set }), [settings, set])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
