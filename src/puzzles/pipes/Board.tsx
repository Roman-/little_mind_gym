import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import type { BoardProps } from '../../lib/types'
import type { PipesAction, PipesState } from './logic'
import { SOLVED_LINE, SPLIT_LINE, colOf, isFlower, isSolved, rowOf, squareLabel, statusLine } from './logic'
import { PipeMark } from './glyphs'
import s from './board.module.css'

/**
 * The angle each pipe is drawn at, and the state it was worked out from.
 *
 * The state holds a square's turns as 0..3, so a tap from 3 back to 0 would
 * spin the pipe three quarters anticlockwise if the angle were `turns * 90`.
 * Instead the drawn angle keeps count: a tap adds 90, Step back takes 90 off,
 * and a jump along the move tape or Start over turns each square the short way
 * round, never more than half a turn. A new deal lands straight on its picture
 * (`snap`), with nothing turning to get there.
 *
 * It is presentation only — the same class of thing as a `useEphemeral`
 * selection, and adjusted during render for the same reason, so no frame is
 * ever painted with the old angles over the new position. The picture is
 * still a pure function of state, because `rotate(θ)` and `rotate(θ + 360°)`
 * draw the same thing; only the raw angle can differ by whole turns after a
 * round trip.
 *
 * Keeping an unbounded tap count in the state instead was the alternative, and
 * it would make Start over unwind every turn ever made: twelve taps on one
 * square would come back as a spin of three whole turns, and nothing here
 * spins.
 */
interface Drawn {
  turns: number[]
  pieces: number[]
  angles: number[]
  snap: boolean
}

export function Board({ state, dispatch, locked }: BoardProps<PipesState, PipesAction>) {
  const { n, pieces } = state

  const [drawn, setDrawn] = useState<Drawn>(() => ({
    turns: state.turns,
    pieces,
    angles: state.turns.map((t) => t * 90),
    snap: true,
  }))
  let shown = drawn
  if (drawn.turns !== state.turns) {
    const fresh = drawn.pieces !== pieces
    const angles = state.turns.map((t, i) => {
      if (fresh) return t * 90
      // 1 is a tap, 3 is a step back, and 2 is two taps at once from the tape.
      const step = (t - drawn.turns[i] + 4) % 4
      return drawn.angles[i] + (step === 3 ? -90 : step * 90)
    })
    shown = { turns: state.turns, pieces, angles, snap: fresh }
    setDrawn(shown)
  }

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every turn. The pieces are the token rather than the
   * whole state for exactly that reason: they are a new array only when a new
   * board is dealt, which is the one moment the tab stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(pieces, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  const focusSquare = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  /** One square in the arrow's direction, standing still at the edge rather than wrapping round. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
    if (r >= 0 && r < n && c >= 0 && c < n) focusSquare(r * n + c)
  }

  /**
   * The water is drawn on the solving position and on no other. A live wash
   * that followed the drop while the child worked nearly tripled what a
   * mindless tapper got out of the third level within twice par (18 boards of
   * 400 to 56), so it waits for the goal to be reached and then shows it.
   */
  const wet = isSolved(state)

  const squares = pieces.map((piece, i) => {
    const kind = i === state.source ? 'drop' : isFlower(state, i) ? 'flower' : 'pipe'
    return (
      <button
        key={i}
        type="button"
        className={cx(s.square, 'u-press')}
        ref={(el) => {
          refs.current[i] = el
        }}
        tabIndex={i === cursor ? 0 : -1}
        data-kind={kind}
        disabled={locked}
        aria-label={squareLabel(state, i)}
        onFocus={() => setCursor(i)}
        onClick={() => {
          if (!locked) dispatch({ type: 'turn', index: i })
        }}
      >
        {/* The pipe is drawn as dealt and turned to the angle this span
            carries, so that the picture on top of it — which is outside this
            span — stays upright. */}
        <span className={s.turn} style={{ '--angle': `${shown.angles[i]}deg` } as CSSProperties}>
          <PipeMark mask={piece} className={s.pipe} />
        </span>
        {kind === 'drop' && <Pictogram name="drop" className={s.art} />}
        {kind === 'flower' && <Pictogram name="tulip" className={s.art} />}
      </button>
    )
  })

  return (
    <div className={s.wrap}>
      {/* The grid sits centred. On a phone narrow enough that a pipe would
          drop below a fingertip, this scrolls sideways instead of shrinking
          one. */}
      <div className={s.scroller}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          data-water={wet ? 'true' : undefined}
          data-snap={shown.snap ? 'true' : undefined}
          role="group"
          aria-label={`Pipes, ${n} rows and ${n} columns`}
          onKeyDown={onKeyDown}
        >
          {squares}
        </div>
      </div>
      {/* The board's own sentence, mounted from the first render and silent
          while the child works, in one cell with a hidden copy of each thing
          it can say. The cell is as tall as the longest of them at whatever
          width the page is, so the sentence coming and going never moves the
          board. With room for one line, it did: on a 360px phone the split
          sentence wraps to three lines, the stage centres what it holds, and
          the 5x5 jumped 27px up as it appeared and 27px down on the next tap
          — half a plate, under a child who was turning a flower twice. At
          320px it wraps to four, so no fixed height would do. */}
      <div className={s.say}>
        {[SPLIT_LINE, SOLVED_LINE].map((line) => (
          <p key={line} className={cx('u-label', s.status, s.room)} aria-hidden="true">
            {line}
          </p>
        ))}
        <p className={cx('u-label', s.status)} role="status">
          {statusLine(state)}
        </p>
      </div>
    </div>
  )
}
