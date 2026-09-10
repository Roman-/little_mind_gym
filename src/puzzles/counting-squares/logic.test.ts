import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng, shuffled } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel, Rng } from '../../lib/types'
import { countingSquares } from './index'
import { Board } from './Board'
import { CountingSquaresIcon } from './glyphs'
import type { Clash, MosaicAction, MosaicConfig, MosaicState } from './logic'
import {
  block,
  blocks,
  clashOf,
  clueCells,
  cluesFor,
  colOf,
  conflicts,
  countIn,
  countSolutions,
  countWord,
  deal,
  describeClash,
  describeMove,
  digTo,
  filledCount,
  fits,
  hasCornerClue,
  hasEdgeWayIn,
  hasNeighbourClues,
  init,
  isSolved,
  legalMoves,
  paint,
  reduce,
  rowOf,
  solveByLogic,
  wayInCells,
  zeroCells,
} from './logic'

const levels = countingSquares.levels as PuzzleLevel<MosaicConfig>[]
const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 37)

/**
 * Deal once and share. A six-across board costs about 27ms to blot, thin and
 * measure — its round window is the narrowest slice of what a six-wide board
 * usually takes, so `deal` turns the most answers down there — and ninety
 * fresh deals is the most expensive thing in this file; every test after the
 * first gets its boards out of here for nothing.
 */
const dealt = new Map<string, MosaicState>()
function start(level: PuzzleLevel<MosaicConfig>, seed: number): MosaicState {
  const key = `${level.id}:${seed}`
  const hit = dealt.get(key)
  if (hit !== undefined) return hit
  const made = init(level, makeRng(seed))
  dealt.set(key, made)
  return made
}

/** The one way this board can be filled in. */
const answerFor = (state: MosaicState) =>
  (solveByLogic(state.n, state.clues) as { grid: boolean[] }).grid

/** Fills in every square of the answer, one tap each. */
const solutionActions = (state: MosaicState): MosaicAction[] =>
  answerFor(state)
    .map((on, index) => (on ? ({ type: 'toggle', index }) as MosaicAction : null))
    .filter((a): a is MosaicAction => a !== null)

