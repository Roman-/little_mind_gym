import type { PuzzleMeta } from '../../lib/types'
import type { RiverAction, RiverConfig, RiverState } from './logic'
import { describeMove, failure, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { RiverIcon } from './glyphs'

const classic: RiverConfig = {
  capacity: 2,
  nearLabel: 'This side',
  farLabel: 'Far side',
  rule: 'Never leave the wolf alone with the goat. Never leave the goat alone with the cabbage.',
  items: [
    {
      id: 'farmer',
      label: 'You',
      glyph: 'farmer',
      rower: true,
      guardian: true,
      // A name, not a noun: the bank summary reads "You", never "the you".
      proper: true,
    },
    { id: 'wolf', label: 'Wolf', glyph: 'wolf' },
    { id: 'goat', label: 'Goat', glyph: 'goat' },
    { id: 'cabbage', label: 'Cabbage', glyph: 'cabbage' },
  ],
  pairs: [
    { a: 'wolf', b: 'goat', message: 'The wolf ate the goat.' },
    { a: 'goat', b: 'cabbage', message: 'The goat ate the cabbage.' },
  ],
}

function catsAndMice(pairs: number): RiverConfig {
  const mouseNames = ['Pip', 'Nib', 'Tuck', 'Wim']
  const catNames = ['Tom', 'Kit', 'Bo', 'Fen']
  return {
    capacity: 2,
    nearLabel: 'This side',
    farLabel: 'Far side',
    rule: 'Never leave more cats than mice on one side.',
    items: [
      ...Array.from({ length: pairs }, (_, i) => ({
        id: `mouse-${i}`,
        label: mouseNames[i],
        glyph: 'mouse' as const,
        rower: true,
        proper: true,
        role: 'prey' as const,
      })),
      ...Array.from({ length: pairs }, (_, i) => ({
        id: `cat-${i}`,
        label: catNames[i],
        glyph: 'cat' as const,
        rower: true,
        proper: true,
        role: 'predator' as const,
      })),
    ],
    outnumber: { message: 'There were more cats than mice, and the mice ran away.' },
  }
}

export const riverCrossing: PuzzleMeta<RiverState, RiverAction> = {
  id: 'river-crossing',
  title: 'The river crossing',
  tagline: 'One little boat, and passengers who must never be left alone together.',
  Icon: RiverIcon,
  instructions: [
    'Get everyone to the far side, at the top.',
    'Tap a piece to put it in the boat. Tap it again to take it out.',
    'Tap the boat to row it to the other side.',
    'The boat holds two, and someone in it has to row.',
  ],
  levels: [
    {
      id: 'wolf-goat-cabbage',
      label: 'Wolf, goat and cabbage',
      difficulty: 1,
      par: 7,
      config: classic,
      hints: [
        'Someone will have to cross more than once.',
        'The wolf wants the goat. The goat wants the cabbage. So take the goat first.',
        'You are allowed to row something back. Here you have to.',
      ],
    },
    {
      id: 'cats-mice-2',
      label: 'Two cats, two mice',
      difficulty: 2,
      par: 5,
      config: catsAndMice(2),
      hints: [
        'After every crossing, count both sides. Not just the one you landed on.',
        'Equal numbers are safe. Trouble starts when there are more cats than mice.',
        'Start by taking one cat and one mouse across together.',
      ],
    },
    {
      id: 'cats-mice-3',
      label: 'Three cats, three mice',
      difficulty: 3,
      par: 11,
      config: catsAndMice(3),
      hints: [
        'Most of the way, you take two over and bring one back.',
        'Get all three cats across first. Then start on the mice.',
        'Once, in the middle, you have to bring two back together.',
      ],
    },
  ],
  engine: { init, reduce, isSolved, failure, describe: describeMove, Board },
}
