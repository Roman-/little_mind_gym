import { Piece, Scene } from '../../components/scene'

/**
 * Every cat on the board is the OpenMoji cat, drawn straight by `Board.tsx`,
 * and the gardens are flat enamel. Nothing here is drawn in our own hand.
 */

/** Three gardens over nine squares, in the colours the board deals first. */
const GARDENS: Record<string, string> = {
  '0,0': '--p-ochre', '1,0': '--p-ochre', '0,1': '--p-ochre',
  '2,0': '--p-indigo', '2,1': '--p-indigo', '2,2': '--p-indigo',
  '1,1': '--p-moss', '0,2': '--p-moss', '1,2': '--p-moss',
}
/** One cat to a garden, and no two of them touching — the solved board. */
const CATS = [[0, 0], [2, 0], [1, 2]]

const EDGE = 3
const CELL = 8.6667
const at = (i: number) => EDGE + CELL * i + CELL / 2
const of_ = (col: number, row: number) => GARDENS[`${col},${row}`]
const CELLS = [0, 1, 2]

/**
 * The card: a solved garden. The wash and the heavy line say where one garden
 * ends and the next begins; the cats say the answer. Three cats spread over
 * nine squares with a gap between every pair is the whole rule, and a child
 * can check it on the card before they ever open the puzzle.
 */
export function GardenCatsIcon({ className }: { className?: string }) {
  const rule = (heavy: boolean) => ({
    stroke: heavy ? 'var(--ink-muted)' : 'var(--rule)',
    strokeWidth: heavy ? 1.6 : 0.7,
  })
  return (
    <Scene className={className}>
      <rect x={EDGE} y={EDGE} width={CELL * 3} height={CELL * 3} rx={1.6} fill="var(--surface-sunk)" />
      {CELLS.map((row) =>
        CELLS.map((col) => (
          <rect
            key={`${col},${row}`}
            x={EDGE + col * CELL}
            y={EDGE + row * CELL}
            width={CELL}
            height={CELL}
            fill={`var(${of_(col, row)})`}
            fillOpacity={0.38}
          />
        )),
      )}
      {/* Every seam between two squares, heavy where it parts two gardens. */}
      {[1, 2].map((col) =>
        CELLS.map((row) => (
          <path
            key={`v${col},${row}`}
            d={`M${EDGE + col * CELL} ${EDGE + row * CELL}v${CELL}`}
            {...rule(of_(col - 1, row) !== of_(col, row))}
          />
        )),
      )}
      {[1, 2].map((row) =>
        CELLS.map((col) => (
          <path
            key={`h${col},${row}`}
            d={`M${EDGE + col * CELL} ${EDGE + row * CELL}h${CELL}`}
            {...rule(of_(col, row - 1) !== of_(col, row))}
          />
        )),
      )}
      <rect
        x={EDGE}
        y={EDGE}
        width={CELL * 3}
        height={CELL * 3}
        rx={1.6}
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />
      {CATS.map(([col, row]) => (
        <Piece key={`${col},${row}`} name="cat" x={at(col)} y={at(row)} size={7.6} />
      ))}
    </Scene>
  )
}