const play = (state: MosaicState, actions: MosaicAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** How many squares two positions disagree about. */
const apart = (a: readonly boolean[], b: readonly boolean[]) =>
  a.reduce((sum, on, i) => sum + (on === b[i] ? 0 : 1), 0)

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, clues, filled } = level.config

    it(`"${level.label}" prints ${clues} numbers on a ${n} by ${n} grid, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.clues).toHaveLength(n * n)
        expect(clueCells(state.clues)).toHaveLength(clues)
        const bs = blocks(n)
        for (const c of clueCells(state.clues)) {
          expect(state.clues[c]).toBeGreaterThanOrEqual(0)
          expect(state.clues[c]).toBeLessThanOrEqual(bs[c].length)
        }
      }
    }, 20_000)

    it(`"${level.label}" has exactly one answer, and it fills ${filled} squares`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(countSolutions(n, state.clues, 3)).toBe(1)
        const answer = answerFor(state)
        expect(answer.filter(Boolean)).toHaveLength(filled)
      }
    })

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // `fits` is exactly what `deal`'s fallback would fail, so this holding
        // for every seed is the proof that the fallback is never reached.
        expect(fits(level.config, state.clues)).toBe(true)
        const reasoned = solveByLogic(n, state.clues) as { rounds: number; overlapped: boolean }
        expect(reasoned.rounds).toBeGreaterThanOrEqual(level.config.minRounds)
        expect(reasoned.rounds).toBeLessThanOrEqual(level.config.maxRounds)
        expect(reasoned.overlapped).toBe(level.config.overlap === 'needed')
      }
    })

    it(`"${level.label}" carries everything its hints name, every seed`, () => {
      for (const seed of SEEDS) {
        const { clues: printed } = start(level, seed)
        // "Start at the edge": the outer ring carries a number that settles
        // its whole block before a single square has been filled in, so the
        // gentlest of the three hints opens the board rather than naming a
        // place to stand. Every level is held to it, not only the two whose
        // hints say so.
        expect(hasEdgeWayIn(n, printed)).toBe(true)
        // "A number in a corner counts four" names a number that is there.
        expect(hasCornerClue(n, printed)).toBe(true)
        // "Take two numbers side by side and compare them."
        expect(hasNeighbourClues(n, printed)).toBe(true)
        // And a printed 0, where the level's first hint is about one.
        if (level.config.zero) expect(zeroCells(printed).length).toBeGreaterThan(0)
        else expect(wayInCells(n, printed).length).toBeGreaterThan(0)
      }
    })

    it(`"${level.label}" gives a child who starts at the edge a first move, every seed`, () => {
      // What `hasEdgeWayIn` is worth, spelled out. Counting round that one
      // number settles its whole block on the spot, before anything else on
      // the board has to be true — so "start at the edge" is a square to fill
      // in or a patch of ground to leave alone, not a place to stand.
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const bs = blocks(n)
        const answer = answerFor(state)
        const ring = wayInCells(n, state.clues).filter((c) => {
          const r = rowOf(n, c)
          const k = colOf(n, c)
          return r === 0 || k === 0 || r === n - 1 || k === n - 1
        })
        expect(ring.length).toBeGreaterThan(0)
        for (const c of ring) {
          expect([0, bs[c].length]).toContain(state.clues[c])
          expect(countIn(answer, bs[c])).toBe(state.clues[c])
        }
      }
    })

    it(`"${level.label}" starts empty, and is not already solved`, () => {
      const state = start(level, SEEDS[0])
      expect(filledCount(state)).toBe(0)
      expect(isSolved(state)).toBe(false)
      expect(conflicts(state).some(Boolean)).toBe(false)
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(init(level, makeRng(12)).clues).toEqual(init(level, makeRng(12)).clues)
      expect(init(level, makeRng(12)).clues).not.toEqual(init(level, makeRng(13)).clues)
    })
  }
})

describe('the rules', () => {
  it('counts nine squares in the middle, six at an edge and four in a corner', () => {
    expect(block(5, 12)).toHaveLength(9)
    expect(block(5, 2)).toHaveLength(6)
    expect(block(5, 0)).toEqual([0, 1, 5, 6])
    expect(block(5, 24)).toEqual([18, 19, 23, 24])
    // Reading order, and the number's own square is one of the nine.
    expect(block(5, 12)).toEqual([6, 7, 8, 11, 12, 13, 16, 17, 18])
    expect(block(5, 12)).toContain(12)
  })

  it('puts a square in a number’s block exactly when the number is in the square’s', () => {
    for (const n of [5, 6, 7]) {
      const bs = blocks(n)
      for (let a = 0; a < n * n; a++) {
        for (let b = 0; b < n * n; b++) {
          expect(bs[a].includes(b)).toBe(bs[b].includes(a))
        }
      }
    }
  })

  it('counts what a filled board would print', () => {
    // One square filled in the top left corner: the four numbers that can see
    // it all count 1, and nothing else counts anything.
    const answer = new Array<boolean>(25).fill(false)
    answer[0] = true
    const printed = cluesFor(5, answer)
    expect(printed[0]).toBe(1)
    expect(printed[6]).toBe(1)
    expect(printed[2]).toBe(0)
    expect(printed.filter((v) => v === 1)).toHaveLength(4)
  })
})

describe('reduce', () => {
  const state = start(levels[0], SEEDS[0])

  it('fills a square in and empties it again', () => {
    const on = reduce(state, { type: 'toggle', index: 7 })
    expect(on.filled[7]).toBe(true)
    expect(on.clues).toBe(state.clues)
    const off = reduce(on, { type: 'toggle', index: 7 })
    expect(off.filled[7]).toBe(false)
    expect(off.filled).toEqual(state.filled)
  })

  it('hands back the very same state for an action that is not one', () => {
    expect(reduce(state, { type: 'toggle', index: -1 })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: state.filled.length })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: 1.5 })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: Number.NaN })).toBe(state)
    expect(reduce(state, { type: 'shade' } as unknown as MosaicAction)).toBe(state)
    expect(reduce(state, undefined as unknown as MosaicAction)).toBe(state)
  })

  it('turns over exactly one square a move, whatever the move is', () => {
    // The floor under `par`, checked by construction rather than asserted: a
    // position that differs from the answer in d squares cannot be finished in
    // fewer than d moves, because no move closes more than one of them.
    for (const level of levels) {
      const state = start(level, SEEDS[1])
      const answer = answerFor(state)
      const half = play(
        state,
        solutionActions(state).slice(0, Math.floor(level.config.filled / 2)),
      )
      for (const where of [state, half, play(state, solutionActions(state))]) {
        for (const action of legalMoves(where)) {
          const next = reduce(where, action)
          expect(apart(where.filled, next.filled)).toBe(1)
          expect(Math.abs(apart(where.filled, answer) - apart(next.filled, answer))).toBe(1)
        }
      }
    }
  })

  it('lets a square go down where it puts a number over, and says so afterwards', () => {
    const state = start(levels[0], SEEDS[0])
    const zero = zeroCells(state.clues)[0]
    const inside = blocks(state.n)[zero][0]
    const over = reduce(state, { type: 'toggle', index: inside })
    // The move happened: the board draws it, the shell records it, and the
    // clay ring is what the board says over the top.
    expect(over).not.toBe(state)
    expect(over.filled[inside]).toBe(true)
    expect(conflicts(over)[zero]).toBe(true)
    expect(isSolved(over)).toBe(false)
  })

  it('is its own undo, so no position is a dead end', () => {
    // There is deliberately no `failure()` on this puzzle. Every move is a
    // toggle and every toggle is reversible, so from any position the answer
    // is still reachable by turning over the squares that disagree with it.
    expect(countingSquares.engine.failure).toBeUndefined()
    const state = start(levels[0], SEEDS[2])
    const answer = answerFor(state)
    const rng = makeRng(4)
    const messed = play(
      state,
      shuffled(rng, state.filled.map((_, i) => i))
        .slice(0, 14)
        .map((index) => ({ type: 'toggle', index }) as MosaicAction),
    )
    expect(isSolved(messed)).toBe(false)
    const back = play(
      messed,
      messed.filled
        .map((on, index) => (on === answer[index] ? null : ({ type: 'toggle', index } as MosaicAction)))
        .filter((a): a is MosaicAction => a !== null),
    )
    expect(isSolved(back)).toBe(true)
  })
})

describe('isSolved and conflicts', () => {
  for (const level of levels) {
    it(`"${level.label}" comes out in exactly ${level.par} moves, and is solved when it does`, () => {
      for (const seed of SEEDS.slice(0, 12)) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        const done = play(first, actions)
        expect(isSolved(done)).toBe(true)
        expect(conflicts(done).some(Boolean)).toBe(false)
        expect(filledCount(done)).toBe(level.config.filled)
      }
    })
  }

  it('will not call a board solved one square short', () => {
    for (const level of levels) {
      const first = start(level, SEEDS[3])
      const short = play(first, solutionActions(first).slice(0, -1))
      expect(conflicts(short).some(Boolean)).toBe(false)
      expect(isSolved(short)).toBe(false)
    }
  })

  it('will not call a board solved with a square too many', () => {
    for (const level of levels) {
      const first = start(level, SEEDS[3])
      const done = play(first, solutionActions(first))
      const spare = done.filled.indexOf(false)
      const extra = reduce(done, { type: 'toggle', index: spare })
      expect(isSolved(extra)).toBe(false)
      // Every square on a dealt board is inside some number's block, so a
      // square too many always puts a number over.
      expect(conflicts(extra).some(Boolean)).toBe(true)
    }
  })

  it('leaves no square outside every number, which is what makes the last test true', () => {
    for (const level of levels) {
      for (const seed of SEEDS) {
        const { n, clues } = start(level, seed)
        const seen = new Set<number>()
        for (const c of clueCells(clues)) for (const i of blocks(n)[c]) seen.add(i)
        expect(seen.size).toBe(n * n)
      }
    }
  })
})

describe('the number a square breaks', () => {
  /** Hand-built, so the test says which number breaks rather than hunting for one. */
  const clues = [
    0, -1, -1, -1, -1,
    -1, -1, -1, -1, -1,
    -1, -1, 2, -1, -1,
    -1, -1, -1, -1, -1,
    -1, -1, -1, -1, 4,
  ]
  const board = (on: number[]): MosaicState => ({
    n: 5,
    clues,
    filled: Array.from({ length: 25 }, (_, i) => on.includes(i)),
  })
  const empty = board([])

  it('says nothing when the square takes it cleanly', () => {
    // Row 2, column 3 is inside the 2's block and nothing else's.
    expect(clashOf(empty, 7)).toBeNull()
    expect(clashOf(empty, 22)).toBeNull()
  })

  it('names the number and holds the whole of its block', () => {
    expect(clashOf(empty, 6)).toEqual({ clue: 0, value: 0, cells: [0, 1, 5, 6] })
  })

  it('answers the same way when the number is printed on the square filled in', () => {
    // A number counts its own square, so filling in the square a 0 is printed
    // on puts that 0 over — and it is still the 0 the cue points at.
    expect(clashOf(empty, 0)).toEqual({ clue: 0, value: 0, cells: [0, 1, 5, 6] })
  })

  it('takes the topmost and leftmost number of the ones a square could break', () => {
    // Row 2, column 2 is inside both the 0's block and the 2's, and the 0 is
    // the one that goes over first — and it is the one that comes first in
    // reading order too.
    expect(clashOf(empty, 6)?.clue).toBe(0)
  })

  it('waits until the number really would go over', () => {
    const two = board([8, 13])
    expect(clashOf(two, 17)).toMatchObject({ clue: 12, value: 2 })
    expect(clashOf(board([8]), 17)).toBeNull()
  })

  it('says nothing about emptying a square', () => {
    expect(clashOf(board([6]), 6)).toBeNull()
  })

  it('fires exactly when the move would turn a number red', () => {
    for (const level of levels) {
      const state = start(level, SEEDS[4])
      const half = play(state, solutionActions(state).slice(0, 3))
      for (let index = 0; index < half.filled.length; index++) {
        if (half.filled[index]) continue
        const clash = clashOf(half, index)
        const after = conflicts(reduce(half, { type: 'toggle', index }))
        expect(clash !== null).toBe(after.some((over, i) => over && !conflicts(half)[i]))
        if (clash === null) continue
        // The square just filled in and the number that went over are both
        // inside the block the cue lights.
        expect(clash.cells).toContain(index)
        expect(clash.cells).toContain(clash.clue)
        expect(clash.cells).toEqual(blocks(half.n)[clash.clue])
      }
    }
  })

  it('puts the broken number in one sentence', () => {
    expect(describeClash(clashOf(empty, 6) as Clash)).toBe(
      'A 0 means none of the squares round it get filled in.',
    )
    expect(describeClash(clashOf(board([8, 13]), 17) as Clash)).toBe(
      'This 2 already has two squares filled in.',
    )
    expect(describeClash({ clue: 0, value: 1, cells: [] })).toBe(
      'This 1 already has one square filled in.',
    )
    expect(describeClash({ clue: 0, value: 9, cells: [] })).toBe(
      'This 9 already has nine squares filled in.',
    )
  })

  it('counts in words as far as a number on this board goes', () => {
    expect([0, 1, 2, 9].map(countWord)).toEqual(['no', 'one', 'two', 'nine'])
  })

  it('flags every number that is over, and no number that is short', () => {
    const over = board([0, 8, 13, 17])
    const flagged = conflicts(over)
    expect(flagged[0]).toBe(true)
    expect(flagged[12]).toBe(true)
    // The 4 in the bottom right corner has nothing round it yet, and being
    // short of its count is not a mistake.
    expect(flagged[24]).toBe(false)
    expect(flagged.filter(Boolean)).toHaveLength(2)
  })
})

describe('describe', () => {
  it('names the square, in the past tense, both ways round', () => {
    const state = start(levels[0], SEEDS[5])
    const on = reduce(state, { type: 'toggle', index: 7 })
    expect(describeMove(state, on, { type: 'toggle', index: 7 })).toBe(
      'Filled in row 2, column 3',
    )
    expect(describeMove(on, state, { type: 'toggle', index: 7 })).toBe('Emptied row 2, column 3')
  })

  it('names the square the move actually changed, for every square', () => {
    const state = start(levels[1], SEEDS[6])
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      const changed = next.filled.findIndex((on, i) => on !== state.filled[i])
      expect(describeMove(state, next, action)).toContain(
        `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
      )
    }
  })
})

