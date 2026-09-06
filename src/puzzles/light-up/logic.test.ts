import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { lightUp } from './index'
import { Board } from './Board'
import type { Clash, LightUpAction, LightUpConfig, LightUpState } from './logic'
import {
  OPEN,
  PLAIN,
  beam,
  beams,
  candleCells,
  candlesAround,
  clashOf,
  colOf,
  conflicts,
  darkSquares,
  deal,
  describeClash,
  describeMove,
  fits,
  hungryWalls,
  init,
  isOpen,
  isSolved,
  legalMoves,
  litCounts,
  numberWalls,
  orthogonal,
  randomIllumination,
  reduce,
  rowOf,
  scatterWalls,
  countSolutions,
  solveByLogic,
  stripNumbers,
} from './logic'

const levels = lightUp.levels as PuzzleLevel<LightUpConfig>[]
const start = (level: PuzzleLevel<LightUpConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/** The one way the candles can stand, ascending. */
const answerFor = (state: LightUpState) =>
  (solveByLogic(state.n, state.walls) as { candles: number[] }).candles

/** Stands every candle, one square a move. */
const solutionActions = (state: LightUpState): LightUpAction[] =>
  answerFor(state).map((index) => ({ type: 'toggle', index }) as LightUpAction)

const play = (state: LightUpState, actions: LightUpAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** A board built by hand, so a test can say which rule breaks. */
const board = (n: number, walls: number[], standing: number[] = []): LightUpState => ({
  n,
  walls,
  candles: walls.map((_, i) => standing.includes(i)),
})

afterEach(cleanup)

/* ============================================================
   The board it deals
   ============================================================ */

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, walls: wallCount, candles, minNumbers } = level.config

    it(`"${level.label}" scatters exactly ${wallCount} walls over a ${n} by ${n} board, every seed`, () => {
      for (const seed of SEEDS) {
        const { walls } = start(level, seed)
        expect(walls).toHaveLength(n * n)
        expect(walls.filter((v) => !isOpen(v))).toHaveLength(wallCount)
        // Every square is one of three things and nothing else: open, a plain
        // wall, or a wall carrying a count no bigger than its four sides.
        for (const value of walls) {
          expect(value === OPEN || value === PLAIN || (value >= 0 && value <= 4)).toBe(true)
        }
        expect(walls.filter((v) => v >= 0).length).toBeGreaterThanOrEqual(minNumbers)
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        const { walls } = start(level, seed)
        expect(countSolutions(n, walls, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // The fallbacks in `deal` are for a run of luck the tests have never
        // seen: every seed lands on a board that suits the level.
        expect(fits(level.config, state.walls)).toBe(true)
        const reasoned = solveByLogic(n, state.walls)
        expect(reasoned).not.toBeNull()
        const { rounds } = reasoned as { rounds: number }
        expect(rounds).toBeGreaterThanOrEqual(level.config.minRounds)
        expect(rounds).toBeLessThanOrEqual(level.config.maxRounds)
      }
    })

    it(`"${level.label}" stands ${candles} candles in its answer, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const answer = answerFor(state)
        expect(answer).toHaveLength(candles)
        expect(answer).toHaveLength(level.par as number)
        // The answer really answers the board, judged by the rules alone.
        expect(isSolved(board(n, state.walls, answer))).toBe(true)
      }
    })

    it(`"${level.label}" starts dark, with no candle on it`, () => {
      const state = start(level, 5)
      expect(candleCells(state)).toHaveLength(0)
      expect(darkSquares(state)).toBe(n * n - wallCount)
      expect(isSolved(state)).toBe(false)
      expect(conflicts(state).some(Boolean)).toBe(false)
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(start(level, 12).walls).toEqual(start(level, 12).walls)
      expect(start(level, 12).walls).not.toEqual(start(level, 13).walls)
    })
  }

  it('deals a board for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })
})

/* ============================================================
   The rules
   ============================================================ */

describe('the rules', () => {
  const n = 5
  const plain = new Array<number>(25).fill(OPEN)
  const at = (r: number, c: number) => r * n + c

  it('shines along the row and the column, and stops at a wall', () => {
    const walls = plain.slice()
    walls[at(2, 3)] = PLAIN
    const seen = beam(n, walls, at(2, 1)).sort((a, b) => a - b)
    expect(seen).toEqual([
      at(0, 1),
      at(1, 1),
      at(2, 0),
      at(2, 1),
      at(2, 2),
      at(3, 1),
      at(4, 1),
    ])
    // The wall stops the light: the squares behind it stay dark.
    expect(seen).not.toContain(at(2, 4))
  })

  it('lights the candle’s own square', () => {
    expect(beam(n, plain, at(2, 2))).toContain(at(2, 2))
  })

  it('lets one square be reached by two candles at once', () => {
    // Legal, and the reason a naive solution counter counts one board twice:
    // this square is lit along its row and down its column.
    const lit = litCounts(board(n, plain, [at(2, 0), at(0, 2)]))
    expect(lit[at(2, 2)]).toBe(2)
    expect(lit[at(2, 0)]).toBe(1)
  })

  it('sees both ways round, because a wall stops the light either way', () => {
    const walls = plain.slice()
    walls[at(1, 1)] = PLAIN
    for (let a = 0; a < 25; a++) {
      if (!isOpen(walls[a])) continue
      for (let b = 0; b < 25; b++) {
        if (!isOpen(walls[b])) continue
        expect(beam(n, walls, a).includes(b)).toBe(beam(n, walls, b).includes(a))
      }
    }
  })

  it('gives a wall nothing to shine with', () => {
    const walls = plain.slice()
    walls[at(1, 1)] = 2
    expect(beams(n, walls)[at(1, 1)]).toEqual([])
  })

  it('counts only the four squares against a wall', () => {
    expect(orthogonal(n, at(0, 0)).sort((a, b) => a - b)).toEqual([at(0, 1), at(1, 0)])
    expect(orthogonal(n, at(2, 2))).toHaveLength(4)
    const walls = plain.slice()
    walls[at(2, 2)] = 2
    // Corner to corner does not touch a wall, so it is not counted.
    const state = board(n, walls, [at(2, 1), at(1, 1)])
    expect(candlesAround(state, at(2, 2))).toBe(1)
  })

  it('counts the squares still dark, and the walls still short', () => {
    const walls = plain.slice()
    walls[at(2, 2)] = 3
    const state = board(n, walls, [at(2, 1)])
    expect(darkSquares(state)).toBe(24 - beam(n, walls, at(2, 1)).length)
    expect(hungryWalls(state)).toBe(1)
    expect(hungryWalls(board(n, walls, [at(2, 1), at(2, 3), at(1, 2)]))).toBe(0)
  })
})

/* ============================================================
   reduce
   ============================================================ */

describe('reduce', () => {
  const state = start(levels[0], 4)
  const open = state.walls.findIndex(isOpen)
  const wall = state.walls.findIndex((v) => !isOpen(v))

  it('stands a candle and takes it away again', () => {
    const down = reduce(state, { type: 'toggle', index: open })
    expect(down.candles[open]).toBe(true)
    // The walls never change, so the new state shares the very same array.
    expect(down.walls).toBe(state.walls)
    const up = reduce(down, { type: 'toggle', index: open })
    expect(up.candles[open]).toBe(false)
    expect(up.candles).toEqual(state.candles)
  })

  it('hands back the very same state for an action that is not one', () => {
    expect(reduce(state, { type: 'toggle', index: -1 })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: state.candles.length })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: 1.5 })).toBe(state)
    expect(reduce(state, { type: 'nudge' } as unknown as LightUpAction)).toBe(state)
  })

  /**
   * The branch this board has that a board of plain squares does not. A wall
   * is never drawn as a button, so it is easy to leave out — but the move tape
   * replays actions, and this dispatches one on purpose.
   */
  it('hands back the very same state for a tap on a wall', () => {
    expect(wall).toBeGreaterThanOrEqual(0)
    expect(reduce(state, { type: 'toggle', index: wall })).toBe(state)
    for (let i = 0; i < state.walls.length; i++) {
      if (isOpen(state.walls[i])) continue
      expect(reduce(state, { type: 'toggle', index: i })).toBe(state)
    }
  })

  it('lets a candle stand somewhere the rules forbid, and says so afterwards', () => {
    const answer = answerFor(state)
    const first = reduce(state, { type: 'toggle', index: answer[0] })
    const inTheLight = beam(state.n, state.walls, answer[0]).find((j) => j !== answer[0]) as number
    const wrong = reduce(first, { type: 'toggle', index: inTheLight })
    // The move happened: the board draws it, the shell records it, and the
    // clash is what the board says over the top.
    expect(wrong).not.toBe(first)
    expect(wrong.candles[inTheLight]).toBe(true)
    expect(conflicts(wrong)[inTheLight]).toBe(true)
    expect(conflicts(wrong)[answer[0]]).toBe(true)
    expect(isSolved(wrong)).toBe(false)
  })
})

/* ============================================================
   isSolved and conflicts
   ============================================================ */

describe('isSolved and conflicts', () => {
  for (const level of levels) {
    it(`"${level.label}" comes out in exactly ${level.par} moves, and is solved when it does`, () => {
      for (const seed of SEEDS.slice(0, 20)) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        const done = play(first, actions)
        expect(isSolved(done)).toBe(true)
        expect(conflicts(done).some(Boolean)).toBe(false)
        expect(darkSquares(done)).toBe(0)
        expect(hungryWalls(done)).toBe(0)
      }
    })

    it(`"${level.label}" is not finished a candle short, and nothing is wrong either`, () => {
      for (const seed of SEEDS.slice(0, 20)) {
        const first = start(level, seed)
        const short = play(first, solutionActions(first).slice(0, -1))
        expect(isSolved(short)).toBe(false)
        // The state the status line has to speak for: not finished, but
        // nothing on the board is breaking a rule.
        expect(conflicts(short).some(Boolean)).toBe(false)
        expect(darkSquares(short)).toBeGreaterThan(0)
      }
    })
  }

  it('will not call a board solved while a square is dark', () => {
    // One candle in the middle of an empty room lights a cross and no more.
    const state = board(3, new Array<number>(9).fill(OPEN), [4])
    expect(darkSquares(state)).toBe(4)
    expect(isSolved(state)).toBe(false)
  })

  it('will not call a board solved while one candle stands in another’s light', () => {
    // Every square is lit, and the two in the top row are lighting each other.
    const walls = new Array<number>(9).fill(OPEN)
    const state = board(3, walls, [0, 2, 4])
    expect(darkSquares(state)).toBe(0)
    expect(litCounts(state)[0]).toBe(2)
    expect(conflicts(state).filter(Boolean)).toHaveLength(2)
    expect(isSolved(state)).toBe(false)
  })

  it('will not call a board solved while a wall is short of its number', () => {
    const walls = new Array<number>(9).fill(OPEN)
    walls[4] = 2
    const state = board(3, walls, [0, 8])
    expect(darkSquares(state)).toBe(0)
    expect(conflicts(state).some(Boolean)).toBe(false)
    expect(candlesAround(state, 4)).toBe(0)
    expect(hungryWalls(state)).toBe(1)
    expect(isSolved(state)).toBe(false)
  })

  it('asks nothing of a wall with no number on it', () => {
    const walls = new Array<number>(9).fill(OPEN)
    walls[4] = PLAIN
    const state = board(3, walls, [0, 8])
    expect(isSolved(state)).toBe(true)
    expect(hungryWalls(state)).toBe(0)
  })

  it('flags every candle at fault, and no candle that is behaving', () => {
    const walls = new Array<number>(25).fill(OPEN)
    walls[12] = 1
    // Two candles beside a wall that wants one, and a third minding its own
    // business in a corner the other two cannot see.
    const state = board(5, walls, [11, 13, 24])
    const flagged = conflicts(state)
    expect(flagged[11]).toBe(true)
    expect(flagged[13]).toBe(true)
    expect(flagged[24]).toBe(false)
    expect(flagged.filter(Boolean)).toHaveLength(2)
  })
})

/* ============================================================
   The clash a candle makes
   ============================================================ */

describe('the clash a candle makes', () => {
  /* Hand-built, so the test says which rule breaks rather than hunting for one.
       0 .    1 .    2 wants 0   3 .    4 .
       5 .    6 .    7 wall      8 .    9 .
      10 .   11 .   12 wants 2  13 .   14 .
      15 .   16 .   17 .        18 .   19 .
      20 .   21 wants 1  22 .   23 .   24 .   */
  const walls = [
    OPEN, OPEN, 0, OPEN, OPEN,
    OPEN, OPEN, PLAIN, OPEN, OPEN,
    OPEN, OPEN, 2, OPEN, OPEN,
    OPEN, OPEN, OPEN, OPEN, OPEN,
    OPEN, 1, OPEN, OPEN, OPEN,
  ]
  const at = (standing: number[]) => board(5, walls, standing)

  it('says nothing when the square takes the candle cleanly', () => {
    expect(clashOf(at([]), 10)).toBeNull()
    expect(clashOf(at([3]), 10)).toBeNull()
  })

  it('says nothing about a square that already has a candle, or about a wall', () => {
    expect(clashOf(at([10]), 10)).toBeNull()
    expect(clashOf(at([]), 7)).toBeNull()
    expect(clashOf(at([]), 12)).toBeNull()
  })

  it('names the light, and holds the run of squares between the two candles', () => {
    expect(clashOf(at([3]), 4)).toEqual({
      kind: 'seen',
      cells: [3, 4],
      blamed: [4, 3],
      wall: -1,
      wanted: 0,
      got: 0,
    })
    // Down a column, four squares long.
    expect(clashOf(at([5]), 20)).toMatchObject({
      kind: 'seen',
      cells: [5, 10, 15, 20],
      blamed: [20, 5],
    })
  })

  it('blames every candle in the light, not only the first', () => {
    // Two candles up and down the first column, and a tap between them.
    expect(clashOf(at([0, 20]), 10)).toMatchObject({
      kind: 'seen',
      cells: [0, 5, 10, 15, 20],
      blamed: [10, 0, 20],
    })
  })

  it('falls to the wall’s number when nothing is in the light', () => {
    expect(clashOf(at([11, 13]), 17)).toEqual({
      kind: 'count',
      cells: [11, 12, 13, 17],
      blamed: [17, 11, 13],
      wall: 12,
      wanted: 2,
      got: 3,
    })
  })

  it('reports the light first when a candle breaks both rules at once', () => {
    // Wall 12 is already full, and 22 is in the light of square 17.
    const clash = clashOf(at([11, 13, 22]), 17) as Clash
    expect(clash.kind).toBe('seen')
    expect(clash.blamed).toEqual([17, 22])
  })

  it('puts the broken rule in one sentence, with the grammar to match', () => {
    expect(describeClash(clashOf(at([3]), 4) as Clash)).toBe(
      'This candle is standing in another candle’s light.',
    )
    expect(describeClash(clashOf(at([]), 1) as Clash)).toBe('This wall wants no candles at all.')
    expect(describeClash(clashOf(at([20]), 22) as Clash)).toBe(
      'This wall wants 1 candle and now has 2.',
    )
    expect(describeClash(clashOf(at([11, 13]), 17) as Clash)).toBe(
      'This wall wants 2 candles and now has 3.',
    )
  })

  it('fires exactly when the move would turn the square red', () => {
    for (const level of levels) {
      const state = start(level, 12)
      const answer = answerFor(state)
      const half = play(
        state,
        answer.slice(0, 2).map((index) => ({ type: 'toggle', index }) as LightUpAction),
      )
      for (let index = 0; index < half.walls.length; index++) {
        if (!isOpen(half.walls[index]) || half.candles[index]) continue
        const clash = clashOf(half, index)
        expect(clash !== null).toBe(conflicts(reduce(half, { type: 'toggle', index }))[index])
        if (clash === null) continue
        expect(clash.cells).toContain(index)
        expect(clash.blamed[0]).toBe(index)
        // A wall that wants no candles blames only the one just put down;
        // every other clash has somebody to point at.
        if (clash.kind === 'seen' || clash.wanted > 0) {
          expect(clash.blamed.length).toBeGreaterThan(1)
        }
      }
    }
  })
})

/* ============================================================
   describe
   ============================================================ */

describe('describe', () => {
  it('names the square, in the past tense, both ways round', () => {
    const state = board(5, new Array<number>(25).fill(OPEN))
    const down = reduce(state, { type: 'toggle', index: 7 })
    expect(describeMove(state, down, { type: 'toggle', index: 7 })).toBe(
      'Stood a candle in row 2, column 3',
    )
    expect(describeMove(down, state, { type: 'toggle', index: 7 })).toBe(
      'Took the candle off row 2, column 3',
    )
  })

  it('names the square the move actually changed, for every square', () => {
    const state = start(levels[1], 44)
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      const changed = next.candles.findIndex((candle, i) => candle !== state.candles[i])
      expect(describeMove(state, next, action)).toContain(
        `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
      )
    }
  })
})

