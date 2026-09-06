import { Piece, Scene } from '../../components/scene'

/**
 * Every lamp on the board is the OpenMoji bulb, drawn straight by `Board.tsx`.
 * Nothing in this puzzle is drawn in our own hand.
 */

/** The lamp you pressed and the four it took with it. */
const LIT = new Set(['1,0', '0,1', '1,1', '2,1', '1,2'])

/**
 * The card: a three by three board with one press showing. The plus is the
 * shape this puzzle is made of — press a lamp and its four neighbours turn
 * with it — so the card draws the thing a child has to learn to see, with the
 * bulb at the middle of it saying what the cells are.
 */
export function LightsOutIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => {
          const on = LIT.has(`${col},${row}`)
          return (
            <rect
              key={`${col},${row}`}
              x={3 + col * 9}
              y={3 + row * 9}
              width={8}
              height={8}
              rx={1.6}
              fill={on ? 'var(--amber-soft)' : 'var(--surface)'}
              stroke={on ? 'var(--amber)' : 'var(--rule-strong)'}
              strokeWidth={on ? 1 : 1.1}
            />
          )
        }),
      )}
      <Piece name="bulb" x={16} y={16} size={7} />
    </Scene>
  )
}
