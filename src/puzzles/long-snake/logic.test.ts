import { readFileSync } from 'node:fs'
import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng, randInt, shuffled } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import { underSettings } from '../../test/settings'
import type { PuzzleLevel, Rng } from '../../lib/types'
import { longSnake } from './index'
import { Board } from './Board'
import { LongSnakeIcon } from './glyphs'
import type { Deal, SnakeAction, SnakeConfig, SnakeState } from './logic'
import {
  CARD,
  canAdd,
  clashOf,
  colCells,
  colMarks,
  colOf,
  countSolutions,
  deal,
  describeClash,
  describeMove,
  diagonal,
  dottedCells,
  draw,
  fits,
  init,
  isEnd,
  isSolved,
  legalMoves,
  lengthOf,
  lineMark,
  neighboursOn,
  orthogonal,
  pieceOf,
  reasonedOut,
  reduce,
  refusalOf,
  roomBeside,
  roomIn,
  rowCells,
  rowMarks,
  rowOf,
  snakeCount,
  snakeIn,
  solveByLooking,
  startOf,
  strandedEnds,
  troubleOf,
  wants,
} from './logic'

const levels = longSnake.levels as PuzzleLevel<SnakeConfig>[]
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/**
 * The board a level deals for a seed, dealt once however many tests ask for
 * it. `deal` is pure given the seed, so this is the same board `init` hands
 * the shell — "deals the same board twice" below holds the two together — and
 * the climbers' two hundred boards a level are dealt once rather than four
 * times.
 */
const dealtBoards = new Map<string, Deal>()
const dealt = (level: PuzzleLevel<SnakeConfig>, seed: number): Deal => {
  const key = `${level.id}:${seed}`
  let board = dealtBoards.get(key)
  if (board === undefined) {
    board = deal(makeRng(seed), level.config)
    dealtBoards.set(key, board)
  }
  return board
}
const start = (level: PuzzleLevel<SnakeConfig>, seed: number) => startOf(level.config.n, dealt(level, seed))

/** One tap for every square of the answer but its two ends. Each one is exactly one move. */
const solutionActions = (board: Deal): SnakeAction[] =>
  board.answer
    .filter((i) => i !== board.head && i !== board.tail)
    .map((index) => ({ type: 'toggle', index }))

