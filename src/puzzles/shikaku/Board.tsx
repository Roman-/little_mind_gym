import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Fault, Piece, ShikakuAction, ShikakuState } from './logic'
import {
  areaOf,
  cellsOf,
  colOf,
  describeFault,
  faultOf,
  faults,
  keyOf,
  numbersIn,
  ownerOf,
  rectBetween,
  refusalOf,
  rowOf,
  unclaimed,
} from './logic'
import s from './board.module.css'

/**
 * The one number a child reads off the bar, and it is only ever shown while
 * every piece on the bar is a good one — a broken rule outranks it. That is
 * what keeps it honest: with no piece at fault, every piece down holds exactly
 * one number and exactly that many squares, so the numbers still waiting are
 * the work still left. It reaches nought only on the move that finishes the
 * bar, and by then the shell has locked the board and this line is empty.
 */
function statusLine(numbers: number): string {
  if (numbers === 1) return '1 number still needs a piece.'
  if (numbers > 1) return `${numbers} numbers still need a piece.`
  return ''
}

/** "6", "6 and 4", "6, 4 and 2". */
function listOf(values: number[]): string {
  if (values.length < 2) return String(values[0] ?? '')
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

export function Board({ state, dispatch, locked }: BoardProps<ShikakuState, ShikakuAction>) {
  /**
   * The one move this puzzle refuses is a rectangle drawn over a piece that has
   * already been snapped off, and nothing about that can pretend to move — so
   * `refusal.shown` is always `state` here, and the board deliberately does not
   * sit still for `refusal.busy`. A board whose refusal moves nothing has
   * nothing to wait for, and gating on it would swallow the child's next tap
   * for the length of a cue every time.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n, clues, pieces } = shown

  const owner = useMemo(() => ownerOf(shown), [shown])
  const wrong = useMemo(() => faults(shown), [shown])
  const broken = wrong.some(Boolean)

  /**
   * The first of the two corners, held here rather than dispatched: one action
   * is one piece, which is one move a child would count. It clears itself
   * whenever the board moves, and a refusal moves nothing, so a child whose
   * rectangle ran over a piece keeps their corner and tries another one.
   */
  const [mark, setMark] = useEphemeral<number | null>(shown, null)

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every piece. The clues are the token rather than the
   * whole state for exactly that reason: they are a new array only when a new
   * bar is dealt, which is the one moment the tab stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(clues, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /** The square the second corner is currently over, for the outline. */
  const [aim, setAim] = useState<number | null>(null)

  /**
   * A piece that landed breaking a rule, lit for one run of the cue: the whole
   * group of squares held long enough to be counted, which is exactly the
   * reading a piece of the wrong size asks for. Two numbers in one piece shake
   * as well, the way the garden cats shake at each other. It is decoration over
   * a move the puzzle has already taken: nothing else reads it, and it takes
   * itself off again.
   */
  const [lit, light] = useCue<{ where: string; shake: number[] }>('--dur-5')

  /**
   * The same mistake in words, and deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until no
   * piece on the bar is breaking a rule.
   */
  const [said, setSaid] = useState<string | null>(null)
  if (said !== null && !broken) setSaid(null)

  const tap = (cell: number) => {
    if (locked) return
    if (mark === null) {
      // No corner marked: a piece comes back off, and bare chocolate takes the
      // first corner. There is no mode to collide, because with a corner marked
      // a tap on a piece is a rectangle running over it, never a put-back.
      if (owner[cell] !== -1) dispatch({ type: 'clear', cell })
      else setMark(cell)
      return
    }
    if (cell === mark) {
      setMark(null)
      return
    }
    const no = refusalOf(shown, mark, cell)
    if (no !== null) {
      if (refusal.offered) refusal.refuse(no)
      return
    }
    const rect = rectBetween(n, mark, cell)
    if (rect === null) return
    // Worked out from the position the move is leaving, which is the only one
    // the board has: the shell hands the next one back on the render after this.
    const fault = faultOf(shown, rect)
    dispatch({ type: 'place', a: mark, b: cell })
    if (fault === null) return
    light({ where: keyOf(n, rect), shake: fault.kind === 'crowded' ? fault.blamed : [] })
    // The piece really does come off, so the shell's knock underneath it is
    // true and stays; this is the "no" over the top of it.
    playSound('wrong')
    setSaid(describeFault(fault))
  }

  /** Dead only where a rule forbids the move and the settings refuse it up front. */
  const canPress = (cell: number): boolean => {
    if (locked) return false
    if (mark === null || cell === mark) return true
    return refusal.offered || refusalOf(shown, mark, cell) === null
  }

  const focusCell = (cell: number) => {
    setCursor(cell)
    setAim(owner[cell] === -1 ? cell : null)
    refs.current[cell]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (mark === null) return
      event.preventDefault()
      setMark(null)
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
    if (r < 0 || r >= n || c < 0 || c >= n) return
    focusCell(r * n + c)
  }

  /** One square, in words: where it is and what is printed on it. */
  const seatOf = (cell: number): string =>
    `Row ${rowOf(n, cell) + 1}, column ${colOf(n, cell) + 1}, ${
      clues[cell] === 0 ? 'no number' : `the number ${clues[cell]}`
    }.`

  /**
   * What tapping this square does — never which squares the rules allow. While
   * a forbidden move is offered, every square says the same thing, so a child
   * listening works the rule out from the same facts a child looking does. With
   * the setting turned off, the dead square says why, exactly as a dead peg on
   * the tower does.
   */
  const squareLabel = (cell: number): string => {
    const seat = seatOf(cell)
    if (locked) return seat
    if (mark === null) return `${seat} Mark a corner here.`
    if (cell === mark) return `${seat} Drop the corner.`
    const no = refusal.offered ? null : refusalOf(shown, mark, cell)
    if (no !== null) return `${no.message} ${seat}`
    return `${seat} Break off the piece from the corner to here.`
  }

  const slabLabel = (piece: Piece, fault: Fault | null): string => {
    const numbers = numbersIn(shown, piece)
    const holds =
      numbers.length === 0
        ? 'holding no number'
        : `holding the number${numbers.length === 1 ? '' : 's'} ${listOf(numbers)}`
    const seat = `Piece of ${areaOf(piece)} squares at row ${piece.r0 + 1}, column ${
      piece.c0 + 1
    }, ${holds}${fault === null ? '' : ', breaking a rule'}.`
    if (locked) return seat
    if (mark === null) return `${seat} Put it back.`
    const no = refusal.offered ? null : refusalOf(shown, mark, piece.r0 * n + piece.c0)
    if (no !== null) return `${no.message} ${seat}`
    return `${seat} Break off the piece from the corner to here.`
  }

  /**
   * Squares and pieces are disjoint and cover the bar between them, and both
   * are placed on the grid by row and column — so DOM order is free, and it is
   * spent on reading order: down the bar, left to right.
   */
  const items: { at: number; node: ReactNode }[] = []

  for (let cell = 0; cell < n * n; cell++) {
    if (owner[cell] !== -1) continue
    const value = clues[cell]
    items.push({
      at: cell,
      node: (
        <button
          key={`square-${cell}`}
          type="button"
          className={cx(s.square, 'u-press')}
          style={{ gridRow: rowOf(n, cell) + 1, gridColumn: colOf(n, cell) + 1 }}
          ref={(el) => {
            refs.current[cell] = el
          }}
          tabIndex={cursor === cell ? 0 : -1}
          data-marked={cell === mark ? 'true' : undefined}
          disabled={!canPress(cell)}
          aria-label={squareLabel(cell)}
          onFocus={() => {
            setCursor(cell)
            setAim(cell)
          }}
          onMouseEnter={() => setAim(cell)}
          onMouseLeave={() => setAim((over) => (over === cell ? null : over))}
          onClick={() => tap(cell)}
        >
          {value !== 0 && <span className={s.number}>{value}</span>}
        </button>
      ),
    })
  }

  pieces.forEach((piece, at) => {
    const fault = wrong[at]
    const cells = cellsOf(n, piece)
    const name = keyOf(n, piece)
    const covers = cells.includes(cursor)
    items.push({
      at: cells[0],
      node: (
        <button
          key={`piece-${name}`}
          type="button"
          className={cx(s.slab, 'u-press', lit?.where === name && cues.highlight)}
          style={
            {
              gridRow: `${piece.r0 + 1} / ${piece.r1 + 2}`,
              gridColumn: `${piece.c0 + 1} / ${piece.c1 + 2}`,
              '--w': piece.c1 - piece.c0 + 1,
              '--h': piece.r1 - piece.r0 + 1,
            } as CSSProperties
          }
          // Every square it covers, so the arrow keys never walk into a hole in
          // the middle of a big piece and find nothing to focus.
          ref={(el) => {
            for (const cell of cells) refs.current[cell] = el
          }}
          tabIndex={covers ? 0 : -1}
          data-fault={fault === null ? undefined : 'true'}
          disabled={!canPress(cells[0])}
          aria-label={slabLabel(piece, fault)}
          onFocus={() => {
            if (!covers) setCursor(cells[0])
            setAim(null)
          }}
          onMouseEnter={() => setAim(null)}
          onClick={() => tap(cells[0])}
        >
          {cells.map((cell) =>
            clues[cell] === 0 ? null : (
              <span
                key={cell}
                className={cx(s.number, lit?.shake.includes(cell) && cues.shake)}
                style={{
                  gridRow: rowOf(n, cell) - piece.r0 + 1,
                  gridColumn: colOf(n, cell) - piece.c0 + 1,
                }}
              >
                {clues[cell]}
              </span>
            ),
          )}
        </button>
      ),
    })
  })

  items.sort((a, b) => a.at - b.at)

  /**
   * The piece the second tap would break off, outlined from the marked corner.
   * A pointer has to be over a square for it, so a touch player does not get
   * one — and that is now only a cost of comfort, because a mis-tap lands a
   * piece and one tap puts it back.
   */
  const outline = mark !== null && aim !== null && aim !== mark ? rectBetween(n, mark, aim) : null

  /* One line, and only ever one: the rule that has just been broken, what the
     clay ring means, or how much is left to do. A named mistake outranks the
     general sentence — a child who has just broken off four squares for a 6 is
     owed the arithmetic, not the rule. */
  const rule = broken ? (said ?? 'A red ring means a piece is breaking a rule.') : ''
  const note = locked ? '' : refusal.say(rule !== '' ? rule : statusLine(unclaimed(shown)))

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres it, and
          lets a seven-wide bar scroll rather than shrink under a fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`A bar of chocolate, ${n} squares by ${n} squares`}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => item.node)}
          {outline !== null && (
            <div
              className={s.preview}
              aria-hidden="true"
              style={{
                gridRow: `${outline.r0 + 1} / ${outline.r1 + 2}`,
                gridColumn: `${outline.c0 + 1} / ${outline.c1 + 2}`,
              }}
            />
          )}
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{note}</p>
      {/* Only the refusal and the broken rule are announced. The count under
          the bar changes on every move, and reading it out each time is noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say(rule)}
      </p>
    </div>
  )
}
