import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Clash, FenceAction, FenceState } from './logic'
import {
  BACK,
  BLANK,
  CORNERS,
  EMPTY,
  FENCES,
  FORWARD,
  blankCount,
  clashOf,
  colOf,
  conflicts,
  cornersOf,
  describeClash,
  fenceName,
  rowOf,
  shortPosts,
  wantsPhrase,
} from './logic'
import { FenceGlyph, RubberGlyph } from './glyphs'
import s from './board.module.css'

/**
 * A grid of squares with a post at every corner, and three keys under it.
 *
 * A move is two taps — the square, then the fence that goes in it — and one
 * dispatched action, exactly as the small square is played. Not suns and
 * moons' brush: a post decides the squares round it with *mixed* fences — a
 * full inside post turns its four neighbours away with '/', '\', '\' and '/' —
 * so a brush would be switched up to three times inside one deduction, and
 * every slip would land as a counted move. And not a tap that cycles: empty,
 * then '\', then '/' would cost two moves to put a '/' down, and par would
 * stop being the number of empty squares.
 *
 * The note on the clay ring
 * -------------------------
 *
 * What goes red, and what stays quiet, is the one decision on this board that
 * is about the oracle rather than the drawing. Measured on the shipped
 * generator, over 400 boards a level (`makeRng(1000 + k * 37)`), with two
 * players who reason about nothing. The tapper walks the empty squares in a
 * shuffled order, tosses a coin for a fence in each, and puts the other fence
 * whenever the coin's would go red. The prober sweeps the board again and
 * again and keeps a fence only when the other one goes red. Each has its own
 * random stream, a level at a time.
 *
 *   What goes red                          tapper solves    prober solves
 *   a post with too many, and a ring       21 / 1 / 0       5 / 0 / 0
 *   + a short post with every square full  79 / 10 / 2      99 / 47 / 16
 *   + a post that can no longer reach it   154 / 35 / 5     400 / 400 / 400
 *
 * So a post that is *short* is never flagged, not even with every square round
 * it filled. "Can no longer reach its number" is the whole solver handed over
 * a tap at a time: the prober finishes every board at every level. Even the
 * milder "short, with nothing left round it" lifts it from 5 boards to 99 at
 * four by four, and from none to 47 at five by five. The candles leave a short
 * wall silent and the counting squares a short number, for the same reason.
 *
 * What is said instead, once every square has a fence, is how many posts are
 * still short, as the candles say it about their walls. Measured the same way
 * with a climber that flips random fences and keeps a flip only when that
 * count does not rise, against the same climber told only "solved or not":
 * within 400 flips, over 200 boards a level, it solves 91 against 128, 58
 * against 52, and 12 against 10, and never at par. The count makes random
 * flipping cheaper, not more successful, and it tells a child who is finished
 * but wrong where to look.
 *
 * And a fence that goes red is not refused. There is nothing here a rule
 * forbids you to try: it goes down, the ring or the post it spoils lights up,
 * the fences at fault shake, and one sentence says which rule it was. A ring
 * that lands stays on the board, lit in clay, until the child breaks it — and
 * that is how the ring rule is learned, by looking at a ring and tracing it
 * round. So the whole ring is standing state, the way a post's clay ring is,
 * and not only the cue: every square of it keeps a clay ground, the printed
 * ones too, for as long as the ring is closed. The child's own fences on it
 * wear a red square's clay ring as well; a printed one keeps only the ground,
 * because a printed fence is never the wrong one. Without that ground, what
 * was left of a ring once the cue had run was its red squares alone: 57%, 59%
 * and 61% of it, measured over 200 boards a level by trying the wrong fence
 * in every empty square as the answer went in. Under reduced motion the ring
 * was never shown whole at all. A refused ring would show for one cue and
 * vanish. The oracle does not mind either way: the shell counts the history,
 * and Step back is always in the toolbar, so a tapper who steps back from
 * every red fence scores par on exactly the 21, 1 and 0 boards that a refusal
 * would give it — against the counting squares' 22, 2 and 0, which shipped.
 */

