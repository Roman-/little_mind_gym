import type { PuzzleMeta } from '../../lib/types'
import type { IceAction, IceConfig, IceState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { SlipperyIceIcon } from './glyphs'

/* ------------------------------------------------------------------
   The three ponds, drawn rather than dealt.

   A random pond is nearly always one of two things: open enough
   that the mouse falls onto the ring by accident in two sends, or
   walled enough that somebody is boxed into a corner and stands
   there for the whole level. These three were searched for offline
   instead — every wall, the ring and every starting square chosen
   together — and graded on the same numbers `logic.test.ts` derives
   again from the pictures below: the true shortest run of sends,
   whether the mouse can do it alone, whether any position strands
   anybody, and how far a child who taps at random gets.

   The ramp is the idea rather than the size. The first pond is the
   mouse's own: it is stopped by another animal, by a wall and by
   the edge, one of each, and the rabbit never has to move. The
   second and the third cannot be solved by sending the mouse at
   all — somebody else has to be sent across the ice purely to
   stand where the mouse must stop, which is the one thing this
   puzzle knows that no other board here does.
   ------------------------------------------------------------------ */

const twoOnTheIce: IceConfig = {
  picture: [
    '+-+-+-+-+-+',
    '|. .|o . .|',
    '+-+ + + + +',
    '|. M . . R|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+-+-+-+',
  ],
}

const threeOnTheIce: IceConfig = {
  picture: [
    '+-+-+-+-+-+',
    '|. o . . .|',
    '+ + + + + +',
    '|. . M . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+ +',
    '|. . . .|.|',
    '+ + + + + +',
    '|. . F R|.|',
    '+-+-+-+-+-+',
  ],
}

const theBigPond: IceConfig = {
  picture: [
    '+-+-+-+-+-+-+',
    '|. . . . . .|',
    '+ + + +-+ + +',
    '|. .|. . . .|',
    '+ + + + + + +',
    '|. . .|o R .|',
    '+ + + + + + +',
    '|. . .|. . .|',
    '+-+ +-+ + + +',
    '|. . . . M .|',
    '+ + + + + + +',
    '|. . . . . .|',
    '+-+-+-+-+-+-+',
  ],
}

export const slipperyIce: PuzzleMeta<IceState, IceAction> = {
  id: 'slippery-ice',
  title: 'The slippery ice',
  tagline: 'Nobody can stop in the middle of the ice. Get the mouse to the ring anyway.',
  Icon: SlipperyIceIcon,
  instructions: [
    'Get the mouse to stop on the ring.',
    'Tap an animal, then tap an arrow to send it.',
    'Whoever you send slides until a wall, the edge of the ice or another animal stops them.',
    'You can send the other animals as well as the mouse.',
  ],
  levels: [
    {
      id: 'two-on-the-ice',
      label: 'Two on the ice',
      difficulty: 1,
      par: 3,
      config: twoOnTheIce,
      hints: [
        'Work out where the mouse will stop before you send it.',
        'A wall stops the mouse. So does the edge of the ice.',
        'The mouse stops when it reaches the rabbit. The rabbit does not have to move at all.',
      ],
    },
    {
      id: 'three-on-the-ice',
      label: 'Three on the ice',
      difficulty: 2,
      par: 4,
      config: threeOnTheIce,
      hints: [
        'Try the mouse on its own first. Watch it slide straight past the ring.',
        'The mouse cannot stop where there is nothing to stop it. So something has to be there.',
        'You can send the frog as well as the mouse. Work out which square the frog has to stand on.',
      ],
    },
    {
      id: 'the-big-pond',
      label: 'The big pond',
      difficulty: 3,
      par: 5,
      config: theBigPond,
      hints: [
        'The mouse cannot reach the ring on its own, however many times you send it.',
        'The rabbit can be sent as well, and the mouse stops when it reaches the rabbit.',
        'The rabbit is already beside the ring, and on the wrong side of it.',
      ],
    },
  ],
  reseedable: false,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
