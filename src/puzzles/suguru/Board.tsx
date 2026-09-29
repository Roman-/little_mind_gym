import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import { colourRegions, regionPaint } from '../../lib/regions'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Clash, QuiltAction, QuiltState } from './logic'
import {
  BIGGEST_PATCH,
  biggestAt,
  clashOf,
  colOf,
  conflicts,
  countWord,
  describeClash,
  describeRange,
  patchNames,
  refusalOf,
  rowOf,
} from './logic'
import { RubberGlyph } from './glyphs'
import s from './board.module.css'

/** The first square a player can write in. Where the tab stop starts. */
const firstBlank = (givens: number[]) => Math.max(0, givens.indexOf(0))

export function Board({ state, dispatch, locked }: BoardProps<QuiltState, QuiltAction>) {
  /**
   * With forbidden moves offered, no rule on this board takes a key off the
   * pad. A number too big for the patch it is aimed at lands in the square,
   * flashes, and is handed back — so how big a patch is stays something a
   * child counts off the quilt rather than something the keypad gives away
   * with a dead key. The one key that does go dead is the number the chosen
   * square already holds, which breaks no rule and would change nothing.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n, patches, givens, entries } = shown
  /**
   * What the board really holds, as against what it is drawing. `shown`
   * carries a refused number for the length of one cue, and that number is on
   * its way straight back off — so the squares are drawn from `shown` and
   * every question about the position itself is asked here: which numbers
   * repeat, and which key would change nothing. Asked of `shown`, the board
   * would answer for a tap that never landed.
   */
  const written = state.entries

  /** Every square's button, so the board can put focus on one and read it back. */
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * The square with the amber ring: the one the keypad writes into.
   *
   * It has to outlive a move. A number in the wrong square is put right with
   * another number or taken off with the rubber, and a pad that went dead the
   * moment a number landed would send a child back to the square to pick it
   * again first. It also has to be gone after a rewind through the move tape,
   * where the ring would otherwise sit on a square this player never picked.
   *
   * The board knows which of the two has just happened, because it is the
   * board that dispatched the write: `wrote` says so, and the ring stays where
   * the child put it. A move the board did not make takes the ring off — and a
   * tap on the move tape takes the focus with it, so a rewind really does. The
   * one square that keeps it is the square the browser is still focused on,
   * where the next number typed would land anyway: the ring, the note under
   * the board and the keyboard have to agree about which square that is.
   *
   * Before paint rather than after, so a ring a rewind has taken away is never
   * drawn for a frame. A refusal is not a move at all: `state` does not change
   * under one, so the square a refused number bounced off stays chosen and the
   * next number can go straight in.
   *
   * This is the one thing on this board that `useEphemeral` does not hold, and
   * the exception is worth stating because the tab stop below it is a plain
   * `useEphemeral`. That hook clears its value whenever the token changes, and
   * the ring has to live through a change that the board itself made: cleared
   * every time, it would come off after every number a child writes, which is
   * the trip back to the square that the paragraph above is about. What tells
   * the two kinds of change apart is `document.activeElement` — the browser's
   * state rather than the puzzle's, read where the DOM is already what it is
   * going to be, which is a layout effect and not a render. The small square
   * splits its ring and its tab stop the same way.
   */
  const [chosen, setChosen] = useState<number | null>(null)
  const wrote = useRef(false)
  useLayoutEffect(() => {
    if (wrote.current) {
      wrote.current = false
      return
    }
    setChosen((cur) => (cur !== null && refs.current[cur] === document.activeElement ? cur : null))
  }, [state])

  /**
   * Which square owns the tab stop. Focus position rather than a game choice,
   * so it survives a move — a child playing by keyboard would otherwise be
   * sent back to the first square after every number. The quilt is the token
   * because `reduce` passes it through by reference: it is a new array only
   * when a board is dealt, which is the one moment the tab stop should start
   * again.
   */
  const [roving, setRoving] = useEphemeral<number | null>(patches, null)
  const cursor = roving ?? firstBlank(givens)

  /**
   * Which of the player's own numbers repeat a peer — asked of the board the
   * player has, never of the one a refusal is drawing. A number too big for
   * its patch is on its way back off, so scoring it for repeats as well would
   * answer one tap with two broken rules, and name a mistake nobody made.
   */
  const wrong = useMemo(() => conflicts(state), [state])
  const repeats = wrong.some(Boolean)

  /**
   * The group a repeat has just broken, lit for one run of the cue. A red ring
   * says which square is wrong but never what it is wrong with, so the whole
   * patch — or the square and the eight round it — lights up, and the two
   * squares holding the number shake at each other. It is decoration over a
   * move the puzzle has already taken: nothing else reads it, and it takes
   * itself off again.
   */
  const [lit, light] = useCue<Clash>('--dur-5')
  const litGroup = useMemo(() => new Set(lit?.cells), [lit])
  const litPair = useMemo(() => new Set(lit?.blamed), [lit])

  /**
   * The same mistake in words, and deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until no
   * number on the board repeats another, and it is dropped during render
   * rather than after paint, so a repeat made much later is never announced
   * with the sentence for an older one.
   */
  const [said, setSaid] = useState<string | null>(null)
  if (said !== null && !repeats) setSaid(null)

  /** How big the numbers in this square's patch go. */
  const biggest = (index: number) => biggestAt(shown, index)

  const write = (index: number, value: number) => {
    if (locked || refusal.busy) return
    // The board never sends a move it already knows is a no-op.
    if (givens[index] !== 0 || written[index] === value) return

    // A number the patch is too small for is refused: it lands, it is answered,
    // and it comes off again, so nothing forbidden reaches the move tape.
    // Which numbers those are is `logic.ts`'s to say, not the board's.
    const no = refusalOf(shown, index, value)
    if (no !== null) {
      if (refusal.offered) refusal.refuse({ ...no, where: String(index) })
      return
    }

    // Worked out from the state the move is leaving, which is the only one the
    // board has: the shell hands the next one back on the render after this.
    const clash = clashOf(shown, index, value)
    // The next state to arrive is this move, so the ring stays where the child
    // put it. Everything above this line is a move that changes the board, so
    // the state really does move and the flag is read on the render after it.
    wrote.current = true
    dispatch({ type: 'set', index, value })
    if (clash === null) return
    light(clash)
    // The number really does go down here, so the shell's knock underneath is
    // true and stays; this is the "no" over the top of it.
    playSound('wrong')
    setSaid(describeClash(clash))
  }

  /**
   * The tab stop and the ring are put on a square together, and every way into
   * a square goes through here — a tap, a focus, an arrow key, a number typed
   * at the keyboard. They come apart again only where the puzzle moves under
   * the player: a rewind takes the ring off and leaves the tab stop where the
   * child left it, which is what each of the two is for.
   */
  const markCell = (index: number) => {
    setRoving(index)
    setChosen(index)
  }

  const focusCell = (index: number) => {
    markCell(index)
    refs.current[index]?.focus()
  }

  /** The next writable square in this direction, or null at the edge. */
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
    if (locked || refusal.busy) return
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
    // A number typed at the keyboard goes into the square the keyboard is on,
    // so that square is the chosen one: the ring, the note under the board and
    // the pad all say what the next key will do, whether the child is tapping
    // or typing. Escape is how a keyboard says "not this square", and the next
    // number typed picks it again.
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
      event.preventDefault()
      markCell(cursor)
      write(cursor, 0)
      return
    }
    if (event.key >= '1' && event.key <= String(BIGGEST_PATCH) && event.key.length === 1) {
      event.preventDefault()
      markCell(cursor)
      write(cursor, Number(event.key))
      return
    }
    if (event.key === 'Escape') setChosen(null)
  }

  /**
   * Which patch this square is in, and how big the numbers in it go.
   *
   * The letter is the seam said out loud. A looker reads the colours and the
   * heavy lines and sees where one patch stops; a listener has neither, and two
   * squares on either side of a seam would otherwise read out word for word the
   * same — with nothing to say that the number in one of them has anything to
   * do with the number in the other. It is a letter rather than the colour's
   * name because a big quilt has more patches than there are colours: two
   * patches that never touch can be the same blue, and two squares in them
   * would read out as one patch. The letters run in reading order, so the patch
   * in the top left corner is always A.
   */
  const names = patchNames(patches)
  /**
   * The colour of each patch, as an index into the enamel palette. A patch is a
   * piece of fabric you can see on the board, so it takes a piece colour, and
   * no two patches that touch — even corner to corner — take the same one. The
   * quilt is dealt once and never changes, so neither does a patch's colour.
   */
  const colours = colourRegions(n, patches)
  const patchWord = (index: number) =>
    `patch ${names[patches[index]]} of ${countWord(biggest(index))} squares`

  const cells = givens.map((given, i) => {
    const r = rowOf(n, i)
    const c = colOf(n, i)
    // A hairline inside a patch, a heavy seam where one patch meets the next.
    // The colours and the seams are the first thing the eye reads on this
    // board, and they are the only thing that says how big a number a square
    // may hold — which is why the label under them names the patch as well as
    // its size. The seams stay for a child who cannot tell two colours apart.
    const top = r === 0 ? undefined : patches[i - n] === patches[i] ? 'hair' : 'seam'
    const left = c === 0 ? undefined : patches[i - 1] === patches[i] ? 'hair' : 'seam'
    // The four corner squares round off with the quilt, so the fabric under
    // them does not poke out past its rim.
    const corner =
      (r === 0 || r === n - 1) && (c === 0 || c === n - 1)
        ? `${r === 0 ? 'top' : 'bottom'}-${c === 0 ? 'left' : 'right'}`
        : undefined
    const fabric = { '--patch': regionPaint(colours[patches[i]]) } as CSSProperties
    const where = `Row ${r + 1}, column ${c + 1}, ${patchWord(i)}`

    if (given !== 0) {
      return (
        <div
          className={s.cell}
          data-top={top}
          data-left={left}
          data-corner={corner}
          style={fabric}
          key={i}
        >
          <div
            className={cx(s.given, litGroup.has(i) && cues.highlight)}
            role="img"
            aria-label={`${where}, ${given}, printed`}
          >
            <span className={cx(s.mark, litPair.has(i) && cues.shake)}>{given}</span>
          </div>
        </div>
      )
    }

    const value = entries[i]
    // A refused number is drawn here for one cue and handed straight back, so
    // for that cue the square says nothing about repeats: the number a child
    // is looking at is not one the board has, and the one underneath it is not
    // the one on show.
    const bounced = refusal.flash(String(i))
    const repeated = wrong[i] && bounced === undefined
    const label = `${where}, ${value === 0 ? 'empty' : value}${repeated ? ', repeated' : ''}`
    return (
      <div
        className={s.cell}
        data-top={top}
        data-left={left}
        data-corner={corner}
        style={fabric}
        key={i}
      >
        <button
          type="button"
          className={cx(s.tile, 'u-press', litGroup.has(i) && cues.highlight, bounced)}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-chosen={chosen === i ? 'true' : undefined}
          data-conflict={repeated ? 'true' : undefined}
          disabled={locked}
          aria-label={label}
          aria-pressed={chosen === i}
          onFocus={() => markCell(i)}
          onClick={() => focusCell(i)}
        >
          {value !== 0 && (
            <span className={cx(s.mark, litPair.has(i) && cues.shake)}>{value}</span>
          )}
        </button>
      </div>
    )
  })

  const numbers = Array.from({ length: BIGGEST_PATCH }, (_, i) => i + 1)
  /** How big a number the chosen square's patch takes. Every key while none is chosen. */
  const room = chosen === null ? BIGGEST_PATCH : biggest(chosen)

  /* One line, and only ever one: the rule a number has just broken, what red
     means, or what to tap next. The named repeat outranks the general
     sentence — a child who has just put a second 3 in a patch is owed the 3,
     not the rule. */
  const rule = repeats
    ? (said ?? 'Red means you have the same number twice in one patch, or in two squares that touch.')
    : ''
  const note = locked
    ? ''
    : rule !== ''
      ? rule
      : chosen === null
        ? 'Tap a square, then tap a number.'
        : `Now tap a number for row ${rowOf(n, chosen) + 1}, column ${colOf(n, chosen) + 1}.`

  return (
    <div className={s.board}>
      {/* The shell already sits the board on a stage; this only centres the
          quilt, and lets a seven-wide one scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`${n} by ${n} quilt`}
          onKeyDown={onKeyDown}
        >
          {cells}
        </div>
      </div>

      <div className={s.pad} data-size={String(n)}>
        {numbers.map((v) => {
          const over = v > room
          /**
           * The number the chosen square already holds. Tapping it would write
           * what is already there, which breaks no rule and changes nothing —
           * the one thing docs/DESIGN.md keeps a dead control for, and what the
           * small square's pad does with the same key. The rubber beside these
           * is how a number comes off.
           */
          const here = chosen !== null && written[chosen] === v
          // Offering a forbidden move means offering it to a listener too, so
          // a live key says what it writes and nothing else. It is only the
          // dead key — the player having asked for these to be refused up
          // front — that says why it will not take the tap.
          const label =
            over && !refusal.offered
              ? `${describeRange(room)} Put ${v} in the square.`
              : `Put ${v} in the square`
          return (
            <button
              key={v}
              type="button"
              className={`${s.key} u-press`}
              // Dead while no square is chosen, while the square already holds
              // this number, and where the player has asked for a forbidden
              // move to be refused up front. Never otherwise: which numbers a
              // patch takes is the puzzle.
              disabled={locked || chosen === null || here || (over && !refusal.offered)}
              aria-label={label}
              onClick={() => chosen !== null && write(chosen, v)}
            >
              <span className={s.keyDigit}>{v}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={`${s.key} ${s.rubber} u-press`}
          disabled={locked || chosen === null || written[chosen] === 0}
          aria-label="Rub out the square"
          onClick={() => chosen !== null && write(chosen, 0)}
        >
          <RubberGlyph className={s.keyGlyph} />
          <span className={s.keyWord}>Rub out</span>
        </button>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say(note)}</p>
      {/* Mounted from the first render, so a screen reader is already watching
          it when a refusal arrives. Only the broken rule is announced: every
          arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say(rule)}
      </p>
    </div>
  )
}
