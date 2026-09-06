import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { underSettings } from '../../test/settings'
import { makeRng, randInt } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { countingPath } from './index'
import { Board } from './Board'
import type { Deduction, PathAction, PathConfig, PathState } from './logic'
import {
  blankCount,
  cellOf,
  colOf,
  countSolutions,
  deal,
  defaultChoice,
  describeMove,
  dig,
  fits,
  filledCount,
  init,
  isSolved,
  legalMoves,
  orthogonal,
  penOf,
  randomPath,
  reduce,
  refusalOf,
  rowOf,
  solutions,
  solveByLogic,
  touches,
} from './logic'

const levels = countingPath.levels as PuzzleLevel<PathConfig>[]
const start = (level: PuzzleLevel<PathConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/** The one way the chain can run, as one square a number. */
const answerFor = (level: PuzzleLevel<PathConfig>, state: PathState) =>
  (solveByLogic(state.n, state.givens, level.config.reach) as Deduction).path

/**
 * The witness that `par` is reachable: write 2, 3, 4 … in order, skipping the
 * printed ones. Every number's predecessor is already on the board when its
 * turn comes, so nothing here leans on the reducer being clever.
 */
const ascending = (level: PuzzleLevel<PathConfig>, state: PathState): PathAction[] => {
  const answer = answerFor(level, state)
  const out: PathAction[] = []
  for (let v = 2; v <= state.n * state.n; v++) {
    if (state.givens[answer[v - 1]] === 0) out.push({ type: 'write', index: answer[v - 1], value: v })
  }
  return out
}

const play = (state: PathState, actions: PathAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, givens: printed, reach } = level.config

    it(`"${level.label}" prints exactly ${printed} numbers, both ends among them, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.givens).toHaveLength(n * n)
        expect(state.cells).toEqual(state.givens)
        const on = state.givens.filter((v) => v !== 0)
        expect(on).toHaveLength(printed)
        expect(new Set(on).size).toBe(printed)
        for (const v of on) expect(v).toBeGreaterThanOrEqual(1)
        for (const v of on) expect(v).toBeLessThanOrEqual(n * n)
        // 1 and n*n are never rubbed out, so a child always has both ends of
        // the chain to work from — and `solutions` always has a place to start.
        expect(on).toContain(1)
        expect(on).toContain(n * n)
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        expect(countSolutions(n, start(level, seed).givens, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // The fallbacks in `deal` are for a run of luck the tests have never
        // seen: every seed lands on a board that suits the level.
        expect(fits(level.config, state.givens)).toBe(true)
        const reasoned = solveByLogic(n, state.givens, reach) as Deduction
        expect(reasoned).not.toBeNull()
        expect(reasoned.rounds).toBeGreaterThanOrEqual(level.config.minRounds)
        expect(reasoned.rounds).toBeLessThanOrEqual(level.config.maxRounds)
        // The board it reasoned out really is a chain over every square.
        expect(new Set(reasoned.path).size).toBe(n * n)
        for (let v = 2; v <= n * n; v++) {
          expect(touches(n, reasoned.path[v - 2], reasoned.path[v - 1])).toBe(true)
        }
      }
    })

    it(`"${level.label}" starts unsolved, with par squares to fill`, () => {
      const state = start(level, 5)
      expect(isSolved(state)).toBe(false)
      expect(blankCount(state)).toBe(level.par)
      expect(filledCount(state)).toBe(printed)
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(start(level, 12).givens).toEqual(start(level, 12).givens)
      expect(start(level, 12).givens).not.toEqual(start(level, 13).givens)
    })
  }

  it('does not print the same numbers in the same places every time', () => {
    const seen = new Set(SEEDS.map((seed) => start(levels[0], seed).givens.join(',')))
    expect(seen.size).toBeGreaterThan(50)
  })
})

describe('the rules', () => {
  it('counts up, down, left and right as touching, and nothing else', () => {
    // Row-major on a 4x4: cell 5 is row 2, column 2.
    expect(touches(4, 5, 1)).toBe(true)
    expect(touches(4, 5, 9)).toBe(true)
    expect(touches(4, 5, 4)).toBe(true)
    expect(touches(4, 5, 6)).toBe(true)
    // Corner to corner is not touching here. It is in the garden, and that is
    // the one meaning the collection keeps for it.
    expect(touches(4, 5, 0)).toBe(false)
    expect(touches(4, 5, 10)).toBe(false)
    // Two apart, and a square against itself.
    expect(touches(4, 5, 7)).toBe(false)
    expect(touches(4, 5, 5)).toBe(false)
    // The right-hand edge does not wrap round onto the next row.
    expect(touches(4, 3, 4)).toBe(false)
  })

  it('lists the squares beside one, and never steps off the board', () => {
    expect(orthogonal(4, 0).sort((a, b) => a - b)).toEqual([1, 4])
    expect(orthogonal(4, 5).sort((a, b) => a - b)).toEqual([1, 4, 6, 9])
    expect(orthogonal(4, 15).sort((a, b) => a - b)).toEqual([11, 14])
    expect(orthogonal(4, 3).sort((a, b) => a - b)).toEqual([2, 7])
    for (let i = 0; i < 36; i++) {
      for (const nb of orthogonal(6, i)) expect(touches(6, i, nb)).toBe(true)
    }
  })

  it('finds where each number is, and answers for the ends of the chain', () => {
    const at = cellOf(4, [0, 3, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(at[1]).toBe(3)
    expect(at[2]).toBe(6)
    expect(at[3]).toBe(1)
    expect(at[4]).toBe(-1)
    // Two slots longer than the grid, so `at[0]` and `at[17]` need no guard.
    expect(at[0]).toBe(-1)
    expect(at[17]).toBe(-1)
  })

  it('reads how much is left and how much is down', () => {
    const state: PathState = { n: 4, givens: new Array(16).fill(0), cells: new Array(16).fill(0) }
    state.givens[0] = 1
    state.cells[0] = 1
    expect(blankCount(state)).toBe(15)
    expect(filledCount(state)).toBe(1)
  })
})

/* A hand-built board, so every test below names the rule it is about rather
   than hunting for a square in a dealt one. Four by four with 1, 4 and 16
   printed, and deliberately loose: it is here for the rules and the pen, not
   for the reasoning, so nothing below leans on it having one answer. */
const HAND: PathState = {
  n: 4,
  givens: [1, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0],
  cells: [1, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0],
}

describe('reduce', () => {
  it('writes a number beside the one before it, and rubs it out again', () => {
    const wrote = reduce(HAND, { type: 'write', index: 1, value: 2 })
    expect(wrote).not.toBe(HAND)
    expect(wrote.cells[1]).toBe(2)
    // The printed numbers are passed straight through, never copied: that is
    // what makes them a stable token for the board's own selection state.
    expect(wrote.givens).toBe(HAND.givens)
    expect(HAND.cells[1]).toBe(0)
    const rubbed = reduce(wrote, { type: 'rub', index: 1 })
    expect(rubbed).not.toBe(wrote)
    expect(rubbed.cells).toEqual(HAND.cells)
  })

  it('grows the chain from either end of a number', () => {
    // 3 goes beside 4, counting down, exactly as 5 would count up.
    expect(reduce(HAND, { type: 'write', index: 2, value: 3 }).cells[2]).toBe(3)
    expect(reduce(HAND, { type: 'write', index: 7, value: 5 }).cells[7]).toBe(5)
  })

  it('hands back the very same state for an action that is not one', () => {
    expect(reduce(HAND, { type: 'nudge' } as unknown as PathAction)).toBe(HAND)
  })

  it('hands back the very same state when the square is not a square', () => {
    expect(reduce(HAND, { type: 'write', index: -1, value: 2 })).toBe(HAND)
    expect(reduce(HAND, { type: 'write', index: 16, value: 2 })).toBe(HAND)
    expect(reduce(HAND, { type: 'write', index: 1.5, value: 2 })).toBe(HAND)
    expect(reduce(HAND, { type: 'rub', index: -1 })).toBe(HAND)
    expect(reduce(HAND, { type: 'rub', index: 16 })).toBe(HAND)
    expect(reduce(HAND, { type: 'rub', index: 1.5 })).toBe(HAND)
  })

  it('hands back the very same state when the number is not a number on this board', () => {
    expect(reduce(HAND, { type: 'write', index: 1, value: 0 })).toBe(HAND)
    expect(reduce(HAND, { type: 'write', index: 1, value: 17 })).toBe(HAND)
    expect(reduce(HAND, { type: 'write', index: 1, value: 2.5 })).toBe(HAND)
  })

  it('will not change a printed number, or write over one already there', () => {
    expect(reduce(HAND, { type: 'write', index: 0, value: 2 })).toBe(HAND)
    expect(reduce(HAND, { type: 'rub', index: 0 })).toBe(HAND)
    const wrote = reduce(HAND, { type: 'write', index: 1, value: 2 })
    expect(reduce(wrote, { type: 'write', index: 1, value: 3 })).toBe(wrote)
  })

  it('will not write a number that is already on the board', () => {
    expect(reduce(HAND, { type: 'write', index: 1, value: 1 })).toBe(HAND)
    expect(reduce(HAND, { type: 'write', index: 1, value: 4 })).toBe(HAND)
  })

  it('will not write a number that misses the one before it', () => {
    // 2 belongs beside 1, and 1 is in the corner: row 2, column 2 misses it.
    expect(reduce(HAND, { type: 'write', index: 5, value: 2 })).toBe(HAND)
    const five = reduce(HAND, { type: 'write', index: 7, value: 5 })
    expect(five.cells[7]).toBe(5)
    // 6 belongs beside 5, and row 2, column 1 is right across the board.
    expect(reduce(five, { type: 'write', index: 4, value: 6 })).toBe(five)
  })

  it('will not write a number that misses the one after it', () => {
    // 3 goes beside the printed 4. Now 2 has to reach both 1 and 3, and row 2,
    // column 3 reaches 3 alone.
    const three = reduce(HAND, { type: 'write', index: 2, value: 3 })
    expect(three.cells[2]).toBe(3)
    expect(touches(4, 6, 2)).toBe(true)
    expect(reduce(three, { type: 'write', index: 6, value: 2 })).toBe(three)
    expect(reduce(three, { type: 'write', index: 1, value: 2 }).cells[1]).toBe(2)
  })

  it('will not start a number in mid-air, away from every number on the board', () => {
    // 9 breaks nothing a child would say out loud, and it is still not a move:
    // a write always grows the chain out of a number that is already down.
    expect(reduce(HAND, { type: 'write', index: 9, value: 9 })).toBe(HAND)
  })

  it('will not rub out an empty square', () => {
    expect(reduce(HAND, { type: 'rub', index: 5 })).toBe(HAND)
  })

  it('offers exactly the actions that change something', () => {
    for (const level of levels.slice(0, 2)) {
      let state = start(level, 3)
      const size = state.n * state.n
      for (let step = 0; step < 6; step++) {
        const legal = new Set(
          legalMoves(state).map((a) => (a.type === 'rub' ? `r${a.index}` : `w${a.index}:${a.value}`)),
        )
        for (let index = 0; index < size; index++) {
          expect(legal.has(`r${index}`)).toBe(
            reduce(state, { type: 'rub', index }) !== state,
          )
          for (let value = 1; value <= size; value++) {
            expect(legal.has(`w${index}:${value}`)).toBe(
              reduce(state, { type: 'write', index, value }) !== state,
            )
          }
        }
        const moves = legalMoves(state)
        state = reduce(state, moves[randInt(makeRng(step + 1), moves.length)])
      }
    }
  })
})

describe('isSolved', () => {
  for (const level of levels) {
    it(`"${level.label}" is solved once the ascending witness has been played`, () => {
      for (const seed of SEEDS.slice(0, 20)) {
        const first = start(level, seed)
        const done = play(first, ascending(level, first))
        expect(isSolved(done)).toBe(true)
        expect(blankCount(done)).toBe(0)
      }
    })
  }

  it('will not call a board solved while one square is still empty', () => {
    const first = start(levels[0], 21)
    const short = play(first, ascending(levels[0], first).slice(0, -1))
    expect(blankCount(short)).toBe(1)
    expect(isSolved(short)).toBe(false)
  })

  it('agrees with the reducer over a long random walk', () => {
    // `reduce` refuses any write that misses the number before or after it, so
    // a full board is always a solved board. This holds the claim to the
    // printed rule rather than to the guard that makes it true.
    const rng = makeRng(414)
    for (const level of levels) {
      let state = start(level, 9)
      for (let k = 0; k < 900; k++) {
        expect(isSolved(state)).toBe(blankCount(state) === 0)
        const moves = legalMoves(state)
        if (moves.length === 0) break
        state = reduce(state, moves[randInt(rng, moves.length)])
      }
    }
  })
})

describe('the pen', () => {
  it('starts at the lowest number whose next number is missing', () => {
    expect(defaultChoice(HAND)).toEqual({ anchor: 0, way: 1 })
    const pen = penOf(HAND, null)
    expect(pen).toEqual({ anchor: 0, from: 1, way: 1, value: 2, canTurn: false })
  })

  it('counts down when there is nothing above to count up to', () => {
    // 4 is printed with 3 and 5 both missing, so the pen can go either way.
    const four = penOf(HAND, { anchor: 3, way: 1 })
    expect(four).toEqual({ anchor: 3, from: 4, way: 1, value: 5, canTurn: true })
    expect(penOf(HAND, { anchor: 3, way: -1 }).value).toBe(3)
    // 16 is the top of the chain, so the pen can only count down from it.
    const top = penOf(HAND, { anchor: 12, way: 1 })
    expect(top).toEqual({ anchor: 12, from: 16, way: -1, value: 15, canTurn: false })
  })

  it('has nothing to write when both sides of the anchor are already down', () => {
    const both = play(HAND, [
      { type: 'write', index: 2, value: 3 },
      { type: 'write', index: 7, value: 5 },
    ])
    expect(penOf(both, { anchor: 3, way: 1 })).toEqual({
      anchor: 3,
      from: 4,
      way: 1,
      value: null,
      canTurn: false,
    })
  })

  it('repairs an anchor that a rewind has emptied', () => {
    const wrote = reduce(HAND, { type: 'write', index: 1, value: 2 })
    expect(penOf(wrote, { anchor: 1, way: 1 }).anchor).toBe(1)
    // Step back, and the square the pen was on is empty again. It goes to
    // wherever it would have started, rather than pointing at nothing.
    expect(penOf(HAND, { anchor: 1, way: 1 }).anchor).toBe(0)
    expect(penOf(HAND, { anchor: -1, way: 1 }).anchor).toBe(0)
    expect(penOf(HAND, { anchor: 99, way: 1 }).anchor).toBe(0)
  })

  it('always points at a square with a number on it, whatever it is handed', () => {
    const rng = makeRng(3131)
    for (const level of levels) {
      let state = start(level, 4)
      const size = state.n * state.n
      for (let k = 0; k < 400; k++) {
        for (const way of [1, -1] as const) {
          const pen = penOf(state, { anchor: randInt(rng, size), way })
          expect(state.cells[pen.anchor]).toBeGreaterThan(0)
          expect(pen.from).toBe(state.cells[pen.anchor])
          if (pen.value !== null) {
            expect(pen.value).toBe(pen.from + pen.way)
            expect(state.cells).not.toContain(pen.value)
          }
        }
        const moves = legalMoves(state)
        if (moves.length === 0) break
        state = reduce(state, moves[randInt(rng, moves.length)])
      }
    }
  })

  it('never offers a number the reducer would throw away for being a repeat', () => {
    const rng = makeRng(5150)
    for (const level of levels) {
      let state = start(level, 8)
      for (let k = 0; k < 200; k++) {
        const pen = penOf(state, defaultChoice(state))
        if (pen.value !== null) {
          for (let index = 0; index < state.n * state.n; index++) {
            if (state.cells[index] !== 0) continue
            const no = refusalOf(state, index, pen.value, pen.from)
            // The board can only ever produce the adjacency refusal.
            expect(no?.message ?? '').not.toMatch(/already/)
          }
        }
        const moves = legalMoves(state)
        if (moves.length === 0) break
        state = reduce(state, moves[randInt(rng, moves.length)])
      }
    }
  })
})

describe('the refusal', () => {
  it('draws the number where the child put it, and says what it misses', () => {
    const no = refusalOf(HAND, 5, 2, 1)
    expect(no?.message).toBe('2 has to touch 1.')
    expect(no?.where).toBe('5')
    expect(no?.pretend.cells[5]).toBe(2)
    // Worked out without touching what it was handed, and never a position the
    // engine itself would make.
    expect(HAND.cells[5]).toBe(0)
    expect(reduce(HAND, { type: 'write', index: 5, value: 2 })).toBe(HAND)
  })

  it('names the number the pen was growing from when both ends are missed', () => {
    const both = reduce(HAND, { type: 'write', index: 2, value: 3 })
    // 2 has to touch 1 (row 1, column 1) and 3 (row 1, column 3). Row 3,
    // column 3 misses both of them.
    expect(refusalOf(both, 10, 2, 1)?.message).toBe('2 has to touch 1.')
    expect(refusalOf(both, 10, 2, 3)?.message).toBe('2 has to touch 3.')
  })

  it('answers for a repeat too, so the function is total', () => {
    expect(refusalOf(HAND, 1, 4)?.message).toBe('There is already a 4 on the board.')
  })

  it('says nothing about a move that changes nothing', () => {
    expect(refusalOf(HAND, 0, 2)).toBeNull()
    expect(refusalOf(HAND, -1, 2)).toBeNull()
    expect(refusalOf(HAND, 1, 0)).toBeNull()
    expect(refusalOf(HAND, 1, 99)).toBeNull()
    // Mid-air breaks no rule, so there is nothing to say about it either. The
    // board never offers it: the pen is always anchor plus or minus one.
    expect(refusalOf(HAND, 9, 9)).toBeNull()
  })

  it('fires exactly when the adjacency rule is what stopped the write', () => {
    for (const level of levels.slice(0, 2)) {
      const state = start(level, 17)
      const size = state.n * state.n
      for (let index = 0; index < size; index++) {
        for (let value = 1; value <= size; value++) {
          const no = refusalOf(state, index, value)
          const stopped = reduce(state, { type: 'write', index, value }) === state
          if (no !== null) {
            expect(stopped).toBe(true)
            expect(no.pretend.cells[index]).toBe(value)
            expect(no.pretend).not.toBe(state)
          }
        }
      }
    }
  })
})

describe('describe', () => {
  it('names the square and the number, in the past tense', () => {
    expect(describeMove(HAND, HAND, { type: 'write', index: 6, value: 5 })).toBe(
      'Wrote 5 in row 2, column 3',
    )
    expect(describeMove(HAND, HAND, { type: 'rub', index: 6 })).toBe('Rubbed out row 2, column 3')
  })

  it('names the square the move actually changed, for every move', () => {
    const state = start(levels[1], 44)
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      const changed = next.cells.findIndex((v, i) => v !== state.cells[i])
      expect(describeMove(state, next, action)).toContain(
        `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
      )
    }
  })
})

