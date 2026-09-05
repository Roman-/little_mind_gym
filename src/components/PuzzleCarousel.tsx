import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { PUZZLES } from '../puzzles'
import { usePrefersReducedMotion } from '../lib/theme'
import { Button, ButtonLink } from './kit'
import { NextIcon, PrevIcon } from './icons'
import s from './PuzzleCarousel.module.css'

/** How long one puzzle is held before the next slides in. */
const DWELL = 4200

/**
 * The eight puzzles, one at a time, with the one on show ready to start.
 *
 * It moves on by itself, so a child who cannot yet read the list below still
 * sees every picture in the collection go past. The rest of it is about giving
 * that movement back the moment anybody wants it. A touch stops it for good —
 * a card that slid out from under a finger already reaching for Start would be
 * worse than no carousel — a pointer resting on it pauses it meanwhile, and it
 * never starts at all for a reader who has asked the system to keep motion
 * down. The two arrows steer it in every one of those cases.
 *
 * Only the picture and the name are on a card. The tagline is on the row
 * below, and printing it twice would say nothing the second time.
 */
export function PuzzleCarousel() {
  const reduced = usePrefersReducedMotion()
  const [at, setAt] = useState(0)
  // Taken over by a child, so it is theirs to steer from here on.
  const [taken, setTaken] = useState(false)
  const [underPointer, setUnderPointer] = useState(false)
  const shown = PUZZLES[at]

  useEffect(() => {
    if (reduced || taken || underPointer) return
    const timer = setInterval(() => setAt((i) => (i + 1) % PUZZLES.length), DWELL)
    return () => clearInterval(timer)
  }, [reduced, taken, underPointer])

  const step = (by: number) => {
    setTaken(true)
    setAt((i) => (i + by + PUZZLES.length) % PUZZLES.length)
  }

  return (
    <div
      className={s.carousel}
      onPointerDown={() => setTaken(true)}
      onPointerEnter={() => setUnderPointer(true)}
      onPointerLeave={() => setUnderPointer(false)}
      // Reaching it by keyboard is a touch as much as a finger is: the target
      // must not move between tabbing to Start and pressing it.
      onFocus={() => setTaken(true)}
    >
      <div className={s.window}>
        <div className={s.track} style={{ '--at': at } as CSSProperties}>
          {PUZZLES.map((meta, i) => {
            const { Icon } = meta
            return (
              <div key={meta.id} className={s.slide} aria-hidden={i === at ? undefined : true}>
                <span className={s.plate}>
                  <Icon />
                </span>
                <span className={s.name}>{meta.title}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className={s.controls}>
        <Button
          className={s.arrow}
          onClick={() => step(-1)}
          aria-label="Show the puzzle before this one"
        >
          <PrevIcon />
        </Button>
        {/* The seven puzzles that are not on show are hidden from a screen
            reader, so the button that opens this one has to name it. */}
        <ButtonLink
          to={`/puzzle/${shown.id}`}
          variant="primary"
          aria-label={`Start ${shown.title}`}
        >
          Start
        </ButtonLink>
        <Button className={s.arrow} onClick={() => step(1)} aria-label="Show the next puzzle">
          <NextIcon />
        </Button>
      </div>
    </div>
  )
}
