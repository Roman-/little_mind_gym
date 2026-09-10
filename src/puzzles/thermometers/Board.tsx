import { useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import type { BoardProps } from '../../lib/types'
import type { ThermoAction, ThermoState } from './logic'
import { colOf, isFilled, partOf, rowOf, towardOf } from './logic'
import s from './board.module.css'

/**
 * The board is a sheet of graph paper with thermometers lying on it, and a
 * number at the end of every row and every column standing outside the field's
 * rim in a margin of its own.
 *
 * **This board says nothing while a child plays, and that is the design.** No
 * tick on a line whose count has come right, no clay on a line holding too
 * many, no tally of what is left. The puzzle is Aquarium's family, and a board
 * that marks an over-full line hands the whole thing to a player who never
 * thinks: keep every line under its number, fill as much as you can, and the
 * board walks you to the answer. `logic.test.ts` runs that climber against the
 * boards this puzzle deals — it wins every one against an over-full cue, and
 * wins against a tick on a line whose count has come right as well, and none
 * at all against the board as it ships. So the board answers a tap with the mercury moving and with nothing
 * else, exactly as the lamps do in lights out. The counting is the puzzle, and
 * it stays in the child's head.
 *
 * Nothing here can be refused, either. A number in the margin says what the
 * finished board has to look like, not what a child may do on the way there,
 * so every square takes every tap and there is no `useRefusal` on this board:
 * the mercury runs to the square that was tapped, whatever that does to the
 * numbers. A tap on the square the mercury already reaches empties the
 * thermometer, so no square is a dead control either.
 */

/** One number in the margin, said out loud for anyone who cannot see it. */
function clueLabel(word: string, ordinal: number, want: number): string {
  if (want === 0) return `${word} ${ordinal} wants no full squares`
  return `${word} ${ordinal} wants ${want} full ${want === 1 ? 'square' : 'squares'}`
}

export function Board({ state, dispatch, locked }: BoardProps<ThermoState, ThermoAction>) {
  const { n, tubes, owner, step, fill, rowClues, colClues } = state

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every tap. The thermometers are the token rather than
   * the whole state for exactly that reason: they are a new array only when a
   * board is dealt, which is the one moment the tab stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(tubes, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  const focusCell = (cell: number) => {
    setCursor(cell)
    refs.current[cell]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A browser's own shortcuts keep their keys: only the bare arrow is ours.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const move = steps[event.key]
    if (move === undefined) return
    // A locked board leaves the arrows to the browser, so the page still scrolls.
    if (locked) return
    event.preventDefault()
    const r = rowOf(n, cursor) + move[0]
    const c = colOf(n, cursor) + move[1]
    // Standing still at the edge rather than wrapping round to the far side.
    if (r < 0 || r >= n || c < 0 || c >= n) return
    focusCell(r * n + c)
  }

  /** Which way each thermometer runs. It is the same for every square of one. */
  const runs = tubes.map((cells) => towardOf(n, cells))

  const squares = owner.map((tube, cell) => {
    const toward = runs[tube]
    const at = step[cell]
    const length = tubes[tube].length
    const wet = isFilled(state, cell)
    /** The last full square: a tap here takes the mercury away altogether. */
    const brim = wet && at + 1 === fill[tube]
    const where = `Row ${rowOf(n, cell) + 1}, column ${colOf(n, cell) + 1}`
    const along = `${at + 1} of ${length} from the bulb`
    const doing = brim
      ? 'the top of the mercury, empty this thermometer'
      : wet
        ? 'full, take the mercury back to here'
        : 'empty, fill to here'

    return (
      <div
        className={s.cell}
        key={cell}
        data-top={rowOf(n, cell) > 0 ? 'true' : undefined}
        data-left={colOf(n, cell) > 0 ? 'true' : undefined}
      >
        <button
          type="button"
          className={cx(s.tile, 'u-press')}
          data-run={toward === 'east' || toward === 'west' ? 'across' : 'down'}
          data-toward={toward}
          data-part={partOf(state, cell)}
          data-wet={wet ? 'true' : undefined}
          ref={(el) => {
            refs.current[cell] = el
          }}
          tabIndex={cell === cursor ? 0 : -1}
          disabled={locked}
          aria-label={`${where}, ${along}, ${doing}`}
          onFocus={() => setCursor(cell)}
          onClick={() => {
            if (!locked) dispatch({ type: 'set', cell })
          }}
        >
          <span className={s.stem} aria-hidden="true" />
          {at === 0 && <span className={s.bulb} aria-hidden="true" />}
        </button>
      </div>
    )
  })

  const clue = (word: 'Row' | 'Column', k: number, want: number) => (
    <div
      key={`${word}${k}`}
      className={s.clue}
      role="img"
      aria-label={clueLabel(word, k + 1, want)}
    >
      {want}
    </div>
  )

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres the
          sheet, and lets a seven-across one scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div className={s.plan} data-size={String(n)} style={{ '--n': String(n) } as CSSProperties}>
          <div aria-hidden="true" />
          <div className={s.top}>{colClues.map((want, c) => clue('Column', c, want))}</div>
          <div className={s.left}>{rowClues.map((want, r) => clue('Row', r, want))}</div>
          <div
            className={s.field}
            role="group"
            aria-label={`Thermometers on a ${n} by ${n} board`}
            onKeyDown={onKeyDown}
          >
            {squares}
          </div>
        </div>
      </div>
    </div>
  )
}

