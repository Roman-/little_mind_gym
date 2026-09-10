import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { tallAndShort } from './index'
import { Board } from './Board'
import type { Clash, Sign, TallAction, TallBoard, TallConfig, TallState } from './logic'
import {
  allShapes,
  applyShape,
  blankCount,
  canonicalKey,
  clashOf,
  colOf,
  conflicts,
  countSolutions,
  describeClash,
  describeMove,
  filledCount,
  hasChainOfThree,
  init,
  isSolved,
  keyOf,
  latinSolutions,
  legalMoves,
  POST_COLOURS,
  parseBoard,
  peersOf,
  postName,
  reduce,
  rowOf,
  signEndsOf,
  solutions,
  solveByLogic,
  sortSigns,
  standingClash,
  unitsOf,
  valuesOf,
  whereFrom,
} from './logic'

const levels = tallAndShort.levels as PuzzleLevel<TallConfig>[]
const start = (level: PuzzleLevel<TallConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37)

const boardsOf = (level: PuzzleLevel<TallConfig>): TallBoard[] =>
  level.config.bank.map((picture) => parseBoard(picture))

/** A state on a board nobody has touched, for the checks that want a board rather than a deal. */
const untouched = (board: TallBoard): TallState => ({
  ...board,
  entries: new Array<number>(board.n * board.n).fill(0),
})

/** Stands the one true post in every empty square, in order. */
function solutionActions(state: TallState): TallAction[] {
  const answer = solutions(state, 1)[0]
  expect(answer).toBeDefined()
  const out: TallAction[] = []
  state.givens.forEach((given, index) => {
    if (given === 0) out.push({ type: 'set', index, value: answer[index] })
  })
  return out
}

/** A seeded wander through the state graph, used to sample real positions. */
function walk(state: TallState, seed: number, steps: number): TallState[] {
  const rng = makeRng(seed)
  const out = [state]
  let cur = state
  for (let k = 0; k < steps; k++) {
    const options = legalMoves(cur)
    cur = reduce(cur, options[Math.floor(rng() * options.length)])
    out.push(cur)
  }
  return out
}

afterEach(cleanup)

/* ============================================================
   The bank

   Every board in index.ts had to clear four things offline, and
   all four are derived again here from the picture rather than
   trusted: one answer, reachable without guessing, every sign
   load-bearing, and — the one this puzzle turns on — *not*
   finishable with the signs covered up.
   ============================================================ */

describe('the bank', () => {
  for (const level of levels) {
    const { n, printed } = level.config

    it(`"${level.label}" holds at least three boards, all the right shape`, () => {
      expect(level.config.bank.length).toBeGreaterThanOrEqual(3)
      for (const board of boardsOf(level)) {
        expect(board.n).toBe(n)
        expect(board.givens).toHaveLength(n * n)
        for (const v of board.givens) {
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(n)
        }
        // Every sign stands between two squares that touch, and never off the board.
        for (const { hi, lo } of board.signs) {
          expect(Math.abs(hi - lo) === 1 || Math.abs(hi - lo) === n).toBe(true)
          if (Math.abs(hi - lo) === 1) expect(rowOf(n, hi)).toBe(rowOf(n, lo))
          for (const cell of [hi, lo]) {
            expect(cell).toBeGreaterThanOrEqual(0)
            expect(cell).toBeLessThan(n * n)
          }
        }
      }
    })

    it(`"${level.label}" prints exactly ${printed} posts on every board, so par cannot wobble`, () => {
      for (const board of boardsOf(level)) {
        expect(board.givens.filter((v) => v !== 0)).toHaveLength(printed)
      }
      expect(level.par).toBe(n * n - printed)
    })

    it(`"${level.label}" prints nothing that already breaks a rule`, () => {
      for (const board of boardsOf(level)) {
        for (const unit of unitsOf(n)) {
          const heights = unit.map((i) => board.givens[i]).filter((v) => v !== 0)
          expect(new Set(heights).size).toBe(heights.length)
        }
        for (const { hi, lo } of board.signs) {
          const a = board.givens[hi]
          const b = board.givens[lo]
          if (a !== 0 && b !== 0) expect(a).toBeGreaterThan(b)
        }
      }
    })

    it(`"${level.label}" has exactly one answer on every board`, () => {
      for (const board of boardsOf(level)) expect(countSolutions(board, 2)).toBe(1)
    })

    it(`"${level.label}" can be finished without ever guessing`, () => {
      for (const board of boardsOf(level)) {
        const reasoned = solveByLogic(board)
        expect(reasoned).not.toBeNull()
        expect((reasoned as { grid: number[] }).grid.every((v) => v !== 0)).toBe(true)
        // The reasoning and the independent walk agree on the answer itself.
        expect((reasoned as { grid: number[] }).grid).toEqual(solutions(board, 1)[0])
      }
    })

    /**
     * The gate. Cover the signs up, leave the printed posts, and count the ways
     * the Latin square can be finished: more than one, every time. A board that
     * came out at one here would be a board a child could finish without ever
     * reading a sign — and at eight printed posts on a four-wide board, 84% of
     * the boards that cleared everything else were exactly that. This is what
     * holds the printed posts down to four.
     */
    it(`"${level.label}" cannot be finished with the signs covered up`, () => {
      for (const board of boardsOf(level)) {
        expect(latinSolutions(board, 2)).toBeGreaterThanOrEqual(2)
        // And with the signs covered, the reasoning gets nowhere at all.
        expect(solveByLogic({ ...board, signs: [] })).toBeNull()
      }
    })

    it(`"${level.label}" leans on every sign it prints`, () => {
      for (const board of boardsOf(level)) {
        expect(board.signs.length).toBeGreaterThanOrEqual(2)
        for (const dropped of board.signs) {
          const lean = { ...board, signs: board.signs.filter((s) => s !== dropped) }
          expect(solveByLogic(lean), keyOf(board)).toBeNull()
        }
      }
    })

    /**
     * The move this puzzle exists for: *a is taller than b, and b is taller
     * than c, so a is taller than c*. Nothing else in the collection asks for
     * it, so no board here ships without somewhere to use it.
     */
    it(`"${level.label}" holds a chain of three on every board`, () => {
      for (const board of boardsOf(level)) expect(hasChainOfThree(board)).toBe(true)
    })

    it(`"${level.label}" holds no two boards that are the same puzzle in disguise`, () => {
      const keys = boardsOf(level).map((board) => canonicalKey(board))
      expect(new Set(keys).size).toBe(keys.length)
    })
  }

  it('is checked by a solver that agrees with a plain exhaustive count', () => {
    // `solutions` prunes as it walks. This is the stupidest possible counter,
    // so the two agreeing means the quicker one is not lying. Only the smallest
    // level: three to a side is 3^9 grids, four is already 4^16.
    const dumbCount = (board: TallBoard) => {
      const { n, givens, signs } = board
      const size = n * n
      const g = givens.slice()
      const legal = () =>
        unitsOf(n).every((unit) => {
          const seen = new Set<number>()
          for (const i of unit) {
            if (g[i] === 0) continue
            if (seen.has(g[i])) return false
            seen.add(g[i])
          }
          return true
        }) &&
        signs.every(({ hi, lo }) => g[hi] === 0 || g[lo] === 0 || g[hi] > g[lo])
      let found = 0
      const rec = (i: number): void => {
        if (i === size) {
          found++
          return
        }
        if (g[i] !== 0) return rec(i + 1)
        for (let v = 1; v <= n; v++) {
          g[i] = v
          if (legal()) rec(i + 1)
          g[i] = 0
        }
      }
      if (!legal()) return 0
      rec(0)
      return found
    }
    for (const board of boardsOf(levels[0])) expect(dumbCount(board)).toBe(1)
  })
})

