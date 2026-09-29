import type { PuzzleMeta } from '../lib/types'
import { riverCrossing } from './river-crossing'
import { towerOfHanoi } from './tower-of-hanoi'
import { lightsOut } from './lights-out'
import { frogLeap } from './frog-leap'
import { longTable } from './long-table'
import { slipperyIce } from './slippery-ice'
import { stonePath } from './stone-path'
import { aliceMaze } from './alice-maze'
import { waterJugs } from './water-jugs'
import { countingSquares } from './counting-squares'
import { miniSudoku } from './mini-sudoku'
import { sunsAndMoons } from './suns-and-moons'
import { suguru } from './suguru'
import { tallAndShort } from './tall-and-short'
import { shikaku } from './shikaku'
import { paintedTiles } from './painted-tiles'
import { gardenCats } from './garden-cats'
import { tentsAndTrees } from './tents-and-trees'
import { thermometers } from './thermometers'
import { logicGrid } from './logic-grid'
import { countingPath } from './counting-path'
import { longSnake } from './long-snake'
import { signposts } from './signposts'
import { lightUp } from './light-up'
import { knightSwap } from './knight-swap'
import { hedgeMaze } from './hedge-maze'

/** Roughly in order of how quickly a newcomer gets a foothold. */
export const PUZZLES: PuzzleMeta[] = [
  riverCrossing,
  towerOfHanoi,
  lightsOut,
  frogLeap,
  longTable,
  slipperyIce,
  stonePath,
  aliceMaze,
  waterJugs,
  countingSquares,
  miniSudoku,
  sunsAndMoons,
  suguru,
  tallAndShort,
  shikaku,
  paintedTiles,
  gardenCats,
  tentsAndTrees,
  thermometers,
  logicGrid,
  countingPath,
  longSnake,
  signposts,
  lightUp,
  knightSwap,
  hedgeMaze,
]

export function puzzleById(id: string | undefined): PuzzleMeta | undefined {
  return PUZZLES.find((p) => p.id === id)
}
