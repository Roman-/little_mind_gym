import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Clash, Sign, TallAction, TallState } from './logic'
import {
  POST_COLOURS,
  clashOf,
  colOf,
  conflicts,
  describeClash,
  postName,
  rowOf,
  signEndsOf,
  standingClash,
  valuesOf,
  whereFrom,
} from './logic'
import { LiftMark, SignMark } from './glyphs'
import s from './board.module.css'

/**
 * A grid of squares with a post standing in each one, and the signs standing
 * in the seams between them.
 *
 * The squares and the seams are tracks of the same grid rather than an overlay:
 * a sign belongs *between* two squares, and a layout that says so keeps it
 * there at every size without a single coordinate being worked out twice.
 *
 * A move is two taps — the square, then the post that goes in it — and one
 * dispatched action, exactly as the small square is played. Nothing here is
 * ever refused: standing the wrong post up is a move, not a forbidden one, and
 * the way out of it is to take the post away again.
 */

/**
 * One post: a stack of blocks in the height's own colour, standing on the floor
 * of whatever it is inside.
 *
 * Three channels, because one is not enough. Height is the puzzle, and it is
 * also the least legible thing on the board: a five-wide board never lets a
 * square fall under 56px, which leaves one height about ten pixels above the
 * next and each block about eight pixels tall. So the blocks count the post out
 * for anyone who cannot judge ten pixels, and the colour names it outright for
 * anyone reading a row and asking whether the 3 is already in it. None of the
 * three is a numeral, which is the one thing this board must not turn into.
 */
function Post({ value, cue }: { value: number; cue?: string }) {
  if (value === 0) return null
  return (
    <span
      className={cx(s.post, cue)}
      style={{ '--h': String(value), '--post': POST_COLOURS[value - 1] } as CSSProperties}
    >
      {Array.from({ length: value }, (_, k) => (
        <span className={s.block} key={k} />
      ))}
    </span>
  )
}

/** Which way a sign points, and which seam of the grid it stands in. */
function placeSign(n: number, sign: Sign): { points: string; column: number; row: number } {
  const { hi, lo } = sign
  const near = Math.min(hi, lo)
  const r = rowOf(n, near)
  const c = colOf(n, near)
  // Down a column, the sign stands in the seam under the upper square; along a
  // row, in the seam after the left one. Which way round it is follows from
  // which end holds the taller post, because a sign points at the shorter.
  if (hi - lo === n || lo - hi === n) {
    return { points: hi === near ? 'down' : 'up', column: 2 * c + 1, row: 2 * r + 2 }
  }
  return { points: hi === near ? 'right' : 'left', column: 2 * c + 2, row: 2 * r + 1 }
}

const firstBlank = (givens: number[]) => Math.max(0, givens.indexOf(0))

