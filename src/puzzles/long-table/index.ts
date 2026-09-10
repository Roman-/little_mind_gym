import type { PuzzleMeta } from '../../lib/types'
import type { Guest, TableAction, TableConfig, TableState } from './logic'
import { describeMove, failure, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { LongTableIcon } from './glyphs'

/* ------------------------------------------------------------------
   The cast, and who cannot sit next to whom.

   Every quarrel is one a child can guess before reading it: a
   wolf eats a goat, a mouse and a rabbit; a cat chases a mouse
   and a rabbit and squares up to a dog; a dog chases a rabbit.
   The horse minds nobody. The roster above the table states
   them all anyway — a rule a board relies on is a rule a board
   prints — but nothing on it should come as news.

   One relation, one name for it. Everywhere a child reads —
   the tagline, the four instructions, the nine hints, the
   roster title, every quarrel card's label and the dead-end
   sentence — the relation is "sit next to", which is what the
   roster says and what the aria-labels have always said.

   The three levels share one growing table. Five sit down
   first; the cat pulls up a chair for the second; the dog for
   the third. Nothing a child learned on the level before goes
   out of date, and the new animal is the whole of what is new.

   The ramp is not the number of seats and it is not `par`,
   because a longer row with more swaps in hand can be easier
   than a short one with none. It is how many of the ways of
   tapping the swaps out with no thought at all end with
   everybody seated, and both ends of that are gates the deal
   is chosen against: at most two of the 64 ways of tapping
   three swaps on the first level, six of 625 on the second and
   24 of 7776 on the third (`lucky`), and at least one, two and
   four (`floor`). Cap and floor together are what say every
   deal on a level is stiffer than every deal on the one
   before: 6/625 is under 1/64 and 24/7776 is under 2/625, and
   logic.test.ts checks that off these numbers and again off
   the pools they build. A cap on its own would not have said
   it — see `floor` in logic.ts.

   Those are the odds a child playing blind really plays
   against. The board says nothing about a swap until the swaps
   are spent, so a run either comes home or it does not. What
   that costs a child who taps without looking, and the price
   the same rule charges a child who mis-plans, are set out at
   the top of logic.ts.
   ------------------------------------------------------------------ */

const WOLF: Guest = { id: 'wolf', label: 'Wolf', art: 'wolf' }
const GOAT: Guest = { id: 'goat', label: 'Goat', art: 'goat' }
const MOUSE: Guest = { id: 'mouse', label: 'Mouse', art: 'mouse' }
const RABBIT: Guest = { id: 'rabbit', label: 'Rabbit', art: 'rabbit' }
const HORSE: Guest = { id: 'horse', label: 'Horse', art: 'horse' }
const CAT: Guest = { id: 'cat', label: 'Cat', art: 'cat' }
const DOG: Guest = { id: 'dog', label: 'Dog', art: 'dog' }

const WOLF_EATS = [
  { a: 'wolf', b: 'goat' },
  { a: 'wolf', b: 'mouse' },
  { a: 'wolf', b: 'rabbit' },
]
const CAT_CHASES = [
  { a: 'cat', b: 'mouse' },
  { a: 'cat', b: 'rabbit' },
]

const five: TableConfig = {
  guests: [WOLF, GOAT, MOUSE, RABBIT, HORSE],
  quarrels: WOLF_EATS,
  swaps: 3,
  // The level that teaches the puzzle. Counting the pairs still sitting
  // next to each other and undoing the worst of them is exactly the idea a
  // child should arrive at here, so a deal is not asked to beat it.
  climberProof: false,
  // Two is already the most any five-seat deal manages, so this cap turns
  // nothing away — it is here to be the number the next level is measured
  // against. The floor of one is what every deal at par has anyway.
  lucky: 2,
  floor: 1,
}

const six: TableConfig = {
  guests: [WOLF, GOAT, MOUSE, RABBIT, HORSE, CAT],
  quarrels: [...WOLF_EATS, ...CAT_CHASES],
  swaps: 4,
  climberProof: true,
  // 6/625 comes under the level before's floor of 1/64, and this floor of
  // 2/625 is what the level after has to come under.
  lucky: 6,
  floor: 2,
}

const seven: TableConfig = {
  guests: [WOLF, GOAT, MOUSE, RABBIT, HORSE, CAT, DOG],
  quarrels: [...WOLF_EATS, ...CAT_CHASES, { a: 'cat', b: 'dog' }, { a: 'dog', b: 'rabbit' }],
  swaps: 5,
  climberProof: true,
  // 24/7776 comes under the level before's floor of 2/625, by a margin of
  // about a thirtieth. Raising this to 25 would break the ramp, and
  // logic.test.ts says so in as many words.
  lucky: 24,
  floor: 4,
}

export const longTable: PuzzleMeta<TableState, TableAction> = {
  id: 'long-table',
  title: 'The long table',
  tagline:
    'Some of these animals cannot sit next to each other. You have just enough swaps to seat them all.',
  Icon: LongTableIcon,
  instructions: [
    'The pairs above the table cannot sit next to each other.',
    'Sit everybody so that none of those pairs are next to each other.',
    'Tap an arrow between two animals to swap them.',
    'You have just enough swaps, so plan before you tap. Step back if you get stuck.',
  ],
  levels: [
    {
      id: 'five-at-the-table',
      label: 'Five at the table',
      difficulty: 1,
      par: 3,
      config: five,
      hints: [
        'Swapping two animals who cannot sit next to each other does not part them. They only change places.',
        'The wolf cannot sit next to the goat, the mouse or the rabbit. Only the horse can sit next to the wolf.',
        'So the wolf belongs at one end of the table, with the horse next to it.',
      ],
    },
    {
      id: 'six-at-the-table',
      label: 'Six at the table',
      difficulty: 2,
      par: 4,
      config: six,
      hints: [
        'The wolf and the cat are not a pair above the table, so they can sit next to each other.',
        'The wolf can only sit next to the horse or the cat. Start by finding the wolf a seat.',
        'The mouse and the rabbit can sit next to each other. Neither can sit next to the wolf or the cat.',
      ],
    },
    {
      id: 'seven-at-the-table',
      label: 'Seven at the table',
      difficulty: 3,
      par: 5,
      config: seven,
      hints: [
        'Only three animals can sit next to the rabbit. Decide where the rabbit will sit before you move anybody.',
        'The rabbit can only sit next to the goat, the mouse or the horse.',
        'The cat is hard to seat too. The cat can only sit next to the wolf, the goat or the horse.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, failure, describe: describeMove, Board },
}
