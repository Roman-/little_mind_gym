import { readFileSync } from 'node:fs'
import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng, randInt, shuffled } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import { underSettings } from '../../test/settings'
import type { PuzzleLevel, Rng } from '../../lib/types'
import { hiddenBoats } from './index'
import { Board } from './Board'
import { HiddenBoatsIcon } from './glyphs'
import type { BoatsAction, BoatsConfig, BoatsState, Clash, Deal, Deduction, Piece } from './logic'
import {
  CARD,
  blockedCells,
  boatCount,
  canPlace,
  clashOf,
  cluesOf,
  colCells,
  colOf,
  countLayouts,
  countSolutions,
  deal,
  describeClash,
  describeMove,
  diagonal,
  draw,
  fits,
  fleetOnBoard,
  fleetTotal,
  hullOf,
  init,
  isSolved,
  legalMoves,
  numbersMet,
  openEnds,
  orthogonal,
  placementsOf,
  reasonedOut,
  reduce,
  refusalOf,
  rowCells,
  rowOf,
  runsOf,
  shapeAt,
  solveByLogic,
  touching,
} from './logic'

const levels = hiddenBoats.levels as PuzzleLevel<BoatsConfig>[]
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/**
 * Every board is dealt once and shared. Several blocks below walk the same
 * sixty seeds, and dealing them is the most expensive thing in this file:
 * about 0.07, 0.37 and 0.3 seconds for the sixty at four, six and seven
 * boats, measured on a machine at a load of a hundred. The deal is kept rather
 * than the state because it carries the answer it was drawn from.
 */
const dealt = new Map<string, Deal>()
function dealFor(level: PuzzleLevel<BoatsConfig>, seed: number): Deal {
  const key = `${level.id}:${seed}`
  let found = dealt.get(key)
  if (found === undefined) {
    found = deal(makeRng(seed), level.config)
    dealt.set(key, found)
  }
  return found
}

/** The opening position of a dealt board, built the way `init` builds it. */
const stateOf = (config: BoatsConfig, board: Deal): BoatsState => ({
  n: config.n,
  fleet: config.fleet,
  rowClues: board.rowClues,
  colClues: board.colClues,
  printed: board.printed,
  boats: board.printed.map((piece) => piece !== null),
})

const start = (level: PuzzleLevel<BoatsConfig>, seed: number) => stateOf(level.config, dealFor(level, seed))

/** The one answer, worked out the way a child would. */
const answerFor = (state: BoatsState) =>
  (solveByLogic(state.n, state.fleet, state.rowClues, state.colClues, state.printed) as Deduction).boats

/** Puts down every boat square of the answer that is not printed. Each one is exactly one move. */
const solutionActions = (state: BoatsState): BoatsAction[] =>
  answerFor(state)
    .map((boat, index) => (boat && state.printed[index] === null ? index : -1))
    .filter((index) => index >= 0)
    .map((index) => ({ type: 'toggle', index }))

