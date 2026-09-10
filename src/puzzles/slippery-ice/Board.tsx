import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import type { BoardProps } from '../../lib/types'
import type { Dir, IceAction, IceState } from './logic'
import { DIRS, DIR_WORDS, canSend, colOf, nameFor, rowOf, walled } from './logic'
import { RingMark, SendMark } from './glyphs'
import s from './board.module.css'

/**
 * The pond, the animals standing on it, and a pad of four arrows under it.
 *
 * A send is two taps — the animal, then the way — and one dispatched action,
 * exactly as the boat is loaded and then rowed. The first tap is selection and
 * lives here; nothing reaches the shell until an arrow is pressed. The pad
 * holds the chosen animal in the middle of it, so what the next arrow will
 * send is said twice: as the amber ring on the ice, and as the picture between
 * the four arrows.
 *
 * **The arrow keys are the send.** Eight of the shipped boards spend the
 * arrows on a cursor roving a grid of squares, and this board has no such
 * cursor to rove: the only things on the ice a child touches are the two or
 * three animals, and Tab reaches all of them in the order they are drawn. So
 * the arrows are free for the thing they obviously mean here — one press, one
 * send — the way the hedge maze spends them on its four steps.
 *
 * Nothing here previews where an animal would stop. Working that out is the
 * whole puzzle, and a board that drew the landing square would be the dead
 * button of docs/DESIGN.md in another coat: it would hand the answer to a
 * child who only taps.
 */

/** One arrow key, one send. This board has no roving cursor to spend them on. */
const ARROWS: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
}

/** Where a square is, in the words the labels and the status line both use. */
const spotOf = (n: number, cell: number): string =>
  `row ${rowOf(n, cell) + 1}, column ${colOf(n, cell) + 1}`

/**
 * The walls, read out once for anyone who cannot see them.
 *
 * They never move, so this sits outside the status region: it is the board
 * being drawn rather than news. A looker sees every wall on the ice, so a
 * listener is told about every wall on the ice — and neither is told which
 * send is worth making.
 */
function wallsInWords(state: IceState): string {
  const said: string[] = []
  for (let cell = 0; cell < state.n * state.n; cell++) {
    // East and south only, so every wall is named exactly once.
    if (walled(state, cell, 1)) {
      said.push(`between ${spotOf(state.n, cell)} and ${spotOf(state.n, cell + 1)}`)
    }
    if (walled(state, cell, 2)) {
      said.push(`between ${spotOf(state.n, cell)} and ${spotOf(state.n, cell + state.n)}`)
    }
  }
  return said.map((where) => `There is a wall ${where}.`).join(' ')
}