export function Board({ state, dispatch, locked }: BoardProps<TallState, TallAction>) {
  const { n, givens, entries, signs } = state

  /** The square with the amber ring. */
  const [selected, setSelected] = useState<number | null>(null)
  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — otherwise the keyboard would lose its place after every
   * post. The printed posts are the token rather than the whole state for
   * exactly that reason: they are a new array only when a board is dealt, which
   * is the one moment the tab stop should start again.
   */
  const home = useMemo(() => firstBlank(givens), [givens])
  const [cursor, setCursor] = useEphemeral(givens, home)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * A choice does not survive a move: after a rewind the ring would sit on a
   * square the player never picked. The one square that keeps it is the one the
   * browser still has focus on, and that is read from the DOM rather than from
   * stale React state. Before paint, not after: an effect would show one frame
   * of the ring still sitting where the player has just moved away from.
   */
  useLayoutEffect(() => {
    setSelected((cur) => (cur !== null && refs.current[cur] === document.activeElement ? cur : null))
  }, [state])

  const values = useMemo(() => valuesOf(state), [state])
  const wrong = useMemo(() => conflicts(state), [state])
  const broken = wrong.reduce((count, w) => count + (w ? 1 : 0), 0)
  const ends = useMemo(() => signEndsOf(state), [state])
  const heights = useMemo(() => Array.from({ length: n }, (_, i) => i + 1), [n])

  /**
   * The rule a post has just broken, lit for one run of the cue. A red ring
   * says which square is wrong but never what it is wrong with, so the line it
   * repeats a height in lights up whole, or the two squares a sign stands
   * between do, and the posts at fault shake at each other. It is decoration
   * over a move the puzzle has already taken: nothing else reads it, and it
   * takes itself off again.
   */
  const [lit, light] = useCue<Clash>('--dur-5')
  const litUnit = useMemo(() => new Set(lit?.cells), [lit])
  const litPair = useMemo(() => new Set(lit?.blamed), [lit])

  /**
   * The same mistake in words. It is deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until the
   * board has no red square left on it, and it is dropped during render rather
   * than after paint, so a mistake made much later is never announced with the
   * sentence for an older one.
   */
  const [said, setSaid] = useState<string | null>(null)
  if (said !== null && broken === 0) setSaid(null)

  /**
   * Whatever rule the board is standing on, for a red square that arrived
   * without a tap to name it — a rewind through the move tape lands on one.
   * It reports only what is already drawn.
   */
  const standing = useMemo(() => {
    const clash = standingClash(state)
    return clash === null ? '' : describeClash(state, clash)
  }, [state])

  const write = (index: number, value: number) => {
    // The board never sends a move it already knows is a no-op.
    if (locked || givens[index] !== 0 || entries[index] === value) return
    // Worked out from the state the move is leaving, which is the only one the
    // board has: the shell hands the next one back on the render after this.
    const clash = clashOf(state, index, value)
    dispatch({ type: 'set', index, value })
    if (clash === null) return
    light(clash)
    // The post really does go down here, so the shell's knock underneath it is
    // true and stays; this is the "no" over the top of it.
    playSound('wrong')
    setSaid(describeClash(state, clash))
  }

  /** Both pieces of local state follow the focus, so they can never disagree. */
  const markCell = (index: number) => {
    setCursor(index)
    setSelected(index)
  }

  const focusCell = (index: number) => {
    markCell(index)
    refs.current[index]?.focus()
  }

  const stepFrom = (index: number, dr: number, dc: number) => {
    let r = rowOf(n, index) + dr
    let c = colOf(n, index) + dc
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const at = r * n + c
      if (givens[at] === 0) return at
      r += dr
      c += dc
    }
    return null
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
    if (step) {
      const next = stepFrom(cursor, step[0], step[1])
      event.preventDefault()
      if (next !== null) focusCell(next)
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
      event.preventDefault()
      write(cursor, 0)
      return
    }
    if (event.key.length === 1 && event.key >= '1' && event.key <= '9') {
      const value = Number(event.key)
      if (value <= n) {
        event.preventDefault()
        write(cursor, value)
      }
      return
    }
    if (event.key === 'Escape') setSelected(null)
  }

  /**
   * One square in words: where it is, what is standing in it, and what its
   * signs say. The signs are read out because a looker can see them — every
   * square says the same kind of thing, and nothing here says which posts would
   * be legal.
   */
  const seatOf = (index: number): string => {
    const where = `Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1}`
    const printed = givens[index] !== 0 ? ', printed' : ''
    const fault = wrong[index] ? ', breaking a rule' : ''
    const said = ends[index]
      .map((end) => ` ${end.taller ? 'Taller' : 'Shorter'} than the square ${whereFrom(n, index, end.other)}.`)
      .join('')
    return `${where}, ${postName(values[index])}${printed}${fault}.${said}`
  }

  const squares = givens.map((given, i) => {
    const at = { gridColumn: 2 * colOf(n, i) + 1, gridRow: 2 * rowOf(n, i) + 1 }

    if (given !== 0) {
      return (
        <div className={s.cell} style={at} key={i}>
          <div
            className={cx(s.printed, litUnit.has(i) && cues.highlight)}
            role="img"
            aria-label={seatOf(i)}
          >
            <Post value={given} cue={litPair.has(i) ? cues.shake : undefined} />
          </div>
        </div>
      )
    }

    return (
      <div className={s.cell} style={at} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', litUnit.has(i) && cues.highlight)}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-selected={selected === i ? 'true' : undefined}
          data-conflict={wrong[i] ? 'true' : undefined}
          disabled={locked}
          aria-label={seatOf(i)}
          aria-pressed={selected === i}
          onFocus={() => markCell(i)}
          onClick={() => focusCell(i)}
        >
          <Post value={entries[i]} cue={litPair.has(i) ? cues.shake : undefined} />
        </button>
      </div>
    )
  })

  /**
   * The signs, each in the seam it belongs to. They are hidden from a screen
   * reader here and read out in the label of every square they touch instead:
   * a wedge floating between two squares says nothing on its own.
   */
  const marks = signs.map((sign) => {
    const { points, column, row } = placeSign(n, sign)
    return (
      <span
        className={s.sign}
        data-points={points}
        style={{ gridColumn: column, gridRow: row }}
        key={`${sign.hi}:${sign.lo}`}
        aria-hidden="true"
      >
        <SignMark className={s.signMark} />
      </span>
    )
  })

  /* One line, and only ever one: the rule that has just broken, the rule the
     board is still standing on, or what to tap next. */
  const brokenRule = broken === 0 ? '' : (said ?? standing)

  const note = locked
    ? ''
    : brokenRule !== ''
      ? brokenRule
      : selected === null
        ? 'Tap a square, then tap a post.'
        : `Now tap a post for row ${rowOf(n, selected) + 1}, column ${colOf(n, selected) + 1}.`

  return (
    <div className={s.wrap} style={{ '--n': String(n) } as CSSProperties}>
      {/* The shell already sits the board on a stage; this only centres it, and
          lets a five-wide board scroll rather than shrink under a fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--m': String(n - 1) } as CSSProperties}
          role="group"
          aria-label={`Posts on a ${n} by ${n} grid`}
          onKeyDown={onKeyDown}
        >
          {squares}
          {marks}
        </div>
      </div>

      <div className={s.palette} data-size={String(n)}>
        {heights.map((v) => (
          <button
            key={v}
            type="button"
            className={`${s.key} u-press`}
            disabled={locked || selected === null || entries[selected] === v}
            aria-label={`Put ${postName(v)} in the square`}
            onClick={() => selected !== null && write(selected, v)}
          >
            <span className={s.keyWell}>
              <Post value={v} />
            </span>
            {/* Which key on the keyboard stands it up. A height is a value, and
                a value is the one thing the instrument voice is for. */}
            <span className={s.keyCap}>{v}</span>
          </button>
        ))}
        <button
          type="button"
          className={`${s.key} ${s.lift} u-press`}
          disabled={locked || selected === null || entries[selected] === 0}
          aria-label="Take the post out of the square"
          onClick={() => selected !== null && write(selected, 0)}
        >
          <LiftMark className={s.keyGlyph} />
          <span className={s.keyWord}>Take out</span>
        </button>
      </div>

      <p className={s.note}>{note}</p>
      {/* Only the broken rule is announced. Every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : brokenRule}
      </p>
    </div>
  )
}