const firstBlank = (givens: number[]) => Math.max(0, givens.indexOf(EMPTY))

/**
 * What is left to say once every square has a fence and nothing is red. Such
 * a board is either solved, and the shell has locked it, or it has a post
 * still short of its number: the tests prove there is no third kind.
 */
function fullLine(short: number): string {
  if (short === 1) return 'Every square has a fence. 1 post still wants another fence.'
  if (short > 1) return `Every square has a fence. ${short} posts still want more fences.`
  return ''
}

/**
 * A fence that has gone down and broken a rule: which square it went into,
 * and which fence it was. The board keeps this rather than the finished clash,
 * so every render can ask the state in front of it whether that fence is still
 * there and still wrong.
 */
type Blame = { index: number; value: number }

/**
 * One fence, drawn as a rail from post to post. It is laid over the square
 * rather than inside it: the square sinks under a press and the rail does not,
 * because the rail is fixed to its posts. It is drawn in a one-by-one box
 * stretched over the whole cell, so its ends run exactly into two post
 * centres at any size, and the stylesheet keeps its stroke the same width
 * however far that box stretches.
 */
function Rail({ value, cue }: { value: number; cue?: string }) {
  if (value === EMPTY) return null
  const [y1, y2] = value === BACK ? [0, 1] : [1, 0]
  return (
    <svg
      className={cx(s.fence, cue)}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line className={s.railEdge} x1={0} y1={y1} x2={1} y2={y2} />
      <line className={s.rail} x1={0} y1={y1} x2={1} y2={y2} />
    </svg>
  )
}

