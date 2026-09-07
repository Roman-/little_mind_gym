import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { Dir, MazeAction, MazeState } from './logic'
import {
  ACTIONS,
  DIRS,
  DIR_WORDS,
  caughtAt,
  colOf,
  dogPath,
  hedged,
  onBoard,
  reduce,
  refusalOf,
  rowOf,
  seamId,
  stateKey,
  stepCell,
} from './logic'
import { HoldMark, StepMark } from './glyphs'
import s from './board.module.css'

/**
 * The maze, the two animals in it, and five buttons.
 *
 * Four of the buttons stand on the squares round the rabbit — the ones behind
 * a hedge included, so the marks never leak which step is legal — and the
 * fifth stands on the rabbit's own square and means "stand still". The four
 * arrow keys are the same four steps, one press a turn, because that is the
 * input a maze wants; seven of the shipped boards spend the arrows on nothing
 * at all, and nothing in the contract asks for a roving tab stop.
 *
 * The dog's turn is watched rather than computed. The board asks `logic.ts`
 * for the square the dog passed through and slides the piece to it and then
 * on, so the rule is seen happening twice; and because reduced motion collapses
 * that to nothing, the sentence under the board says it in words as well.
 */

/** Which way one square lies from another, or null when it is the same square. */
function wayFrom(n: number, from: number, to: number): string | null {
  const step = to - from
  if (step === -n) return DIR_WORDS[0]
  if (step === 1) return DIR_WORDS[1]
  if (step === n) return DIR_WORDS[2]
  if (step === -1) return DIR_WORDS[3]
  return null
}

/**
 * The turn that led from one position to the next: the square the dog passed
 * through, and the sentence saying what it did.
 *
 * Both are null and empty for anything that is not a turn taken from `prev` —
 * a rewind through the move tape, a level change, a fresh start — so a board
 * handed an older position never animates backwards or announces a move that
 * has just been undone.
 */
function turnOf(prev: MazeState, next: MazeState): { via: number | null; line: string } {
  const still = { via: null, line: '' }
  if (prev.hedges !== next.hedges) return still
  const key = stateKey(next)
  const took = ACTIONS.some((action) => {
    const child = reduce(prev, action)
    return child !== prev && stateKey(child) === key
  })
  if (!took) return still
  // Out through the gap: the rabbit is gone, so the dog never had a turn.
  if (next.hero === -1) return still

  const { via, to } = dogPath(prev, next.hero)
  const first = wayFrom(prev.n, prev.dog, via)
  const second = wayFrom(prev.n, via, to)
  if (first === null) return { via: null, line: 'The dog could not move.' }
  if (second === null) return { via: null, line: `The dog went ${first}, and then stopped.` }
  if (first === second) return { via, line: `The dog went ${first}, then ${first} again.` }
  return { via, line: `The dog went ${first}, then ${second}.` }
}

/** How long a piece takes to cross one square, read from the token it travels on. */
function travelMillis(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-3').trim()
  const ms = raw.endsWith('ms') ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000
  return Number.isFinite(ms) ? ms : 0
}

/** The lane the gap opens onto, named the way the CSS names it. */
const SIDES = ['up', 'right', 'down', 'left'] as const

/** One arrow key, one step. The maze wants its arrows more than a tab stop does. */
const ARROWS: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
}

interface Turn {
  /** The position this turn arrived at. A cue only stands while the board is still on it. */
  token: MazeState
  /** The dog's middle square, or null when it took fewer than two steps. */
  via: number | null
  line: string
}