describe('par', () => {
  it('is one tap a square the answer fills in', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.filled)
      for (const seed of SEEDS.slice(0, 6)) {
        expect(answerFor(start(level, seed)).filter(Boolean)).toHaveLength(level.par as number)
      }
    }
  })

  it('ramps, and stays inside what the collection asks of a last level', () => {
    expect(levels.map((l) => l.par)).toEqual([9, 14, 24])
    // The small square's hardest is 22 taps and the patchwork quilt's is 29.
    expect(levels[2].par as number).toBeLessThanOrEqual(29)
  })

  /**
   * The five-across board outright, with the numbers already over their count
   * pruned. No shortest path passes through one of those — the extra square
   * has to come off again, which costs two moves more than never filling it
   * in — so the pruning cannot hide a shorter answer.
   *
   * The graph is small enough to walk: counted with `reachableCount` over
   * `makeRng(1000 + k * 37)` for k in 0..9 it runs from 1,472 to 9,300
   * positions, in 50ms to 330ms. Two of those seeds are searched here.
   */
  it('has no shorter path than par under breadth-first search', () => {
    const level = levels[0]
    for (const seed of [SEEDS[0], SEEDS[2]]) {
      const state = start(level, seed)
      const spec = {
        start: state,
        moves: legalMoves,
        apply: reduce,
        key: (s: MosaicState) => s.filled.map((on) => (on ? '1' : '0')).join(''),
        invalid: (s: MosaicState) => conflicts(s).some(Boolean),
        maxStates: 200_000,
      }
      expect(reachableCount<MosaicState, MosaicAction>(spec)).toBeLessThan(200_000)
      const path = shortestSolution<MosaicState, MosaicAction>({ ...spec, solved: isSolved })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(level.par as number)
    }
  }, 20_000)

  it('is past what a search can reach at six across, which is why the two above stand in', () => {
    const state = start(levels[1], SEEDS[0])
    expect(() =>
      reachableCount<MosaicState, MosaicAction>({
        start: state,
        moves: legalMoves,
        apply: reduce,
        key: (s: MosaicState) => s.filled.map((on) => (on ? '1' : '0')).join(''),
        invalid: (s: MosaicState) => conflicts(s).some(Boolean),
        maxStates: 200_000,
      }),
    ).toThrow(/too large/)
  }, 20_000)
})

