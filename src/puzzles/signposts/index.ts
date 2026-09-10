import type { PuzzleMeta } from '../../lib/types'
import type { SignAction, SignConfig, SignState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { SignpostsIcon } from './glyphs'

/* ------------------------------------------------------------------
   The three boards, drawn rather than dealt.

   Each one is a chain over every square, with most of its numbers
   rubbed out again: every number that `solveByLogic` could still
   argue its way back to went, and the ones that are left are the
   ones it could not. That is what makes a board here reasonable all
   the way through rather than merely answerable, and — because
   every clause of that solver is sound — it is also what makes the
   answer the only one.

   They were searched for offline, the way the hedge maze's three
   mazes were, and graded on the numbers `logic.test.ts` derives
   again from the pictures below: one answer, a chain a child can
   reason out, and the number of passes over the two steps it takes.
   Nothing here is trusted; the test parses these pictures and proves
   every one of those numbers a second time.

   `par` needs no search at all. A finished board has every square
   but the last joined to the one after it, which is exactly n*n - 1
   lines; a join adds one and taking a line off removes one; and no
   board here starts with any. So par is n*n - 1, every time.
   ------------------------------------------------------------------ */

const nine: SignConfig = {
  picture: [
    '→  .↘  3↓  .',
    '↗  .←  1↙  4',
    '↑  .←  ..  9',
  ],
}

const sixteen: SignConfig = {
  picture: [
    '↓  1→  .↘  .↙  4',
    '↗  .→  .↓  .←  .',
    '↗  8↓ 15↓  .←  .',
    '→  .. 16↖  .↑  6',
  ],
}

const twentyFive: SignConfig = {
  picture: [
    '→  .←  .↘  .→  2←  .',
    '↘  .→  .↓  .← 14↖  1',
    '↘  .↙  .. 25↓  .↓  .',
    '↑  .↙  .↖  .↑ 13↓  .',
    '↗ 24↗ 10↑  .↑  .←  .',
  ],
}

export const signposts: PuzzleMeta<SignState, SignAction> = {
  id: 'signposts',
  title: 'The signposts',
  tagline: 'Every square points the way to the next one. Join them all into one chain that counts from 1.',
  Icon: SignpostsIcon,
  instructions: [
    'Join the squares into one chain that counts 1, 2, 3 up to the last one.',
    'A square points at the square that comes after it. That square can be any distance along the arrow.',
    'Tap a square, then tap the square that comes after it.',
    'To take a line off again, tap the square it starts from.',
  ],
  levels: [
    {
      id: 'nine-signposts',
      label: 'Nine signposts',
      difficulty: 1,
      par: 8,
      config: nine,
      hints: [
        'Start at the 1. The square after it stands somewhere along its arrow.',
        'An arrow with only one square along it leaves no choice at all.',
        'Work back from the last square as well. Only some arrows can reach it.',
      ],
    },
    {
      id: 'sixteen-signposts',
      label: 'Sixteen signposts',
      difficulty: 2,
      par: 15,
      config: sixteen,
      hints: [
        'Every printed number is a place to start. Begin with the ones that have the fewest squares along their arrow.',
        'Count the arrows that can reach a square. When only one can, that is the square that comes before it.',
        'Two squares can never both point at the same square. Once one square is taken, cross it off every other arrow.',
      ],
    },
    {
      id: 'twenty-five-signposts',
      label: 'Twenty-five signposts',
      difficulty: 3,
      par: 24,
      config: twentyFive,
      hints: [
        'Twenty-five squares is a long chain. Build it in short stretches and join the stretches up later.',
        'A stretch that has caught hold of a printed number counts itself out. No two stretches may use the same number.',
        'The corners are the easiest squares to pin down: the fewest arrows reach them, and their own arrows have the least room to point.',
      ],
    },
  ],
  reseedable: false,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