const play = (state: SnakeState, actions: SnakeAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

const key = (state: SnakeState) => state.snake.map((on) => (on ? '1' : '0')).join('')

const tap = (index: number): SnakeAction => ({ type: 'toggle', index })

/** A hand-built board: its head, its tail, its numbers, and the squares already on it. */
const board = (
  n: number,
  head: number,
  tail: number,
  rowClues: number[],
  colClues: number[],
  placed: number[] = [],
): SnakeState => ({
  n,
  head,
  tail,
  rowClues,
  colClues,
  snake: Array.from({ length: n * n }, (_, i) => i === head || i === tail || placed.includes(i)),
})

/**
 * The fixture, so a test can say which square breaks which rule rather than
 * hunting for one. Nine squares long, and one answer:
 *
 *       1 3 2 3 0
 *     4 H o o o .        the head is row 1 column 1, the tail row 4 column 2,
 *     1 . . . o .        and the snake goes right along the top, down the
 *     3 . o o o .        fourth column, back along row 3 and down to the tail
 *     1 . T . . .
 *     0 . . . . .
 *
 * Column 1 has its head and row 4 its tail, and row 5 and column 5 want none,
 * so fourteen squares are dotted before a square is added.
 */
const FIXTURE_ANSWER = [0, 1, 2, 3, 8, 13, 12, 11, 16]
const FIXTURE_DOTS = [4, 5, 9, 10, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24]
const fixture = (placed: number[] = []) => board(5, 0, 16, [4, 1, 3, 1, 0], [1, 3, 2, 3, 0], placed)

/** Every number 4 on a four-wide board: room enough to close a ring, or to reach the tail too soon. */
const toy = (placed: number[] = []) => board(4, 0, 15, [4, 4, 4, 4], [4, 4, 4, 4], placed)

/**
 * Six squares long, from row 2 column 1 to the bottom right corner, and one
 * answer: 4 8 9 13 14 15. Four legal squares meet every number with the snake
 * in two pieces.
 */
const pieces = (placed: number[] = []) => board(4, 4, 15, [0, 1, 2, 3], [2, 2, 1, 1], placed)

/**
 * Seven squares long, from the top left corner to the bottom right, and one
 * answer: 0 4 8 9 13 14 15. A square in the bottom left corner then keeps
 * every rule and has room on one side only.
 */
const wayThrough = (placed: number[] = []) => board(4, 0, 15, [1, 1, 2, 3], [3, 2, 1, 1], placed)

/**
 * Every number met, one piece, every square with the neighbours it wants — and
 * row 1 column 2 meets row 2 column 3 at a corner, six squares apart along the
 * snake. Set directly: it is not a board the corner clause lets anybody deal.
 */
const cornered = (): SnakeState => {
  const snake = [1, 0, 4, 8, 9, 10, 6]
  return { ...board(4, 1, 6, [2, 2, 3, 0], [3, 2, 2, 0]), snake: Array.from({ length: 16 }, (_, i) => snake.includes(i)) }
}

/**
 * Random play: two hundred taps from `makeRng(500 + k)` on the `k`th of
 * `SEEDS`, keeping every position a tap lands on. Walked once a level and
 * shared by the tests that ask what random play can and cannot reach.
 */
const wandered = new Map<string, SnakeState[]>()
const wander = (level: PuzzleLevel<SnakeConfig>, k: number): SnakeState[] => {
  const cacheKey = `${level.id}:${k}`
  const known = wandered.get(cacheKey)
  if (known !== undefined) return known
  const rng = makeRng(500 + k)
  let cur = start(level, SEEDS[k])
  const out = [cur]
  for (let step = 0; step < 200; step++) {
    const moves = legalMoves(cur)
    const next = reduce(cur, moves[randInt(rng, moves.length)])
    if (next === cur) continue
    cur = next
    out.push(cur)
  }
  wandered.set(cacheKey, out)
  return out
}

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, length } = level.config

    it(`"${level.label}" draws a snake of ${length} and numbers every line, every seed`, () => {
      const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.snake).toHaveLength(n * n)
        expect(state.head).not.toBe(state.tail)
        expect(state.rowClues).toHaveLength(n)
        expect(state.colClues).toHaveLength(n)
        expect(total(state.rowClues)).toBe(length)
        expect(total(state.colClues)).toBe(length)
        expect(state.rowClues.every((c) => c >= 0 && c <= n)).toBe(true)
        expect(state.colClues.every((c) => c >= 0 && c <= n)).toBe(true)
        expect(state.snake.flatMap((on, i) => (on ? [i] : []))).toEqual(
          [state.head, state.tail].sort((a, b) => a - b),
        )
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS.slice(0, 30)) {
        const { head, tail, rowClues, colClues } = dealt(level, seed)
        expect(countSolutions(n, head, tail, rowClues, colClues, 2)).toBe(1)
      }
    })

    it(`"${level.label}" has exactly one answer with the corner rule switched off, every seed`, () => {
      // Which is why the child is never told the corner clause: no dealt board
      // can tell the difference between having it and not.
      for (const seed of SEEDS.slice(0, 30)) {
        const { head, tail, rowClues, colClues } = dealt(level, seed)
        expect(countSolutions(n, head, tail, rowClues, colClues, 2, false)).toBe(1)
      }
    })

    it(`"${level.label}" can be read off the board without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const { head, tail, rowClues, colClues, answer } = dealt(level, seed)
        const found = solveByLooking(n, head, tail, rowClues, colClues)
        expect(found).not.toBeNull()
        expect(found?.snake).toEqual([...answer].sort((a, b) => a - b))
      }
    })

    it(`"${level.label}" cannot be finished by the numbers alone, every seed`, () => {
      // The snake has to be followed: with the only-way-on step switched off,
      // every tight line on the board runs dry before the snake is whole.
      for (const seed of SEEDS) {
        const { head, tail, rowClues, colClues } = dealt(level, seed)
        expect(solveByLooking(n, head, tail, rowClues, colClues, { ends: false })).toBeNull()
      }
    })

    it(`"${level.label}" cannot be finished by following the snake alone, every seed`, () => {
      // And the numbers have to be counted. The dots a full line leaves are
      // still drawn here, because they are the board's and not the child's.
      for (const seed of SEEDS) {
        const { head, tail, rowClues, colClues } = dealt(level, seed)
        expect(solveByLooking(n, head, tail, rowClues, colClues, { tight: false })).toBeNull()
      }
    })

    it(`"${level.label}" sits in its band of steps, every seed`, () => {
      // The fallback in `deal` is for a run of luck the tests have never seen:
      // every seed lands on a board that suits the level.
      for (const seed of SEEDS) {
        const reasoned = reasonedOut(n, dealt(level, seed))
        expect(reasoned).not.toBeNull()
        expect(reasoned?.steps).toBeGreaterThanOrEqual(level.config.minSteps)
        expect(reasoned?.steps).toBeLessThanOrEqual(level.config.maxSteps)
      }
    })

    it(`"${level.label}" starts with only the head and tail, and is not already solved`, () => {
      const state = start(level, 5)
      expect(snakeCount(state)).toBe(2)
      expect(state.snake[state.head] && state.snake[state.tail]).toBe(true)
      expect(isSolved(state)).toBe(false)
      expect(rowMarks(state).includes('stuck')).toBe(false)
      expect(colMarks(state).includes('stuck')).toBe(false)
      expect(troubleOf(state)).toBeNull()
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(init(level, makeRng(12))).toEqual(init(level, makeRng(12)))
      expect(init(level, makeRng(12))).toEqual(start(level, 12))
      expect(init(level, makeRng(12))).not.toEqual(init(level, makeRng(13)))
    })
  }

  it('deals a board for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })

  it('reads the numbers off the answer it drew', () => {
    const drawn = draw(makeRng(9), 6, 12) as Deal
    expect(drawn.answer).toHaveLength(12)
    expect(new Set(drawn.answer).size).toBe(12)
    for (let r = 0; r < 6; r++) {
      expect(drawn.rowClues[r]).toBe(drawn.answer.filter((i) => rowOf(6, i) === r).length)
    }
    for (let c = 0; c < 6; c++) {
      expect(drawn.colClues[c]).toBe(drawn.answer.filter((i) => colOf(6, i) === c).length)
    }
    expect(drawn.head).toBe(drawn.answer[0])
    expect(drawn.tail).toBe(drawn.answer[11])
    // A snake is drawn finished: one square after another, edge to edge, and
    // keeping every published rule, the corner clause too.
    for (let k = 1; k < 12; k++) expect(orthogonal(6, drawn.answer[k - 1])).toContain(drawn.answer[k])
    const whole = { ...startOf(6, drawn), snake: Array.from({ length: 36 }, (_, i) => drawn.answer.includes(i)) }
    expect(isSolved(whole)).toBe(true)
  })

  it('meets the tightest band of the three from a hundred and fifty fresh seeds', () => {
    // Twenty long is the band the snakes meet least often — 8.5% of draws land
    // in it, against 23.6% and 34.5% below — so it is the one a poor run could
    // starve. `deal` draws 11.4 snakes on average to fill it and 79 at its
    // worst, where eleven long takes 4.3 and 28 and fourteen long 2.9 and 20.
    // Every seed from 0 to 999 lands inside its band on all three levels, and
    // this is as much of that walk as the suite can afford.
    const level = levels[2]
    for (let seed = 0; seed < 150; seed++) {
      expect(fits(level.config, deal(makeRng(seed), level.config))).toBe(true)
    }
  })

  it('keeps all three promises when no snake meets the band', () => {
    // A band no snake can meet, so the fallback is walked on purpose. What
    // comes back has given up the level's difficulty and nothing else.
    const impossible: SnakeConfig = { ...levels[1].config, minSteps: 99, maxSteps: 99 }
    const fallback = deal(makeRng(7), impossible)
    expect(fits(impossible, fallback)).toBe(false)
    expect(reasonedOut(impossible.n, fallback)).not.toBeNull()
    const { head, tail, rowClues, colClues } = fallback
    expect(countSolutions(impossible.n, head, tail, rowClues, colClues, 2)).toBe(1)
    expect(countSolutions(impossible.n, head, tail, rowClues, colClues, 2, false)).toBe(1)
  })

  it('says so rather than hand back a board that it cannot vouch for', () => {
    // A snake of nine fills a three-wide board, and a full three-wide board
    // has twelve places where two squares sit side by side against the eight
    // joins a snake of nine has — so it would touch itself, no snake is ever
    // drawn at all, and there is no honest board left to hand back.
    expect(draw(makeRng(3), 3, 9)).toBeNull()
    const airless: SnakeConfig = { n: 3, length: 9, minSteps: 1, maxSteps: 99 }
    expect(() => deal(makeRng(3), airless)).toThrow(/came out by looking/)
  })

  it('keeps about one snake in four at the widest level, which is what puts the throw out of reach', () => {
    // The recipe for the yields quoted over `deal`: 2,000 draws a level from
    // one rng, and how many keep all three promises. At one in four the chance
    // that 2,000 in a row all miss, and `deal` has nothing to hand back, is
    // about 10 to the -236. The fallback is a different miss — every draw
    // keeping the promises and none landing in the band — and it rests on the
    // in-band yield instead: 8.5% of draws at twenty long, the worst of the
    // three, which puts it at about 10 to the -77.
    const kept = levels.map((level) => {
      const { n, length } = level.config
      const rng = makeRng(12345)
      let count = 0
      for (let k = 0; k < 2000; k++) {
        const drawn = draw(rng, n, length)
        expect(drawn).not.toBeNull()
        if (reasonedOut(n, drawn as Deal) !== null) count++
      }
      return count
    })
    expect(kept).toEqual([488, 879, 489])
    for (const count of kept) expect(count / 2000).toBeGreaterThan(0.2)
  }, 20_000)

  it('draws level one from 544 boards, which are 35 shapes turned and flipped', () => {
    // Every snake of eleven on a five-wide board, walked out in full under the
    // corner clause, by a walk of this test's own. A board is its two ends and
    // its numbers; the eight turns and flips of the square, with the head and
    // the tail taken either way round, make one shape. The same walk at nine
    // long, which the first design of this level used, finds 48 boards in 3
    // shapes — and none with the single 0 in the margin that design asked for.
    const level = levels[0]
    const { n, length } = level.config
    const on = new Uint8Array(n * n)
    const path: number[] = []
    const boards = new Set<string>()
    const fitting = new Set<string>()
    const shapes = new Set<string>()
    const turn = (i: number, k: number) => {
      let r = rowOf(n, i)
      let c = colOf(n, i)
      for (let t = 0; t < (k & 3); t++) [r, c] = [c, n - 1 - r]
      if (k & 4) c = n - 1 - c
      return r * n + c
    }
    const shapeOf = (drawn: Deal) => {
      let best = ''
      for (let k = 0; k < 8; k++) {
        const cells = drawn.answer.map((i) => turn(i, k)).sort((a, b) => a - b)
        const ends = [turn(drawn.head, k), turn(drawn.tail, k)].sort((a, b) => a - b)
        const name = `${ends.join('-')}|${cells.join(',')}`
        if (best === '' || name < best) best = name
      }
      return best
    }
    const free = (cell: number) => {
      if (on[cell]) return false
      const last = path[path.length - 1]
      const before = path.length >= 2 ? path[path.length - 2] : -1
      if (orthogonal(n, cell).some((j) => on[j] && j !== last)) return false
      return !diagonal(n, cell).some((d) => on[d] && d !== before)
    }
    const walk = () => {
      if (path.length === length) {
        const rowClues = new Array<number>(n).fill(0)
        const colClues = new Array<number>(n).fill(0)
        for (const i of path) {
          rowClues[rowOf(n, i)]++
          colClues[colOf(n, i)]++
        }
        const drawn: Deal = { head: path[0], tail: path[length - 1], rowClues, colClues, answer: path.slice() }
        const name = `${drawn.head}|${drawn.tail}|${rowClues}|${colClues}`
        if (boards.has(name)) return
        boards.add(name)
        if (fits(level.config, drawn)) {
          fitting.add(name)
          shapes.add(shapeOf(drawn))
        }
        return
      }
      for (const cell of orthogonal(n, path[path.length - 1])) {
        if (!free(cell)) continue
        on[cell] = 1
        path.push(cell)
        walk()
        path.pop()
        on[cell] = 0
      }
    }
    for (let first = 0; first < n * n; first++) {
      on[first] = 1
      path.push(first)
      walk()
      path.pop()
      on[first] = 0
    }
    expect(boards.size).toBe(2640)
    expect(fitting.size).toBe(544)
    expect(shapes.size).toBe(35)
    // And every board the level deals is one of them.
    for (const seed of SEEDS) {
      const { head, tail, rowClues, colClues } = dealt(level, seed)
      expect(fitting.has(`${head}|${tail}|${rowClues}|${colClues}`)).toBe(true)
    }
  }, 20_000)
})

describe('the rules', () => {
  it('refuses a line past its number, and names the line', () => {
    // Row 1 wants four, and has the head and three more.
    const full = clashOf(fixture([1, 2, 3]), 4)
    expect(full).toMatchObject({ kind: 'row', ordinal: 1, wanted: 4, cells: rowCells(5, 0), blamed: [4, 0, 1, 2, 3] })
    expect(describeClash(full!)).toBe('Row 1 already has its 4 snake squares.')

    // Column 1 wants one, and the head is it.
    const down = clashOf(fixture(), 5)
    expect(down).toMatchObject({ kind: 'column', ordinal: 1, wanted: 1, cells: colCells(5, 0), blamed: [5, 0] })
    expect(describeClash(down!)).toBe('Column 1 already has its 1 snake square.')
    expect(clashOf(fixture(), 4)).toMatchObject({ kind: 'column', ordinal: 5, wanted: 0 })
  })

  it('says a line that wants none in its own words', () => {
    const none = clashOf(fixture(), 20)
    expect(none).toMatchObject({ kind: 'row', ordinal: 5, wanted: 0, cells: rowCells(5, 4), blamed: [20] })
    expect(describeClash(none!)).toBe('Row 5 wants no snake squares at all.')
  })

  it('refuses the snake touching itself side by side, and names the squares it would touch', () => {
    // Row 1 column 2 already has both its neighbours, the head and row 1
    // column 3, so nothing more may join it from below.
    const touch = clashOf(fixture([1, 2]), 6)
    expect(touch).toMatchObject({ kind: 'touch', blamed: [6, 1], cells: [6, 1] })
    expect(describeClash(touch!)).toBe('The snake would touch itself side by side here.')
    // The head wants one neighbour, not two.
    expect(clashOf(toy([1]), 4)).toMatchObject({ kind: 'touch', blamed: [4, 0] })
    // And a square with three snake squares beside it names all three.
    expect(clashOf(toy([1, 6, 9]), 5)).toMatchObject({ kind: 'touch', blamed: [5, 1, 6, 9] })
  })

  it('refuses a ring, and lights the piece that would close', () => {
    const ring = clashOf(toy([5, 6, 10]), 9)
    expect(ring).toMatchObject({ kind: 'ring', cells: [9, 5, 6, 10], blamed: [9, 5, 10] })
    expect(describeClash(ring!)).toBe('The snake would join up into a ring.')
    expect(reduce(toy([5, 6, 10]), tap(9)).snake[9]).toBe(false)
  })

  it('never refuses a corner touch, because it may still become a bend', () => {
    // Row 2 column 3 meets row 1 column 2 at a corner, and neither square
    // between them is snake yet — so it is not yet a bend, and it may become
    // one. Nothing at the square says otherwise, so it lands.
    const state = reduce(fixture(), tap(1))
    expect(diagonal(5, 1)).toContain(7)
    expect(state.snake[2] || state.snake[6]).toBe(false)
    expect(clashOf(state, 7)).toBeNull()
    expect(reduce(state, tap(7)).snake[7]).toBe(true)
  })

  it('reports the rule a child sees first, and only that one', () => {
    // Row 5 and column 5 both want none: the row is named.
    expect(clashOf(fixture(), 24)?.kind).toBe('row')
    // Column 1 is full and the head already has its neighbour: the column.
    expect(neighboursOn(fixture([1]), 0)).toHaveLength(wants(fixture([1]), 0))
    expect(clashOf(fixture([1]), 5)?.kind).toBe('column')
    // Three neighbours, two of them already joined round a corner: the touch.
    expect(pieceOf(toy([5, 6, 10, 13]), 5)).toContain(10)
    expect(clashOf(toy([5, 6, 10, 13]), 9)).toMatchObject({ kind: 'touch', blamed: [9, 5, 10, 13] })
  })

  it('offers a forbidden square, with the sentence that hands it back', () => {
    const state = fixture([1, 2])
    const no = refusalOf(state, 6)
    expect(no?.message).toBe('The snake would touch itself side by side here.')
    expect(no?.clash.kind).toBe('touch')
    // The position the tap pretends to reach: the square joins where the child
    // put it, on a board the puzzle itself never takes.
    expect(no?.pretend.snake[6]).toBe(true)
    expect(no?.pretend.rowClues).toBe(state.rowClues)
    expect(state.snake[6]).toBe(false)
    // And there is nothing to refuse where the square takes it, or where a
    // square is coming off.
    expect(refusalOf(fixture(), 1)).toBeNull()
    expect(refusalOf(fixture([1]), 1)).toBeNull()
  })

  it('says nothing about the head, the tail, a snake square, or a square off the board', () => {
    const state = fixture([1, 2])
    for (const index of [0, 16, 1, -1, 2.5, 25]) {
      expect(clashOf(state, index)).toBeNull()
      expect(refusalOf(state, index)).toBeNull()
      expect(canAdd(state, index)).toBe(false)
    }
    // And the one that breaks a rule cannot be added either.
    expect(canAdd(state, 6)).toBe(false)
    expect(canAdd(state, 3)).toBe(true)
  })
})

describe('reduce', () => {
  it('adds a square and takes it off again', () => {
    const state = fixture()
    const on = reduce(state, tap(1))
    expect(on.snake[1]).toBe(true)
    expect(on.rowClues).toBe(state.rowClues)
    expect(on.colClues).toBe(state.colClues)
    const off = reduce(on, tap(1))
    expect(off.snake[1]).toBe(false)
    expect(off.snake).toEqual(state.snake)
  })

  it('hands back the very same state for an action that is not one', () => {
    const state = fixture()
    expect(reduce(state, tap(-1))).toBe(state)
    expect(reduce(state, tap(25))).toBe(state)
    expect(reduce(state, tap(1.5))).toBe(state)
    expect(reduce(state, tap(0))).toBe(state) // the head
    expect(reduce(state, tap(16))).toBe(state) // the tail
    expect(reduce(state, { type: 'nudge' } as unknown as SnakeAction)).toBe(state)
    expect(reduce(state, undefined as unknown as SnakeAction)).toBe(state)
  })

  it('hands back the very same state for a square that would break a rule', () => {
    const rowFull = fixture([1, 2, 3])
    expect(reduce(rowFull, tap(4))).toBe(rowFull)
    const colFull = fixture()
    expect(reduce(colFull, tap(5))).toBe(colFull)
    const touching = fixture([1, 2])
    expect(reduce(touching, tap(6))).toBe(touching)
    const ring = toy([5, 6, 10])
    expect(reduce(ring, tap(9))).toBe(ring)
  })

  it('never lets a board hold a line over its number, a square with too many neighbours, or a ring', () => {
    // Twenty boards a level, two hundred random taps each. What is wrong is
    // gathered and asserted once, so a failure names every position it found.
    const broken: string[] = []
    let walked = 0
    for (const level of levels) {
      for (let k = 0; k < 20; k++) {
        for (const state of wander(level, k)) {
          walked++
          const { n } = state
          const at = `${level.id} ${SEEDS[k]} ${key(state)}`
          for (let r = 0; r < n; r++) {
            if (snakeIn(state, rowCells(n, r)) > state.rowClues[r]) broken.push(`${at}: row ${r + 1} over`)
            if (snakeIn(state, colCells(n, r)) > state.colClues[r]) broken.push(`${at}: column ${r + 1} over`)
          }
          const seen = new Set<number>()
          for (let i = 0; i < n * n; i++) {
            if (!state.snake[i]) continue
            if (neighboursOn(state, i).length > wants(state, i)) broken.push(`${at}: ${i} crowded`)
            if (seen.has(i)) continue
            // A piece with no ring in it is a path: one join fewer than squares.
            const piece = pieceOf(state, i)
            for (const j of piece) seen.add(j)
            const joins = piece.reduce((sum, j) => sum + neighboursOn(state, j).length, 0) / 2
            if (joins !== piece.length - 1) broken.push(`${at}: a ring through ${i}`)
          }
        }
      }
    }
    expect(walked).toBeGreaterThan(3000)
    expect(broken).toEqual([])
  })
})

describe('isSolved', () => {
  it('will not call a board solved one square short', () => {
    const short = fixture(FIXTURE_ANSWER.slice(0, -2))
    expect(snakeCount(short)).toBe(8)
    expect(isSolved(short)).toBe(false)
    expect(isSolved(fixture(FIXTURE_ANSWER))).toBe(true)
  })

  it('checks the whole snake, not only the numbers', () => {
    // Every number on the pieces board met, by four squares that each landed —
    // and the snake is in two pieces, so it is not an answer.
    const split = play(pieces(), [9, 10, 12, 13].map(tap))
    expect(snakeCount(split)).toBe(6)
    for (let r = 0; r < 4; r++) expect(snakeIn(split, rowCells(4, r))).toBe(split.rowClues[r])
    for (let c = 0; c < 4; c++) expect(snakeIn(split, colCells(4, c))).toBe(split.colClues[c])
    expect(isSolved(split)).toBe(false)
    expect(isSolved(pieces([8, 9, 13, 14]))).toBe(true)
  })

  it('keeps the published corner rule, which no dealt board ever needs', () => {
    const state = cornered()
    for (let r = 0; r < 4; r++) expect(snakeIn(state, rowCells(4, r))).toBe(state.rowClues[r])
    for (let i = 0; i < 16; i++) if (state.snake[i]) expect(neighboursOn(state, i)).toHaveLength(wants(state, i))
    expect(pieceOf(state, 1)).toHaveLength(7)
    expect(isSolved(state)).toBe(false)
    // So that board has no answer with the clause and one without it.
    expect(countSolutions(4, 1, 6, state.rowClues, state.colClues, 3)).toBe(0)
    expect(countSolutions(4, 1, 6, state.rowClues, state.colClues, 3, false)).toBe(1)
    // And every answer a level deals keeps it.
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 30)) {
        const first = start(level, seed)
        expect(isSolved(play(first, solutionActions(dealt(level, seed))))).toBe(true)
      }
    }
  })

  it('is worked out from the board alone, never from the board it was dealt', () => {
    for (const level of levels.slice(0, 2)) {
      const first = start(level, 7)
      const done = play(first, solutionActions(dealt(level, 7)))
      expect(isSolved(done)).toBe(true)
      // The same snake, one number changed: the same position is no longer an
      // answer, so nothing here is remembering how the board was made.
      const bent: SnakeState = { ...done, rowClues: done.rowClues.map((c, i) => (i === 0 ? c + 1 : c)) }
      expect(isSolved(bent)).toBe(false)
    }
  })
})

describe('par', () => {
  it('is the length of the snake less its head and tail', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.length - 2)
      expect(solutionActions(dealt(level, 3))).toHaveLength(level.par as number)
    }
  })

  it('cannot be beaten, because a move adds or takes exactly one square', () => {
    /* The floor, checked by construction rather than asserted. A board starts
       with the head and the tail on it and nothing else; `isSolved` wants the
       one answer, which is `length` squares; and every move that changes
       anything changes the count by exactly one. */
    for (const level of levels) {
      for (let k = 0; k < 20; k++) {
        const walked = wander(level, k)
        expect(snakeCount(walked[0])).toBe(2)
        for (let step = 1; step < walked.length; step++) {
          expect(Math.abs(snakeCount(walked[step]) - snakeCount(walked[step - 1]))).toBe(1)
        }
      }
    }
  })

  it('is reached, because the answer can be laid in any order', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 12)) {
        const first = start(level, seed)
        const actions = solutionActions(dealt(level, seed))
        expect(actions).toHaveLength(level.par as number)
        for (const order of [actions, [...actions].reverse(), shuffled(makeRng(seed), actions)]) {
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

  const search = (state: SnakeState) =>
    shortestSolution<SnakeState, SnakeAction>({
      start: state,
      moves: legalMoves,
      apply: reduce,
      key,
      solved: isSolved,
    })

  it('has no shorter path than par under breadth-first search at eleven squares long', () => {
    // Small enough to walk whole: the board's every reachable position.
    const counted = [SEEDS[0], SEEDS[2]].map((seed) => {
      const first = start(levels[0], seed)
      expect(search(first)).toHaveLength(levels[0].par as number)
      return reachableCount<SnakeState, SnakeAction>({ start: first, moves: legalMoves, apply: reduce, key })
    })
    expect(counted).toEqual([3272, 3876])
    for (const count of counted) expect(count).toBeLessThan(200_000)
  }, 20_000)

  it('has no shorter path than par under breadth-first search at fourteen squares long, on the seed that search can afford', () => {
    // Searched to depth twelve, 55 of the 60 SEEDS fit under the search's cap
    // of 200,000 positions and 5 do not. This one, SEEDS[38], is the cheapest:
    // 15,308 positions seen by the time depth twelve is solved, where the next
    // two cost 24,100 and 27,014. The floor and the ceiling above carry every
    // seed; this is the search's own word on one of them.
    expect(SEEDS[38]).toBe(2406)
    expect(search(start(levels[1], SEEDS[38]))).toHaveLength(levels[1].par as number)
  }, 30_000)

  it('is far past the search at twenty squares long', () => {
    // Every subset of the answer's inner squares is a position a player can
    // reach, with a key of its own — the ceiling above lays the answer in any
    // order, so every subset is the start of some order. That alone is two to
    // the eighteenth positions, past the search's cap before a single wrong
    // square is counted.
    const par = levels[2].par as number
    expect(2 ** par).toBe(262_144)
    expect(2 ** par).toBeGreaterThan(200_000)
    // And the premise, on a sample: any subset of the answer lands whole.
    const drawn = dealt(levels[2], SEEDS[0])
    const inner = solutionActions(drawn)
    const rng = makeRng(18)
    for (let k = 0; k < 200; k++) {
      const subset = inner.filter(() => rng() < 0.5)
      let cur = start(levels[2], SEEDS[0])
      for (const action of subset) {
        const next = reduce(cur, action)
        expect(next).not.toBe(cur)
        cur = next
      }
    }
  })
})

describe('every position can still be won', () => {
  it('has no failure and no canStillWin, and needs neither', () => {
    // Taking a square off is never refused, and what is left is part of the
    // answer, which lands in any order. So no position a player can reach is
    // one they cannot win from, and Step back has no dead end to walk out of.
    expect(longSnake.engine.failure).toBeUndefined()
    expect(longSnake.engine.canStillWin).toBeUndefined()
  })

  it('walks back to the answer from anywhere a player can reach', () => {
    // Take off every square the answer does not use, then add every square it
    // does, from every position twenty boards a level of random play reached.
    // Every one of those taps has to land, and the last one has to solve it.
    const lost: string[] = []
    let walked = 0
    for (const level of levels) {
      for (let k = 0; k < 20; k++) {
        const answer = new Set(dealt(level, SEEDS[k]).answer)
        for (const state of wander(level, k)) {
          walked++
          const at = `${level.id} ${SEEDS[k]} ${key(state)}`
          let back = state
          const lay = (i: number) => {
            const next = reduce(back, tap(i))
            if (next === back) lost.push(`${at}: ${i} would not ${back.snake[i] ? 'come off' : 'go on'}`)
            back = next
          }
          for (let i = 0; i < state.snake.length; i++) if (state.snake[i] && !answer.has(i)) lay(i)
          for (const i of answer) if (!back.snake[i]) lay(i)
          if (!isSolved(back)) lost.push(`${at}: not solved`)
        }
      }
    }
    expect(walked).toBeGreaterThan(3000)
    expect(lost).toEqual([])
  })
})

describe('what the board may say without being asked', () => {
  it('dots a square whose row or column has all its snake squares, and no other', () => {
    const dots = dottedCells(fixture())
    expect(dots.flatMap((dot, i) => (dot ? [i] : []))).toEqual(FIXTURE_DOTS)
    for (const level of levels) {
      for (const state of wander(level, 0)) {
        const { n } = state
        const full = (cells: number[], clue: number) => snakeIn(state, cells) >= clue
        dottedCells(state).forEach((dot, i) => {
          const lineFull =
            full(rowCells(n, rowOf(n, i)), state.rowClues[rowOf(n, i)]) ||
            full(colCells(n, colOf(n, i)), state.colClues[colOf(n, i)])
          expect(dot).toBe(!state.snake[i] && lineFull)
        })
      }
    }
  })

  it("never dots a square for the snake's own shape", () => {
    // Row 2 column 2 would touch the snake side by side, and the board does
    // not say so: whether a square can join the snake there is the puzzle.
    const state = fixture([1, 2])
    expect(clashOf(state, 6)?.kind).toBe('touch')
    expect(dottedCells(state)[6]).toBe(false)
  })

  it('crosses a number off when its line is full, and boxes it when it can never be', () => {
    const empty = fixture()
    expect(colMarks(empty)).toEqual(['done', 'open', 'open', 'open', 'done'])
    expect(rowMarks(empty)).toEqual(['open', 'open', 'open', 'done', 'done'])

    // Row 2 column 3 breaks no rule, and fills row 2 — whose dots then leave
    // column 4 two squares with room for the three it still wants.
    expect(canAdd(empty, 7)).toBe(true)
    const spoiled = reduce(empty, tap(7))
    expect(rowMarks(spoiled)[1]).toBe('done')
    expect(colMarks(spoiled)[3]).toBe('stuck')
    expect(strandedEnds(spoiled)).toEqual([])
    // Short of room, and not out of it: two squares in that column still have
    // room, and the sentence does not say there are none.
    expect(troubleOf(spoiled)?.message).toBe('Column 4 does not have room for all its snake squares.')

    // Nothing on the board breaks a rule, so this is not a dead end the shell
    // has to lock: taking the square off puts the board back.
    const back = reduce(spoiled, tap(7))
    expect(colMarks(back)).toEqual(colMarks(empty))
    expect(isSolved(play(back, FIXTURE_ANSWER.slice(1, -1).map(tap)))).toBe(true)
  })

  it('boxes a number exactly when the dots under it say so', () => {
    // The claim the clay box rests on: a child can check it by looking. A line
    // is boxed exactly when the squares in it with neither the snake nor a dot
    // on them are fewer than its number still wants.
    for (const level of levels.slice(0, 2)) {
      for (let k = 0; k < 6; k++) {
        for (const state of wander(level, k)) {
          const dots = dottedCells(state)
          const check = (mark: string, cells: number[], clue: number) => {
            const has = snakeIn(state, cells)
            const room = cells.filter((i) => !state.snake[i] && !dots[i]).length
            expect(mark === 'done').toBe(has === clue)
            if (has !== clue) expect(mark === 'stuck').toBe(room < clue - has)
          }
          rowMarks(state).forEach((mark, r) => check(mark, rowCells(state.n, r), state.rowClues[r]))
          colMarks(state).forEach((mark, c) => check(mark, colCells(state.n, c), state.colClues[c]))
        }
      }
    }
  })

  it('rings a snake square that has nowhere left to go, and every one of them', () => {
    // Row 2 column 2, then row 1 column 2: both land. The first now has one
    // neighbour and every other square beside it dotted, and so has the tail.
    const state = play(fixture(), [tap(6), tap(1)])
    expect(state.snake[6] && state.snake[1]).toBe(true)
    expect(strandedEnds(state)).toEqual([6, 16])
    for (const i of strandedEnds(state)) expect(roomBeside(state, i)).toBe(0)
    // A line out of room is a sentence about the whole board, so it is the one
    // said — and both squares are still ringed.
    expect(rowMarks(state)[2]).toBe('stuck')
    expect(troubleOf(state)?.message).toBe('Row 3 does not have room for all its snake squares.')
  })

  it('says the snake reached its tail too soon', () => {
    const soon = play(toy(), [1, 2, 3, 7, 11].map(tap))
    expect(snakeCount(soon)).toBe(7)
    expect(pieceOf(soon, 0)).toContain(15)
    expect(isSolved(soon)).toBe(false)
    expect(troubleOf(soon)).toMatchObject({ kind: 'soon', message: 'The snake reaches its tail too soon.' })
  })

  it('says the snake is in pieces when every number is right, before any square', () => {
    const { head, tail, rowClues, colClues } = pieces()
    expect(countSolutions(4, head, tail, rowClues, colClues, 3)).toBe(1)
    expect(countSolutions(4, head, tail, rowClues, colClues, 3, false)).toBe(1)
    const split = play(pieces(), [9, 10, 12, 13].map(tap))
    expect(snakeCount(split)).toBe(lengthOf(split))
    // Four squares are stranded as well, and the whole board's sentence wins.
    expect(strandedEnds(split)).toEqual([4, 10, 12, 15])
    expect(troubleOf(split)?.message).toBe('Every number is right. The snake is in more than one piece.')
  })

  it('says a lone square has no way through, and only when it has room on one side', () => {
    const { head, tail, rowClues, colClues } = wayThrough()
    expect(countSolutions(4, head, tail, rowClues, colClues, 3)).toBe(1)
    expect(countSolutions(4, head, tail, rowClues, colClues, 3, false)).toBe(1)
    const state = play(wayThrough(), [tap(12), tap(14)])
    expect(state.snake[12] && state.snake[14]).toBe(true)
    expect(strandedEnds(state)).toEqual([12, 14])
    // The bottom left corner wants two and has room for one: a way in, and no
    // way out. The square beside the tail wants one more and has no room.
    expect(roomBeside(state, 12)).toBe(1)
    expect(roomBeside(state, 14)).toBe(0)
    expect(troubleOf(state)?.message).toBe('The snake square in row 4, column 1 has no way through.')
    // With the square beside the tail alone, nothing is wrong yet.
    const one = reduce(wayThrough(), tap(14))
    expect(strandedEnds(one)).toEqual([])
    expect(troubleOf(one)).toBeNull()
  })

  it('says two parts touch at a corner only on a board no deal makes', () => {
    expect(troubleOf(cornered())).toMatchObject({ kind: 'corner', message: 'Two parts of the snake touch at a corner.' })
  })

  it('never says a sentence that is untrue of the square or the line it names', () => {
    // Every position a player can reach on one level-one board, walked whole.
    // "Nowhere left to go" is said only of a square with no room beside it,
    // "no way through" only of a lone square in the body with room on one
    // side only, and a line's sentence only of a line with fewer squares with
    // room than its number still wants.
    const first = start(levels[0], SEEDS[0])
    const seen = new Set([key(first)])
    const stack = [first]
    const said: Record<string, number> = {}
    const lies: string[] = []
    let roomLeft = 0
    while (stack.length > 0) {
      const state = stack.pop() as SnakeState
      const trouble = troubleOf(state)
      let sentence: string = trouble?.kind ?? 'none'
      if (trouble?.kind === 'row' || trouble?.kind === 'column') {
        const k = trouble.kind === 'row' ? rowOf(state.n, trouble.cells[0]) : colOf(state.n, trouble.cells[0])
        const clue = trouble.kind === 'row' ? state.rowClues[k] : state.colClues[k]
        const room = roomIn(state, trouble.cells)
        if (!trouble.message.endsWith(' does not have room for all its snake squares.')) lies.push(trouble.message)
        if (room >= clue - snakeIn(state, trouble.cells)) lies.push(`${key(state)}: ${trouble.message}`)
        if (room > 0) roomLeft++
      }
      if (trouble?.kind === 'stranded') {
        const [named] = trouble.cells
        const room = roomBeside(state, named)
        if (trouble.message.endsWith(' has nowhere left to go.')) {
          sentence = 'nowhere left to go'
          if (room !== 0) lies.push(`${key(state)}: ${trouble.message}`)
        } else {
          sentence = 'no way through'
          const lone = neighboursOn(state, named).length === 0 && !isEnd(state, named)
          if (!trouble.message.endsWith(' has no way through.') || room !== 1 || !lone) {
            lies.push(`${key(state)}: ${trouble.message}`)
          }
        }
      }
      said[sentence] = (said[sentence] ?? 0) + 1
      for (const action of legalMoves(state)) {
        const next = reduce(state, action)
        if (next === state || seen.has(key(next))) continue
        seen.add(key(next))
        stack.push(next)
      }
    }
    expect(seen.size).toBe(3272)
    expect(lies).toEqual([])
    // Every sentence but the corner one is heard on this one board — the snake
    // in pieces exactly once — and three positions in four say something.
    expect(said).toEqual({
      none: 783,
      soon: 24,
      row: 816,
      column: 848,
      pieces: 1,
      'nowhere left to go': 634,
      'no way through': 166,
    })
    // And a line is mostly named while it still has room: 1,381 of these 1,664
    // sentences are said of a line with a square left that has room, and the
    // tents' "no room left" would have been untrue of every one of them.
    expect(roomLeft).toBe(1381)
  })

  it('never cries wrong turn on a position the answer goes through', () => {
    // Five orders of the answer a board, twenty boards a level: nothing the
    // board says without being asked ever calls a position spoilt that is
    // not, from the start to the finished snake, and no square the answer
    // still needs is ever dotted. So a child who adds only squares they can
    // argue for never sees clay.
    const cried: string[] = []
    let laid = 0
    for (const level of levels) {
      for (let k = 0; k < 20; k++) {
        const drawn = dealt(level, SEEDS[k])
        const inner = solutionActions(drawn)
        const rng = makeRng(k)
        const check = (state: SnakeState) => {
          laid++
          const at = `${level.id} ${SEEDS[k]} ${key(state)}`
          if (rowMarks(state).includes('stuck') || colMarks(state).includes('stuck')) cried.push(`${at}: a boxed number`)
          if (strandedEnds(state).length > 0) cried.push(`${at}: a ringed square`)
          const trouble = troubleOf(state)
          if (trouble !== null) cried.push(`${at}: ${trouble.message}`)
          const dots = dottedCells(state)
          if (drawn.answer.some((i) => dots[i])) cried.push(`${at}: a dot on the answer`)
        }
        for (let order = 0; order < 5; order++) {
          let cur = start(level, SEEDS[k])
          check(cur)
          for (const action of shuffled(rng, inner)) {
            cur = reduce(cur, action)
            check(cur)
          }
          if (!isSolved(cur)) cried.push(`${level.id} ${SEEDS[k]}: the answer did not solve it`)
        }
      }
    }
    expect(laid).toBe(5 * 20 * levels.reduce((sum, level) => sum + (level.par as number) + 1, 0))
    expect(cried).toEqual([])
  })

  it('counts a line it has never seen the same way', () => {
    expect(lineMark(fixture(), rowCells(5, 4), 0)).toBe('done')
    expect(lineMark(fixture(), rowCells(5, 0), 4)).toBe('open')
    expect(lineMark(reduce(fixture(), tap(7)), colCells(5, 3), 3)).toBe('stuck')
  })
})

/* ============================================================
   What a player who thinks about nothing gets

   Four mindless players, measured on the boards the levels deal
   (seeds 1000 + 37k) and pinned, because each figure is a
   measurement rather than a bound. None of them reads a number.
   ============================================================ */

/** Two hundred boards a level: the sixty `SEEDS` and the hundred and forty after them. */
const CLIMBED = Array.from({ length: 200 }, (_, k) => 1000 + 37 * k)

/** Climber A: every square once, in a random order; keep whatever lands, and never go back. */
const climbA = (state: SnakeState, rng: Rng): SnakeState =>
  shuffled(rng, legalMoves(state)).reduce((cur, action) => reduce(cur, action), state)

/** Which of the board's own marks a player reads: none, the boxed numbers, or all of them. */
type Reads = 'none' | 'lines' | 'all'

/** True when the board is saying a wrong turn that this player reads. */
const marked = (state: SnakeState, reads: Reads): boolean => {
  if (reads === 'none') return false
  if (rowMarks(state).includes('stuck') || colMarks(state).includes('stuck')) return true
  if (reads === 'lines') return false
  if (strandedEnds(state).length > 0) return true
  const fromHead = pieceOf(state, state.head)
  return fromHead.includes(state.tail) && fromHead.length < lengthOf(state)
}

/**
 * The careful climber: tap the squares in random passes, and take a tap
 * straight back — two moves — whenever it raises a mark this player reads. It
 * never takes a square off otherwise, and stops when a pass lands nothing.
 */
const climbCarefully = (first: SnakeState, rng: Rng, reads: Reads) => {
  let state = first
  let moves = 0
  for (;;) {
    let changed = false
    for (const action of shuffled(rng, legalMoves(first))) {
      if (state.snake[action.index]) continue
      const next = reduce(state, action)
      if (next === state) continue
      moves++
      if (marked(next, reads)) {
        moves++
        continue
      }
      state = next
      changed = true
      if (isSolved(state)) return { solved: true, moves }
    }
    if (!changed) return { solved: false, moves }
  }
}

/** The free end of the snake that runs from the head: the square a blind walk extends. */
const chainEnd = (state: SnakeState): number => {
  let prev = -1
  let at = state.head
  for (;;) {
    const next = orthogonal(state.n, at)
      .filter((j) => state.snake[j])
      .find((j) => j !== prev)
    if (next === undefined) return at
    if (isEnd(state, next)) return next
    prev = at
    at = next
  }
}

/**
 * A blind walk from the head: add a random square beside the end of the head's
 * snake that lands, and back up — one more tap — at a dead end or at the tail
 * unsolved. With `marks`, it also backs up the moment the board boxes a number
 * or rings a square. It stops past `budget` taps.
 *
 * The tail is never one of the squares it tries: `chainEnd` walks on into the
 * tail the moment the end of the head's snake is beside it, so the end it
 * hands back is never beside a tail that has not joined.
 */
const walkBlind = (first: SnakeState, rng: Rng, marks: boolean, budget: number) => {
  let taps = 0
  let solved = false
  const wrongTurn = (state: SnakeState) =>
    rowMarks(state).includes('stuck') || colMarks(state).includes('stuck') || strandedEnds(state).length > 0
  const go = (state: SnakeState): void => {
    if (solved || taps > budget) return
    const end = chainEnd(state)
    if (end === state.tail) {
      if (isSolved(state)) solved = true
      return
    }
    for (const j of shuffled(rng, orthogonal(state.n, end))) {
      if (state.snake[j]) continue
      const next = reduce(state, tap(j))
      if (next === state) continue
      taps++
      if (!(marks && wrongTurn(next))) go(next)
      if (solved || taps > budget) return
      taps++
    }
  }
  go(first)
  return { solved, taps }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

describe('what a player who thinks about nothing gets', () => {
  it('can be climbed now and then at eleven squares long, and hardly ever above it', () => {
    // Climber A lands 16 of 200 boards at eleven long, one in twelve, where the
    // counting squares ship one in fifteen to the same climber; 3 at fourteen
    // long, and none at twenty. It never takes a square off, so every board it
    // lands is landed at exactly par.
    const landed = levels.map((level) => {
      let count = 0
      CLIMBED.forEach((seed, k) => {
        const end = climbA(start(level, seed), makeRng(77 + k))
        if (!isSolved(end)) return
        count++
        expect(snakeCount(end) - 2).toBe(level.par)
      })
      return count
    })
    expect(landed).toEqual([16, 3, 0])
  }, 20_000)

  it('lets a careful climber read its way through the marks, and less than the tents allow', () => {
    // The marks are what the careful climber reads, and it is the strongest
    // mindless player there is: 111, 45 and 1 of 200 with every mark, 68, 25
    // and 0 with the boxed numbers alone, and 16, 3 and 0 with none. The same
    // climber on the tents and trees solves 168, 81 and 47 of 200 with its
    // marks, and they ship. Most of the lift here is the ringed square — take
    // `strandedEnds` out of `troubleOf` and the board, and this board falls to
    // the second row of figures — so that is one measured decision, not an
    // accident.
    //
    // And what the marks cost it. Every take-back is two moves, so the median
    // board it lands takes 13, 18 and 36 moves with every mark (1.4, 1.5 and
    // 2.0 times par), 11 and 16 with the boxed numbers alone (1.2 and 1.3
    // times), and exactly par with none — it never takes a square back then.
    const climbed = (reads: Reads) =>
      levels.map((level) => {
        const landed = CLIMBED.map((seed, k) => climbCarefully(start(level, seed), makeRng(77 + k), reads)).filter(
          (climb) => climb.solved,
        )
        return { solved: landed.length, moves: landed.length === 0 ? null : median(landed.map((c) => c.moves)) }
      })
    expect(climbed('all')).toEqual([
      { solved: 111, moves: 13 },
      { solved: 45, moves: 18 },
      { solved: 1, moves: 36 },
    ])
    expect(climbed('lines')).toEqual([
      { solved: 68, moves: 11 },
      { solved: 25, moves: 16 },
      { solved: 0, moves: null },
    ])
    expect(climbed('none')).toEqual([
      { solved: 16, moves: 9 },
      { solved: 3, moves: 12 },
      { solved: 0, moves: null },
    ])
  }, 20_000)

  it('costs a blind walk more than par, and more the longer the snake', () => {
    // Sixty boards a level, each walked from `makeRng(5 + k)` with fifty times
    // par to spend. Every walk gets there in the end, which is what walking
    // blind costs rather than whether it can: the median walk takes 17, 30 and
    // 116 taps (1.9, 2.5 and 6.4 times par), and reading the marks brings that
    // to 13, 20 and 60.
    //
    // A walk that never meets a fork it gets wrong lands at exactly par, and
    // that happens: 16, 2 and 0 of these sixty a level, with or without the
    // marks. Worked out exactly — at every step the walk takes one of the
    // squares that land, at random, so its chance is one over their number,
    // multiplied along the answer — it is 18.9%, 9.8% and 1.3% over seeds 0 to
    // 999. So a first level walked blind comes out at par about one time in
    // five. That is luck and not a way through, and it is rarer at every level
    // above.
    const walks = (marks: boolean) =>
      levels.map((level) => {
        const par = level.par as number
        const spent = SEEDS.map((seed, k) => {
          const walk = walkBlind(start(level, seed), makeRng(5 + k), marks, 50 * par)
          expect(walk.solved).toBe(true)
          return walk.taps
        })
        return { median: median(spent), atPar: spent.filter((taps) => taps === par).length }
      })
    expect(walks(false)).toEqual([
      { median: 17, atPar: 16 },
      { median: 30, atPar: 2 },
      { median: 116, atPar: 0 },
    ])
    expect(walks(true)).toEqual([
      { median: 13, atPar: 16 },
      { median: 20, atPar: 2 },
      { median: 60, atPar: 0 },
    ])
  }, 20_000)

  it('needs both steps on every board, so every hint teaches a step the board asks for', () => {
    for (const level of levels) {
      for (const seed of SEEDS) {
        const reasoned = reasonedOut(level.config.n, dealt(level, seed))
        expect(reasoned?.tight).toBeGreaterThan(0)
        expect(reasoned?.onlyWay).toBeGreaterThan(0)
        expect((reasoned?.tight ?? 0) + (reasoned?.onlyWay ?? 0)).toBe(level.par)
      }
    }
  })
})

describe('describe', () => {
  it('names the square, in the past tense, both ways round', () => {
    const state = fixture()
    const on = reduce(state, tap(8))
    expect(describeMove(state, on, tap(8))).toBe('Added row 2, column 4 to the snake')
    expect(describeMove(on, state, tap(8))).toBe('Took row 2, column 4 off the snake')
  })

  it('names the square the move actually changed, for every square', () => {
    const state = start(levels[1], 44)
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      if (next === state) continue
      const changed = next.snake.findIndex((on, i) => on !== state.snake[i])
      expect(describeMove(state, next, action)).toContain(
        `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
      )
    }
  })
})

