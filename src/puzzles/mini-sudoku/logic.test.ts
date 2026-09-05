import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ART } from '../../components/pictogram-art'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { miniSudoku } from './index'
import { Board } from './Board'
import type { Clash, Geometry, SudokuAction, SudokuConfig, SudokuState } from './logic'
import {
  FRUIT_NAMES,
  allGeometries,
  applyGeometry,
  blankCount,
  canonicalKey,
  clashOf,
  conflicts,
  countSolutions,
  describeClash,
  describeMove,
  filledCount,
  init,
  isSolved,
  legalMoves,
  peersOf,
  randomGeometry,
  reduce,
  relabel,
  solveBySingles,
  solveGrid,
  unitsOf,
  valuesOf,
} from './logic'

const levels = miniSudoku.levels as PuzzleLevel<SudokuConfig>[]
const start = (level: PuzzleLevel<SudokuConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 50 }, (_, i) => 1000 + i * 37)

/** Writes the one true answer into every blank, in order. */
function solutionActions(state: SudokuState): SudokuAction[] {
  const answer = solveGrid(state.givens, state.n, state.boxH, state.boxW)
  expect(answer).not.toBeNull()
  const out: SudokuAction[] = []
  state.givens.forEach((given, index) => {
    if (given === 0) out.push({ type: 'set', index, value: (answer as number[])[index] })
  })
  return out
}