describe('the solver', () => {
  it('agrees with a plain exhaustive count', () => {
    // `countSolutions` prunes on two running counts a number. This is the
    // stupidest possible counter, so the two agreeing means the clever one is
    // not lying.
    const dumbCount = (n: number, clues: number[]) => {
      const size = n * n
      const bs = blocks(n)
      const cells = clueCells(clues)
      const grid = new Array<boolean>(size).fill(false)
      let found = 0
      const walk = (i: number): void => {
        if (i === size) {
          if (cells.every((c) => countIn(grid, bs[c]) === clues[c])) found++
          return
        }
        grid[i] = false
        walk(i + 1)
        grid[i] = true
        walk(i + 1)
        grid[i] = false
      }
      walk(0)
      return found
    }
    const rng = makeRng(19)
    for (let k = 0; k < 12; k++) {
      const answer = paint(rng, 4, 5)
      const printed = cluesFor(4, answer)
      const thin = printed.map((v, i) => (i % 3 === k % 3 ? -1 : v))
      expect(countSolutions(4, thin, 50)).toBe(dumbCount(4, thin))
    }
  })

  it('finds the answer the board was built round', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 10)) {
        const state = start(level, seed)
        expect(countSolutions(state.n, state.clues, 2)).toBe(1)
        const bs = blocks(state.n)
        for (const c of clueCells(state.clues)) {
          expect(countIn(answerFor(state), bs[c])).toBe(state.clues[c])
        }
      }
    }
  })

  /**
   * The claim the whole generator rests on: a board it can finish is a board
   * with one answer. Boards thinned past what reasoning can follow are mostly
   * not like that, which is what makes them worth testing against.
   */
  it('never finishes a board that has two answers', () => {
    const rng = makeRng(2026)
    let loose = 0
    for (let k = 0; k < 60; k++) {
      const answer = paint(rng, 4, 6)
      const printed = cluesFor(4, answer)
      const order = shuffled(rng, printed.map((_, i) => i))
      const thin = printed.slice()
      for (const i of order.slice(0, 9)) thin[i] = -1
      const count = countSolutions(4, thin, 2)
      if (count > 1) {
        loose++
        expect(solveByLogic(4, thin)).toBeNull()
      } else if (solveByLogic(4, thin) !== null) {
        expect(count).toBe(1)
      }
    }
    expect(loose).toBeGreaterThan(5)
  })

  it('gives up rather than guessing', () => {
    // One number in the middle of an empty five-across board, and nothing
    // else: there are hundreds of ways to fill it in and no way to argue for
    // any of them.
    const lonely = new Array<number>(25).fill(-1)
    lonely[12] = 3
    expect(countSolutions(5, lonely, 2)).toBeGreaterThan(1)
    expect(solveByLogic(5, lonely)).toBeNull()
    // And a board with no numbers on it at all is not a board.
    expect(solveByLogic(5, new Array<number>(25).fill(-1))).toBeNull()
  })

  it('compares numbers side by side, and will not reach further than that', () => {
    // Ten numbers on a five-across board, and exactly one way to fill it in:
    //
    //     .  3  .  .  .
    //     2  .  7  5  .
    //     .  7  .  5  2
    //     .  5  .  3  .
    //     .  .  .  1  .
    //
    // Counting round one number at a time gets nowhere on it, and the only
    // way on is the 2 at row 2, column 1 held against the 7 at row 3, column
    // 2 — two numbers that touch at a corner rather than sit side by side.
    // The solver says no, and that is the point of it: the last level's hints
    // send a child to two numbers side by side, so a board whose way on is a
    // pair those words do not name is a board this puzzle must not deal. The
    // board is not turned down for want of a side-by-side pair, either: it
    // has several, and they are not enough.
    const corners = [
      -1, 3, -1, -1, -1,
      2, -1, 7, 5, -1,
      -1, 7, -1, 5, 2,
      -1, 5, -1, 3, -1,
      -1, -1, -1, 1, -1,
    ]
    expect(countSolutions(5, corners, 3)).toBe(1)
    expect(hasNeighbourClues(5, corners)).toBe(true)
    expect(solveByLogic(5, corners)).toBeNull()
  })

  it('turns down a board that contradicts itself', () => {
    // Two corners of one 2x2 block, one saying nothing is filled in and the
    // other saying everything is.
    const broken = new Array<number>(25).fill(-1)
    broken[0] = 0
    broken[6] = 9
    expect(solveByLogic(5, broken)).toBeNull()
    expect(countSolutions(5, broken, 2)).toBe(0)
  })

  it('takes the second step only where the first one runs out', () => {
    // A board reasoned out under plain counting alone says so, and every board
    // the first two levels deal is one.
    for (const level of levels.slice(0, 2)) {
      for (const seed of SEEDS.slice(0, 8)) {
        expect((solveByLogic(level.config.n, start(level, seed).clues) as { overlapped: boolean }).overlapped).toBe(false)
      }
    }
    for (const seed of SEEDS.slice(0, 8)) {
      expect((solveByLogic(7, start(levels[2], seed).clues) as { overlapped: boolean }).overlapped).toBe(true)
    }
  })
})

