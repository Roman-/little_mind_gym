import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PUZZLES } from '../puzzles'
import { statusOf, useProgress } from '../lib/progress'
import type { PuzzleMeta } from '../lib/types'
import { usePrefersReducedMotion } from '../lib/theme'
import { Button, Panel } from '../components/kit'
import s from './random.module.css'

const LAST = 'little-mind-gym:last-random'

/** Lean towards what has not been played, and never hand back the one just finished. */
function chooseFor(weightOf: (meta: PuzzleMeta) => number): PuzzleMeta {
  let last: string | null = null
  try {
    last = sessionStorage.getItem(LAST)
  } catch {
    last = null
  }
  const pool = PUZZLES.filter((p) => p.id !== last)
  const candidates = pool.length > 0 ? pool : PUZZLES
  const weights = candidates.map(weightOf)
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

const STEPS = 9
const TICK = 105

/**
 * `instant` is the unlisted /random_instantly door: same pick, no reel. Nothing
 * links to it — it exists for a bookmark or a shortcut that wants the puzzle
 * and not the ceremony.
 */
export function RandomPuzzle({ instant = false }: { instant?: boolean }) {
  const navigate = useNavigate()
  const { get } = useProgress()
  const reduced = usePrefersReducedMotion()

  const target = useMemo(
    () =>
      chooseFor((meta) => {
        const status = statusOf(get(meta.id), meta)
        return status === 'new' ? 5 : status === 'tried' ? 4 : status === 'solved' ? 2 : 1
      }),
    // Picked once, on arrival. Re-rolling as progress loads would be dishonest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const destination = useMemo(() => {
    const record = get(target.id)
    const level = target.levels.find((l) => !record.solved.includes(l.id)) ?? target.levels[0]
    return `/puzzle/${target.id}?level=${level.id}`
  }, [target, get])

  const [tick, setTick] = useState(0)
  const settled = tick >= STEPS
  const go = useRef(() => {})
  go.current = () => {
    try {
      sessionStorage.setItem(LAST, target.id)
    } catch {
      /* a session without storage just repeats itself sometimes */
    }
    navigate(destination, { replace: true })
  }

  useEffect(() => {
    if (reduced || instant) {
      go.current()
      return
    }
    const timer = setInterval(() => setTick((t) => t + 1), TICK)
    return () => clearInterval(timer)
  }, [reduced, instant])

  useEffect(() => {
    if (!settled) return
    const timer = setTimeout(() => go.current(), 420)
    return () => clearTimeout(timer)
  }, [settled])

  // The effect above has already sent us on; a panel here would only flash.
  if (instant) return null

  const shown = settled ? target : PUZZLES[(tick * 3 + 1) % PUZZLES.length]
  const Icon = shown.Icon

  return (
    <Panel className={s.wrap}>
      <p className={`u-label ${s.line}`}>{settled ? 'Here you go' : 'Picking one for you'}</p>
      <div className={s.window} data-settled={settled ? 'true' : undefined}>
        <Icon key={shown.id} />
      </div>
      <p className={s.name} aria-live="polite">
        {settled ? target.title : ' '}
      </p>
      <div className={s.tape} aria-hidden="true">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={s.pip} data-on={i < tick ? 'true' : undefined} />
        ))}
      </div>
      <Button onClick={() => go.current()}>
        Take me there now
      </Button>
    </Panel>
  )
}