export function Board({ state, dispatch, locked }: BoardProps<MazeState, MazeAction>) {
  /**
   * A rabbit cannot pretend to stand inside a hedge, so this puzzle's refusal
   * moves nothing: `refusal.shown` is always the real position, and what the
   * hook is really here for is the cue on the hedge, the shake on the rabbit
   * and the sentence in front of the status line.
   */
  const refusal = useRefusal(state)
  const { n, door, doorDir, hero, dog } = refusal.shown

  /** Read once, so the piece and the timer that lands it agree. */
  const [travel] = useState(travelMillis)

  /**
   * The dog's two steps, worked out during render rather than in an effect: an
   * effect runs after paint, so the dog would be drawn standing on its landing
   * square for one frame before setting off. React throws this render away and
   * runs another, exactly as `useEphemeral` does.
   */
  const [turn, setTurn] = useState<Turn>(() => ({ token: state, via: null, line: '' }))
  if (turn.token !== state) {
    const next = turnOf(turn.token, state)
    setTurn({ token: state, via: travel < 20 ? null : next.via, line: next.line })
  }

  useEffect(() => {
    if (turn.via === null) return
    const timer = setTimeout(() => {
      setTurn((cur) => (cur.via === null ? cur : { ...cur, via: null }))
    }, travel)
    return () => clearTimeout(timer)
  }, [turn, travel])

  /** The square the level ended on, shaken and flashed once as the board locks. */
  const [ended, blame] = useCue<MazeState>()
  useEffect(() => {
    if (caughtAt(state) !== null) blame(state)
  }, [state, blame])
  const catching = ended === state

  const out = hero === -1
  const dogAt = turn.via ?? dog
  const doorRow = rowOf(n, door)
  const doorCol = colOf(n, door)

  /** Where the lane cell beside the gap sits in the grid. */
  const lane =
    doorDir === 0
      ? { gridRow: '1', gridColumn: String(2 + doorCol) }
      : doorDir === 2
        ? { gridRow: String(2 + n), gridColumn: String(2 + doorCol) }
        : doorDir === 3
          ? { gridRow: String(2 + doorRow), gridColumn: '1' }
          : { gridRow: String(2 + doorRow), gridColumn: String(2 + n) }

  const place = (cell: number) => ({
    gridRow: String(2 + rowOf(n, cell)),
    gridColumn: String(2 + colOf(n, cell)),
  })
  const spot = (cell: number) =>
    ({ '--r': String(rowOf(n, cell)), '--c': String(colOf(n, cell)) }) as CSSProperties

  const takeStep = (dir: Dir) => {
    if (locked || out) return
    const no = refusalOf(refusal.shown, dir)
    if (no === null) {
      dispatch({ type: 'step', dir })
      return
    }
    if (!refusal.offered) return
    refusal.refuse({ ...no, where: seamId(n, hero, dir) })
  }

  /**
   * The arrows are the moves: one press, one turn, and the page does not
   * scroll under it.
   *
   * It is a listener rather than a prop on the grid because the tab stop does
   * not always sit inside the grid. A step that takes the rabbit to an edge
   * removes the very button that was pressed — the last row has no way down —
   * and the shell answers that by putting focus on the stage, which is the
   * board's parent rather than its child. So the two places the arrows are
   * taken from are inside the board and on whatever contains it; anywhere
   * else on the page they still scroll.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const dir = ARROWS[event.key]
      if (dir === undefined) return
      const focused = document.activeElement
      if (focused === null || focused === document.body) return
      if (!root.contains(focused) && !focused.contains(root)) return
      event.preventDefault()
      takeStep(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* --- the hedges, one bar a seam, named the way a refusal names one ------ */

  const bars: { id: string; cell: number; lie: 'v' | 'h' }[] = []
  for (let cell = 0; cell < n * n; cell++) {
    // East and south only, so every seam is drawn exactly once.
    if (hedged(refusal.shown, cell, 1)) bars.push({ id: seamId(n, cell, 1), cell, lie: 'v' })
    if (hedged(refusal.shown, cell, 2)) bars.push({ id: seamId(n, cell, 2), cell, lie: 'h' })
  }

  /* --- the rabbit shakes under whichever hedge said no -------------------- */

  const refused = out
    ? ''
    : cx(...DIRS.filter((d) => onBoard(n, hero, d)).map((d) => refusal.shake(seamId(n, hero, d))))
  const rabbitCue = refused === '' ? (catching ? cues.shake : undefined) : refused

  /* --- the five controls -------------------------------------------------- */

  const holdMoves = reduce(refusal.shown, { type: 'hold' }) !== refusal.shown

  const steps = out
    ? []
    : DIRS.map((dir) => {
        const goingOut = hero === door && dir === doorDir
        if (!goingOut && !onBoard(n, hero, dir)) return null
        const word = DIR_WORDS[dir]
        const target = goingOut ? -1 : stepCell(n, hero, dir)
        const wall = !goingOut && hedged(refusal.shown, hero, dir)
        const label = goingOut
          ? 'Go out through the gap.'
          : wall
            ? `Step ${word}, but a hedge stands there.`
            : target === dog
              ? `Step ${word}, onto the dog's square.`
              : `Step ${word}.`
        return (
          <button
            key={word}
            type="button"
            className={cx(s.step, 'u-press', goingOut && s.out)}
            style={goingOut ? lane : place(target)}
            data-dir={word}
            data-dead={wall && !refusal.offered ? 'true' : undefined}
            disabled={locked}
            aria-disabled={wall && !refusal.offered ? true : undefined}
            aria-label={label}
            onClick={() => {
              if (wall && !refusal.offered) return
              takeStep(dir)
            }}
          >
            {goingOut ? <span className="u-label">Out</span> : <StepMark className={s.mark} />}
          </button>
        )
      }).filter(Boolean)

  /* --- what the board says ------------------------------------------------ */

  const where = out
    ? 'The rabbit is out through the gap.'
    : `The rabbit is on row ${rowOf(n, hero) + 1}, column ${colOf(n, hero) + 1}. The dog is on row ${
        rowOf(n, dog) + 1
      }, column ${colOf(n, dog) + 1}.`

  return (
    <div className={s.board} ref={rootRef}>
      {/* The one rule that has to be held in a head, on the board for the
          whole game rather than in the drawer that shuts on a second visit. */}
      <p className={`u-label ${s.goal}`}>The dog takes two steps for every one of yours.</p>

      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          data-door={SIDES[doorDir]}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`A hedge maze ${n} squares across`}
        >
          {Array.from({ length: n * n }, (_, cell) => (
            <div key={`cell-${cell}`} className={s.cell} style={place(cell)} aria-hidden="true" />
          ))}

          <div className={s.hedges} aria-hidden="true">
            {bars.map((bar) => (
              <span
                key={bar.id}
                className={cx(s.hedge, refusal.flash(bar.id))}
                data-lie={bar.lie}
                style={spot(bar.cell)}
              />
            ))}
          </div>

          <div className={s.pieces} aria-hidden="true">
            {!out && (
              <span className={s.piece} style={spot(hero)}>
                <Pictogram name="rabbit" className={cx(s.art, rabbitCue)} />
              </span>
            )}
            <span className={s.piece} style={spot(dogAt)}>
              <Pictogram name="dog" className={cx(s.art, catching && cues.flash)} />
            </span>
          </div>

          <div className={s.walls} aria-hidden="true">
            <span
              className={s.gap}
              data-side={SIDES[doorDir]}
              style={{ '--gr': String(doorRow), '--gc': String(doorCol) } as CSSProperties}
            />
          </div>

          {/* The way out is named in ink, and it is the same word whether or
              not the rabbit is standing where it can be taken. */}
          {out ? (
            <span className={s.escaped} style={lane} aria-hidden="true">
              <Pictogram name="rabbit" className={s.art} />
            </span>
          ) : hero === door ? null : (
            <span className={`u-label ${s.sign}`} style={lane} aria-hidden="true">
              Out
            </span>
          )}

          {steps}

          {!out && (
            <button
              type="button"
              className={cx(s.hold, 'u-press')}
              style={place(hero)}
              data-dead={holdMoves ? undefined : 'true'}
              disabled={locked}
              aria-disabled={holdMoves ? undefined : true}
              aria-label="Stand still."
              onClick={() => {
                if (locked || !holdMoves) return
                dispatch({ type: 'hold' })
              }}
            >
              <HoldMark className={s.ring} />
            </button>
          )}
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{refusal.say(turn.line)}</p>
      <p className="u-sr" role="status">
        {refusal.say([turn.line, where].filter(Boolean).join(' '))}
      </p>
    </div>
  )
}
