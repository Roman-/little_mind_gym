import type { PuzzleMeta } from '../../lib/types'
import type { HorsesAction, HorsesConfig, HorsesState } from './logic'
import { describeMove, init, isSolved, readBoard, reduce } from './logic'
import { Board } from './Board'
import { FourHorsesIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three boards, and they never change. Every level's goal is its own
   start turned half a turn round the eight-square ring, so every
   horse walks four steps of that ring and none of them can take a
   shortcut: par is four times the number of horses, which is 8, 12
   and 16, and every one of the three is checked twice over by search
   in logic.test.ts.

   The ramp is the number of horses, because the board cannot grow.
   The same swap is par 10 on a three by four board and par 8 on a
   four by four one — a bigger board is an *easier* board, since the
   ring dissolves into slack. Three by three is the only interesting
   size there is, so the difficulty comes from traffic: two horses
   have six free squares to move through, four horses have four.
   ------------------------------------------------------------------ */

const level = (start: string, goal: string): HorsesConfig => ({
  start: readBoard(start),
  goal: readBoard(goal),
})

export const knightSwap: PuzzleMeta<HorsesState, HorsesAction> = {
  id: 'knight-swap',
  title: 'The four horses',
  tagline: 'Two brown horses and two grey ones have to change places. A horse only jumps in an L.',
  Icon: FourHorsesIcon,
  instructions: [
    'Every horse has to reach a mat of its own colour.',
    'A horse jumps in an L: two squares one way, then one square across.',
    'Tap a horse to pick it up, then tap a square to jump it there.',
    'Tap the horse again to put it back down.',
  ],
  reseedable: false,
  levels: [
    {
      id: 'horses-2',
      label: 'Two horses',
      difficulty: 1,
      par: 8,
      config: level('b.. ... ..g', 'g.. ... ..b'),
      hints: [
        'Pick one horse and find the two squares it can jump to.',
        'The middle square is never one of them. No jump in an L can land there.',
        'A horse can only land on an empty square. When both horses want the same one, decide which goes first.',
      ],
    },
    {
      id: 'horses-3',
      label: 'Three horses',
      difficulty: 2,
      par: 12,
      config: level('b.b ... .g.', '.g. ... b.b'),
      hints: [
        'Work out where each horse has to end up before you move anything.',
        'A horse with nowhere to go is waiting on a square that is not free yet. Ask which horse can free it.',
        'Try sending every horse the same way round the board, and see how far you get.',
      ],
    },
    {
      id: 'horses-4',
      label: 'Four horses',
      difficulty: 3,
      par: 16,
      config: level('b.b ... g.g', 'g.g ... b.b'),
      hints: [
        'The board looks like a square, but the horses do not travel like one. Draw the jumps and see what shape you get.',
        'Every square round the edge is an L away from exactly two others. Those joins make one loop.',
        'Horses cannot pass each other on that loop. Send them all the same way round it.',
      ],
    },
  ],
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
