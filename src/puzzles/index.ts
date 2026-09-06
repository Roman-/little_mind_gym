import type { PuzzleMeta } from '../lib/types'
import { riverCrossing } from './river-crossing'
import { towerOfHanoi } from './tower-of-hanoi'
import { lightsOut } from './lights-out'
import { frogLeap } from './frog-leap'
import { waterJugs } from './water-jugs'
import { miniSudoku } from './mini-sudoku'
import { gardenCats } from './garden-cats'
import { balanceScales } from './balance-scales'
import { logicGrid } from './logic-grid'
import { countingPath } from './counting-path'
import { lightUp } from './light-up'

/** Roughly in order of how quickly a newcomer gets a foothold. */
export const PUZZLES: PuzzleMeta[] = [
  riverCrossing,
  towerOfHanoi,
  lightsOut,
  frogLeap,
  waterJugs,
  miniSudoku,
  gardenCats,
  balanceScales,
  logicGrid,
  countingPath,
  lightUp,
]

export function puzzleById(id: string | undefined): PuzzleMeta | undefined {
  return PUZZLES.find((p) => p.id === id)
}
