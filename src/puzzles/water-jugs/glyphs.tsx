import type { ReactNode } from 'react'
import { Pictogram } from '../../components/Pictogram'

export type GlyphName = 'tap' | 'drain' | 'pour'

/**
 * Three affordances, not three pictures. A tap, a drain and a pour arrow only
 * mean anything inside this board, so they stay our own stroked marks; the
 * thing a child can point at and name — a jug — is a pictogram.
 */
const paths: Record<GlyphName, ReactNode> = {
  /** A tap with a drop under the spout — "fill it right up". */
  tap: (
    <>
      <path d="M7 3.5v2.5" />
      <path d="M3.5 6h6.5v3.5H3.5z" />
      <path d="M10 7.75h5.5v4.25" />
      <path d="M15.5 14.4q2.4 2.6 2.4 4 0 2.2-2.4 2.2t-2.4-2.2q0-1.4 2.4-4z" />
    </>
  ),
  /** Water falling onto a grate — "empty out". */
  drain: (
    <>
      <path d="M12 3.5v8" />
      <path d="M8.5 8 12 11.5 15.5 8" />
      <path d="M4 15.5h16" />
      <path d="M6.5 19.5h11" />
    </>
  ),
  /** A stream curving from one vessel down into another. */
  pour: (
    <>
      <path d="M4.5 6v6q0 5.5 5.5 5.5h9" />
      <path d="M15.5 14 19 17.5 15.5 21" />
    </>
  ),
}

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

/** The picture in the puzzle list: a jug, drawn the way every other picture is. */
export function WaterJugsIcon({ className }: { className?: string }) {
  return <Pictogram name="jug" className={className} />
}