const play = (state: BoatsState, actions: BoatsAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** Real positions: the answer put down a square at a time, from the opening one to the solved one. */
function positions(first: BoatsState): BoatsState[] {
  const out = [first]
  for (const action of solutionActions(first)) out.push(reduce(out[out.length - 1], action))
  return out
}

const toggle = (state: BoatsState, index: number) => reduce(state, { type: 'toggle', index })
const boatsAt = (size: number, cells: readonly number[]) =>
  Array.from({ length: size }, (_, i) => cells.includes(i))
const squaresOf = (boats: boolean[]) => boats.map((boat, i) => (boat ? i : -1)).filter((i) => i >= 0)
const keyOf = (state: BoatsState) => state.boats.map((boat) => (boat ? '1' : '0')).join('')
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * The printed ends that point at a square with nothing printed on it, worked
 * out here rather than asked of `openEnds`: the square an end points at is one
 * row or one column along, the way its boat runs on.
 */
const endsThatPoint = (n: number, printed: (Piece | null)[]) =>
  printed.filter((piece, i) => {
    if (piece === null || piece === 'single' || piece === 'middle') return false
    const along = { up: i - n, down: i + n, left: i - 1, right: i + 1 }[piece]
    return printed[along] === null
  }).length

/**
 * A hand-built five-by-five sea with the first level's fleet, every number set
 * to 5 so no line gets in the way, and nothing printed unless a test says so.
 * A test can then say which square breaks which rule rather than hunting for
 * one. Squares are counted in reading order from 0: square 12 is the middle.
 */
const sea = (boats: number[], printed: Record<number, Piece> = {}): BoatsState => ({
  n: 5,
  fleet: [3, 2, 1, 1],
  rowClues: [5, 5, 5, 5, 5],
  colClues: [5, 5, 5, 5, 5],
  printed: Array.from({ length: 25 }, (_, i) => printed[i] ?? null),
  boats: Array.from({ length: 25 }, (_, i) => boats.includes(i) || printed[i] !== undefined),
})

/**
 * Two dealt boards, copied out by hand so that nothing here rests on the path
 * the generator's rng happens to take. Both are four boats, each has one
 * answer, and each takes three passes with one fit step on the boat of three.
 *
 *   fixture A (four boats, seed 1000)      fixture B (four boats, seed 1111)
 *
 *       2 1 1 0 3                              1 0 3 0 3
 *     1 . . x . .                            1 . . . . x
 *     1 o . . . .       o a whole boat       1 . . x . .
 *     1 . . . . v       v a top end          1 . . x . .
 *     3 x x . . x       ^ a bottom end       3 x . ^ . x
 *     1 . . . . x                            1 . . . . ^
 *
 * Each also has an impostor: a position a player can reach with every number
 * met that is still not an answer. A's has five boats, three of them boats of
 * one, and its printed end stands alone. B's has exactly the fleet's lengths —
 * and its printed bottom end stands alone all the same.
 */
const A = {
  rowClues: [1, 1, 1, 3, 1],
  colClues: [2, 1, 1, 0, 3],
  printed: { 5: 'single', 14: 'down' } as Record<number, Piece>,
  answer: [2, 5, 14, 15, 16, 19, 24],
  impostor: [4, 5, 14, 15, 16, 17, 24],
}
const B = {
  rowClues: [1, 1, 1, 3, 1],
  colClues: [1, 0, 3, 0, 3],
  printed: { 17: 'up', 24: 'up' } as Record<number, Piece>,
  answer: [4, 7, 12, 15, 17, 19, 24],
  impostor: [2, 7, 14, 15, 17, 19, 24],
}

const fixture = (which: typeof A, boats: number[] = []): BoatsState => ({
  ...sea(boats, which.printed),
  rowClues: which.rowClues,
  colClues: which.colClues,
})

/** Every position a player can reach from this one, found by walking every move that changes anything. */
function reachable(from: BoatsState): BoatsState[] {
  const seen = new Set([keyOf(from)])
  const out = [from]
  for (let k = 0; k < out.length; k++) {
    for (const action of legalMoves(out[k])) {
      const next = reduce(out[k], action)
      if (next === out[k] || seen.has(keyOf(next))) continue
      seen.add(keyOf(next))
      out.push(next)
    }
  }
  return out
}

/** The whole reachable graph of the first three four-boat boards, walked once and shared. */
const graphs = new Map<number, BoatsState[]>()
const graphOf = (seed: number) => {
  let found = graphs.get(seed)
  if (found === undefined) {
    found = reachable(start(levels[0], seed))
    graphs.set(seed, found)
  }
  return found
}

/**
 * Take away every boat square a player put down, then put the answer down in
 * reading order: the walk back out that proves no position is a dead end.
 * Returns the position it ends on and how many of the answer's squares the
 * board refused on the way.
 */
function walkOut(state: BoatsState, answer: boolean[]): { end: BoatsState; refused: number } {
  let cur = state
  for (let i = 0; i < cur.boats.length; i++) if (cur.boats[i] && cur.printed[i] === null) cur = toggle(cur, i)
  let refused = 0
  for (let i = 0; i < answer.length; i++) {
    if (!answer[i] || cur.boats[i]) continue
    const next = toggle(cur, i)
    if (next === cur) refused++
    cur = next
  }
  return { end: cur, refused }
}

/**
 * The answer with the corners of a rectangle swapped: two of its boat squares
 * in different rows and different columns taken away, and the squares at the
 * other two corners put down. Every row and every column keeps its count, so
 * every number is still met — and since each board has one answer, none of
 * these is an answer. Every tap goes through `reduce`, and a swap that the
 * board refuses any tap of is left out.
 */
function swapsOf(first: BoatsState, answer: boolean[]): BoatsState[] {
  const { n } = first
  const done = play(first, solutionActions(first))
  const mine = squaresOf(answer).filter((i) => first.printed[i] === null)
  const out: BoatsState[] = []
  for (const a of mine) {
    for (const b of mine) {
      if (a >= b || rowOf(n, a) === rowOf(n, b) || colOf(n, a) === colOf(n, b)) continue
      const p = rowOf(n, a) * n + colOf(n, b)
      const q = rowOf(n, b) * n + colOf(n, a)
      if (answer[p] || answer[q] || first.printed[p] !== null || first.printed[q] !== null) continue
      const away = toggle(toggle(done, a), b)
      const one = toggle(away, p)
      const two = toggle(one, q)
      if (one !== away && two !== one) out.push(two)
    }
  }
  return out
}

/** Random walks of legal moves on a six- and a seven-boat board, the positions kept, shared. */
const walks = new Map<string, BoatsState[][]>()
function walksOn(level: PuzzleLevel<BoatsConfig>): BoatsState[][] {
  let found = walks.get(level.id)
  if (found === undefined) {
    const rng = makeRng(11)
    const first = start(level, SEEDS[0])
    const moves = legalMoves(first)
    found = Array.from({ length: 20 }, () => {
      const path = [first]
      for (let m = 0; m < 200; m++) path.push(reduce(path[path.length - 1], moves[randInt(rng, moves.length)]))
      return path
    })
    walks.set(level.id, found)
  }
  return found
}

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, fleet, shown } = level.config

    it(`"${level.label}" lays out the fleet ${fleet.join(', ')} with no two boats touching, every seed`, () => {
      for (const seed of SEEDS) {
        const { answer } = dealFor(level, seed)
        expect(answer).toHaveLength(n * n)
        const lengths = runsOf(n, answer).map((run) => run.length)
        expect(lengths.sort((a, b) => b - a)).toEqual(fleet)
        for (const i of squaresOf(answer)) expect(diagonal(n, i).some((j) => answer[j])).toBe(false)
      }
    }, 20_000)

    it(`"${level.label}" prints ${shown} boat squares, each in the shape its own boat gives it, every seed`, () => {
      for (const seed of SEEDS) {
        const { printed, answer } = dealFor(level, seed)
        const marked = printed.map((piece, i) => (piece !== null ? i : -1)).filter((i) => i >= 0)
        expect(marked).toHaveLength(shown)
        for (const i of marked) expect(printed[i]).toBe(shapeAt(n, answer, i))
      }
    }, 20_000)

    it(`"${level.label}" reads its numbers off the answer it drew`, () => {
      for (const seed of SEEDS) {
        const { rowClues, colClues, answer } = dealFor(level, seed)
        for (let r = 0; r < n; r++) expect(rowClues[r]).toBe(rowCells(n, r).filter((i) => answer[i]).length)
        for (let c = 0; c < n; c++) expect(colClues[c]).toBe(colCells(n, c).filter((i) => answer[i]).length)
        expect(sum(rowClues)).toBe(sum(fleet))
      }
    }, 20_000)

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        const { rowClues, colClues, printed } = dealFor(level, seed)
        expect(countSolutions(n, fleet, rowClues, colClues, printed, 3)).toBe(1)
      }
    }, 20_000)

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const board = dealFor(level, seed)
        const reasoned = reasonedOut(level.config, board) as Deduction
        expect(reasoned).not.toBeNull()
        expect(reasoned.boats).toEqual(board.answer)
      }
    }, 20_000)

    it(`"${level.label}" cannot be finished with the numbers covered up, every seed`, () => {
      // The printed pieces on their own allow two fleets at least, so every
      // board a child is handed has to be counted.
      for (const seed of SEEDS) {
        expect(countLayouts(n, fleet, dealFor(level, seed).printed, 2)).toBeGreaterThanOrEqual(2)
      }
    }, 20_000)

    it(`"${level.label}" starts with only its printed squares on it, and is not already solved`, () => {
      for (const seed of SEEDS.slice(0, 10)) {
        const state = start(level, seed)
        expect(boatCount(state)).toBe(shown)
        expect(state.boats.every((boat, i) => boat === (state.printed[i] !== null))).toBe(true)
        expect(isSolved(state)).toBe(false)
      }
    }, 20_000)

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      // `init` itself, against the board the cache holds for that seed.
      expect(init(level, makeRng(SEEDS[0]))).toEqual(start(level, SEEDS[0]))
      expect(init(level, makeRng(SEEDS[0]))).toEqual(init(level, makeRng(SEEDS[0])))
      expect(start(level, SEEDS[0]).boats).not.toEqual(start(level, SEEDS[1]).boats)
    }, 20_000)

    it(`"${level.label}" sits inside its own band, every seed`, () => {
      // Since `fitAsked` is never empty, the lines and the printed pieces alone
      // stall on every board this deals: the fleet is always needed.
      const { minRounds, maxRounds, fitAsks, minZeros, minEnds, minLayouts } = level.config
      for (const seed of SEEDS) {
        const board = dealFor(level, seed)
        expect(fits(level.config, board)).toBe(true)
        const reasoned = reasonedOut(level.config, board) as Deduction
        expect(reasoned.rounds).toBeGreaterThanOrEqual(minRounds)
        expect(reasoned.rounds).toBeLessThanOrEqual(maxRounds)
        expect(reasoned.fitAsked).toEqual(fitAsks)
        expect(reasoned.fitAsked.length).toBeGreaterThan(0)
        expect([...board.rowClues, ...board.colClues].filter((clue) => clue === 0).length).toBeGreaterThanOrEqual(minZeros)
        expect(endsThatPoint(n, board.printed)).toBeGreaterThanOrEqual(minEnds)
        expect(countLayouts(n, fleet, board.printed, minLayouts)).toBeGreaterThanOrEqual(minLayouts)
      }
    }, 20_000)
  }

  it('deals a board for every level inside a blink', () => {
    // The tents and trees' bound. This seed deals in 12 to 19, 12 to 18 and 3
    // to 5 ms cold at a load of 95, and the worst of seeds 0 to 299 is 8, 24
    // and 15 ms at a load of 19.
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })

  it('meets the tightest band of the three from a hundred seeds', () => {
    // Six boats is the band that the fleets meet least often: 32 fleets in
    // 3,000 raw draws, where four boats meets 157 and seven boats 66. `deal`
    // looks at 94 fleets on average to fill it and 518 at its worst, against
    // 2,000. The sixty cached seeds and forty fresh ones all land inside it.
    const level = levels[1]
    for (const seed of SEEDS) expect(fits(level.config, dealFor(level, seed))).toBe(true)
    for (let seed = 0; seed < 40; seed++) expect(fits(level.config, deal(makeRng(seed), level.config))).toBe(true)
  }, 20_000)

  it('deals four boats with a 0, a printed end with a square to fill, and the boat of three to fit, over three hundred seeds', () => {
    // The first two hints send a child to the square a printed end points at
    // and to a 0, and the third to the boat of three, so every board has to
    // have all three. Gated, so a fallback would be the only way to miss one:
    // this is that walk. An end that points at another printed end would
    // not do — that is a whole boat of two, already down — and counted as an
    // end it was the only one on 50 of these 300 boards.
    const level = levels[0]
    for (let seed = 0; seed < 300; seed++) {
      const board = deal(makeRng(seed), level.config)
      expect(fits(level.config, board)).toBe(true)
      expect([...board.rowClues, ...board.colClues]).toContain(0)
      expect(endsThatPoint(5, board.printed)).toBeGreaterThan(0)
      expect((reasonedOut(level.config, board) as Deduction).fitAsked).toEqual([3])
      expect(countLayouts(5, level.config.fleet, board.printed, 3)).toBeGreaterThanOrEqual(3)
    }
  }, 20_000)

  it('keeps its promises when no board meets the band', () => {
    // A band that no board can meet, so the fallback is walked on purpose.
    // What comes back has given up the level's difficulty and nothing else: it
    // still reasons out, it still has one answer, and its par is still the
    // fleet's squares less the printed ones.
    const impossible: BoatsConfig = { ...levels[0].config, minRounds: 99 }
    const board = deal(makeRng(7), impossible)
    expect(fits(impossible, board)).toBe(false)
    expect(reasonedOut(impossible, board)).not.toBeNull()
    const { n, fleet, shown } = impossible
    expect(countSolutions(n, fleet, board.rowClues, board.colClues, board.printed, 3)).toBe(1)
    expect(board.printed.filter((piece) => piece !== null)).toHaveLength(shown)
    expect(squaresOf(board.answer)).toHaveLength(sum(fleet))
  })

  it('says so rather than hand back a board that it cannot vouch for', () => {
    // A boat of four will not lie on a three-wide sea, so no fleet is ever
    // laid at all, and there is no honest board left to hand back. Not two
    // boats of three: those fit a three by three, in its top and bottom rows.
    const airless: BoatsConfig = {
      n: 3,
      fleet: [4, 1],
      shown: 1,
      minRounds: 0,
      maxRounds: 99,
      fitAsks: [],
      minZeros: 0,
      minEnds: 0,
      minLayouts: 0,
    }
    expect(() => deal(makeRng(3), airless)).toThrow(/came out by reasoning/)
  })

  it('counts a printed end only where it points at a square with nothing printed on it', () => {
    // Two ends facing each other are a whole boat of two: neither hands a
    // child a square. One of them alone, or either one of a boat of three's
    // ends, points at a square that is theirs to fill.
    const facing = sea([], { 11: 'right', 12: 'left' }).printed
    expect(openEnds(5, facing)).toBe(0)
    expect(openEnds(5, sea([], { 11: 'right' }).printed)).toBe(1)
    expect(openEnds(5, sea([], { 2: 'down', 12: 'up', 20: 'single' }).printed)).toBe(2)
    expect(openEnds(5, sea([], { 7: 'middle', 20: 'single' }).printed)).toBe(0)
    // And on every board the first sixty seeds deal, it agrees with the count
    // this file makes for itself.
    for (const level of levels) {
      for (const seed of SEEDS) {
        const { printed } = dealFor(level, seed)
        expect(openEnds(level.config.n, printed)).toBe(endsThatPoint(level.config.n, printed))
      }
    }
  }, 20_000)

  /** Every fleet on an empty five-by-five sea, the slow way: every boat at every place, none touching. */
  const everyFleet = (() => {
    let found: boolean[][] | null = null
    return () => {
      if (found !== null) return found
      const fleet = [3, 2, 1, 1]
      const out: boolean[][] = []
      const board = new Array<boolean>(25).fill(false)
      const walk = (k: number, from: number) => {
        if (k === fleet.length) {
          out.push(board.slice())
          return
        }
        const list = placementsOf(5, fleet[k])
        for (let at = k > 0 && fleet[k - 1] === fleet[k] ? from : 0; at < list.length; at++) {
          const cells = list[at]
          if (cells.some((i) => board[i] || touching(5, i).some((j) => board[j]))) continue
          for (const i of cells) board[i] = true
          walk(k + 1, at + 1)
          for (const i of cells) board[i] = false
        }
      }
      walk(0, 0)
      found = out
      return out
    }
  })()

  const keeps = (printed: (Piece | null)[]) => (board: boolean[]) =>
    printed.every((piece, i) => piece === null || shapeAt(5, board, i) === piece)

  it('counts layouts the way a plain enumeration does', () => {
    const boards = [fixture(A), fixture(B), ...SEEDS.slice(0, 3).map((seed) => start(levels[0], seed))]
    for (const { printed } of boards) {
      expect(countLayouts(5, [3, 2, 1, 1], printed)).toBe(everyFleet().filter(keeps(printed)).length)
    }
  })

  it('counts answers the way a plain enumeration does', () => {
    for (const board of [fixture(A), fixture(B)]) {
      const { rowClues, colClues, printed } = board
      const answers = everyFleet()
        .filter(keeps(printed))
        .filter((boats) => {
          const clues = cluesOf(5, boats)
          return clues.rowClues.join() === rowClues.join() && clues.colClues.join() === colClues.join()
        })
      expect(answers).toHaveLength(1)
      expect(countSolutions(5, [3, 2, 1, 1], rowClues, colClues, printed, 3)).toBe(answers.length)
    }
    // And a board with its numbers read off two fleets at once has more than
    // one answer, which both counts see.
    const loose = { ...fixture(A), printed: fixture(A).printed.map(() => null) }
    const byHand = everyFleet().filter((boats) => {
      const clues = cluesOf(5, boats)
      return clues.rowClues.join() === A.rowClues.join() && clues.colClues.join() === A.colClues.join()
    }).length
    expect(byHand).toBeGreaterThan(1)
    expect(countSolutions(5, [3, 2, 1, 1], A.rowClues, A.colClues, loose.printed, 100)).toBe(byHand)
  })
})