/* ============================================================
   par
   ============================================================ */

/**
 * States a shortest run never passes through, and every one of them is safe to
 * skip because it keeps every subset of the one answer A.
 *
 * 1. Two candles in each other's light. No two candles of A see each other, so
 *    no subset of A has a pair that do.
 * 2. A wall with more candles than its number. A subset of A has at most as
 *    many candles beside a wall as A itself, which is exactly the number.
 * 3. A wall that can no longer reach its number. A candle of A is lit by
 *    nothing but itself, so under any subset of A the candles of A not yet
 *    placed are still standing on dark, empty squares — the wall can always
 *    still get there.
 */
function stuck(state: LightUpState): boolean {
  const { n, walls, candles } = state
  const lit = litCounts(state)
  for (let i = 0; i < candles.length; i++) if (candles[i] && lit[i] !== 1) return true
  for (let i = 0; i < walls.length; i++) {
    if (walls[i] < 0) continue
    let on = 0
    let spare = 0
    for (const j of orthogonal(n, i)) {
      if (candles[j]) on++
      else if (isOpen(walls[j]) && lit[j] === 0) spare++
    }
    if (on > walls[i] || on + spare < walls[i]) return true
  }
  return false
}

describe('par', () => {
  it('is the number of candles in the answer, one candle a move', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.candles)
    }
  })

  /**
   * The whole argument, checked on every seed rather than sampled.
   *
   * A solved position *is* an answer to the board, so with exactly one answer
   * there is exactly one solved position, and it stands `par` candles. Every
   * move changes the number of candles on the board by one, so no run from the
   * empty board reaches it in fewer than `par` — and standing the answer's
   * squares in any order reaches it in exactly `par`.
   */
  it('cannot be beaten, because there is one answer and one candle a move', () => {
    for (const level of levels) {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(countSolutions(state.n, state.walls, 3)).toBe(1)
        expect(answerFor(state)).toHaveLength(level.par as number)
      }
    }
  })

  /**
   * And the same number found the other way, by walking the state graph.
   *
   * The prunes above never drop a subset of the answer, so the run that stands
   * the answer's candles one at a time survives them: the search cannot come
   * back with more than `par`. It only ever returns a run of real moves, so it
   * cannot come back with less than the true shortest either — and the
   * paragraph above puts that at `par`. Measured over 60 seeds a level, the
   * deepest search touches 36,331 states against the 200,000 the search allows.
   */
  it('is what a breadth-first search finds, at every level', () => {
    for (const level of levels) {
      for (const seed of [5, 61]) {
        const first = start(level, seed)
        const path = shortestSolution<LightUpState, LightUpAction>({
          start: first,
          moves: legalMoves,
          apply: reduce,
          key: (s) => s.walls.map((v, i) => (!isOpen(v) ? '' : s.candles[i] ? '1' : '0')).join(''),
          solved: isSolved,
          invalid: stuck,
        })
        expect(path).not.toBeNull()
        expect(path).toHaveLength(level.par as number)
      }
    }
  }, 30_000)

  it('is reached by standing the answer’s candles in any order', () => {
    const state = start(levels[0], 9)
    const answer = answerFor(state)
    const backwards = [...answer].reverse().map((index) => ({ type: 'toggle', index }) as LightUpAction)
    const done = play(state, backwards)
    expect(isSolved(done)).toBe(true)
    expect(backwards).toHaveLength(levels[0].par as number)
  })
})

