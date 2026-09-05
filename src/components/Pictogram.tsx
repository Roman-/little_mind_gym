import type { CSSProperties } from 'react'
import { ART } from './pictogram-art'
import type { PictoName } from './pictogram-art'

/**
 * One picture. Size it by sizing the plate around it and letting the svg fill
 * that box: `.art { width: 100%; height: 100% }`.
 *
 * See `pictogram-art.ts` for where the artwork comes from and what it may be
 * used for. Short version: a thing a child could point at and name gets a
 * picture; everything else gets one of our own stroke marks.
 */
export function Pictogram({
  name,
  className,
  style,
}: {
  name: PictoName
  className?: string
  style?: CSSProperties
}) {
  const art = ART[name]
  if (!art) return null
  return (
    <svg
      className={className}
      style={style}
      viewBox={art.viewBox}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: art.body }}
    />
  )
}
