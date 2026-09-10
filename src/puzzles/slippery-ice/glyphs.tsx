import { Piece, Scene, edge } from '../../components/scene'

/**
 * The animals are OpenMoji artwork, drawn straight by `Board.tsx` and by the
 * card below, and a wall is flat enamel. What is drawn here in our own hand
 * are the two marks the board needs: the arrow on a send key, and the ring
 * painted on the ice.
 *
 * Neither is a thing a child could point at and name. An arrow is an
 * affordance, and the ring is a place — the mark a game paints on a floor to
 * say "this is the spot", which is exactly what a drop marker is.
 */

const strokes = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * Send an animal this way. Drawn pointing up; the pad turns it with a
 * transform, so the four ways are one mark rather than four.
 *
 * It keeps a long shaft, because a send is a *slide* rather than a step into
 * the next square: a bare chevron says "that way" and a shaft says "all the
 * way that way".
 */
export function SendMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes}>
      <path d="M12 20V5.6" />
      <path d="M6.4 11.2 12 5.6l5.6 5.6" />
    </svg>
  )
}

/**
 * The ring painted on the ice: where the mouse has to come to rest.
 *
 * Two circles rather than one, and it is nearly the whole square. A piece
 * standing on it covers about two thirds of the square, so the outer ring
 * still shows all the way round whoever is standing there — which is how a
 * child sees that the mouse is home rather than merely near it.
 */
export function RingMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokes}>
      <circle cx={12} cy={12} r={10.2} />
      <circle cx={12} cy={12} r={3.4} />
    </svg>
  )
}

/**
 * The card: a sheet of ice with a wall standing on it, the ring painted on the
 * far side, and the mouse stopped flat against the wall.
 *
 * Four shapes, and between them they are the whole puzzle: where the mouse has
 * to get to, the one thing on the board that can stop it, and the mouse itself
 * pinned against that thing rather than standing loose in the middle. The ring
 * is what tells this card apart at 28px — no other card in the collection has
 * a mark on the floor that a piece has to land on.
 */
export function SlipperyIceIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <rect
        x={2}
        y={4.5}
        width={28}
        height={23}
        rx={2}
        fill="var(--p-teal)"
        fillOpacity={0.18}
        stroke="var(--ink-muted)"
        strokeWidth={1.6}
      />
      {/* Flat enamel, exactly as the board draws a wall. */}
      <rect x={14.9} y={7} width={2.2} height={13} rx={1.1} fill="var(--p-slate)" {...edge} />
      <g fill="none" stroke="var(--ink)" strokeWidth={1.6}>
        <circle cx={24} cy={16} r={5} />
        <circle cx={24} cy={16} r={1.7} />
      </g>
      <Piece name="mouse" x={9.6} y={16} size={10.6} />
    </Scene>
  )
}