/* ============================================================
   The solver, and the counter that keeps it honest
   ============================================================ */

/**
 * The stupidest possible counter: every subset of the open squares, judged by
 * `isSolved` and nothing else. It knows nothing about beams, branching or
 * canonical order, which is the whole point of asking it. Eighteen open
 * squares is a quarter of a million boards, so it is only ever pointed at the
 * smallest boards here.
 */
function dumbCount(state: LightUpState): number {
  const open: number[] = []
  for (let i = 0; i < state.walls.length; i++) if (isOpen(state.walls[i])) open.push(i)
  let found = 0
  for (let mask = 0; mask < 1 << open.length; mask++) {
    const candles = new Array<boolean>(state.walls.length).fill(false)
    for (let b = 0; b < open.length; b++) if ((mask >> b) & 1) candles[open[b]] = true
    if (isSolved({ ...state, candles })) found++
  }
  return found
}

describe('the solver', () => {
  it('agrees with a plain exhaustive count', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const state = start(levels[0], seed)
      expect(dumbCount(state)).toBe(1)
      expect(countSolutions(state.n, state.walls, 3)).toBe(1)
    }
  }, 30_000)

  /**
   * The trap this counter was written round. A square can legally be reached
   * by two candles at once — one along its row, one down its column — and a
   * counter that branches on "which candle lights this square" reports that
   * arrangement once for each of them. Branching canonically counts it once,
   * and the exhaustive counter is what says which of the two is right.
   */
  it('counts an arrangement once even when two candles light one square', () => {
    const walled = new Array<number>(9).fill(OPEN)
    walled[4] = PLAIN
    const answer = board(3, walled, [0, 8])
    expect(isSolved(answer)).toBe(true)
    expect(litCounts(answer)[6]).toBe(2)
    expect(countSolutions(3, walled, 20)).toBe(dumbCount(board(3, walled)))

    // And on an open board, where every answer is one candle a row and a column.
    const empty = new Array<number>(9).fill(OPEN)
    expect(countSolutions(3, empty, 20)).toBe(dumbCount(board(3, empty)))
  })

  it('finds the answer the board was built round', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 20)) {
        const state = start(level, seed)
        const reasoned = answerFor(state)
        expect(isSolved(board(state.n, state.walls, reasoned))).toBe(true)
        expect(countSolutions(state.n, state.walls, 2)).toBe(1)
      }
    }
  })

  /**
   * The claim the whole generator rests on: a board the solver can finish is a
   * board with one answer. Boards with most of their numbers rubbed out are
   * mostly not like that, which is what makes them worth testing against.
   */
  it('never finishes a board that has two answers', () => {
    const rng = makeRng(2024)
    let loose = 0
    for (let k = 0; k < 150; k++) {
      const blank = scatterWalls(rng, 5, 7)
      const answer = randomIllumination(rng, 5, blank)
      if (answer === null) continue
      // Half the numbers rubbed out at random, with nothing checking that what
      // is left still settles the board.
      const walls = numberWalls(5, blank, answer).map((v) => (v >= 0 && rng() < 0.5 ? PLAIN : v))
      const count = countSolutions(5, walls, 2)
      if (count > 1) {
        loose++
        expect(solveByLogic(5, walls)).toBeNull()
      } else if (solveByLogic(5, walls) !== null) {
        expect(count).toBe(1)
      }
    }
    expect(loose).toBeGreaterThan(20)
  })

  it('gives up rather than guessing', () => {
    // A five by five with no walls at all: any one candle a row and a column
    // lights the whole board, so there are a hundred and twenty answers and
    // not one square that can be argued for.
    const empty = new Array<number>(25).fill(OPEN)
    expect(countSolutions(5, empty, 2)).toBe(2)
    expect(solveByLogic(5, empty)).toBeNull()
  })

  it('turns down a board whose numbers cannot be met', () => {
    // A corner wall asking for four candles has only two sides to put them on.
    const impossible = new Array<number>(25).fill(OPEN)
    impossible[0] = 4
    expect(solveByLogic(5, impossible)).toBeNull()
  })

  it('turns down a board with a square that can never be lit', () => {
    // One square ringed by four walls, every one of them wanting no candles:
    // nothing may stand beside it, and nothing may stand on it either.
    const shut = new Array<number>(25).fill(OPEN)
    for (const i of [7, 11, 13, 17]) shut[i] = 0
    expect(solveByLogic(5, shut)).toBeNull()
  })
})

