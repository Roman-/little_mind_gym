import type { PuzzleMeta } from '../../lib/types'
import type { JugsAction, JugsConfig, JugsState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { WaterJugsIcon } from './glyphs'

const fourLitres: JugsConfig = {
  jugs: [
    { capacity: 5, start: 0 },
    { capacity: 3, start: 0 },
  ],
  tap: true,
  drain: true,
  goal: { kind: 'any', litres: 4 },
  goalLine: 'Make one jug hold exactly 4 litres.',
}

const halfAndHalf: JugsConfig = {
  jugs: [
    { capacity: 8, start: 8 },
    { capacity: 5, start: 0 },
    { capacity: 3, start: 0 },
  ],
  tap: false,
  drain: false,
  goal: { kind: 'each', litres: [4, 4, null] },
  goalLine:
    'There is no tap and no drain. Leave 4 litres in the big jug and put 4 in the middle jug.',
}

const sixLitres: JugsConfig = {
  jugs: [
    { capacity: 9, start: 0 },
    { capacity: 4, start: 0 },
  ],
  tap: true,
  drain: true,
  goal: { kind: 'any', litres: 6 },
  goalLine: 'Make one jug hold exactly 6 litres.',
}

export const waterJugs: PuzzleMeta<JugsState, JugsAction> = {
  id: 'water-jugs',
  title: 'The water jugs',
  tagline: 'The jugs have no marks on the side. Measure out an exact amount of water.',
  Icon: WaterJugsIcon,
  instructions: [
    'Each level asks for an exact amount of water. Measure it out.',
    'Tap a jug to pick it up. Then tap another jug to pour the water in.',
    'A pour never stops halfway. It stops when one jug is empty or the other is full.',
    'Some levels have a tap and a drain. Then you can use Fill and Empty as well.',
  ],
  reseedable: false,
  levels: [
    {
      id: 'four-litres',
      label: 'Four litres',
      difficulty: 1,
      par: 6,
      config: fourLitres,
      hints: [
        'A full jug and an empty jug are the only two amounts that you know for sure.',
        'Fill the 5-litre jug and pour it into the 3-litre jug. Look at what is left behind.',
        'First get 2 litres into the small jug. Then a full 5-litre jug has only 1 litre to give away.',
      ],
    },
    {
      id: 'half-and-half',
      label: 'Half and half',
      difficulty: 2,
      par: 7,
      config: halfAndHalf,
      hints: [
        'The 8 litres never changes. You can only pour it from jug to jug.',
        'The 3-litre jug is your measuring spoon. Nearly every pour leaves it full or empty.',
        'To make room, tip the small jug back into the big one. You have to do that more than once.',
      ],
    },
    {
      id: 'six-litres',
      label: 'Six litres',
      difficulty: 3,
      par: 8,
      config: sixLitres,
      hints: [
        'The small jug holds only 4 litres. So your 6 litres has to end up in the 9-litre jug.',
        'Fill the 9-litre jug and top up the 4-litre jug. A different amount is left behind each time, so keep count.',
        'The turning point comes when the small jug holds exactly 1 litre.',
      ],
    },
  ],
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