/* ============================================================
   Reading a board off its picture
   ============================================================ */

describe('the picture a board is drawn as', () => {
  it('reads squares, printed posts and all four signs', () => {
    const board = parseBoard([
      '1>. .',
      '. ^ .',
      '.<. 3',
      'v . .',
      '. . .',
    ])
    expect(board.n).toBe(3)
    expect(board.givens).toEqual([1, 0, 0, 0, 0, 3, 0, 0, 0])
    // '>' says the square on its left is taller; '<' the one on its right.
    // '^' says the square below is taller; 'v' the one above.
    expect(sortSigns(board.signs)).toEqual([
      { hi: 0, lo: 1 },
      { hi: 3, lo: 6 },
      { hi: 4, lo: 3 },
      { hi: 4, lo: 1 },
    ].sort((a, b) => a.hi - b.hi || a.lo - b.lo))
  })

  it('throws rather than building half a board', () => {
    const bad: [string, string[]][] = [
      ['an even number of lines', ['. . .', '. . .']],
      ['a board under three squares to a side', ['. .', '. .', '. .']],
      ['a line of the wrong length', ['. . .', '. . .', '. . . .', '. . .', '. . .']],
      ['a height nobody could stand', ['4 . .', '. . .', '.>. .', '. . .', '. . .']],
      ['a mark that is not a sign', ['.=. .', '. . .', '.>. .', '. . .', '. . .']],
      ['a sign where a square goes', ['> . .', '. . .', '.>. .', '. . .', '. . .']],
      ['a left-right sign between two rows', ['. . .', '. > .', '.>. .', '. . .', '. . .']],
      ['a stray mark between two rows', ['. . .', '. . 1', '.>. .', '. . .', '. . .']],
      ['a board with no signs at all', ['1 . .', '. . .', '. . .', '. . .', '. . .']],
      ['a printed height that repeats in its row', ['2 2 .', '. . .', '.>. .', '. . .', '. . .']],
      ['a printed height that repeats in its column', ['2 . .', '. . .', '2 . .', '. . .', '.>. .']],
      ['two printed posts a sign points the wrong way at', ['1>2 .', '. . .', '. . .', '. . .', '. . .']],
    ]
    for (const [what, picture] of bad) {
      expect(() => parseBoard(picture), what).toThrow()
    }
  })

  it('reads every board in the bank without complaint', () => {
    for (const level of levels) {
      for (const picture of level.config.bank) {
        expect(() => parseBoard(picture)).not.toThrow()
        expect(picture).toHaveLength(2 * level.config.n - 1)
        // No line of a picture starts or ends with a space, so an editor that
        // trims trailing whitespace cannot quietly break a board.
        for (const line of picture) expect(line).toBe(line.trim())
      }
    }
  })
})

/* ============================================================
   The symmetry group

   Sixteen re-arrangements and no more: a Futoshiki's rows and
   columns cannot be shuffled the way a sudoku's can, because a
   sign stands between two squares that touch.
   ============================================================ */

describe('the sixteen ways round a board', () => {
  it('is exactly sixteen, all different', () => {
    const shapes = allShapes()
    expect(shapes).toHaveLength(16)
    expect(new Set(shapes.map((s) => `${s.turn}${s.flip}${s.invert}`)).size).toBe(16)
  })

  it('keeps every sign between two squares that still touch', () => {
    for (const level of levels) {
      const { n } = level.config
      for (const board of boardsOf(level)) {
        for (const shape of allShapes()) {
          const moved = applyShape(board, shape)
          expect(moved.signs).toHaveLength(board.signs.length)
          for (const { hi, lo } of moved.signs) {
            const apart = Math.abs(hi - lo)
            expect(apart === 1 || apart === n).toBe(true)
            if (apart === 1) expect(rowOf(n, hi)).toBe(rowOf(n, lo))
          }
        }
      }
    }
  })

  it('keeps the printed posts printed, and the same number of them', () => {
    for (const level of levels) {
      for (const board of boardsOf(level)) {
        for (const shape of allShapes()) {
          const moved = applyShape(board, shape)
          expect(moved.givens.filter((v) => v !== 0)).toHaveLength(level.config.printed)
          for (const v of moved.givens) expect(v).toBeLessThanOrEqual(level.config.n)
        }
      }
    }
  })

  /**
   * The three claims the bank was searched against, re-derived for every one of
   * the sixteen. `init` deals through one of them, so a shape that broke any of
   * the three would hand a child a board nothing here had ever checked.
   */
  it('keeps the one answer single, the reasoning reachable and the gate shut', () => {
    for (const level of levels) {
      for (const board of boardsOf(level)) {
        for (const shape of allShapes()) {
          const moved = applyShape(board, shape)
          expect(countSolutions(moved, 2)).toBe(1)
          expect(solveByLogic(moved)).not.toBeNull()
          expect(latinSolutions(moved, 2)).toBeGreaterThanOrEqual(2)
          expect(hasChainOfThree(moved)).toBe(true)
        }
      }
    }
  })

  it('turns a board back into itself when it is turned all the way round', () => {
    for (const board of boardsOf(levels[1])) {
      let moved = board
      for (let k = 0; k < 4; k++) moved = applyShape(moved, { turn: 1, flip: false, invert: false })
      expect(keyOf(moved)).toBe(keyOf({ ...board, signs: sortSigns(board.signs) }))
      const swapped = applyShape(applyShape(board, { turn: 0, flip: false, invert: true }), {
        turn: 0,
        flip: false,
        invert: true,
      })
      expect(keyOf(swapped)).toBe(keyOf({ ...board, signs: sortSigns(board.signs) }))
    }
  })

  it('sees through a disguise, and only a disguise', () => {
    const board = boardsOf(levels[0])[0]
    for (const shape of allShapes()) {
      expect(canonicalKey(applyShape(board, shape))).toBe(canonicalKey(board))
    }
    for (const other of boardsOf(levels[0]).slice(1)) {
      expect(canonicalKey(other)).not.toBe(canonicalKey(board))
    }
  })
})