/* ============================================================
   Making a board
   ============================================================ */

describe('scattering, lighting and rubbing out', () => {
  it('scatters exactly the walls it was asked for', () => {
    const rng = makeRng(7)
    for (let k = 0; k < 20; k++) {
      const walls = scatterWalls(rng, 6, 9)
      expect(walls).toHaveLength(36)
      expect(walls.filter((v) => v === PLAIN)).toHaveLength(9)
      expect(walls.filter(isOpen)).toHaveLength(27)
    }
  })

  it('finds an illumination that already keeps every rule but the counts', () => {
    const rng = makeRng(8)
    let found = 0
    for (let k = 0; k < 40; k++) {
      const walls = scatterWalls(rng, 6, 9)
      const answer = randomIllumination(rng, 6, walls)
      if (answer === null) continue
      found++
      const state = board(6, walls, answer)
      expect(darkSquares(state)).toBe(0)
      // No candle stands in another's light, by construction: the search only
      // ever puts one on a square that is still dark.
      expect(conflicts(state).some(Boolean)).toBe(false)
    }
    expect(found).toBeGreaterThan(20)
  })

  it('numbers every wall from the answer, and nothing else', () => {
    const walls = new Array<number>(25).fill(OPEN)
    walls[12] = PLAIN
    walls[0] = PLAIN
    const numbered = numberWalls(5, walls, [11, 13, 7])
    expect(numbered[12]).toBe(3)
    expect(numbered[0]).toBe(0)
    expect(numbered.filter(isOpen)).toHaveLength(23)
  })

  it('rubs out every number the board can do without, and no more', () => {
    const rng = makeRng(11)
    const blank = scatterWalls(rng, 5, 7)
    const answer = randomIllumination(rng, 5, blank) as number[]
    const full = numberWalls(5, blank, answer)
    const stripped = stripNumbers(rng, 5, full)
    if (stripped === null) return
    expect(solveByLogic(5, stripped)).not.toBeNull()
    // Every number left is load-bearing: rub any one of them out and the board
    // stops reasoning through.
    for (let i = 0; i < stripped.length; i++) {
      if (stripped[i] < 0) continue
      const without = stripped.slice()
      without[i] = PLAIN
      expect(solveByLogic(5, without)).toBeNull()
    }
  })

  it('turns down a board it cannot reason through', () => {
    const empty = new Array<number>(25).fill(OPEN)
    expect(stripNumbers(makeRng(3), 5, empty)).toBeNull()
    expect(fits(levels[0].config, empty)).toBe(false)
  })
})