/* ============================================================
   The board
   ============================================================ */

const paint = (state: SnakeState, locked = false, allow = true) => {
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
const Play = ({ from }: { from: SnakeState }) => {
  const [state, setState] = useState(from)
  return createElement(Board, {
    state,
    dispatch: (action: SnakeAction) => setState((cur) => reduce(cur, action)),
    locked: false,
  })
}

const playing = (from: SnakeState) => render(createElement(Play, { from }), { wrapper: underSettings() })

const wearing = (cue: string) =>
  [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

/** The band the snake is drawn as: the one svg laid straight into the field. */
const bandOf = (container: HTMLElement) => container.querySelector('[role="group"] > svg') as SVGSVGElement

describe('the board', () => {
  it('draws a square you can press wherever the head and tail are not, and a picture for the head', () => {
    const { all, view } = paint(fixture())
    expect(all()).toHaveLength(25 - 2)
    for (const button of all()) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).toMatch(/^Row \d+, column \d+, (empty|a snake square)/)
    }
    // The head and the tail are given, not controls, and neither is a number.
    expect(screen.getByRole('img', { name: "Row 1, column 1, the snake's head" })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: "Row 4, column 2, the snake's tail" })).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(2 + 10)
    // The picture is the band's last word, on the head's square.
    const picture = bandOf(view.container).lastElementChild as SVGSVGElement
    expect(picture.tagName.toLowerCase()).toBe('svg')
    expect([picture.getAttribute('x'), picture.getAttribute('y')]).toEqual(['0.07', '0.07'])
  })

  it('draws the head and the tail as snake squares from the start', () => {
    const { view } = paint(fixture())
    const band = bandOf(view.container)
    expect(band.getAttribute('viewBox')).toBe('0 0 5 5')
    // A node on each end, once in the hairline and once in the enamel, and no
    // link yet: the two are not side by side.
    const centres = [...band.querySelectorAll(':scope > g circle')].map(
      (circle) => `${circle.getAttribute('cx')},${circle.getAttribute('cy')}`,
    )
    expect(centres.sort()).toEqual(['0.5,0.5', '0.5,0.5', '1.5,3.5', '1.5,3.5'])
    expect(band.querySelectorAll('line')).toHaveLength(0)
  })

  it('joins snake squares side by side into one band', () => {
    // Row 1 columns 2 and 3 beside the head, and row 2 column 4 on its own
    // corner of them: five nodes, and two links along the top.
    const state = fixture([1, 2, 8])
    const { view } = paint(state)
    const band = bandOf(view.container)
    expect(band.querySelectorAll('circle')).toHaveLength(2 * snakeCount(state))
    const links = [...band.querySelectorAll(':scope > g:last-of-type line')].map((line) =>
      ['x1', 'y1', 'x2', 'y2'].map((a) => line.getAttribute(a)).join(','),
    )
    expect(links).toEqual(['0.5,0.5,1.5,0.5', '1.5,0.5,2.5,0.5'])
    expect(band.querySelectorAll('line')).toHaveLength(2 * links.length)
  })

  it('narrows the band into the tail, so the tail is never taken for a square a child added', () => {
    // A square added on its own is a node at the band's full width, and so is
    // the free end of any piece a child starts in the middle. The tail's node
    // is the narrow one, from the first render, in the hairline and the enamel
    // alike.
    const { view } = paint(fixture([8]))
    const radii = (cx: string, cy: string) =>
      [...bandOf(view.container).querySelectorAll(`circle[cx="${cx}"][cy="${cy}"]`)].map((c) => c.getAttribute('r'))
    expect(radii('3.5', '1.5')).toEqual(['0.25', '0.23'])
    expect(radii('1.5', '3.5')).toEqual(['0.15', '0.13'])
    view.unmount()

    // Joined, the link into the tail is a taper from the band's width down to
    // the tail's — the one link that is not a straight run.
    const joined = paint(fixture([11])).view
    const band = bandOf(joined.container)
    expect(band.querySelectorAll('line')).toHaveLength(0)
    expect([...band.querySelectorAll('polygon')].map((p) => p.getAttribute('points'))).toEqual([
      '1.25,2.5 1.35,3.5 1.65,3.5 1.75,2.5',
      '1.27,2.5 1.37,3.5 1.63,3.5 1.73,2.5',
    ])
  })

  it('stands a number at the end of every row and every column, and says how it is doing', () => {
    paint(fixture())
    expect(screen.getByRole('img', { name: 'Row 1 wants 4 snake squares and has 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Row 5 wants no snake squares at all' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Column 1 has its 1 snake square' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Column 2 wants 3 snake squares and has 1' })).toBeInTheDocument()
    const marks = [...document.querySelectorAll('[role="img"][data-mark]')]
      .filter((el) => /^(Row|Column) \d+ (wants|has)/.test(el.getAttribute('aria-label') ?? ''))
      .map((el) => el.getAttribute('data-mark'))
    expect(marks).toEqual([
      // The columns along the top, then the rows down the side.
      'done', 'open', 'open', 'open', 'done',
      'open', 'open', 'open', 'done', 'done',
    ])
  })

  it('crosses the number off when its line is full, and boxes it when it can never be', () => {
    const one = playing(fixture())
    fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 4, empty$/ }))
    expect(screen.getByRole('img', { name: 'Row 2 has its 1 snake square' })).toHaveAttribute('data-mark', 'done')
    one.unmount()

    // Row 2 column 3 fills row 2, and its dots leave column 4 short of room:
    // two squares for the three it wants. Short of room is not out of it, and
    // the label counts what is left, the way a looker does.
    const two = playing(fixture())
    fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 3, empty$/ }))
    expect(
      screen.getByRole('img', { name: 'Column 4 wants 3 snake squares, has 0, and has room for only 2 more' }),
    ).toHaveAttribute('data-mark', 'stuck')
    expect(screen.getAllByText('Column 4 does not have room for all its snake squares.').length).toBeGreaterThan(0)
    two.unmount()

    // Row 1 column 4 and row 3 column 4 first, and then the same square: now
    // column 4 has two of its three, and its only other square is dotted.
    const three = playing(fixture())
    for (const square of [/^Row 1, column 4, empty/, /^Row 3, column 4, empty/, /^Row 2, column 3, empty/]) {
      fireEvent.click(screen.getByRole('button', { name: square }))
    }
    expect(
      screen.getByRole('img', { name: 'Column 4 wants 3 snake squares, has 2, and has no room for more' }),
    ).toHaveAttribute('data-mark', 'stuck')
    expect(screen.getAllByText('Column 4 does not have room for all its snake squares.').length).toBeGreaterThan(0)
    three.unmount()
  })

  it('rings every square that has nowhere left to go, and says which one', () => {
    const one = playing(fixture())
    fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 2, empty$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 2, empty$/ }))
    // Both are ringed, although the sentence is about the row that outranks them.
    expect(
      screen.getByRole('button', { name: 'Row 2, column 2, a snake square, with nowhere left to go' }),
    ).toHaveAttribute('data-mark', 'stuck')
    expect(
      screen.getByRole('img', { name: "Row 4, column 2, the snake's tail, with nowhere left to go" }),
    ).toHaveAttribute('data-mark', 'stuck')
    expect(screen.getByRole('img', { name: "Row 1, column 1, the snake's head" })).not.toHaveAttribute('data-mark')
    expect(screen.getByRole('button', { name: 'Row 1, column 2, a snake square' })).not.toHaveAttribute('data-mark')
    one.unmount()

    const two = playing(wayThrough())
    fireEvent.click(screen.getByRole('button', { name: /^Row 4, column 1, empty$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Row 4, column 3, empty$/ }))
    expect(
      screen.getByRole('button', { name: 'Row 4, column 1, a snake square, with no way through' }),
    ).toHaveAttribute('data-mark', 'stuck')
    expect(
      screen.getByRole('button', { name: 'Row 4, column 3, a snake square, with nowhere left to go' }),
    ).toHaveAttribute('data-mark', 'stuck')
    expect(
      screen.getAllByText('The snake square in row 4, column 1 has no way through.').length,
    ).toBeGreaterThan(0)
    two.unmount()
  })

  it('marks the squares a full line rules out, and no others', () => {
    const state = fixture([1, 2])
    paint(state)
    const dotted = [...document.querySelectorAll('[data-room="none"]')].map(
      (el) => el.getAttribute('aria-label') as string,
    )
    const expected = dottedCells(state)
      .map((dot, i) => (dot ? `Row ${rowOf(5, i) + 1}, column ${colOf(5, i) + 1}, empty, no room for the snake` : ''))
      .filter(Boolean)
    expect(dotted.sort()).toEqual(expected.sort())
    // Row 2 column 2 would touch the snake side by side and takes no dot: the
    // board never does the part about the snake's shape.
    expect(screen.getByRole('button', { name: 'Row 2, column 2, empty' })).not.toHaveAttribute('data-room')
  })

  it('sends exactly one action for one tap', () => {
    const { dispatch, by } = paint(fixture())
    fireEvent.click(by(/^Row 1, column 2, empty$/))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle', index: 1 })
  })

  it('counts what is left to fill in', () => {
    const view = playing(fixture())
    expect(screen.getAllByText('7 snake squares still to fill in.').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 2, empty$/ }))
    expect(screen.getAllByText('6 snake squares still to fill in.').length).toBeGreaterThan(0)
    view.unmount()

    paint(fixture(FIXTURE_ANSWER.slice(0, -2)))
    expect(screen.getAllByText('1 snake square still to fill in.').length).toBeGreaterThan(0)
    // The tally is not news, so the board's own status line does not say it.
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('adds a forbidden square, answers it, and puts it back', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    try {
      const state = fixture([1, 2])
      const { dispatch, view } = paint(state)
      fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 2, empty/ }))
      // Nothing forbidden reaches the shell, so nothing reaches the history.
      expect(dispatch).not.toHaveBeenCalled()
      // The square is drawn where the child put it, for one cue: its node is in
      // the band, and there is no link from it to the square it touches. It
      // presses against the snake rather than joining it, which is what the
      // sentence says; linked, the band would run round it as a bend that a
      // snake may make.
      const flashed = view.container.querySelector(`.${cues.flash}`) as HTMLElement
      expect(flashed.getAttribute('aria-label')).toBe('Row 2, column 2, a snake square')
      expect(bandOf(view.container).querySelectorAll('circle')).toHaveLength(2 * (snakeCount(state) + 1))
      expect(bandOf(view.container).querySelectorAll('line')).toHaveLength(2 * 2)
      for (const line of screen.getAllByRole('status')) {
        expect(line.textContent).toContain('The snake would touch itself side by side here.')
      }
      // And the square it would touch is lit, beside the one wearing the ring.
      expect(wearing(cues.highlight)).toHaveLength(1)

      act(() => vi.advanceTimersByTime(480))
      expect(view.container.querySelector(`.${cues.flash}`)).toBeNull()
      expect(screen.getByRole('button', { name: 'Row 2, column 2, empty' })).toBeInTheDocument()
      expect(bandOf(view.container).querySelectorAll('circle')).toHaveLength(2 * snakeCount(state))
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('draws the ring a refused square would close, because the ring is what it names', () => {
    // A touch is drawn unjoined, and a ring is not: the closed loop is the
    // shape the sentence is about. Two links on the board, and two more for
    // the length of the cue.
    const state = toy([5, 6, 10])
    const { view } = paint(state)
    expect(bandOf(view.container).querySelectorAll('line')).toHaveLength(2 * 2)
    fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 2, empty/ }))
    for (const line of screen.getAllByRole('status')) {
      expect(line.textContent).toContain('The snake would join up into a ring.')
    }
    expect(bandOf(view.container).querySelectorAll('line')).toHaveLength(2 * 4)
  })

  it('lights the line a refused square would have taken past its number', () => {
    const { view } = paint(fixture())
    fireEvent.click(screen.getByRole('button', { name: /^Row 5, column 1, empty/ }))
    // The number itself is what the tap fell foul of, so it is lit with its row.
    const clue = screen.getByRole('img', { name: 'Row 5 wants no snake squares at all' })
    expect(clue.className).toContain(cues.highlight)
    expect(wearing(cues.highlight)).toHaveLength(rowCells(5, 4).length - 1 + 1)
    for (const line of screen.getAllByRole('status')) {
      expect(line.textContent).toContain('Row 5 wants no snake squares at all.')
    }
    view.unmount()
  })

  it('lights the group for the length the highlight is animated over', () => {
    // `.highlight` runs for --dur-5, so the cue that puts it on has to hold it
    // for --dur-5: taken off at --dur-4 the light would be cut at 53% of its
    // run, in the middle of the plateau, and blink out at full clay.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const { view } = paint(fixture([1, 2]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 2, empty/ }))
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
    // taps again while the group is still lit — and the shell can rewind the
    // move tape under it at any time at all. The light has to go with the
    // position, or it blames squares on the board in front of the child for a
    // tap that was made on another one.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const view = playing(fixture([1, 2]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 2, empty/ }))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      act(() => vi.advanceTimersByTime(480))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // One square that the rules take, and the lit group is about a board that is gone.
      fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 4, empty$/ }))
      expect(screen.getByRole('button', { name: /^Row 1, column 4, a snake square$/ })).toBeInTheDocument()
      expect(wearing(cues.highlight)).toHaveLength(0)
      view.unmount()
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('takes the square back once the player has asked for a rule to refuse up front', () => {
    const { dispatch, by } = paint(fixture([1, 2]), false, false)
    expect(by(/^Row 1, column 4, empty$/)).not.toHaveAttribute('aria-disabled')
    const dead = by(/^The snake would touch itself side by side here\. Row 2, column 2, empty$/)
    expect(dead).toHaveAttribute('aria-disabled', 'true')
    expect(
      by(/^Column 1 already has its 1 snake square\. Row 2, column 1, empty, no room for the snake$/),
    ).toHaveAttribute('aria-disabled', 'true')
    // Taking a square off is never dead.
    expect(by(/^Row 1, column 2, a snake square$/)).not.toHaveAttribute('aria-disabled')
    // Dead, and never `disabled`: a disabled button cannot be focused, so the
    // arrow keys and the tab stop would both lose the square in silence. The
    // tap lands on it and nothing happens.
    expect(dead).toBeEnabled()
    dead.focus()
    expect(document.activeElement).toBe(dead)
    fireEvent.click(dead)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('always leaves one square a keyboard can reach, refusals up front', () => {
    // With forbidden moves offered every square is live, so this is the hard
    // way round. The tab stop is seeded on the first square that is neither
    // end, and on every one of these boards that square will not take a snake
    // square — so it has to be dead and focusable, not disabled.
    const boards: [number, number][] = [
      [0, 1111],
      [0, 1148],
      [1, 1074],
      [1, 1111],
      [2, 1037],
    ]
    for (const [level, seed] of boards) {
      const state = start(levels[level], seed)
      let first = 0
      while (isEnd(state, first)) first++
      expect(clashOf(state, first)).not.toBeNull()
      const { view, all } = paint(state, false, false)
      const stops = all().filter((el) => el.getAttribute('tabindex') === '0')
      expect(stops).toHaveLength(1)
      expect(stops[0]).toBeEnabled()
      expect(stops[0].getAttribute('aria-label')).toContain(`Row ${rowOf(state.n, first) + 1}, column ${colOf(state.n, first) + 1},`)
      stops[0].focus()
      expect(document.activeElement).toBe(stops[0])
      view.unmount()
    }
  })

  it('walks the arrow keys from square to square, stepping over the head and the tail', () => {
    const { by, all } = paint(fixture())
    // The head is in the corner, so the stop starts beside it.
    expect(all().filter((el) => el.getAttribute('tabindex') === '0')).toEqual([by(/^Row 1, column 2, empty$/)])
    const middle = by(/^Row 3, column 2, empty$/)
    act(() => middle.focus())
    fireEvent.keyDown(middle, { key: 'ArrowDown' })
    // Row 4, column 2 is the tail, so the step carries on to row 5.
    expect(document.activeElement).toBe(by(/^Row 5, column 2, empty/))
    // And it stands still at the edge rather than wrapping round.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(by(/^Row 5, column 2, empty/))
    // Left from row 1 column 2 is the head and then the edge: it stays put.
    const top = by(/^Row 1, column 2, empty$/)
    act(() => top.focus())
    fireEvent.keyDown(top, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(top)
    expect(all().filter((el) => el.getAttribute('tabindex') === '0')).toEqual([top])
  })

  it('ignores every input while it is locked', () => {
    const { dispatch, all } = paint(fixture(FIXTURE_ANSWER), true)
    for (const button of all()) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    fireEvent.keyDown(all()[0], { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const line of screen.getAllByRole('status')) expect(line.textContent).toBe('')
    // And the whole snake is drawn, head to tail, with every number crossed off.
    expect(document.querySelectorAll('[role="img"][data-mark="done"]')).toHaveLength(10)
  })

  it('leaves the title, the hints and the win message to the shell', () => {
    const { view } = paint(fixture())
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(longSnake.title)
    expect(text).not.toContain(longSnake.tagline)
    for (const line of longSnake.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(longSnake.id).toBe('long-snake')
    expect(longSnake.title).toBe('The long snake')
    expect(longSnake.reseedable).toBe(true)
    expect(Object.keys(longSnake.engine).sort()).toEqual(['Board', 'describe', 'init', 'isSolved', 'reduce'])
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['eleven-long', 'fourteen-long', 'twenty-long'])
    expect(longSnake.instructions).toHaveLength(4)
    for (const line of longSnake.instructions) expect(line.length, line).toBeLessThanOrEqual(100)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length, hint).toBeLessThanOrEqual(140)
    }
    // Plain, finished sentences, and nothing shouted.
    for (const line of [longSnake.tagline, ...longSnake.instructions, ...levels.flatMap((l) => l.hints)]) {
      expect(line, line).toMatch(/^[A-Z].*\.$/)
      expect(line, line).not.toContain('!')
    }
  })

  it('tells the child that the head and the tail count', () => {
    // Both are drawn as given squares, and the tents' given square does not
    // count. A child who leaves them out solves none of 1000 boards.
    expect(longSnake.instructions.some((line) => /head and the tail count/.test(line))).toBe(true)
  })

  it("never puts the corner clause in the child's words", () => {
    // Every dealt snake bends at least three times, and every bend puts two of
    // its squares corner to corner. Told "not even at a corner" in this
    // collection's meaning of touching, a child rules out the far square of
    // every bend: that reading solves none of 1000 boards at any level.
    for (const line of [...longSnake.instructions, ...levels.flatMap((l) => l.hints)]) {
      expect(line).not.toMatch(/corner/i)
    }
    expect(longSnake.instructions.some((line) => /side by side/.test(line))).toBe(true)
  })

  it('ramps by size and length, and asks for more steps as it goes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.par)).toEqual([9, 12, 18])
    const floors = levels.map((l) => l.config.minSteps)
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
  })

  it('stands every ceiling no higher than the floor of the level above it', () => {
    const bands = levels.map((l) => l.config)
    for (let k = 0; k + 1 < bands.length; k++) {
      expect(bands[k].maxSteps).toBeLessThanOrEqual(bands[k + 1].minSteps)
      expect(bands[k].maxSteps).toBeGreaterThanOrEqual(bands[k].minSteps)
    }
    // And the last level is the one left open, because nothing stands above
    // it. A wave has to settle a square to count, so the board's own squares
    // are past anything the dial can reach.
    const last = bands[bands.length - 1]
    expect(last.maxSteps).toBeGreaterThanOrEqual(last.n * last.n)
  })

  it('never names a square that would give an answer away', () => {
    // Every board is dealt fresh, so a hint that named a square would be wrong
    // as often as it was right.
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('never borrows a board word for something the board does not mean by it', () => {
    // The board calls a dotted square "empty", and says "nowhere left to go"
    // and "no way through" of a wrong turn. A hint that used those words for
    // anything else would be read as the board's.
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/\bempty\b|nowhere left|no way through/i)
    }
  })
})

