import { useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { SignAction, SignState } from './logic'
import {
  ARROW_WORDS,
  END,
  colOf,
  joinsLeft,
  numbersOf,
  refusalOf,
  rowOf,
  runsOf,
} from './logic'
import { ArrowMark } from './glyphs'
import s from './board.module.css'

/**
 * A grid of squares, each with an arrow on its rim, and one svg over the top
 * of them holding everything the child has built: the lines between joined
 * squares, and the numbers those lines have worked out.
 *
 * A join is two taps — the square it leaves and the square it lands on — and
 * one dispatched move. The first tap is selection and lives here; nothing
 * reaches the shell until the second one lands.
 *
 * Every square stays live whatever the rules say about it. A board that only
 * let go of the squares along the arrow would be reading the arrow for the
 * child, and reading the arrow is the puzzle: so a join the rules refuse is
 * taken anyway, drawn where it was put, answered in one sentence, and undrawn.
 */

/**
 * The plate a number stands on, and the number on it, in squares.
 *
 * It is cut to the number rather than to the widest number, because it is what
 * hides the line running under it: a one-digit number on a two-digit plate
 * leaves a gap in the chain with nothing in it. And it is small enough that an
 * arrow on the rim clears the corner of it whichever of the eight ways the
 * square points.
 */
const PLATE_H = 0.3
const NUMERAL = 0.25
const plateW = (value: number) => (value < 10 ? 0.27 : 0.38)

export function Board({ state, dispatch, locked }: BoardProps<SignState, SignAction>) {
  /**
   * With forbidden joins offered, every square takes the line. One that is
   * nowhere near the arrow lets it land, flashes, and hands it back.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n } = state

  /**
   * The square a join is starting from, held here rather than dispatched: one
   * action is one line, which is one move a child would count.
   *
   * It is keyed on the real position and not on the one being drawn, so it
   * clears itself whenever the board really moves — and a refused join, which
   * is drawn and then dropped, leaves the child still holding the square they
   * started from.
   */
  const [from, setFrom] = useEphemeral<number | null>(state, null)

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the 1 after every join. The arrows are the token rather than the whole
   * state for exactly that reason: they are a new array only when a level is
   * opened, which is the one moment the tab stop should start again.
   */
  const home = useMemo(() => Math.max(0, state.clues.indexOf(1)), [state.clues])
  const [cursor, setCursor] = useEphemeral(state.arrows, home)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  const numbers = useMemo(() => numbersOf(shown), [shown])
  const runs = useMemo(() => runsOf(shown), [shown])

  const tap = (cell: number) => {
    if (locked || refusal.busy) return
    if (from === null) {
      // No square chosen: a square that already has a line on it gives it up,
      // and any other square starts one. There is no mode to collide, because
      // with a square chosen a tap on a joined square is a landing, never a
      // put-back.
      if (state.next[cell] !== -1) dispatch({ type: 'unjoin', from: cell })
      else setFrom(cell)
      return
    }
    if (cell === from) {
      setFrom(null)
      return
    }
    const no = refusalOf(state, from, cell)
    if (no !== null) {
      if (refusal.offered) refusal.refuse(no)
      return
    }
    dispatch({ type: 'join', from, to: cell })
  }

  /** Dead only where a rule forbids the join and the settings refuse it up front. */
  const canPress = (cell: number): boolean => {
    if (locked) return false
    if (from === null || cell === from) return true
    return refusal.offered || refusalOf(state, from, cell) === null
  }

  const focusCell = (cell: number) => {
    setCursor(cell)
    refs.current[cell]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked) return
    if (event.key === 'Escape') {
      if (from === null) return
      event.preventDefault()
      setFrom(null)
      return
    }
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    const r = rowOf(n, cursor) + step[0]
    const c = colOf(n, cursor) + step[1]
    // Stops at the edge rather than wrapping round onto the next row.
    if (r < 0 || r >= n || c < 0 || c >= n) return
    focusCell(r * n + c)
  }

  /** One square, in words: where it is, which way it points, what it holds. */
  const seatOf = (cell: number): string => {
    const arrow = shown.arrows[cell]
    const way = arrow === END ? 'the end of the chain' : `pointing ${ARROW_WORDS[arrow]}`
    const value =
      numbers[cell] === 0
        ? 'no number yet'
        : shown.clues[cell] !== 0
          ? `the printed number ${numbers[cell]}`
          : `the number ${numbers[cell]}`
    return `Row ${rowOf(n, cell) + 1}, column ${colOf(n, cell) + 1}, ${way}, ${value}.`
  }

  /**
   * What tapping this square does — never which squares the rules allow. While
   * a forbidden join is offered, every square says the same thing, so a child
   * listening works the arrow out from the same facts a child looking does.
   * With the setting turned off, the dead square says why, exactly as a dead
   * peg on the tower does.
   */
  const labelFor = (cell: number): string => {
    const seat = seatOf(cell)
    if (locked) return seat
    if (from === null) {
      return state.next[cell] !== -1
        ? `${seat} Take the line off it.`
        : `${seat} Start a line here.`
    }
    if (cell === from) return `${seat} Let it go.`
    const no = refusal.offered ? null : refusalOf(state, from, cell)
    if (no !== null) return `${no.message} ${seat}`
    return `${seat} Join row ${rowOf(n, from) + 1}, column ${colOf(n, from) + 1} to this square.`
  }

  const middle = (cell: number) => `${colOf(n, cell) + 0.5},${rowOf(n, cell) + 0.5}`

  const squares = shown.arrows.map((arrow, cell) => (
    <div className={s.cell} key={cell}>
      <button
        type="button"
        className={cx(s.tile, 'u-press', refusal.flash(String(cell)))}
        ref={(el) => {
          refs.current[cell] = el
        }}
        tabIndex={cell === cursor ? 0 : -1}
        data-from={cell === from ? 'true' : undefined}
        disabled={!canPress(cell)}
        aria-label={labelFor(cell)}
        onFocus={() => setCursor(cell)}
        onClick={() => tap(cell)}
      >
        {arrow !== END && (
          <ArrowMark className={s.arrow} style={{ '--turn': `${arrow * 45}deg` } as CSSProperties} />
        )}
      </button>
    </div>
  ))

  /* One line, and only ever one: what the second tap is for, or how much of
     the chain is still in pieces. A refusal goes in front of whichever it is. */
  const standing = (() => {
    if (from !== null) return 'Now tap the square that comes next.'
    const left = joinsLeft(state)
    return left === 1 ? '1 square still needs joining up.' : `${left} squares still need joining up.`
  })()

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres it, and
          lets a five-wide board scroll rather than shrink under a fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`Signposts on a ${n} by ${n} grid`}
          onKeyDown={onKeyDown}
        >
          {squares}

          {/* The chain, and then the numbers over it. Both are drawn in the
              grid's own units, so a square is one unit each way however big
              the board is on the day. */}
          <svg
            className={s.chain}
            viewBox={`0 0 ${n} ${n}`}
            aria-hidden="true"
            focusable="false"
          >
            {runs
              .filter((run) => run.cells.length > 1)
              .map((run) => (
                <polyline
                  key={run.cells[0]}
                  className={s.line}
                  points={(run.ring ? [...run.cells, run.cells[0]] : run.cells)
                    .map(middle)
                    .join(' ')}
                />
              ))}
            {numbers.map((value, cell) =>
              value === 0 ? null : (
                <g key={cell}>
                  <rect
                    className={s.plate}
                    data-printed={shown.clues[cell] !== 0 ? 'true' : undefined}
                    x={colOf(n, cell) + 0.5 - plateW(value) / 2}
                    y={rowOf(n, cell) + 0.5 - PLATE_H / 2}
                    width={plateW(value)}
                    height={PLATE_H}
                    rx={0.07}
                  />
                  <text
                    className={s.numeral}
                    data-printed={shown.clues[cell] !== 0 ? 'true' : undefined}
                    x={colOf(n, cell) + 0.5}
                    y={rowOf(n, cell) + 0.5}
                    fontSize={NUMERAL}
                  >
                    {value}
                  </text>
                </g>
              ),
            )}
          </svg>
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say(standing)}</p>
      {/* Only a refused join is announced. Every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say('')}
      </p>
    </div>
  )
}
