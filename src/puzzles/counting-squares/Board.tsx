import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Clash, MosaicAction, MosaicState } from './logic'
import { clashOf, colOf, conflicts, describeClash, rowOf } from './logic'
import s from './board.module.css'

/**
 * One grid, and nothing else. Every square is the same control — a tap fills
 * it in, a tap on a filled square empties it again — and a number printed on a
 * square is drawn on that same control, because the number counts its own
 * square and a child has to be able to fill it in.
 *
 * There is no keypad, no palette and no second kind of mark. The paper game's
 * dot on a square you have worked out is empty is deliberately not here: see
 * the note on `par` in logic.ts.
 *
 * And nothing on this board is refused. A square that would take a number past
 * its count is a wrong answer rather than a forbidden move — the same call the
 * garden cats make about a cat in the wrong row and the small square makes
 * about a repeated fruit — so the tap lands, the block lights, one sentence
 * says which number went over, the number wears a clay ring until the child
 * takes a square back off, and nothing here ever goes dead. Refusing it would
 * hand over the very thing the puzzle is about: which squares have to stay
 * empty is the whole of the reasoning, and a control that would not take the
 * tap says so before a child has counted anything.
 *
 * What that ring hands back was measured rather than argued about. A cue that
 * says "too many" is a known oracle, and `docs/PUZZLE_CANDIDATES.md` says so
 * twice — under the thermometers, where Aquarium is on record as losing to a
 * mindless greedy climber and the entry asks for that same climber to be run
 * before its logic.ts is written, and under tilepaint, where the same
 * over-count clash reads as a solver oracle and the answer there was for a
 * wrong tap to say nothing at all. Neither entry is this one — the entry for
 * the counting squares asks about par instead, and the note on `par` in
 * logic.ts is where that is answered — but the ring is that same cue, so the
 * climber was run against these boards too.
 *
 * A player who counts nothing at all — walk the squares in any order, fill in
 * every one the board does not ring, never go back — ends on a set no square
 * can be added to, and that set is the answer on 22 of 400 five-across boards,
 * 2 of 400 six-across and none of 400 seven-across. Where it lands it has spent
 * one tap a square and nothing else, so it lands on par: a five-across board
 * really does come out perfect from a walk that counted nothing, about one time
 * in eighteen. The other seventeen end with nothing red anywhere and the board
 * unfinished, because a number that is short is never rung — so the ring
 * answers "this number is full, stop" and says nothing whatever about where the
 * squares go.
 *
 * The floor under `minRounds` is what holds even that down, so a retune of the
 * round window moves this number too. Move the first level's window back down
 * to where it sat before it was lifted clear of the second's, and the same
 * climber lands far more often: on a quarter of the boards that take three
 * passes, and on over half of the ones that take two. `logic.test.ts` runs the
 * climber, and carries the recipe behind every number in these two paragraphs,
 * under "the clay ring".
 */
export function Board({ state, dispatch, locked }: BoardProps<MosaicState, MosaicAction>) {
  const { n, clues, filled } = state

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every square. The numbers are the token rather than
   * the whole state for exactly that reason: `reduce` passes the array through
   * by reference, so it is a new array only when a new board is dealt, which
   * is the one moment the tab stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(clues, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /** The numbers with more squares filled in round them than they count. */
  const wrong = useMemo(() => conflicts(state), [state])
  const broken = wrong.some(Boolean)

  /**
   * The squares a number counts, lit for one run of the cue. A clay ring says
   * which number is wrong but never which squares it counts, so the whole
   * block lights up and the number itself shakes. Nothing points at the square
   * that pushed the number over: one of the filled squares in the block has to
   * come back off, and which one is the puzzle.
   *
   * It is guarded on the board in front of the player rather than on the one
   * it was fired from. The move tape can rewind under a cue that is still
   * running, and a block lit for a number that is no longer over its count
   * would be pointing at nothing: `wrong` is read off the state being drawn,
   * so the light goes out the instant the mistake does.
   */
  const [cue, light] = useCue<Clash>('--dur-5')
  const lit = cue !== null && wrong[cue.clue] ? cue : null
  const litGroup = useMemo(() => new Set(lit?.cells), [lit])

  /**
   * The same mistake in words, and deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it.
   *
   * It is held against the number it names rather than against the board, so
   * it stands exactly as long as that number is over its count. Two numbers
   * can be over at once — and the move tape can rewind out from under a
   * sentence — so "some number is wrong" is not enough to keep this one: a
   * sentence about a 0 that has been put right, standing over a clay ring on a
   * 3, names the wrong number. When the number it names comes right and
   * another is still over, the general sentence below takes its place.
   *
   * Dropped during render rather than after paint, so a mistake made much
   * later is never announced with the sentence for an older one.
   */
  const [said, setSaid] = useState<{ clue: number; sentence: string } | null>(null)
  if (said !== null && !wrong[said.clue]) setSaid(null)

  const tap = (index: number) => {
    if (locked) return
    // Worked out from the state the move is leaving, which is the only one the
    // board has: the shell hands the next one back on the render after this.
    const clash = clashOf(state, index)
    dispatch({ type: 'toggle', index })
    if (clash === null) return
    light(clash)
    // The square really is filled in, so the shell's knock underneath is true
    // and stays; this is the "no" over the top of it.
    playSound('wrong')
    setSaid({ clue: clash.clue, sentence: describeClash(clash) })
  }

  const focusCell = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A chord belongs to the browser. Ctrl+Left is a word jump, Meta+Left is
    // the way back through history, and neither is a step across this grid.
    if (event.ctrlKey || event.metaKey || event.altKey) return
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

  const cells = filled.map((on, i) => {
    const r = rowOf(n, i)
    const c = colOf(n, i)
    const clue = clues[i]
    const over = wrong[i]
    const label = [
      `Row ${r + 1}, column ${c + 1}`,
      clue >= 0 ? `number ${clue}` : null,
      on ? 'filled in' : 'empty',
      over ? 'too many round it' : null,
    ]
      .filter(Boolean)
      .join(', ')

    return (
      // The lattice is drawn on the seat round each square rather than on the
      // square itself, so a filled square's own edge stays its edge.
      <div
        className={s.cell}
        data-top={r === 0 ? undefined : 'true'}
        data-left={c === 0 ? undefined : 'true'}
        key={i}
      >
        <button
          type="button"
          className={cx(s.tile, 'u-press', litGroup.has(i) && cues.highlight)}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-on={on ? 'true' : undefined}
          data-over={over ? 'true' : undefined}
          disabled={locked}
          aria-label={label}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          {clue >= 0 && (
            <span className={cx(s.mark, lit?.clue === i && cues.shake)}>{clue}</span>
          )}
        </button>
      </div>
    )
  })

  /* One line, and only ever one: the number that has just gone over its count,
     what red means, or how to play. The named number outranks the general
     sentence — a child who has just filled a fourth square round a 3 is owed
     the 3, not the rule. */
  const rule = broken
    ? (said?.sentence ?? 'Red means a number has more squares filled in than it counts.')
    : ''
  const note = locked ? '' : rule !== '' ? rule : 'Tap a square to fill it in. Tap it again to empty it.'

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres the
          grid, and lets a seven-across board scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`${n} by ${n} grid of squares`}
          onKeyDown={onKeyDown}
        >
          {cells}
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{note}</p>
      {/* Mounted from the first render, so a screen reader is already watching
          it when a number goes over. Only the broken number is announced:
          every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : rule}
      </p>
    </div>
  )
}