describe('the card', () => {
  it('is a real board with one answer, and draws that answer', () => {
    const { n, head, tail, rowClues, colClues, snake } = CARD
    const state: SnakeState = {
      n,
      head,
      tail,
      rowClues,
      colClues,
      snake: Array.from({ length: n * n }, (_, i) => snake.includes(i)),
    }
    expect(isSolved(state)).toBe(true)
    expect(snake[0]).toBe(head)
    expect(snake[snake.length - 1]).toBe(tail)
    for (let r = 0; r < n; r++) expect(rowClues[r]).toBe(snakeIn(state, rowCells(n, r)))
    for (let c = 0; c < n; c++) expect(colClues[c]).toBe(snakeIn(state, colCells(n, c)))
    expect(countSolutions(n, head, tail, rowClues, colClues, 3)).toBe(1)
    expect(countSolutions(n, head, tail, rowClues, colClues, 3, false)).toBe(1)

    // And the picture is drawn from it, so the two cannot drift apart: a bone
    // tile on every square but the two ends, the body along the answer in its
    // hairline and its enamel, narrowing into the tail as the board's does,
    // and the snake on the head.
    const card = render(createElement(LongSnakeIcon)).container
    expect(card.querySelectorAll('rect')).toHaveLength(1 + (n * n - 2) + 1)
    // The snake's own artwork brings shapes of its own, so only the scene's
    // are read: the hairline, in a group at four tenths so that its three
    // shapes do not darken where they overlap, and then the enamel.
    const scene = (shape: string) => [...card.querySelectorAll(`:scope > svg > g > ${shape}, :scope > svg > ${shape}`)]
    expect((card.querySelector(':scope > svg > g') as SVGGElement).getAttribute('opacity')).toBe('0.4')
    const runs = scene('polyline')
    expect(runs.map((line) => line.getAttribute('stroke'))).toEqual(['var(--ink)', 'var(--p-teal)'])
    const at = (i: number) => Math.round((9 + 7.4 * i + 3.7) * 1000) / 1000
    const points = snake
      .slice(0, -1)
      .map((i) => `${at(colOf(n, i))},${at(rowOf(n, i))}`)
      .join(' ')
    for (const line of runs) expect(line.getAttribute('points')).toBe(points)
    expect(scene('polygon').map((taper) => taper.getAttribute('fill'))).toEqual(['var(--ink)', 'var(--p-teal)'])
    const ends = scene('circle')
    expect(ends.map((end) => [end.getAttribute('cx'), end.getAttribute('cy'), end.getAttribute('fill')])).toEqual([
      [String(at(colOf(n, tail))), String(at(rowOf(n, tail))), 'var(--ink)'],
      [String(at(colOf(n, tail))), String(at(rowOf(n, tail))), 'var(--p-teal)'],
    ])
    expect(2 * Number(ends[1].getAttribute('r'))).toBeLessThan(Number(runs[1].getAttribute('stroke-width')))
    const picture = card.querySelector('svg svg') as SVGSVGElement
    expect(Number(picture.getAttribute('x')) + 3.5).toBeCloseTo(at(colOf(n, head)))
    expect(Number(picture.getAttribute('y')) + 3.5).toBeCloseTo(at(rowOf(n, head)))
  })
})