/** A seeded wander through the state graph, used to sample real positions. */
function walk(state: SudokuState, seed: number, steps: number): SudokuState[] {
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

describe('the bank', () => {
  for (const level of levels) {
    const { n, boxH, boxW, bank, clues } = level.config

    it(`"${level.label}" has a bank of at least three grids, all the right shape`, () => {
      expect(bank.length).toBeGreaterThanOrEqual(3)
      for (const grid of bank) {
        expect(grid).toHaveLength(n * n)
        for (const v of grid) {
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(n)
        }
      }
    })

    it(`"${level.label}" carries exactly ${clues} clues in every grid, so par cannot wobble`, () => {
      for (const grid of bank) expect(grid.filter((v) => v !== 0)).toHaveLength(clues)
      expect(level.par).toBe(n * n - clues)
    })

    it(`"${level.label}" prints no clue that already breaks the rules`, () => {
      for (const grid of bank) {
        for (const unit of unitsOf(n, boxH, boxW)) {
          const printed = unit.map((i) => grid[i]).filter((v) => v !== 0)
          expect(new Set(printed).size).toBe(printed.length)
        }
      }
    })

    it(`"${level.label}" has exactly one solution in every grid`, () => {
      for (const grid of bank) expect(countSolutions(grid, n, boxH, boxW, 2)).toBe(1)
    })

    it(`"${level.label}" can be finished without ever guessing`, () => {
      for (const grid of bank) {
        const done = solveBySingles(grid, n, boxH, boxW)
        expect(done).not.toBeNull()
        expect((done as number[]).every((v) => v !== 0)).toBe(true)
      }
    })

    it(`"${level.label}" holds no two grids that are the same puzzle in disguise`, () => {
      const keys = bank.map((grid) => canonicalKey(grid, n, boxH, boxW))
      expect(new Set(keys).size).toBe(bank.length)
    })
  }

  it('is checked by a solver that agrees with a plain exhaustive count', () => {
    // countSolutions is clever (MRV, capped). This is the stupidest possible
    // counter, so the two agreeing means the clever one is not lying.
    const dumbCount = (grid: number[], n: number, boxH: number, boxW: number) => {
      const units = unitsOf(n, boxH, boxW)
      const legal = (g: number[]) =>
        units.every((u) => {
          const seen = new Set<number>()
          for (const i of u) {
            if (g[i] === 0) continue
            if (seen.has(g[i])) return false
            seen.add(g[i])
          }
          return true
        })
      const g = grid.slice()
      let found = 0
      const rec = (i: number): void => {
        if (i === g.length) {
          found++
          return
        }
        if (g[i] !== 0) return rec(i + 1)
        for (let v = 1; v <= n; v++) {
          g[i] = v
          if (legal(g)) rec(i + 1)
          g[i] = 0
        }
      }
      if (!legal(g)) return 0
      rec(0)
      return found
    }
    for (const level of levels) {
      const { n, boxH, boxW, bank } = level.config
      for (const grid of bank) expect(dumbCount(grid, n, boxH, boxW)).toBe(1)
    }
  })
})

describe('the transformations', () => {
  it('knows exactly how big each symmetry group is', () => {
    // 4x4: 8 row orders x 8 column orders x flip.
    expect(allGeometries(4, 2, 2)).toHaveLength(128)
    // 6x6: 48 row orders x 72 column orders, and no flip — 2x3 boxes are not square.
    expect(allGeometries(6, 2, 3)).toHaveLength(3456)
    expect(allGeometries(6, 2, 3).every((g) => !g.transpose)).toBe(true)
  })

  it('only ever moves a row inside its band and a column inside its stack', () => {
    for (const [n, boxH, boxW] of [
      [4, 2, 2],
      [6, 2, 3],
    ] as const) {
      for (const geo of allGeometries(n, boxH, boxW)) {
        expect(new Set(geo.rows).size).toBe(n)
        expect(new Set(geo.cols).size).toBe(n)
        for (let r = 0; r < n; r += boxH) {
          const band = geo.rows.slice(r, r + boxH).map((x) => Math.floor(x / boxH))
          expect(new Set(band).size).toBe(1)
        }
        for (let c = 0; c < n; c += boxW) {
          const stack = geo.cols.slice(c, c + boxW).map((x) => Math.floor(x / boxW))
          expect(new Set(stack).size).toBe(1)
        }
      }
    }
  })

  it('turns a finished grid into another finished grid, every single time', () => {
    for (const level of levels) {
      const { n, boxH, boxW, bank } = level.config
      const answer = solveGrid(bank[0], n, boxH, boxW) as number[]
      for (const geo of allGeometries(n, boxH, boxW)) {
        const moved = applyGeometry(answer, n, geo)
        for (const unit of unitsOf(n, boxH, boxW)) {
          expect(new Set(unit.map((i) => moved[i])).size).toBe(n)
        }
      }
    }
  })

  it('keeps the single solution single, across the whole 4x4 group', () => {
    for (const level of levels.filter((l) => l.config.n === 4)) {
      const { n, boxH, boxW, bank } = level.config
      const labels = [3, 1, 4, 2]
      for (const grid of bank) {
        for (const geo of allGeometries(n, boxH, boxW)) {
          const moved = relabel(applyGeometry(grid, n, geo), labels)
          expect(countSolutions(moved, n, boxH, boxW, 2)).toBe(1)
        }
      }
    }
  })

  it('keeps the single solution single across a sample of the 6x6 group', () => {
    const { n, boxH, boxW, bank } = levels[2].config
    const geos = allGeometries(n, boxH, boxW)
    for (let k = 0; k < 240; k++) {
      const geo = geos[(k * 613) % geos.length] as Geometry
      const moved = applyGeometry(bank[k % bank.length], n, geo)
      expect(countSolutions(moved, n, boxH, boxW, 2)).toBe(1)
    }
  })

  it('never asks a 2x3 box to survive a flip', () => {
    const rng = makeRng(7)
    for (let k = 0; k < 200; k++) {
      expect(randomGeometry(rng, 6, 2, 3).transpose).toBe(false)
    }
  })
})

describe('init', () => {
  for (const level of levels) {
    it(`"${level.label}" deals a one-answer, guess-free puzzle for 50 different seeds`, () => {
      const { n, boxH, boxW, bank } = level.config
      const bankKeys = new Set(bank.map((g) => canonicalKey(g, n, boxH, boxW)))
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.givens).toHaveLength(n * n)
        expect(state.entries).toHaveLength(n * n)
        expect(state.entries.every((v) => v === 0)).toBe(true)
        expect(blankCount(state)).toBe(level.par)
        expect(countSolutions(state.givens, n, boxH, boxW, 2)).toBe(1)
        expect(solveBySingles(state.givens, n, boxH, boxW)).not.toBeNull()
        // The dealt grid is one of the hand-checked bank grids, only dressed up.
        expect(bankKeys.has(canonicalKey(state.givens, n, boxH, boxW))).toBe(true)
      }
    })

    it(`"${level.label}" deals a start that is neither solved nor nearly solved`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(isSolved(state)).toBe(false)
        expect(conflicts(state).some(Boolean)).toBe(false)
        // Non-degenerate: many squares left, and no single move can end it.
        expect(blankCount(state)).toBeGreaterThanOrEqual(8)
        for (const action of legalMoves(state)) expect(isSolved(reduce(state, action))).toBe(false)
      }
    })

    it(`"${level.label}" actually varies with the seed`, () => {
      const seen = new Set(SEEDS.map((seed) => start(level, seed).givens.join(',')))
      expect(seen.size).toBeGreaterThan(20)
    })

    it(`"${level.label}" is deterministic for one seed`, () => {
      expect(start(level, 4242).givens).toEqual(start(level, 4242).givens)
    })
  }

  it('never writes into the bank it is dealing from', () => {
    const before = levels.map((l) => JSON.stringify(l.config.bank))
    for (const level of levels) for (const seed of SEEDS) init(level, makeRng(seed))
    expect(levels.map((l) => JSON.stringify(l.config.bank))).toEqual(before)
  })
})