/* ------------------------------------------------------------------
   par

   `par` is the number of empty squares, and it is *proved* rather
   than searched for, because the search is only possible at the
   smallest size.

   The lemma: a write fills exactly one empty square, a rub empties
   exactly one, and every other action hands the same state back. A
   solved board has no empty square. So any sequence that solves the
   board has writes minus rubs equal to the blanks, hence is at least
   that long, with equality only when it holds no rub.

   The witness: the ascending replay above, which is that length and
   really solves it. Lemma plus witness is exact, for every level and
   every seed.

   The search corroborates it at level 1, where the completable
   states are exactly the subsets of the answer's nine blanks — 2^9,
   comfortably inside the cap. Level 2 has 2^16 of them and about 650
   actions a state, and level 3 has 2^25, so neither is searched, and
   that is arithmetic rather than an oversight.
   ------------------------------------------------------------------ */
describe('par', () => {
  it('is the number of empty squares, for every level and every seed', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.n * level.config.n - level.config.givens)
      for (const seed of SEEDS) expect(blankCount(start(level, seed))).toBe(level.par)
    }
  })

  it('changes the number of filled squares by exactly one, or by none at all', () => {
    const rng = makeRng(2718)
    for (const level of levels) {
      let state = start(level, 6)
      const size = state.n * state.n
      for (let k = 0; k < 1700; k++) {
        // Half of them drawn from the honest cross-product, so the no-ops are
        // tested as hard as the moves; half from the moves, so the walk gets
        // somewhere.
        const moves = legalMoves(state)
        const action: PathAction =
          rng() < 0.5 && moves.length > 0
            ? moves[randInt(rng, moves.length)]
            : rng() < 0.7
              ? { type: 'write', index: randInt(rng, size), value: 1 + randInt(rng, size) }
              : { type: 'rub', index: randInt(rng, size) }
        const next = reduce(state, action)
        expect(next.givens).toBe(state.givens)
        if (next === state) expect(filledCount(next)).toBe(filledCount(state))
        else expect(Math.abs(filledCount(next) - filledCount(state))).toBe(1)
        state = next
      }
    }
  })

  for (const level of levels) {
    it(`"${level.label}" is solved by exactly ${level.par} writes and no rub, every seed`, () => {
      for (const seed of SEEDS) {
        const first = start(level, seed)
        const plan = ascending(level, first)
        expect(plan).toHaveLength(level.par as number)
        expect(plan.every((a) => a.type === 'write')).toBe(true)
        const done = plan.reduce((cur, action) => {
          const next = reduce(cur, action)
          expect(next, `${JSON.stringify(action)} was rejected`).not.toBe(cur)
          return next
        }, first)
        expect(isSolved(done)).toBe(true)
      }
    })
  }

  it('has no shorter path than par under breadth-first search', () => {
    const level = levels[0]
    const size = level.config.n * level.config.n
    /** Every write and every rub, legal or not: the search filters by `reduce` alone. */
    const all: PathAction[] = []
    for (let index = 0; index < size; index++) {
      for (let value = 1; value <= size; value++) all.push({ type: 'write', index, value })
      all.push({ type: 'rub', index })
    }
    for (const seed of SEEDS.slice(0, 2)) {
      const path = shortestSolution<PathState, PathAction>({
        start: start(level, seed),
        moves: () => all,
        apply: reduce,
        key: (s) => s.cells.join(','),
        solved: isSolved,
        // A board that can no longer be finished is never on a shortest path,
        // and pruning those is what keeps the graph walkable: what is left is
        // exactly the subsets of the one answer's blanks.
        invalid: (s) => countSolutions(s.n, s.cells, 1) === 0,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(level.par as number)
    }
  })
})