describe('the rules', () => {
  it('refuses a boat that turns a corner, says so, and lights the whole boat', () => {
    // An L: a boat of two across, and a square under its right-hand end.
    const bent = clashOf(sea([6, 7]), 12) as Clash
    expect(bent).toMatchObject({ kind: 'bend', cells: [12, 6, 7] })
    expect(describeClash(bent, [3, 2, 1, 1])).toBe('A boat cannot turn a corner.')
    // A T: a boat of three across, and a square under its middle.
    expect(clashOf(sea([6, 7, 8]), 12)).toMatchObject({ kind: 'bend', cells: [12, 6, 7, 8] })
  })

  it('refuses a boat square at the corner of another boat, and lights the two of them', () => {
    const touch = clashOf(sea([6]), 12) as Clash
    expect(touch).toMatchObject({ kind: 'corner', cells: [12, 6] })
    expect(describeClash(touch, [3, 2, 1, 1])).toBe('This boat would touch another boat at a corner.')
  })

  it('calls a boat that grows into another boat’s corner a corner, not a bend', () => {
    // Square 12 would grow the boat at 13 leftwards, into the corner of the
    // boat at 6. The boat it joins does not turn; it touches another one.
    expect(clashOf(sea([6, 13]), 12)).toMatchObject({ kind: 'corner', cells: [12, 6] })
  })

  it('lets a boat square go beside another one, because that is one boat growing', () => {
    const one = sea([12])
    for (const i of [7, 11, 13, 17]) {
      expect(clashOf(one, i)).toBeNull()
      expect(canPlace(one, i)).toBe(true)
    }
    // And between two boats in one line, with nothing at its corners, it joins
    // them into one: only the length can refuse that.
    const apart = sea([11, 13])
    expect(clashOf(apart, 12)).toBeNull()
    expect(runsOf(5, toggle(apart, 12).boats)).toEqual([[11, 12, 13]])
  })

  it('refuses a boat longer than the longest in the fleet, and lights the whole run', () => {
    const long = clashOf(sea([0, 1, 2]), 3) as Clash
    expect(long).toMatchObject({ kind: 'long', cells: [0, 1, 2, 3] })
    expect(describeClash(long, [3, 2, 1, 1])).toBe('The longest boat is 3 squares long.')
    // Down a column too, and when the square joins two boats into one too long.
    expect(clashOf(sea([2, 7, 12]), 17)).toMatchObject({ kind: 'long', cells: [2, 7, 12, 17] })
    expect(clashOf(sea([10, 11, 13]), 12)).toMatchObject({ kind: 'long', cells: [10, 11, 12, 13] })
    expect(describeClash(long, [4, 3, 2, 2, 1, 1, 1])).toBe('The longest boat is 4 squares long.')
  })

  it('does not refuse a second boat as long as the longest, and leaves an outline empty instead', () => {
    const state = sea([0, 1, 2, 15, 16])
    const next = toggle(state, 17)
    expect(next).not.toBe(state)
    expect(fleetOnBoard(next)).toEqual([true, false, false, false])
    expect(isSolved(next)).toBe(false)
  })

  it('refuses every side of a printed one-square boat', () => {
    const state = sea([], { 12: 'single' })
    for (const i of [7, 11, 13, 17]) {
      const clash = clashOf(state, i) as Clash
      expect(clash).toMatchObject({ kind: 'shape', rule: 'single', cells: [i, 12] })
      expect(describeClash(clash, state.fleet)).toBe('This boat is only one square long.')
    }
  })

  it('refuses the square beyond a printed end’s tip, and the squares beside it, and takes the one it points at', () => {
    // An end that points right: the rest of its boat lies to its right.
    const right = sea([], { 12: 'right' })
    expect(clashOf(right, 13)).toBeNull()
    const tip = clashOf(right, 11) as Clash
    expect(tip).toMatchObject({ kind: 'shape', rule: 'tip', cells: [11, 12] })
    expect(describeClash(tip, right.fleet)).toBe('This boat ends at the printed square.')
    for (const i of [7, 17]) {
      const side = clashOf(right, i) as Clash
      expect(side).toMatchObject({ kind: 'shape', rule: 'across', cells: [i, 12] })
      expect(describeClash(side, right.fleet)).toBe('This boat goes across, not up and down.')
    }
    // And one that points down, the top end of a boat.
    const down = sea([], { 12: 'down' })
    expect(clashOf(down, 17)).toBeNull()
    expect(clashOf(down, 7)).toMatchObject({ kind: 'shape', rule: 'tip' })
    for (const i of [11, 13]) {
      const side = clashOf(down, i) as Clash
      expect(side).toMatchObject({ kind: 'shape', rule: 'down', cells: [i, 12] })
      expect(describeClash(side, down.fleet)).toBe('This boat goes up and down, not across.')
    }
  })

  it('lets a printed middle go either way until one is taken, but not off the edge of the board', () => {
    const middle = sea([], { 12: 'middle' })
    for (const i of [7, 11, 13, 17]) expect(clashOf(middle, i)).toBeNull()
    // Once it runs across, a square above it would bend that boat.
    expect(clashOf(toggle(middle, 11), 7)).toMatchObject({ kind: 'bend' })
    // On the top edge it can only run across, and on the left edge only down.
    const top = sea([], { 2: 'middle' })
    expect(clashOf(top, 1)).toBeNull()
    expect(clashOf(top, 3)).toBeNull()
    const off = clashOf(top, 7) as Clash
    expect(off).toMatchObject({ kind: 'shape', rule: 'across', cells: [7, 2] })
    expect(describeClash(off, top.fleet)).toBe('This boat goes across, not up and down.')
    const edge = sea([], { 10: 'middle' })
    expect(clashOf(edge, 5)).toBeNull()
    expect(clashOf(edge, 15)).toBeNull()
    expect(clashOf(edge, 11)).toMatchObject({ kind: 'shape', rule: 'down', cells: [11, 10] })
  })

  it('reports the rule a child sees first, and only that one', () => {
    // Square 12 would bend the boat at 6 and 7 and stand against the printed
    // boat of one at 17: the bend is said.
    expect(clashOf(sea([6, 7], { 17: 'single' }), 12)?.kind).toBe('bend')
    // At the corner of 6 and against the printed 17: the corner is said.
    expect(clashOf(sea([6], { 17: 'single' }), 12)?.kind).toBe('corner')
    // Against the printed 14, and joining 10 to 14 into a boat of five: the
    // printed piece is said.
    expect(clashOf(sea([10, 11, 12], { 14: 'single' }), 13)?.kind).toBe('shape')
  })

  it('never refuses a square for its row or its column', () => {
    // Column 4 of fixture A wants no boat squares at all, and a boat square
    // still lands in it: a line past its number is the child's to count.
    const state = fixture(A)
    expect(state.colClues[3]).toBe(0)
    expect(clashOf(state, 3)).toBeNull()
    const over = toggle(state, 3)
    expect(over).not.toBe(state)
    expect(numbersMet(over)).toBe(false)
    // And across every position of a random walk, the only kinds of refusal
    // there are the four about a boat's shape.
    const kinds = new Set<string>()
    for (const path of walksOn(levels[1])) {
      for (const position of path.slice(0, 40)) {
        for (let i = 0; i < position.boats.length; i++) {
          const clash = clashOf(position, i)
          if (clash !== null) kinds.add(clash.kind)
        }
      }
    }
    expect([...kinds].sort()).toEqual(['bend', 'corner', 'long', 'shape'])
  }, 20_000)

  it('offers a forbidden boat square, with the sentence that hands it back', () => {
    const cases: [BoatsState, number, string][] = [
      [sea([6, 7]), 12, 'A boat cannot turn a corner.'],
      [sea([6]), 12, 'This boat would touch another boat at a corner.'],
      [sea([], { 12: 'single' }), 13, 'This boat is only one square long.'],
      [sea([], { 12: 'right' }), 11, 'This boat ends at the printed square.'],
      [sea([], { 12: 'right' }), 7, 'This boat goes across, not up and down.'],
      [sea([], { 12: 'down' }), 11, 'This boat goes up and down, not across.'],
      [sea([0, 1, 2]), 3, 'The longest boat is 3 squares long.'],
    ]
    for (const [state, index, message] of cases) {
      const no = refusalOf(state, index)
      expect(no?.message).toBe(message)
      expect(no?.clash).toEqual(clashOf(state, index))
      // The position the tap pretends to reach: the boat square stands where
      // the child put it, on a board the puzzle itself never takes.
      expect(no?.pretend.boats[index]).toBe(true)
      expect(no?.pretend.printed).toBe(state.printed)
      expect(state.boats[index]).toBe(false)
    }
    // And there is nothing to refuse where the square takes it, or where a
    // boat square is coming away.
    expect(refusalOf(sea([]), 12)).toBeNull()
    expect(refusalOf(sea([12]), 12)).toBeNull()
  })

  it('says nothing about a square that already holds a boat, a printed square, or a square off the board', () => {
    const state = sea([6], { 18: 'single' })
    expect(clashOf(state, 6)).toBeNull()
    expect(clashOf(state, 18)).toBeNull()
    for (const index of [-1, 25, 1.5, Number.NaN]) {
      expect(clashOf(state, index)).toBeNull()
      expect(canPlace(state, index)).toBe(false)
    }
    expect(canPlace(state, 6)).toBe(false)
    expect(canPlace(state, 18)).toBe(false)
  })

  it('keeps every boat a straight line on every position a player can reach', () => {
    // The whole reachable graph of three four-boat boards: 2,640, 1,704 and
    // 1,136 positions. Two boat squares that share an edge are one boat, and no
    // two boat squares ever meet at a corner, so every run is a straight line
    // and none is longer than the longest boat.
    const crooked: string[] = []
    for (const seed of SEEDS.slice(0, 3)) {
      for (const state of graphOf(seed)) {
        const touch = squaresOf(state.boats).some((i) => diagonal(5, i).some((j) => state.boats[j]))
        const bad = runsOf(5, state.boats).some(
          (run) =>
            run.length > 3 ||
            !(run.every((i) => rowOf(5, i) === rowOf(5, run[0])) || run.every((i) => colOf(5, i) === colOf(5, run[0]))),
        )
        if (touch || bad) crooked.push(keyOf(state))
      }
    }
    expect(SEEDS.slice(0, 3).map((seed) => graphOf(seed).length)).toEqual([2640, 1704, 1136])
    expect(crooked).toEqual([])
  }, 30_000)

  it('draws a refused bend’s corner as a block', () => {
    const { pretend } = refusalOf(sea([6, 7]), 12) as { pretend: BoatsState }
    expect(hullOf(pretend, 6)).toBe('end-right')
    expect(hullOf(pretend, 7)).toBe('block')
    expect(hullOf(pretend, 12)).toBe('end-up')
    // And on a position the board really holds, a boat reads end, middle, end.
    const boat = sea([6, 7, 8])
    expect([6, 7, 8].map((i) => hullOf(boat, i))).toEqual(['end-right', 'across', 'end-left'])
    const down = sea([2, 7, 12])
    expect([2, 7, 12].map((i) => hullOf(down, i))).toEqual(['end-down', 'down', 'end-up'])
    expect(hullOf(sea([12]), 12)).toBe('single')
    expect(hullOf(sea([12]), 13)).toBeNull()
  })

  it('draws a printed piece in its own shape, whatever stands round it', () => {
    expect(hullOf(sea([], { 12: 'single' }), 12)).toBe('single')
    expect(hullOf(sea([], { 12: 'down' }), 12)).toBe('end-down')
    // A printed middle is a block until one neighbour says which way it runs.
    const middle = sea([], { 12: 'middle' })
    expect(hullOf(middle, 12)).toBe('block')
    expect(hullOf(toggle(middle, 13), 12)).toBe('across')
    expect(hullOf(toggle(middle, 17), 12)).toBe('down')
  })
})

