import { Pictogram } from '../../components/Pictogram'

/**
 * Every lamp on the board is the OpenMoji bulb, drawn straight by `Board.tsx`,
 * so the only thing left in here is the mark on the index row — and it is the
 * same bulb. A lamp is a thing a child can point at and name, so nothing in
 * this puzzle is drawn in our own hand any more.
 */
export function LightsOutIcon({ className }: { className?: string }) {
  return <Pictogram name="bulb" className={className} />
}