describe('the solver', () => {
  it('finds the answer the board was built round', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 20)) {
        const state = start(level, seed)
        const reasoned = solveByLogic(state.n, state.givens, level.config.reach) as Deduction
        const only = solutions(state.n, state.givens, 2)
        expect(only).toHaveLength(1)
        expect(reasoned.path).toEqual(only[0])
      }
    }
  })

  /**
   * The claim the whole generator rests on: a board it can finish is a board
   * with one answer. Boards with numbers taken out at random are mostly not
   * like that, which is what makes them worth testing against.
   */
  it('never finishes a board that has two answers', () => {
    const rng = makeRng(2024)
    let loose = 0
    let finished = 0
    for (let k = 0; k < 120; k++) {
      const path = randomPath(rng, 5)
      const givens = new Array<number>(25).fill(0)
      path.forEach((cell, i) => {
        givens[cell] = i + 1
      })
      // Seven numbers left, chosen with no help from the solver at all.
      const rubbed = [...path.slice(1, 24)].sort(() => rng() - 0.5).slice(0, 18)
      for (const cell of rubbed) givens[cell] = 0
      const count = countSolutions(5, givens, 2)
      const reasoned = solveByLogic(5, givens, 3)
      if (count > 1) {
        loose++
        expect(reasoned).toBeNull()
      }
      if (reasoned !== null) {
        finished++
        expect(count).toBe(1)
      }
    }
    // Both outcomes really happen, so neither expectation above is vacuous.
    expect(loose).toBeGreaterThan(10)
    expect(finished).toBeGreaterThan(10)
  })

  it('gives up rather than guessing', () => {
    // A 4x4 with nothing on it but the two ends of the chain. There are
    // several ways round, so there is nothing to work out with certainty.
    const open = new Array<number>(16).fill(0)
    open[0] = 1
    open[3] = 16
    expect(countSolutions(4, open, 3)).toBeGreaterThan(1)
    for (const reach of [1, 2, 3, 4]) expect(solveByLogic(4, open, reach)).toBeNull()
  })

  it('says nothing about a clue grid that is not a board', () => {
    const twice = new Array<number>(16).fill(0)
    twice[0] = 3
    twice[5] = 3
    expect(solveByLogic(4, twice, 2)).toBeNull()
    // Two printed numbers in a row that do not touch: no chain can join them.
    const apart = new Array<number>(16).fill(0)
    apart[0] = 5
    apart[10] = 6
    expect(solveByLogic(4, apart, 2)).toBeNull()
    expect(solveByLogic(4, new Array<number>(9).fill(0), 2)).toBeNull()
  })

  it('reaches further when it is allowed to, and never further than that', () => {
    // A corridor argument the placed-neighbour rule alone cannot make: with a
    // wider reach the same board comes out, with a narrow one it does not.
    const rng = makeRng(606)
    let onlyWide = 0
    for (let k = 0; k < 60; k++) {
      const path = randomPath(rng, 5)
      const board = dig(rng, 5, path, 9, 3)
      if (board === null) continue
      if (solveByLogic(5, board, 1) === null) onlyWide++
      // Whatever a narrow reach can prove, a wide one can prove too.
      if (solveByLogic(5, board, 1) !== null) expect(solveByLogic(5, board, 3)).not.toBeNull()
    }
    expect(onlyWide).toBeGreaterThan(5)
  })
})