describe('reduce', () => {
  it('puts a boat square down and takes it away again', () => {
    const state = sea([])
    const down = toggle(state, 12)
    expect(down.boats[12]).toBe(true)
    expect(down.printed).toBe(state.printed)
    expect(down.rowClues).toBe(state.rowClues)
    const away = toggle(down, 12)
    expect(away.boats[12]).toBe(false)
    expect(away.boats).toEqual(state.boats)
  })

  it('hands back the very same state for an action that is not one', () => {
    const state = sea([], { 12: 'single' })
    expect(reduce(state, null as unknown as BoatsAction)).toBe(state)
    expect(reduce(state, { type: 'nudge' } as unknown as BoatsAction)).toBe(state)
    for (const index of [Number.NaN, -1, 25, 1.5]) expect(toggle(state, index)).toBe(state)
    // A printed square is not a control.
    expect(toggle(state, 12)).toBe(state)
  })

  it('hands back the very same state for a boat square that would break a rule', () => {
    const cases: [BoatsState, number][] = [
      [sea([6, 7]), 12], // bend
      [sea([6]), 12], // corner
      [sea([], { 12: 'single' }), 13], // shape
      [sea([0, 1, 2]), 3], // long
    ]
    for (const [state, index] of cases) expect(toggle(state, index)).toBe(state)
  })

  it('always lets a boat square be taken away', () => {
    // On every position of three whole four-boat graphs.
    let taken = 0
    const kept: string[] = []
    for (const seed of SEEDS.slice(0, 3)) {
      for (const state of graphOf(seed)) {
        for (let i = 0; i < state.boats.length; i++) {
          if (!state.boats[i] || state.printed[i] !== null) continue
          const away = toggle(state, i)
          if (away === state || away.boats[i]) kept.push(`${keyOf(state)} ${i}`)
          taken++
        }
      }
    }
    expect(kept).toEqual([])
    expect(taken).toBeGreaterThan(10_000)
  }, 30_000)
})

describe('isSolved', () => {
  it('will not call a board solved while a boat square is missing', () => {
    const short = fixture(A, A.answer.slice(0, -1))
    expect(isSolved(short)).toBe(false)
    expect(isSolved(fixture(A, A.answer))).toBe(true)
    expect(isSolved(fixture(B, B.answer))).toBe(true)
  })

  it('wants the fleet, not just the numbers', () => {
    // A's impostor: every number met, and five boats where four are wanted.
    const impostor = fixture(A, A.impostor)
    expect(numbersMet(impostor)).toBe(true)
    expect(runsOf(5, impostor.boats).map((run) => run.length)).toEqual([1, 1, 1, 3, 1])
    expect(isSolved(impostor)).toBe(false)
    // Three boats of two and one of one, where a boat of three is wanted — with
    // numbers read off that very board, so every number is met.
    const twos = [0, 1, 3, 8, 15, 16, 23]
    const wrong = { ...sea(twos), ...cluesOf(5, boatsAt(25, twos)) }
    expect(numbersMet(wrong)).toBe(true)
    expect(isSolved(wrong)).toBe(false)
    // And the fleet itself, the same way, is an answer.
    const fleet = [0, 1, 2, 4, 9, 15, 23]
    expect(isSolved({ ...sea(fleet), ...cluesOf(5, boatsAt(25, fleet)) })).toBe(true)
  })

  it('wants every printed piece kept', () => {
    // B's impostor has the fleet's lengths and every number met, but its
    // printed bottom end at 17 stands alone.
    const impostor = fixture(B, B.impostor)
    expect(numbersMet(impostor)).toBe(true)
    const lengths = runsOf(5, impostor.boats).map((run) => run.length)
    expect(lengths.sort((a, b) => b - a)).toEqual([3, 2, 1, 1])
    expect(shapeAt(5, impostor.boats, 17)).toBe('single')
    expect(isSolved(impostor)).toBe(false)
  })

  it('is worked out from the board alone, never from the board it was dealt', () => {
    for (const level of levels) {
      const first = start(level, SEEDS[4])
      const done = play(first, solutionActions(first))
      expect(isSolved(done)).toBe(true)
      // The same boats, one number changed: the same position is no longer an
      // answer, so nothing here is remembering how the board was made.
      const bent: BoatsState = { ...done, rowClues: done.rowClues.map((c, i) => (i === 0 ? c + 1 : c)) }
      expect(isSolved(bent)).toBe(false)
    }
  })
})

describe('par', () => {
  it('is the fleet’s squares less the printed ones', () => {
    expect(levels.map((level) => level.par)).toEqual([5, 7, 11])
    for (const level of levels) {
      expect(level.par).toBe(sum(level.config.fleet) - level.config.shown)
      for (const seed of SEEDS.slice(0, 4)) {
        const first = start(level, seed)
        expect(fleetTotal(first) - boatCount(first)).toBe(level.par)
      }
    }
  })

  it('cannot be beaten, because a move changes exactly one square', () => {
    /* The floor, checked by construction rather than asserted. A board starts
       with only its printed squares, which cannot be taken away; `isSolved`
       wants the fleet's squares; and every move that changes anything changes
       the count by exactly one. */
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 4)) {
        const path = positions(start(level, seed))
        for (const state of path) {
          for (const move of legalMoves(state)) {
            const next = reduce(state, move)
            if (next === state) continue
            expect(Math.abs(boatCount(next) - boatCount(state))).toBe(1)
          }
          if (isSolved(state)) expect(boatCount(state)).toBe(fleetTotal(state))
        }
        expect(isSolved(path[path.length - 1])).toBe(true)
        expect(boatCount(path[path.length - 1]) - boatCount(path[0])).toBe(level.par)
      }
    }
  })

  it('is reached, because the answer can be placed in any order', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 12)) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        // Every one of them is a real move, in the order they come and backwards.
        for (const order of [actions, [...actions].reverse()]) {
          let cur = first
          for (const action of order) {
            const next = reduce(cur, action)
            expect(next).not.toBe(cur)
            cur = next
          }
          expect(isSolved(cur)).toBe(true)
        }
      }
    }
  })

  it('has no shorter path than par under breadth-first search', () => {
    // Four boats only. Six boats fits under the search's cap on some seeds and
    // reaches 80% of it on others, and the floor and ceiling above prove par
    // without it.
    for (const seed of [1000, 1037]) {
      const path = shortestSolution<BoatsState, BoatsAction>({
        start: start(levels[0], seed),
        moves: legalMoves,
        apply: reduce,
        key: keyOf,
        solved: isSolved,
      })
      expect(path).toHaveLength(levels[0].par as number)
    }
  })

  it('is past what a search can reach at seven boats, which is why the floor and ceiling stand in', () => {
    expect(() =>
      reachableCount<BoatsState, BoatsAction>({
        start: start(levels[2], 1000),
        moves: legalMoves,
        apply: reduce,
        key: keyOf,
      }),
    ).toThrow(/too large/)
  }, 20_000)

  it('leaves no position a player can reach that cannot still be won', () => {
    // The proof that no `failure` and no `canStillWin` is owed. Take every
    // boat square the player put down away again — which is never refused —
    // and the answer goes down from there in any order: par moves, every one
    // of them taken. Every position of three whole four-boat graphs, and every
    // position of twenty walks of 200 moves at six and at seven boats.
    const stranded: string[] = []
    for (const seed of SEEDS.slice(0, 3)) {
      const answer = dealFor(levels[0], seed).answer
      for (const state of graphOf(seed)) {
        const { end, refused } = walkOut(state, answer)
        if (refused > 0 || !isSolved(end)) stranded.push(keyOf(state))
      }
    }
    let walked = 0
    for (const level of levels.slice(1)) {
      const answer = dealFor(level, SEEDS[0]).answer
      for (const path of walksOn(level)) {
        for (const state of path) {
          const { end, refused } = walkOut(state, answer)
          if (refused > 0 || !isSolved(end)) stranded.push(keyOf(state))
          walked++
        }
      }
    }
    expect(stranded).toEqual([])
    expect(walked).toBe(2 * 20 * 201)
  }, 30_000)
})