/* ============================================================
   The board on the screen
   ============================================================ */

describe('the board', () => {
  const setup = (level: PuzzleLevel<LightUpConfig>, seed: number, locked = false) => {
    const state = start(level, seed)
    const dispatch = vi.fn()
    render(createElement(Board, { state, dispatch, locked }))
    return { state, dispatch }
  }

  const cellAt = (n: number, index: number) =>
    document.querySelector(
      `[aria-label^="Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1},"]`,
    ) as HTMLElement

  /** The board with a real state behind it, so a cue can be watched from the tap that fires it. */
  const Play = ({ from }: { from: LightUpState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: LightUpAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  it('draws a pressable square for every open square, and none for a wall', () => {
    const { state } = setup(levels[0], 2)
    const open = state.walls.filter(isOpen).length
    const tiles = screen.getAllByRole('button')
    expect(tiles).toHaveLength(open)
    for (const tile of tiles) {
      expect(tile.className).toContain('u-press')
      expect(tile.getAttribute('aria-label')).toMatch(
        /^Row \d+, column \d+, (a candle|a lit square|a dark square)/,
      )
    }
    expect(screen.getAllByRole('img')).toHaveLength(state.walls.length - open)
  })

  it('says what a wall asks for, with the grammar to match', () => {
    const walls = new Array<number>(25).fill(OPEN)
    walls[0] = PLAIN
    walls[1] = 0
    walls[2] = 1
    walls[3] = 2
    render(createElement(Board, { state: board(5, walls), dispatch: vi.fn(), locked: false }))
    expect(screen.getByLabelText('Row 1, column 1, a wall')).toBeInTheDocument()
    expect(screen.getByLabelText('Row 1, column 2, a wall that wants no candles')).toBeInTheDocument()
    expect(screen.getByLabelText('Row 1, column 3, a wall that wants 1 candle')).toBeInTheDocument()
    expect(screen.getByLabelText('Row 1, column 4, a wall that wants 2 candles')).toBeInTheDocument()
    // The number is printed as well as spoken, and only where there is one.
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('leaves the shell’s furniture to the shell', () => {
    setup(levels[0], 2)
    const page = document.body.textContent ?? ''
    expect(document.querySelector('h1, h2, h3')).toBeNull()
    expect(page).not.toMatch(/undo|reset|hint|solved|par/i)
  })

  it('sends exactly one action for one tap', () => {
    const { state, dispatch } = setup(levels[0], 2)
    const open = state.walls.findIndex(isOpen)
    fireEvent.click(cellAt(state.n, open))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle', index: open })
  })

  it('walks the arrow keys over a wall, and stands still at the edge', () => {
    const walls = new Array<number>(25).fill(OPEN)
    walls[2] = 0
    walls[7] = PLAIN
    walls[12] = 2
    render(createElement(Board, { state: board(5, walls), dispatch: vi.fn(), locked: false }))

    const from = cellAt(5, 1)
    // act(), not a bare focus(): the roving tab stop moves in React state, and
    // the key handler has to be the one rendered after the focus landed.
    act(() => from.focus())
    fireEvent.keyDown(from, { key: 'ArrowRight' })
    // Straight over the wall at row 1, column 3 and on to the next open square.
    expect(document.activeElement).toBe(cellAt(5, 3))

    // One tab stop, and it is wherever the keyboard has got to.
    const stops = [...document.querySelectorAll('[aria-label^="Row "]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toEqual([document.activeElement])

    // Nothing but wall the rest of the way up, so it stays put.
    const walled = cellAt(5, 17)
    act(() => walled.focus())
    fireEvent.keyDown(walled, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(walled)

    // And it stops at the edge rather than wrapping round to the next row.
    const edge = cellAt(5, 4)
    act(() => edge.focus())
    fireEvent.keyDown(edge, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(edge)
  })

  it('puts the tab stop on the first open square, not on square one', () => {
    const walls = new Array<number>(25).fill(OPEN)
    walls[0] = PLAIN
    render(createElement(Board, { state: board(5, walls), dispatch: vi.fn(), locked: false }))
    expect(cellAt(5, 1)).toHaveAttribute('tabindex', '0')
  })

  it('counts the squares that are still dark', () => {
    const state = start(levels[0], 2)
    render(createElement(Play, { from: state }))
    expect(screen.getByText('18 squares are still dark.')).toBeInTheDocument()
    fireEvent.click(cellAt(state.n, answerFor(state)[0]))
    expect(screen.getByText(/squares are still dark\./)).toBeInTheDocument()
  })

  it('counts one dark square in the singular', () => {
    const walls = new Array<number>(9).fill(OPEN)
    walls[4] = PLAIN
    render(createElement(Board, { state: board(3, walls, [0, 7]), dispatch: vi.fn(), locked: false }))
    expect(screen.getByText('1 square is still dark.')).toBeInTheDocument()
  })

  /**
   * The quiet moment this board would otherwise have. Every square is lit,
   * nothing is red, the dark count reads nothing — and the level is not
   * solved, because a wall is still short of its number.
   */
  it('says so when the board is lit but a wall still wants a candle', () => {
    const walls = new Array<number>(9).fill(OPEN)
    walls[1] = 2
    walls[7] = 0
    const one = board(3, walls, [2, 3])
    expect(darkSquares(one)).toBe(0)
    expect(conflicts(one).some(Boolean)).toBe(false)
    expect(isSolved(one)).toBe(false)
    render(createElement(Board, { state: one, dispatch: vi.fn(), locked: false }))
    expect(
      screen.getByText('Every square is lit. 1 wall still wants another candle.'),
    ).toBeInTheDocument()
    cleanup()

    const both = walls.slice()
    both[7] = 1
    render(createElement(Board, { state: board(3, both, [2, 3]), dispatch: vi.fn(), locked: false }))
    expect(
      screen.getByText('Every square is lit. 2 walls still want more candles.'),
    ).toBeInTheDocument()
  })

  it('says so, in words and out loud, when a candle breaks a rule', () => {
    const state = start(levels[0], 2)
    const answer = answerFor(state)
    const inTheLight = beam(state.n, state.walls, answer[0]).find((j) => j !== answer[0]) as number
    render(createElement(Play, { from: state }))
    fireEvent.click(cellAt(state.n, answer[0]))
    fireEvent.click(cellAt(state.n, inTheLight))

    const said = describeClash(
      clashOf(reduce(state, { type: 'toggle', index: answer[0] }), inTheLight) as Clash,
    )
    expect(screen.getByRole('status')).toHaveTextContent(said)
    // Both lines say it: the one a child reads and the one a screen reader speaks.
    expect(screen.getAllByText(said)).toHaveLength(2)
    expect(cellAt(state.n, inTheLight)).toHaveAttribute('data-conflict', 'true')
    expect(cellAt(state.n, inTheLight).getAttribute('aria-label')).toMatch(/, breaking a rule$/)

    // Take it off again and there is nothing left to say.
    fireEvent.click(cellAt(state.n, inTheLight))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('lights the run of squares and shakes the candles at fault', () => {
    const walls = new Array<number>(25).fill(OPEN)
    const state = board(5, walls, [5])
    render(createElement(Play, { from: state }))
    fireEvent.click(cellAt(5, 20))

    const lit = wearing(cues.highlight)
    expect(lit.map((el) => el.getAttribute('aria-label'))).toEqual([
      'Row 2, column 1, a candle, breaking a rule',
      'Row 3, column 1, a lit square',
      'Row 4, column 1, a lit square',
      'Row 5, column 1, a candle, breaking a rule',
    ])
    const shaking = wearing(cues.shake).map((mark) => mark.closest('[aria-label]'))
    expect(shaking).toHaveLength(2)
    expect(shaking).toContain(cellAt(5, 5))
    expect(shaking).toContain(cellAt(5, 20))
  })

  it('lights the wall and the squares round it when a count is broken', () => {
    const walls = new Array<number>(25).fill(OPEN)
    walls[12] = 1
    render(createElement(Play, { from: board(5, walls, [11]) }))
    fireEvent.click(cellAt(5, 13))
    expect(wearing(cues.highlight).map((el) => el.getAttribute('aria-label'))).toEqual([
      'Row 2, column 3, a dark square',
      'Row 3, column 2, a candle, breaking a rule',
      'Row 3, column 3, a wall that wants 1 candle',
      'Row 3, column 4, a candle, breaking a rule',
      'Row 4, column 3, a dark square',
    ])
    expect(screen.getByRole('status')).toHaveTextContent('This wall wants 1 candle and now has 2.')
  })

  it('lights nothing when the candle fits', () => {
    const state = start(levels[0], 2)
    render(createElement(Play, { from: state }))
    fireEvent.click(cellAt(state.n, answerFor(state)[0]))
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('takes the light off again, and leaves the sentence and the red ring standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const walls = new Array<number>(25).fill(OPEN)
      render(createElement(Play, { from: board(5, walls, [5]) }))
      fireEvent.click(cellAt(5, 20))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(wearing(cues.shake)).toHaveLength(0)
      // The louder layer has gone; the marking underneath it has not.
      expect(cellAt(5, 20)).toHaveAttribute('data-conflict', 'true')
      expect(screen.getByRole('status').textContent).not.toBe('')
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('washes the light over every square a candle reaches', () => {
    const walls = new Array<number>(25).fill(OPEN)
    walls[12] = PLAIN
    const state = board(5, walls, [10])
    render(createElement(Board, { state, dispatch: vi.fn(), locked: false }))
    expect(cellAt(5, 10)).toHaveAttribute('data-candle', 'true')
    expect(cellAt(5, 11)).toHaveAttribute('data-lit', 'true')
    // Behind the wall, and still dark.
    expect(cellAt(5, 13)).not.toHaveAttribute('data-lit')
  })

  it('ignores every input while it is locked', () => {
    const { state, dispatch } = setup(levels[0], 2, true)
    const open = state.walls.findIndex(isOpen)
    const cell = cellAt(state.n, open) as HTMLButtonElement
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const tile of screen.getAllByRole('button')) expect(tile).toBeDisabled()
  })

  it('draws a solved board without a word of celebration', () => {
    const first = start(levels[0], 21)
    const done = play(first, solutionActions(first))
    render(createElement(Board, { state: done, dispatch: vi.fn(), locked: true }))
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

/* ============================================================
   The meta
   ============================================================ */

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(lightUp.id).toBe('light-up')
    expect(lightUp.reseedable).toBe(true)
    // A candle in the wrong place is not a dead end here — it is taken back
    // off, not stepped back from — so there is deliberately no failure(). A
    // wall that can no longer reach its number is a dead end a child works out
    // for themselves, and locking the board would do that thinking for them.
    expect(lightUp.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(140)
    }
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    expect(lightUp.instructions.length).toBeGreaterThanOrEqual(2)
    expect(lightUp.instructions.length).toBeLessThanOrEqual(4)
    // Four lines, and the longest of them is 86 characters. The cap is the
    // longest line the collection already ships — leapfrog's "Tap a frog to
    // move it. It steps onto the free stone, or jumps over one frog of the
    // other colour." at 96 — because a line here has never been one sentence.
    for (const line of lightUp.instructions) expect(line.length).toBeLessThanOrEqual(96)
    const lines = [lightUp.tagline, ...lightUp.instructions, ...levels.flatMap((l) => l.hints)]
    for (const line of lines) {
      expect(line).toMatch(/[.]$/)
      expect(line).not.toMatch(/!/)
      expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
      expect(line[0]).toBe(line[0].toUpperCase())
    }
  })

  /**
   * The trap this card walked into once. `PuzzlePage` puts the picture inside
   * the puzzle's `<h1>`, so a real `<text>` element in the scene becomes part
   * of the heading's plain text: with two numbered walls on the card the title
   * read "22The candles". The numerals are drawn as strokes instead.
   */
  it('draws its clue numbers rather than typing them, so the title stays the title', () => {
    const { container } = render(createElement(lightUp.Icon))
    expect(container.textContent).toBe('')
    expect(container.querySelector('text')).toBeNull()
    // And the numbers really are still there.
    expect(container.querySelectorAll('path[stroke="var(--p-on-dark)"]')).toHaveLength(2)
  })

  it('never names a square that would give the answer away', () => {
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('ramps by size, and asks for more thinking as it goes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.config.walls)).toEqual([7, 9, 13])
    const floors = levels.map((l) => l.config.minRounds)
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
    // Seven wide is where the grid still leaves a 44px square on a phone.
    for (const level of levels) expect(level.config.n).toBeLessThanOrEqual(7)
  })

  /**
   * The ramp, stated as a number rather than a feeling. On the first level
   * most of the answer falls out of a wall's count; by the third, half of it
   * has to come from a square nothing else could light.
   */
  it('leans on the numbers first and on the dark corners later', () => {
    const share = levels.map((level) => {
      let byWall = 0
      let byDark = 0
      for (const seed of SEEDS.slice(0, 20)) {
        const state = start(level, seed)
        const reasoned = solveByLogic(state.n, state.walls) as { byWall: number; byDark: number }
        byWall += reasoned.byWall
        byDark += reasoned.byDark
      }
      return byDark / (byWall + byDark)
    })
    expect(share[0]).toBeLessThan(share[2])
    expect(share[0]).toBeLessThan(0.5)
  })
})
