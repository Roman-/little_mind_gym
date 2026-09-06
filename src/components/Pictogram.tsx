import type { CSSProperties } from 'react'
import { ART } from './pictogram-art'
import type { PictoName } from './pictogram-art'

/**
 * One picture. Size it by sizing the plate around it and letting the svg fill
 * that box: `.art { width: 100%; height: 100% }`.
 *
 * Inside a `Scene` it is placed instead of sized: `x`, `y` and `size` put it
 * at a spot in the scene's own units, as a nested svg. `Piece` in `scene.tsx`
 * is the way to ask for that — it takes the centre, which is how a drawing
 * thinks about where a thing stands.
 *
 * See `pictogram-art.ts` for where the artwork comes from and what it may be
 * used for. Short version: a thing a child could point at and name gets a
 * picture; everything else gets one of our own stroke marks.
 */
export function Pictogram({
  name,
  className,
  style,
  x,
  y,
  size,
}: {
  name: PictoName
  className?: string
  style?: CSSProperties
  /** Top-left corner and side, in the units of the svg this one is nested in. */
  x?: number
  y?: number
  size?: number
}) {
  const art = ART[name]
  if (!art) return null
  return (
    <svg
      className={className}
      style={style}
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={art.viewBox}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: art.body }}
    />
  )
}
