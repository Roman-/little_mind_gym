import { useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { PathAction, PathState, Pen, PenChoice, Way } from './logic'
import { blankCount, colOf, orthogonal, penOf, refusalOf, rowOf } from './logic'
import { RubGlyph } from './glyphs'
import s from './board.module.css'

/** What the pen chip says out loud. It always names the number it will write. */
function penLabel(pen: Pen, size: number): string {
  if (pen.value === null) {
    const both = [pen.from - 1, pen.from + 1].filter((v) => v >= 1 && v <= size)
    return both.length === 2
      ? `${both[0]} and ${both[1]} are both on the board.`
      : `${both[0]} is already on the board.`
  }
  if (!pen.canTurn) return `Writing ${pen.value}.`
  return `Writing ${pen.value}. Tap to write ${pen.from - pen.way} instead.`
}

export function Board({ state, dispatch, locked }: BoardProps<PathState, PathAction>) {
  /**
   * With forbidden moves offered, every empty square takes the number. A
   * square that is nowhere near the number before it lets it land, flashes,
   * and hands it back — so which squares are legal stays the child's to work
   * out from the chain rather than the board's to say with a dead button.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n } = state
  const size = n * n

  /**
   * The pen: which square the next number grows out of, and which way it
   * counts. Both are selection, so neither is ever dispatched.
   *
   * `state.givens` is the token because `reduce` passes it through by
   * reference: it is a new array only when a board is dealt, which is the one
   * moment the pen should start again. Keying on the whole state would clear
   * the pen after every single write, and a run of five numbers would cost ten
   * taps instead of five. `penOf` is what makes that safe — it repairs a stale
   * anchor during render, so a rewind through the move tape can never leave
   * the pen pointing at a square that is empty again.
   */
  const [choice, setChoice] = useEphemeral<PenChoice | null>(state.givens, null)
  const pen = penOf(state, choice)

  /** Which square owns the tab stop. Focus position, not a game choice. */
  const home = useMemo(() => Math.max(0, state.givens.indexOf(1)), [state.givens])
  const [cursor, setCursor] = useEphemeral(state.givens, home)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  const turn = () => setChoice({ anchor: pen.anchor, way: (pen.way === 1 ? -1 : 1) as Way })

  const tap = (index: number) => {
    if (locked || refusal.busy) return
    // A square with a number on it picks the pen up. Selection, not a move.
    if (state.cells[index] !== 0) {
      setChoice({ anchor: index, way: pen.way })
      return
    }
    if (pen.value === null) return
    const no = refusalOf(state, index, pen.value, pen.from)
    if (no !== null) {
      if (refusal.offered) refusal.refuse(no)
      return
    }
    dispatch({ type: 'write', index, value: pen.value })
    // The pen walks on, so a run of five numbers is five taps and no more.
    setChoice({ anchor: index, way: pen.way })
  }

  /** True when the pen is sitting on a number the player wrote. */
  const rubbable = state.givens[pen.anchor] === 0

  const rub = () => {
    if (locked || refusal.busy || !rubbable) return
    dispatch({ type: 'rub', index: pen.anchor })
    setChoice(null)
  }

  const canPress = (index: number): boolean => {
    if (locked) return false
    if (shown.cells[index] !== 0) return true
    if (pen.value === null) return false
    if (refusal.offered) return true
    return refusalOf(state, index, pen.value, pen.from) === null
  }

  const focusCell = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked) return
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = steps[event.key]
    if (step !== undefined) {
      event.preventDefault()
      const r = rowOf(n, cursor) + step[0]
      const c = colOf(n, cursor) + step[1]
      // Stops at the edge rather than wrapping round onto the next row.
      if (r < 0 || r >= n || c < 0 || c >= n) return
      focusCell(r * n + c)
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      rub()
      return
    }
    if (event.key === '-' || event.key === '+' || event.key === '=') {
      event.preventDefault()
      const want: Way = event.key === '-' ? -1 : 1
      if (pen.way !== want && pen.canTurn) turn()
    }
  }

  const labelFor = (index: number): string => {
    const where = `Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1}`
    const value = shown.cells[index]
    const what = value === 0 ? 'empty' : shown.givens[index] !== 0 ? `${value}, printed` : `${value}`
    return `${where}, ${what}${index === pen.anchor ? ', the pen is here' : ''}`
  }

  /** True where two squares beside each other hold two numbers in a row. */
  const linked = (a: number, b: number): boolean => {
    const x = shown.cells[a]
    const y = shown.cells[b]
    return x !== 0 && y !== 0 && Math.abs(x - y) === 1
  }

  const squares = shown.cells.map((value, i) => {
    const r = rowOf(n, i)
    const c = colOf(n, i)
    return (
      <div className={s.cell} key={i}>
        {/* The chain, drawn as a bar across the seam between two squares. It
            is what stops the board reading as a table of numbers, and it is
            the reason nothing here has to be dragged. */}
        {c < n - 1 && linked(i, i + 1) && (
          <span className={s.link} data-dir="right" aria-hidden="true" />
        )}
        {r < n - 1 && linked(i, i + n) && (
          <span className={s.link} data-dir="down" aria-hidden="true" />
        )}
        <button
          type="button"
          className={cx(s.tile, 'u-press', refusal.flash(String(i)))}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-given={shown.givens[i] !== 0 ? 'true' : undefined}
          data-anchor={i === pen.anchor ? 'true' : undefined}
          disabled={!canPress(i)}
          aria-label={labelFor(i)}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          {value !== 0 && <span className={s.numeral}>{value}</span>}
        </button>
      </div>
    )
  })

  /* One line, and only ever one: the pen has nowhere to write, the pen has
     nowhere to go, or how much of the board is still empty. A refusal goes in
     front of whichever of those it is. */
  const standing = (() => {
    if (pen.value === null) return `${penLabel(pen, size)} Tap another number to start from.`
    if (!orthogonal(n, pen.anchor).some((c) => state.cells[c] === 0)) {
      return `No empty square touches ${pen.from}. Tap another number to start from.`
    }
    const left = blankCount(state)
    return left === 1 ? '1 square still needs a number.' : `${left} squares still need a number.`
  })()

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres it,
          and lets a six-wide grid scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`The numbers 1 to ${size} on a ${n} by ${n} grid`}
          onKeyDown={onKeyDown}
        >
          {squares}
        </div>
      </div>

      <div className={s.tools}>
        <button
          type="button"
          className={`${s.pen} u-press`}
          disabled={locked || !pen.canTurn}
          aria-label={penLabel(pen, size)}
          onClick={turn}
        >
          <span className={s.penDigit}>{pen.value ?? '–'}</span>
        </button>
        {/* Rubbing a number out usually puts the pen back on a printed one,
            which would kill this button under the finger that just pressed
            it. aria-disabled leaves it where it is, so a child playing by
            keyboard does not lose their place. */}
        <button
          type="button"
          className={`${s.rub} u-press`}
          disabled={locked}
          aria-disabled={!rubbable || undefined}
          aria-label={rubbable ? `Rub out ${pen.from}` : `${pen.from} is printed and cannot be rubbed out.`}
          onClick={rub}
        >
          <RubGlyph className={s.rubGlyph} />
          <span className={s.rubWord}>Rub out</span>
        </button>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say(standing)}</p>
      {/* Only a refused move is announced. Every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say('')}
      </p>
    </div>
  )
}
