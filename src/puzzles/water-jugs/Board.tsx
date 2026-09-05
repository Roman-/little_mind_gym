import { useId } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import type { CSSProperties } from 'react'
import type { BoardProps } from '../../lib/types'
import type { JugsAction, JugsState } from './logic'
import { canEmpty, canFill, canPour, canPourFrom, isSealed } from './logic'
import { Glyph } from './glyphs'
import s from './board.module.css'

/* --- Vessel geometry ------------------------------------------------------
   The viewBox is 76 units wide and `capacity * UNIT + EXTRA` units tall, and
   every jug is drawn at one shared CSS width. So one user unit is the same
   number of pixels in every jug, and one litre is always exactly UNIT units
   of height. Two jugs standing side by side can therefore be read straight
   off against each other, which is the whole point of the puzzle.

   The CSS picks that shared width so the tallest jug on the level stands as
   tall as the stage allows. Scaling happens there, in one place; nothing in
   here changes with the size.                                              */
const VIEW_W = 76
const UNIT = 22
/** Interior top: the brim, a little below the rim of the glass. */
const BRIM = 4
/** Interior bottom sits this far above the outer foot of the glass. */
const FLOOR = 3
const EXTRA = BRIM + FLOOR

const bodyHeight = (capacity: number) => capacity * UNIT + EXTRA

function Vessel({ capacity, litres }: { capacity: number; litres: number }) {
  /** useId() is only guaranteed to be unique, not to be a bare name. */
  const clip = `wj-${useId().replace(/[^\w-]/g, '')}`
  const h = bodyHeight(capacity)
  const inner = capacity * UNIT
  const glass = `M1.5 1.5 V${h - 10.5} Q1.5 ${h - 1.5} 10.5 ${h - 1.5} H65.5 Q74.5 ${h - 1.5} 74.5 ${h - 10.5} V1.5`
  const cavity = `M3 ${BRIM} V${h - 10.5} Q3 ${h - FLOOR} 10.5 ${h - FLOOR} H65.5 Q73 ${h - FLOOR} 73 ${h - 10.5} V${BRIM} Z`

  return (
    <svg
      className={s.glassSvg}
      viewBox={`0 0 ${VIEW_W} ${h}`}
      style={{ '--cap': capacity } as CSSProperties}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <path d={cavity} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect
          className={s.water}
          x="3"
          y={BRIM}
          width="70"
          height={inner}
          style={{ transform: `translateY(${(capacity - litres) * UNIT}px)` }}
        />
      </g>
      <path className={s.glass} d={glass} fill="none" />
    </svg>
  )
}

/** What a tap on a jug does right now. Only 'pour' ever dispatches. */
type Role = 'pour' | 'put-down' | 'pick-up' | 'none'

export function Board({ state, dispatch, locked }: BoardProps<JugsState, JugsAction>) {
  const { cfg, litres } = state
  /** Which jug is in the player's hands. Local: picking one up is not a move. */
  const [held, setHeld] = useEphemeral<number | null>(state, null)

  const cap = (i: number) => cfg.jugs[i].capacity
  const tallest = cfg.jugs.reduce((m, j) => Math.max(m, j.capacity), 1)
  const sealed = isSealed(state)

  const roleOf = (i: number): Role => {
    if (locked) return 'none'
    if (held === i) return 'put-down'
    if (held !== null && canPour(state, held, i)) return 'pour'
    // A jug that cannot take the pour but has water of its own is picked up
    // instead, so changing your mind never costs a move or a dead tap.
    return canPourFrom(state, i) ? 'pick-up' : 'none'
  }

  const tapVessel = (i: number, role: Role) => {
    if (role === 'pour') dispatch({ type: 'pour', from: held as number, to: i })
    else if (role === 'put-down') setHeld(null)
    else if (role === 'pick-up') setHeld(i)
  }

  const vesselLabel = (i: number, role: Role) => {
    const n = litres[i]
    const base = `${cap(i)}-litre jug, ${n} ${n === 1 ? 'litre' : 'litres'} in it`
    switch (role) {
      case 'pour':
        return `${base}. Pour the ${cap(held as number)}-litre jug into it.`
      case 'put-down':
        return `${base}. You are holding it. Put it down.`
      case 'pick-up':
        return `${base}. Pick it up to pour from it.`
      default:
        return `${base}.`
    }
  }

  const anythingToPickUp = cfg.jugs.some((_, i) => roleOf(i) !== 'none')
  const note = locked
    ? ''
    : held !== null
      ? 'Now tap another jug to pour the water in.'
      : anythingToPickUp
        ? 'Tap a jug to pick it up.'
        : // Only a level with a tap or a drain can end up here: on a sealed
          // level there is always another jug to pour into.
          'No jug can pour into another right now. Use Fill or Empty.'

  /** The two numbers the drawing is scaled from. One litre, one size, everywhere. */
  const scale = { '--tallest': tallest, '--count': cfg.jugs.length } as CSSProperties

  return (
    <div className={s.board}>
      <p className={`u-label ${s.goal}`}>{cfg.goalLine}</p>

      <div className={s.field}>
        <div className={s.jugs} style={scale}>
          {cfg.jugs.map((jug, i) => {
            const role = roleOf(i)
            return (
              <div className={s.jug} key={i}>
                <div className={s.vesselWrap}>
                  <button
                    type="button"
                    className={`${s.vessel} u-press`}
                    data-held={held === i ? 'true' : undefined}
                    aria-pressed={role === 'pour' ? undefined : held === i}
                    aria-label={vesselLabel(i, role)}
                    disabled={role === 'none'}
                    onClick={() => tapVessel(i, role)}
                  >
                    <Vessel capacity={jug.capacity} litres={litres[i]} />
                  </button>
                </div>

                <p className={s.readout}>
                  <span className={s.litres} data-empty={litres[i] === 0 ? 'true' : undefined}>
                    {litres[i]}
                  </span>
                  <span className={`u-mono ${s.capLabel}`}>{jug.capacity} L</span>
                </p>

                {!sealed && (
                  <div className={s.acts}>
                    {cfg.tap && (
                      <button
                        type="button"
                        className={`${s.act} u-press`}
                        disabled={locked || !canFill(state, i)}
                        aria-label={`Fill the ${cap(i)}-litre jug right up`}
                        onClick={() => dispatch({ type: 'fill', jug: i })}
                      >
                        <Glyph name="tap" className={s.actGlyph} />
                        Fill
                      </button>
                    )}
                    {cfg.drain && (
                      <button
                        type="button"
                        className={`${s.act} u-press`}
                        disabled={locked || !canEmpty(state, i)}
                        aria-label={`Empty the ${cap(i)}-litre jug right out`}
                        onClick={() => dispatch({ type: 'empty', jug: i })}
                      >
                        <Glyph name="drain" className={s.actGlyph} />
                        Empty
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className={s.note} role="status">
        {held !== null && <Glyph name="pour" className={s.noteGlyph} />}
        {note}
      </p>
    </div>
  )
}