describe('the blot', () => {
  it('fills exactly as many squares as it is asked for, and joins them up', () => {
    const rng = makeRng(5)
    for (const [n, want] of [[5, 9], [6, 14], [7, 24]] as const) {
      for (let k = 0; k < 20; k++) {
        const answer = paint(rng, n, want)
        expect(answer).toHaveLength(n * n)
        expect(answer.filter(Boolean)).toHaveLength(want)
      }
    }
  })

  /**
   * The recipe behind `NEW_BLOT` in logic.ts. Clumps are what give a board its
   * way in: a printed 0 needs a patch of ground with nothing in it, and a
   * number as big as its own block needs a clump that fills one.
   */
  it('leaves more of a way in than the same squares scattered would', () => {
    const rng = makeRng(20260909)
    let zeros = 0
    let full = 0
    const bs = blocks(5)
    for (let k = 0; k < 400; k++) {
      const printed = cluesFor(5, paint(rng, 5, 9))
      if (zeroCells(printed).length > 0) zeros++
      if (printed.some((v, i) => v === bs[i].length)) full++
    }
    expect(zeros).toBe(373)
    expect(full).toBe(85)

    const other = makeRng(20260909)
    let scatteredZeros = 0
    let scatteredFull = 0
    for (let k = 0; k < 400; k++) {
      const answer = new Array<boolean>(25).fill(false)
      for (const i of shuffled(other, answer.map((_, j) => j)).slice(0, 9)) answer[i] = true
      const printed = cluesFor(5, answer)
      if (zeroCells(printed).length > 0) scatteredZeros++
      if (printed.some((v, i) => v === bs[i].length)) scatteredFull++
    }
    expect(scatteredZeros).toBe(248)
    expect(scatteredFull).toBe(16)
  })
})