describe('what the board may say without being asked', () => {
  it('dots exactly the squares a boat square would be refused on', () => {
    // `blockedCells` is the fast form of `clashOf` over every square, so the
    // two are held to each other: a whole four-boat graph, and five walks of
    // 200 moves at six and at seven boats.
    const differ: string[] = []
    const check = (state: BoatsState) => {
      const dotted = blockedCells(state)
      for (let i = 0; i < dotted.length; i++) {
        if (dotted[i] !== (clashOf(state, i) !== null)) differ.push(`${keyOf(state)} ${i}`)
      }
    }
    graphOf(SEEDS[0]).forEach(check)
    for (const level of levels.slice(1)) for (const path of walksOn(level).slice(0, 5)) path.forEach(check)
    expect(differ).toEqual([])
  }, 20_000)

  it('never dots a square for a number', () => {
    // Column 4 of fixture A wants no boat squares, so its number is met before
    // anything goes down — and its top and bottom squares stay undotted. The
    // three that are dotted are dotted for the printed top end beside them:
    // two at its corners, and one against its long side.
    const state = fixture(A)
    const dotted = blockedCells(state)
    expect(colCells(5, 3).filter((i) => dotted[i])).toEqual([8, 13, 18])
    expect(clashOf(state, 8)).toMatchObject({ kind: 'corner', cells: [8, 14] })
    expect(clashOf(state, 13)).toMatchObject({ kind: 'shape', cells: [13, 14] })
    expect(clashOf(state, 18)).toMatchObject({ kind: 'corner', cells: [18, 14] })
    expect(dotted[3]).toBe(false)
    expect(dotted[23]).toBe(false)
  })

  it('never dots a square that the answer uses, on any position the answer goes through', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 6)) {
        const answer = dealFor(level, seed).answer
        for (const state of positions(start(level, seed))) {
          const dotted = blockedCells(state)
          for (let i = 0; i < answer.length; i++) if (answer[i]) expect(dotted[i]).toBe(false)
        }
      }
    }
  })

  it('fills in an outline for a boat of its length once every longer one is filled in, or once dots shut that boat in', () => {
    // An outside opinion of the strip. The boats are the runs that keep their
    // printed pieces; a boat is shut in when every square beside it is off
    // the board or one that `clashOf` would refuse — asked square by square,
    // not of the dots. Outlines of one length fill from the left of the strip.
    const wrong: string[] = []
    const check = (state: BoatsState) => {
      const { n, fleet, boats, printed } = state
      const found = fleetOnBoard(state)
      const whole = runsOf(n, boats).filter((run) =>
        run.every((i) => printed[i] === null || shapeAt(n, boats, i) === printed[i]),
      )
      const shut = whole.filter((run) =>
        run.every((i) => orthogonal(n, i).every((j) => boats[j] || clashOf(state, j) !== null)),
      )
      const of = (runs: number[][], length: number) => runs.filter((run) => run.length === length).length
      fleet.forEach((length, k) => {
        const before = fleet.slice(0, k).filter((l) => l === length).length
        const longer = fleet.every((l, j) => l <= length || found[j])
        if (found[k] !== before < of(longer ? whole : shut, length)) wrong.push(`${keyOf(state)} ${k}`)
      })
      // And shut in never moves the first outline still empty, which is the
      // one the fit step asks about: longest first alone, worked by hand here,
      // leaves the same one empty on every position.
      const alone: boolean[] = []
      fleet.forEach((length, k) => {
        const before = fleet.slice(0, k).filter((l) => l === length).length
        alone.push(before < of(whole, length) && fleet.every((l, j) => l <= length || alone[j]))
      })
      if (found.indexOf(false) !== alone.indexOf(false)) wrong.push(`${keyOf(state)} first`)
    }
    for (const level of levels.slice(1)) for (const path of walksOn(level).slice(0, 5)) path.forEach(check)
    graphOf(SEEDS[0]).forEach(check)
    expect(wrong).toEqual([])
    // A boat of two with an open square at its end waits for the boat of three.
    expect(fleetOnBoard(sea([15, 16]))).toEqual([false, false, false, false])
    expect(fleetOnBoard(sea([0, 1, 2, 15, 16]))).toEqual([true, true, false, false])
    expect(fleetOnBoard(sea([0, 1, 2, 15, 16, 24]))).toEqual([true, true, true, false])
    // Shut in by the edge and by a dot, it does not: square 2, the only
    // square its boat could still grow into, is at a corner of the boat at 8.
    expect(blockedCells(sea([0, 1, 8]))[2]).toBe(true)
    expect(fleetOnBoard(sea([0, 1, 8]))).toEqual([false, true, false, false])
    // And a printed boat of one is shut in by its own closed sides.
    expect(fleetOnBoard(sea([], { 12: 'single' }))).toEqual([false, false, true, false])
  }, 20_000)

  it('fills in the outline of a boat printed whole from the very first frame', () => {
    // A printed boat of one, or two printed ends that face each other, is a
    // boat on the board before the child has done anything. Longest first
    // alone left its outline empty on 223, 300 and 213 of the boards that
    // seeds 0 to 299 deal, so the strip said a boat that was plainly there
    // was still to find.
    let whole = 0
    let longer = 0
    for (const level of levels) {
      for (const seed of SEEDS) {
        const first = start(level, seed)
        const { n, fleet } = first
        const printedWhole = runsOf(n, first.boats)
          .filter((run) => run.every((i) => shapeAt(n, first.boats, i) === first.printed[i]))
          .map((run) => run.length)
        const found = fleetOnBoard(first)
        expect(fleet.filter((_, k) => found[k])).toEqual(printedWhole.sort((a, b) => b - a))
        whole += printedWhole.length
        longer += printedWhole.filter((length) => length > 1).length
      }
    }
    // Pinned, so the sixty boards a level are known to hold both kinds: 204
    // boats printed whole on 180 boards, and 46 of them two squares long.
    expect([whole, longer]).toEqual([204, 46])
  }, 20_000)

  it('never fills in an outline for part of a longer boat, and never empties one on a right tap', () => {
    // The answer placed in five random orders on four boards a level. Longest
    // first, an outline filled in always stands for a whole boat of the answer,
    // and once filled in it stays filled in for the rest of the solve.
    const rng = makeRng(5)
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 4)) {
        const first = start(level, seed)
        const { n } = first
        const answerRuns = runsOf(n, dealFor(level, seed).answer).map((run) => run.join())
        for (let order = 0; order < 5; order++) {
          let cur = first
          let was = fleetOnBoard(cur)
          for (const action of shuffled(rng, solutionActions(first))) {
            cur = reduce(cur, action)
            const found = fleetOnBoard(cur)
            found.forEach((filled, k) => {
              if (was[k]) expect(filled).toBe(true)
              if (!filled) return
              // As many whole answer boats of this length are down as outlines of it are filled.
              const length = cur.fleet[k]
              const whole = runsOf(n, cur.boats).filter((run) => run.length === length && answerRuns.includes(run.join()))
              expect(whole.length).toBeGreaterThanOrEqual(found.filter((f, j) => f && cur.fleet[j] === length).length)
            })
            was = found
          }
          expect(was.every(Boolean)).toBe(true)
        }
      }
    }
  })

  it('does not fill in an outline for a printed end that is still waiting for its boat', () => {
    // A's impostor: the boat of three is down, and the printed boat of one is
    // shut in by its own closed sides, but the printed top end at 14 stands
    // alone. It is no boat at all, so neither outline of one is its.
    expect(fleetOnBoard(fixture(A, A.impostor))).toEqual([true, false, true, false])
    expect(fleetOnBoard(fixture(B, B.impostor))).toEqual([true, true, true, false])
    // And the moment its boat arrives, the waiting end counts.
    expect(fleetOnBoard(fixture(A, A.answer))).toEqual([true, true, true, true])
  })

  it('is solved exactly when every number is met and every outline is filled in', () => {
    // The theorem above `fleetOnBoard`, on every reachable position of three
    // four-boat boards. It is what lets the numbers stay silent: the strip and
    // the note carry the are-you-done question without ever saying which line
    // is wrong.
    //
    // At six and seven boats a random walk never meets every number, not once
    // in 4,020 positions a level, and the theorem says nothing worth checking
    // about a position that meets none of them. So there it is also held on
    // the positions that do: the answer put down a square at a time, which
    // ends solved, and the answer with a rectangle's corners swapped, which
    // meets every number and is not solved — four boards a level.
    const meter = (state: BoatsState) => numbersMet(state) && fleetOnBoard(state).every(Boolean)
    const disagree: string[] = []
    let met = 0
    for (const seed of SEEDS.slice(0, 3)) {
      for (const state of graphOf(seed)) {
        if (isSolved(state) !== meter(state)) disagree.push(keyOf(state))
        if (numbersMet(state) && !isSolved(state)) met++
      }
    }
    const counted = levels.slice(1).map((level) => {
      let walkedMet = 0
      let metOnly = 0
      let solved = 0
      const check = (state: BoatsState) => {
        if (isSolved(state) !== meter(state)) disagree.push(keyOf(state))
        if (isSolved(state)) solved++
        else if (numbersMet(state)) metOnly++
      }
      for (const path of walksOn(level)) {
        path.forEach(check)
        walkedMet += path.filter(numbersMet).length
      }
      for (const seed of SEEDS.slice(0, 4)) {
        const first = start(level, seed)
        positions(first).forEach(check)
        swapsOf(first, dealFor(level, seed).answer).forEach(check)
      }
      return { walkedMet, metOnly, solved }
    })
    expect(disagree).toEqual([])
    // And the numbers alone are not enough: positions with every number met
    // that are not solved really are reached, and the strip is what says so.
    expect(met).toBeGreaterThan(0)
    expect(counted).toEqual([
      { walkedMet: 0, metOnly: 4, solved: 4 },
      { walkedMet: 0, metOnly: 15, solved: 4 },
    ])
  }, 30_000)
})

