import type { PuzzleMeta } from '../../lib/types'
import type { BalanceAction, BalanceConfig, BalanceState } from './logic'
import { describeMove, failure, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { BalanceIcon } from './glyphs'

const bench = (balls: number, weighings: number): BalanceConfig => ({ balls, weighings })

export const balanceScales: PuzzleMeta<BalanceState, BalanceAction> = {
  id: 'balance-scales',
  title: 'The heavier one',
  tagline: 'One ball is heavier than the others. Use the balance to find it.',
  Icon: BalanceIcon,
  instructions: [
    'Tap a ball to put it on a pan.',
    'Both pans need the same number of balls. Then press Weigh.',
    'The pan with the heavy ball goes down. If the pans stay level, the heavy ball is not on them.',
    'When you know which ball it is, press Name the heavy one and tap that ball.',
  ],
  levels: [
    {
      id: 'eight-balls',
      label: 'Eight balls',
      difficulty: 1,
      par: 3,
      config: bench(8, 3),
      hints: [
        'You get three weighings. You will not need all three.',
        'The pans can also stay level. That is an answer too.',
        'Four against four can never stay level. Leave some balls off the pans.',
      ],
    },
    {
      id: 'nine-balls',
      label: 'Nine balls',
      difficulty: 2,
      par: 3,
      config: bench(9, 2),
      hints: [
        'One weighing can end three ways. Two weighings can end nine ways.',
        'There are nine balls and nine endings. So each answer must leave you the same amount of work.',
        'Whichever way the first weighing goes, you want three balls left.',
      ],
    },
    {
      id: 'twelve-balls',
      label: 'Twelve balls',
      difficulty: 3,
      par: 4,
      config: bench(12, 3),
      hints: [
        'Twelve balls and three weighings. That is just enough, so do not waste one.',
        'Whichever way the first weighing goes, you want four balls left.',
        'Four balls and two weighings is this same puzzle, smaller. Plan all three before you start.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, failure, describe: describeMove, Board },
}