/* ============================================================
   init
   ============================================================ */

describe('init', () => {
  for (const level of levels) {
    it(`"${level.label}" deals a one-answer, guess-free board for 40 different seeds`, () => {
      const { n } = level.config
      const known = new Set(boardsOf(level).map((board) => canonicalKey(board)))
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.n).toBe(n)
        expect(state.givens).toHaveLength(n * n)
        expect(state.entries).toHaveLength(n * n)
        expect(state.entries.every((v) => v === 0)).toBe(true)
        expect(blankCount(state)).toBe(level.par)
        expect(countSolutions(state, 2)).toBe(1)
        expect(solveByLogic(state)).not.toBeNull()
        // The dealt board is one of the hand-checked bank boards, only turned round.
        expect(known.has(canonicalKey(state))).toBe(true)
      }
    })

    /**
     * The gate again, this time on what a player is actually handed. Every seed
     * of every level: cover the signs and the board has more than one ending.
     */
    it(`"${level.label}" deals a board that cannot be finished with the signs covered up`, () => {
      for (const seed of SEEDS) {
        expect(latinSolutions(start(level, seed), 2)).toBeGreaterThanOrEqual(2)
      }
    })

    it(`"${level.label}" deals a start that is neither solved nor nearly solved`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(isSolved(state)).toBe(false)
        expect(conflicts(state).some(Boolean)).toBe(false)
        expect(blankCount(state)).toBeGreaterThanOrEqual(9)
        for (const action of legalMoves(state)) expect(isSolved(reduce(state, action))).toBe(false)
      }
    })

    it(`"${level.label}" actually varies with the seed`, () => {
      const seen = new Set(SEEDS.map((seed) => keyOf(start(level, seed))))
      expect(seen.size).toBeGreaterThan(20)
    })

    it(`"${level.label}" is deterministic for one seed`, () => {
      expect(keyOf(start(level, 4242))).toBe(keyOf(start(level, 4242)))
    })
  }

  it('never writes into the bank it is dealing from', () => {
    const before = levels.map((l) => JSON.stringify(l.config.bank))
    for (const level of levels) for (const seed of SEEDS) init(level, makeRng(seed))
    expect(levels.map((l) => JSON.stringify(l.config.bank))).toEqual(before)
  })
})

/* ============================================================
   reduce
   ============================================================ */

describe('reduce', () => {
  for (const level of levels) {
    it(`"${level.label}" returns the identical state for every action that changes nothing`, () => {
      const state = start(level, 99)
      const printed = state.givens.findIndex((v) => v !== 0)
      const blank = state.givens.indexOf(0)
      const last = state.n * state.n - 1

      const noOps: [string, TallAction][] = [
        ['another action type', { type: 'nudge' } as unknown as TallAction],
        ['taking a square that is already empty', { type: 'set', index: blank, value: 0 }],
        ['an index before the board', { type: 'set', index: -1, value: 1 }],
        ['an index past the board', { type: 'set', index: last + 1, value: 1 }],
        ['a fractional index', { type: 'set', index: 1.5, value: 1 }],
        ['an index that is NaN', { type: 'set', index: NaN, value: 1 }],
        ['an index that is Infinity', { type: 'set', index: Infinity, value: 1 }],
        ['a missing index', { type: 'set', index: undefined as unknown as number, value: 1 }],
        ['a null index', { type: 'set', index: null as unknown as number, value: 1 }],
        ['a height above the tallest post', { type: 'set', index: blank, value: state.n + 1 }],
        ['a negative height', { type: 'set', index: blank, value: -1 }],
        ['a fractional height', { type: 'set', index: blank, value: 1.5 }],
        ['a height that is NaN', { type: 'set', index: blank, value: NaN }],
        ['a height that is Infinity', { type: 'set', index: blank, value: Infinity }],
        ['a missing height', { type: 'set', index: blank, value: undefined as unknown as number }],
        ['a null height', { type: 'set', index: blank, value: null as unknown as number }],
      ]
      if (printed >= 0) {
        noOps.push(
          ['standing a post on a printed one', { type: 'set', index: printed, value: 1 }],
          ['taking a printed post away', { type: 'set', index: printed, value: 0 }],
        )
      }
      for (const [what, action] of noOps) {
        // toBe, not toEqual: a fresh but equal object would pollute the move tape.
        expect(reduce(state, action), what).toBe(state)
      }

      const stood = reduce(state, { type: 'set', index: blank, value: 2 })
      expect(stood).not.toBe(state)
      expect(reduce(stood, { type: 'set', index: blank, value: 2 }), 'standing the same post').toBe(
        stood,
      )
    })

    it(`"${level.label}" leaves the state it was handed exactly as it found it`, () => {
      const state = start(level, 12)
      const givensBefore = state.givens.slice()
      const entriesBefore = state.entries.slice()
      const blank = state.givens.indexOf(0)
      const next = reduce(state, { type: 'set', index: blank, value: 3 })
      expect(state.givens).toEqual(givensBefore)
      expect(state.entries).toEqual(entriesBefore)
      // A fresh entries array, so the previous state in the move tape is safe.
      expect(next.entries).not.toBe(state.entries)
      expect(next.givens).toBe(state.givens)
      expect(next.signs).toBe(state.signs)
      expect(next.entries[blank]).toBe(3)
      expect(next.entries.filter((v) => v !== 0)).toHaveLength(1)
      expect(reduce(next, { type: 'set', index: blank, value: 0 }).entries[blank]).toBe(0)
    })

    it(`"${level.label}" changes exactly one square, and never a printed post`, () => {
      // The whole lower bound on par rests on this, so check it over every
      // action from every state on a real wander, not just from the start.
      for (const state of walk(start(level, 5), 5, 24)) {
        for (const action of legalMoves(state)) {
          const next = reduce(state, action)
          expect(next).not.toBe(state)
          expect(next.givens).toBe(state.givens)
          const moved = next.entries
            .map((v, i) => (v === state.entries[i] ? -1 : i))
            .filter((i) => i >= 0)
          expect(moved).toEqual([action.index])
          expect(state.givens[action.index]).toBe(0)
          expect(filledCount(next) - filledCount(state)).toBeLessThanOrEqual(1)
        }
      }
    })

    it(`"${level.label}" has legalMoves that are exactly the actions that change something`, () => {
      // If legalMoves hid a move, every par proved by search would be wrong.
      for (const state of walk(start(level, 17), 17, 10)) {
        const listed = new Set(legalMoves(state).map((a) => `${a.index}:${a.value}`))
        for (let index = 0; index < state.n * state.n; index++) {
          for (let value = 0; value <= state.n; value++) {
            const changes = reduce(state, { type: 'set', index, value }) !== state
            expect(listed.has(`${index}:${value}`), `${index}:${value}`).toBe(changes)
          }
        }
      }
    })
  }
})

