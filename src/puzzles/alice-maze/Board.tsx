import { useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { AliceAction, AliceState } from './logic'
import { DIRS, DIR_WORDS, canHop, colOf, failure, isSolved, refusalOf, rowOf, spotOf } from './logic'
import { ChangeMark, RingMark, WayMark } from './glyphs'
import s from './board.module.css'

/**
 * The maze, the trail the kangaroo has left across it, and the number it is
 * carrying, on a tile above the board.
 *
 * **Every square is a control, and a tap names where to land.** Not a
 * direction: a direction would let a child hold the number in their finger
 * rather than in their head, and counting the hop out along four lines is the
 * whole puzzle. So the tap says "there", and the board answers.
 *
 * **And every square stays live.** Only one tap changes nothing — the square
 * the kangaroo is already on — and that one is dead. The rest break a rule and
 * are answered: the kangaroo really hops to where the finger went, one sentence
 * says what was wrong with it, and it comes straight back. A board that let go
 * of only the squares the rules take would be counting the hop out for the
 * child, which is the dead button of docs/DESIGN.md in another coat.
 *
 * The one tap it cannot honestly pretend is a square on neither the row nor the
 * column: no straight hop reaches it at all, so nothing moves — the clay ring
 * says which square was tapped, and the kangaroo strains where it stands.
 *
 * **The arrow keys rove the squares.** Thirty-six squares is more than Tab
 * should have to walk, so this is garden-cats' cursor: one tab stop on the
 * board, the arrows move it a square at a time, and Enter or Space hops. The
 * cursor is focus rather than a choice, so it survives a hop — a child playing
 * by keyboard is not sent back to the corner every time the kangaroo lands.
 */

/** One arrow key, one square of the cursor. */
const STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

/** The ways off a square, read out for anyone who cannot see the arrows on it. */
function waysInWords(bits: number): string {
  const said = DIR_WORDS.filter((_, dir) => (bits & (1 << dir)) !== 0)
  if (said.length === 0) return 'No arrows.'
  if (said.length === 1) return `An arrow points ${said[0]}.`
  return `Arrows point ${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}.`
}

/** What landing on a square does to the number, in the same words the hints use. */
function markInWords(mark: number): string {
  if (mark > 0) return 'It makes the hop one longer.'
  if (mark < 0) return 'It makes the hop one shorter.'
  return ''
}

export function Board({ state, dispatch, locked }: BoardProps<AliceState, AliceAction>) {
  /**
   * A refused hop really lands. The tap names a square to stand on, so there is
   * an honest position to draw — and watching the kangaroo overshoot by one is
   * how a child learns to count the number out. The hook draws it for one cue
   * and puts the board back; nothing reaches the shell.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { maze } = shown
  const { n } = maze

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a hop. The maze is the token rather than the whole state for
   * exactly that reason: it is a new object only when a new maze is dealt,
   * which is the one moment the cursor should start again.
   */
  const [cursor, setCursor] = useEphemeral(maze, maze.start)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * The kangaroo straining once, as the board locks on a dead end. It is
   * decoration over a dead end the shell has already settled — the notice under
   * the board says it in words, and under reduced motion this is gone in a
   * millisecond — so it is guarded on the position it was fired from: the move
   * tape can rewind while a cue is still running, and a shake over some other
   * position would be pointing at nothing.
   */
  const [stuck, sayStuck] = useCue<AliceState>()
  useEffect(() => {
    if (failure(state) !== null) sayStuck(state)
  }, [state, sayStuck])

  const tap = (cell: number) => {
    if (locked || refusal.busy) return
    if (canHop(shown, cell)) {
      dispatch({ type: 'hop', to: cell })
      return
    }
    if (!refusal.offered) return
    const no = refusalOf(shown, cell)
    if (no !== null) refusal.refuse(no)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A locked board takes no input at all, and a board drawing a pretend
    // position sits still until the cue is over. Both moments leave focus
    // inside the grid — the squares go aria-disabled rather than disabled,
    // because the cursor has to go on roving them — so the handler has to say
    // no itself. It buys the page back as well as the board: the arrow key is
    // left alone rather than cancelled, so a child whose kangaroo is stuck can
    // scroll down to the notice and Step back instead of walking a cursor
    // around a board that cannot be played.
    if (locked || refusal.busy) return
    // Ctrl, Meta and Alt belong to the browser: an arrow under one of them is
    // somebody asking for the page, not for the cursor.
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const step = STEPS[event.key]
    if (step === undefined) return
    event.preventDefault()
    const r = rowOf(n, cursor) + step[0]
    const c = colOf(n, cursor) + step[1]
    if (r < 0 || r >= n || c < 0 || c >= n) return
    const to = r * n + c
    setCursor(to)
    refs.current[to]?.focus()
  }

  /**
   * What tapping this square does — never whether the rules will take it. While
   * a forbidden hop is offered, every square a hop could land on reads the
   * same, so a child listening counts the four lines out from the same facts a
   * child looking does. With the setting turned off, a dead square says why.
   */
  const labelFor = (cell: number): string => {
    const here = cell === shown.at
    const where = spotOf(n, cell)
    const said = [
      `${where.charAt(0).toUpperCase()}${where.slice(1)}.`,
      /* Every square goes on saying what is painted on it with the kangaroo
         standing there, the ring and a mark alike. A mark is not spent by
         being landed on — it does the same thing again every time the kangaroo
         comes back to it — so a child working out what a hop away and a hop
         back would leave them on needs it, and the drawing cannot give it to
         them: the picture of the kangaroo covers the middle of the square it
         is on. What the eye loses to the picture, the words keep. */
      cell === maze.home ? 'The ring.' : markInWords(maze.marks[cell]),
      here ? 'The kangaroo is here.' : '',
      waysInWords(maze.arrows[cell]),
    ]
    if (locked || here) return said.filter(Boolean).join(' ')
    const no = refusal.offered ? null : refusalOf(shown, cell)
    if (no !== null) said.unshift(no.message)
    return [...said, no === null ? 'Hop to it.' : ''].filter(Boolean).join(' ')
  }

  const squares = Array.from({ length: n * n }, (_, cell) => {
    const dead = locked || cell === shown.at || (!refusal.offered && !canHop(shown, cell))
    return (
      <div className={s.cell} key={cell}>
        <button
          type="button"
          className={cx(s.square, 'u-press', refusal.flash(String(cell)))}
          ref={(el) => {
            refs.current[cell] = el
          }}
          tabIndex={cell === cursor ? 0 : -1}
          aria-disabled={dead || undefined}
          data-here={cell === shown.at ? 'true' : undefined}
          /* Moss on the ring is the app's "solved", so it answers the position
             the shell holds and never the one a refusal is pretending. A tap
             the arrows forbid lands the kangaroo on the ring for the length of
             one cue, and `isSolved` would have called that a win: the square a
             child is aiming at would have gone green under a clay flash saying
             the hop was not allowed. Amber and the flash are the honest pair
             there — the kangaroo is standing on it, and it may not stay. */
          data-won={cell === maze.home && isSolved(state) ? 'true' : undefined}
          aria-label={labelFor(cell)}
          onFocus={() => setCursor(cell)}
          onClick={() => tap(cell)}
        >
          {DIRS.map((dir) =>
            (maze.arrows[cell] & (1 << dir)) === 0 ? null : (
              <WayMark
                key={dir}
                className={s.way}
                style={{ '--turn': `${dir * 90}deg` } as CSSProperties}
              />
            ),
          )}
          {/* The middle of a square is the kangaroo's while it is standing
              there, and a mark drawn under the picture is not a mark anybody
              can read: the mark is 39% of the square and the picture is 66% of
              it, both centred, so the drawing sits over a third of the little
              circle and two fifths of the strokes inside it — and those
              strokes are the whole of what tells a plus from a minus. Half a
              mark is decoration in the clothes of information, so the square
              says it in words instead: see `labelFor` above, where the ring
              does the same. The arrows stay, on the rim, because they are what
              the next hop is chosen from. */}
          {cell !== shown.at && maze.marks[cell] !== 0 && (
            <ChangeMark longer={maze.marks[cell] > 0} className={s.change} />
          )}
          {cell !== shown.at && cell === maze.home && <RingMark className={s.ring} />}
        </button>
      </div>
    )
  })

  /**
   * Where the kangaroo has been, one arc a hop. An arc rather than a straight
   * line because a hop passes over the squares between rather than through
   * them, and a straight line drawn across four squares says it landed on all
   * of them. Every arc leans the same way about its own direction of travel, so
   * two hops back and forth along one row draw two arcs rather than one line
   * over itself.
   */
  const middle = (cell: number): [number, number] => [colOf(n, cell) + 0.5, rowOf(n, cell) + 0.5]
  const legs = shown.trail.slice(1).map((cell, i) => {
    const [ax, ay] = middle(shown.trail[i])
    const [bx, by] = middle(cell)
    const span = Math.hypot(bx - ax, by - ay)
    const [ux, uy] = [(bx - ax) / span, (by - ay) / span]
    const lift = Math.min(0.1 * span, 0.3)
    const cxp = (ax + bx) / 2 + uy * 2 * lift
    const cyp = (ay + by) / 2 - ux * 2 * lift
    // Both ends stop short of the middle of a square, so an arc springs from
    // the rim rather than running through whatever is standing there. A leg
    // drawn centre to centre put an amber stroke straight across the kangaroo
    // and across every plus it had passed over.
    const off = 0.26
    return (
      <path
        key={i}
        className={s.leg}
        data-last={i === shown.trail.length - 2 ? 'true' : undefined}
        d={`M${ax + ux * off} ${ay + uy * off}Q${cxp} ${cyp} ${bx - ux * off} ${by - uy * off}`}
      />
    )
  })

  /**
   * The kangaroo straining where it stands. A tap on a square that shares
   * neither the row nor the column is the one refusal nothing can pretend —
   * there is no straight hop that reaches it — so the clay ring says which
   * square was tapped and the kangaroo says it did not go anywhere, which is
   * exactly the pair docs/DESIGN.md asks for. `shown === state` is the hook's
   * own test for a refusal that moved nothing.
   */
  const strained = refusal.busy && shown === state

  const hopWord = shown.hop === 1 ? 'square' : 'squares'
  const standing = `The kangaroo hops ${shown.hop} ${hopWord}. It is on ${spotOf(n, shown.at)}.`

  return (
    <div className={s.board}>
      {/* The two rules that have to be held in a head, kept on the board rather
          than in the drawer that shuts on a second visit. Both say something a
          child would otherwise have to be told twice: the ring has to be landed
          on rather than flown over, which is the whole of what an Alice maze
          is, and the arrows that matter are the ones under the kangaroo's feet
          on a board where every square is wearing some. */}
      <p className={`u-label ${s.goal}`}>
        Land the kangaroo on the ring. It can only set off the way an arrow on its own square points.
      </p>

      {/* How far the kangaroo goes, which is the half of the position a board
          cannot draw. It is left in the page for a screen reader as well as on
          it for an eye: read straight through it says "Hop 3", and the status
          line under the board says it again in a sentence every time it
          changes, because a live region is only heard when it changes. */}
      <p className={s.hop}>
        <span className={`u-label ${s.hopWord}`}>Hop</span>
        <span className={`u-mono ${s.hopNumber}`}>{shown.hop}</span>
      </p>

      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`A maze ${n} squares across`}
          onKeyDown={onKeyDown}
        >
          {squares}

          {/* The trail, in the grid's own units, so one square is one unit each
              way however big the board is on the day. */}
          {legs.length > 0 && (
            <svg className={s.route} viewBox={`0 0 ${n} ${n}`} aria-hidden="true" focusable="false">
              {legs}
            </svg>
          )}

          <div className={s.rider} aria-hidden="true">
            <span
              className={s.slot}
              style={
                { '--r': String(rowOf(n, shown.at)), '--c': String(colOf(n, shown.at)) } as CSSProperties
              }
            >
              <Pictogram
                name="kangaroo"
                className={cx(s.roo, (strained || stuck === state) && cues.shake)}
              />
            </span>
          </div>
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say('')}</p>
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say(standing)}
      </p>
    </div>
  )
}
