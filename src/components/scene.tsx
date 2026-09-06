import type { ReactNode } from 'react'
import { Pictogram } from './Pictogram'
import type { PictoName } from './pictogram-art'

/**
 * The picture on a puzzle's card, and the frame every one of them is drawn in.
 *
 * A puzzle is not a thing, so no single picture names one: an abacus is not a
 * Tower of Hanoi, a pair of scales is not the puzzle of finding the heavier
 * ball, and a clipboard is not a question about who has what. Each card
 * carries a **small picture of its own board** instead — the pieces it is
 * played with, arranged the way they are arranged on the stage.
 *
 * That keeps rule 3 of docs/DESIGN.md rather than bending it. A scene is built out
 * of the same two materials the board is: a thing a child can point at and
 * name is an OpenMoji `Piece`, and an abstract piece — a disc, a jug of water,
 * a weighing ball, a lit cell — is flat enamel under a hairline, exactly as
 * the board draws it. Nothing is invented for the card that is not on the
 * stage behind it.
 *
 * ## The box
 *
 * 32 units square: the 24 the rest of our glyphs use, with a third again of
 * room for detail. Weights scale with it, so the 1.5 stroke every other glyph
 * is drawn in is 2 here. The plate on the collection card gives a scene about
 * 68px and the row above a puzzle gives it 28, so a scene is drawn to read as
 * a silhouette at the smaller of those and to reward looking at the larger:
 * three or four big shapes, never a dozen small ones.
 *
 * Nothing inheritable is set on the frame. A `Piece` is a nested svg, and a
 * fill or a stroke put here would land on artwork that brought its own.
 */
export function Scene({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

/** Rounded, so a centre that lands on a third does not print sixteen digits. */
const tidy = (n: number) => Math.round(n * 1000) / 1000

/** A pictogram standing in a scene: `size` units square, centred on (x, y). */
export function Piece({
  name,
  x,
  y,
  size,
  className,
}: {
  name: PictoName
  x: number
  y: number
  size: number
  className?: string
}) {
  return (
    <Pictogram
      name={name}
      className={className}
      x={tidy(x - size / 2)}
      y={tidy(y - size / 2)}
      size={size}
    />
  )
}

/**
 * The hairline every enamel piece on a board wears — `--ink` at four tenths,
 * the same border `.disc` and the weighing balls take. Spread onto a shape
 * that already has its `--p-*` fill.
 */
export const edge = {
  stroke: 'var(--ink)',
  strokeOpacity: 0.4,
  strokeWidth: 1,
} as const
