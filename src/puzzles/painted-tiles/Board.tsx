import { useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import { colourRegions, regionPaint } from '../../lib/regions'
import type { BoardProps } from '../../lib/types'
import type { TileAction, TileState } from './logic'
import { colOf, countWord, rowOf, tileNames, tileSizes } from './logic'
import s from './board.module.css'

/**
 * The board is a quilt of tiles laid into the stage, and a number at the end of
 * every row and every column standing outside the field's rim in a margin of
 * its own. It is the patchwork quilt's field and the thermometers' margin, and
 * the one thing it adds to either is paint.
 *
 * **This board says nothing while a child plays, and that is the design.** No
 * clay on a line holding too many, no tick on a line that has come right, no
 * tally of what is left. It was measured here rather than borrowed from the
 * thermometers, and `logic.ts` gives the numbers under `isSolved`: an
 * over-count cue names three plain tiles in every four on an empty five-across
 * board, and a player who paints whatever it lets stand, never counting, lands
 * most of those boards in par. A tick on a finished line is no better. So the
 * board answers a tap with the paint and with nothing else, exactly as the
 * lamps do in lights out and the mercury does in the thermometers. The counting
 * is the puzzle, and it stays in the child's head.
 *
 * Nothing here can be refused, either. A tile is painted all over or not at
 * all, and the state holds one flag a tile, so no tap can break that rule; and
 * a number in the margin says what the finished board has to look like, not
 * what a child may do on the way there. So there is no `useRefusal` on this
 * board, and **Allow moves that break a rule** changes nothing on it: no move
 * here breaks one. Every tap changes something, so no square is a dead control.
 */

/** One number in the margin, said out loud for anyone who cannot see it. */
function clueLabel(word: string, ordinal: number, want: number): string {
  if (want === 0) return `${word} ${ordinal} wants no painted squares`
  return `${word} ${ordinal} wants ${want} painted ${want === 1 ? 'square' : 'squares'}`
}

export function Board({ state, dispatch, locked }: BoardProps<TileState, TileAction>) {
  const { n, tiles, painted, rowClues, colClues } = state

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every tap. The tiles are the token rather than the
   * whole state for exactly that reason: `reduce` passes them through by
   * reference, so they are a new array only when a board is dealt, which is the
   * one moment the tab stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(tiles, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * The square under the pointer or the keyboard, and so the tile a tap there
   * would take. Presentation only, never a move, and cleared by every move —
   * the lights out's trace, one tile wide. It says what the seams already say,
   * so it tells a child nothing about the answer; what it shows is that one tap
   * takes the whole tile, which is the rule this puzzle has and its neighbours
   * in the collection do not.
   */
  const [aim, setAim] = useEphemeral<number | null>(state, null)
  const traced = locked || aim === null ? null : tiles[aim]
  const enter = (cell: number) => setAim((prev) => (prev === cell || locked ? prev : cell))
  const leave = (cell: number) => setAim((prev) => (prev === cell ? null : prev))

  const focusCell = (cell: number) => {
    setCursor(cell)
    const square = refs.current[cell]
    square?.focus()
    // On a phone too narrow for the board, the field slides under row numbers
    // that stay put, and Chromium, measured, brings a square into view on focus
    // only when none of it shows — a square half under the numbers stayed there.
    // `nearest` moves the frame just far enough to clear the square's scroll
    // margin, and moves nothing at all when the square is already in the clear.
    square?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
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
    // A locked board leaves the arrows to the browser, so the page still scrolls.
    if (locked) return
    event.preventDefault()
    const r = rowOf(n, cursor) + move[0]
    const c = colOf(n, cursor) + move[1]
    // Standing still at the edge rather than wrapping round to the far side.
    if (r < 0 || r >= n || c < 0 || c >= n) return
    focusCell(r * n + c)
  }

  /**
   * Which tile a square is in, and how big it is. The letter is the seam said
   * out loud: a listener has no seams, and two squares either side of one would
   * otherwise read out word for word the same — with nothing to say that a tap
   * on one paints the other. It is a letter rather than the colour's name
   * because seven across has more tiles than there are colours, and two tiles
   * that never touch can be the same blue.
   */
  const names = tileNames(tiles)
  const sizes = tileSizes(tiles)
  /**
   * The colour of each tile, as an index into the enamel palette. A tile is a
   * piece you can see on the board, so it takes a piece colour, and no two tiles
   * that touch — even corner to corner — take the same one. The tiles are dealt
   * once and never change, so neither does a tile's colour, and neither does
   * the seat it is washed into: paint goes on the button, never on the wash.
   */
  const colours = colourRegions(n, tiles)

  const squares = tiles.map((tile, cell) => {
    const r = rowOf(n, cell)
    const c = colOf(n, cell)
    // A hairline inside a tile, a heavy seam where one tile meets the next. The
    // seam is where one tap stops, so it is drawn for a child who cannot tell
    // two of the colours apart as well as for one who can.
    const top = r === 0 ? undefined : tiles[cell - n] === tile ? 'hair' : 'seam'
    const left = c === 0 ? undefined : tiles[cell - 1] === tile ? 'hair' : 'seam'
    // The four corner squares round off with the field, so the wash under them
    // does not poke out past its rim.
    const corner =
      (r === 0 || r === n - 1) && (c === 0 || c === n - 1)
        ? `${r === 0 ? 'top' : 'bottom'}-${c === 0 ? 'left' : 'right'}`
        : undefined
    const on = painted[tile]
    // The instructions' words and the move tape's, so a listener hears one name
    // for one action: "wipe the tile" could as well mean cleaning it.
    const doing = on ? 'painted, wipe the paint off' : 'plain, paint the tile'

    return (
      <div
        className={s.cell}
        key={cell}
        data-top={top}
        data-left={left}
        data-corner={corner}
        style={{ '--patch': regionPaint(colours[tile]) } as CSSProperties}
      >
        <button
          type="button"
          className={cx(s.tile, 'u-press')}
          data-painted={on ? 'true' : undefined}
          data-traced={traced === tile ? 'true' : undefined}
          ref={(el) => {
            refs.current[cell] = el
          }}
          tabIndex={cell === cursor ? 0 : -1}
          disabled={locked}
          aria-label={`Row ${r + 1}, column ${c + 1}, tile ${names[tile]} of ${countWord(sizes[tile])} squares, ${doing}`}
          onPointerEnter={() => enter(cell)}
          onPointerLeave={() => leave(cell)}
          onFocus={() => {
            setCursor(cell)
            enter(cell)
          }}
          onBlur={() => leave(cell)}
          onClick={() => {
            if (!locked) dispatch({ type: 'toggle', cell })
          }}
        />
      </div>
    )
  })

  const clue = (word: 'Row' | 'Column', k: number, want: number) => (
    <div
      key={`${word}${k}`}
      className={s.clue}
      role="img"
      aria-label={clueLabel(word, k + 1, want)}
    >
      {want}
    </div>
  )

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres the
          plan, and lets a six- or seven-across one scroll on a narrow phone
          rather than shrink under a fingertip. */}
      <div className={s.frame}>
        <div className={s.plan} data-size={String(n)} style={{ '--n': String(n) } as CSSProperties}>
          <div className={s.corner} aria-hidden="true" />
          <div className={s.top}>{colClues.map((want, c) => clue('Column', c, want))}</div>
          <div className={s.left}>{rowClues.map((want, r) => clue('Row', r, want))}</div>
          <div
            className={s.field}
            role="group"
            aria-label={`Tiles on a ${n} by ${n} board`}
            onKeyDown={onKeyDown}
          >
            {squares}
          </div>
        </div>
      </div>
    </div>
  )
}
