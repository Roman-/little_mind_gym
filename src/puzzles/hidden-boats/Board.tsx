import { useId, useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { BoatsAction, BoatsState, Clash, Piece } from './logic'
import {
  blockedCells,
  boatCount,
  clashOf,
  colOf,
  describeClash,
  fleetOnBoard,
  fleetTotal,
  hullOf,
  numbersMet,
  refusalOf,
  rowOf,
} from './logic'
import s from './board.module.css'

/**
 * The board is a chart of the sea: a field of squares with a number at the end
 * of every row and every column, standing outside the field's rim in a margin
 * of its own, and under it the boats to find, drawn as outlines.
 *
 * **The numbers never say how a line is getting on.** No moss on a line that
 * has its boat squares, no clay on a line with too many, and no refusal of a
 * boat square past a line's number. Each of those is an oracle a player who
 * never thinks can climb: against a board that refuses past a number, a player
 * who taps at random and keeps what lands wins every four-boat and six-boat
 * board within fifty times par, and against this board 13 in 100 and none
 * (see the top of logic.ts). The counting is the puzzle, and it stays in the
 * child's head — exactly as it does on the thermometers.
 *
 * What the board does say is what breaks a boat's shape, which reads only the
 * child's own boats and the printed pieces. A boat square that would bend a
 * boat, touch another at a corner, stand against a printed piece or make a
 * boat too long goes down for the length of one cue and is handed back by
 * `refusalOf`; and the squares its own boats already rule out wear a faint
 * dot, which is the paper game's water, free.
 *
 * And the strip under the board counts the fleet. An outline fills in for a
 * boat of its length once every longer outline is filled in already, or once
 * dots and the edge have shut that boat in — so a boat printed whole is ticked
 * off from the first frame — and on the way to the answer a filled outline
 * never stands for part of a longer boat and a right tap never empties one.
 * Every number met and every outline filled in is exactly solved — a theorem,
 * proved above `fleetOnBoard` — so the note under the board can say which half
 * is still off without saying where.
 */

/** A printed piece, said out loud for anyone who cannot see it. */
function pieceWords(piece: Piece): string {
  if (piece === 'single') return 'a whole boat one square long'
  if (piece === 'middle') return 'the middle of a boat'
  // An end is named for the way the rest of its boat lies, so an end that
  // points right is the left-hand end of its boat.
  if (piece === 'right') return 'the left end of a boat'
  if (piece === 'left') return 'the right end of a boat'
  if (piece === 'down') return 'the top end of a boat'
  return 'the bottom end of a boat'
}

/**
 * One number in the margin, said out loud. Like the thermometers' numbers it
 * says what the finished line holds and never how the line is doing.
 */
function clueLabel(word: string, ordinal: number, want: number): string {
  if (want === 0) return `${word} ${ordinal} wants no boat squares`
  return `${word} ${ordinal} wants ${want} boat ${want === 1 ? 'square' : 'squares'}`
}

export function Board({ state, dispatch, locked }: BoardProps<BoatsState, BoatsAction>) {
  /**
   * With forbidden moves offered, no rule on this board takes a square away. A
   * boat square that cannot stay goes down where the child put it, is
   * answered, and is handed back. Only where a player has asked for those to
   * be refused up front does a square go dead, and then it says why.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n, fleet, printed, rowClues, colClues } = state

  /**
   * What the board really holds, as against what it is drawing. `shown`
   * carries a refused boat square for the length of one cue, and that square
   * is on its way straight back off, so the squares and their hulls are drawn
   * from `shown` — a bent boat shows its corner, and a boat that is too long
   * is visibly too long — while every question about the position is asked of
   * `state`. Asked of `shown`, the strip would fill an outline for a boat that
   * never landed.
   */
  const blocked = useMemo(() => blockedCells(state), [state])
  const found = useMemo(() => fleetOnBoard(state), [state])

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every square. The printed pieces are the token rather
   * than the whole state for exactly that reason: they are a new array only
   * when a board is dealt, which is the one moment the tab stop should start
   * again. The seed is the first square with nothing printed on it, because a
   * printed square is not a control.
   *
   * Every square that is not printed takes focus, whether or not it will take a
   * boat: a square that refuses the tap up front is `aria-disabled` and never
   * `disabled`, because a disabled button cannot be focused and the stop would
   * go off the board in silence.
   */
  const firstOpen = useMemo(() => Math.max(0, printed.indexOf(null)), [printed])
  const [cursor, setCursor] = useEphemeral(printed, firstOpen)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})
  const fleetId = useId()

  /**
   * The group a refused boat square fell foul of, lit for one run of the cue:
   * the whole boat it would bend, the boat squares at its corners, the printed
   * piece that will not have it, or the whole run that would be too long. The
   * red ring the refusal puts round the square says which square; this says
   * what it is wrong with. --dur-5, the rung for a group the eye has to read,
   * and the rung `.highlight` is animated over.
   */
  const [cue, light] = useCue<{ from: BoatsState; clash: Clash }>('--dur-5')
  /**
   * And the light dies with the position it was about, exactly as the refused
   * square does in `useRefusal`. The ring runs for --dur-4 and the light for
   * --dur-5, so the board is live again while the light is still on, and the
   * shell can rewind the move tape under it at any time. Blaming squares on
   * this position for a tap made on another one would be a lie.
   */
  const lit = cue !== null && cue.from === state ? cue.clash : null
  const litGroup = useMemo(() => new Set(lit?.cells), [lit])

  const tap = (index: number) => {
    if (locked || refusal.busy) return
    // Taking a boat square away breaks no rule, so only a square going down is
    // weighed — and which squares those are is `logic.ts`'s to say.
    if (!state.boats[index]) {
      const no = refusalOf(state, index)
      if (no !== null) {
        if (refusal.offered) {
          refusal.refuse({ pretend: no.pretend, message: no.message, where: String(index) })
          light({ from: state, clash: no.clash })
        }
        return
      }
    }
    dispatch({ type: 'toggle', index })
  }

  const focusCell = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  /**
   * The next square this way with nothing printed on it. A printed square is
   * not a control, so the step walks over it and keeps going, and stands still
   * at the edge rather than wrapping round to the far side of the board.
   */
  const stepTo = (from: number, dr: number, dc: number): number | null => {
    let r = rowOf(n, from) + dr
    let c = colOf(n, from) + dc
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const i = r * n + c
      if (printed[i] === null) return i
      r += dr
      c += dc
    }
    return null
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A browser's own shortcuts keep their keys: only the bare arrow is ours.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const move = steps[event.key]
    if (move === undefined) return
    // A locked board leaves the arrows to the browser, so the page still
    // scrolls. A refusal on screen holds the position, not the focus, so the
    // arrows still walk while one is up.
    if (locked) return
    event.preventDefault()
    const next = stepTo(cursor, move[0], move[1])
    if (next !== null) focusCell(next)
  }

  const squares = printed.map((piece, i) => {
    const where = `Row ${rowOf(n, i) + 1}, column ${colOf(n, i) + 1}`
    const hull = hullOf(shown, i)
    const art = hull !== null && <span className={s.hull} data-hull={hull} aria-hidden="true" />

    if (piece !== null) {
      // A flush plate, not a button: a printed square cannot be taken away, so
      // there is nothing to press.
      return (
        <div className={s.cell} key={i}>
          <div
            className={cx(s.given, litGroup.has(i) && cues.highlight)}
            role="img"
            aria-label={`${where}, printed, ${pieceWords(piece)}`}
          >
            {art}
          </div>
        </div>
      )
    }

    const boat = shown.boats[i]
    // A refused square is drawn here for one cue and handed straight back, so
    // for that cue it says nothing about the room it has: the boat square a
    // child is looking at is not one the board holds.
    const bounced = refusal.flash(String(i))
    const room = !boat && bounced === undefined && blocked[i]
    // Offering a forbidden move means offering it to a listener too, so a live
    // square says what is on it and nothing else. Only a dead square — the
    // player having asked for these to be refused up front — says why it will
    // not take the tap. Dead is `aria-disabled` and never `disabled`, so it
    // keeps its place in the arrow keys' walk.
    const stopped = !boat && !refusal.offered ? clashOf(state, i) : null
    const label = `${where}, ${boat ? 'a boat square' : room ? 'empty, no room for a boat' : 'empty'}`

    return (
      <div className={s.cell} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', bounced ?? (litGroup.has(i) && cues.highlight))}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-room={room ? 'none' : undefined}
          disabled={locked}
          aria-disabled={stopped === null ? undefined : true}
          aria-label={stopped === null ? label : `${describeClash(stopped, fleet)} ${label}`}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          {art}
        </button>
      </div>
    )
  })

  const clue = (word: 'Row' | 'Column', k: number, want: number) => (
    <div key={`${word}${k}`} className={s.clue} role="img" aria-label={clueLabel(word, k + 1, want)}>
      {want}
    </div>
  )

  /* The boats to find, longest first, in `fleet` order. A place stays a place:
     an outline that fills in never moves along the strip. */
  const ships = fleet.map((length, k) => (
    <li
      key={k}
      className={s.ship}
      style={{ '--len': String(length) } as CSSProperties}
      data-lit={found[k] ? 'true' : undefined}
      aria-label={`A boat ${length} ${length === 1 ? 'square' : 'squares'} long, ${found[k] ? 'filled in' : 'still an outline'}`}
    >
      {Array.from({ length }, (_, j) => (
        <span key={j} className={s.slot} />
      ))}
    </li>
  ))

  /* What is left, and then which half is not right yet. The tally counts what
     the strip adds up to against what the board holds, so it says nothing the
     board does not already show. Once every boat square is down, the strip and
     the numbers are the two halves of solved (the theorem above
     `fleetOnBoard`), and the note says which half is off — never which line
     or which boat, because working that out is the puzzle. */
  const total = fleetTotal(state)
  const placed = boatCount(state)
  let news = ''
  if (placed > total) {
    news = placed - total === 1 ? '1 boat square too many.' : `${placed - total} boat squares too many.`
  } else if (placed === total && !found.every(Boolean)) {
    news = 'Every boat square is placed. The boats do not match the outlines yet.'
  } else if (placed === total && !numbersMet(state)) {
    news = 'Every outline is filled in. A number does not match its line yet.'
  }
  const left = total - placed
  const tally = left <= 0 ? '' : left === 1 ? '1 boat square still to place.' : `${left} boat squares still to place.`
  const note = locked ? '' : news !== '' ? news : tally

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres the
          chart, and lets a board that is wider than a phone scroll rather
          than shrink under a fingertip: six wide under 390px, and seven wide
          under 430px. */}
      <div className={s.frame}>
        <div className={s.plan} data-size={String(n)} style={{ '--n': String(n) } as CSSProperties}>
          <div aria-hidden="true" />
          <div className={s.top}>{colClues.map((want, c) => clue('Column', c, want))}</div>
          <div className={s.left}>{rowClues.map((want, r) => clue('Row', r, want))}</div>
          <div
            className={s.field}
            role="group"
            aria-label={`Hidden boats on a ${n} by ${n} board`}
            onKeyDown={onKeyDown}
          >
            {squares}
          </div>
        </div>
      </div>

      <div className={s.fleetRow} data-size={String(n)}>
        <p className={`u-label ${s.fleetLabel}`} id={fleetId}>
          Boats to find
        </p>
        <ul className={s.fleet} aria-labelledby={fleetId}>
          {ships}
        </ul>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say(note)}</p>
      {/* Mounted from the first render, so a screen reader is already watching
          it when a refusal arrives. The tally is not announced: it climbs on
          every move, and every move is not news. */}
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say(news)}
      </p>
    </div>
  )
}