describe('drawing the chain and taking it apart', () => {
  it('draws a chain over every square, every time', () => {
    const rng = makeRng(4004)
    for (const n of [4, 5, 6]) {
      for (let k = 0; k < 40; k++) {
        const path = randomPath(rng, n)
        expect(path).toHaveLength(n * n)
        expect(new Set(path).size).toBe(n * n)
        for (let i = 1; i < path.length; i++) expect(touches(n, path[i - 1], path[i])).toBe(true)
      }
    }
  })

  it('draws a different chain from one seed to the next', () => {
    const keys = new Set(
      Array.from({ length: 20 }, (_, i) => randomPath(makeRng(700 + i), 5).join(',')),
    )
    expect(keys.size).toBe(20)
  })

  it('never rubs out either end of the chain, and always hits its target', () => {
    const rng = makeRng(5005)
    for (let k = 0; k < 30; k++) {
      const path = randomPath(rng, 5)
      const board = dig(rng, 5, path, 9, 3)
      if (board === null) continue
      expect(board.filter((v) => v !== 0)).toHaveLength(9)
      expect(board[path[0]]).toBe(1)
      expect(board[path[24]]).toBe(25)
      // Digging only ever keeps a blank the solver can reason around.
      expect(solveByLogic(5, board, 3)).not.toBeNull()
    }
  })

  it('deals a board for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })
})

/* ------------------------------------------------------------------
   No dead end, and why not

   A number that touches the one before it and has not been used
   breaks no rule, and it can still leave a square nothing will ever
   reach. There is no `failure()` for it, and that is a decision:
   saying so would mean running the solver, and running the solver
   would hand the child the reasoning they came for. The rubber and
   the shell's Step back are the way out, and both are one move.
   ------------------------------------------------------------------ */
describe('a legal number that strands the board', () => {
  const stranded = () => {
    const state = start(levels[0], 11)
    for (const move of legalMoves(state)) {
      if (move.type !== 'write') continue
      const next = reduce(state, move)
      if (countSolutions(next.n, next.cells, 1) === 0) return { state, move, next }
    }
    throw new Error('no legal write strands this board')
  }

  it('is a real move that the rules take', () => {
    const { state, move, next } = stranded()
    expect(next).not.toBe(state)
    expect(refusalOf(state, move.index, (move as { value: number }).value)).toBeNull()
    expect(isSolved(next)).toBe(false)
  })

  it('is not a dead end the shell locks the board for', () => {
    // frog-leap has a `failure()` because its dead end is total and decidable
    // without doing the puzzle. This one is neither, so the board stays quiet.
    expect(countingPath.engine.failure).toBeUndefined()
  })

  it('is one rub away from where it was', () => {
    const { state, move, next } = stranded()
    const back = reduce(next, { type: 'rub', index: move.index })
    expect(back.cells).toEqual(state.cells)
    expect(countSolutions(back.n, back.cells, 1)).toBe(1)
  })
})

describe('the board', () => {
  const draw = (state: PathState, locked = false) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }), {
      wrapper: underSettings(),
    })
    return { dispatch, view }
  }

  const square = (index: number, n = 4) =>
    screen.getByRole('button', {
      name: new RegExp(`^Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1},`),
    })

  const status = () => screen.getByRole('status').textContent
  const note = () => document.querySelector('p[class*="note"]')?.textContent

  /** The board with a real state behind it, so a run of taps can be watched. */
  const Play = ({ from }: { from: PathState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: PathAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  it('draws a pressable square for every square on the grid', () => {
    const { view } = draw(HAND)
    const squares = view.container.querySelectorAll('[aria-label^="Row "]')
    expect(squares).toHaveLength(16)
    for (const tile of squares) {
      expect(tile).toHaveAttribute('type', 'button')
      expect(tile.className).toContain('u-press')
    }
    expect(square(0).getAttribute('aria-label')).toBe(
      'Row 1, column 1, 1, printed, the pen is here',
    )
    expect(square(1).getAttribute('aria-label')).toBe('Row 1, column 2, empty')
    expect(square(3).getAttribute('aria-label')).toBe('Row 1, column 4, 4, printed')
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = draw(HAND)
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|move|solved|par/i)
  })

  it('sends exactly one action for one tap on an empty square', () => {
    const { dispatch } = draw(HAND)
    fireEvent.click(square(1))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'write', index: 1, value: 2 })
  })

  it('sends nothing at all for a tap that only picks the pen up', () => {
    const { dispatch } = draw(HAND)
    fireEvent.click(square(3))
    expect(dispatch).not.toHaveBeenCalled()
    expect(square(3).getAttribute('aria-label')).toMatch(/, the pen is here$/)
    expect(screen.getByRole('button', { name: /^Writing 5/ })).toBeInTheDocument()
  })

  it('turns the pen round without sending anything', () => {
    const { dispatch } = draw(HAND)
    fireEvent.click(square(3))
    fireEvent.click(screen.getByRole('button', { name: /^Writing 5/ }))
    expect(dispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^Writing 3/ })).toBeInTheDocument()
    // And the turned pen is what the next tap writes.
    fireEvent.click(square(2))
    expect(dispatch).toHaveBeenCalledWith({ type: 'write', index: 2, value: 3 })
  })

  it('walks the pen on, so a run of numbers is one tap each', () => {
    render(createElement(Play, { from: HAND }), { wrapper: underSettings() })
    fireEvent.click(square(1))
    fireEvent.click(square(2))
    expect(square(1).getAttribute('aria-label')).toBe('Row 1, column 2, 2')
    expect(square(2).getAttribute('aria-label')).toBe('Row 1, column 3, 3, the pen is here')
  })

  it('leaves the pen chip dead when there is only one way to count', () => {
    draw(HAND)
    // 1 is the bottom of the chain, so there is nothing to turn round.
    expect(screen.getByRole('button', { name: 'Writing 2.' })).toBeDisabled()
  })

  const rubber = () => screen.getByText('Rub out').closest('button') as HTMLButtonElement

  it('rubs out the square the pen is on, and never a printed one', () => {
    const { dispatch } = draw(reduce(HAND, { type: 'write', index: 1, value: 2 }))
    // The pen falls to 2, which the player wrote, so the rubber is live.
    expect(rubber()).not.toHaveAttribute('aria-disabled')
    expect(rubber()).toHaveAttribute('aria-label', 'Rub out 2')
    fireEvent.click(rubber())
    expect(dispatch).toHaveBeenCalledWith({ type: 'rub', index: 1 })

    cleanup()
    const bare = draw(HAND)
    // Nothing but printed numbers on the board, so there is nothing to rub —
    // and the button stays put rather than vanishing under a finger.
    expect(rubber()).toHaveAttribute('aria-disabled', 'true')
    expect(rubber()).toBeEnabled()
    expect(rubber()).toHaveAttribute('aria-label', '1 is printed and cannot be rubbed out.')
    fireEvent.click(rubber())
    expect(bare.dispatch).not.toHaveBeenCalled()
  })

  it('draws the chain between two numbers in a row, and nowhere else', () => {
    const { view } = draw(play(HAND, [{ type: 'write', index: 1, value: 2 }]))
    const links = view.container.querySelectorAll('[class*="link"]')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('data-dir', 'right')
    // 1 and 4 are both printed and both on the top row, but they are not two
    // numbers in a row, so nothing joins them.
    expect(draw(HAND).view.container.querySelectorAll('[class*="link"]')).toHaveLength(0)
  })

  it('counts what is still empty', () => {
    render(createElement(Play, { from: HAND }), { wrapper: underSettings() })
    expect(note()).toBe('13 squares still need a number.')
    fireEvent.click(square(1))
    expect(note()).toBe('12 squares still need a number.')
  })

  it('says so when the pen has nowhere left to write', () => {
    const boxed = play(HAND, [
      { type: 'write', index: 2, value: 3 },
      { type: 'write', index: 7, value: 5 },
    ])
    render(createElement(Play, { from: boxed }), { wrapper: underSettings() })
    fireEvent.click(square(3))
    expect(note()).toBe('3 and 5 are both on the board. Tap another number to start from.')
    expect(screen.getByRole('button', { name: /both on the board/ })).toBeDisabled()
  })

  it('walks the arrow keys from square to square, and keeps one tab stop', () => {
    draw(HAND)
    const cell = square(0)
    cell.focus()
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    const moved = document.activeElement as HTMLElement
    expect(moved).toBe(square(1))
    const stops = [...document.querySelectorAll('[aria-label^="Row "]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toEqual([moved])
    // And it stops at the edge rather than wrapping round to the next row.
    fireEvent.keyDown(moved, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(moved)
  })

  it('turns the pen with the plus and minus keys', () => {
    const { dispatch } = draw(HAND)
    fireEvent.click(square(3))
    const cell = square(3)
    expect(screen.getByRole('button', { name: /^Writing 5/ })).toBeInTheDocument()
    fireEvent.keyDown(cell, { key: '-' })
    expect(screen.getByRole('button', { name: /^Writing 3/ })).toBeInTheDocument()
    fireEvent.keyDown(cell, { key: '+' })
    expect(screen.getByRole('button', { name: /^Writing 5/ })).toBeInTheDocument()
    // Turning the pen is selection, and backspace over a printed number is
    // nothing happening. Neither reaches the shell.
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rubs the square the pen is on with backspace', () => {
    const { dispatch } = draw(reduce(HAND, { type: 'write', index: 1, value: 2 }))
    fireEvent.keyDown(square(1), { key: 'Backspace' })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'rub', index: 1 })
  })

  it('ignores every input while it is locked', () => {
    const { dispatch, view } = draw(HAND, true)
    const cell = square(0)
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(status()).toBe('')
    expect(view.container.textContent).not.toMatch(/still needs?/)
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = play(HAND, [{ type: 'write', index: 1, value: 2 }])
    const first = draw(state).view.container.innerHTML
    cleanup()
    expect(draw(state).view.container.innerHTML).toBe(first)
  })

  it('draws a solved board without a word of celebration', () => {
    const first = start(levels[0], 21)
    const done = play(first, ascending(levels[0], first))
    draw(done, true)
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(status()).toBe('')
  })
})

