import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { underSettings } from '../../test/settings'
import { makeRng } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { signposts } from './index'
import { Board } from './Board'
import type { Deduction, SignAction, SignConfig, SignState } from './logic'
import {
  END,
  colOf,
  countSolutions,
  describeMove,
  init,
  isSolved,
  joinsLeft,
  keyOf,
  legalMoves,
  numbersOf,
  parseBoard,
  rayOf,
  reduce,
  refusalOf,
  rowOf,
  runsOf,
  solveByLogic,
} from './logic'

const levels = signposts.levels as PuzzleLevel<SignConfig>[]
const start = (level: PuzzleLevel<SignConfig>) => init(level)

/** The one way the chain can run, as one square a number. */
const answerFor = (state: SignState): number[] =>
  (solveByLogic(state.n, state.arrows, state.clues) as Deduction).order

/**
 * The witness that `par` is reachable: join 1 to 2, 2 to 3, 3 to 4 and so on
 * up the answer. Every join here is the chain growing by one square at its own
 * end, so nothing in it leans on the reducer being clever.
 */
const ascending = (state: SignState): SignAction[] => {
  const answer = answerFor(state)
  return answer.slice(0, -1).map((from, k) => ({ type: 'join', from, to: answer[k + 1] }) as const)
}

const play = (state: SignState, actions: SignAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** How many lines are drawn on a board. A finished one holds n*n - 1. */
const lines = (state: SignState) => state.next.filter((to) => to >= 0).length

afterEach(cleanup)

/* ============================================================
   The three boards it is played on.

   They are drawn in `index.ts` rather than dealt, so everything
   the level claims about them is re-derived here from the
   picture itself: that it can be read at all, that it has one
   answer, that the answer can be reasoned out without a guess,
   and that par is the number of lines that answer needs.
   ============================================================ */

describe('the three boards', () => {
  for (const level of levels) {
    const state = start(level)
    const { n } = state
    const size = n * n

    it(`"${level.label}" reads back as a board of ${size} squares with nothing joined`, () => {
      expect(state.arrows).toHaveLength(size)
      expect(state.clues).toHaveLength(size)
      expect(state.next).toEqual(new Array<number>(size).fill(-1))
      expect(lines(state)).toBe(0)
      expect(isSolved(state)).toBe(false)
    })

    it(`"${level.label}" prints the 1 and the ${size}, and puts the ${size} on the square with no arrow`, () => {
      expect(state.clues).toContain(1)
      expect(state.clues).toContain(size)
      const ends = state.arrows.filter((arrow) => arrow === END)
      expect(ends).toHaveLength(1)
      expect(state.clues[state.arrows.indexOf(END)]).toBe(size)
      // Every printed number is printed once, and every arrow has somewhere to
      // point: an arrow that leaves the board at once could never be followed.
      const printed = state.clues.filter((value) => value !== 0)
      expect(new Set(printed).size).toBe(printed.length)
      for (let cell = 0; cell < size; cell++) {
        if (state.arrows[cell] === END) continue
        expect(rayOf(n, state.arrows, cell).length).toBeGreaterThan(0)
      }
    })

    it(`"${level.label}" has exactly one answer`, () => {
      expect(countSolutions(n, state.arrows, state.clues, 3)).toBe(1)
    })

    it(`"${level.label}" can be reasoned out without a guess`, () => {
      const reasoned = solveByLogic(n, state.arrows, state.clues)
      expect(reasoned).not.toBeNull()
      const { order, rounds } = reasoned as Deduction
      // Every clause of that solver is sound, so a board it finishes has one
      // answer — and the independent walk above agrees with it.
      expect(new Set(order).size).toBe(size)
      for (let v = 1; v < size; v++) {
        expect(rayOf(n, state.arrows, order[v - 1])).toContain(order[v])
      }
      for (let cell = 0; cell < size; cell++) {
        if (state.clues[cell] !== 0) expect(order[state.clues[cell] - 1]).toBe(cell)
      }
      // The passes it takes are the level's difficulty, and they climb.
      expect(rounds).toBeGreaterThan(0)
    })

    it(`"${level.label}" is played on the same board every time, whatever the rng`, () => {
      // Nothing here touches the rng, which is why `reseedable` is off. The
      // engine is asked rather than `init` directly, because the engine is
      // what the shell hands a fresh rng to.
      const { init: build } = signposts.engine
      expect(build(level, makeRng(1))).toEqual(build(level, makeRng(999)))
    })
  }

  it('climbs from one pass of reasoning to five', () => {
    const rounds = levels.map((level) => {
      const state = start(level)
      return (solveByLogic(state.n, state.arrows, state.clues) as Deduction).rounds
    })
    expect(rounds).toEqual([1, 3, 5])
  })

  it('offers no new arrangement, because there is nothing to arrange', () => {
    expect(signposts.reseedable).toBe(false)
  })
})

/* ============================================================
   Reading a board off its picture.

   The parser throws rather than quietly building half a board,
   so every one of these is a way a hand-drawn level could be
   wrong and a way it will be caught before anybody plays it.
   ============================================================ */

describe('the picture a board is drawn in', () => {
  const good = ['↓  .↓  8↓  .', '↓  .↓  .↓  .', '→  1→  ..  9']

  it('reads the arrows, the printed numbers and the empty squares', () => {
    const board = parseBoard(good)
    expect(board.n).toBe(3)
    // Down, down, down; down, down, down; right, right, and the end.
    expect(board.arrows).toEqual([4, 4, 4, 4, 4, 4, 2, 2, END])
    expect(board.clues).toEqual([0, 8, 0, 0, 0, 0, 1, 0, 9])
  })

  const broken: [string, string[]][] = [
    ['a line of the wrong length', ['↓  .↓  8↓', '↓  .↓  .↓  .', '→  1→  ..  9']],
    ['an arrow nobody drew', ['x  .↓  8↓  .', '↓  .↓  .↓  .', '→  1→  ..  9']],
    ['a number where the space belongs', ['↓1 .↓  8↓  .', '↓  .↓  .↓  .', '→  1→  ..  9']],
    ['two squares with no arrow', ['.  .↓  8↓  .', '↓  .↓  .↓  .', '→  1→  ..  9']],
    ['no square without one', ['↓  .↓  8↓  .', '↓  .↓  .↓  .', '→  1→  .↓  9']],
    ['the same number printed twice', ['↓  .↓  8↓  .', '↓  .↓  8↓  .', '→  1→  ..  9']],
    ['no 1 anywhere', ['↓  .↓  8↓  .', '↓  .↓  .↓  .', '→  2→  ..  9']],
    ['a last number that is not on the last square', ['↓  .↓  9↓  .', '↓  .↓  .↓  .', '→  1→  ..  8']],
    ['a number this board does not go up to', ['↓  .↓ 12↓  .', '↓  .↓  .↓  .', '→  1→  ..  9']],
    ['an arrow that leaves the board at once', ['↑  .↓  8↓  .', '↓  .↓  .↓  .', '→  1→  ..  9']],
  ]

  for (const [what, picture] of broken) {
    it(`refuses ${what}`, () => {
      expect(() => parseBoard(picture)).toThrow()
    })
  }
})

/* ============================================================
   The rules.

   Six things stop a join, and every one of them is a rule a
   child carries in their head rather than a square the board
   quietly declines to offer. Each is checked here from a
   position reached by legal joins, so nothing below is a state
   the puzzle could not really be in.
   ============================================================ */

/**
 * The smallest level, whose squares are numbered like this:
 *
 *     0 1 2
 *     3 4 5
 *     6 7 8
 *
 * The 1 is on square 4 and the 9 is on square 8, and the answer
 * runs 4, 3, 1, 5, 7, 6, 0, 2, 8.
 */
const NINE = start(levels[0])

/** A board drawn only for this file, with room in it for the two range rules. */
const ROOMY: SignState = {
  ...parseBoard(['↓  .↓  8↓  .', '↓  .↓  .↓  .', '→  1→  ..  9']),
  next: new Array<number>(9).fill(-1),
}

const join = (from: number, to: number): SignAction => ({ type: 'join', from, to })

describe('joining two squares', () => {
  it('draws the line, and counts the numbers out from the printed one', () => {
    const after = reduce(NINE, join(4, 3))
    expect(after).not.toBe(NINE)
    expect(after.next[4]).toBe(3)
    expect(lines(after)).toBe(1)
    // The 1 was printed on square 4, so square 3 is now the 2 — and it says so
    // without anybody having written a number in it.
    expect(numbersOf(after)[3]).toBe(2)
    expect(after.clues[3]).toBe(0)
  })

  it('reaches any distance along the arrow, not only the next square', () => {
    // Square 6 points up, and the chain may land on either square above it —
    // which is the one rule this board has that the counting path does not.
    expect(rayOf(3, NINE.arrows, 6)).toEqual([3, 0])
    expect(reduce(NINE, join(6, 3))).not.toBe(NINE)
    expect(reduce(NINE, join(6, 0))).not.toBe(NINE)
    // And two squares away is as good as one: square 2 points down, and the
    // 9 at the bottom of that column is two steps off.
    expect(rayOf(3, NINE.arrows, 2)).toEqual([5, 8])
    expect(reduce(NINE, join(2, 8))).not.toBe(NINE)
  })

  it('takes a line off again, and forgets the numbers that hung on it', () => {
    const drawn = reduce(NINE, join(4, 3))
    const back = reduce(drawn, { type: 'unjoin', from: 4 })
    expect(back.next).toEqual(NINE.next)
    expect(numbersOf(back)[3]).toBe(0)
  })

  it('hands back the very same board when nothing happens', () => {
    // Two squares that are not two squares, a square off the board, a square
    // with a line on it already, and a line to take off where there is none.
    expect(reduce(NINE, join(4, 4))).toBe(NINE)
    expect(reduce(NINE, join(-1, 3))).toBe(NINE)
    expect(reduce(NINE, join(4, 9))).toBe(NINE)
    expect(reduce(NINE, join(1.5, 3))).toBe(NINE)
    expect(reduce(NINE, { type: 'unjoin', from: 4 })).toBe(NINE)
    expect(reduce(NINE, { type: 'unjoin', from: 12 })).toBe(NINE)
    const drawn = reduce(NINE, join(4, 3))
    expect(reduce(drawn, join(4, 3))).toBe(drawn)
    // And a refusal is not a move either: every one of the joins below comes
    // back as the identical object.
    expect(reduce(NINE, join(4, 0))).toBe(NINE)
    expect(reduce(NINE, join(8, 0))).toBe(NINE)
    expect(reduce(NINE, join(2, 5))).toBe(NINE)
  })
})

describe('a join the board will not keep', () => {
  /** The sentence a refused join answers with, and the square it points at. */
  const no = (state: SignState, from: number, to: number) => {
    const refused = refusalOf(state, from, to)
    expect(refused).not.toBeNull()
    return { message: refused?.message, where: refused?.where, pretend: refused?.pretend }
  }

  it('says nothing about a join that is fine, or about one that is not a join', () => {
    expect(refusalOf(NINE, 4, 3)).toBeNull()
    expect(refusalOf(NINE, 4, 4)).toBeNull()
    expect(refusalOf(NINE, 4, 99)).toBeNull()
  })

  it('will not start a chain from the square that ends it', () => {
    // Square 8 holds the 9 and carries no arrow at all.
    expect(no(NINE, 8, 0).message).toBe('This square is the end of the chain. Nothing comes after it.')
    // The square the cue points at is the one the sentence is about.
    expect(no(NINE, 8, 0).where).toBe('8')
  })

  it('will not land anywhere but along the arrow', () => {
    // Square 4 points left, so square 3 is the only square it can reach.
    expect(no(NINE, 4, 0).message).toBe('The next square has to be along the arrow.')
    expect(no(NINE, 4, 0).where).toBe('0')
  })

  it('will not let two squares point at the same one', () => {
    const drawn = reduce(NINE, join(4, 3))
    expect(no(drawn, 6, 3).message).toBe('Another square already points there.')
  })

  it('will not take the chain round in a circle', () => {
    const ring = play(NINE, [join(3, 1), join(1, 5), join(5, 7), join(7, 6)])
    expect(lines(ring)).toBe(4)
    expect(no(ring, 6, 3).message).toBe('That would take the chain round in a circle.')
  })

  it('will not put two numbers together that do not follow on', () => {
    const built = play(NINE, [join(5, 7), join(7, 6), join(6, 0)])
    // The 4 was printed on square 5, so square 0 has counted its way up to 7.
    expect(numbersOf(built)[0]).toBe(7)
    expect(no(built, 0, 1).message).toBe('3 cannot come straight after 7.')
  })

  it('will not count back past the 1, or on past the last number', () => {
    // Square 0 has nothing printed on it, and square 6 holds the 1: putting
    // one before the other would need a 0.
    expect(no(ROOMY, 0, 6).message).toBe('The chain would count back past 1.')
    // The 8 is printed on square 1, so a stretch of two more squares after it
    // would need a 10.
    const tail = reduce(ROOMY, join(4, 7))
    expect(no(tail, 1, 4).message).toBe('The chain would count past 9.')
  })

  it('will not put a number on the board that is already on it', () => {
    // Square 5 holds the 4, so joining square 2 to it would make square 2 a
    // second 3 — and the 3 is printed on square 1.
    expect(no(NINE, 2, 5).message).toBe('There is already a 3 on the board.')
  })

  it('draws the refused join where the child put it, and never plays from it', () => {
    const refused = no(NINE, 4, 0)
    const pretend = refused.pretend as SignState
    expect(pretend.next[4]).toBe(0)
    // The pretend position is drawn and dropped. The real one never moved.
    expect(NINE.next[4]).toBe(-1)
    expect(reduce(NINE, join(4, 0))).toBe(NINE)
  })

  it('keeps a printed number printed, whatever a refused join says about it', () => {
    const built = play(NINE, [join(5, 7), join(7, 6), join(6, 0)])
    const pretend = (refusalOf(built, 0, 1) as { pretend: SignState }).pretend
    const shown = numbersOf(pretend)
    // Square 1 has a 3 printed on it and goes on saying 3, even though the run
    // it has just been dragged into would call it an 8. That is the whole
    // mistake, and the board draws it rather than tidying it away.
    expect(shown[1]).toBe(3)
    expect(shown[0]).toBe(7)
  })

  it('draws a ring without spinning, and puts no numbers on it', () => {
    const ring = play(NINE, [join(3, 1), join(1, 5), join(5, 7), join(7, 6)])
    const pretend = (refusalOf(ring, 6, 3) as { pretend: SignState }).pretend
    const runs = runsOf(pretend)
    const round = runs.find((run) => run.ring)
    expect(round?.cells).toEqual([1, 5, 7, 6, 3])
    // A ring can never be part of the answer, so nothing on it is numbered —
    // except the numbers that were printed there in the first place.
    const shown = numbersOf(pretend)
    expect(shown[3]).toBe(0)
    expect(shown[1]).toBe(3)
  })
})

/* ============================================================
   Par.

   Level one is small enough to walk: 318 positions, and the
   breadth-first search settles it outright.

   The other two are not, and they do not need to be. A finished
   board has every square but the last joined to the one after
   it, which is n*n - 1 lines; every board here starts with
   none; and one dispatched move changes the count of lines by
   exactly one, up or down. So no play can finish in fewer than
   n*n - 1 moves, and the scripted play below finishes in
   exactly that. The middle claim is the one worth checking, and
   it is checked over every position of level one and every
   action there is from it.
   ============================================================ */

describe('par', () => {
  const spec = (state: SignState) => ({
    start: state,
    moves: legalMoves,
    apply: reduce,
    key: keyOf,
    solved: isSolved,
  })

  it('"Nine signposts" is solvable in exactly par (8) joins, by search', () => {
    const path = shortestSolution<SignState, SignAction>(spec(NINE))
    expect(path).not.toBeNull()
    expect(path).toHaveLength(8)
    expect(levels[0].par).toBe(8)
  })

  it('walks the whole of the small board without running away with itself', () => {
    expect(reachableCount<SignState, SignAction>(spec(NINE))).toBe(318)
  })

  it('moves the count of lines by exactly one, whatever the move', () => {
    // Over every position the small board can reach, and every action there
    // is — the legal ones and a fistful of nonsense besides.
    for (const state of everyPosition(NINE)) {
      const nonsense: SignAction[] = [
        join(4, 4),
        join(0, 8),
        { type: 'unjoin', from: -1 },
      ]
      for (const action of [...legalMoves(state), ...nonsense]) {
        const after = reduce(state, action)
        if (after === state) continue
        expect(Math.abs(lines(after) - lines(state))).toBe(1)
      }
    }
  })

  for (const level of levels) {
    const state = start(level)
    const size = state.n * state.n

    it(`"${level.label}" has par ${size - 1}, which is one line a square but the last`, () => {
      expect(level.par).toBe(size - 1)
      expect(joinsLeft(state)).toBe(size - 1)
    })

    it(`"${level.label}" comes out in exactly par moves, joining 1 to 2 to 3 all the way up`, () => {
      const moves = ascending(state)
      expect(moves).toHaveLength(level.par as number)
      let cursor = state
      for (const [k, move] of moves.entries()) {
        const after = reduce(cursor, move)
        // Every one of them is a real move, and none of them finishes early.
        expect(after).not.toBe(cursor)
        expect(lines(after)).toBe(k + 1)
        expect(isSolved(cursor)).toBe(false)
        cursor = after
      }
      expect(isSolved(cursor)).toBe(true)
      expect(lines(cursor)).toBe(size - 1)
      expect(joinsLeft(cursor)).toBe(0)
    })

    it(`"${level.label}" can only be finished with ${size - 1} lines on it`, () => {
      const done = play(state, ascending(state))
      expect(lines(done)).toBe(size - 1)
      // Take any one of them off and the board is unfinished again, so nothing
      // shorter than par can ever be solved.
      for (let cell = 0; cell < size; cell++) {
        if (done.next[cell] === -1) continue
        expect(isSolved(reduce(done, { type: 'unjoin', from: cell }))).toBe(false)
      }
    })
  }
})

/** Every position the small board can reach, the empty one included. */
function everyPosition(from: SignState): SignState[] {
  const seen = new Map<string, SignState>([[keyOf(from), from]])
  const stack = [from]
  while (stack.length > 0) {
    const state = stack.pop() as SignState
    for (const action of legalMoves(state)) {
      const child = reduce(state, action)
      if (child === state || seen.has(keyOf(child))) continue
      seen.set(keyOf(child), child)
      stack.push(child)
    }
  }
  return [...seen.values()]
}

/* ============================================================
   No dead end.

   A chain can be built into a corner it cannot get out of, and
   the board says nothing about it — saying so would mean
   running the solver, and running the solver would hand the
   child the reasoning they came for. It costs them nothing,
   because a line can always be taken off again: there is no
   position here a player cannot move on from, so there is
   nothing for `failure` to report.
   ============================================================ */

describe('being stuck', () => {
  it('is not something this puzzle has', () => {
    expect(signposts.engine.failure).toBeUndefined()
  })

  it('never happens: every position of the small board has a move out of it', () => {
    for (const state of everyPosition(NINE)) {
      if (isSolved(state)) continue
      expect(legalMoves(state).length).toBeGreaterThan(0)
    }
  })

  it('leaves a board that has painted itself into a corner alone', () => {
    // Square 2 is the only square that can reach the 9, and this chain has
    // used it up somewhere else. The board says nothing at all about that.
    const wrong = play(NINE, [join(3, 1), join(1, 5), join(5, 7), join(7, 6), join(6, 0), join(0, 2)])
    expect(isSolved(wrong)).toBe(false)
    expect(signposts.engine.failure).toBeUndefined()
    expect(legalMoves(wrong).length).toBeGreaterThan(0)
  })
})

/* ============================================================
   Reading the board back.
   ============================================================ */

describe('what the board says about itself', () => {
  it('numbers a stretch that has caught a printed number, and nothing else', () => {
    const loose = play(NINE, [join(3, 1)])
    const shown = numbersOf(loose)
    // Square 3 has nothing printed on it, but the run it is in reaches the 3
    // on square 1, so it counts back to 2.
    expect(shown[3]).toBe(2)
    // Square 0 is joined to nothing and has nothing printed on it.
    expect(shown[0]).toBe(0)

    const nowhere = play(ROOMY, [join(4, 7)])
    // Neither square in that run has ever seen a printed number, so it is a
    // line and no more. This is where Tatham writes "a" and "a+1".
    expect(numbersOf(nowhere)[4]).toBe(0)
    expect(numbersOf(nowhere)[7]).toBe(0)
  })

  it('lays every square in exactly one run, joined or not', () => {
    const runs = runsOf(play(NINE, [join(4, 3), join(3, 1)]))
    expect(runs.filter((run) => run.cells.length > 1).map((run) => run.cells)).toEqual([[4, 3, 1]])
    expect(runs.flatMap((run) => run.cells).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(runs.every((run) => !run.ring)).toBe(true)
  })

  it('counts what is still to be joined up', () => {
    expect(joinsLeft(NINE)).toBe(8)
    expect(joinsLeft(reduce(NINE, join(4, 3)))).toBe(7)
  })

  it('reads a finished board off the printed rule, not off the reducer', () => {
    // A chain nothing could ever have built: every square joined to the next
    // one along in row order, arrows or no arrows.
    const faked: SignState = { ...NINE, next: [1, 2, 3, 4, 5, 6, 7, 8, -1] }
    expect(isSolved(faked)).toBe(false)
    // And one that follows every arrow but starts in the wrong place.
    expect(isSolved({ ...NINE, next: new Array<number>(9).fill(-1) })).toBe(false)
  })

  it('says what a move was, in numbers where it can and in squares where it cannot', () => {
    expect(describeMove(NINE, NINE, join(4, 3))).toBe('Joined 1 to row 2, column 1')
    const drawn = reduce(NINE, join(4, 3))
    expect(describeMove(drawn, drawn, { type: 'unjoin', from: 4 })).toBe('Unjoined 1 from 2')
    const built = play(NINE, [join(3, 1), join(1, 5)])
    expect(describeMove(built, built, join(5, 7))).toBe('Joined 4 to row 3, column 2')
  })
})

/* ============================================================
   The board.

   A grid of squares with an arrow on the rim of each, one svg
   over the top holding the lines and the numbers, and two taps
   to a move.
   ============================================================ */

const square = (index: number, n = 3) =>
  screen.getByRole('button', {
    name: new RegExp(`^Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1},`),
  })

const draw = (state: SignState, locked = false) => {
  const dispatch = vi.fn()
  const view = render(createElement(Board, { state, dispatch, locked }), {
    wrapper: underSettings(),
  })
  return { dispatch, view }
}

const note = () => document.querySelector('p[class*="note"]')?.textContent
const status = () => screen.getByRole('status').textContent

/** The board with a real state behind it, so a run of taps can be watched. */
const Play = ({ from }: { from: SignState }) => {
  const [state, setState] = useState(from)
  return createElement(Board, {
    state,
    dispatch: (action: SignAction) => setState((cur) => reduce(cur, action)),
    locked: false,
  })
}

describe('the signposts board', () => {
  it('draws a pressable square for every square on the grid', () => {
    const { view } = draw(NINE)
    const squares = view.container.querySelectorAll('[aria-label^="Row "]')
    expect(squares).toHaveLength(9)
    for (const tile of squares) {
      expect(tile).toHaveAttribute('type', 'button')
      expect(tile.className).toContain('u-press')
    }
    expect(square(4).getAttribute('aria-label')).toBe(
      'Row 2, column 2, pointing left, the printed number 1. Start a line here.',
    )
    expect(square(0).getAttribute('aria-label')).toBe(
      'Row 1, column 1, pointing right, no number yet. Start a line here.',
    )
    // The last square carries no arrow, and says so rather than pointing.
    expect(square(8).getAttribute('aria-label')).toBe(
      'Row 3, column 3, the end of the chain, the printed number 9. Start a line here.',
    )
  })

  it('turns each arrow to face its own way, and draws none on the last square', () => {
    const { view } = draw(NINE)
    const turns = [...view.container.querySelectorAll('[class*="arrow"]')].map((el) =>
      (el as HTMLElement).style.getPropertyValue('--turn'),
    )
    // Right, down-right, down; up-right, left, down-left; up, left — and then
    // nothing at all for the square that ends the chain.
    expect(turns).toEqual(['90deg', '135deg', '180deg', '45deg', '270deg', '225deg', '0deg', '270deg'])
  })

  it('turns the drawing inside each arrow, never its box, so a diagonal adds no overflow', () => {
    // A box turned to a diagonal is as big as its corners, and the frame
    // scrolled to them: a diagonal on the bottom row kept a scrollbar up.
    const { view } = draw(NINE)
    for (const arrow of view.container.querySelectorAll('svg[class*="arrow"]')) {
      expect(arrow.querySelector(':scope > g[data-turn] > path')).not.toBeNull()
    }
    const css = readFileSync(new URL(import.meta.url).pathname.replace(/[^/]+$/, 'board.module.css'), 'utf8')
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(bare.match(/\.arrow\s*\{([^}]*)\}/)?.[1]).not.toMatch(/transform/)
    expect(bare.match(/\.arrow \[data-turn\]\s*\{([^}]*)\}/)?.[1]).toMatch(/transform:\s*rotate\(var\(--turn\)\)/)
  })

  it('sends nothing for the first of the two taps', () => {
    const { dispatch } = draw(NINE)
    fireEvent.click(square(4))
    expect(dispatch).not.toHaveBeenCalled()
    expect(square(4).getAttribute('aria-label')).toMatch(/Let it go\.$/)
    expect(note()).toBe('Now tap the square that comes next.')
  })

  it('sends exactly one action for the second', () => {
    const { dispatch } = draw(NINE)
    fireEvent.click(square(4))
    fireEvent.click(square(3))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'join', from: 4, to: 3 })
  })

  it('lets go of a square that was chosen by mistake, without sending anything', () => {
    const { dispatch } = draw(NINE)
    fireEvent.click(square(4))
    fireEvent.click(square(4))
    expect(dispatch).not.toHaveBeenCalled()
    expect(square(4).getAttribute('aria-label')).toMatch(/Start a line here\.$/)
    expect(note()).toBe('8 squares still need joining up.')
  })

  it('takes a line off with one tap on the square it starts from', () => {
    const { dispatch } = draw(reduce(NINE, join(4, 3)))
    expect(square(4).getAttribute('aria-label')).toMatch(/Take the line off it\.$/)
    fireEvent.click(square(4))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'unjoin', from: 4 })
  })

  it('draws every joined stretch as one line, and nothing where nothing is joined', () => {
    expect(draw(NINE).view.container.querySelectorAll('polyline')).toHaveLength(0)
    cleanup()

    const { view } = draw(play(NINE, [join(4, 3), join(3, 1), join(2, 8)]))
    const drawn = [...view.container.querySelectorAll('polyline')].map((el) =>
      el.getAttribute('points'),
    )
    // Squares 4, 3 and 1 are one line through three middles; squares 2 and 8
    // are another through two. A middle is (column + a half, row + a half).
    expect(drawn).toEqual(['2.5,0.5 2.5,2.5', '1.5,1.5 0.5,1.5 1.5,0.5'])
  })

  it('writes the numbers a stretch has worked out, over the line rather than through it', () => {
    const { view } = draw(play(NINE, [join(4, 3)]))
    const numerals = [...view.container.querySelectorAll('text')]
    // The line is drawn first and the numbers after it, so a number a line
    // runs past hides the line rather than the other way round.
    const svg = view.container.querySelector('svg[viewBox="0 0 3 3"]') as SVGElement
    expect(svg.querySelector('polyline')).toBe(svg.children[0])
    // Down the board and across it: the 3 printed on square 1, the 2 the chain
    // has just worked out on square 3, then the 1, the 4 and the 9.
    expect(numerals.map((el) => el.textContent)).toEqual(['3', '2', '1', '4', '9'])
    // A printed number and one the chain worked out are told apart, so one can
    // be flat enamel and the other the square's own colour.
    const printed = numerals.map((el) => el.getAttribute('data-printed'))
    expect(printed).toEqual(['true', null, 'true', 'true', 'true'])
  })

  it('counts what is still to be joined up, and stays quiet once it is locked', () => {
    render(createElement(Play, { from: NINE }), { wrapper: underSettings() })
    expect(note()).toBe('8 squares still need joining up.')
    fireEvent.click(square(4))
    fireEvent.click(square(3))
    expect(note()).toBe('7 squares still need joining up.')
    cleanup()

    draw(play(NINE, ascending(NINE)), true)
    expect(note()).toBe('')
    expect(status()).toBe('')
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
  })

  it('joins one square to the next on two taps, and says so afterwards', () => {
    render(createElement(Play, { from: NINE }), { wrapper: underSettings() })
    fireEvent.click(square(4))
    fireEvent.click(square(3))
    expect(square(3).getAttribute('aria-label')).toBe(
      'Row 2, column 1, pointing up and right, the number 2. Start a line here.',
    )
  })

  it('walks the arrow keys from square to square, and keeps one tab stop', () => {
    draw(NINE)
    // The tab stop starts on the 1, which is where a child starts too.
    const stops = () =>
      [...document.querySelectorAll('[aria-label^="Row "]')].filter(
        (el) => el.getAttribute('tabindex') === '0',
      )
    expect(stops()).toEqual([square(4)])

    const cell = square(4)
    cell.focus()
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(square(5))
    expect(stops()).toEqual([square(5)])
    // And it stops at the edge rather than wrapping round to the next row.
    fireEvent.keyDown(square(5), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(square(5))
  })

  it('lets go of a chosen square with escape', () => {
    const { dispatch } = draw(NINE)
    fireEvent.click(square(4))
    fireEvent.keyDown(square(4), { key: 'Escape' })
    expect(square(4).getAttribute('aria-label')).toMatch(/Start a line here\.$/)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores every input while it is locked', () => {
    const { dispatch } = draw(NINE, true)
    const cell = square(4)
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    fireEvent.keyDown(cell, { key: 'Escape' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = play(NINE, [join(4, 3), join(3, 1)])
    const first = draw(state).view.container.innerHTML
    cleanup()
    expect(draw(state).view.container.innerHTML).toBe(first)
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = draw(NINE)
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(signposts.title)
    expect(text).not.toContain(signposts.tagline)
    for (const line of signposts.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

/* ============================================================
   A join the board will not keep, taken anyway.

   Every square stays live. A board that only let go of the
   squares along the arrow would be reading the arrow for the
   child, and reading the arrow is the puzzle.
   ============================================================ */

describe('a join the board will not keep, on the board', () => {
  const DUR_4 = 400

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    })
    document.documentElement.style.setProperty('--dur-4', `${DUR_4}ms`)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.removeAttribute('style')
  })

  const runCue = () => act(() => vi.advanceTimersByTime(DUR_4))

  const show = (settings?: { allowForbiddenMoves: boolean }) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state: NINE, dispatch, locked: false }), {
      wrapper: underSettings(settings),
    })
    return { dispatch, view }
  }

  it('looks exactly like a square that will take it', () => {
    show()
    fireEvent.click(square(4))
    // Square 0 is nowhere near the arrow on square 4, and it still offers to
    // take the line — so which squares are legal stays the child's to work out.
    expect(square(0)).toBeEnabled()
    expect(square(0).getAttribute('aria-label')).toBe(
      'Row 1, column 1, pointing right, no number yet. Join row 2, column 2 to this square.',
    )
  })

  it('draws it where the child put it, says no, and takes it off again', () => {
    const { dispatch, view } = show()
    fireEvent.click(square(4))
    fireEvent.click(square(0))

    expect(view.container.querySelectorAll('polyline')).toHaveLength(1)
    expect(square(0).className).toContain('flash')
    expect(status()).toBe('The next square has to be along the arrow.')
    expect(note()).toContain('The next square has to be along the arrow.')

    runCue()
    expect(view.container.querySelectorAll('polyline')).toHaveLength(0)
    expect(square(0).className).not.toContain('flash')
    // Nothing reached the shell, so nothing reached the history, the move tape
    // or the solved check.
    expect(dispatch).not.toHaveBeenCalled()
    // And the square the child started from is still chosen, so the next try
    // is one tap rather than two.
    expect(square(4).getAttribute('aria-label')).toMatch(/Let it go\.$/)
  })

  it('goes back to a dead square once the setting is turned off', () => {
    const { dispatch } = show({ allowForbiddenMoves: false })
    fireEvent.click(square(4))
    // The dead square says why, exactly as a dead peg on the tower does — so
    // it is no longer found by the seat it reads out first.
    const dead = screen.getByRole('button', {
      name: 'The next square has to be along the arrow. Row 1, column 1, pointing right, no number yet.',
    })
    expect(dead).toBeDisabled()
    fireEvent.click(dead)
    expect(dispatch).not.toHaveBeenCalled()
    // The square the arrow really does reach is live either way.
    expect(square(3)).toBeEnabled()
  })
})