export function Board({ state, dispatch, locked }: BoardProps<IceState, IceAction>) {
  const { n, home, cast, hero, at } = state

  /**
   * The animal the next arrow sends, held here rather than dispatched: one
   * action is one send, which is one move a child would count. It is keyed on
   * the position, so every send costs its own two taps, and a rewind through
   * the move tape never lands with somebody still chosen.
   */
  const [chosen, setChosen] = useEphemeral<number | null>(state, null)

  const send = (dir: Dir) => {
    if (locked || chosen === null || !canSend(state, chosen, dir)) return
    dispatch({ type: 'send', animal: chosen, dir })
  }

  /**
   * The arrows are the moves: one press, one send, and the page does not
   * scroll under it. Escape puts the chosen animal down again.
   *
   * They are only the board's while an animal is chosen. With nobody chosen
   * there is nothing for a direction to do, so the key goes back to the page
   * and scrolls it, rather than dying quietly under a child's finger.
   *
   * It is a listener rather than a prop on the grid because the tab stop is
   * not always inside the grid — the shell parks focus on the stage, which is
   * the board's parent rather than its child. So the two places the arrows are
   * taken from are inside the board and on whatever contains it; anywhere else
   * on the page they still scroll.
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
      if (event.key === 'Escape') {
        if (locked || chosen === null) return
        event.preventDefault()
        setChosen(null)
        return
      }
      const dir = ARROWS[event.key]
      if (dir === undefined || locked || chosen === null) return
      event.preventDefault()
      send(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const spot = (cell: number) =>
    ({ '--r': String(rowOf(n, cell)), '--c': String(colOf(n, cell)) }) as CSSProperties

  /* --- the walls, one bar a seam ------------------------------------------ */

  const bars: { id: string; cell: number; lie: 'v' | 'h' }[] = []
  for (let cell = 0; cell < n * n; cell++) {
    // East and south only, so every seam is drawn exactly once.
    if (walled(state, cell, 1)) bars.push({ id: `${cell}v`, cell, lie: 'v' })
    if (walled(state, cell, 2)) bars.push({ id: `${cell}h`, cell, lie: 'h' })
  }

  /* --- the animals -------------------------------------------------------- */

  const animals = cast.map((animal, i) => {
    const seat = `${animal.label}, ${spotOf(n, at[i])}${at[i] === home ? ', on the ring' : ''}.`
    const label = locked ? seat : chosen === i ? `${seat} Let it go.` : `${seat} Choose it.`
    return (
      // The slot travels and the button sits still inside it. A press moves the
      // button two pixels and a send moves the slot whole squares, so each has
      // a transform of its own and neither can override the other.
      <span className={s.slot} key={animal.id} style={spot(at[i])}>
        <button
          type="button"
          className={cx(s.animal, 'u-press')}
          data-chosen={chosen === i ? 'true' : undefined}
          disabled={locked}
          aria-pressed={chosen === i}
          aria-label={label}
          onClick={() => setChosen((cur) => (cur === i ? null : i))}
        >
          <Pictogram name={animal.art} className={s.art} />
        </button>
      </span>
    )
  })

  /* --- the four sends ------------------------------------------------------ */

  const keys = DIRS.map((dir) => {
    const word = DIR_WORDS[dir]
    const live = chosen !== null && canSend(state, chosen, dir)
    const label =
      chosen === null
        ? `Send ${word}. Choose an animal first.`
        : live
          ? `Send ${nameFor(cast[chosen])} ${word}.`
          : `The ${cast[chosen].label.toLowerCase()} cannot go ${word}.`
    return (
      <button
        key={word}
        type="button"
        className={cx(s.key, 'u-press')}
        data-dir={word}
        data-dead={live ? undefined : 'true'}
        disabled={locked}
        aria-disabled={live ? undefined : true}
        aria-label={label}
        onClick={() => send(dir)}
      >
        <SendMark className={s.mark} />
      </button>
    )
  })

  /* --- what the board says ------------------------------------------------- */

  const note = locked
    ? ''
    : chosen === null
      ? 'Choose an animal to send.'
      : `Now send ${nameFor(cast[chosen])}.`

  const where = `${cast
    .map((animal, i) => `The ${animal.label.toLowerCase()} is on ${spotOf(n, at[i])}.`)
    .join(' ')} The ring is on ${spotOf(n, home)}.`

  return (
    <div className={s.board} ref={rootRef}>
      {/* The one rule that has to be held in a head, kept on the board rather
          than in the drawer that shuts on a second visit. */}
      <p className={`u-label ${s.goal}`}>
        Nobody can stop in the middle of the ice. Get {nameFor(cast[hero])} to the ring.
      </p>

      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`A frozen pond ${n} squares across`}
        >
          <p className="u-sr">{wallsInWords(state)}</p>

          {Array.from({ length: n * n }, (_, cell) => (
            <div
              key={`cell-${cell}`}
              className={s.cell}
              data-home={cell === home ? 'true' : undefined}
              data-won={cell === home && at[hero] === home ? 'true' : undefined}
              aria-hidden="true"
            >
              {cell === home && <RingMark className={s.ring} />}
            </div>
          ))}

          <div className={s.walls} aria-hidden="true">
            {bars.map((bar) => (
              <span key={bar.id} className={s.wall} data-lie={bar.lie} style={spot(bar.cell)} />
            ))}
          </div>

          <div className={s.pieces}>{animals}</div>
        </div>
      </div>

      <div className={s.pad} role="group" aria-label="Send the animal you have chosen">
        {keys}
        {/* Who the four arrows would send: the chosen animal said a second
            time, in the place the thumb is already looking. */}
        <span className={s.well} aria-hidden="true">
          {chosen !== null && <Pictogram name={cast[chosen].art} className={s.wellArt} />}
        </span>
      </div>

      <p className={`u-label ${s.note}`}>{note}</p>
      <p className="u-sr" role="status">
        {where}
      </p>
    </div>
  )
}
