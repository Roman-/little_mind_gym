import { Scene, edge } from '../../components/scene'
import { CARD, colOf, rowOf, runsOf } from './logic'

/**
 * Nothing on this board is a thing a child could point at and name, so nothing
 * here is a pictogram. A boat on this board is a length of squares, and its
 * length is the whole puzzle: a picture of a boat in every square would read as
 * seven little boats rather than one boat of three. So a hull is flat enamel,
 * like a Hanoi disc, and the river crossing keeps the one boat picture there is.
 */

/** Where the field's rim stands, and how wide the field is: 26 units, the stone path's field. */
const EDGE = 3
const SPAN = 26
/**
 * The seat inside the rim, as the board's field has one. On a four-by-four
 * every fleet of three, two and one lies against the rim somewhere, and with
 * the squares run right up to it the hulls stood 0.15 of a unit off the rim's
 * inner edge: at 28px, in the row above the board, the boat across the top and
 * the boat down the side read as a thicker rim rather than as boats. One unit
 * of seat leaves a sliver of bone between every hull and the rim at both sizes.
 */
const SEAT = 1
const CELL = (SPAN - 2 * SEAT) / CARD.n
/** The paper's own ruling, between the squares and never round the outside. */
const RULES = Array.from({ length: CARD.n - 1 }, (_, k) => k + 1)
/**
 * How far a hull stands in from the edge of its squares. The board's hull
 * stands in a fifth of a square; the card's is fatter, so a boat of one is
 * still a disc and not a dot at 28px.
 */
const INSET = 0.85
/** Where square `k` of a row or a column starts. */
const at = (k: number) => EDGE + SEAT + CELL * k

/** Rounded, so 19.5 less 1.9 does not print sixteen digits. */
const tidy = (v: number) => Math.round(v * 1000) / 1000

const answer = Array.from({ length: CARD.n * CARD.n }, (_, i) => (CARD.boats as readonly number[]).includes(i))

/** Each boat as the box round its squares: a capsule one square thick. */
const hulls = runsOf(CARD.n, answer).map((cells) => {
  const rows = cells.map((i) => rowOf(CARD.n, i))
  const cols = cells.map((i) => colOf(CARD.n, i))
  const width = tidy(CELL * (Math.max(...cols) - Math.min(...cols) + 1) - 2 * INSET)
  const height = tidy(CELL * (Math.max(...rows) - Math.min(...rows) + 1) - 2 * INSET)
  return {
    key: cells[0],
    x: tidy(at(Math.min(...cols)) + INSET),
    y: tidy(at(Math.min(...rows)) + INSET),
    width,
    height,
    round: tidy(Math.min(width, height) / 2),
  }
})

/**
 * The card: a finished fleet on a ruled four-by-four sea.
 *
 * Four big shapes, all in the board's own materials: the bone field with its
 * rule and rim, as the thermometers' and the stone path's cards have it, a
 * long hull across, a short hull down, and a disc, each in indigo enamel under
 * the hairline every enamel piece wears. The hulls are indigo because the
 * board's hulls are, and no puzzle picks a colour to be known by.
 *
 * There are no numerals on purpose. An L of numerals is what the tents and
 * trees and the thermometers wear; what tells this card apart is hulls of
 * three lengths lying both ways, and those read at 28px, in grayscale too.
 * It is a real answer — no boat touches another, even at a corner — so a child
 * can check it before they open the puzzle. `logic.test.ts` holds `CARD` to the
 * rules, and this picture is drawn from `CARD`.
 */
export function HiddenBoatsIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect x={EDGE} y={EDGE} width={SPAN} height={SPAN} rx={1.6} fill="var(--surface)" />
      <g fill="none" stroke="var(--rule)" strokeWidth={0.7}>
        {RULES.map((k) => (
          <path key={`h${k}`} d={`M${EDGE} ${tidy(at(k))}h${SPAN}`} />
        ))}
        {RULES.map((k) => (
          <path key={`v${k}`} d={`M${tidy(at(k))} ${EDGE}v${SPAN}`} />
        ))}
      </g>
      <rect
        x={EDGE}
        y={EDGE}
        width={SPAN}
        height={SPAN}
        rx={1.6}
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />

      {hulls.map(({ key, x, y, width, height, round }) =>
        width === height ? (
          <circle
            key={key}
            cx={tidy(x + round)}
            cy={tidy(y + round)}
            r={round}
            fill="var(--p-indigo)"
            {...edge}
          />
        ) : (
          <rect
            key={key}
            x={x}
            y={y}
            width={width}
            height={height}
            rx={round}
            fill="var(--p-indigo)"
            {...edge}
          />
        ),
      )}
    </Scene>
  )
}
