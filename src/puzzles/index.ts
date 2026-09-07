import type { PuzzleMeta } from '../lib/types'
import { riverCrossing } from './river-crossing'
import { towerOfHanoi } from './tower-of-hanoi'
import { lightsOut } from './lights-out'
import { frogLeap } from './frog-leap'
import { waterJugs } from './water-jugs'
import { miniSudoku } from './mini-sudoku'
import { shikaku } from './shikaku'
import { gardenCats } from './garden-cats'
import { balanceScales } from './balance-scales'
import { logicGrid } from './logic-grid'
import { countingPath } from './counting-path'
import { lightUp } from './light-up'
import { knightSwap } from './knight-swap'
import { hedgeMaze } from './hedge-maze'

/** Roughly in order of how quickly a newcomer gets a foothold. */
export const PUZZLES: PuzzleMeta[] = [
  riverCrossing,
  towerOfHanoi,
  lightsOut,
  frogLeap,
  waterJugs,
  miniSudoku,
  shikaku,
  gardenCats,
  balanceScales,
  logicGrid,
  countingPath,
  lightUp,
  knightSwap,
  hedgeMaze,
]

export function puzzleById(id: string | undefined): PuzzleMeta | undefined {
  return PUZZLES.find((p) => p.id === id)
}