describe('reduce', () => {
  for (const level of levels) {
    it(`"${level.label}" returns the identical state for every action that changes nothing`, () => {
      const state = start(level, 99)
      const given = state.givens.findIndex((v) => v !== 0)
      const blank = state.givens.indexOf(0)
      const last = state.n * state.n - 1

      const noOps: [string, SudokuAction][] = [
        ['another action type', { type: 'nudge' } as unknown as SudokuAction],
        ['writing over a clue', { type: 'set', index: given, value: 1 }],
        ['rubbing out a clue', { type: 'set', index: given, value: 0 }],
        ['rubbing out a square that is already empty', { type: 'set', index: blank, value: 0 }],
        ['an index before the grid', { type: 'set', index: -1, value: 1 }],
        ['an index past the grid', { type: 'set', index: last + 1, value: 1 }],
        ['a fractional index', { type: 'set', index: 1.5, value: 1 }],
        ['an index that is NaN', { type: 'set', index: NaN, value: 1 }],
        ['an index that is Infinity', { type: 'set', index: Infinity, value: 1 }],
        ['a missing index', { type: 'set', index: undefined as unknown as number, value: 1 }],
        ['a null index', { type: 'set', index: null as unknown as number, value: 1 }],
        ['a value above the last symbol', { type: 'set', index: blank, value: state.n + 1 }],
        ['a negative value', { type: 'set', index: blank, value: -1 }],
        ['a fractional value', { type: 'set', index: blank, value: 1.5 }],
        ['a value that is NaN', { type: 'set', index: blank, value: NaN }],
        ['a value that is Infinity', { type: 'set', index: blank, value: Infinity }],
        ['a missing value', { type: 'set', index: blank, value: undefined as unknown as number }],
        ['a null value', { type: 'set', index: blank, value: null as unknown as number }],
      ]
      for (const [what, action] of noOps) {
        // toBe, not toEqual: a fresh but equal object would pollute the move tape.
        expect(reduce(state, action), what).toBe(state)
      }

      const written = reduce(state, { type: 'set', index: blank, value: 2 })
      expect(written).not.toBe(state)
      expect(reduce(written, { type: 'set', index: blank, value: 2 }), 'rewriting the same').toBe(
        written,
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
      expect(next.entries[blank]).toBe(3)
      expect(next.entries.filter((v) => v !== 0)).toHaveLength(1)
      expect(reduce(next, { type: 'set', index: blank, value: 0 }).entries[blank]).toBe(0)
    })

    it(`"${level.label}" changes exactly one square, and never a clue`, () => {
      // The whole lower bound on par rests on this, so check it over every
      // action from every state on a real wander, not just from the start.
      for (const state of walk(start(level, 5), 5, 30)) {
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
      for (const state of walk(start(level, 17), 17, 12)) {
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

describe('par', () => {
  for (const level of levels) {
    it(`"${level.label}" cannot be finished in fewer than par (${level.par}) moves`, () => {
      // isSolved needs every square filled; the start has exactly par empty;
      // and the test above shows one action fills at most one of them.
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        expect(blankCount(first)).toBe(level.par)
        expect(isSolved(first)).toBe(false)
        expect(filledCount(first)).toBe(level.config.clues)
      }
    })

    it(`"${level.label}" is finished in exactly par (${level.par}) moves, and not before`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        let state: SudokuState = first
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

  // The 4x4 levels are small enough to walk the whole graph and settle it.
  for (const level of levels.filter((l) => l.config.n === 4)) {
    it(`"${level.label}" has no shorter path than par under breadth-first search`, () => {
      for (const seed of [5, 61]) {
        const path = shortestSolution<SudokuState, SudokuAction>({
          start: start(level, seed),
          moves: legalMoves,
          apply: reduce,
          key: (s) => s.entries.join(','),
          solved: isSolved,
          // A square that repeats one of its peers is never on a shortest
          // path: it has to be rubbed out again, which costs two more moves
          // than not writing it. Pruning them keeps the graph walkable.
          invalid: (s) => conflicts(s).some(Boolean),
          maxStates: 100_000,
        })
        expect(path).not.toBeNull()
        expect(path).toHaveLength(level.par as number)
      }
    })
  }
})

describe('isSolved and conflicts', () => {
  it('will not call a full grid solved when a symbol repeats', () => {
    const first = start(levels[0], 21)
    let state: SudokuState = first
    for (const action of solutionActions(first)) state = reduce(state, action)
    expect(isSolved(state)).toBe(true)

    const blank = state.givens.indexOf(0)
    const wrong = (state.entries[blank] % state.n) + 1
    const broken = reduce(state, { type: 'set', index: blank, value: wrong })
    expect(valuesOf(broken).every((v) => v !== 0)).toBe(true)
    expect(isSolved(broken)).toBe(false)
    expect(conflicts(broken)[blank]).toBe(true)
  })

  it('will not call a grid solved while one square is still empty', () => {
    const first = start(levels[0], 21)
    const actions = solutionActions(first)
    let state: SudokuState = first
    for (const action of actions.slice(0, -1)) state = reduce(state, action)
    expect(blankCount(state)).toBe(1)
    expect(conflicts(state).some(Boolean)).toBe(false)
    expect(isSolved(state)).toBe(false)
  })

  it('marks the answer that repeats, never the clue it repeats', () => {
    const state = start(levels[0], 33)
    let blank = -1
    let clue = -1
    for (const unit of unitsOf(state.n, state.boxH, state.boxW)) {
      const empty = unit.find((i) => state.givens[i] === 0)
      const printed = unit.find((i) => state.givens[i] !== 0)
      if (empty !== undefined && printed !== undefined) {
        blank = empty
        clue = printed
        break
      }
    }
    expect(blank).toBeGreaterThanOrEqual(0)
    const next = reduce(state, { type: 'set', index: blank, value: state.givens[clue] })
    const flagged = conflicts(next)
    expect(flagged[blank]).toBe(true)
    expect(flagged[clue]).toBe(false)
    expect(isSolved(next)).toBe(false)
  })

  it('flags both of the player’s own answers when they repeat each other', () => {
    const state = start(levels[0], 33)
    const pair = unitsOf(4, 2, 2)
      .map((unit) => unit.filter((i) => state.givens[i] === 0))
      .find((blanks) => blanks.length >= 2) as number[]
    expect(pair).toBeDefined()
    const spare = [1, 2, 3, 4].find(
      (v) => !unitsOf(4, 2, 2).some((u) => u.includes(pair[0]) && u.some((i) => state.givens[i] === v)),
    ) as number
    const same = reduce(reduce(state, { type: 'set', index: pair[0], value: spare }), {
      type: 'set',
      index: pair[1],
      value: spare,
    })
    const flagged = conflicts(same)
    expect(flagged[pair[0]]).toBe(true)
    expect(flagged[pair[1]]).toBe(true)
    expect(flagged.filter(Boolean)).toHaveLength(2)
  })

  it('is quiet on an untouched board', () => {
    for (const level of levels) {
      expect(conflicts(start(level, 8)).some(Boolean)).toBe(false)
    }
  })
})

describe('the clash a placement makes', () => {
  /** Hand-built, so the test says which unit breaks rather than hunting for one. */
  const board = (givens: number[], entries = new Array<number>(16).fill(0)): SudokuState => ({
    n: 4,
    boxH: 2,
    boxW: 2,
    symbols: 'fruit',
    givens,
    entries,
  })

  /** An apple printed in the top-left corner, and nothing else on the board. */
  const corner = board([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

  it('says nothing when the square takes the symbol cleanly', () => {
    expect(clashOf(corner, 10, 1)).toBeNull()
    // Rubbing a square out breaks nothing, and a printed clue is not yours to write in.
    expect(clashOf(corner, 5, 0)).toBeNull()
    expect(clashOf(corner, 0, 2)).toBeNull()
  })

  it('names the row, and holds the whole of it', () => {
    const clash = clashOf(corner, 1, 1)
    expect(clash).toEqual({
      kind: 'row',
      ordinal: 1,
      cells: [0, 1, 2, 3],
      blamed: [0, 1],
      value: 1,
    })
  })

  it('falls to the column when the row is clean', () => {
    expect(clashOf(corner, 4, 1)).toMatchObject({
      kind: 'column',
      ordinal: 1,
      cells: [0, 4, 8, 12],
      blamed: [0, 4],
    })
  })

  it('falls to the box when the row and the column are both clean', () => {
    expect(clashOf(corner, 5, 1)).toMatchObject({
      kind: 'box',
      cells: [0, 1, 4, 5],
      blamed: [0, 5],
    })
  })

  it('blames every square in that unit holding the symbol, not only the first two', () => {
    const already = board(corner.givens, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(clashOf(already, 1, 1)?.blamed).toEqual([0, 1, 2])
  })

  it('fires exactly when the move would turn the square red', () => {
    for (const level of levels) {
      for (const state of walk(start(level, 12), 5, 8)) {
        for (const move of legalMoves(state)) {
          const clash = clashOf(state, move.index, move.value)
          expect(clash !== null).toBe(conflicts(reduce(state, move))[move.index])
          if (clash === null) continue
          expect(clash.cells).toHaveLength(state.n)
          expect(clash.cells).toContain(move.index)
          expect(clash.blamed).toContain(move.index)
          expect(clash.blamed.length).toBeGreaterThan(1)
          for (const i of clash.blamed) expect(clash.cells).toContain(i)
        }
      }
    }
  })

  it('puts the broken rule in one sentence', () => {
    expect(describeClash(corner, clashOf(corner, 1, 1) as Clash)).toBe(
      'The apple is already in row 1.',
    )
    expect(describeClash(corner, clashOf(corner, 4, 1) as Clash)).toBe(
      'The apple is already in column 1.',
    )
    // A box has no number a child could count to, so the lit squares say which one.
    expect(describeClash(corner, clashOf(corner, 5, 1) as Clash)).toBe(
      'The apple is already in this box.',
    )
  })

  it('says the numeral at 6x6', () => {
    const state = start(levels[2], 7)
    const clue = state.givens.findIndex((v) => v !== 0)
    const row = unitsOf(6, 2, 3)[Math.floor(clue / 6)]
    const blank = row.find((i) => state.givens[i] === 0) as number
    const clash = clashOf(state, blank, state.givens[clue]) as Clash
    expect(describeClash(state, clash)).toBe(
      `The ${state.givens[clue]} is already in row ${Math.floor(clue / 6) + 1}.`,
    )
  })
})

describe('describe', () => {
  it('names the fruit and the square, in the past tense', () => {
    const state = start(levels[0], 3)
    const blank = state.givens.indexOf(0)
    const next = reduce(state, { type: 'set', index: blank, value: 3 })
    const row = Math.floor(blank / 4) + 1
    const col = (blank % 4) + 1
    expect(describeMove(state, next, { type: 'set', index: blank, value: 3 })).toBe(
      `Put the grapes in row ${row}, column ${col}`,
    )
    expect(describeMove(next, state, { type: 'set', index: blank, value: 0 })).toBe(
      `Rubbed out row ${row}, column ${col}`,
    )
  })

  it('uses the numeral at 6x6', () => {
    const state = start(levels[2], 3)
    const blank = state.givens.indexOf(0)
    const row = Math.floor(blank / 6) + 1
    const col = (blank % 6) + 1
    expect(describeMove(state, state, { type: 'set', index: blank, value: 5 })).toBe(
      `Put 5 in row ${row}, column ${col}`,
    )
  })

  it('names the square the move actually changed, for every square', () => {
    for (const level of levels) {
      const state = start(level, 44)
      for (const action of legalMoves(state)) {
        const next = reduce(state, action)
        const changed = next.entries.findIndex((v, i) => v !== state.entries[i])
        const line = describeMove(state, next, action)
        const row = Math.floor(changed / state.n) + 1
        const col = (changed % state.n) + 1
        expect(line).toContain(`row ${row}, column ${col}`)
      }
    }
  })
})

describe('the board', () => {
  const setup = (level: PuzzleLevel<SudokuConfig>, seed: number, locked = false) => {
    const state = start(level, seed)
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }))
    return { state, dispatch, view }
  }

  const nameOf = (state: SudokuState, index: number, tail: string) =>
    `Row ${Math.floor(index / state.n) + 1}, column ${(index % state.n) + 1}, ${tail}`

  const tileAt = (state: SudokuState, index: number) =>
    document.querySelector(
      `[aria-label^="Row ${Math.floor(index / state.n) + 1}, column ${(index % state.n) + 1},"]`,
    ) as HTMLButtonElement

  /** The board with a real state behind it, so a cue can be watched from the tap that fires it. */
  const Play = ({ from }: { from: SudokuState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: SudokuAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  /** The first row that holds both a blank and a printed clue: one tap breaks that row. */
  const rowClash = (state: SudokuState) => {
    for (let r = 0; r < state.n; r++) {
      const cells = unitsOf(state.n, state.boxH, state.boxW)[r]
      const blank = cells.find((i) => state.givens[i] === 0)
      const clue = cells.find((i) => state.givens[i] !== 0)
      if (blank !== undefined && clue !== undefined) {
        const value = state.givens[clue]
        return {
          row: r + 1,
          blank,
          clue,
          value,
          key: `Put the ${FRUIT_NAMES[value - 1]} in the square`,
          said: `The ${FRUIT_NAMES[value - 1]} is already in row ${r + 1}.`,
        }
      }
    }
    throw new Error('no row holds both a blank and a printed clue')
  }

  it('draws a pressable tile for every blank and a printed clue for every given', () => {
    const { state } = setup(levels[0], 2)
    const clues = state.givens.filter((v) => v !== 0).length
    expect(screen.getAllByRole('img')).toHaveLength(clues)
    const tiles = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-label')?.startsWith('Row '))
    expect(tiles).toHaveLength(state.n * state.n - clues)
    for (const tile of tiles) expect(tile.className).toContain('u-press')
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = setup(levels[0], 2)
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|move|solved|par/i)
  })

  it('gives a clue no button and no press shadow', () => {
    setup(levels[0], 2)
    for (const clue of screen.getAllByRole('img')) {
      expect(clue.tagName).not.toBe('BUTTON')
      expect(clue.className).not.toContain('u-press')
      expect(clue.getAttribute('aria-label')).toMatch(/, printed$/)
    }
  })

  it('sends exactly one action when you tap a square and then a fruit', () => {
    const { state, dispatch } = setup(levels[0], 2)
    const blank = state.givens.indexOf(0)

    // Before a square is chosen the keypad is dead.
    expect(screen.getByRole('button', { name: 'Put the apple in the square' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: nameOf(state, blank, 'empty') }))
    const apple = screen.getByRole('button', { name: 'Put the apple in the square' })
    expect(apple).toBeEnabled()
    fireEvent.click(apple)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value: 1 })
  })

  it('sends the right numeral from the 6x6 keypad', () => {
    const { state, dispatch } = setup(levels[2], 2)
    const blank = state.givens.indexOf(0)
    fireEvent.click(screen.getByRole('button', { name: nameOf(state, blank, 'empty') }))
    fireEvent.click(screen.getByRole('button', { name: 'Put 4 in the square' }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value: 4 })
  })

  it('will not offer to rub out a square that is already empty', () => {
    const { state } = setup(levels[0], 2)
    const blank = state.givens.indexOf(0)
    fireEvent.click(screen.getByRole('button', { name: nameOf(state, blank, 'empty') }))
    expect(screen.getByRole('button', { name: 'Rub out the square' })).toBeDisabled()
  })

  it('types answers and rubs them out from the keyboard', () => {
    const level = levels[2]
    const first = start(level, 2)
    const blank = first.givens.indexOf(0)
    const answer = solveGrid(first.givens, 6, 2, 3) as number[]
    const value = answer[blank]
    const other = value === 6 ? 5 : 6
    const filled = reduce(first, { type: 'set', index: blank, value })
    const dispatch = vi.fn()
    render(createElement(Board, { state: filled, dispatch, locked: false }))

    const cell = screen.getByRole('button', { name: nameOf(filled, blank, String(value)) })
    fireEvent.click(cell)

    fireEvent.keyDown(cell, { key: String(other) })
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set', index: blank, value: other })

    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set', index: blank, value: 0 })

    // 7 is not a symbol on a 6x6 board, and neither is a letter.
    dispatch.mockClear()
    fireEvent.keyDown(cell, { key: '7' })
    fireEvent.keyDown(cell, { key: 'q' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('walks the arrow keys from square to square, never onto a clue', () => {
    const { state } = setup(levels[0], 2)
    const blank = state.givens.indexOf(0)
    const cell = screen.getByRole('button', { name: nameOf(state, blank, 'empty') })
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

  it('lets Escape put the pencil down', () => {
    const { state } = setup(levels[0], 2)
    const blank = state.givens.indexOf(0)
    const cell = screen.getByRole('button', { name: nameOf(state, blank, 'empty') })
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'Escape' })
    expect(cell).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Put the apple in the square' })).toBeDisabled()
  })

  it('keeps the square chosen while the keyboard is still on it, and lets go otherwise', () => {
    const level = levels[0]
    const state = start(level, 2)
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

    // Focus somewhere else — the shell's undo button, a tap on the palette —
    // and the choice is gone, which is what makes rewinding safe.
    after.blur()
    const back = reduce(next, { type: 'set', index: blank, value: 0 })
    rerender(createElement(Board, { state: back, dispatch, locked: false }))
    expect(tileAt(back, blank)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Put the apple in the square' })).toBeDisabled()
  })

  it('says so, in words and out loud, when an answer repeats', () => {
    const state = start(levels[0], 33)
    let blank = -1
    let clue = -1
    for (const unit of unitsOf(4, 2, 2)) {
      const empty = unit.find((i) => state.givens[i] === 0)
      const printed = unit.find((i) => state.givens[i] !== 0)
      if (empty !== undefined && printed !== undefined) {
        blank = empty
        clue = printed
        break
      }
    }
    const broken = reduce(state, { type: 'set', index: blank, value: state.givens[clue] })
    render(createElement(Board, { state: broken, dispatch: vi.fn(), locked: false }))
    expect(tileAt(broken, blank).getAttribute('aria-label')).toMatch(/, repeated$/)
    expect(tileAt(broken, blank)).toHaveAttribute('data-conflict', 'true')
    expect(screen.getByRole('status').textContent).toMatch(/the same fruit twice/)
    // The clue beside it is not blamed, and is still not a button.
    const printed = tileAt(broken, clue)
    expect(printed.tagName).toBe('DIV')
    expect(printed.getAttribute('data-conflict')).toBeNull()
    expect(printed.getAttribute('aria-label')).toMatch(/, printed$/)
  })

  it('lights the whole row and shakes the two fruits at fault', () => {
    const state = start(levels[0], 33)
    const { row, blank, clue, key } = rowClash(state)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(screen.getByRole('button', { name: key }))

    // The whole row, and not one square outside it.
    const lit = wearing(cues.highlight)
    expect(lit).toHaveLength(state.n)
    for (const square of lit) {
      expect(square.getAttribute('aria-label')).toMatch(new RegExp(`^Row ${row}, `))
    }

    // And inside it, the two squares that hold the fruit: the answer just
    // written, and the clue it repeats.
    const shaking = wearing(cues.shake).map((mark) => mark.closest('[aria-label]'))
    expect(shaking).toHaveLength(2)
    expect(shaking).toContain(tileAt(state, blank))
    expect(shaking).toContain(tileAt(state, clue))
  })

  it('names the repeat out loud, and in the line under the board', () => {
    const state = start(levels[0], 33)
    const { blank, key, said } = rowClash(state)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(screen.getByRole('button', { name: key }))

    expect(screen.getByRole('status')).toHaveTextContent(said)
    // Both lines say it: the one a child reads and the one a screen reader speaks.
    expect(screen.getAllByText(said)).toHaveLength(2)

    // Rub the answer out and there is nothing left to say.
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(screen.getByRole('button', { name: 'Rub out the square' }))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('lights nothing when the answer fits', () => {
    const state = start(levels[0], 33)
    const answer = solveGrid(state.givens, 4, 2, 2) as number[]
    const blank = state.givens.indexOf(0)
    const right = `Put the ${FRUIT_NAMES[answer[blank] - 1]} in the square`
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, blank))
    fireEvent.click(screen.getByRole('button', { name: right }))
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('takes the light off again, and leaves the sentence and the red ring standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const state = start(levels[0], 33)
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

  it('stays quiet when nothing is wrong', () => {
    setup(levels[0], 2)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('ignores every input while it is locked', () => {
    const { state, dispatch } = setup(levels[0], 2, true)
    const blank = state.givens.indexOf(0)
    const cell = screen.getByRole('button', { name: nameOf(state, blank, 'empty') })
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    for (const key of ['1', '4', '0', 'Backspace', 'Delete', 'ArrowRight', 'Escape']) {
      fireEvent.keyDown(cell, { key })
    }
    for (const key of screen.getAllByRole('button')) expect(key).toBeDisabled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('draws a solved board without a word of celebration', () => {
    const first = start(levels[0], 21)
    let state: SudokuState = first
    for (const action of solutionActions(first)) state = reduce(state, action)
    render(createElement(Board, { state, dispatch: vi.fn(), locked: true }))
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(miniSudoku.id).toBe('mini-sudoku')
    expect(miniSudoku.reseedable).toBe(true)
    // A wrong answer is not a dead end here — it is rubbed out, not stepped
    // back from — so there is deliberately no failure().
    expect(miniSudoku.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(miniSudoku.instructions.length).toBeGreaterThanOrEqual(2)
    expect(miniSudoku.instructions.length).toBeLessThanOrEqual(4)
    for (const line of miniSudoku.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(120)
    }
  })

  it('never names a square that would give the answer away', () => {
    for (const level of levels) {
      for (const hint of level.hints) {
        expect(hint).not.toMatch(/row \d|column \d/i)
      }
    }
  })

  it('only draws fruit on a board that has fruit enough for it', () => {
    for (const level of levels) {
      if (level.config.symbols === 'fruit') {
        expect(level.config.n).toBeLessThanOrEqual(FRUIT_NAMES.length)
      }
      expect(level.config.n % level.config.boxH).toBe(0)
      expect(level.config.n % level.config.boxW).toBe(0)
      expect(level.config.boxH * level.config.boxW).toBe(level.config.n)
    }
  })

  /**
   * OpenMoji lays a fruit's body down first, so the artwork's first fill is
   * the colour a child sees from across the room. The apple and the strawberry
   * shared that fill, which is how two of the four came to look alike.
   */
  it('draws every fruit in a colour of its own', () => {
    const bodyColour = (name: string) =>
      ART[name].body.match(/fill="(#[0-9a-fA-F]{6})"/)?.[1]?.toLowerCase()
    const colours = FRUIT_NAMES.map(bodyColour)
    expect(colours.every(Boolean)).toBe(true)
    expect(new Set(colours).size).toBe(FRUIT_NAMES.length)
  })
})

/**
 * A hint that points at a technique the puzzle never rewards is worse than no
 * hint at all, so every claim the hints make is checked against the grids the
 * player is actually dealt.
 */
describe('the hints tell the truth', () => {
  /** "Rule the others out of one square and the last one is settled." */
  const nakedSingle = (state: SudokuState) => {
    const peers = peersOf(state.n, state.boxH, state.boxW)
    const values = valuesOf(state)
    return values.some((v, i) => {
      if (v !== 0) return false
      let seen = 0
      for (let candidate = 1; candidate <= state.n; candidate++) {
        if (peers[i].every((p) => values[p] !== candidate)) seen++
      }
      return seen === 1
    })
  }

  for (const level of levels) {
    it(`"${level.label}" always opens with a square that has one answer left`, () => {
      // Every hint on every level ends by telling the player to cross symbols
      // off a single square. On a 4x4 that is provably the only technique
      // a unique puzzle can ever need, and it is enough here at 6x6 too.
      for (const seed of SEEDS) expect(nakedSingle(start(level, seed))).toBe(true)
    })
  }

  it('"Four fruits" really does open with a row, column or box one square from full', () => {
    // Level 1, hint 2 promises this outright.
    for (const seed of SEEDS) {
      const state = start(levels[0], seed)
      const nearlyFull = unitsOf(4, 2, 2).some(
        (unit) => unit.filter((i) => state.givens[i] === 0).length === 1,
      )
      expect(nearlyFull).toBe(true)
    }
  })

  it('"Four fruits, fewer clues" never opens with one, which is why it is harder', () => {
    // Level 2, hint 1 promises the opposite. Same board, same technique, but
    // the square has to be hunted for.
    for (const seed of SEEDS) {
      const state = start(levels[1], seed)
      const nearlyFull = unitsOf(4, 2, 2).some(
        (unit) => unit.filter((i) => state.givens[i] === 0).length === 1,
      )
      expect(nearlyFull).toBe(false)
    }
  })

  it('"Six numbers" really has boxes two rows tall and three columns wide', () => {
    // Level 3, hint 1 promises this.
    expect(levels[2].config.boxH).toBe(2)
    expect(levels[2].config.boxW).toBe(3)
    for (const seed of SEEDS) {
      const state = start(levels[2], seed)
      expect(state.boxH).toBe(2)
      expect(state.boxW).toBe(3)
    }
  })
})
