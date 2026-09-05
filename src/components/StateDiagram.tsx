import { usePrefersReducedMotion } from '../lib/theme'
import s from './StateDiagram.module.css'

/**
 * The ten safe arrangements of the wolf, the goat and the cabbage, and the
 * moves between them. Two routes run from start to finish and both are seven
 * moves long — which is the whole idea behind every puzzle here:
 * a small world of positions, and a short path through it.
 */
const NODES: [number, number][] = [
  [24, 75], // everything on this side
  [78, 75],
  [132, 75],
  [192, 30], // the upper route
  [252, 30],
  [192, 120], // the lower route
  [252, 120],
  [306, 75],
  [354, 75],
  [400, 75], // everything across
]

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 7],
  [2, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
]

/** The upper seven-move solution, as the dot walks it. */
const ROUTE = [0, 1, 2, 3, 4, 7, 8, 9]

const held = (get: (n: number) => number) => ROUTE.flatMap((n) => [get(n), get(n)]).join(';')
const KEY_TIMES = Array.from({ length: ROUTE.length * 2 }, (_, i) =>
  (i / (ROUTE.length * 2 - 1)).toFixed(4),
).join(';')

export function StateDiagram() {
  const reduced = usePrefersReducedMotion()
  const [startX, startY] = NODES[ROUTE[0]]

  return (
    <figure className={s.figure}>
      <svg
        className={s.svg}
        viewBox="0 0 424 150"
        role="img"
        aria-label="A diagram of the ten safe arrangements in the river crossing puzzle, joined by the moves between them. Two separate routes lead from the start to the finish, and each is seven moves long."
      >
        {EDGES.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            className={s.edge}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
          />
        ))}
        {NODES.map(([x, y], i) => (
          <circle
            key={i}
            className={s.node}
            data-end={i === 0 || i === NODES.length - 1 ? 'true' : undefined}
            cx={x}
            cy={y}
            r={i === 0 || i === NODES.length - 1 ? 7 : 5.5}
          />
        ))}
        <text className={s.endLabel} x="8" y="101" textAnchor="start">
          Start
        </text>
        <text className={s.endLabel} x="416" y="101" textAnchor="end">
          Done
        </text>
        <circle className={s.walker} cx={startX} cy={startY} r="4">
          {!reduced && (
            <>
              <animate
                attributeName="cx"
                values={held((n) => NODES[n][0])}
                keyTimes={KEY_TIMES}
                dur="11s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                values={held((n) => NODES[n][1])}
                keyTimes={KEY_TIMES}
                dur="11s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values={ROUTE.flatMap((_, i) => (i === 0 ? [0, 1] : [1, 1]))
                  .map((v, i, arr) => (i === arr.length - 1 ? 0 : v))
                  .join(';')}
                keyTimes={KEY_TIMES}
                dur="11s"
                repeatCount="indefinite"
              />
            </>
          )}
        </circle>
      </svg>
      <figcaption className={`u-label ${s.caption}`}>
        Every dot is a safe place to stop in the river crossing. The lines are the crossings
        between them. The moving dot takes one of the two shortest ways through.
      </figcaption>
    </figure>
  )
}