/* ============================================================
   par

   The counting argument, and where it is used instead of a
   search.

   `isSolved` needs a post in every square. A start has exactly
   `par` empty squares. One dispatched action fills at most one
   of them — the reduce test above proves that over every action
   from every position on a real wander. So no play can finish in
   fewer than `par` moves, and the scripted play below finishes in
   exactly `par`. That is a proof rather than a sample, and it
   holds for every board in the bank and every one of the sixteen
   ways `init` may turn it.

   The search is used where it fits and nowhere else. "Three
   heights" holds about 7,800 conflict-free positions, which
   breadth-first search walks in under a second, so its par is
   settled twice over. "Four heights" holds between 57,000 and
   90,000 — inside `search.ts`'s cap, but four seconds a board,
   and the number is a property of the board rather than of the
   level. "Five heights" runs past the 200,000 cap and
   `shortestSolution` throws: Futoshiki drops the box rule, so a
   sign prunes nothing at all until both of its squares are
   filled. Levels two and three rest on the counting argument.
   ============================================================ */

describe('par', () => {
  for (const level of levels) {
    it(`"${level.label}" cannot be finished in fewer than par (${level.par}) moves`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        expect(blankCount(first)).toBe(level.par)
        expect(isSolved(first)).toBe(false)
        expect(filledCount(first)).toBe(level.config.printed)
        // A board one square short of full is never solved, so the last of the
        // par moves is doing real work rather than tidying up.
        let state: TallState = first
        const actions = solutionActions(first)
        for (const action of actions.slice(0, -1)) state = reduce(state, action)
        expect(blankCount(state)).toBe(1)
        expect(isSolved(state)).toBe(false)
      }
    })

    it(`"${level.label}" is finished in exactly par (${level.par}) moves, and not before`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        let state: TallState = first
        for (const action of actions) {
          expect(isSolved(state)).toBe(false)
          const next = reduce(state, action)
          expect(next).not.toBe(state)
          state = next
        }
        expect(isSolved(state)).toBe(true)
        expect(conflicts(state).some(Boolean)).toBe(false)
      }
    })
  }

  // The three-wide board is small enough to walk the whole graph and settle it.
  it(`"${levels[0].label}" has no shorter path than par under breadth-first search`, () => {
    for (const seed of [5, 61]) {
      const path = shortestSolution<TallState, TallAction>({
        start: start(levels[0], seed),
        moves: legalMoves,
        apply: reduce,
        key: (s) => s.entries.join(','),
        solved: isSolved,
        // A post that breaks a rule is never on a shortest path: it has to be
        // taken out again, which costs two more moves than not standing it up.
        invalid: (s) => conflicts(s).some(Boolean),
        maxStates: 100_000,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[0].par as number)
    }
  })
})

/* ============================================================
   The rules, and what the board is allowed to say about them
   ============================================================ */