describe('the solver', () => {
  it('never finishes a board that has a second answer', () => {
    // Raw draws, before any band: whatever the solver finishes, the
    // independent count agrees has one answer.
    for (const level of levels) {
      const { n, fleet } = level.config
      const rng = makeRng(3)
      let finished = 0
      for (let k = 0; k < 300; k++) {
        const board = draw(rng, level.config)
        if (board === null) continue
        const { rowClues, colClues, printed } = board
        if (solveByLogic(n, fleet, rowClues, colClues, printed) === null) continue
        finished++
        expect(countSolutions(n, fleet, rowClues, colClues, printed, 2)).toBe(1)
      }
      expect(finished).toBeGreaterThan(100)
    }
  }, 20_000)

  it('asks the fit step about the boats its level names, longest first', () => {
    for (const level of levels) {
      const { fleet, fitAsks } = level.config
      expect(fitAsks).toEqual(fleet.slice(0, fitAsks.length))
      for (const seed of SEEDS) {
        expect((reasonedOut(level.config, dealFor(level, seed)) as Deduction).fitAsked).toEqual(fitAsks)
      }
    }
  }, 20_000)

  it('finds the drawn answer and nothing else on fixtures A and B, in three passes with one fit step on the boat of three', () => {
    // A small worked check that the three steps are the ones the hints teach:
    // on A, three squares by counting a line, one because the printed top end
    // points at it, and one by asking where the boat of three still fits.
    const a = fixture(A)
    const reasonedA = solveByLogic(5, a.fleet, a.rowClues, a.colClues, a.printed) as Deduction
    expect(squaresOf(reasonedA.boats)).toEqual(A.answer)
    expect(reasonedA).toMatchObject({ rounds: 3, fitAsked: [3], fitSquares: 1, shapeSquares: 1, lineSquares: 3 })
    const b = fixture(B)
    const reasonedB = solveByLogic(5, b.fleet, b.rowClues, b.colClues, b.printed) as Deduction
    expect(squaresOf(reasonedB.boats)).toEqual(B.answer)
    expect(reasonedB).toMatchObject({ rounds: 3, fitAsked: [3], fitSquares: 1, shapeSquares: 1 })
    for (const which of [A, B]) {
      const { rowClues, colClues, printed } = fixture(which)
      expect(countSolutions(5, [3, 2, 1, 1], rowClues, colClues, printed, 3)).toBe(1)
    }
  })
})

/* ============================================================
   The mindless players

   Why the numbers stay silent, measured on the boards this file
   deals. Each is a player who reads nothing but what the board
   says, run through `reduce`, so the taps counted here are the
   moves a child would make.
   ============================================================ */

const lineMet = (state: BoatsState, index: number) => {
  const { n, boats, rowClues, colClues } = state
  const r = rowOf(n, index)
  const c = colOf(n, index)
  return (
    rowCells(n, r).filter((i) => boats[i]).length >= rowClues[r] ||
    colCells(n, c).filter((i) => boats[i]).length >= colClues[c]
  )
}

/**
 * Tap every square once, in a random order, and keep whatever lands. With
 * `obey` it also skips a square whose row or column already holds its number
 * — exactly what a board that refused a boat square past a line's number would
 * hand it. Without, it stops once the board holds the fleet's squares, which
 * the strip under the board adds up for it.
 */
function sweep(from: BoatsState, rng: Rng, obey: boolean): BoatsState {
  let state = from
  for (const i of shuffled(rng, state.boats.map((_, k) => k))) {
    if (!obey && boatCount(state) >= fleetTotal(state)) break
    if (state.boats[i] || (obey && lineMet(state, i))) continue
    state = toggle(state, i)
  }
  return state
}

/**
 * Hill-climb on the strip: take the tap that fills in the most outlines, and
 * then the one that brings the board closest to the fleet's squares, and when
 * nothing improves, a random tap the board takes.
 */
function climb(from: BoatsState, rng: Rng, budget: number): boolean {
  let state = from
  const total = fleetTotal(state)
  const score = (s: BoatsState) => fleetOnBoard(s).filter(Boolean).length * 100 - Math.abs(total - boatCount(s))
  for (let move = 0; move < budget; move++) {
    if (isSolved(state)) return true
    let best: BoatsState | null = null
    let top = score(state)
    for (const i of shuffled(rng, state.boats.map((_, k) => k))) {
      if (state.printed[i] !== null) continue
      const next = toggle(state, i)
      if (next === state) continue
      const now = score(next)
      if (now > top) {
        top = now
        best = next
      }
    }
    if (best === null) {
      const open = state.boats
        .map((_, k) => k)
        .filter((i) => state.printed[i] === null && (state.boats[i] || clashOf(state, i) === null))
      state = toggle(state, open[randInt(rng, open.length)])
    } else {
      state = best
    }
  }
  return isSolved(state)
}

describe('the mindless players', () => {
  // Pinned, because these are measurements rather than bounds. The recipe:
  // the first thirty of SEEDS a level, one `makeRng(77)` a level for each
  // player. The spec's wider run — a hundred banded boards a level, seeds
  // 4242 + 37k, `makeRng(9)` — has a sweeper against a board that refuses past
  // a number landing 20, 9 and 0 in a single sweep and 100, 100 and 36 within
  // fifty times par, and this board's sweeper none in a single sweep and 13,
  // 0 and 0 within fifty times par.
  const landed = (player: (state: BoatsState, rng: Rng) => boolean) =>
    levels.map((level) => {
      const rng = makeRng(77)
      return SEEDS.slice(0, 30).filter((seed) => player(start(level, seed), rng)).length
    })

  it('lands a sweep that obeys the numbers, which is why the numbers never refuse', () => {
    expect(landed((state, rng) => isSolved(sweep(state, rng, true)))).toEqual([6, 5, 0])
  })

  it('never lands the same sweep against the board as it ships', () => {
    // Every square once again, with nothing to obey but the fleet's total.
    expect(landed((state, rng) => isSolved(sweep(state, rng, false)))).toEqual([0, 0, 0])
  })

  it('lets the strip climber home on four boats, and hardly anywhere else', () => {
    // Twelve boards and fifty times par. Four boats is left open on purpose:
    // a five-by-five sea with two printed pieces keeps a median of 59 fleets,
    // and a climber that reshuffles some fleet lands on the answer by luck (45
    // boards in 100 in the wider run). Six boats is gated at 1,600 fleets, and
    // lands none in 100 there. Seven boats lands 1 in 100 and is too slow for
    // the suite. A boat shut in by dots fills its outline, which the climber
    // scores, and it helps it very little: with longest first alone the wider
    // run lands 40, 4 and 0, and these twelve boards 4 and 0.
    const climbed = levels.slice(0, 2).map((level) => {
      const rng = makeRng(77)
      return SEEDS.slice(0, 12).filter((seed) => climb(start(level, seed), rng, 50 * (level.par as number))).length
    })
    expect(climbed).toEqual([6, 1])
  }, 20_000)
})

