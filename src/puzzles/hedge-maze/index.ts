import type { PuzzleMeta } from '../../lib/types'
import type { MazeAction, MazeConfig, MazeState } from './logic'
import { describeMove, failure, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { HedgeMazeIcon } from './glyphs'

/* ------------------------------------------------------------------
   The three mazes, drawn rather than dealt.

   A random maze pins the dog: carve a perfect maze and the greedy dog
   stands still on three turns in four, so most of a long level is a
   plain walk past an inert animal. These three were searched for
   offline instead — every hedge, the gap and both starting squares
   chosen together — and graded on the same numbers `logic.test.ts`
   re-derives from the pictures below: the true shortest escape, a
   held turn in every one of those escapes, and a dog that is really
   moving. Nothing is trusted here; the test parses these pictures and
   proves every number again.
   ------------------------------------------------------------------ */

const six: MazeConfig = {
  picture: [
    '+-+-+-+-+-+-+',
    '|. D . . . .|',
    '+ +-+-+ + + +',
    '|. . . . . .|',
    '+ + + + + + +',
    '|. . . .|. .o',
    '+ + + + + + +',
    '|. . . .|. .|',
    '+ + + + + + +',
    '|. . . .|. .|',
    '+ + +-+-+ + +',
    '|. . R . .|.|',
    '+-+-+-+-+-+-+',
  ],
}

const seven: MazeConfig = {
  picture: [
    '+-+-+-+-+-+-+-+',
    '|. D . .|. .|.|',
    '+ + + + + + + +',
    'o. . . . . . .|',
    '+ + +-+ + + + +',
    '|. . .|. . . .|',
    '+ + + + + + + +',
    '|. . .|. . . .|',
    '+ + + + + + + +',
    '|. . .|. . . .|',
    '+ + + + + + + +',
    '|. . .|R .|. .|',
    '+ +-+ + + + + +',
    '|. . . . .|. .|',
    '+-+-+-+-+-+-+-+',
  ],
}

const eight: MazeConfig = {
  picture: [
    '+-+-+o+-+-+-+-+-+',
    '|D . . . . . . .|',
    '+ + + +-+-+-+ + +',
    '|. . . . . . . .|',
    '+ + + + + + + + +',
    '|. . . . .|.|. .|',
    '+ + + + + + + + +',
    '|. . . .|R .|. .|',
    '+ + + + + + + + +',
    '|. . . .|. .|. .|',
    '+ + + + + + +-+ +',
    '|. . . .|. . . .|',
    '+ + + + + + + + +',
    '|. . . . .|. . .|',
    '+ +-+-+ +-+-+-+ +',
    '|. . . . .|. . .|',
    '+-+-+-+-+-+-+-+-+',
  ],
}

export const hedgeMaze: PuzzleMeta<MazeState, MazeAction> = {
  id: 'hedge-maze',
  title: 'The hedge maze',
  tagline: 'Get the rabbit out through the gap. The dog takes two steps for every one of yours.',
  Icon: HedgeMazeIcon,
  instructions: [
    'Get the rabbit out through the gap in the hedge.',
    'Tap a square beside the rabbit to step into it.',
    'Tap the rabbit to stand still. Standing still costs a turn like any other move.',
    'The dog then takes two steps. It goes sideways towards you first, and up or down only when it cannot go sideways.',
  ],
  levels: [
    {
      id: 'six-squares',
      label: 'Six squares',
      difficulty: 1,
      par: 8,
      config: six,
      hints: [
        'The dog moves after you do. Work out its two steps before you take one.',
        'You do not have to move. Tap the rabbit to stand still and let the dog come on.',
        'A hedge stops the dog as well as you. Get a hedge between the two of you and the dog has to go round it.',
      ],
    },
    {
      id: 'seven-squares',
      label: 'Seven squares',
      difficulty: 2,
      par: 11,
      config: seven,
      hints: [
        'The gap is on the left. Running straight at it gets you caught.',
        'Look at the long hedge down the middle. The dog cannot walk through it either.',
        'Count the turns the dog needs to come back round that long hedge. That is how much room you have.',
      ],
    },
    {
      id: 'eight-squares',
      label: 'Eight squares',
      difficulty: 3,
      par: 15,
      config: eight,
      hints: [
        'The gap is at the top. The first few moves take the rabbit further away from it.',
        'Lead the dog down the right-hand side. Then put a hedge between you and climb.',
        'The dog goes sideways first. Once it is in your own column it can only come up or down, and one hedge is enough to stop that.',
      ],
    },
  ],
  reseedable: false,
  engine: { init, reduce, isSolved, failure, describe: describeMove, Board },
}
