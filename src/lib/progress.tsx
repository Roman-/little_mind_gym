import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PuzzleMeta } from './types'

const KEY = 'little-mind-gym:progress:v1'
// What the same store was called before the app was renamed. The site moved
// folder, not origin, so a child's solved levels are still sitting under the
// old name; read them once and they carry over on the next write.
const FORMER_KEY = 'puzzle-bench:progress:v1'

export interface PuzzleRecord {
  /** Opened the puzzle and made at least one move. */
  tried: boolean
  /** Level ids finished, in the order they were first finished. */
  solved: string[]
  /** Fewest moves used per level id. */
  best: Record<string, number>
  lastPlayedAt: number | null
}

export type Progress = Record<string, PuzzleRecord>

export type Status = 'new' | 'tried' | 'solved' | 'complete'

const blank = (): PuzzleRecord => ({ tried: false, solved: [], best: {}, lastPlayedAt: null })

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(FORMER_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return {}
    return (parsed.puzzles ?? {}) as Progress
  } catch {
    return {}
  }
}

function write(puzzles: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, puzzles }))
  } catch {
    /* a full or blocked store just means progress is not remembered */
  }
}

export function statusOf(record: PuzzleRecord | undefined, meta: PuzzleMeta): Status {
  if (!record || (!record.tried && record.solved.length === 0)) return 'new'
  if (record.solved.length === 0) return 'tried'
  return record.solved.length >= meta.levels.length ? 'complete' : 'solved'
}

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Not tried',
  tried: 'Tried',
  solved: 'Solved',
  complete: 'Every level',
}

interface Ctx {
  progress: Progress
  get: (puzzleId: string) => PuzzleRecord
  markTried: (puzzleId: string) => void
  markSolved: (puzzleId: string, levelId: string, moves: number) => void
  clearAll: () => void
}

const ProgressContext = createContext<Ctx | null>(null)

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(() => read())

  useEffect(() => {
    write(progress)
  }, [progress])

  const get = useCallback((id: string) => progress[id] ?? blank(), [progress])

  const markTried = useCallback((id: string) => {
    setProgress((cur) => {
      const rec = cur[id] ?? blank()
      if (rec.tried) return cur
      return { ...cur, [id]: { ...rec, tried: true, lastPlayedAt: Date.now() } }
    })
  }, [])

  const markSolved = useCallback((id: string, levelId: string, moves: number) => {
    setProgress((cur) => {
      const rec = cur[id] ?? blank()
      const prevBest = rec.best[levelId]
      const best = prevBest === undefined || moves < prevBest ? moves : prevBest
      if (rec.solved.includes(levelId) && best === prevBest) {
        return { ...cur, [id]: { ...rec, tried: true, lastPlayedAt: Date.now() } }
      }
      return {
        ...cur,
        [id]: {
          ...rec,
          tried: true,
          solved: rec.solved.includes(levelId) ? rec.solved : [...rec.solved, levelId],
          best: { ...rec.best, [levelId]: best },
          lastPlayedAt: Date.now(),
        },
      }
    })
  }, [])

  const clearAll = useCallback(() => setProgress({}), [])

  const value = useMemo(
    () => ({ progress, get, markTried, markSolved, clearAll }),
    [progress, get, markTried, markSolved, clearAll],
  )

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
}

export function useProgress(): Ctx {
  const ctx = useContext(ProgressContext)
  if (!ctx) throw new Error('useProgress must be used inside ProgressProvider')
  return ctx
}
