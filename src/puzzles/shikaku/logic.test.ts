import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { underSettings } from '../../test/settings'
import { cues } from '../../lib/motion'
import { makeRng, randInt } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { shikaku } from './index'
import { Board } from './Board'
import type { Fault, Piece, ShikakuAction, ShikakuConfig, ShikakuState } from './logic'
import {
  areaOf,
  candidatesFor,
  cellsOf,
  colOf,
  countSolutions,
  deal,
  describeFault,
  describeMove,
  faultOf,
  faults,
  fits,
  init,
  isSolved,
  keyOf,
  numbersIn,
  ownerOf,
  pieceAt,
  placeClues,
  randomPartition,
  rectBetween,
  reduce,
  refusalOf,
  rowOf,
  solveByLogic,
  stateKey,
  unclaimed,
} from './logic'

const levels = shikaku.levels as PuzzleLevel<ShikakuConfig>[]
const start = (level: PuzzleLevel<ShikakuConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 36 }, (_, i) => 1000 + i * 37)

/** The one way this bar can be cut, as one rectangle a number. */
const answerFor = (state: ShikakuState): Piece[] =>
  (solveByLogic(state.n, state.clues) as { pieces: Piece[] }).pieces

/** Breaking a piece off is two corners: its top-left square and its bottom-right. */
const placing = (n: number, piece: Piece): ShikakuAction => ({
  type: 'place',
  a: piece.r0 * n + piece.c0,
  b: piece.r1 * n + piece.c1,
})

const solutionActions = (state: ShikakuState): ShikakuAction[] =>
  answerFor(state).map((piece) => placing(state.n, piece))