describe('a number the board will not keep', () => {
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

  const square = (index: number) =>
    screen.getByRole('button', {
      name: new RegExp(`^Row ${rowOf(4, index) + 1}, column ${colOf(4, index) + 1},`),
    })

  const show = (settings?: { allowForbiddenMoves: boolean }) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state: HAND, dispatch, locked: false }), {
      wrapper: underSettings(settings),
    })
    return { dispatch, view }
  }

  it('looks exactly like a square that will take it', () => {
    show()
    // Row 2, column 2 is nowhere near the 1 in the corner, and it still offers
    // to take the 2 — so which squares are legal stays the child's to work out.
    expect(square(5)).toBeEnabled()
  })

  it('writes it where the child put it, says no, and rubs it out again', () => {
    const { dispatch, view } = show()
    fireEvent.click(square(5))

    expect(square(5).getAttribute('aria-label')).toBe('Row 2, column 2, 2')
    expect(square(5).className).toContain('flash')
    expect(screen.getByRole('status')).toHaveTextContent('2 has to touch 1.')
    expect(view.container.textContent).toContain('2 has to touch 1.')

    runCue()
    expect(square(5).getAttribute('aria-label')).toBe('Row 2, column 2, empty')
    expect(square(5).className).not.toContain('flash')
    // Nothing reached the shell, so nothing reached the history, the move tape
    // or the solved check.
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('takes no second tap while it is putting the first one back', () => {
    const { dispatch } = show()
    fireEvent.click(square(5))
    fireEvent.click(square(1))
    expect(dispatch).not.toHaveBeenCalled()

    runCue()
    fireEvent.click(square(1))
    expect(dispatch).toHaveBeenCalledWith({ type: 'write', index: 1, value: 2 })
  })

  it('goes back to a dead square once forbidden moves are turned off', () => {
    const { dispatch } = show({ allowForbiddenMoves: false })
    expect(square(5)).toBeDisabled()
    expect(square(1)).toBeEnabled()
    fireEvent.click(square(5))
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(countingPath.id).toBe('counting-path')
    expect(countingPath.reseedable).toBe(true)
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(levels.map((l) => l.id)).toEqual([
      'sixteen-squares',
      'twenty-five-squares',
      'thirty-six-squares',
    ])
    expect(levels.map((l) => l.par)).toEqual([9, 16, 25])
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    expect(countingPath.instructions.length).toBeGreaterThanOrEqual(2)
    expect(countingPath.instructions.length).toBeLessThanOrEqual(4)
    for (const line of countingPath.instructions) expect(line.length).toBeLessThanOrEqual(80)
    const lines = [countingPath.tagline, ...countingPath.instructions, ...levels.flatMap((l) => l.hints)]
    for (const line of lines) {
      expect(line).toMatch(/[.]$/)
      expect(line).not.toMatch(/!/)
      expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
    }
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(140)
    }
  })

  it('never names a square that would give the answer away', () => {
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('ramps by size, and asks for more thinking as it goes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([4, 5, 6])
    const floors = levels.map((l) => l.config.minRounds)
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
    const reaches = levels.map((l) => l.config.reach)
    expect(reaches[0]).toBeLessThan(reaches[1])
    expect(reaches[1]).toBeLessThan(reaches[2])
    // Six a side is as wide as a grid goes here: below that the squares stop
    // taking a fingertip.
    for (const level of levels) expect(level.config.n).toBeLessThanOrEqual(6)
  })
})
