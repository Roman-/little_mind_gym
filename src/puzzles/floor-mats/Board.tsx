import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Fault, Mat, MatsAction, MatsState } from './logic'
import {
  NONE,
  PLUS,
  bare,
  cellsOf,
  colOf,
  describeFault,
  faultOf,
  faults,
  keyOf,
  markWord,
  marksIn,
  newestFault,
  ownerOf,
  rectBetween,
  refusalOf,
  rowOf,
  sizeWords,
  uncovered,
} from './logic'
import { MarkGlyph } from './glyphs'
import s from './board.module.css'

/**
 * How much is left to do, counted in marks. It is only ever shown while no mat
 * on the floor breaks a rule, and only while some mark is still uncovered —
 * past that, `bareWords` takes over.
 */
function countWords(marks: number): string {
  if (marks === 1) return '1 mark still needs a mat.'
  if (marks > 1) return `${marks} marks still need a mat.`
  return ''
}

/**
 * The line for the one position the chocolate bar never reaches. There, the
 * numbers add up to the whole bar, so "every number has a good piece" means
 * "finished". A shape does not fix a size, so here every mark can be under a
 * good mat with squares still bare — and without this line the board would go
 * quiet on a floor that is not done, with no ring and no count to say why.
 *
 * It says only what a child can see: every mark has a mat, and this many
 * squares have none. It does not say which mats are wrong, and that the floor
 * is unsolved is already plain from the missing stamp. A player who lays one
 * good mat for every mark reaches this position on 128 of 300 floors at four
 * across, 90 at five and 47 at six; one who always lays the smallest good mat
 * reaches it on 229, 186 and 152.
 */
function bareWords(squares: number): string {
  if (squares === 1) return 'Every mark has a mat. 1 square is still bare.'
  if (squares > 1) return `Every mark has a mat. ${squares} squares are still bare.`
  return ''
}