describe('describe', () => {
  it('names the square, in the past tense, both ways round', () => {
    const state = sea([])
    const down = toggle(state, 8)
    expect(describeMove(state, down, { type: 'toggle', index: 8 })).toBe('Put a boat square in row 2, column 4')
    expect(describeMove(down, state, { type: 'toggle', index: 8 })).toBe(
      'Took the boat square away from row 2, column 4',
    )
  })

  it('names the square the move actually changed, for every square', () => {
    const state = start(levels[1], SEEDS[5])
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      if (next === state) continue
      const changed = next.boats.findIndex((boat, i) => boat !== state.boats[i])
      expect(describeMove(state, next, action)).toContain(
        `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
      )
    }
  })
})

/* ============================================================
   The board
   ============================================================ */

const paint = (state: BoatsState, locked = false, allow = true) => {
  const dispatch = vi.fn()
  const view = render(createElement(Board, { state, dispatch, locked }), {
    wrapper: underSettings({ allowForbiddenMoves: allow }),
  })
  return {
    dispatch,
    view,
    by: (name: RegExp) => screen.getByRole('button', { name }),
    all: () => screen.getAllByRole('button') as HTMLButtonElement[],
  }
}

/** The board with the shell's job done for it: a state that answers back. */
const Play = ({ from }: { from: BoatsState }) => {
  const [state, setState] = useState(from)
  return createElement(Board, {
    state,
    dispatch: (action: BoatsAction) => setState((cur) => reduce(cur, action)),
    locked: false,
  })
}

const playing = (from: BoatsState) => render(createElement(Play, { from }), { wrapper: underSettings() })

const wearing = (cue: string) => [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

const hullIn = (el: Element) => el.querySelector('[data-hull]')?.getAttribute('data-hull') ?? null

describe('the board', () => {
  it('draws a button for every square that is not printed, and a flush piece for every printed one', () => {
    const { all } = paint(fixture(A))
    expect(all()).toHaveLength(25 - 2)
    for (const button of all()) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).toMatch(/^Row \d+, column \d+, (empty|a boat square)/)
    }
    // A printed square is not a control, and neither is a number.
    const single = screen.getByRole('img', { name: 'Row 2, column 1, printed, a whole boat one square long' })
    const end = screen.getByRole('img', { name: 'Row 3, column 5, printed, the top end of a boat' })
    for (const piece of [single, end]) {
      expect(piece.tagName).not.toBe('BUTTON')
      expect(piece.className).not.toContain('u-press')
    }
    expect(screen.getAllByRole('img')).toHaveLength(2 + 10)
    // Each end is named by where it stands on its boat.
    cleanup()
    paint(sea([], { 0: 'right', 4: 'left', 20: 'up', 12: 'middle' }))
    for (const name of [
      'Row 1, column 1, printed, the left end of a boat',
      'Row 1, column 5, printed, the right end of a boat',
      'Row 5, column 1, printed, the bottom end of a boat',
      'Row 3, column 3, printed, the middle of a boat',
    ]) {
      expect(screen.getByRole('img', { name })).toBeInTheDocument()
    }
  })

  it('draws each boat square in the shape its neighbours give it, and each printed piece in its own', () => {
    const { by } = paint(fixture(A, A.answer))
    expect(hullIn(screen.getByRole('img', { name: /^Row 2, column 1, printed/ }))).toBe('single')
    expect(hullIn(screen.getByRole('img', { name: /^Row 3, column 5, printed/ }))).toBe('end-down')
    expect(hullIn(by(/^Row 4, column 5, a boat square$/))).toBe('down')
    expect(hullIn(by(/^Row 5, column 5, a boat square$/))).toBe('end-up')
    expect(hullIn(by(/^Row 4, column 1, a boat square$/))).toBe('end-right')
    expect(hullIn(by(/^Row 4, column 2, a boat square$/))).toBe('end-left')
    expect(hullIn(by(/^Row 1, column 3, a boat square$/))).toBe('single')
    expect(hullIn(by(/^Row 1, column 1, empty/))).toBeNull()
    // The hull is a picture of the square, and the label already says it.
    for (const hull of document.querySelectorAll('[data-hull]')) expect(hull).toHaveAttribute('aria-hidden', 'true')
  })

  it('stands a number at the end of every row and every column, and never says how the line is doing', () => {
    paint(fixture(A))
    expect(screen.getByRole('img', { name: 'Row 4 wants 3 boat squares' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Row 1 wants 1 boat square' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Column 4 wants no boat squares' })).toBeInTheDocument()
    cleanup()
    // A line past its number, and every line met: still not a word, a mark or
    // a colour from the margin.
    for (const boats of [[3], A.impostor, A.answer]) {
      paint(fixture(A, boats))
      expect(document.querySelectorAll('[data-mark]')).toHaveLength(0)
      expect(screen.getByRole('img', { name: 'Column 4 wants no boat squares' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('draws the boats to find under the board, and fills one in when its turn comes', () => {
    const view = playing(fixture(A))
    const strip = screen.getByRole('list', { name: 'Boats to find' })
    const ships = () => [...strip.querySelectorAll('li')].map((li) => li.getAttribute('aria-label'))
    // The printed boat of one is there from the start, shut in by its own
    // closed sides, so one outline of one is filled in before anything is down.
    expect(ships()).toEqual([
      'A boat 3 squares long, still an outline',
      'A boat 2 squares long, still an outline',
      'A boat 1 square long, filled in',
      'A boat 1 square long, still an outline',
    ])
    // The boat of two goes down with an open square at its end, and waits for
    // the boat of three.
    fireEvent.click(screen.getByRole('button', { name: /^Row 4, column 1, empty/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Row 4, column 2, empty/ }))
    expect(ships()[1]).toBe('A boat 2 squares long, still an outline')
    // The boat of three goes down under its printed top end, and both fill in.
    fireEvent.click(screen.getByRole('button', { name: /^Row 4, column 5, empty/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Row 5, column 5, empty/ }))
    expect(ships()).toEqual([
      'A boat 3 squares long, filled in',
      'A boat 2 squares long, filled in',
      'A boat 1 square long, filled in',
      'A boat 1 square long, still an outline',
    ])
    expect([...strip.querySelectorAll('li')].map((li) => li.getAttribute('data-lit'))).toEqual([
      'true',
      'true',
      'true',
      null,
    ])
    // A boat is as many squares as it is long, and none of them is a control.
    expect([...strip.querySelectorAll('li')].map((li) => li.children.length)).toEqual([3, 2, 1, 1])
    expect(strip.querySelector('button, .u-press')).toBeNull()
    view.unmount()
  })

  it('dots the squares its own boats rule out, and no others', () => {
    const state = fixture(A, [15, 16])
    paint(state)
    const dotted = [...document.querySelectorAll('[data-room="none"]')].map(
      (el) => el.getAttribute('aria-label') as string,
    )
    const expected = blockedCells(state)
      .map((no, i) => (no ? `Row ${rowOf(5, i) + 1}, column ${colOf(5, i) + 1}, empty, no room for a boat` : ''))
      .filter(Boolean)
    expect(dotted.sort()).toEqual(expected.sort())
    expect(dotted.length).toBeGreaterThan(0)
  })

  it('sends exactly one action for one tap', () => {
    const { dispatch, by } = paint(fixture(A))
    fireEvent.click(by(/^Row 1, column 3, empty/))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle', index: 2 })
    // And a boat square taken away is one action too.
    cleanup()
    const again = paint(fixture(A, [2]))
    fireEvent.click(again.by(/^Row 1, column 3, a boat square$/))
    expect(again.dispatch).toHaveBeenCalledWith({ type: 'toggle', index: 2 })
  })

  it('puts a refused boat square down, answers it, and puts it back', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    try {
      const { dispatch, view } = paint(sea([6]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 3, empty/ }))
      // Nothing forbidden reaches the shell, so nothing reaches the history.
      expect(dispatch).not.toHaveBeenCalled()
      // The boat square went where the child put it, for one cue.
      const flashed = view.container.querySelector(`.${cues.flash}`) as HTMLElement
      expect(flashed.getAttribute('aria-label')).toBe('Row 3, column 3, a boat square')
      expect(hullIn(flashed)).toBe('single')
      for (const line of screen.getAllByRole('status')) {
        expect(line.textContent).toContain('This boat would touch another boat at a corner.')
      }

      act(() => vi.advanceTimersByTime(480))
      expect(view.container.querySelector(`.${cues.flash}`)).toBeNull()
      expect(screen.getByRole('button', { name: /^Row 3, column 3, empty/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('lights the whole boat for a bend, and the two corners for a touch', () => {
    const lit = () => wearing(cues.highlight).map((el) => el.getAttribute('aria-label'))
    // A bend: the boat it would bend is lit, and the tapped square wears the ring.
    paint(sea([6, 7]))
    fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 3, empty/ }))
    expect(lit().sort()).toEqual(['Row 2, column 2, a boat square', 'Row 2, column 3, a boat square'])
    // And the corner of the bent boat is drawn as a block for that cue.
    expect(hullIn(screen.getByRole('button', { name: 'Row 2, column 3, a boat square' }))).toBe('block')
    cleanup()
    // A touch: two boats of one, and a square at a corner of each.
    paint(sea([6, 8]))
    fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 3, empty/ }))
    expect(lit().sort()).toEqual(['Row 2, column 2, a boat square', 'Row 2, column 4, a boat square'])
    cleanup()
    // A printed piece: the plate itself is lit.
    paint(sea([], { 13: 'single' }))
    fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 3, empty/ }))
    expect(lit()).toEqual(['Row 3, column 4, printed, a whole boat one square long'])
    cleanup()
    // Too long: the whole run it would make, less the square wearing the ring.
    paint(sea([0, 1, 2]))
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 4, empty/ }))
    expect(lit()).toHaveLength(3)
    expect(hullIn(screen.getByRole('button', { name: 'Row 1, column 3, a boat square' }))).toBe('across')
  })

  it('lights the group for the length the highlight is animated over', () => {
    // `.highlight` runs for --dur-5, so the cue that puts it on has to hold it
    // for --dur-5: taken off at --dur-4 the light would be cut in the middle of
    // its plateau, and blink out at full clay.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const { view } = paint(sea([6, 7]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 3, empty/ }))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // The ring goes with the square it was about, at --dur-4.
      act(() => vi.advanceTimersByTime(480))
      expect(view.container.querySelector(`.${cues.flash}`)).toBeNull()
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // The light is a group to be read, so it stays to the end of its own run.
      act(() => vi.advanceTimersByTime(420))
      expect(wearing(cues.highlight)).toHaveLength(0)
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('puts the light out when the position it was about goes away', () => {
    // The ring runs for --dur-4 and the light for --dur-5, so the board takes
    // taps again while the group is still lit, and the shell can rewind the
    // move tape under it at any time. The light has to go with the position,
    // or it blames squares in front of the child for a tap made on another one.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const view = playing(sea([6, 7]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 3, empty/ }))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // The ring is over, the light is not, and the board is live again.
      act(() => vi.advanceTimersByTime(480))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // One boat square the rules take, and the lit group is about a board that is gone.
      fireEvent.click(screen.getByRole('button', { name: /^Row 5, column 5, empty$/ }))
      expect(screen.getByRole('button', { name: /^Row 5, column 5, a boat square$/ })).toBeInTheDocument()
      expect(wearing(cues.highlight)).toHaveLength(0)
      view.unmount()
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('takes the square back once the player has asked for a rule to refuse up front', () => {
    const { dispatch, by } = paint(sea([6]), false, false)
    expect(by(/^Row 5, column 5, empty$/)).not.toHaveAttribute('aria-disabled')
    const dead = by(/^This boat would touch another boat at a corner\. Row 3, column 3, empty, no room for a boat$/)
    expect(dead).toHaveAttribute('aria-disabled', 'true')
    // Dead, and never `disabled`: a disabled button cannot be focused, so the
    // arrow keys and the tab stop would both lose the square in silence. The
    // tap lands on it and nothing happens.
    expect(dead).toBeEnabled()
    dead.focus()
    expect(document.activeElement).toBe(dead)
    fireEvent.click(dead)
    expect(dispatch).not.toHaveBeenCalled()
    // A boat square that is already down can always come away.
    expect(by(/^Row 2, column 2, a boat square$/)).not.toHaveAttribute('aria-disabled')
  })

  it('always leaves one square a keyboard can reach, refusals up front', () => {
    // The tab stop is seeded on the first square with nothing printed on it,
    // and on fixture A that square stands against the printed boat of one — as
    // it does on 15, 17 and 12 of the sixty boards a level this file deals.
    const seizes = (state: BoatsState) => clashOf(state, state.printed.indexOf(null)) !== null
    const dealtToo = levels.map((level) => SEEDS.map((seed) => start(level, seed)).find(seizes) as BoatsState)
    for (const state of [fixture(A), ...dealtToo]) {
      expect(clashOf(state, state.printed.indexOf(null))).not.toBeNull()
      const { view, all } = paint(state, false, false)
      const stops = all().filter((el) => el.getAttribute('tabindex') === '0')
      expect(stops).toHaveLength(1)
      expect(stops[0]).toBeEnabled()
      stops[0].focus()
      expect(document.activeElement).toBe(stops[0])
      view.unmount()
    }
  })

  it('walks the arrow keys from square to square, stepping over printed pieces', () => {
    const { by } = paint(fixture(A))
    const corner = by(/^Row 1, column 1, empty/)
    corner.focus()
    fireEvent.keyDown(corner, { key: 'ArrowDown' })
    // Row 2, column 1 is printed, so the step carries on to row 3.
    expect(document.activeElement).toBe(by(/^Row 3, column 1, empty/))
    // And it stands still at the edge rather than wrapping round.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(by(/^Row 3, column 1, empty/))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(by(/^Row 3, column 2, empty/))
    expect(screen.getAllByRole('button').filter((el) => el.getAttribute('tabindex') === '0')).toHaveLength(1)
    // A browser's own shortcut keeps its key.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight', altKey: true })
    expect(document.activeElement).toBe(by(/^Row 3, column 2, empty/))
  })

  it('counts what is left to place, and then says which half is not right yet', () => {
    const said = (text: string) => screen.getAllByText(text).length > 0
    const announced = () => screen.getAllByRole('status').map((line) => line.textContent)

    const view = playing(fixture(A))
    expect(said('5 boat squares still to place.')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 3, empty/ }))
    expect(said('4 boat squares still to place.')).toBe(true)
    // A tally climbing is not news, so it is shown and not announced.
    expect(announced()).toEqual([''])
    view.unmount()

    paint(fixture(A, A.answer.slice(0, -1)))
    expect(said('1 boat square still to place.')).toBe(true)
    cleanup()

    // Every number right, and the fleet wrong: A's impostor.
    paint(fixture(A, A.impostor))
    const fleet = 'Every boat square is placed. The boats do not match the outlines yet.'
    expect(said(fleet)).toBe(true)
    expect(announced()).toEqual([fleet])
    cleanup()
    // The fleet's lengths right, and a printed end still waiting: B's.
    paint(fixture(B, B.impostor))
    expect(said(fleet)).toBe(true)
    cleanup()

    // Every outline filled in, and a number wrong: the boat of one moved from
    // column 3 to column 4, which wants none.
    const moved = fixture(A, [3, 5, 14, 15, 16, 19, 24])
    expect(fleetOnBoard(moved).every(Boolean)).toBe(true)
    paint(moved)
    const number = 'Every outline is filled in. A number does not match its line yet.'
    expect(said(number)).toBe(true)
    expect(announced()).toEqual([number])
    cleanup()

    // One too many, and three too many.
    paint(fixture(A, [...A.answer, 4]))
    expect(said('1 boat square too many.')).toBe(true)
    cleanup()
    paint(sea([0, 2, 4, 10, 12, 14, 20, 22, 24, 7]))
    expect(said('3 boat squares too many.')).toBe(true)
  })

  it('ignores every input while it is locked', () => {
    const { dispatch, all, view } = paint(fixture(A, A.answer), true)
    for (const button of all()) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    fireEvent.keyDown(all()[0], { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const line of screen.getAllByRole('status')) expect(line.textContent).toBe('')
    expect(view.container.textContent).not.toMatch(/still to place|too many|yet\./)
  })

  it('leaves the title, the hints and the win message to the shell', () => {
    const { view } = paint(fixture(A))
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(hiddenBoats.title)
    expect(text).not.toContain(hiddenBoats.tagline)
    for (const line of hiddenBoats.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(hiddenBoats.id).toBe('hidden-boats')
    expect(hiddenBoats.title).toBe('The hidden boats')
    expect(hiddenBoats.reseedable).toBe(true)
    // Every move undoes, so there is no dead end to name and nowhere to step
    // back to: see "leaves no position a player can reach that cannot still be
    // won" above.
    expect(hiddenBoats.engine.failure).toBeUndefined()
    expect(hiddenBoats.engine.canStillWin).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.id)).toEqual(['four-boats', 'six-boats', 'seven-boats'])
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(hiddenBoats.instructions.length).toBeGreaterThanOrEqual(2)
    expect(hiddenBoats.instructions.length).toBeLessThanOrEqual(4)
    for (const line of hiddenBoats.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(140)
    }
    // No exclamation marks anywhere a child reads.
    const words = [hiddenBoats.tagline, ...hiddenBoats.instructions, ...levels.flatMap((l) => l.hints)]
    for (const line of words) expect(line).not.toContain('!')
  })

  it('says what a printed piece can be, and what the numbers count, before the child starts', () => {
    // A printed middle is drawn as a small square block, which a child who
    // was told only that printed squares show a boat's shape could take for a
    // boat one square long. Seven boats prints one on 106 boards in 300.
    const printedLine = hiddenBoats.instructions.find((line) => line.startsWith('Printed squares'))
    expect(printedLine).toBe("Printed squares show a boat's shape: an end, a middle, or a whole boat.")
    // The tagline opens "How to play", just above the instructions, and it
    // is where the numbers are explained.
    expect(hiddenBoats.tagline).toMatch(/The numbers count the boat squares in each row and column\./)
    // And the rules the board refuses are all there to be read.
    const rules = hiddenBoats.instructions.join(' ')
    expect(rules).toMatch(/straight line/)
    expect(rules).toMatch(/never touch, not even at a corner/)
    expect(rules).toMatch(/Tap it again to take it away/)
  })

  it('never borrows a board word for something the board does not mean by it', () => {
    // The board calls a square 'empty' whether or not a boat could ever stand
    // on it, so a hint about 'an empty square' is read as the board's word.
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/\bempty\b/i)
    }
  })

  it('never names a square that would give an answer away', () => {
    // Every board is dealt fresh, so a hint that named a square would be wrong
    // as often as it was right.
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('stands every ceiling no higher than the floor of the level above it', () => {
    // The ladder rule of the tents and trees, on both dials: the passes the
    // reasoning takes, and the fit steps it asks for.
    const bands = levels.map((l) => l.config)
    for (let k = 0; k + 1 < bands.length; k++) {
      expect(bands[k].maxRounds).toBeLessThanOrEqual(bands[k + 1].minRounds)
      expect(bands[k].fitAsks.length).toBeLessThanOrEqual(bands[k + 1].fitAsks.length)
    }
    // And the last level is the one left open. A pass has to place a square
    // to count, so the board's own squares are past any number it can reach.
    const last = bands[bands.length - 1]
    expect(last.maxRounds).toBeGreaterThanOrEqual(last.n * last.n)
    expect(bands.map((b) => b.n)).toEqual([5, 6, 7])
  })

  it('holds the card to the rules', () => {
    const boats = boatsAt(CARD.n * CARD.n, CARD.boats)
    const lengths = runsOf(CARD.n, boats).map((run) => run.length)
    expect(lengths.sort((a, b) => b - a)).toEqual([...CARD.fleet])
    for (const i of CARD.boats) expect(diagonal(CARD.n, i).some((j) => boats[j])).toBe(false)
    // And every boat on the card is a straight line, one of them each way.
    const runs = runsOf(CARD.n, boats).filter((run) => run.length > 1)
    const across = runs.filter((run) => run.every((i) => rowOf(CARD.n, i) === rowOf(CARD.n, run[0])))
    expect(across).toHaveLength(1)
    expect(runs).toHaveLength(2)
  })

  it('draws the card from that answer, every shape in a colour of its own', () => {
    const { container } = render(createElement(HiddenBoatsIcon))
    const svg = container.querySelector('svg') as SVGSVGElement
    // Nothing inheritable on the frame, and nothing left to inherit inside it.
    for (const shape of svg.querySelectorAll('rect, circle, path')) {
      const drawn = (attr: string) => shape.getAttribute(attr) ?? shape.closest('g')?.getAttribute(attr)
      expect(drawn('fill')).toBeTruthy()
      if (drawn('fill') === 'none') expect(drawn('stroke')).toBeTruthy()
    }
    // One enamel hull a boat, and no pictogram: a boat here is its length.
    expect(svg.querySelectorAll('[fill="var(--p-indigo)"]')).toHaveLength(CARD.fleet.length)
    expect(svg.querySelectorAll('svg')).toHaveLength(0)
    expect(svg.querySelectorAll('text')).toHaveLength(0)
  })
})

/* ============================================================
   The stylesheet, as written. The margin is copied from the
   tents and trees, and so is the one thing asserted about it:
   a number stays inside the gutter that it stands in.
   ============================================================ */

describe('the margin', () => {
  // jsdom's URL is not node's, so take the directory off the module url by hand.
  const css = readFileSync(new URL(import.meta.url).pathname.replace(/[^/]+$/, 'board.module.css'), 'utf8')
  const block = (selector: string) => new RegExp(`\\.${selector} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''

  it('keeps a number narrower than its gutter, at all three sizes of board', () => {
    // Both are fractions of --cell, so the two cannot drift apart. Sized off
    // the viewport instead, the tents and trees' number came to 1.6 x 0.044 of
    // the viewport, while a seven-wide board holds --cell at its 44px floor —
    // and the gutter at 29px — until 8.5vw catches 44px at 518px wide.
    const gutter = Number(/--gutter: calc\(var\(--cell\) \* ([\d.]+)\)/.exec(block('plan'))?.[1])
    const clue = block('clue')
    const minWidth = Number(/min-width: ([\d.]+)em/.exec(clue)?.[1])
    const size = Number(/font-size: clamp\(1rem, calc\(var\(--cell\) \* ([\d.]+)\)/.exec(clue)?.[1])
    expect(gutter).toBeGreaterThan(0)
    expect(minWidth).toBeGreaterThan(0)
    expect(size).toBeGreaterThan(0)
    expect(clue).not.toMatch(/font-size:[^;]*vw/)
    expect(minWidth * size).toBeLessThan(gutter)

    // And the floor of that clamp, against the smallest square that the board draws.
    const floors = [...css.matchAll(/--cell: clamp\((\d+)px/g)].map((m) => Number(m[1]))
    expect(floors).toHaveLength(3)
    const smallest = Math.min(...floors)
    // The floor of a square is a fingertip, which is the reason it has one.
    expect(smallest).toBeGreaterThanOrEqual(44)
    expect(minWidth * 16).toBeLessThan(gutter * smallest)
  })

  it('never marks a number, in any colour', () => {
    // The tents and trees crosses a number off in moss and boxes it in clay.
    // Neither is here, and nothing else in the stylesheet reaches a number.
    expect(css).not.toMatch(/\.clue\[/)
    expect(block('clue')).not.toMatch(/--moss|--clay/)
  })
})