describe('the clay ring', () => {
  /**
   * A player who counts nothing at all. Walk the squares in a random order,
   * fill in every one the board does not ring in clay, never go back.
   *
   * It is the mindless greedy climber that `docs/PUZZLE_CANDIDATES.md` puts on
   * record twice — Aquarium lost to it, so the thermometers entry asks for it
   * to be run before that puzzle's logic.ts is written, and the tilepaint entry
   * turns its own over-count clash off because one sweep of taps reads too much
   * of the answer off it. The entry for this puzzle asks for neither; it is the
   * ring that brings the climber here. The over-full cue is an oracle, and this
   * is the most a player can get out of it without doing any of the reasoning.
   */
  const climb = (state: MosaicState, rng: Rng): MosaicState =>
    shuffled(rng, state.filled.map((_, i) => i)).reduce(
      (cur, i) => (clashOf(cur, i) === null ? reduce(cur, { type: 'toggle', index: i }) : cur),
      state,
    )

  it('can be climbed at five across and nowhere else, and says nothing when the climb fails', () => {
    // Pinned, because it is a measurement rather than a bound, and these
    // thirty seeds are the front of a wider one. The recipe is this loop with
    // `SEEDS` widened: deal each level over `makeRng(1000 + k * 37)` for k in
    // 0..399, climbing every board from the one `makeRng(77)` a level, and the
    // climber lands 22 times at five across, twice at six and never at seven.
    // (Widen five across alone to k in 0..1199 and it is 79 of 1,200, about one
    // board in fifteen; the 22 in 400 below is the same rate seen small.) The
    // first thirty of that run are the thirty here, so they land 4, 0 and 0.
    //
    // The round window is what holds it there. Deal the first level with its
    // window moved — `{ ...levels[0], config: { ...levels[0].config,
    // minRounds: 2, maxRounds: 2 } }`, then the same at 3 and 3 — over
    // `makeRng(1000 + k * 37)` for k in 0..199, count only the boards that
    // `solveByLogic` really puts at that depth (a 2-to-2 window falls back
    // off-window 21 times in 200), and the climber lands on 97 of those 179
    // two-pass boards and on 47 of the 200 three-pass ones. Board.tsx quotes
    // both, under the note on the clay ring.
    const landed = [0, 0, 0]
    for (const [k, level] of levels.entries()) {
      const rng = makeRng(77)
      for (const seed of SEEDS) {
        const end = climb(start(level, seed), rng)
        if (isSolved(end)) {
          landed[k]++
          // It only ever fills, so a climb that lands has spent one tap a
          // square and nothing else: it scores par.
          expect(filledCount(end)).toBe(level.par as number)
        } else {
          // And where it does not land, the oracle has nothing left to say: a
          // number short of its count is never rung, so the board goes quiet
          // with the puzzle unfinished and the reasoning still to do.
          expect(conflicts(end).some(Boolean)).toBe(false)
        }
      }
    }
    expect(landed).toEqual([4, 0, 0])
  })
})

