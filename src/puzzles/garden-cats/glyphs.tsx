import { Pictogram } from '../../components/Pictogram'

/**
 * Every cat on the board is the OpenMoji cat, drawn straight by `Board.tsx`,
 * and the gardens are flat enamel. So the only mark left in here is the one on
 * the collection card — and it is the same cat.
 */
export function GardenCatsIcon({ className }: { className?: string }) {
  return <Pictogram name="cat" className={className} />
}