describe('isSolved and conflicts', () => {
  it('will not call a full board solved when a height repeats', () => {
    const first = start(levels[0], 21)
    let state: TallState = first
    for (const action of solutionActions(first)) state = reduce(state, action)
    expect(isSolved(state)).toBe(true)

    const blank = state.givens.indexOf(0)
    const wrong = (state.entries[blank] % state.n) + 1
    const broken = reduce(state, { type: 'set', index: blank, value: wrong })
    expect(valuesOf(broken).every((v) => v !== 0)).toBe(true)
    expect(isSolved(broken)).toBe(false)
    expect(conflicts(broken)[blank]).toBe(true)
  })

  it('will not call a full board solved when a sign points the wrong way', () => {
    // A finished board with every row and every column right, and one sign it
    // still points the wrong way at. The Latin square is not the whole rule.
    const board = parseBoard([
      '. . .',
      '. . .',
      '.>. .',
      '. . .',
      '. . .',
    ])
    const { hi, lo } = board.signs[0]
    const squares = solutions({ ...board, signs: [] }, 20)
    expect(squares).toHaveLength(12)
    const wrong = squares.find((grid) => grid[hi] < grid[lo]) as number[]
    expect(wrong).toBeDefined()
    const state: TallState = { ...board, entries: wrong }
    for (const unit of unitsOf(3)) {
      expect(new Set(unit.map((i) => wrong[i])).size).toBe(3)
    }
    expect(isSolved(state)).toBe(false)
    expect(conflicts(state)[hi]).toBe(true)
    expect(conflicts(state)[lo]).toBe(true)
    // The same board with the sign the right way round is finished.
    const right = squares.find((grid) => grid[hi] > grid[lo]) as number[]
    expect(isSolved({ ...board, entries: right })).toBe(true)
  })

  it('will not call a board solved while one square is still empty', () => {
    const first = start(levels[0], 21)
    const actions = solutionActions(first)
    let state: TallState = first
    for (const action of actions.slice(0, -1)) state = reduce(state, action)
    expect(blankCount(state)).toBe(1)
    expect(conflicts(state).some(Boolean)).toBe(false)
    expect(isSolved(state)).toBe(false)
  })

  it('marks the post that repeats, never the printed one it repeats', () => {
    const state = start(levels[1], 33)
    let blank = -1
    let printed = -1
    for (const unit of unitsOf(state.n)) {
      const empty = unit.find((i) => state.givens[i] === 0)
      const standing = unit.find((i) => state.givens[i] !== 0)
      if (empty !== undefined && standing !== undefined) {
        blank = empty
        printed = standing
        break
      }
    }
    expect(blank).toBeGreaterThanOrEqual(0)
    const next = reduce(state, { type: 'set', index: blank, value: state.givens[printed] })
    const flagged = conflicts(next)
    expect(flagged[blank]).toBe(true)
    expect(flagged[printed]).toBe(false)
    expect(isSolved(next)).toBe(false)
  })

  it('is quiet on an untouched board', () => {
    for (const level of levels) {
      for (const seed of [8, 44]) expect(conflicts(start(level, seed)).some(Boolean)).toBe(false)
    }
  })

  /**
   * The one thing this board must never do.
   *
   * Everything a child works out at a Futoshiki is about a square whose
   * neighbour is still empty: the post at the pointed end of a sign cannot be
   * the tallest, the post two signs along cannot be the tallest or the one
   * below it, and so on. If red appeared the moment one of those was broken,
   * the board would be handing back the eliminations rather than drawing them,
   * and tapping every height in turn would read the answer straight off.
   *
   * So: a sign with an empty square at its other end never accuses anybody,
   * whatever is standing at this end. The three checks below hold that from
   * three directions — by construction, over a wander, and on the one move that
   * makes a board unsolvable without breaking a single rule.
   */
  it('never marks a post against a square that is still empty', () => {
    for (const level of levels) {
      for (const state of walk(start(level, 3), 3, 30)) {
        const values = valuesOf(state)
        const ends = signEndsOf(state)
        const peers = peersOf(state.n)
        const flagged = conflicts(state)
        for (let i = 0; i < flagged.length; i++) {
          if (!flagged[i]) continue
          // Whatever red says, it is about two posts both already on the board.
          const repeats = peers[i].some((p) => values[p] === values[i])
          const broken = ends[i].some(({ other, taller }) => {
            const w = values[other]
            return w !== 0 && (taller ? values[i] < w : values[i] > w)
          })
          expect(repeats || broken, `square ${i}`).toBe(true)
        }
      }
    }
  })

  it('says nothing when the shortest post stands where only the tallest fits', () => {
    // Row 2 of this board is a chain of three, so its open end has to be three
    // high. Standing a 1 there makes the board unfinishable — and the board
    // must not say so, because the square the argument leans on is empty.
    const board = parseBoard([
      '. . .',
      '. . .',
      '.>.>.',
      '. . .',
      '. . .',
    ])
    const state = untouched(board)
    expect(hasChainOfThree(board)).toBe(true)
    expect(clashOf(state, 3, 1)).toBeNull()
    const next = reduce(state, { type: 'set', index: 3, value: 1 })
    expect(next).not.toBe(state)
    expect(conflicts(next).some(Boolean)).toBe(false)
    // And it really was a move nothing can recover from.
    expect(countSolutions({ ...next, givens: valuesOf(next) }, 1)).toBe(0)
  })
})

describe('the clash a post makes', () => {
  /** Hand-built, so the test says which rule breaks rather than hunting for one. */
  const board = parseBoard([
    '. . .',
    '. . .',
    '.>. .',
    '. . .',
    '. . .',
  ])
  /** A post three high printed in the top-left corner, and nothing else. */
  const corner: TallState = {
    ...board,
    givens: [3, 0, 0, 0, 0, 0, 0, 0, 0],
    entries: new Array<number>(9).fill(0),
  }

  it('says nothing when the square takes the post cleanly', () => {
    expect(clashOf(corner, 5, 3)).toBeNull()
    // Taking a post out breaks nothing, and a printed post is not yours to move.
    expect(clashOf(corner, 1, 0)).toBeNull()
    expect(clashOf(corner, 0, 2)).toBeNull()
  })

  it('names the row, and holds the whole of it', () => {
    expect(clashOf(corner, 1, 3)).toEqual({
      kind: 'row',
      ordinal: 1,
      cells: [0, 1, 2],
      blamed: [0, 1],
      value: 3,
    })
  })

  it('falls to the column when the row is clean', () => {
    expect(clashOf(corner, 3, 3)).toMatchObject({
      kind: 'column',
      ordinal: 1,
      cells: [0, 3, 6],
      blamed: [0, 3],
    })
  })

  it('falls to the sign when the row and the column are both clean', () => {
    // Row 2 reads "taller than" from square 3 to square 4. Stand a 1 in square
    // 3 and a 2 in square 4 and the sign is the only thing that breaks.
    const standing = reduce(corner, { type: 'set', index: 3, value: 1 })
    expect(clashOf(standing, 4, 2)).toEqual({
      kind: 'sign',
      cells: [4, 3],
      blamed: [4, 3],
      value: 2,
      taller: false,
    })
    // And from the other end of the same sign.
    const other = reduce(corner, { type: 'set', index: 4, value: 2 })
    expect(clashOf(other, 3, 1)).toMatchObject({ kind: 'sign', cells: [3, 4], taller: true })
  })

  it('says nothing about a sign whose other end is empty', () => {
    const bare = untouched(board)
    for (let v = 1; v <= 3; v++) {
      expect(clashOf(bare, 3, v), `${v} at the taller end`).toBeNull()
      expect(clashOf(bare, 4, v), `${v} at the shorter end`).toBeNull()
    }
  })

  it('blames every square in a line holding the height, not only the first two', () => {
    const twice = reduce(corner, { type: 'set', index: 2, value: 3 })
    expect(clashOf(twice, 1, 3)?.blamed).toEqual([0, 1, 2])
  })

  it('fires exactly when the move would turn the square red', () => {
    for (const level of levels) {
      for (const state of walk(start(level, 12), 5, 8)) {
        for (const move of legalMoves(state)) {
          const clash = clashOf(state, move.index, move.value)
          expect(clash !== null).toBe(conflicts(reduce(state, move))[move.index])
          if (clash === null) continue
          expect(clash.cells).toContain(move.index)
          expect(clash.blamed).toContain(move.index)
          expect(clash.blamed.length).toBeGreaterThan(1)
          for (const i of clash.blamed) expect(clash.cells).toContain(i)
          if (clash.kind === 'sign') expect(clash.cells).toHaveLength(2)
          else expect(clash.cells).toHaveLength(state.n)
        }
      }
    }
  })

  it('puts the broken rule in one sentence', () => {
    expect(describeClash(corner, clashOf(corner, 1, 3) as Clash)).toBe(
      'A post 3 high is already in row 1.',
    )
    expect(describeClash(corner, clashOf(corner, 3, 3) as Clash)).toBe(
      'A post 3 high is already in column 1.',
    )
    const standing = reduce(corner, { type: 'set', index: 3, value: 1 })
    expect(describeClash(standing, clashOf(standing, 4, 2) as Clash)).toBe(
      'The sign says this post is shorter than the one to its left.',
    )
    const other = reduce(corner, { type: 'set', index: 4, value: 2 })
    expect(describeClash(other, clashOf(other, 3, 1) as Clash)).toBe(
      'The sign says this post is taller than the one to its right.',
    )
  })

  it('reports the rule the board is standing on, once it is standing on one', () => {
    expect(standingClash(corner)).toBeNull()
    const broken = reduce(corner, { type: 'set', index: 1, value: 3 })
    expect(standingClash(broken)).toMatchObject({ kind: 'row', blamed: [0, 1] })
    expect(describeClash(broken, standingClash(broken) as Clash)).toBe(
      'A post 3 high is already in row 1.',
    )
  })

  it('names every direction a sign can point in', () => {
    expect(whereFrom(3, 4, 1)).toBe('above it')
    expect(whereFrom(3, 4, 7)).toBe('below it')
    expect(whereFrom(3, 4, 3)).toBe('to its left')
    expect(whereFrom(3, 4, 5)).toBe('to its right')
  })
})

