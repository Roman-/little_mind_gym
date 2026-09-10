import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Clash, SunsAction, SunsState } from './logic'
import {
  EMPTY,
  MARKS,
  MOON,
  SUN,
  clashOf,
  colOf,
  conflicts,
  describeClash,
  markName,
  rowOf,
} from './logic'
import { MarkGlyph } from './glyphs'
import s from './board.module.css'

/**
 * A grid of squares and two keys under it.
 *
 * The keys are what a tap on the board puts down, and choosing between them is
 * board-local: it is the selection step the contract allows, so it costs no
 * move and one tap fills one square with either mark. That is the whole reason
 * `par` can honestly be the number of empty squares. Tapping a square that
 * already holds the chosen mark takes it off again, which is the way back out
 * of a guess.
 *
 * A mark that breaks a rule is not refused — there is nothing here a rule
 * forbids you to try. It goes down, the group it spoils lights up, the squares
 * at fault shake, and one sentence says which of the two rules it was. Rubbing
 * it out is a move like any other, exactly as it is in the small square.
 */

/** "Sun" and "Moon" on the keys: the name of the thing, said as a word. */
const wordFor = (value: number) => {
  const name = markName(value)
  return name[0].toUpperCase() + name.slice(1)
}

const firstBlankIn = (givens: number[]) => Math.max(0, givens.indexOf(EMPTY))

/**
 * A mark that has gone down and broken a rule: which square it went into, and
 * what went in it. The board keeps this rather than the finished clash, so
 * every render can ask the state in front of it whether that mark is still
 * there and still wrong.
 */
type Blame = { index: number; value: number }

