import type { PuzzleMeta } from '../../lib/types'
import type { FenceAction, FenceConfig, FenceState } from './logic'
import { describeMove, init, isSolved, reduce } from './logic'
import { Board } from './Board'
import { FencePostsIcon } from './glyphs'

/* ------------------------------------------------------------------
   Three sizes, and the dials beside them.

   `blanks` is how many squares start empty, and it is `par`: one tap
   fills one square. Every square of the answer ends up with a fence,
   so a board with nothing printed would be 16, 25 and 36 moves, and
   the last of those is half as long again as the 24 the collection
   caps a last level at. So a third of the fences are printed — 6, 9
   and 12 of them — and they cost a child nothing to read: a printed
   fence is a fact, counted into a post's number and followed round a
   ring like any other.

   `ring` is the biggest ring, in fences, the level's own solver may
   use to turn a fence away, and it is what each level's hints are
   written against. The first level is counting alone (0). The second
   may use a ring round one post, which is always four fences (4). The
   third may follow a ring round two or three posts, up to eight
   fences long (8): over 2,000 boards, the biggest ring one needed was
   six on 1,222 of them and eight on the other 778.

   `below` is the level below's `ring`, and it is the floor. A board
   that the level below's solver already finishes is dealt again, so
   every second-level board really needs a ring round a post, and
   every third-level board really needs one round more than one.

   `minRounds` and `maxRounds` are passes over the rules, counted on
   the board rather than guessed at: 2 to 3, 4 to 6, and 7 up. The
   windows do not overlap, so a later level's chain of "and
   therefore" is always the longer one. Over 2,000 seeds a level a
   board fits on the 1.5th, 1.8th and 4th draw on average, and never
   later than the 26th.
   ------------------------------------------------------------------ */

const four: FenceConfig = { n: 4, blanks: 10, ring: 0, below: -1, minRounds: 2, maxRounds: 3 }
const five: FenceConfig = { n: 5, blanks: 16, ring: 4, below: 0, minRounds: 4, maxRounds: 6 }
/** No ceiling on the last level. */
const six: FenceConfig = { n: 6, blanks: 24, ring: 8, below: 4, minRounds: 7, maxRounds: 99 }

export const fencePosts: PuzzleMeta<FenceState, FenceAction> = {
  id: 'fence-posts',
  title: 'The fence posts',
  tagline:
    'Every square takes a slanting fence. A number counts the fences at its post. No ring may close.',
  Icon: FencePostsIcon,
  instructions: [
    'Put a fence across every square, from one corner to the opposite corner.',
    'Every corner is a post. A number on a post says how many fences touch that post.',
    'The fences may never join up into a closed ring.',
    'Tap a square, then tap a fence below. A red square breaks a rule.',
  ],
  levels: [
    {
      id: 'four-by-four',
      label: 'Four by four',
      difficulty: 1,
      par: four.blanks,
      config: four,
      hints: [
        'Start at a numbered post on the edge. It has one or two squares round it. Its number often decides their fences.',
        'When a post has all the fences that its number asks for, no other fence may touch it.',
        'Count the empty squares round a post. If it needs that many more fences, give it a fence from each of those squares.',
      ],
    },
    {
      id: 'five-by-five',
      label: 'Five by five',
      difficulty: 2,
      par: five.blanks,
      config: five,
      hints: [
        'A printed fence counts for both of its posts, just as a fence that you put down does.',
        'Four fences round one post make a closed ring. With three of them down, the fourth square’s fence must touch the post.',
        'When no number tells you anything more, look for a line of fences that one more fence would close into a ring.',
      ],
    },
    {
      id: 'six-by-six',
      label: 'Six by six',
      difficulty: 3,
      par: six.blanks,
      config: six,
      hints: [
        'First put down every fence that a number decides. Then look for rings.',
        'A ring can go round more than one post. Follow a line of fences from post to post to see where it goes.',
        'Before you put a fence down, follow the fences from both of its posts. If the two lines meet, that fence closes a ring.',
      ],
    },
  ],
  reseedable: true,
  engine: { init, reduce, isSolved, describe: describeMove, Board },
}