describe('describe', () => {
  it('names the post and the square, in the past tense', () => {
    const state = start(levels[0], 3)
    const blank = state.givens.indexOf(0)
    const next = reduce(state, { type: 'set', index: blank, value: 3 })
    const row = rowOf(state.n, blank) + 1
    const col = colOf(state.n, blank) + 1
    expect(describeMove(state, next, { type: 'set', index: blank, value: 3 })).toBe(
      `Put a post 3 high in row ${row}, column ${col}`,
    )
    expect(describeMove(next, state, { type: 'set', index: blank, value: 0 })).toBe(
      `Took the post out of row ${row}, column ${col}`,
    )
  })

  it('names the square the move actually changed, for every square', () => {
    for (const level of levels) {
      const state = start(level, 44)
      for (const action of legalMoves(state)) {
        const next = reduce(state, action)
        const changed = next.entries.findIndex((v, i) => v !== state.entries[i])
        const line = describeMove(state, next, action)
        expect(line).toContain(
          `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
        )
      }
    }
  })

  it('says what is standing in a square in the same words everywhere', () => {
    expect(postName(0)).toBe('empty')
    expect(postName(1)).toBe('a post 1 high')
    expect(postName(5)).toBe('a post 5 high')
  })
})

/* ============================================================
   The board
   ============================================================ */

describe('the board', () => {
  const setup = (level: PuzzleLevel<TallConfig>, seed: number, locked = false) => {
    const state = start(level, seed)
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }))
    return { state, dispatch, view }
  }

  const tileAt = (state: TallState, index: number) =>
    document.querySelector(
      `[aria-label^="Row ${rowOf(state.n, index) + 1}, column ${colOf(state.n, index) + 1},"]`,
    ) as HTMLButtonElement

  /** The board with a real state behind it, so a cue can be watched from the tap that fires it. */
  const Play = ({ from }: { from: TallState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: TallAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  /** The first row holding both an empty square and a printed post: one tap breaks that row. */
  const rowClash = (state: TallState) => {
    for (let r = 0; r < state.n; r++) {
      const cells = unitsOf(state.n)[r]
      const blank = cells.find((i) => state.givens[i] === 0)
      const printed = cells.find((i) => state.givens[i] !== 0)
      if (blank !== undefined && printed !== undefined) {
        const value = state.givens[printed]
        return {
          row: r + 1,
          blank,
          printed,
          value,
          key: `Put a post ${value} high in the square`,
          said: `A post ${value} high is already in row ${r + 1}.`,
        }
      }
    }
    throw new Error('no row holds both an empty square and a printed post')
  }

  it('draws a pressable square for every empty one and a printed one for every post', () => {
    const { state } = setup(levels[2], 2)
    const printed = state.givens.filter((v) => v !== 0).length
    expect(screen.getAllByRole('img')).toHaveLength(printed)
    const tiles = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-label')?.startsWith('Row '))
    expect(tiles).toHaveLength(state.n * state.n - printed)
    for (const tile of tiles) expect(tile.className).toContain('u-press')
  })

  it('draws one sign for every sign, pointing at the shorter square', () => {
    const { state } = setup(levels[2], 2)
    const marks = [...document.querySelectorAll('[data-points]')]
    expect(marks).toHaveLength(state.signs.length)
    const drawn = new Set(marks.map((el) => el.getAttribute('data-points')))
    for (const word of drawn) expect(['up', 'down', 'left', 'right']).toContain(word)

    // Which way each one points, worked out again from the board's own rule.
    const expected = state.signs.map(({ hi, lo }: Sign) =>
      Math.abs(hi - lo) === state.n ? (hi < lo ? 'down' : 'up') : hi < lo ? 'right' : 'left',
    )
    expect(marks.map((el) => el.getAttribute('data-points')).sort()).toEqual(expected.sort())
  })

  it('reads every sign out in the label of the squares it stands between', () => {
    const { state } = setup(levels[2], 2)
    for (const { hi, lo } of state.signs) {
      expect(tileAt(state, hi).getAttribute('aria-label')).toContain(
        `Taller than the square ${whereFrom(state.n, hi, lo)}`,
      )
      expect(tileAt(state, lo).getAttribute('aria-label')).toContain(
        `Shorter than the square ${whereFrom(state.n, lo, hi)}`,
      )
    }
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = setup(levels[0], 2)
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|move|solved|par/i)
  })

  it('gives a printed post no button and no press shadow', () => {
    setup(levels[2], 2)
    for (const printed of screen.getAllByRole('img')) {
      expect(printed.tagName).not.toBe('BUTTON')
      expect(printed.className).not.toContain('u-press')
      expect(printed.getAttribute('aria-label')).toMatch(/, printed\./)
    }
  })

  it('sends exactly one action when you tap a square and then a post', () => {
    const { state, dispatch } = setup(levels[0], 2)
    const blank = state.givens.indexOf(0)

    // Before a square is chosen the keypad is dead.
    expect(screen.getByRole('button', { name: 'Put a post 1 high in the square' })).toBeDisabled()

    fireEvent.click(tileAt(state, blank))
    const key = screen.getByRole('button', { name: 'Put a post 2 high in the square' })
    expect(key).toBeEnabled()
    fireEvent.click(key)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value: 2 })
  })

  it('offers one key a height, and no more', () => {
    for (const level of levels) {
      const { state } = setup(level, 2)
      const keys = screen.getAllByRole('button', { name: /^Put a post \d high in the square$/ })
      expect(keys).toHaveLength(state.n)
      cleanup()
    }
  })

  it('will not offer to take a post out of a square that is already empty', () => {
    const { state } = setup(levels[0], 2)
    fireEvent.click(tileAt(state, state.givens.indexOf(0)))
    expect(screen.getByRole('button', { name: 'Take the post out of the square' })).toBeDisabled()
  })

  it('stands posts up and takes them out from the keyboard', () => {
    const level = levels[2]
    const first = start(level, 2)
    const blank = first.givens.indexOf(0)
    const answer = solutions(first, 1)[0]
    const value = answer[blank]
    const other = value === 5 ? 4 : 5
    const filled = reduce(first, { type: 'set', index: blank, value })
    const dispatch = vi.fn()
    render(createElement(Board, { state: filled, dispatch, locked: false }))

    const cell = tileAt(filled, blank)
    fireEvent.click(cell)

    fireEvent.keyDown(cell, { key: String(other) })
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set', index: blank, value: other })

    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set', index: blank, value: 0 })

    // 6 is not a height on a five-wide board, and neither is a letter.
    dispatch.mockClear()
    fireEvent.keyDown(cell, { key: '6' })
    fireEvent.keyDown(cell, { key: 'q' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('walks the arrow keys from square to square, never onto a printed post', () => {
    const { state } = setup(levels[2], 2)
    const blank = state.givens.indexOf(0)
    const cell = tileAt(state, blank)
    fireEvent.click(cell)
    expect(cell).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    const moved = document.activeElement as HTMLElement
    expect(moved).not.toBe(cell)
    expect(moved.tagName).toBe('BUTTON')
    expect(moved.getAttribute('aria-label')).toMatch(/^Row /)
    expect(moved.getAttribute('aria-label')).not.toMatch(/printed/)
    expect(moved).toHaveAttribute('aria-pressed', 'true')
    // Exactly one tab stop, and it followed the focus.
    const stops = [...document.querySelectorAll('[aria-label^="Row "]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toEqual([moved])
  })

  it('lets Escape put the post down again', () => {
    const { state } = setup(levels[0], 2)
    const cell = tileAt(state, 0)
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'Escape' })
    expect(cell).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Put a post 1 high in the square' })).toBeDisabled()
  })

  it('keeps the square chosen while the keyboard is still on it, and lets go otherwise', () => {
    const state = start(levels[0], 2)
    const blank = state.givens.indexOf(0)
    const dispatch = vi.fn()
    const { rerender } = render(createElement(Board, { state, dispatch, locked: false }))
    fireEvent.click(tileAt(state, blank))
    expect(tileAt(state, blank)).toHaveAttribute('aria-pressed', 'true')

    // A keyboard answer leaves the focus where it was, so the ring stays and
    // the very next keystroke goes to the square the player is looking at.
    const next = reduce(state, { type: 'set', index: blank, value: 1 })
    rerender(createElement(Board, { state: next, dispatch, locked: false }))
    const after = tileAt(next, blank)
    expect(document.activeElement).toBe(after)
    expect(after).toHaveAttribute('aria-pressed', 'true')
    dispatch.mockClear()
    fireEvent.keyDown(after, { key: '2' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value: 2 })

    // Focus somewhere else — the shell's undo button, a tap on the keypad — and
    // the choice is gone, which is what makes rewinding safe.
    after.blur()
    const back = reduce(next, { type: 'set', index: blank, value: 0 })
    rerender(createElement(Board, { state: back, dispatch, locked: false }))
    expect(tileAt(back, blank)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Put a post 1 high in the square' })).toBeDisabled()
  })

  it('says so, in words and out loud, when a height repeats', () => {
    const state = start(levels[1], 33)
    const { blank, printed, value } = rowClash(state)
    const broken = reduce(state, { type: 'set', index: blank, value })
    render(createElement(Board, { state: broken, dispatch: vi.fn(), locked: false }))
    expect(tileAt(broken, blank).getAttribute('aria-label')).toMatch(/, breaking a rule\./)
    expect(tileAt(broken, blank)).toHaveAttribute('data-conflict', 'true')
    expect(screen.getByRole('status').textContent).toMatch(/is already in row/)
    // The printed post beside it is not blamed, and is still not a button.
    const post = tileAt(broken, printed)
    expect(post.tagName).toBe('DIV')
    expect(post.getAttribute('data-conflict')).toBeNull()
    expect(post.getAttribute('aria-label')).toMatch(/, printed\./)
  })

  it('lights the whole row and shakes the two posts at fault', () => {
    const state = start(levels[1], 33)
    const { row, blank, printed, key } = rowClash(state)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(screen.getByRole('button', { name: key }))

    // The whole row, and not one square outside it.
    const lit = wearing(cues.highlight)
    expect(lit).toHaveLength(state.n)
    for (const square of lit) {
      expect(square.getAttribute('aria-label')).toMatch(new RegExp(`^Row ${row}, `))
    }

    // And inside it, the two squares holding the height: the post just stood
    // up, and the printed one it repeats.
    const shaking = wearing(cues.shake).map((mark) => mark.closest('[aria-label]'))
    expect(shaking).toHaveLength(2)
    expect(shaking).toContain(tileAt(state, blank))
    expect(shaking).toContain(tileAt(state, printed))
  })

  it('lights only the two squares a sign stands between', () => {
    const board = parseBoard([
      '. . .',
      '. . .',
      '.>. .',
      '. . .',
      '. . .',
    ])
    const first: TallState = { ...untouched(board), entries: [0, 0, 0, 1, 0, 0, 0, 0, 0] }
    render(createElement(Play, { from: first }))
    fireEvent.click(tileAt(first, 4))
    fireEvent.click(screen.getByRole('button', { name: 'Put a post 2 high in the square' }))

    const lit = wearing(cues.highlight)
    expect(lit).toHaveLength(2)
    expect(lit).toContain(tileAt(first, 3))
    expect(lit).toContain(tileAt(first, 4))
    expect(screen.getByRole('status')).toHaveTextContent(
      'The sign says this post is shorter than the one to its left.',
    )
  })

  it('names the mistake out loud, and in the line under the board', () => {
    const state = start(levels[1], 33)
    const { blank, key, said } = rowClash(state)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(screen.getByRole('button', { name: key }))

    expect(screen.getByRole('status')).toHaveTextContent(said)
    // Both lines say it: the one a child reads and the one a screen reader speaks.
    expect(screen.getAllByText(said)).toHaveLength(2)

    // Take the post out again and there is nothing left to say.
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(screen.getByRole('button', { name: 'Take the post out of the square' }))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('lights nothing when the post fits', () => {
    const state = start(levels[1], 33)
    const answer = solutions(state, 1)[0]
    const blank = state.givens.indexOf(0)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(
      screen.getByRole('button', { name: `Put a post ${answer[blank]} high in the square` }),
    )
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  /**
   * The free-oracle check again, this time on the board itself: the shortest
   * post standing where a sign says the tallest belongs lights nothing, says
   * nothing and rings nothing, because the square at the other end of that sign
   * is still empty.
   */
  it('lights nothing when a post can only be wrong by an argument', () => {
    const board = parseBoard([
      '. . .',
      '. . .',
      '.>.>.',
      '. . .',
      '. . .',
    ])
    const first = untouched(board)
    render(createElement(Play, { from: first }))
    fireEvent.click(tileAt(first, 3))
    fireEvent.click(screen.getByRole('button', { name: 'Put a post 1 high in the square' }))
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(tileAt(first, 3).getAttribute('data-conflict')).toBeNull()
  })

  it('takes the light off again, and leaves the sentence and the red ring standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const state = start(levels[1], 33)
      const { blank, key, said } = rowClash(state)
      render(createElement(Play, { from: state }))
      fireEvent.click(tileAt(state, blank))
      fireEvent.click(screen.getByRole('button', { name: key }))
      expect(wearing(cues.highlight)).toHaveLength(state.n)

      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(wearing(cues.shake)).toHaveLength(0)
      // The louder layer has gone; the marking underneath it has not.
      expect(tileAt(state, blank)).toHaveAttribute('data-conflict', 'true')
      expect(screen.getByRole('status')).toHaveTextContent(said)
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('still says what is wrong on a position it was handed rather than played into', () => {
    // A rewind lands on a red square with no tap behind it, so the sentence
    // comes from the board's own rules rather than from the move that made it.
    const state = start(levels[1], 33)
    const { blank, value, said } = rowClash(state)
    const broken = reduce(state, { type: 'set', index: blank, value })
    render(createElement(Board, { state: broken, dispatch: vi.fn(), locked: false }))
    expect(screen.getByRole('status')).toHaveTextContent(said)
  })

  it('stays quiet when nothing is wrong', () => {
    setup(levels[0], 2)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('ignores every input while it is locked', () => {
    const { state, dispatch } = setup(levels[0], 2, true)
    const cell = tileAt(state, 0)
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    for (const key of ['1', '3', '0', 'Backspace', 'Delete', 'ArrowRight', 'Escape']) {
      fireEvent.keyDown(cell, { key })
    }
    for (const key of screen.getAllByRole('button')) expect(key).toBeDisabled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('draws a solved board without a word of celebration', () => {
    const first = start(levels[0], 21)
    let state: TallState = first
    for (const action of solutionActions(first)) state = reduce(state, action)
    render(createElement(Board, { state, dispatch: vi.fn(), locked: true }))
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

/* ============================================================
   The meta
   ============================================================ */

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(tallAndShort.id).toBe('tall-and-short')
    expect(tallAndShort.reseedable).toBe(true)
    // A post in the wrong place is not a dead end here — it is taken out again,
    // not stepped back from — so there is deliberately no failure().
    expect(tallAndShort.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(tallAndShort.instructions.length).toBeGreaterThanOrEqual(2)
    expect(tallAndShort.instructions.length).toBeLessThanOrEqual(4)
    for (const line of tallAndShort.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(120)
    }
  })

  it('ramps in size, in printed posts and in the work it takes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([3, 4, 5])
    expect(levels.map((l) => l.par)).toEqual([9, 12, 21])
    const rounds = levels.map((level) =>
      Math.min(...boardsOf(level).map((board) => (solveByLogic(board) as { rounds: number }).rounds)),
    )
    expect(rounds[0]).toBeLessThanOrEqual(rounds[1])
    expect(rounds[1]).toBeLessThanOrEqual(rounds[2])
  })

  it('never names a square that would give the answer away', () => {
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('has a colour of its own for every height it can draw', () => {
    expect(POST_COLOURS).toHaveLength(5)
    expect(new Set(POST_COLOURS).size).toBe(5)
    for (const level of levels) expect(level.config.n).toBeLessThanOrEqual(POST_COLOURS.length)
  })
})

/**
 * A hint that points at a technique the puzzle never rewards is worse than no
 * hint at all, so every claim the hints make is checked against the boards a
 * player is actually dealt.
 */
describe('the hints tell the truth', () => {
  it('"Three heights" really has nothing printed on it', () => {
    // Level 1, hint 1 promises this outright.
    expect(levels[0].config.printed).toBe(0)
    for (const seed of SEEDS) expect(start(levels[0], seed).givens.every((v) => v === 0)).toBe(true)
  })

  it('every level really does hold two signs one after the other', () => {
    // Level 1 hint 3 and level 2 hint 3 both send a player looking for one.
    for (const level of levels) {
      for (const seed of SEEDS) expect(hasChainOfThree(start(level, seed))).toBe(true)
    }
  })

  it('"Five heights" really is five heights and four printed posts', () => {
    // Level 3, hint 1 says both numbers.
    expect(levels[2].config.n).toBe(5)
    expect(levels[2].config.printed).toBe(4)
    for (const seed of SEEDS) {
      const state = start(levels[2], seed)
      expect(state.n).toBe(5)
      expect(state.givens.filter((v) => v !== 0)).toHaveLength(4)
    }
  })

  it('"Five heights" really has a square with two signs on it', () => {
    // Level 3, hint 2 tells a player to start there.
    for (const seed of SEEDS) {
      const state = start(levels[2], seed)
      const ends = signEndsOf(state)
      expect(ends.some((list) => list.length >= 2)).toBe(true)
    }
  })

  /**
   * The claim under every hint on every level: crossing heights off one square
   * at a time gets a player started, and the first cross-off comes from a sign
   * rather than from the printed posts. That is the gate, said as a technique.
   */
  it('every level opens with something a sign rules out and nothing else does', () => {
    for (const level of levels) {
      for (const seed of [7, 71, 701]) {
        const state = start(level, seed)
        // With the signs covered, nothing at all can be settled.
        expect(solveByLogic({ ...state, signs: [] })).toBeNull()
        // With them showing, the whole board comes out.
        expect(solveByLogic(state)).not.toBeNull()
      }
    }
  })
})