export function Board({ state, dispatch, locked }: BoardProps<FenceState, FenceAction>) {
  const { n, clues, givens, entries } = state

  /** The square with the amber ring. */
  const [selected, setSelected] = useState<number | null>(null)
  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — otherwise the keyboard would lose its place after every
   * fence. The printed fences are the token rather than the whole state for
   * exactly that reason: they are a new array only when a board is dealt,
   * which is the one moment the tab stop should start again.
   */
  const home = useMemo(() => firstBlank(givens), [givens])
  const [cursor, setCursor] = useEphemeral(givens, home)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * A choice does not survive a move: after a rewind the ring would sit on a
   * square the player never picked. The one square that keeps it is the one
   * the browser still has focus on, and that is read from the DOM rather than
   * from stale React state. Before paint, not after: an effect would show one
   * frame of the ring still sitting where the player has just moved away from.
   * This is the one piece of board-local state that `useEphemeral` does not
   * hold, because it has to live through a move the keyboard made, and only
   * the focus can tell that move apart from a rewind.
   */
  useLayoutEffect(() => {
    setSelected((cur) => (cur !== null && refs.current[cur] === document.activeElement ? cur : null))
  }, [state])

  const wrong = useMemo(() => conflicts(state), [state])
  const broken = wrong.squares.some(Boolean)

  /**
   * What a blamed fence is breaking *now*, worked out from the state in front
   * of us — or null once it has been rubbed out, stepped back over, or put
   * right by a fence changed somewhere else on the ring. Both the lit group
   * and the sentence go through this rather than keeping a clash of their
   * own, so neither can outlive the fence it is about: the move tape can
   * rewind under a cue that is still running, and a ring lit over a board with
   * no ring on it would be a lie.
   */
  const clashNow = (blame: Blame | null): Clash | null =>
    blame === null || entries[blame.index] !== blame.value
      ? null
      : clashOf(state, blame.index, blame.value)

  /**
   * The group a fence has just spoiled, lit for one run of the cue. A red
   * square says which fence is wrong but never what it is wrong with, so either
   * every square of the ring lights up, or the squares round the post that has
   * too many — and which of those it is *is* the answer to "which rule did I
   * break". The fences at fault shake inside it: every fence on the ring, or
   * every fence touching the post, printed ones included. The fence just put
   * down is not singled out, because it is the right one in about a third of
   * real ring clashes, and it is some other fence of the child's that is
   * wrong.
   */
  const [lit, light] = useCue<Blame>('--dur-5')
  const litClash = clashNow(lit)
  const litSquares = new Set(litClash?.squares)
  const litFences = new Set(litClash?.blamed)

  /**
   * The same mistake in words, and deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until the
   * fence it names is off the board or no longer wrong, and it is dropped
   * during render rather than after paint, so no mistake is ever announced with
   * the sentence for another one.
   */
  const [blamed, setBlamed] = useState<Blame | null>(null)
  const saidClash = clashNow(blamed)
  if (blamed !== null && saidClash === null) setBlamed(null)
  const said = saidClash === null ? null : describeClash(saidClash)

  const write = (index: number, value: number) => {
    // The board never sends a move it already knows is a no-op.
    if (locked || givens[index] !== EMPTY || entries[index] === value) return
    // Whether the fence breaks a rule at all is asked of the state the move is
    // leaving, which is the only one the board has: the shell hands the next
    // one back on the render after this. Which rule it is breaking is asked
    // again on every render after that, of the board as it stands then.
    const clash = clashOf(state, index, value)
    dispatch({ type: 'set', index, value })
    if (clash === null) return
    light({ index, value })
    // The fence really does go down, so the shell's knock underneath is true
    // and stays; this is the "no" over the top of it.
    playSound('wrong')
    setBlamed({ index, value })
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
    // A chord belongs to the browser. On the AltGr layouts — Windows German,
    // French, Spanish, Italian and Nordic — '\' arrives with ctrlKey and altKey
    // both set, and on a German Mac it arrives with altKey, so this guard wins
    // there and the key never reaches the board. That loses nothing: 1 and 2
    // are the fence keys on every layout, and '\' and '/' are only extras for
    // the layouts that type them without a chord.
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
    // Every key the board answers is taken from the browser as well. That is
    // what stops Firefox's quick find opening on '/' while the grid has focus.
    //
    // A fence typed after Escape goes into the square the focus is on, and
    // that square takes the amber ring back first: the square a fence goes
    // into is always the one that is lit, and never one that Escape has just
    // put down.
    const typed = (value: number) => {
      event.preventDefault()
      markCell(cursor)
      write(cursor, value)
    }
    const key = event.key
    if (key === '1' || key === '\\') return typed(BACK)
    if (key === '2' || key === '/') return typed(FORWARD)
    if (key === 'Backspace' || key === 'Delete' || key === '0') return typed(EMPTY)
    if (key === 'Escape') {
      event.preventDefault()
      setSelected(null)
    }
  }

  /**
   * One square in words: where it is, which fence is in it, and what every
   * numbered post at its corners asks for. The posts themselves are hidden
   * from a screen reader, so each square repeats its own corners, and a post
   * is counted by visiting the squares round it — which is what a looker's eye
   * does too. "The post at top left wants 2 fences", never "post 2 at top
   * left": after "row 2, column 3" a bare number is heard as a place. The
   * phrase is the one the sentence under the board uses, so a post is named
   * the same way in both. No label says a count, or whether a fence is right.
   * A printed square on a closed ring says so, because a looker sees its clay
   * ground: that is how "These fences" can be followed round by ear. The
   * child's own fences on the ring already say they are breaking a rule.
   */
  const labelOf = (index: number): string => {
    const where = `Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1}`
    const corners = cornersOf(n, index)
      .map((post, k) =>
        clues[post] === BLANK
          ? ''
          : ` The post at ${CORNERS[k]} wants ${wantsPhrase(clues[post])}${wrong.posts[post] ? ' and has too many' : ''}.`,
      )
      .join('')
    if (givens[index] !== EMPTY) {
      const ring = wrong.ring[index] ? ', on a closed ring' : ''
      return `${where}, ${fenceName(givens[index])}, printed${ring}.${corners}`
    }
    const fault = wrong.squares[index] ? ', breaking a rule' : ''
    return `${where}, ${fenceName(entries[index])}${fault}.${corners}`
  }

  const squares = givens.map((given, i) => {
    const top = rowOf(n, i) === 0 ? undefined : 'hair'
    const left = colOf(n, i) === 0 ? undefined : 'hair'
    const shake = litFences.has(i) ? cues.shake : undefined
    // Standing state, not a cue: every square of a closed ring, printed or not.
    const ring = wrong.ring[i] ? 'true' : undefined

    if (given !== EMPTY) {
      return (
        <div className={s.cell} data-top={top} data-left={left} key={i}>
          <div
            className={cx(s.given, litSquares.has(i) && cues.highlight)}
            role="img"
            data-ring={ring}
            aria-label={labelOf(i)}
          />
          <Rail value={given} cue={shake} />
        </div>
      )
    }

    return (
      <div className={s.cell} data-top={top} data-left={left} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', litSquares.has(i) && cues.highlight)}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-selected={selected === i ? 'true' : undefined}
          data-conflict={wrong.squares[i] ? 'true' : undefined}
          data-ring={ring}
          disabled={locked}
          aria-label={labelOf(i)}
          aria-pressed={selected === i}
          onFocus={() => markCell(i)}
          onClick={() => focusCell(i)}
        />
        <Rail value={entries[i]} cue={shake} />
      </div>
    )
  })

  /**
   * Every post, numbered or not, on the corner it stands on. A rail always ends
   * under a disc or a dot, so a line of fences can be followed from post to
   * post by eye. A post with too many fences wears a standing clay ring for as
   * long as it has too many: that is state, not a cue. Nothing here is a
   * control, and the squares already say every number out loud.
   */
  const posts = clues.map((clue, p) => {
    const at = {
      '--r': String(Math.floor(p / (n + 1))),
      '--c': String(p % (n + 1)),
    } as CSSProperties
    if (clue === BLANK) return <span className={s.dot} style={at} key={p} />
    return (
      <span className={s.post} style={at} data-over={wrong.posts[p] ? 'true' : undefined} key={p}>
        <span className={s.num}>{clue}</span>
      </span>
    )
  })

  /* One line, and only ever one: the rule that has just been broken, what red
     means, how many posts are still short once every square has a fence, or
     what to tap next. The named mistake outranks the general sentence — a
     child who has just closed a ring is owed the ring, not the rule. */
  const rule = broken ? (said ?? 'A red square breaks a rule.') : ''
  const full = blankCount(state) === 0 ? fullLine(shortPosts(state)) : ''
  const note = locked
    ? ''
    : rule !== ''
      ? rule
      : selected === null
        ? full || 'Tap a square, then tap a fence.'
        : `Now tap a fence for row ${rowOf(n, selected) + 1}, column ${colOf(n, selected) + 1}.`

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres it,
          and lets a six-by-six field slide rather than shrink under a
          fingertip on the narrowest phone. */}
      <div className={s.frame}>
        <div className={s.field} data-size={String(n)} style={{ '--n': String(n) } as CSSProperties}>
          <div
            className={s.grid}
            role="group"
            aria-label={`Fences on a ${n} by ${n} grid`}
            onKeyDown={onKeyDown}
          >
            {squares}
            <div className={s.posts} aria-hidden="true">
              {posts}
            </div>
          </div>
        </div>
      </div>

      <div className={s.palette}>
        {FENCES.map((value) => (
          <button
            key={value}
            type="button"
            className={`${s.key} u-press`}
            disabled={locked || selected === null || entries[selected] === value}
            aria-label={`Put ${fenceName(value)} in the square`}
            onClick={() => selected !== null && write(selected, value)}
          >
            <FenceGlyph value={value} className={s.keyArt} />
          </button>
        ))}
        <button
          type="button"
          className={`${s.key} ${s.eraser} u-press`}
          disabled={locked || selected === null || entries[selected] === EMPTY}
          aria-label="Rub out the square"
          onClick={() => selected !== null && write(selected, EMPTY)}
        >
          <RubberGlyph className={s.keyGlyph} />
          <span className={s.keyWord}>Rub out</span>
        </button>
      </div>

      <p className={s.note}>{note}</p>
      {/* The broken rule, and the posts still short once the board is full.
          Every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : rule || full}
      </p>
    </div>
  )
}
