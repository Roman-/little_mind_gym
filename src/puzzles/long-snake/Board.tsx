import { useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { Clash, ClashKind, LineMark, SnakeAction, SnakeState } from './logic'
import {
  clashOf,
  colCells,
  colMarks,
  colOf,
  describeClash,
  dottedCells,
  isEnd,
  lengthOf,
  refusalOf,
  rowCells,
  roomIn,
  rowMarks,
  rowOf,
  snakeCount,
  snakeIn,
  strandedAs,
  strandedEnds,
  troubleOf,
} from './logic'
import s from './board.module.css'

/**
 * The board is the tents' plan: a field of squares with a number at the end of
 * every row and every column, standing outside the field's rim in a margin of
 * its own. The head and the tail are sunk slabs in it, given rather than
 * pressed, and the snake is drawn over the top as one band.
 *
 * Nothing on this board ever breaks a rule. A square that would take a line
 * past its number, touch the snake side by side or close it into a ring joins
 * the snake for the length of one cue and is handed back by `refusalOf` — so a
 * number can never run over, and the margin can talk: a number is crossed off
 * the moment its line is full, and boxed in clay when its line can no longer
 * be filled. A snake square that can no longer be given the neighbours it
 * wants is ringed in clay the same way, and the head or the tail boxed, which
 * is the same fact about one square.
 */

/** The band's width, in squares: under half, so the tile it lies on still reads round it. */
const BAND = 0.46
/**
 * Its hairline, in squares each side: the 1px of ink at four tenths that every
 * flat enamel piece in the collection wears, drawn once round the whole band so
 * no seam shows where two squares join. A square runs from 44px (seven wide, on
 * a phone) to 104px (five wide, on a desk), so this comes to 0.9 to 2.1px. At
 * 0.03 it was 1.3 to 3.1px, and on the five-wide desk board the edge read as a
 * grey outline three times the weight of the tiles' own hairline.
 */
const EDGE = 0.02
/**
 * The tail's round end, in squares across. The band narrows to it over the
 * tail's last square, so the tail's is the only narrow end on the board, and
 * no end a child makes can be taken for it. At the band's own width it was
 * the same disc as a square added on its own, or the free end of a piece
 * added in the middle — which the level-two and level-three hints ask for —
 * and the two were told apart only by the ring of slab or tile left round the
 * disc, which dark mode all but hides. This is 11px across on the smallest
 * square (44px) and 27px on the biggest (104px), against the body's 20px and
 * 48px.
 */
const TAIL = 0.26

/** Rounded, so a corner does not print sixteen digits into the markup. */
const round = (v: number) => Math.round(v * 1000) / 1000

/**
 * One number in the margin, said out loud for anyone who cannot see it.
 *
 * A stuck line is short of room and not always out of it, so its label says
 * how much room it has left: a listener hears the count a looker makes by
 * running an eye along the squares with no dot on them.
 */
function clueLabel(word: string, ordinal: number, want: number, has: number, room: number, mark: LineMark) {
  if (want === 0) return `${word} ${ordinal} wants no snake squares at all`
  const squares = want === 1 ? '1 snake square' : `${want} snake squares`
  if (mark === 'done') return `${word} ${ordinal} has its ${squares}`
  if (mark === 'stuck') {
    return room === 0
      ? `${word} ${ordinal} wants ${squares}, has ${has}, and has no room for more`
      : `${word} ${ordinal} wants ${squares}, has ${has}, and has room for only ${room} more`
  }
  return `${word} ${ordinal} wants ${squares} and has ${has}`
}

export function Board({ state, dispatch, locked }: BoardProps<SnakeState, SnakeAction>) {
  /**
   * With forbidden moves offered, no rule on this board takes a square away. A
   * square that cannot stay joins the snake where the child put it, is
   * answered, and is handed back. Only where a player has asked for those to be
   * refused up front does a square go dead, and then it says why.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n, head, tail, rowClues, colClues } = shown

  /**
   * What the board really holds, as against what it is drawing. `shown` carries
   * a refused square for the length of one cue and that square is on its way
   * straight back off, so the band is drawn from `shown` and every question
   * about the position — which squares are dotted, which numbers are done,
   * which squares are stranded, what is said — is asked of `state`. Asked of
   * `shown`, a number would be crossed off for a square that never landed.
   */
  const dots = useMemo(() => dottedCells(state), [state])
  const rows = useMemo(() => rowMarks(state, dots), [state, dots])
  const cols = useMemo(() => colMarks(state, dots), [state, dots])
  const stranded = useMemo(() => new Set(strandedEnds(state, dots)), [state, dots])
  const trouble = useMemo(() => troubleOf(state), [state])

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every square. The numbers are the token rather than the
   * whole state for exactly that reason: they are a new array only when a board
   * is dealt, which is the one moment the tab stop should start again. And the
   * seed is the first square that is neither end, because the head or the tail
   * stands in the top left corner on some of the boards this deals.
   *
   * Every square but the two ends takes focus, whether or not it will join the
   * snake: a square that refuses the tap up front is `aria-disabled` and never
   * `disabled`, because a disabled button cannot be focused and the stop would
   * go off the board in silence.
   */
  const firstOpen = useMemo(() => {
    let i = 0
    while (i === head || i === tail) i++
    return i
  }, [head, tail])
  const [cursor, setCursor] = useEphemeral(state.rowClues, firstOpen)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * The group a refused square fell foul of, lit for one run of the cue: the
   * row or the column whose number is already met, with that number; the square
   * and the snake squares it would touch; or the square and the whole piece it
   * would close into a ring. The red ring the refusal puts round the square
   * says which square; this says what it is wrong with. --dur-5, the rung for a
   * group the eye has to read, and the rung `.highlight` is animated over.
   */
  const [cue, light] = useCue<{ from: SnakeState; clash: Clash }>('--dur-5')
  /**
   * And the light dies with the position that it was about, exactly as the
   * refused square does in `useRefusal`. The ring runs for --dur-4 and the
   * light for --dur-5, so the board is live again while the light is still on:
   * the next square can land, or the shell can rewind the move tape, under a
   * group lit for a tap that no longer means anything.
   */
  const lit = cue !== null && cue.from === state ? cue.clash : null
  const litGroup = useMemo(() => new Set(lit?.cells), [lit])

  const tap = (index: number) => {
    if (locked || refusal.busy || isEnd(state, index)) return
    // Taking a square off breaks no rule, so only a square joining is weighed —
    // and which squares those are is `logic.ts`'s to say, not the board's.
    if (!state.snake[index]) {
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
   * The next square in this direction that is neither the head nor the tail.
   * The two ends are not controls, so the step walks over them and keeps
   * going, and stands still at the edge rather than wrapping round to the far
   * side of the board.
   */
  const stepTo = (from: number, dr: number, dc: number): number | null => {
    let r = rowOf(n, from) + dr
    let c = colOf(n, from) + dc
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const i = r * n + c
      if (i !== head && i !== tail) return i
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
    if (step === undefined) return
    event.preventDefault()
    const next = stepTo(cursor, step[0], step[1])
    if (next !== null) focusCell(next)
  }

  const squares = shown.snake.map((_, i) => {
    const where = `Row ${rowOf(n, i) + 1}, column ${colOf(n, i) + 1}`
    // Stranded is a fact about the position the board holds, so it is asked of
    // `state`; a refused square is never snake there, so it is never stranded.
    const stuck = stranded.has(i)

    if (isEnd(shown, i)) {
      // Given, so not a control. Boxed in clay when every square beside it is
      // snake or dotted and it has not yet joined the snake: the same mark, for
      // the same reason, as the number at the end of a line that can no longer
      // be filled. An end wants one neighbour, so stuck is always nowhere.
      return (
        <div className={s.cell} data-end="true" key={i}>
          <div
            className={cx(s.end, litGroup.has(i) && cues.highlight)}
            data-mark={stuck ? 'stuck' : undefined}
            role="img"
            aria-label={`${where}, the snake's ${i === head ? 'head' : 'tail'}${stuck ? ', with nowhere left to go' : ''}`}
          />
        </div>
      )
    }

    const snake = shown.snake[i]
    // A refused square is drawn as snake for one cue and handed straight back,
    // so for that cue the square says nothing about the room it has: the square
    // a child is looking at is not one the board holds.
    const bounced = refusal.flash(String(i))
    const room = !snake && bounced === undefined && dots[i]
    // Offering a forbidden move means offering it to a listener too, so a live
    // square says what is on it and nothing else. It is only the dead square —
    // the player having asked for these to be refused up front — that says why
    // it will not take the tap. Dead is `aria-disabled` and never `disabled`.
    const stopped = !snake && !refusal.offered ? clashOf(state, i) : null
    const stuckWords = !stuck
      ? ''
      : strandedAs(state, i, dots) === 'nowhere'
        ? ', with nowhere left to go'
        : ', with no way through'
    const label = `${where}, ${snake ? 'a snake square' : room ? 'empty, no room for the snake' : 'empty'}${stuckWords}`

    return (
      <div className={s.cell} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', bounced ?? (litGroup.has(i) && cues.highlight))}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-snake={snake ? 'true' : undefined}
          data-room={room ? 'none' : undefined}
          data-mark={stuck ? 'stuck' : undefined}
          disabled={locked}
          aria-disabled={stopped === null ? undefined : true}
          aria-label={stopped === null ? label : `${describeClash(stopped)} ${label}`}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        />
      </div>
    )
  })

  /*
   * The square a refusal is drawing, if there is one: snake in `shown` and not
   * in `state`. Refused for touching the snake, it is drawn with no link to
   * the squares that it presses against, because not joining them is the
   * whole of what its sentence says. Linked, the band ran smoothly through the
   * head and round the refused square as a bend a snake may make, under the
   * words "The snake would touch itself side by side here." A ring keeps its
   * links, because the ring is the shape that its sentence names, and so does
   * a square refused for its row or column, whose sentence is about a count
   * and not about the shape.
   */
  const pretend = shown === state ? -1 : shown.snake.findIndex((on, i) => on && !state.snake[i])
  const pressed = pretend >= 0 && clashOf(state, pretend)?.kind === 'touch' ? pretend : -1
  const joined = (a: number, b: number) => shown.snake[b] && a !== pressed && b !== pressed

  /**
   * The snake, drawn once over the whole field in the field's own units, so one
   * square is one unit each way however big the board is on the day. It is one
   * shape because a child names it as one thing: a round node on every snake
   * square and a link between every two that sit side by side — which in a
   * position the rules allow is every two that are joined, and the one square
   * left unlinked is a touch refused, above. The nodes round off every end and
   * every bend, so the links are cut square.
   *
   * It is one colour, `--p-teal` enamel, whatever it is doing: on the head and
   * the tail from the first render, on a square that will turn out wrong, on a
   * refused square for the length of its cue, and on the finished snake. A
   * piece a child makes gets no colour worked out from the answer, and a snake
   * that changed colour as it came right would be telling the child which
   * squares were.
   *
   * And it is not green, although the picture on the head is. It was first
   * drawn in `--p-moss`, the picture's own enamel, and that stands 6.3 from the
   * `--moss` a crossed-off number wears (CIE76, and 9.6 in the dark): the same
   * green to an eye. Every square a child added turned the colour of a line
   * that is done, and the only square that did not was a refused one, in clay
   * — so each tap taught green for right, and a wrong square that broke no
   * rule turned right's colour. Teal is the enamel nearest to that green, 24.7
   * from it (26.4 in the dark) where the next, slate, is 35.8, and it stands
   * as far from `--moss`: 24.3, and 30.7 in the dark. It is nowhere near the
   * amber or the clay either, at 71.0 and 75.0.
   *
   * It lies over the tiles and never takes a tap: every press lands on the tile
   * under it, and a pressed tile sinks without the band moving. The head's
   * picture is the last thing in it, so the band comes out of the snake, and it
   * narrows over its last square into the tail (see `TAIL`).
   */
  const nodes: number[] = []
  const links: [number, number][] = []
  shown.snake.forEach((on, i) => {
    if (!on) return
    nodes.push(i)
    if (colOf(n, i) < n - 1 && joined(i, i + 1)) links.push([i, i + 1])
    if (rowOf(n, i) < n - 1 && joined(i, i + n)) links.push([i, i + n])
  })
  const x = (i: number) => colOf(n, i) + 0.5
  const y = (i: number) => rowOf(n, i) + 0.5
  const radius = (i: number, grow: number) => round((i === tail ? TAIL : BAND) / 2 + grow)

  /**
   * One link, `grow` wider each side than the body: a straight run between two
   * squares, or, into the tail, a taper from the band's width down to the
   * tail's, drawn as the four corners of that run. A link runs along a row or
   * down a column, so the way across it is a quarter turn of the way along.
   */
  const link = ([a, b]: [number, number], grow: number) => {
    const key = `${a}-${b}`
    if (a !== tail && b !== tail) {
      return <line key={key} x1={x(a)} y1={y(a)} x2={x(b)} y2={y(b)} strokeWidth={round(BAND + 2 * grow)} />
    }
    const [from, to] = a === tail ? [b, a] : [a, b]
    const across = [y(from) - y(to), x(to) - x(from)]
    const corner = (at: number, half: number, side: number) =>
      `${round(x(at) + side * across[0] * half)},${round(y(at) + side * across[1] * half)}`
    const wide = BAND / 2 + grow
    const narrow = TAIL / 2 + grow
    const points = [corner(from, wide, 1), corner(to, narrow, 1), corner(to, narrow, -1), corner(from, wide, -1)]
    return <polygon key={key} points={points.join(' ')} />
  }

  const band = (
    <svg className={s.band} viewBox={`0 0 ${n} ${n}`} aria-hidden="true" focusable="false">
      <g className={s.bandEdge}>
        {links.map((pair) => link(pair, EDGE))}
        {nodes.map((i) => (
          <circle key={i} cx={x(i)} cy={y(i)} r={radius(i, EDGE)} />
        ))}
      </g>
      <g className={s.bandBody}>
        {links.map((pair) => link(pair, 0))}
        {nodes.map((i) => (
          <circle key={i} cx={x(i)} cy={y(i)} r={radius(i, 0)} />
        ))}
      </g>
      <Pictogram name="snake" x={colOf(n, head) + 0.07} y={rowOf(n, head) + 0.07} size={0.86} />
    </svg>
  )

  const clue = (kind: ClashKind, k: number, cells: number[], want: number, mark: LineMark) => {
    const word = kind === 'row' ? 'Row' : 'Column'
    return (
      <div
        key={`${kind}${k}`}
        className={cx(
          s.clue,
          lit !== null && lit.kind === kind && lit.ordinal === k + 1 && cues.highlight,
        )}
        data-mark={mark}
        role="img"
        aria-label={clueLabel(word, k + 1, want, snakeIn(state, cells), roomIn(state, cells, dots), mark)}
      >
        {want}
      </div>
    )
  }

  /* One wrong turn, and only ever one said, in `troubleOf`'s order: the snake
     reaching its tail too soon; a line without room for all the snake squares
     that it still wants; every number met with the snake in pieces; a snake square
     with nowhere left to go, or a lone one with no way through. Then how many
     squares are left.

     Every one of these is drawn as well as said — the numbers boxed in clay,
     the stranded squares ringed — and they are the wrong turns the board can
     already see, not every wrong turn there is: a snake can be sent the wrong
     way several squares before anything runs out of room, and nothing here
     goes looking for that. It breaks no rule, working it out is the puzzle,
     and Step back is in the toolbar throughout. */
  const left = lengthOf(state) - snakeCount(state)
  const tally =
    left === 0
      ? ''
      : left === 1
        ? '1 snake square still to fill in.'
        : `${left} snake squares still to fill in.`

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres the
          plan, and lets a seven-wide one scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div className={s.plan} data-size={String(n)} style={{ '--n': String(n) } as CSSProperties}>
          <div aria-hidden="true" />
          <div className={s.top}>
            {colClues.map((want, c) => clue('column', c, colCells(n, c), want, cols[c]))}
          </div>
          <div className={s.left}>
            {rowClues.map((want, r) => clue('row', r, rowCells(n, r), want, rows[r]))}
          </div>
          <div
            className={s.field}
            role="group"
            aria-label={`The snake on a ${n} by ${n} board`}
            onKeyDown={onKeyDown}
          >
            {squares}
            {band}
          </div>
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say(trouble?.message ?? tally)}</p>
      {/* Mounted from the first render, so a screen reader is already watching
          it when a refusal arrives. Only a wrong turn is announced: the tally
          falls on every move, and every move is not news. */}
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say(trouble?.message ?? '')}
      </p>
    </div>
  )
}