export function Board({ state, dispatch, locked }: BoardProps<SunsState, SunsAction>) {
  const { n, givens, entries } = state

  /**
   * Which mark the next tap puts down, and which square owns the tab stop.
   * Both are board-local, and both take the printed marks as their token
   * rather than the whole state: they are a new array only when a new board is
   * dealt, which is the one moment either should start again. Keyed on the
   * state itself, the chosen mark would fall back to the sun after every
   * square, and a child playing by keyboard would be sent back to the first
   * empty square after every mark.
   */
  const [brush, setBrush] = useEphemeral(givens, SUN)
  const [cursor, setCursor] = useEphemeral(givens, firstBlankIn(givens))
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  const wrong = useMemo(() => conflicts(state), [state])
  const broken = wrong.some(Boolean)

  /**
   * What a blamed mark is breaking *now*, worked out from the state in front
   * of us — or null once it has been rubbed out, stepped back over, or put
   * right by something written since. Both the lit group and the sentence go
   * through this rather than keeping a clash of their own, so neither can
   * outlive the mark it is about: the move tape can rewind under a cue that is
   * still running, and a group lit over a board with nothing wrong on it, or a
   * sentence about a mark that is no longer there, would both be lies.
   */
  const clashNow = (blame: Blame | null): Clash | null =>
    blame === null || entries[blame.index] !== blame.value
      ? null
      : clashOf(state, blame.index, blame.value)

  /**
   * The group a mark has just spoiled, lit for one run of the cue. A red ring
   * says which square is wrong but never what it is wrong with, so either the
   * three squares in a line light up or the whole row or column does — and
   * which of those it is *is* the answer to "which rule did I break". The
   * squares holding the mark shake inside it. It is decoration over a move the
   * puzzle has already taken: nothing else reads it, and it takes itself off
   * again — at the end of the run, or the moment the mistake it is about
   * leaves the board, whichever comes first.
   */
  const [lit, light] = useCue<Blame>('--dur-5')
  const litClash = clashNow(lit)
  const litGroup = new Set(litClash?.cells)
  const litMarks = new Set(litClash?.blamed)

  /**
   * The same mistake in words, and deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until
   * the mark it names is off the board or right again, and it is dropped
   * during render rather than after paint, so no mistake is ever announced
   * with the sentence for another one.
   */
  const [blamed, setBlamed] = useState<Blame | null>(null)
  const saidClash = clashNow(blamed)
  if (blamed !== null && saidClash === null) setBlamed(null)
  const said = saidClash === null ? null : describeClash(saidClash)

  const write = (index: number, value: number) => {
    // The board never sends a move it already knows is a no-op.
    if (locked || givens[index] !== EMPTY || entries[index] === value) return
    // Whether the mark breaks a rule at all is asked of the state the move is
    // leaving, which is the only one the board has: the shell hands the next
    // one back on the render after this. Which rule it is breaking is asked
    // again on every render after that, of the board as it stands then.
    const clash = clashOf(state, index, value)
    dispatch({ type: 'set', index, value })
    // A mark written from the keyboard picks the key up as well, so the two
    // ways of playing can never disagree about what a tap would put down.
    if (value !== EMPTY) setBrush(value)
    if (clash === null) return
    light({ index, value })
    // The mark really does go down, so the shell's knock underneath is true
    // and stays; this is the "no" over the top of it.
    playSound('wrong')
    setBlamed({ index, value })
  }

  /** A tap on a square: the chosen mark goes in, or comes off if it is already there. */
  const tap = (index: number) => write(index, entries[index] === brush ? EMPTY : brush)

  const focusCell = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  /** The next square you can write in, in that direction. Printed squares are stepped over. */
  const stepFrom = (index: number, dr: number, dc: number) => {
    let r = rowOf(n, index) + dr
    let c = colOf(n, index) + dc
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const at = r * n + c
      if (givens[at] === EMPTY) return at
      r += dr
      c += dc
    }
    return null
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A chord belongs to the browser. This board is the one that binds letters,
    // and s is the most common chord there is: Ctrl+S saves the page, and a
    // board that put a sun down and swallowed the save would be taking a key
    // it was never offered.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (locked) return
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = steps[event.key]
    if (step) {
      event.preventDefault()
      const next = stepFrom(cursor, step[0], step[1])
      if (next !== null) focusCell(next)
      return
    }
    const key = event.key.toLowerCase()
    if (key === 's' || key === '1') {
      event.preventDefault()
      write(cursor, SUN)
      return
    }
    if (key === 'm' || key === '2') {
      event.preventDefault()
      write(cursor, MOON)
      return
    }
    if (key === 'backspace' || key === 'delete' || key === '0') {
      event.preventDefault()
      write(cursor, EMPTY)
    }
  }

  const squares = givens.map((given, i) => {
    const r = rowOf(n, i)
    const c = colOf(n, i)
    const top = r === 0 ? undefined : 'hair'
    const left = c === 0 ? undefined : 'hair'
    const where = `Row ${r + 1}, column ${c + 1}`

    if (given !== EMPTY) {
      return (
        <div className={s.cell} data-top={top} data-left={left} key={i}>
          <div
            className={cx(s.given, litGroup.has(i) && cues.highlight)}
            role="img"
            aria-label={`${where}, ${markName(given)}, printed`}
          >
            <MarkGlyph
              value={given}
              className={cx(s.art, litMarks.has(i) && cues.shake)}
            />
          </div>
        </div>
      )
    }

    const value = entries[i]
    const label = `${where}, ${markName(value)}${wrong[i] ? ', breaking a rule' : ''}`
    return (
      <div className={s.cell} data-top={top} data-left={left} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', litGroup.has(i) && cues.highlight)}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-conflict={wrong[i] ? 'true' : undefined}
          disabled={locked}
          aria-label={label}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          <MarkGlyph value={value} className={cx(s.art, litMarks.has(i) && cues.shake)} />
        </button>
      </div>
    )
  })

  /* One line, and only ever one: the rule that has just been broken, what red
     means, or what the next tap will do. The named mistake outranks the
     general sentence — a child who has just made three suns in a line is owed
     the three suns, not the rule.

     The quiet line is also the only thing that tells a child how to take a
     mark off again, so it says both halves of what a tap does. The
     instructions say it as well, for the moment a mark goes red and this line
     is busy with the rule that it broke. */
  const rule = broken ? (said ?? 'Red means a sun or a moon is breaking one of the two rules.') : ''
  const mark = markName(brush)
  const note = locked
    ? ''
    : rule !== ''
      ? rule
      : `Tap a square to put a ${mark} in it. Tap that ${mark} again to take it out.`

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres it,
          and lets an eight-wide grid scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`${n} by ${n} grid`}
          onKeyDown={onKeyDown}
        >
          {squares}
        </div>
      </div>

      <div className={s.palette}>
        {MARKS.map((mark) => (
          <button
            key={mark}
            type="button"
            className={`${s.key} u-press`}
            aria-pressed={brush === mark}
            disabled={locked}
            aria-label={`Put ${markName(mark)}s down`}
            onClick={() => setBrush(mark)}
          >
            <MarkGlyph value={mark} className={s.keyArt} />
            <span className={s.keyWord}>{wordFor(mark)}</span>
          </button>
        ))}
      </div>

      <p className={s.note}>{note}</p>
      {/* Only the broken rule is announced. Every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : rule}
      </p>
    </div>
  )
}