/* ============================================================
   The stylesheet, as written. The margin is what the puzzle is
   played on, so the one thing asserted here is that a number
   stays inside the gutter that it stands in.
   ============================================================ */

describe('the margin', () => {
  // jsdom's URL is not node's, so take the directory off the module url by hand.
  const css = readFileSync(new URL(import.meta.url).pathname.replace(/[^/]+$/, 'board.module.css'), 'utf8')
  const block = (selector: string) => new RegExp(`\\.${selector} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''

  it('keeps a number narrower than its gutter, at all three sizes of board', () => {
    // Both are fractions of --cell, so the two cannot drift apart. Sized off
    // the viewport instead, the tents' numbers outgrew their gutter from 413px
    // up on the seven-wide board, and ran under the rim of the field.
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
    expect(floors).toEqual([46, 48, 44])
    // The floor of a square is a fingertip, which is the reason it has one:
    // less a 2px seat each side, the smallest tile is still 40px.
    expect(Math.min(...floors) - 2 * 2).toBeGreaterThanOrEqual(40)
    expect(minWidth * 16).toBeLessThan(gutter * Math.min(...floors))
  })

  it('fits the five-wide board to a phone, on the gutter the margin really has', () => {
    // On a narrow phone the five-wide square is what fits: the width the shell
    // leaves, over five squares and the gutter's share of one. The divisor is
    // written out, so it is held to the gutter here, and a 360px phone — the
    // commonest small one — gets a plan that fits the 276px it leaves: the
    // shell's page, sheet and stage take 76px and the frame's padding 8px.
    const plan = block('plan')
    const fit = /--cell: clamp\(\d+px, max\(min\(52px, \(100vw - (\d+)px\) \/ ([\d.]+)\)/.exec(plan)
    expect(fit).not.toBeNull()
    const [spare, divisor] = [Number(fit?.[1]), Number(fit?.[2])]
    const gutter = Number(/--gutter: calc\(var\(--cell\) \* ([\d.]+)\)/.exec(plan)?.[1])
    expect(divisor).toBeCloseTo(5 + gutter, 10)
    const square = (360 - spare) / divisor
    expect(divisor * square + 8).toBeLessThanOrEqual(360 - 76 - 8)
    expect(square - 2).toBeGreaterThanOrEqual(40)
  })
})