/** "a plus", "a plus and a flat line", "a plus, a flat line and a standing line". */
function listOf(words: string[]): string {
  if (words.length < 2) return words[0] ?? 'no mark'
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

export function Board({ state, dispatch, locked }: BoardProps<MatsState, MatsAction>) {
  /**
   * The one move this puzzle refuses is a rectangle laid over a mat that is
   * already down, and nothing about that can pretend to move — so
   * `refusal.shown` is always `state` here, and the board deliberately does not
   * sit still for `refusal.busy`. A board whose refusal moves nothing has
   * nothing to wait for, and gating on it would swallow the child's next tap
   * for the length of a cue every time.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n, marks, mats } = shown

  const owner = useMemo(() => ownerOf(shown), [shown])
  const wrong = useMemo(() => faults(shown), [shown])

  /**
   * The first of the two corners, held here rather than dispatched: one action
   * is one mat, which is one move a child would count. It clears itself
   * whenever the floor moves, and a refusal moves nothing, so a child whose
   * rectangle ran over a mat keeps their corner and tries another one.
   */
  const [corner, setCorner] = useEphemeral<number | null>(shown, null)

  /**
   * Why a corner on a plus let go instead of laying a mat, said once and kept
   * until the next move, the way the refusal's sentence is kept.
   *
   * The words allow a mat of one square — "a mat with a plus is a square", and
   * one square is a square — so a child tapping a plus twice is often asking
   * for exactly that, and the board lets go instead, because a second tap on
   * the marked corner is a change of mind here as it is on the chocolate bar.
   * Letting go of a plus without a word, as the board first did, left that
   * child with nothing to go on. The sentence changes no rule: no answer holds
   * a mat of one square, and the solver and the counters still count one, so
   * a floor with one answer has one under the words as the child reads them.
   * A corner let go on any other square stays silent, because a mat of one
   * square could not be good there anyway.
   */
  const [dropped, setDropped] = useEphemeral(shown, '')

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the top-left after every mat. The marks are the token rather than the
   * whole state for exactly that reason: they are a new array only when a new
   * floor is dealt, which is the one moment the tab stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(marks, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /** The square the second corner is currently over, for the outline. */
  const [aim, setAim] = useState<number | null>(null)

  /**
   * A mat that landed breaking a rule, lit for one run of the cue: the whole
   * rectangle held long enough to be looked at, which is the reading a mat of
   * the wrong shape asks for. Two marks under one mat shake as well, the way
   * the chocolate bar's two numbers do. It is decoration over a move the puzzle
   * has already taken: nothing else reads it, and it takes itself off again.
   */
  const [lit, light] = useCue<{ where: string; shake: number[] }>('--dur-5')
  const glow = locked ? null : lit

  const tap = (cell: number) => {
    if (locked) return
    if (corner === null) {
      // No corner marked: a mat lifts, and bare floor takes the first corner.
      // There is no mode to collide, because with a corner marked a tap on a
      // mat is a rectangle running over it, never a lift.
      if (owner[cell] !== -1) dispatch({ type: 'lift', cell })
      else {
        setCorner(cell)
        setDropped('')
      }
      return
    }
    if (cell === corner) {
      setCorner(null)
      setDropped(marks[cell] === PLUS ? 'A mat covers at least two squares.' : '')
      return
    }
    const no = refusalOf(shown, corner, cell)
    if (no !== null) {
      if (refusal.offered) refusal.refuse(no)
      return
    }
    const rect = rectBetween(n, corner, cell)
    if (rect === null) return
    // Worked out from the position the move is leaving, which is the only one
    // the board has: the shell hands the next one back on the render after
    // this. Only the cues come from it. The sentence is worked out from the
    // state on every render, so it cannot outlive the mat it is about.
    const fault = faultOf(shown, rect)
    dispatch({ type: 'lay', a: corner, b: cell })
    if (fault === null) return
    light({ where: keyOf(n, rect), shake: fault.kind === 'crowded' ? fault.blamed : [] })
    // The mat really does go down, so the shell's knock underneath it is true
    // and stays; this is the "no" over the top of it.
    playSound('wrong')
  }

  /** Dead only where a rule forbids the move and the settings refuse it up front. */
  const canPress = (cell: number): boolean => {
    if (locked) return false
    if (corner === null || cell === corner) return true
    return refusal.offered || refusalOf(shown, corner, cell) === null
  }

  /**
   * Where the tab stop stands: on the cursor, unless the cursor is on a control
   * that is dead right now, and then on the marked corner. A browser will not
   * focus a disabled button, so a tab stop left on one takes the whole floor
   * out of the Tab order, and a child playing by keyboard cannot get back in to
   * press Escape. The cursor can be left there by a pointer — Safari does not
   * focus a button it clicks, so marking a corner with the mouse does not move
   * the cursor off a mat that the corner has just made dead. The corner itself
   * is always live, and short of a locked floor nothing is dead without one.
   */
  const stop = canPress(cursor) ? cursor : (corner ?? cursor)

  const focusCell = (cell: number) => {
    setCursor(cell)
    setAim(owner[cell] === -1 ? cell : null)
    refs.current[cell]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (corner === null) return
      event.preventDefault()
      setCorner(null)
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
    // A dead control is a wall, the way the edge is: `focus()` does nothing on
    // a disabled button, so stepping onto one would move the tab stop to where
    // focus cannot follow it. Walking on past it would find nothing either.
    // Along any line of squares, the rectangle from the corner only shrinks
    // while the step comes towards the corner and only grows once it goes
    // away, and a rectangle that runs over a mat is dead however much it
    // grows — so the live squares on a line are one unbroken run, and the
    // cursor is already on it.
    if (!canPress(r * n + c)) return
    focusCell(r * n + c)
  }

  /**
   * What tapping this square does — never which squares the rules allow. While
   * a forbidden move is offered, every square says the same thing, so a child
   * listening works the rule out from the same facts a child looking does. With
   * the setting turned off, the dead square says why, exactly as a dead peg on
   * the tower does.
   */
  const squareLabel = (cell: number): string => {
    const seat = `Row ${rowOf(n, cell) + 1}, column ${colOf(n, cell) + 1}, ${markWord(marks[cell])}.`
    if (locked) return seat
    if (corner === null) return `${seat} Mark a corner here.`
    if (cell === corner) return `${seat} Drop the corner.`
    const no = refusal.offered ? null : refusalOf(shown, corner, cell)
    if (no !== null) return `${no.message} ${seat}`
    return `${seat} Lay a mat from the corner to here.`
  }

  /** A mat in words: its size, where it lies, what is on it. Never whether it is the right one. */
  const matLabel = (mat: Mat, fault: Fault | null): string => {
    const holding = listOf(marksIn(shown, mat).map(markWord))
    const seat = `Mat ${sizeWords(mat)} at row ${mat.r0 + 1}, column ${mat.c0 + 1}, holding ${holding}${
      fault === null ? '' : ', breaking a rule'
    }.`
    if (locked) return seat
    if (corner === null) return `${seat} Lift it.`
    const no = refusal.offered ? null : refusalOf(shown, corner, mat.r0 * n + mat.c0)
    if (no !== null) return `${no.message} ${seat}`
    return `${seat} Lay a mat from the corner to here.`
  }

  /**
   * Bare squares and mats are disjoint and cover the floor between them, and
   * both are placed on the grid by row and column — so DOM order is free, and
   * it is spent on reading order: down the floor, left to right.
   */
  const items: { at: number; node: ReactNode }[] = []

  for (let cell = 0; cell < n * n; cell++) {
    if (owner[cell] !== -1) continue
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
          tabIndex={stop === cell ? 0 : -1}
          data-marked={cell === corner ? 'true' : undefined}
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
          <MarkGlyph mark={marks[cell]} className={s.glyph} />
        </button>
      ),
    })
  }

  mats.forEach((mat, at) => {
    const fault = wrong[at]
    const cells = cellsOf(n, mat)
    const name = keyOf(n, mat)
    const holds = cells.includes(cursor)
    const flash = refusal.flash(name)
    items.push({
      at: cells[0],
      node: (
        /* Three layers, one cue each, because one element runs one animation
           and a mat can be asked for three at once — a refusal a moment after
           it landed breaking a rule. The slot is what sits on the grid and
           takes the flash: where the mat in the way is. It is lifted over its
           neighbours while it does, because the outline reaches past the
           groove and the squares after it in reading order would otherwise
           paint over its bottom and right. The mat inside it shakes, the whole
           slab, so that a mat with no mark on it moves as well: it will not
           move out of the way. The field inside that takes the light of a mat
           that has just landed breaking a rule. */
        <span
          key={`mat-${name}`}
          className={cx(s.slot, flash)}
          data-refused={flash === undefined ? undefined : 'true'}
          style={
            {
              gridRow: `${mat.r0 + 1} / ${mat.r1 + 2}`,
              gridColumn: `${mat.c0 + 1} / ${mat.c1 + 2}`,
              '--w': mat.c1 - mat.c0 + 1,
              '--h': mat.r1 - mat.r0 + 1,
            } as CSSProperties
          }
        >
          <button
            type="button"
            className={cx(s.mat, 'u-press', refusal.shake(name))}
            // Every square it covers, so the arrow keys never walk into a hole
            // in the middle of a big mat and find nothing to focus.
            ref={(el) => {
              for (const cell of cells) refs.current[cell] = el
            }}
            tabIndex={cells.includes(stop) ? 0 : -1}
            data-fault={fault === null ? undefined : 'true'}
            disabled={!canPress(cells[0])}
            aria-label={matLabel(mat, fault)}
            onFocus={() => {
              if (!holds) setCursor(cells[0])
              setAim(null)
            }}
            onMouseEnter={() => setAim(null)}
            onClick={() => tap(cells[0])}
          >
            <span className={cx(s.field, glow?.where === name && cues.highlight)}>
              {cells.map((cell) =>
                marks[cell] === NONE ? null : (
                  <span
                    key={cell}
                    className={cx(s.mark, glow?.shake.includes(cell) && cues.shake)}
                    style={{
                      gridRow: rowOf(n, cell) - mat.r0 + 1,
                      gridColumn: colOf(n, cell) - mat.c0 + 1,
                    }}
                  >
                    <MarkGlyph mark={marks[cell]} className={s.glyph} />
                  </span>
                ),
              )}
            </span>
          </button>
        </span>
      ),
    })
  })

  items.sort((a, b) => a.at - b.at)

  /**
   * The mat the second tap would lay, outlined from the marked corner. It says
   * nothing about the mat — no size, no shape word, no verdict — because
   * measuring it against the mark is the puzzle. A pointer or the keyboard has
   * to be over a square for it, so a touch player does not get one, and that
   * is only a cost of comfort: a mis-tap lands a mat and one tap lifts it.
   */
  const outline =
    corner !== null && aim !== null && aim !== corner ? rectBetween(n, corner, aim) : null

  /* One line under the floor. Either what the child has just been told — a
     refusal, or why a corner on a plus let go — or else the newest broken rule,
     the corner in progress, the bare squares, or how many marks are left. The
     rule comes from the state on every render, never from something the board
     kept when the mat landed, so lifting a mat or rewinding the move tape
     always lands on the sentence that belongs to the floor in front of it.

     What the child was just told stands alone, with nothing but the corner
     line after it. A broken rule is said about "this mat", and after a refusal
     the mat the eye has just been sent to is the one that flashed, which is
     seldom the broken one. Played, "A mat is already lying there. This mat has
     more than one mark on it." stood under a flashing mat with no mark on it,
     and a flashing good mat was told it was the wrong shape. The clay ring
     goes on marking the broken mat meanwhile, and its sentence is back on the
     next move, which is when `useRefusal` and `dropped` let theirs go. The
     corner line is the one sentence that can follow, because it names no mat
     and it is true: a refusal keeps the corner. A corner let go on a plus has
     no corner left, so that sentence stands alone. */
  const fault = newestFault(shown)
  const rule = fault === null ? '' : describeFault(fault)
  const left = uncovered(shown)
  const bareLine = fault === null && left === 0 ? bareWords(bare(shown)) : ''
  const cornerLine = corner === null ? '' : 'Now tap the opposite corner.'
  // A plus let go is newer than any refusal still standing: marking the corner
  // that a refusal needs clears it, so the two never stand in the other order.
  const told = dropped || refusal.say('')
  const note = locked
    ? ''
    : told !== ''
      ? [told, cornerLine].filter(Boolean).join(' ')
      : rule || cornerLine || bareLine || countWords(left)
  /* The refusal, the plus let go, the broken rule and the bare line are
     announced, and by the same rule: what the child was just told stands
     alone. The bare line is the only way a child who cannot see the floor
     learns that every mark has a mat and squares are still bare, and it
     appears only in that position, so it is news rather than noise. The count
     changes on every move, and reading it out each time would be. */
  const status = locked ? '' : told || rule || bareLine

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres it, and
          lets the six-wide floor slide rather than shrink under a fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`A floor, ${n} squares by ${n} squares`}
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
      <p className="u-sr" role="status">
        {status}
      </p>
    </div>
  )
}