const play = (state: ShikakuState, actions: ShikakuAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** Squares still on the unbroken bar. */
const freeSquares = (state: ShikakuState) =>
  ownerOf(state).filter((owner) => owner === -1).length

/** The squares of a bar that carry a number. */
const clueCells = (state: ShikakuState) =>
  state.clues.map((_, i) => i).filter((i) => state.clues[i] !== 0)

afterEach(cleanup)

/* ============================================================
   The bar it deals
   ============================================================ */

describe('the bar it deals', () => {
  for (const level of levels) {
    const { n, pieces, maxArea } = level.config

    it(`"${level.label}" prints ${pieces} numbers that add up to the whole bar, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.n).toBe(n)
        expect(state.clues).toHaveLength(n * n)
        const printed = clueCells(state).map((i) => state.clues[i])
        // The piece count is the level's par, and the shell prints par to a
        // child as a fact — so it is exact on every seed, not on average.
        expect(printed).toHaveLength(pieces)
        expect(printed.reduce((a, b) => a + b, 0)).toBe(n * n)
        // Never a 1: a 1 hands its square over before the puzzle starts.
        for (const value of printed) {
          expect(value).toBeGreaterThanOrEqual(2)
          expect(value).toBeLessThanOrEqual(maxArea)
        }
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // An independent exact-cover count, capped at three, so the clever
        // solver agreeing with it means the clever one is not lying.
        expect(countSolutions(n, state.clues, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // The fallbacks in `deal` are for a run of luck the tests have never
        // seen: every seed lands on a bar that suits the level.
        expect(fits(level.config, state.clues)).toBe(true)
        const reasoned = solveByLogic(n, state.clues)
        expect(reasoned).not.toBeNull()
        const { rounds } = reasoned as { rounds: number }
        expect(rounds).toBeGreaterThanOrEqual(level.config.minRounds)
        expect(rounds).toBeLessThanOrEqual(level.config.maxRounds)
      }
    })

    it(`"${level.label}" starts whole, and is not already solved`, () => {
      const state = start(level, 5)
      expect(state.pieces).toHaveLength(0)
      expect(freeSquares(state)).toBe(n * n)
      expect(unclaimed(state)).toBe(pieces)
      expect(isSolved(state)).toBe(false)
      expect(faults(state)).toHaveLength(0)
    })

    it(`"${level.label}" deals the same bar twice for the same seed, and another for another`, () => {
      expect(start(level, 12).clues).toEqual(start(level, 12).clues)
      expect(start(level, 12).clues).not.toEqual(start(level, 13).clues)
    })
  }

  it('deals a bar for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })
})

/* ============================================================
   Reading the bar
   ============================================================ */

/**
 * A four-wide bar, cut by hand, so a test can say which rule breaks rather
 * than hunting for one. Four pieces: a 2 across the top left, a 4 in the top
 * right corner, a 6 down the left, and a 4 in the bottom right corner.
 */
const HAND: number[] = [
  2, 0, 0, 4,
  0, 0, 0, 0,
  0, 6, 0, 0,
  0, 0, 0, 4,
]
const hand = (pieces: Piece[] = []): ShikakuState => ({ n: 4, clues: HAND, pieces })
const rect = (r0: number, c0: number, r1: number, c1: number): Piece => ({ r0, c0, r1, c1 })

describe('reading the bar', () => {
  it('bounds a rectangle from two corners, whichever way round they come', () => {
    expect(rectBetween(4, 0, 5)).toEqual(rect(0, 0, 1, 1))
    expect(rectBetween(4, 5, 0)).toEqual(rect(0, 0, 1, 1))
    expect(rectBetween(4, 3, 12)).toEqual(rect(0, 0, 3, 3))
    expect(rectBetween(4, 6, 6)).toEqual(rect(1, 2, 1, 2))
  })

  it('bounds nothing from a corner that is not a square of the bar', () => {
    expect(rectBetween(4, -1, 5)).toBeNull()
    expect(rectBetween(4, 0, 16)).toBeNull()
    expect(rectBetween(4, 1.5, 5)).toBeNull()
  })

  it('counts a rectangle’s squares and names it by its top-left one', () => {
    expect(areaOf(rect(1, 1, 2, 3))).toBe(6)
    expect(cellsOf(4, rect(1, 1, 2, 2))).toEqual([5, 6, 9, 10])
    expect(keyOf(4, rect(1, 1, 2, 2))).toBe('5')
  })

  it('says which piece owns a square, and which squares are still on the bar', () => {
    const board = hand([rect(0, 0, 0, 1), rect(0, 2, 1, 3)])
    expect(ownerOf(board)).toEqual([0, 0, 1, 1, -1, -1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1])
    expect(pieceAt(board, 1)).toBe(0)
    expect(pieceAt(board, 7)).toBe(1)
    expect(pieceAt(board, 8)).toBe(-1)
    expect(pieceAt(board, 99)).toBe(-1)
    expect(freeSquares(board)).toBe(10)
    // The 2 and the 4 in the corner are claimed; the 6 and the other 4 are not.
    expect(unclaimed(board)).toBe(2)
    expect(numbersIn(board, rect(0, 0, 0, 3))).toEqual([2, 4])
  })

  it('is the same position however the same pieces were broken off', () => {
    const one = hand([rect(0, 0, 0, 1), rect(0, 2, 1, 3)])
    const other = hand([rect(0, 2, 1, 3), rect(0, 0, 0, 1)])
    expect(stateKey(one)).toBe(stateKey(other))
    expect(stateKey(one)).not.toBe(stateKey(hand([rect(0, 0, 0, 1)])))
  })
})

/* ============================================================
   The three rules
   ============================================================ */

describe('the three rules a piece can break', () => {
  const board = hand()

  it('says nothing about a piece that holds one number and matches it', () => {
    expect(faultOf(board, rect(0, 0, 0, 1))).toBeNull()
    expect(faultOf(board, rect(0, 2, 1, 3))).toBeNull()
    expect(faultOf(board, rect(1, 0, 3, 1))).toBeNull()
    expect(faultOf(board, rect(2, 2, 3, 3))).toBeNull()
  })

  it('names a piece with no number on it', () => {
    const fault = faultOf(board, rect(0, 1, 0, 2)) as Fault
    expect(fault.kind).toBe('empty')
    expect(fault.cells).toEqual([1, 2])
    expect(fault.blamed).toEqual([])
    expect(describeFault(fault)).toBe('This piece has no number on it.')
  })

  it('names a piece with two numbers on it, and blames both of them', () => {
    const fault = faultOf(board, rect(0, 0, 0, 3)) as Fault
    expect(fault.kind).toBe('crowded')
    expect(fault.blamed).toEqual([0, 3])
    expect(describeFault(fault)).toBe('This piece has more than one number on it.')
  })

  it('counts the squares out loud when they disagree with the number', () => {
    const fault = faultOf(board, rect(0, 0, 0, 2)) as Fault
    expect(fault.kind).toBe('size')
    expect(fault.area).toBe(3)
    expect(fault.says).toBe(2)
    expect(fault.blamed).toEqual([0])
    expect(describeFault(fault)).toBe('This piece has 3 squares, not 2.')
  })

  it('flags every piece at fault and no piece that is behaving', () => {
    const board2 = hand([rect(0, 0, 0, 1), rect(0, 2, 0, 3)])
    const found = faults(board2)
    expect(found[0]).toBeNull()
    expect((found[1] as Fault).kind).toBe('size')
    expect(found.filter(Boolean)).toHaveLength(1)
  })
})

/* ============================================================
   reduce
   ============================================================ */

describe('reduce', () => {
  const board = hand()

  it('breaks a piece off, and puts the whole of it back from any of its squares', () => {
    const off = reduce(board, { type: 'place', a: 0, b: 1 })
    expect(off).not.toBe(board)
    expect(off.pieces).toEqual([rect(0, 0, 0, 1)])
    expect(off.clues).toBe(board.clues)
    const back = reduce(off, { type: 'clear', cell: 1 })
    expect(back.pieces).toHaveLength(0)
    expect(back.clues).toBe(board.clues)
  })

  it('hands back the very same state for an action that is not one', () => {
    expect(reduce(board, { type: 'place', a: -1, b: 5 })).toBe(board)
    expect(reduce(board, { type: 'place', a: 0, b: 16 })).toBe(board)
    expect(reduce(board, { type: 'place', a: 1.5, b: 5 })).toBe(board)
    // Both corners on one square is a change of mind, not a piece.
    expect(reduce(board, { type: 'place', a: 6, b: 6 })).toBe(board)
    expect(reduce(board, { type: 'clear', cell: 0 })).toBe(board)
    expect(reduce(board, { type: 'clear', cell: 99 })).toBe(board)
    expect(reduce(board, { type: 'nudge' } as unknown as ShikakuAction)).toBe(board)
  })

  it('will not break a piece out of chocolate that has already come away', () => {
    const off = reduce(board, { type: 'place', a: 0, b: 1 })
    expect(reduce(off, { type: 'place', a: 1, b: 6 })).toBe(off)
    expect(reduce(off, { type: 'place', a: 0, b: 15 })).toBe(off)
    // And the squares beside it still take a piece.
    expect(reduce(off, { type: 'place', a: 2, b: 7 })).not.toBe(off)
  })

  /**
   * The one thing this puzzle would lose if anybody tidied `reduce` up. All
   * three of these land, so the board can draw them, ring them in clay and say
   * what is wrong — and so one tap puts them back.
   */
  it('lets a piece that breaks a rule land, all three ways', () => {
    for (const wrong of [
      { type: 'place', a: 1, b: 2 } as ShikakuAction, // no number on it
      { type: 'place', a: 0, b: 3 } as ShikakuAction, // two numbers on it
      { type: 'place', a: 0, b: 2 } as ShikakuAction, // three squares for a 2
    ]) {
      const next = reduce(board, wrong)
      expect(next).not.toBe(board)
      expect(next.pieces).toHaveLength(1)
      expect(faultOf(next, next.pieces[0])).not.toBeNull()
      expect(isSolved(next)).toBe(false)
    }
  })

  it('adds or takes away exactly one piece, and never more, over a long random walk', () => {
    // The whole of the lower bound on par: from a start of no pieces, one
    // dispatched action moves the count by one, so a bar with k pieces in its
    // answer cannot be finished in fewer than k moves.
    const rng = makeRng(99)
    const level = levels[1]
    let state = start(level, 7)
    let solvedSeen = 0
    for (let step = 0; step < 4000; step++) {
      const size = state.n * state.n
      const action: ShikakuAction =
        rng() < 0.25
          ? { type: 'clear', cell: randInt(rng, size) }
          : { type: 'place', a: randInt(rng, size), b: randInt(rng, size) }
      const next = reduce(state, action)
      if (next === state) continue
      expect(Math.abs(next.pieces.length - state.pieces.length)).toBe(1)
      if (isSolved(next)) {
        solvedSeen++
        expect(next.pieces).toHaveLength(level.par as number)
      }
      state = next
    }
    // The walk has to have done something, or it proves nothing.
    expect(state.pieces.length + solvedSeen).toBeGreaterThan(0)
  })
})

/* ============================================================
   isSolved
   ============================================================ */

describe('isSolved', () => {
  for (const level of levels) {
    it(`"${level.label}" comes out in exactly ${level.par} moves, and is solved when it does`, () => {
      for (const seed of SEEDS.slice(0, 20)) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        const done = play(first, actions)
        expect(done.pieces).toHaveLength(level.par as number)
        expect(isSolved(done)).toBe(true)
        expect(faults(done).some(Boolean)).toBe(false)
        expect(unclaimed(done)).toBe(0)
        expect(freeSquares(done)).toBe(0)
      }
    })
  }

  it('comes out whatever order the pieces are broken off in', () => {
    const first = start(levels[0], 33)
    const backwards = solutionActions(first).reverse()
    expect(isSolved(play(first, backwards))).toBe(true)
  })

  it('will not call a bar solved while a square is still on it', () => {
    const first = start(levels[0], 21)
    const short = play(first, solutionActions(first).slice(0, -1))
    expect(faults(short).some(Boolean)).toBe(false)
    expect(freeSquares(short)).toBeGreaterThan(0)
    expect(isSolved(short)).toBe(false)
  })

  it('will not call a fully broken bar solved when a piece breaks a rule', () => {
    // The whole four-wide bar in four square pieces: nothing is left over, and
    // two of the four disagree with the number they hold.
    const full = hand([rect(0, 0, 1, 1), rect(0, 2, 1, 3), rect(2, 0, 3, 1), rect(2, 2, 3, 3)])
    expect(freeSquares(full)).toBe(0)
    expect(faults(full).filter(Boolean)).toHaveLength(2)
    expect(isSolved(full)).toBe(false)
  })
})

/* ============================================================
   The refusal
   ============================================================ */

describe('the one move it refuses', () => {
  const off = reduce(hand(), { type: 'place', a: 0, b: 1 })

  it('says nothing about a rectangle that crosses nothing', () => {
    expect(refusalOf(off, 2, 7)).toBeNull()
    expect(refusalOf(off, 4, 4)).toBeNull()
    expect(refusalOf(off, 4, 99)).toBeNull()
  })

  it('names the piece that is in the way, and moves nothing', () => {
    const no = refusalOf(off, 1, 6)
    expect(no).not.toBeNull()
    expect((no as { message: string }).message).toBe('A piece is already broken off there.')
    // A piece cannot be snapped out of chocolate that has already come away, so
    // nothing can even pretend to move — which is what makes `useRefusal` shake
    // the piece in the way rather than draw a position that never existed.
    expect((no as { pretend: ShikakuState }).pretend).toBe(off)
    expect((no as { where: string }).where).toBe(keyOf(4, off.pieces[0]))
  })

  it('fires exactly when reduce hands the same state back', () => {
    const state = start(levels[0], 8)
    const some = play(state, solutionActions(state).slice(0, 3))
    const size = some.n * some.n
    for (let a = 0; a < size; a++) {
      for (let b = 0; b < size; b++) {
        if (a === b) continue
        const refused = refusalOf(some, a, b) !== null
        expect(refused).toBe(reduce(some, { type: 'place', a, b }) === some)
      }
    }
  })
})

/* ============================================================
   describe
   ============================================================ */

describe('describe', () => {
  it('names the piece and where it sits, in the past tense, both ways round', () => {
    const board = hand()
    const action: ShikakuAction = { type: 'place', a: 5, b: 0 }
    const off = reduce(board, action)
    expect(describeMove(board, off, action)).toBe(
      'Broke off a piece of 4 squares at row 1, column 1',
    )
    const back: ShikakuAction = { type: 'clear', cell: 5 }
    expect(describeMove(off, reduce(off, back), back)).toBe(
      'Put a piece of 4 squares back at row 1, column 1',
    )
  })

  it('names the piece the move actually changed, over a whole solution', () => {
    const state = start(levels[0], 44)
    let cur = state
    for (const action of solutionActions(state)) {
      const next = reduce(cur, action)
      const piece = next.pieces[next.pieces.length - 1]
      expect(describeMove(cur, next, action)).toBe(
        `Broke off a piece of ${areaOf(piece)} squares at row ${piece.r0 + 1}, column ${
          piece.c0 + 1
        }`,
      )
      cur = next
    }
  })
})

/* ============================================================
   par
   ============================================================ */

/** Every rectangle on this bar that holds exactly one number, of its own size. */
function goodRects(state: ShikakuState): Piece[] {
  const { n, clues } = state
  const out: Piece[] = []
  for (let r0 = 0; r0 < n; r0++) {
    for (let c0 = 0; c0 < n; c0++) {
      for (let r1 = r0; r1 < n; r1++) {
        for (let c1 = c0; c1 < n; c1++) {
          const cells = cellsOf(n, { r0, c0, r1, c1 })
          const inside = cells.filter((cell) => clues[cell] !== 0)
          if (inside.length === 1 && clues[inside[0]] === cells.length) out.push({ r0, c0, r1, c1 })
        }
      }
    }
  }
  return out
}

/**
 * The moves worth searching: every good rectangle that still fits, and one
 * put-back for every piece already down.
 *
 * A piece that breaks a rule is never on a shortest path, because `isSolved`
 * will not have it, so it has to come back off — which costs two more moves
 * than not breaking it off. Delete a bad placement and its matching put-back
 * from any solution and what is left is a solution of the same length or
 * shorter, so pruning them cannot hide a shorter path. Handing the search all
 * 441 placements of a six-wide bar instead would be millions of `reduce` calls
 * over the same ten thousand positions.
 */
function tidyMoves(state: ShikakuState, good: Piece[]): ShikakuAction[] {
  const owner = ownerOf(state)
  const out: ShikakuAction[] = []
  for (const piece of good) {
    const cells = cellsOf(state.n, piece)
    if (cells.some((cell) => owner[cell] !== -1)) continue
    out.push({ type: 'place', a: cells[0], b: cells[cells.length - 1] })
  }
  for (const piece of state.pieces) {
    out.push({ type: 'clear', cell: piece.r0 * state.n + piece.c0 })
  }
  return out
}

function shortest(state: ShikakuState): ShikakuAction[] | null {
  const good = goodRects(state)
  return shortestSolution<ShikakuState, ShikakuAction>({
    start: state,
    moves: (s) => tidyMoves(s, good),
    apply: reduce,
    key: stateKey,
    solved: isSolved,
    // Belt and braces: `tidyMoves` cannot make one of these anyway.
    invalid: (s) => faults(s).some(Boolean),
    maxStates: 100_000,
  })
}

describe('par', () => {
  it('is one move a number, on every level', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.pieces)
    }
  })

  it('is exactly the shortest path on "Seven pieces", by breadth-first search', () => {
    for (const seed of [5, 61, 777, 1234, 9001]) {
      const path = shortest(start(levels[0], seed))
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[0].par as number)
    }
  })

  it('is exactly the shortest path on "Nine pieces", by breadth-first search', () => {
    for (const seed of [5, 61, 777, 1234, 9001]) {
      const path = shortest(start(levels[1], seed))
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[1].par as number)
    }
  })

  /**
   * The seven-wide bar is not searched, and `maxStates` is not raised to make
   * it searchable: its reachable positions run past a hundred and seventy
   * thousand on some seeds and over the search's own cap on others, so the run
   * would hang or throw and the failure would look like a bug in the key.
   *
   * Its par rests on the same two facts the search confirms on the other two
   * levels, and both of them are tested above: the answer's own rectangles are
   * pairwise disjoint, so eleven moves is reachable; and one action changes the
   * piece count by exactly one from a start of none, so nothing shorter is.
   */
  it('is reachable on "Eleven pieces", and nothing shorter can be, on every seed', () => {
    const level = levels[2]
    for (const seed of SEEDS.slice(0, 30)) {
      const first = start(level, seed)
      const answer = answerFor(first)
      expect(answer).toHaveLength(level.par as number)
      let cur = first
      for (const action of solutionActions(first)) {
        const next = reduce(cur, action)
        // No refusal along the way: the answer's pieces never overlap.
        expect(next).not.toBe(cur)
        expect(faultOf(next, next.pieces[next.pieces.length - 1])).toBeNull()
        cur = next
      }
      expect(isSolved(cur)).toBe(true)
      expect(cur.pieces).toHaveLength(level.par as number)
    }
  })
})

/* ============================================================
   The solver and the generator
   ============================================================ */

describe('the solver', () => {
  it('finds the answer the bar was built round, and it is the only one', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 12)) {
        const state = start(level, seed)
        const answer = answerFor(state)
        expect(answer).toHaveLength(level.config.pieces)
        expect(countSolutions(state.n, state.clues, 2)).toBe(1)
        // It really is a cut of the whole bar: disjoint, and nothing left over.
        const covered = new Set(answer.flatMap((piece) => cellsOf(state.n, piece)))
        expect(covered.size).toBe(state.n * state.n)
        for (const piece of answer) expect(faultOf(state, piece)).toBeNull()
      }
    }
  })

  /**
   * The claim the whole generator rests on: a bar it can finish is a bar with
   * one answer. Raw draws are mostly not like that, which is what makes them
   * worth testing against.
   */
  it('never finishes a bar that has two answers', () => {
    const rng = makeRng(2024)
    const cfg = levels[1].config
    let loose = 0
    let checked = 0
    while (checked < 150) {
      const rects = randomPartition(rng, cfg.n, cfg.pieces, cfg.maxArea)
      if (rects === null) continue
      checked++
      const clues = placeClues(rng, cfg.n, rects)
      const count = countSolutions(cfg.n, clues, 2)
      if (count > 1) {
        loose++
        expect(solveByLogic(cfg.n, clues)).toBeNull()
      } else if (solveByLogic(cfg.n, clues) !== null) {
        expect(count).toBe(1)
      }
    }
    // Around two in five raw draws have a second answer, so the filter is
    // doing real work rather than agreeing with a board that was fine already.
    expect(loose).toBeGreaterThan(20)
  })

  it('gives up rather than guessing', () => {
    // The classic ambiguity, at its smallest: two 2s on a two-wide bar, corner
    // to corner. It can be cut into two rows or into two columns, and nothing
    // on the bar chooses.
    expect(countSolutions(2, [2, 0, 0, 2], 2)).toBe(2)
    expect(solveByLogic(2, [2, 0, 0, 2])).toBeNull()
  })

  it('offers a number every rectangle of its own size that holds no other number', () => {
    // The 6 in the hand-cut bar sits at row 3, column 2. A 6 is 1x6, 2x3, 3x2
    // or 6x1, and only the shapes that fit a four-wide bar and steer clear of
    // the other three numbers survive.
    const shapes = candidatesFor(4, HAND, 9)
    expect(shapes.length).toBeGreaterThan(0)
    for (const shape of shapes) {
      expect(areaOf(shape)).toBe(6)
      expect(cellsOf(4, shape)).toContain(9)
      expect(numbersIn(hand(), shape)).toEqual([6])
    }
    // And the true answer is one of them.
    expect(shapes).toContainEqual(rect(1, 0, 3, 1))
  })
})

describe('cutting a bar up', () => {
  it('always hands back the number of pieces it was asked for', () => {
    const rng = makeRng(31337)
    for (const level of levels) {
      const { n, pieces, maxArea } = level.config
      let cut = 0
      for (let k = 0; k < 60; k++) {
        const rects = randomPartition(rng, n, pieces, maxArea)
        if (rects === null) continue
        cut++
        // Exactly the count asked for, no square owned twice, none left out,
        // and no piece bigger than the level allows or smaller than two.
        expect(rects).toHaveLength(pieces)
        const cells = rects.flatMap((rect2) => cellsOf(n, rect2))
        expect(new Set(cells).size).toBe(n * n)
        expect(cells).toHaveLength(n * n)
        for (const rect2 of rects) {
          expect(areaOf(rect2)).toBeGreaterThanOrEqual(2)
          expect(areaOf(rect2)).toBeLessThanOrEqual(maxArea)
        }
      }
      // It gives up on about one draw in a hundred rather than backtracking
      // forever, and the caller simply draws another.
      expect(cut).toBeGreaterThan(50)
    }
  })

  it('prints one number inside every piece, and nowhere else', () => {
    const rng = makeRng(4242)
    const rects = randomPartition(rng, 6, 9, 8) as Piece[]
    const clues = placeClues(rng, 6, rects)
    expect(clues.filter((v) => v !== 0)).toHaveLength(9)
    for (const rect2 of rects) {
      const inside = cellsOf(6, rect2).filter((cell) => clues[cell] !== 0)
      expect(inside).toHaveLength(1)
      expect(clues[inside[0]]).toBe(areaOf(rect2))
    }
  })

  it('turns a bar down for the right reasons', () => {
    const cfg = levels[0].config
    // A 1 printed on it, and a piece count that is not the level's.
    expect(fits(cfg, [1, ...new Array<number>(24).fill(0)])).toBe(false)
    expect(fits(cfg, new Array<number>(25).fill(0))).toBe(false)
    // And a real bar for another level, which has the wrong count for this one.
    expect(fits(cfg, start(levels[1], 3).clues)).toBe(false)
  })
})

/* ============================================================
   The board
   ============================================================ */

describe('the board', () => {
  const level = levels[0]
  const seed = 2

  const show = (state: ShikakuState, locked = false, allowForbiddenMoves = true) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }), {
      wrapper: underSettings({ allowForbiddenMoves }),
    })
    return { state, dispatch, view }
  }

  /** The board with a real state behind it, so a cue can be watched from the tap. */
  const Play = ({ from }: { from: ShikakuState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: ShikakuAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  const playing = (from: ShikakuState) =>
    render(createElement(Play, { from }), { wrapper: underSettings() })

  const squareAt = (state: ShikakuState, cell: number) =>
    document.querySelector(
      `[aria-label*="Row ${rowOf(state.n, cell) + 1}, column ${colOf(state.n, cell) + 1},"]`,
    ) as HTMLButtonElement

  const slabAt = (piece: Piece) =>
    document.querySelector(
      `[aria-label*="at row ${piece.r0 + 1}, column ${piece.c0 + 1},"]`,
    ) as HTMLButtonElement

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  const status = () => screen.getByRole('status').textContent

  it('draws a pressable square for every square of a whole bar', () => {
    const { state } = show(start(level, seed))
    const squares = screen.getAllByRole('button')
    expect(squares).toHaveLength(state.n * state.n)
    for (const square of squares) {
      expect(square.className).toContain('u-press')
      expect(square.getAttribute('aria-label')).toMatch(
        /^Row \d+, column \d+, (no number|the number \d+)\. Mark a corner here\.$/,
      )
    }
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = show(start(level, seed))
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|solved|par/i)
  })

  it('marks a corner on the first tap and sends one action on the second', () => {
    const { state, dispatch } = show(start(level, seed))
    fireEvent.click(squareAt(state, 0))
    expect(dispatch).not.toHaveBeenCalled()
    expect(squareAt(state, 0)).toHaveAttribute('data-marked', 'true')
    expect(squareAt(state, 0).getAttribute('aria-label')).toMatch(/Drop the corner\.$/)
    expect(squareAt(state, 6).getAttribute('aria-label')).toMatch(
      /Break off the piece from the corner to here\.$/,
    )

    fireEvent.click(squareAt(state, 6))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'place', a: 0, b: 6 })
  })

  it('outlines the piece the second tap would break off, and never counts its squares', () => {
    const { state } = show(start(level, seed))
    fireEvent.click(squareAt(state, 0))
    fireEvent.mouseEnter(squareAt(state, state.n + 1))
    const outline = document.querySelector('[class*="preview"]') as HTMLElement
    expect(outline).not.toBeNull()
    expect(outline.style.gridRow).toBe('1 / 3')
    expect(outline.style.gridColumn).toBe('1 / 3')
    // Counting the squares is the puzzle, so the outline says nothing at all.
    expect(outline.textContent).toBe('')
    expect(outline).toHaveAttribute('aria-hidden', 'true')

    // And it is gone the moment there is no corner to draw from.
    fireEvent.click(squareAt(state, 0))
    expect(document.querySelector('[class*="preview"]')).toBeNull()
  })

  it('drops the corner when it is tapped again, and when Escape is pressed', () => {
    const { state, dispatch } = show(start(level, seed))
    fireEvent.click(squareAt(state, 0))
    fireEvent.click(squareAt(state, 0))
    expect(dispatch).not.toHaveBeenCalled()
    expect(squareAt(state, 0)).not.toHaveAttribute('data-marked')

    fireEvent.click(squareAt(state, 0))
    expect(squareAt(state, 0)).toHaveAttribute('data-marked', 'true')
    fireEvent.keyDown(squareAt(state, 0), { key: 'Escape' })
    expect(squareAt(state, 0)).not.toHaveAttribute('data-marked')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('puts a piece back with one tap, from any of its squares', () => {
    const first = start(level, seed)
    const piece = answerFor(first)[0]
    const board = reduce(first, placing(first.n, piece))
    const { dispatch } = show(board)
    fireEvent.click(slabAt(piece))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'clear', cell: piece.r0 * board.n + piece.c0 })
  })

  it('draws one button for a whole piece, however many squares it covers', () => {
    const first = start(level, seed)
    const piece = answerFor(first).find((p) => areaOf(p) > 2) as Piece
    const board = reduce(first, placing(first.n, piece))
    show(board)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(first.n * first.n - areaOf(piece) + 1)
    expect(slabAt(piece).className).toContain('u-press')
    expect(slabAt(piece).getAttribute('aria-label')).toBe(
      `Piece of ${areaOf(piece)} squares at row ${piece.r0 + 1}, column ${piece.c0 + 1}, holding the number ${areaOf(piece)}. Put it back.`,
    )
  })

  it('counts the numbers still waiting for a piece, then the bare squares', () => {
    const first = start(level, seed)
    playing(first)
    expect(screen.getByText('7 numbers still need a piece.')).toBeInTheDocument()
    const piece = answerFor(first)[0]
    fireEvent.click(squareAt(first, piece.r0 * first.n + piece.c0))
    fireEvent.click(squareAt(first, piece.r1 * first.n + piece.c1))
    expect(screen.getByText('6 numbers still need a piece.')).toBeInTheDocument()
  })

  it('says so, in words and out loud, when a piece lands breaking a rule', () => {
    const board = hand()
    playing(board)
    // The whole top row: a 2 and a 4 under one piece.
    fireEvent.click(squareAt(board, 0))
    fireEvent.click(squareAt(board, 3))
    const said = 'This piece has more than one number on it.'
    expect(status()).toBe(said)
    expect(screen.getAllByText(said)).toHaveLength(2)
    const slab = slabAt(rect(0, 0, 0, 3))
    expect(slab).toHaveAttribute('data-fault', 'true')
    expect(slab.getAttribute('aria-label')).toContain(', breaking a rule.')

    // Take it back off and there is nothing left to say.
    fireEvent.click(slab)
    expect(status()).toBe('')
  })

  it('lights the whole piece and shakes the two numbers at fault', () => {
    const board = hand()
    playing(board)
    fireEvent.click(squareAt(board, 0))
    fireEvent.click(squareAt(board, 3))
    expect(wearing(cues.highlight)).toEqual([slabAt(rect(0, 0, 0, 3))])
    const shaking = wearing(cues.shake)
    expect(shaking).toHaveLength(2)
    expect(shaking.map((mark) => mark.textContent)).toEqual(['2', '4'])
  })

  it('counts the squares out loud when a piece is the wrong size', () => {
    const board = hand()
    playing(board)
    fireEvent.click(squareAt(board, 0))
    fireEvent.click(squareAt(board, 2))
    expect(status()).toBe('This piece has 3 squares, not 2.')
    expect(wearing(cues.highlight)).toHaveLength(1)
    // Nothing shakes: one number, and the light over its squares is the count.
    expect(wearing(cues.shake)).toHaveLength(0)
  })

  it('takes the light off again and leaves the sentence and the clay ring standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const board = hand()
      playing(board)
      fireEvent.click(squareAt(board, 1))
      fireEvent.click(squareAt(board, 2))
      expect(wearing(cues.highlight)).toHaveLength(1)

      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(slabAt(rect(0, 1, 0, 2))).toHaveAttribute('data-fault', 'true')
      expect(status()).toBe('This piece has no number on it.')
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('offers the rectangle that runs over a piece, then refuses it and keeps the corner', () => {
    const first = start(level, seed)
    const piece = answerFor(first)[0]
    const board = reduce(first, placing(first.n, piece))
    const { dispatch } = show(board)
    // A free square, and then a square of the piece already broken off.
    const free = board.clues.map((_, i) => i).find((i) => ownerOf(board)[i] === -1) as number
    fireEvent.click(squareAt(board, free))
    expect(slabAt(piece)).toBeEnabled()
    fireEvent.click(slabAt(piece))
    expect(dispatch).not.toHaveBeenCalled()
    expect(status()).toContain('A piece is already broken off there.')
    // Nothing moved, so the corner is still marked and the next tap is heard.
    expect(squareAt(board, free)).toHaveAttribute('data-marked', 'true')
  })

  it('goes dead on that one move instead, once forbidden moves are turned off', () => {
    const first = start(level, seed)
    const piece = answerFor(first)[0]
    const board = reduce(first, placing(first.n, piece))
    const { dispatch } = show(board, false, false)
    const free = board.clues.map((_, i) => i).find((i) => ownerOf(board)[i] === -1) as number
    fireEvent.click(squareAt(board, free))
    expect(slabAt(piece)).toBeDisabled()
    expect(slabAt(piece).getAttribute('aria-label')).toMatch(
      /^A piece is already broken off there\. Piece of /,
    )
    fireEvent.click(slabAt(piece))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('walks the arrow keys square to square, and keeps exactly one tab stop', () => {
    const { state } = show(start(level, seed))
    const corner = squareAt(state, 0)
    corner.focus()
    fireEvent.keyDown(corner, { key: 'ArrowRight' })
    const moved = document.activeElement as HTMLElement
    expect(moved).toBe(squareAt(state, 1))
    const stops = screen.getAllByRole('button').filter((el) => el.tabIndex === 0)
    expect(stops).toEqual([moved])

    // And it stops at the edge rather than wrapping round to the next row.
    fireEvent.keyDown(moved, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(moved)
  })

  it('walks the cursor into the middle of a piece and finds the piece there', () => {
    const first = start(level, seed)
    const piece = answerFor(first).find((p) => areaOf(p) > 2) as Piece
    const board = reduce(first, placing(first.n, piece))
    show(board)
    const slab = slabAt(piece)
    const grid = document.querySelector('[role="group"]') as HTMLElement

    // Walk from the top-left corner down and across to the piece's *last*
    // square, which is not the corner the piece is named by. A piece that
    // registered only its top-left would leave dead cursor positions inside
    // every big piece, and the arrow keys would look broken on exactly the
    // boards that have one.
    squareAt(board, 0).focus()
    for (let step = 0; step < piece.r1; step++) fireEvent.keyDown(grid, { key: 'ArrowDown' })
    for (let step = 0; step < piece.c1; step++) fireEvent.keyDown(grid, { key: 'ArrowRight' })

    expect(piece.r1 * board.n + piece.c1).not.toBe(piece.r0 * board.n + piece.c0)
    expect(document.activeElement).toBe(slab)
    const stops = screen.getAllByRole('button').filter((el) => el.tabIndex === 0)
    expect(stops).toEqual([slab])
  })

  it('ignores every input while it is locked', () => {
    const { state, dispatch } = show(start(level, seed), true)
    const square = squareAt(state, 0)
    expect(square).toBeDisabled()
    fireEvent.click(square)
    fireEvent.keyDown(square, { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })

  it('draws a solved bar without a word of celebration', () => {
    const first = start(level, seed)
    const done = play(first, solutionActions(first))
    const { view } = show(done, true)
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(status()).toBe('')
    expect(view.container.querySelector(`.${cues.highlight}`)).toBeNull()
  })
})

/* ============================================================
   The meta
   ============================================================ */

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(shikaku.id).toBe('shikaku')
    expect(shikaku.reseedable).toBe(true)
    /**
     * A piece in the wrong place is not a dead end here — it is put back, not
     * stepped back from — so there is deliberately no failure().
     *
     * The one that would be worth writing is a check that every number left
     * still has a shape it could take, and it fires on three quarters to nine
     * tenths of the wrong-but-legal pieces a child can break off, on the move
     * they land. `PuzzlePage.tsx` locks the board the moment `failure` is
     * non-null, so that check is a per-placement answer key: tap anything, and
     * whatever does not kill the board was right. The three rules a child was
     * actually told are made loud instead, in clay and in a sentence, and a
     * good piece that is simply not in the answer lands in silence.
     */
    expect(shikaku.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(shikaku.instructions.length).toBeGreaterThanOrEqual(2)
    expect(shikaku.instructions.length).toBeLessThanOrEqual(4)
    for (const line of shikaku.instructions) expect(line.length).toBeLessThanOrEqual(80)
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
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.config.pieces)).toEqual([7, 9, 11])
    const floors = levels.map((l) => l.config.minRounds)
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
    for (const level of levels) {
      // Two squares is the smallest piece, and no level prints a 1.
      expect(level.config.maxArea).toBeGreaterThan(2)
      expect(level.config.maxArea).toBeLessThanOrEqual(level.config.n * 2)
    }
  })
})
