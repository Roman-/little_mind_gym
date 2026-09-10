import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { cx } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { Dir, StoneAction, StoneState } from './logic'
import {
  DIR_WORDS,
  colOf,
  lineTo,
  nextStone,
  refusalOf,
  rowOf,
  spotOf,
  stepTarget,
  stonesLeft,
} from './logic'
import { WayMark } from './glyphs'
import s from './board.module.css'

/**
 * A board of squares, the stones still lying on it, and the walk drawn over
 * the top of them: the route so far as one line, and an arrow on the square it
 * has reached saying which way it came in.
 *
 * **The stones are the controls.** A tap on a stone is one dispatched move,
 * because where the walk goes is settled by which stone it is: the direction
 * is the move, and the stone names it. There is no selection step to hold and
 * no pad of arrows under the board — an empty square has nothing on it to tap,
 * so the only things a finger can land on are the stones themselves, and there
 * are fewer of them after every move.
 *
 * **The arrow keys are the four ways.** Eight of the shipped boards spend the
 * arrows on a cursor roving a grid of squares, and this board has no such
 * cursor to rove: Tab reaches every stone in reading order, which is the whole
 * of what there is to reach. So the arrows are free for the thing they
 * obviously mean here — one press, one walk — exactly as the slippery ice and
 * the hedge maze spend theirs.
 *
 * **Every stone stays live.** Three of the taps a child can make break a rule
 * rather than doing nothing: a stone behind you, a stone with another one in
 * the way, and a stone that is not on your row or your column at all. A board
 * that only let go of the stone it would accept would be reading the four
 * lines for the child, and reading the four lines is the puzzle. So the tap
 * lands, the stone flashes and refuses where it lies, one sentence says why,
 * and nothing reaches the shell.
 */

/** One arrow key, one walk. This board has no roving cursor to spend them on. */
const ARROWS: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
}

export function Board({ state, dispatch, locked }: BoardProps<StoneState, StoneAction>) {
  /**
   * Nothing pretends to move here, so `shown` is always the real position: a
   * tap names a stone rather than a place to stand, and a walk the rules will
   * not take has no position to draw. What the hook is carrying is the
   * setting, the two cues on the stone that said no, and the sentence.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n, at, heading, trail } = shown

  /** True where that stone is the one this walk would reach going that way. */
  const reaches = (cell: number): boolean => {
    const dir = lineTo(shown, cell)
    return dir !== -1 && stepTarget(shown, dir) === cell
  }

  const walk = (dir: Dir) => {
    if (locked) return
    if (stepTarget(shown, dir) >= 0) {
      dispatch({ type: 'walk', dir })
      return
    }
    // The rules will not walk that way. Where a stone stands there anyway, a
    // rule is being broken and the stone says which; where the line is empty,
    // nothing has happened and nothing is said.
    if (!refusal.offered) return
    const stone = nextStone(shown, at, dir)
    if (stone < 0) return
    const no = refusalOf(shown, stone)
    if (no !== null) refusal.refuse(no)
  }

  const tap = (cell: number) => {
    if (locked) return
    const dir = lineTo(shown, cell)
    if (dir !== -1 && stepTarget(shown, dir) === cell) {
      dispatch({ type: 'walk', dir })
      return
    }
    if (!refusal.offered) return
    const no = refusalOf(shown, cell)
    if (no !== null) refusal.refuse(no)
  }

  /**
   * One press, one walk, and the page does not scroll under it.
   *
   * It is a listener rather than a prop on the grid because the tab stop is
   * not always inside the grid — the shell parks focus on the stage, which is
   * the board's parent rather than its child. So the arrows are taken from
   * inside the board and from whatever contains it; anywhere else on the page
   * they still scroll.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const focused = document.activeElement
      if (focused === null || focused === document.body) return
      if (!root.contains(focused) && !focused.contains(root)) return
      const dir = ARROWS[event.key]
      if (dir === undefined || locked) return
      event.preventDefault()
      walk(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const spot = (cell: number) =>
    ({ '--r': String(rowOf(n, cell)), '--c': String(colOf(n, cell)) }) as CSSProperties

  /**
   * What tapping this stone does — never whether the rules will take it. While
   * a forbidden walk is offered, every stone reads the same, so a child
   * listening works the four lines out from the same facts a child looking
   * does. With the setting turned off, the dead stone says why.
   */
  const labelFor = (cell: number): string => {
    const seat = `Stone on ${spotOf(n, cell)}.`
    if (locked) return seat
    const no = refusal.offered ? null : refusalOf(shown, cell)
    if (no !== null) return `${no.message} ${seat}`
    return `${seat} Walk to it.`
  }

  const stones = shown.stones.flatMap((there, cell) =>
    !there
      ? []
      : [
          <span className={s.slot} key={cell} style={spot(cell)}>
            <button
              type="button"
              className={cx(s.stone, 'u-press', refusal.flash(String(cell)))}
              disabled={locked || (!refusal.offered && !reaches(cell))}
              aria-label={labelFor(cell)}
              onClick={() => tap(cell)}
            >
              {/* The flash is on the button and the shake on the stone inside
                  it: one element runs one animation, and these two say
                  different halves of the same refusal. */}
              <span className={cx(s.disc, refusal.shake(String(cell)))} />
            </button>
          </span>,
        ],
  )

  const left = stonesLeft(shown)
  const standing =
    left === 0
      ? ''
      : left === 1
        ? '1 stone still to pick up.'
        : `${left} stones still to pick up.`
  const here = `You are on ${spotOf(n, at)}${heading === -1 ? '' : `, going ${DIR_WORDS[heading]}`}.`

  return (
    <div className={s.board} ref={rootRef}>
      {/* The one rule that has to be held in a head, kept on the board rather
          than in the drawer that shuts on a second visit. */}
      <p className={`u-label ${s.goal}`}>
        Pick up every stone. You can never go back the way you came.
      </p>

      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`A stone board, ${n} squares across`}
        >
          {Array.from({ length: n * n }, (_, cell) => (
            <div key={`cell-${cell}`} className={s.cell} aria-hidden="true" />
          ))}

          {/* The route, in the grid's own units, so one square is one unit each
              way however big the board is on the day. It never runs under a
              stone: every square a leg crosses was empty when the walk crossed
              it, and no stone is ever put back. */}
          {trail.length > 1 && (
            <svg
              className={s.route}
              viewBox={`0 0 ${n} ${n}`}
              aria-hidden="true"
              focusable="false"
            >
              <polyline
                className={s.line}
                points={trail
                  .map((cell) => `${colOf(n, cell) + 0.5},${rowOf(n, cell) + 0.5}`)
                  .join(' ')}
              />
            </svg>
          )}

          <div className={s.pieces}>{stones}</div>

          {/* Where the walk has got to, and the way it came in. The square
              carries the travel and the mark carries the turn, so a walk that
              crosses four squares and an arrow that points down the line
              never write over each other's transform. */}
          <div className={s.walker} aria-hidden="true">
            <span className={s.slot} style={spot(at)}>
              <span className={s.here} data-done={left === 0 ? 'true' : undefined}>
                {heading !== -1 && (
                  <WayMark
                    className={s.way}
                    style={{ '--turn': `${heading * 90}deg` } as CSSProperties}
                  />
                )}
              </span>
            </span>
          </div>
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say(standing)}</p>
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say(`${here} ${standing}`)}
      </p>
    </div>
  )
}