describe('the deal', () => {
  it('keeps a printed 0 back where the level asks for one', () => {
    const rng = makeRng(31)
    const answer = paint(rng, 5, 9)
    const keep = zeroCells(cluesFor(5, answer))[0]
    expect(keep).toBeGreaterThanOrEqual(0)
    const clues = digTo(rng, 5, answer, 18, keep) as number[]
    expect(clues[keep]).toBe(0)
    expect(clueCells(clues)).toHaveLength(18)
  })

  it('will not thin a board past what it can print back', () => {
    const rng = makeRng(32)
    // Twenty-five numbers on a twenty-five square board is every square, so
    // asking for fewer than the thinning leaves is the only way this fails.
    expect(digTo(rng, 5, paint(rng, 5, 9), 3, null)).toBeNull()
  })

  it('deals a board for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })
})

describe('the board', () => {
  const setup = (level: PuzzleLevel<MosaicConfig>, seed: number, locked = false) => {
    const state = start(level, seed)
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }))
    return { state, dispatch, view }
  }

  const tileAt = (state: MosaicState, index: number) =>
    document.querySelector(
      `[aria-label^="Row ${rowOf(state.n, index) + 1}, column ${colOf(state.n, index) + 1},"]`,
    ) as HTMLButtonElement

  /** The board with a real state behind it, so a cue can be watched from the tap that fires it. */
  const Play = ({ from }: { from: MosaicState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: MosaicAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  /** A square that puts the level-one board's printed 0 over its count. */
  const overTheZero = (state: MosaicState) => blocks(state.n)[zeroCells(state.clues)[0]][0]

  it('draws a pressable square for every square on the grid', () => {
    const { state } = setup(levels[0], SEEDS[0])
    const tiles = screen.getAllByRole('button')
    expect(tiles).toHaveLength(state.n * state.n)
    for (const tile of tiles) {
      expect(tile.className).toContain('u-press')
      expect(tile.getAttribute('aria-label')).toMatch(
        /^Row \d+, column \d+, (number \d+, )?(empty|filled in)$/,
      )
    }
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = setup(levels[0], SEEDS[0])
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|solved|par/i)
  })

  it('sends exactly one action for one tap', () => {
    const { state, dispatch } = setup(levels[0], SEEDS[0])
    fireEvent.click(tileAt(state, 7))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle', index: 7 })
  })

  it('walks the arrow keys from square to square, and keeps one tab stop', () => {
    const { state } = setup(levels[0], SEEDS[0])
    const cell = tileAt(state, 0)
    cell.focus()
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    const moved = document.activeElement as HTMLElement
    expect(moved).toBe(tileAt(state, 1))
    const stops = [...document.querySelectorAll('[aria-label^="Row "]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toEqual([moved])

    // And it stops at the edge rather than wrapping round to the next row.
    fireEvent.keyDown(moved, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(moved)
  })

  it('leaves the browser’s own shortcuts alone', () => {
    const { state } = setup(levels[0], SEEDS[0])
    const cell = tileAt(state, 0)
    cell.focus()
    for (const chord of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      fireEvent.keyDown(cell, { key: 'ArrowRight', ...chord })
      expect(document.activeElement).toBe(cell)
    }
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tileAt(state, 1))
  })

  it('says how to play until there is something else to say', () => {
    const state = start(levels[0], SEEDS[0])
    render(createElement(Play, { from: state }))
    expect(
      screen.getByText('Tap a square to fill it in. Tap it again to empty it.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('says so, in words and out loud, when a number goes over its count', () => {
    const state = start(levels[0], SEEDS[0])
    const inside = overTheZero(state)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, inside))

    const said = describeClash(clashOf(state, inside) as Clash)
    expect(screen.getByRole('status')).toHaveTextContent(said)
    // Both lines say it: the one a child reads and the one a screen reader speaks.
    expect(screen.getAllByText(said)).toHaveLength(2)
    const zero = zeroCells(state.clues)[0]
    expect(tileAt(state, zero)).toHaveAttribute('data-over', 'true')
    expect(tileAt(state, zero).getAttribute('aria-label')).toMatch(/, too many round it$/)

    // Take the square back off and there is nothing left to say.
    fireEvent.click(tileAt(state, inside))
    expect(screen.getByRole('status').textContent).toBe('')
    expect(tileAt(state, zero)).not.toHaveAttribute('data-over')
  })

  it('lights the whole block and shakes the number that went over', () => {
    const state = start(levels[0], SEEDS[0])
    const zero = zeroCells(state.clues)[0]
    const inside = blocks(state.n)[zero].find((i) => i !== zero) as number
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, inside))

    const squares = [...document.querySelectorAll('[aria-label^="Row "]')]
    const lit = wearing(cues.highlight)
    expect(lit.map((el) => squares.indexOf(el))).toEqual(blocks(state.n)[zero])
    // One number shakes, and it is the one the sentence names. The square that
    // pushed it over is inside the lit block and nothing more: any filled
    // square in there could be the one to take back off.
    const shaking = wearing(cues.shake).map((mark) => mark.closest('[aria-label]'))
    expect(shaking).toEqual([tileAt(state, zero)])
  })

  it('lights nothing when the square fits', () => {
    const state = start(levels[0], SEEDS[0])
    const answer = answerFor(state)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, answer.indexOf(true)))
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('takes the light off again, and leaves the sentence and the clay ring standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const state = start(levels[0], SEEDS[0])
      const inside = overTheZero(state)
      render(createElement(Play, { from: state }))
      fireEvent.click(tileAt(state, inside))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(wearing(cues.shake)).toHaveLength(0)
      // The louder layer has gone; the marking underneath it has not.
      expect(tileAt(state, zeroCells(state.clues)[0])).toHaveAttribute('data-over', 'true')
      expect(screen.getByRole('status').textContent).not.toBe('')
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('puts the light out the moment the mistake it points at goes', () => {
    // A cue about a position must not outlive that position: the move tape can
    // rewind under one, and a block lit for a number that is no longer over
    // its count would be pointing at nothing.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const state = start(levels[0], SEEDS[0])
      const inside = overTheZero(state)
      render(createElement(Play, { from: state }))
      fireEvent.click(tileAt(state, inside))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)
      // Well inside the cue's run.
      act(() => vi.advanceTimersByTime(100))
      fireEvent.click(tileAt(state, inside))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(wearing(cues.shake)).toHaveLength(0)
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('keeps every square live, whatever the settings say', () => {
    // Nothing on this board is refused, so **Allow moves that break a rule**
    // changes nothing about it: there is no control to go dead and none to
    // keep in the tab order with `aria-disabled`. A square that puts a number
    // over its count takes the tap like any other, and the board answers it
    // afterwards. This is the assertion that keeps it that way.
    const { state } = setup(levels[0], SEEDS[0])
    const squares = screen.getAllByRole('button')
    expect(squares).toHaveLength(state.n * state.n)
    for (const square of squares) {
      expect(square).toBeEnabled()
      expect(square).not.toHaveAttribute('aria-disabled')
    }
  })

  it('ignores every input while it is locked', () => {
    const { state, dispatch } = setup(levels[0], SEEDS[0], true)
    const cell = tileAt(state, 0)
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const tile of screen.getAllByRole('button')) expect(tile).toBeDisabled()
  })

  it('stops naming a number that has come right, while another is still over', () => {
    // A 0 in the corner and a 2 in the middle, so two numbers can be over at
    // once. Three squares round the 2 puts it over; one square round the 0
    // puts the 0 over as well; taking that one square back off leaves the 2
    // red and the 0 right. The sentence about the 0 has to go with it.
    const both: MosaicState = {
      n: 5,
      clues: [
        0, -1, -1, -1, -1,
        -1, -1, -1, -1, -1,
        -1, -1, 2, -1, -1,
        -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1,
      ],
      filled: new Array<boolean>(25).fill(false),
    }
    render(createElement(Play, { from: both }))
    for (const index of [8, 13, 17]) fireEvent.click(tileAt(both, index))
    expect(screen.getByRole('status')).toHaveTextContent(
      'This 2 already has two squares filled in.',
    )
    fireEvent.click(tileAt(both, 6))
    expect(screen.getByRole('status')).toHaveTextContent(
      'A 0 means none of the squares round it get filled in.',
    )

    fireEvent.click(tileAt(both, 6))
    expect(tileAt(both, 0)).not.toHaveAttribute('data-over')
    expect(tileAt(both, 12)).toHaveAttribute('data-over', 'true')
    // Both lines: the one a child reads and the one a screen reader speaks.
    const rule = 'Red means a number has more squares filled in than it counts.'
    expect(screen.getByRole('status')).toHaveTextContent(rule)
    expect(screen.getAllByText(rule)).toHaveLength(2)
  })

  it('draws a solved board without a word of celebration', () => {
    const first = start(levels[0], SEEDS[7])
    const done = play(first, solutionActions(first))
    render(createElement(Board, { state: done, dispatch: vi.fn(), locked: true }))
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('the card', () => {
  /** The board the picture in glyphs.tsx draws, as this puzzle's own state. */
  const card: MosaicState = {
    n: 3,
    clues: [3, -1, -1, -1, 5, -1, -1, -1, -1],
    filled: [false, true, false, true, true, true, false, true, false],
  }

  it('draws a position the board really takes', () => {
    expect(isSolved(card)).toBe(true)
    expect(conflicts(card).some(Boolean)).toBe(false)
    expect(cluesFor(3, card.filled)[0]).toBe(3)
    expect(cluesFor(3, card.filled)[4]).toBe(5)
  })

  it('is wrong if either numeral moves one square', () => {
    // The 3 belongs in the corner: a 3 one square along counts six squares and
    // four of them are filled in.
    expect(isSolved({ ...card, clues: [-1, 3, -1, -1, 5, -1, -1, -1, -1] })).toBe(false)
    expect(isSolved({ ...card, clues: [3, -1, -1, 5, -1, -1, -1, -1, -1] })).toBe(false)
  })

  it('draws itself inside the frame, with nothing on it that is not a square', () => {
    const { container } = render(createElement(CountingSquaresIcon))
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32')
    // Five filled squares of the nine, in the enamel the board fills with.
    expect(container.querySelectorAll('[fill="var(--p-indigo)"]')).toHaveLength(5)
    expect(container.querySelectorAll('path[stroke="var(--ink)"]')).toHaveLength(1)
    expect(container.querySelectorAll('path[stroke="var(--p-on-dark)"]')).toHaveLength(1)
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(countingSquares.id).toBe('counting-squares')
    expect(countingSquares.reseedable).toBe(true)
    // A square in the wrong place is not a dead end here — it is emptied
    // again, not stepped back from — so there is deliberately no failure().
    expect(countingSquares.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(countingSquares.instructions.length).toBeGreaterThanOrEqual(2)
    expect(countingSquares.instructions.length).toBeLessThanOrEqual(4)
    for (const line of countingSquares.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      // The collection's longest shipped hint is 134 characters.
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(130)
    }
  })

  it('says how to take a mark off, where a child would look for it', () => {
    expect(countingSquares.instructions.join(' ')).toMatch(/empty it again|Tap it again to empty/i)
  })

  it('never names a square that would give the answer away', () => {
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('ramps by size, by how many numbers are printed, and by the step it asks for', () => {
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.config.overlap)).toEqual(['never', 'never', 'needed'])
    const density = levels.map((l) => l.config.clues / (l.config.n * l.config.n))
    expect(density[0]).toBeGreaterThan(density[1])
    expect(density[1]).toBeGreaterThan(density[2])
    // Disjoint, not merely rising. Overlapping windows would let a level-one
    // board be the deeper of a level-one and a level-two board, which would
    // leave the round count saying nothing about which of the two was harder.
    expect(levels.map((l) => [l.config.minRounds, l.config.maxRounds])).toEqual([
      [4, 6],
      [7, 9],
      [10, 12],
    ])
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i - 1].config.maxRounds).toBeLessThan(levels[i].config.minRounds)
    }
  })

  it('promises a 0 only on the level whose first hint is about one', () => {
    expect(levels.map((l) => l.config.zero)).toEqual([true, false, false])
    expect(levels[0].hints[0]).toContain('0')
    for (const level of levels.slice(1)) {
      for (const hint of level.hints) expect(hint).not.toMatch(/\ba 0\b/)
    }
  })
})
