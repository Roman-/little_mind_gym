import { useEphemeral } from '../../lib/ephemeral'
import type { CSSProperties } from 'react'
import type { BoardProps } from '../../lib/types'
import type { LightsAction, LightsState } from './logic'
import { litCount, neighbourhood } from './logic'
import { Pictogram } from '../../components/Pictogram'
import s from './board.module.css'

/** The one number a player reads off the board, and what to do about it. */
function statusLine(remaining: number): string {
  if (remaining === 0) return 'Every lamp is off.'
  if (remaining === 1) return '1 lamp is still on. Turn it off.'
  return `${remaining} lamps are still on. Turn them all off.`
}

export function Board({ state, dispatch, locked }: BoardProps<LightsState, LightsAction>) {
  const { width, height, lit } = state

  /** Which lamp the pointer or the keyboard is on. Presentation only — never a move. */
  const [aim, setAim] = useEphemeral<number | null>(state, null)

  const traced = locked || aim === null ? null : new Set(neighbourhood(width, height, aim))
  const remaining = litCount(state)

  const enter = (i: number) => setAim((prev) => (prev === i || locked ? prev : i))
  const leave = (i: number) => setAim((prev) => (prev === i ? null : prev))

  return (
    <div className={s.wrap}>
      <div className={s.scroller}>
        <div
          className={s.grid}
          style={{ '--cols': width, '--rows': height } as CSSProperties}
          role="group"
          aria-label={`Lamps, ${height} rows and ${width} columns`}
        >
          {lit.map((on, i) => {
            const row = Math.floor(i / width) + 1
            const col = (i % width) + 1
            return (
              <button
                key={i}
                type="button"
                className={`u-press ${s.cell}`}
                data-lit={on ? 'true' : 'false'}
                data-traced={traced?.has(i) ? 'true' : undefined}
                disabled={locked}
                aria-label={`Row ${row}, column ${col}, ${on ? 'on' : 'off'}`}
                onPointerEnter={() => enter(i)}
                onPointerLeave={() => leave(i)}
                onFocus={() => enter(i)}
                onBlur={() => leave(i)}
                onClick={() => {
                  if (!locked) dispatch({ type: 'press', index: i })
                }}
              >
                <Pictogram name="bulb" className={s.bulb} />
              </button>
            )
          })}
        </div>
      </div>
      <p className={`u-label ${s.status}`} aria-live="polite">
        {statusLine(remaining)}
      </p>
    </div>
  )
}
