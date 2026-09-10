import { createElement, useState } from 'react'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeRng, randInt, shuffled } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel, Rng } from '../../lib/types'
import { thermometers } from './index'
import { Board } from './Board'
import { ThermometersIcon } from './glyphs'
import type { Deduction, ThermoAction, ThermoConfig, ThermoState } from './logic'
import {
  CARD,
  MIN_RUN,
  cluesOf,
  colCells,
  colOf,
  countSolutions,
  deal,
  describeMove,
  draw,
  filledIn,
  fits,
  indexTubes,
  init,
  isFilled,
  isSolved,
  legalMoves,
  levelFor,
  linesOf,
  partOf,
  reasoned,
  reduce,
  rowCells,
  rowOf,
  solveByLogic,
  tile,
  towardOf,
} from './logic'

const levels = thermometers.levels as PuzzleLevel<ThermoConfig>[]
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/**
 * Every board is dealt once and shared. A seven-across deal is the most
 * expensive thing in this file — 87ms at the worst of sixty seeds — and half
 * the tests below want the same sixty boards.
 */
const dealt = new Map<string, ThermoState>()
function start(level: PuzzleLevel<ThermoConfig>, seed: number): ThermoState {
  const key = `${level.id}:${seed}`
  const found = dealt.get(key)
  if (found !== undefined) return found
  const made = init(level, makeRng(seed))
  dealt.set(key, made)
  return made
}

/** The one answer, worked out the way a child would. */
const answerFor = (state: ThermoState) =>
  (solveByLogic(state.n, state.tubes, state.rowClues, state.colClues) as Deduction).fill

/** The square to tap to set this thermometer to this level. */
function tapFor(state: ThermoState, tube: number, level: number): number {
  const cells = state.tubes[tube]
  return level === 0 ? cells[state.fill[tube] - 1] : cells[level - 1]
}

/** Runs the mercury up every thermometer the answer fills. Each one is one move. */
function solutionActions(state: ThermoState): ThermoAction[] {
  const answer = answerFor(state)
  return answer
    .map((level, tube) => ({ level, tube }))
    .filter(({ level }) => level > 0)
    .map(({ level, tube }) => ({ type: 'set', cell: tapFor(state, tube, level) }) as ThermoAction)
}

const play = (state: ThermoState, actions: ThermoAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** How many thermometers hold mercury. The one number par is cut from. */
const wetTubes = (state: ThermoState) => state.fill.filter((level) => level > 0).length

/**
 * A hand-built board, so a test can name a square rather than hunt for one.
 * Five thermometers on a four-across grid, and one answer:
 *
 *       1 4 1 0
 *   2   0-1-2-3      row 1 is one thermometer, its bulb on the left
 *   2   ^ v v ^      the four below it stand in their own columns,
 *   1   | | | |      two with the bulb at the top, two at the bottom
 *   1   ' ' ' '
 *
 * The mercury stands at 2 in the top thermometer, 3 in the second column, 1 in
 * the third, and nowhere else — so par here is 3.
 */
const FIXTURE_TUBES = [
  [0, 1, 2, 3],
  [12, 8, 4],
  [5, 9, 13],
  [6, 10, 14],
  [15, 11, 7],
]
const FIXTURE_ROWS = [2, 2, 1, 1]
const FIXTURE_COLUMNS = [1, 4, 1, 0]
const FIXTURE_ANSWER = [2, 0, 3, 1, 0]

const fixture = (fill: number[] = [0, 0, 0, 0, 0]): ThermoState => ({
  n: 4,
  tubes: FIXTURE_TUBES,
  ...indexTubes(4, FIXTURE_TUBES),
  rowClues: FIXTURE_ROWS,
  colClues: FIXTURE_COLUMNS,
  fill,
})

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, filled } = level.config

    it(`"${level.label}" lays thermometers over every square, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const covered = state.tubes.flat().sort((a, b) => a - b)
        expect(covered).toEqual(Array.from({ length: n * n }, (_, i) => i))
        for (const cells of state.tubes) {
          expect(cells.length).toBeGreaterThanOrEqual(MIN_RUN)
          expect(cells.length).toBeLessThanOrEqual(n)
          // A straight run, one square at a time, from the bulb to the tip.
          const step = cells[1] - cells[0]
          expect([1, -1, n, -n]).toContain(step)
          for (let p = 1; p < cells.length; p++) expect(cells[p] - cells[p - 1]).toBe(step)
          // A run never turns the corner of the grid.
          if (Math.abs(step) === 1) {
            expect(new Set(cells.map((cell) => rowOf(n, cell))).size).toBe(1)
          } else {
            expect(new Set(cells.map((cell) => colOf(n, cell))).size).toBe(1)
          }
        }
      }
    })

    it(`"${level.label}" numbers every line off its own answer, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.rowClues).toHaveLength(n)
        expect(state.colClues).toHaveLength(n)
        const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
        expect(total(state.rowClues)).toBe(total(state.colClues))
        expect(state.rowClues.every((clue) => clue >= 0 && clue <= n)).toBe(true)
        expect(state.colClues.every((clue) => clue >= 0 && clue <= n)).toBe(true)
        expect(cluesOf(n, state.tubes, answerFor(state))).toEqual({
          rowClues: state.rowClues,
          colClues: state.colClues,
        })
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(countSolutions(n, state.tubes, state.rowClues, state.colClues, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const answer = answerFor(state)
        // The fallback in `deal` is for a run of luck the tests have never
        // seen: every seed lands on a board that suits the level.
        expect(
          fits(level.config, {
            tubes: state.tubes,
            rowClues: state.rowClues,
            colClues: state.colClues,
            fill: answer,
          }),
        ).toBe(true)
        const found = solveByLogic(n, state.tubes, state.rowClues, state.colClues) as Deduction
        expect(found.rounds).toBeGreaterThanOrEqual(level.config.minRounds)
        expect(found.rounds).toBeLessThanOrEqual(level.config.maxRounds)
        expect(found.narrowings).toBeGreaterThanOrEqual(level.config.minNarrowings)
        expect(found.narrowings).toBeLessThanOrEqual(level.config.maxNarrowings)
        // The mercury has somewhere to stop part way, or the level is a board
        // of switches rather than of thermometers.
        const partial = answer.filter(
          (deep, tube) => deep > 0 && deep < state.tubes[tube].length,
        ).length
        expect(partial).toBeGreaterThanOrEqual(level.config.minPartial)
      }
    })

    it(`"${level.label}" starts with no mercury on it, and is not already solved`, () => {
      for (const seed of SEEDS.slice(0, 8)) {
        const state = start(level, seed)
        expect(state.fill).toEqual(state.tubes.map(() => 0))
        expect(isSolved(state)).toBe(false)
        expect(wetTubes(state)).toBe(0)
      }
      expect(filled).toBe(level.par)
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(init(level, makeRng(12)).tubes).toEqual(init(level, makeRng(12)).tubes)
      expect(init(level, makeRng(12)).rowClues).toEqual(init(level, makeRng(12)).rowClues)
      expect(init(level, makeRng(12)).tubes).not.toEqual(init(level, makeRng(13)).tubes)
    })
  }

  it('deals a board for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })

  it('gives five across the 0 in the margin its first hint sends a child to', () => {
    // A hint may only name something that is on every board it is shown on, so
    // the gate is in the config and this is the claim it holds up.
    expect(levels[0].hints[0]).toContain('0')
    for (const seed of SEEDS) {
      const state = start(levels[0], seed)
      expect([...state.rowClues, ...state.colClues]).toContain(0)
    }
  })

  it('gives every level a biggest number worth starting from', () => {
    // Six across opens on "the biggest number in the margin", and seven across
    // is dealt against the same numbers, so both are held to it.
    for (const level of levels.slice(1)) {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const clues = [...state.rowClues, ...state.colClues]
        expect(Math.max(...clues)).toBeGreaterThanOrEqual(2)
        // And the rest of that hint: a line holds n squares and its number
        // counts the full ones, so the line with the biggest number is the line
        // that ends with the fewest empty squares. Read off the answer rather
        // than off the arithmetic.
        const answer = { ...state, fill: answerFor(state) }
        const empty = [
          ...Array.from({ length: state.n }, (_, r) => rowCells(state.n, r)),
          ...Array.from({ length: state.n }, (_, c) => colCells(state.n, c)),
        ].map((cells) => cells.length - filledIn(answer, cells))
        expect(state.n - Math.max(...clues)).toBe(Math.min(...empty))
      }
    }
  })

  it('lays a tiling out for every seed it is handed', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const n of [5, 6, 7]) {
        const tubes = tile(makeRng(seed * 13 + 1), n)
        expect(tubes).not.toBeNull()
        expect((tubes as number[][]).flat().sort((a, b) => a - b)).toEqual(
          Array.from({ length: n * n }, (_, i) => i),
        )
      }
    }
  })

  it('draws a candidate with mercury in exactly as many thermometers as par', () => {
    const board = draw(makeRng(5), levels[1].config)
    expect(board).not.toBeNull()
    const { fill, tubes, rowClues, colClues } = board as NonNullable<typeof board>
    expect(fill.filter((level) => level > 0)).toHaveLength(levels[1].config.filled)
    expect(cluesOf(6, tubes, fill)).toEqual({ rowClues, colClues })
  })

  it('never hands back a board with two answers, whatever it settles for', () => {
    // The fallback gives up the difficulty band and nothing else: it is still
    // reasoned out, still one answer, still par to the move.
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 6)) {
        const state = start(level, seed)
        expect(
          reasoned(level.config, {
            tubes: state.tubes,
            rowClues: state.rowClues,
            colClues: state.colClues,
            fill: answerFor(state),
          }),
        ).not.toBeNull()
      }
    }
  })
})

/* ============================================================
   What five across asks a child for

   Five across is dealt so that step one of `solveByLogic` alone
   finishes it — `maxNarrowings: 0` is the gate — and its three
   hints are that step in words. `fillByHints` is those three
   sentences read back as rules and run to a standstill. It
   colours squares in rather than narrowing bounds, so it is a
   second implementation and not the first one called twice, and
   it can only settle what the three sentences themselves settle.
   ============================================================ */

const FULL = 1
const EMPTY = -1

/**
 * Colour in a board with nothing but the three sentences that five across shows
 * a child, and hand back how many squares are still unknown. 0 is a board that
 * came out; anything else is a board where a child who followed the hints would
 * have had to guess.
 *
 * With `finishedLine` off, the second hint is taken away and only the 0 of the
 * first is left of it — which is what these hints said before that rule was one
 * of them.
 */
function fillByHints(state: ThermoState, finishedLine: boolean): number {
  const { n, tubes, owner, step } = state
  const mark = new Array<number>(n * n).fill(0)
  const lines = [
    ...Array.from({ length: n }, (_, r) => ({ cells: rowCells(n, r), clue: state.rowClues[r] })),
    ...Array.from({ length: n }, (_, c) => ({ cells: colCells(n, c), clue: state.colClues[c] })),
  ]
  /** Mercury fills from the bulb, so one square settled settles a run of them. */
  const write = (cell: number, value: number) => {
    if (mark[cell] === value) return false
    mark[cell] = value
    const cells = tubes[owner[cell]]
    if (value === FULL) for (let k = 0; k < step[cell]; k++) mark[cells[k]] = FULL
    else for (let k = step[cell] + 1; k < cells.length; k++) mark[cells[k]] = EMPTY
    return true
  }
  for (;;) {
    let moved = false
    for (const { cells, clue } of lines) {
      const full = cells.filter((cell) => mark[cell] === FULL).length
      const open = cells.filter((cell) => mark[cell] === 0)
      // "A line that already has as many full squares as its number wants."
      if (finishedLine ? full === clue : clue === 0) {
        for (const cell of open) moved = write(cell, EMPTY) || moved
      }
      // "A line with room for just as many squares as its number wants."
      if (full + open.length === clue) {
        for (const cell of open) moved = write(cell, FULL) || moved
      }
    }
    if (!moved) break
  }
  return mark.filter((value) => value === 0).length
}

describe('the three hints of five across', () => {
  it('finishes every board that it is shown, and never has to guess', () => {
    for (const seed of SEEDS) {
      const state = start(levels[0], seed)
      expect(`${seed}: ${fillByHints(state, true)} unknown`).toBe(`${seed}: 0 unknown`)
    }
  })

  it('needs the one about a line that already has all it wants', () => {
    // That hint does not say the instructions over again. Take it away, leave
    // the 0 of the first hint and the full line of the third, and the boards
    // stop short: every one of them is a board where a child would have been
    // left to guess at a step that the hints never taught.
    const stalled = SEEDS.filter((seed) => fillByHints(start(levels[0], seed), false) > 0)
    expect(stalled.length).toBeGreaterThan(SEEDS.length / 2)
  })
})

describe('the thermometers themselves', () => {
  it('knows which square is the bulb, which the tip, and which way it runs', () => {
    const state = fixture()
    expect(partOf(state, 0)).toBe('bulb')
    expect(partOf(state, 1)).toBe('stem')
    expect(partOf(state, 3)).toBe('tip')
    expect(towardOf(4, FIXTURE_TUBES[0])).toBe('east')
    // The second thermometer has its bulb in the bottom row, so it fills upwards.
    expect(partOf(state, 12)).toBe('bulb')
    expect(partOf(state, 4)).toBe('tip')
    expect(towardOf(4, FIXTURE_TUBES[1])).toBe('north')
    expect(towardOf(4, FIXTURE_TUBES[2])).toBe('south')
    expect(towardOf(4, [3, 2, 1])).toBe('west')
  })

  it('fills from the bulb, so a square is only full if the one before it is', () => {
    const state = fixture([2, 0, 0, 0, 0])
    expect(isFilled(state, 0)).toBe(true)
    expect(isFilled(state, 1)).toBe(true)
    expect(isFilled(state, 2)).toBe(false)
    expect(isFilled(state, 3)).toBe(false)
    // There is no way to write down a position that breaks the rule: the state
    // is a level, not a square somebody coloured in.
    for (let level = 0; level <= 4; level++) {
      const run = fixture([level, 0, 0, 0, 0])
      const full = FIXTURE_TUBES[0].map((cell) => isFilled(run, cell))
      expect(full).toEqual(FIXTURE_TUBES[0].map((_, p) => p < level))
    }
  })

  it('counts the full squares in a line', () => {
    const state = fixture(FIXTURE_ANSWER)
    expect(FIXTURE_ROWS.map((_, r) => filledIn(state, rowCells(4, r)))).toEqual(FIXTURE_ROWS)
    expect(FIXTURE_COLUMNS.map((_, c) => filledIn(state, colCells(4, c)))).toEqual(FIXTURE_COLUMNS)
  })

  it('says what a tap on a square would set, including the tap that empties', () => {
    const empty = fixture()
    expect(levelFor(empty, 0)).toBe(1)
    expect(levelFor(empty, 2)).toBe(3)
    const part = fixture([2, 0, 0, 0, 0])
    // The square the mercury already reaches takes it all away; every other
    // square moves it, so no square is ever a control that changes nothing.
    expect(levelFor(part, 1)).toBe(0)
    expect(levelFor(part, 0)).toBe(1)
    expect(levelFor(part, 3)).toBe(4)
    for (let cell = 0; cell < 16; cell++) {
      expect(levelFor(part, cell)).not.toBe(part.fill[part.owner[cell]])
    }
  })

  it('reads the lines off the layout, one thermometer at a time and in order', () => {
    const lines = linesOf(4, FIXTURE_TUBES)
    expect(lines).toHaveLength(8)
    const row0 = lines[0]
    expect(row0.kind).toBe('row')
    expect(row0.cells).toEqual(rowCells(4, 0))
    expect(row0.parts).toEqual([{ tube: 0, at: [0, 1, 2, 3] }])
    const col1 = lines.find((l) => l.kind === 'column' && l.ordinal === 2)
    expect(col1?.cells).toEqual(colCells(4, 1))
    expect(col1?.parts).toEqual([
      { tube: 0, at: [1] },
      { tube: 2, at: [0, 1, 2] },
    ])
  })
})

describe('reduce', () => {
  it('runs the mercury up, back down, and away again', () => {
    const state = fixture()
    const up = reduce(state, { type: 'set', cell: 2 })
    expect(up.fill).toEqual([3, 0, 0, 0, 0])
    expect(up.tubes).toBe(state.tubes)
    expect(up.rowClues).toBe(state.rowClues)
    const down = reduce(up, { type: 'set', cell: 0 })
    expect(down.fill).toEqual([1, 0, 0, 0, 0])
    const gone = reduce(down, { type: 'set', cell: 0 })
    expect(gone.fill).toEqual([0, 0, 0, 0, 0])
    // A thermometer set back to empty and one nobody has touched are the same
    // position, which is what makes par the count of the ones holding mercury.
    expect(gone.fill).toEqual(state.fill)
  })

  it('hands back the very same state for an action that is not one', () => {
    const state = fixture()
    expect(reduce(state, { type: 'set', cell: -1 })).toBe(state)
    expect(reduce(state, { type: 'set', cell: 16 })).toBe(state)
    expect(reduce(state, { type: 'set', cell: 1.5 })).toBe(state)
    expect(reduce(state, { type: 'set', cell: Number.NaN })).toBe(state)
    expect(reduce(state, { type: 'nudge' } as unknown as ThermoAction)).toBe(state)
    expect(reduce(state, undefined as unknown as ThermoAction)).toBe(state)
  })

  it('takes every tap, because no number in the margin forbids a move', () => {
    // Row 1 wants two full squares. Filling all four of them breaks no rule
    // this puzzle has: a number says what the finished board looks like, not
    // what a child may do on the way there.
    const state = fixture()
    const over = reduce(state, { type: 'set', cell: 3 })
    expect(over).not.toBe(state)
    expect(filledIn(over, rowCells(4, 0))).toBe(4)
    expect(over.rowClues[0]).toBe(2)
    expect(isSolved(over)).toBe(false)
  })

  it('changes exactly one thermometer, and always changes something', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 3)) {
        for (const state of positions(start(level, seed))) {
          for (const action of legalMoves(state)) {
            const next = reduce(state, action)
            expect(next).not.toBe(state)
            const moved = next.fill.filter((deep, tube) => deep !== state.fill[tube])
            expect(moved).toHaveLength(1)
            expect(Math.abs(wetTubes(next) - wetTubes(state))).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })
})

/** Real positions: the answer run up one thermometer at a time. */
function positions(state: ThermoState): ThermoState[] {
  const out = [state]
  let cur = state
  for (const action of solutionActions(state)) {
    cur = reduce(cur, action)
    out.push(cur)
  }
  return out
}

describe('isSolved', () => {
  it('wants every number to count its own line, and nothing else', () => {
    expect(isSolved(fixture(FIXTURE_ANSWER))).toBe(true)
    expect(isSolved(fixture())).toBe(false)
    // One thermometer short, and one square too far.
    expect(isSolved(fixture([2, 0, 3, 0, 0]))).toBe(false)
    expect(isSolved(fixture([3, 0, 3, 1, 0]))).toBe(false)
  })

  it('is worked out from the board alone, never from the board it was dealt', () => {
    for (const level of levels.slice(0, 2)) {
      const first = start(level, 7)
      const done = play(first, solutionActions(first))
      expect(isSolved(done)).toBe(true)
      // The same mercury, one number changed: the same position is no longer an
      // answer, so nothing here is remembering how the board was made.
      const bent: ThermoState = {
        ...done,
        rowClues: done.rowClues.map((clue, r) => (r === 0 ? clue + 1 : clue)),
      }
      expect(isSolved(bent)).toBe(false)
    }
  })

  it('has one answer on the hand-built board too', () => {
    expect(countSolutions(4, FIXTURE_TUBES, FIXTURE_ROWS, FIXTURE_COLUMNS, 3)).toBe(1)
    expect(solveByLogic(4, FIXTURE_TUBES, FIXTURE_ROWS, FIXTURE_COLUMNS)?.fill).toEqual(
      FIXTURE_ANSWER,
    )
  })

  it('turns down a board whose numbers contradict each other', () => {
    // Column 4 wants a square that column 4 has no thermometer reaching.
    expect(solveByLogic(4, FIXTURE_TUBES, FIXTURE_ROWS, [1, 4, 1, 4])).toBeNull()
  })
})

describe('there is no dead end to step back from', () => {
  it('leaves the puzzle with no failure() at all', () => {
    expect(thermometers.engine.failure).toBeUndefined()
  })

  it('can be finished from every position it can reach', () => {
    // The claim behind having no failure(): a tap sets a thermometer's level
    // outright, so from any position at all the answer is at most one move a
    // thermometer away, and never more than par moves away from a position the
    // player is likely to be in.
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 3)) {
        const first = start(level, seed)
        const answer = answerFor(first)
        for (const action of legalMoves(first)) {
          const wrong = reduce(first, action)
          let cur = wrong
          let moves = 0
          for (let tube = 0; tube < cur.tubes.length; tube++) {
            if (cur.fill[tube] === answer[tube]) continue
            cur = reduce(cur, { type: 'set', cell: tapFor(cur, tube, answer[tube]) })
            moves++
          }
          expect(isSolved(cur)).toBe(true)
          expect(moves).toBeLessThanOrEqual((level.par as number) + 1)
        }
      }
    }
  })
})

describe('par', () => {
  it('is the number of thermometers the answer fills', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.filled)
      for (const seed of SEEDS.slice(0, 10)) {
        const state = start(level, seed)
        expect(answerFor(state).filter((fill) => fill > 0)).toHaveLength(level.par as number)
      }
    }
  })

  it('cannot be beaten, because a move moves exactly one thermometer', () => {
    /* The floor, checked by construction rather than asserted. A board starts
       with every thermometer empty; the only solved position is the one answer,
       which fills `par` of them; and every move changes the number holding
       mercury by at most one. So `par` moves is the fewest there can be. */
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 3)) {
        const first = start(level, seed)
        expect(wetTubes(first)).toBe(0)
        for (const state of positions(first)) {
          for (const action of legalMoves(state)) {
            expect(Math.abs(wetTubes(reduce(state, action)) - wetTubes(state))).toBeLessThanOrEqual(
              1,
            )
          }
          if (isSolved(state)) expect(wetTubes(state)).toBe(level.par)
        }
      }
    }
  })

  it('is reached, because the answer can be run up in any order', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 12)) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
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

  it('has no shorter path than par under breadth-first search, five across', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const path = shortestSolution<ThermoState, ThermoAction>({
        start: start(levels[0], seed),
        moves: legalMoves,
        apply: reduce,
        key: (state) => state.fill.join(','),
        solved: isSolved,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[0].par as number)
    }
  })

  it('is walked whole at five across, and is far past the search at six and seven', () => {
    // Why the level above searches and the other two argue. A position is one
    // level a thermometer, so the whole graph is the lengths multiplied out.
    const graph = (state: ThermoState) =>
      state.tubes.reduce((size, cells) => size * (cells.length + 1), 1)
    const small = start(levels[0], SEEDS[0])
    expect(graph(small)).toBeLessThan(200_000)
    // And that arithmetic is the graph: every combination of levels is reachable.
    expect(
      reachableCount<ThermoState, ThermoAction>({
        start: small,
        moves: legalMoves,
        apply: reduce,
        key: (state) => state.fill.join(','),
      }),
    ).toBe(graph(small))
    for (const level of levels.slice(1)) {
      for (const seed of SEEDS.slice(0, 8)) expect(graph(start(level, seed))).toBeGreaterThan(200_000)
    }
  })
})

/* ============================================================
   What the board may not say

   The puzzle is Aquarium's family, and Aquarium was measured to
   lose to a player who never thinks: tap a thermometer, look at
   what the board says, keep whatever it did not complain about.
   These are that player, run against the boards this file deals.
   ============================================================ */

type Feedback = 'overfull' | 'done' | 'silent'

/** Lines holding more than their number, and lines holding exactly it. */
function readLines(state: ThermoState) {
  let over = 0
  let right = 0
  const count = (cells: number[], clue: number) => {
    const has = filledIn(state, cells)
    if (has > clue) over++
    if (has === clue) right++
  }
  for (let k = 0; k < state.n; k++) {
    count(rowCells(state.n, k), state.rowClues[k])
    count(colCells(state.n, k), state.colClues[k])
  }
  return { over, right }
}

/**
 * The mindless climber. Every candidate it tries is a real tap through
 * `reduce`, so the taps counted here and the moves counted on the board are the
 * same number.
 */
function climb(from: ThermoState, feedback: Feedback, rng: Rng, budget: number): number {
  let state = from
  let taps = 0
  const set = (tube: number, level: number) => {
    if (state.fill[tube] === level) return
    state = reduce(state, { type: 'set', cell: tapFor(state, tube, level) })
    taps++
  }
  /** Knock one thermometer to a level it is not already at, so a tap is always spent. */
  const jolt = () => {
    const tube = randInt(rng, state.tubes.length)
    const room = state.tubes[tube].length + 1
    const level = randInt(rng, room)
    set(tube, level === state.fill[tube] ? (level + 1) % room : level)
  }
  /** The same, but downwards: what a climber does when it has run out of room. */
  const knockDown = () => {
    const wet = state.fill.map((level, tube) => (level > 0 ? tube : -1)).filter((t) => t >= 0)
    if (wet.length === 0) return jolt()
    const tube = wet[randInt(rng, wet.length)]
    set(tube, randInt(rng, state.fill[tube]))
  }

  while (taps < budget) {
    if (feedback === 'silent') {
      // Nothing to read but the shell's stamp, so: try something and look.
      jolt()
    } else if (feedback === 'overfull') {
      // Raise every thermometer as far as the board will let it go. A position
      // with no over-full line holds at most the sum of the numbers, and holds
      // exactly that only when it is an answer — so this is a hill straight up.
      const was = taps
      const order = shuffled(
        rng,
        state.tubes.map((_, tube) => tube),
      )
      for (const tube of order) {
        for (let level = state.tubes[tube].length; level > state.fill[tube]; level--) {
          const tried = reduce(state, { type: 'set', cell: tapFor(state, tube, level) })
          if (readLines(tried).over === 0) {
            set(tube, level)
            break
          }
        }
        if (isSolved(state)) return taps
        if (taps >= budget) break
      }
      // A local top: knock one thermometer down and climb again.
      if (taps === was) knockDown()
    } else {
      // A tick on every line whose count is right: climb on how many there are.
      let best: [number, number] | null = null
      let score = readLines(state).right
      for (let tube = 0; tube < state.tubes.length; tube++) {
        for (let level = 0; level <= state.tubes[tube].length; level++) {
          if (level === state.fill[tube]) continue
          const tried = reduce(state, { type: 'set', cell: tapFor(state, tube, level) })
          const now = readLines(tried).right
          if (now > score) {
            score = now
            best = [tube, level]
          }
        }
      }
      if (best === null) jolt()
      else set(best[0], best[1])
    }
    if (isSolved(state)) return taps
  }
  return -1
}

describe('the mindless climber', () => {
  const BOARDS = 12
  const BUDGET = 300

  const run = (feedback: Feedback) => {
    let won = 0
    let best = Number.POSITIVE_INFINITY
    for (let k = 0; k < BOARDS; k++) {
      const from = start(levels[1], SEEDS[k])
      const taps = climb(from, feedback, makeRng(k * 31 + 5), BUDGET)
      if (taps < 0) continue
      won++
      best = Math.min(best, taps)
    }
    return { won, best }
  }

  it('wins every board the moment the board marks a line as over-full', () => {
    const { won, best } = run('overfull')
    expect(won).toBe(BOARDS)
    // And on its best boards it does it in par, having thought about nothing.
    expect(best).toBe(levels[1].par)
  })

  it('wins them for a tick on a line whose count has come right, too', () => {
    // The gentler mark, and it is no better: a board that says which lines are
    // right is a board that can be climbed by counting the ticks.
    expect(run('done').won).toBeGreaterThanOrEqual(BOARDS - 4)
  })

  it('wins none against the board as it ships, which says nothing at all', () => {
    // 300 taps is fifty times par. This is why the board is silent: neither of
    // the two marks above can be drawn without giving the puzzle away.
    expect(BUDGET).toBeGreaterThanOrEqual(50 * (levels[1].par as number))
    expect(run('silent').won).toBe(0)
  })
})

describe('describe', () => {
  it('names the square, in the past tense, both ways round', () => {
    const state = fixture()
    const up = reduce(state, { type: 'set', cell: 9 })
    expect(describeMove(state, up, { type: 'set', cell: 9 })).toBe(
      'Ran the mercury up to row 3, column 2',
    )
    expect(describeMove(up, state, { type: 'set', cell: 9 })).toBe(
      'Emptied the thermometer at row 3, column 2',
    )
  })

  it('says the mercury came back when a tap takes it down without emptying it', () => {
    // The top thermometer is full to its tip and the tap lands two squares
    // short of that, so the mercury falls and some of it stays. The square
    // itself says "take the mercury back to here", and the tape has to agree
    // with the button that was pressed.
    const full = fixture([4, 0, 0, 0, 0])
    const down = reduce(full, { type: 'set', cell: 1 })
    expect(down.fill[0]).toBe(2)
    expect(describeMove(full, down, { type: 'set', cell: 1 })).toBe(
      'Took the mercury back to row 1, column 2',
    )
  })

  it('names the square the move actually changed, for every square', () => {
    const state = start(levels[0], 44)
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      expect(describeMove(state, next, action)).toContain(
        `row ${rowOf(state.n, action.cell) + 1}, column ${colOf(state.n, action.cell) + 1}`,
      )
    }
  })

  it('says which way the mercury went, from every level of every thermometer', () => {
    // Every tap on every thermometer, from every level that it could be
    // standing at. The sentence has to say what the mercury really did.
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 4)) {
        const board = start(level, seed)
        for (let tube = 0; tube < board.tubes.length; tube++) {
          for (let at = 1; at <= board.tubes[tube].length; at++) {
            const state = { ...board, fill: board.fill.map((_, t) => (t === tube ? at : 0)) }
            for (const cell of board.tubes[tube]) {
              const action = { type: 'set', cell } as ThermoAction
              const next = reduce(state, action)
              if (next === state) continue
              const where = `row ${rowOf(board.n, cell) + 1}, column ${colOf(board.n, cell) + 1}`
              const verb =
                next.fill[tube] === 0
                  ? `Emptied the thermometer at ${where}`
                  : next.fill[tube] > at
                    ? `Ran the mercury up to ${where}`
                    : `Took the mercury back to ${where}`
              expect(`${at}->${next.fill[tube]}: ${describeMove(state, next, action)}`).toBe(
                `${at}->${next.fill[tube]}: ${verb}`,
              )
            }
          }
        }
      }
    }
  })
})

/* ============================================================
   The board
   ============================================================ */

const paint = (state: ThermoState, locked = false) => {
  const dispatch = vi.fn()
  const view = render(createElement(Board, { state, dispatch, locked }))
  return {
    dispatch,
    view,
    by: (name: RegExp) => screen.getByRole('button', { name }),
    all: () => screen.getAllByRole('button') as HTMLButtonElement[],
  }
}

/** The board with the shell's job done for it: a state that answers back. */
const Play = ({ from }: { from: ThermoState }) => {
  const [state, setState] = useState(from)
  return createElement(Board, {
    state,
    dispatch: (action: ThermoAction) => setState((cur) => reduce(cur, action)),
    locked: false,
  })
}

describe('the board', () => {
  it('draws a square you can press on every square of the grid', () => {
    const { all } = paint(fixture())
    expect(all()).toHaveLength(16)
    for (const button of all()) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).toMatch(
        /^Row \d, column \d, \d of \d from the bulb, /,
      )
    }
  })

  it('says where a square stands along its thermometer, and what a tap does', () => {
    paint(fixture([2, 0, 0, 0, 0]))
    expect(
      screen.getByRole('button', { name: 'Row 1, column 1, 1 of 4 from the bulb, full, take the mercury back to here' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Row 1, column 2, 2 of 4 from the bulb, the top of the mercury, empty this thermometer',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Row 1, column 3, 3 of 4 from the bulb, empty, fill to here' }),
    ).toBeInTheDocument()
    // The bulb of the thermometer standing in column 1 is in the bottom row,
    // so that is where its 1 of 3 is.
    expect(
      screen.getByRole('button', { name: 'Row 4, column 1, 1 of 3 from the bulb, empty, fill to here' }),
    ).toBeInTheDocument()
  })

  it('stands a number at the end of every row and every column', () => {
    paint(fixture())
    expect(screen.getAllByRole('img')).toHaveLength(8)
    expect(screen.getByRole('img', { name: 'Row 1 wants 2 full squares' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Row 3 wants 1 full square' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Column 4 wants no full squares' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Column 2 wants 4 full squares' })).toBeInTheDocument()
  })

  it('sends exactly one action for one tap, and runs the mercury to it', () => {
    const { dispatch, by } = paint(fixture())
    fireEvent.click(by(/^Row 1, column 3, 3 of 4 from the bulb, empty, fill to here$/))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', cell: 2 })
  })

  it('empties the thermometer on a tap at the top of the mercury', () => {
    render(createElement(Play, { from: fixture() }))
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 3, 3 of 4 from the bulb, empty/ }))
    const brim = screen.getByRole('button', {
      name: 'Row 1, column 3, 3 of 4 from the bulb, the top of the mercury, empty this thermometer',
    })
    fireEvent.click(brim)
    expect(
      screen.getByRole('button', { name: /^Row 1, column 1, 1 of 4 from the bulb, empty/ }),
    ).toBeInTheDocument()
  })

  it('says nothing whatever about how a line is getting on', () => {
    // The design decision the climber above measures, held here as a fact about
    // the page: the only words on this board are the eight numbers in the
    // margin, and they never change.
    const view = render(createElement(Play, { from: fixture() }))
    const numbers = () => view.container.textContent
    expect(numbers()).toBe('14102211')
    // Row 1 wants two full squares, and now holds four.
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 4, 4 of 4/ }))
    expect(filledIn(fixture([4, 0, 0, 0, 0]), rowCells(4, 0))).toBe(4)
    expect(numbers()).toBe('14102211')
    expect(view.container.querySelector('[data-mark]')).toBeNull()
    expect(view.container.querySelector('[role="status"]')).toBeNull()
  })

  it('walks the arrow keys from square to square, and stands still at the edge', () => {
    const { by, all } = paint(fixture())
    const corner = by(/^Row 1, column 1, /)
    corner.focus()
    fireEvent.keyDown(corner, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(by(/^Row 1, column 2, /))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(by(/^Row 1, column 2, /))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(by(/^Row 2, column 2, /))
    // One tab stop, and it is the square the child is on.
    const stops = all().filter((el) => el.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
    expect(stops[0]).toBe(by(/^Row 2, column 2, /))
  })

  it('leaves the browser its own keyboard shortcuts', () => {
    const { by } = paint(fixture())
    const corner = by(/^Row 1, column 1, /)
    corner.focus()
    for (const chord of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      // Not handled, so not prevented: the browser still gets the key.
      expect(fireEvent.keyDown(corner, { key: 'ArrowRight', ...chord })).toBe(true)
      expect(document.activeElement).toBe(corner)
    }
  })

  it('ignores every input while it is locked', () => {
    const { dispatch, all } = paint(fixture(FIXTURE_ANSWER), true)
    for (const button of all()) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    fireEvent.keyDown(all()[0], { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('leaves the title, the hints and the win message to the shell', () => {
    const { view } = paint(fixture())
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(thermometers.title)
    expect(text).not.toContain(thermometers.tagline)
    for (const line of thermometers.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

describe('the picture on the card', () => {
  it('draws a real answer, with the numbers that count it', () => {
    expect(cluesOf(CARD.n, CARD.tubes, CARD.fill)).toEqual({
      rowClues: CARD.rowClues,
      colClues: CARD.colClues,
    })
    expect(countSolutions(CARD.n, CARD.tubes, CARD.rowClues, CARD.colClues, 3)).toBe(1)
    expect(solveByLogic(CARD.n, CARD.tubes, CARD.rowClues, CARD.colClues)?.fill).toEqual(CARD.fill)
    const state: ThermoState = {
      ...CARD,
      ...indexTubes(CARD.n, CARD.tubes),
    }
    expect(isSolved(state)).toBe(true)
    // Every bulb is in the bottom row, so every thermometer on the card fills
    // upwards — which is the one thing the picture has to say.
    for (const cells of CARD.tubes) expect(towardOf(CARD.n, cells)).toBe('north')
    // And the picture is drawn from this, so the two cannot drift apart: one
    // bulb a thermometer, and mercury in the bulb and the stem of each of the
    // two the answer fills.
    const card = render(createElement(ThermometersIcon)).container
    expect(card.querySelectorAll('circle')).toHaveLength(CARD.tubes.length)
    expect(card.querySelectorAll('[fill="var(--p-clay)"]')).toHaveLength(
      2 * CARD.fill.filter((level) => level > 0).length,
    )
  })
})

describe('the stylesheet', () => {
  // jsdom's URL is not node's, so take the directory off the module url by hand.
  const here = new URL(import.meta.url).pathname.replace(/[^/]+$/, '')
  const css = readFileSync(`${here}board.module.css`, 'utf8')
  const tokens = readFileSync(`${here}../../styles/tokens.css`, 'utf8')

  it('keeps a whole 44px square under a fingertip, hairline and all', () => {
    // board.module.css promises 44px of square to land on. The paper's ruling
    // is one --hair drawn inside the later square, and box-sizing is
    // border-box, so the button that fills the square is --cell less that
    // hairline. The three floors are five, six and seven across in that order.
    const hair = Number(/--hair: (\d+)px/.exec(tokens)?.[1])
    expect(hair).toBe(1)
    const floors = [...css.matchAll(/--cell: clamp\((\d+)px/g)].map((m) => Number(m[1]))
    expect(floors).toEqual([52, 48, 45])
    for (const floor of floors) expect(floor - hair).toBeGreaterThanOrEqual(44)
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(thermometers.id).toBe('thermometers')
    expect(thermometers.title).toBe('The thermometers')
    expect(thermometers.reseedable).toBe(true)
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['five-across', 'six-across', 'seven-across'])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(thermometers.instructions.length).toBeGreaterThanOrEqual(2)
    expect(thermometers.instructions.length).toBeLessThanOrEqual(4)
    for (const line of thermometers.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      // The longest hint the collection ships is 134 characters.
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(130)
    }
  })

  it('says in its own instructions all three things that a tap does', () => {
    // `describeMove` has three sentences — the mercury runs up, it comes back
    // down, and it goes away altogether — so "How to play" has to have three
    // facts, and one of them is how a mark is taken back.
    const how = thermometers.instructions.join(' ')
    expect(how).toContain('run the mercury up to it')
    expect(how).toContain('back down to it')
    expect(how).toContain('empty that thermometer')
  })

  it('never names a square that would give an answer away', () => {
    // Every board is dealt fresh, so a hint that named a square would be wrong
    // as often as it was right.
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('ramps by size, and asks for more counting as it goes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.par)).toEqual([4, 6, 9])
    const floors = levels.map((l) => l.config.minRounds)
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
    // And the step that takes real counting is asked for by name, so the harder
    // levels are not the easy one on a bigger grid. Five across is dealt
    // without that step and its three hints never teach it, so it is the one
    // level that may not ask for it either.
    expect(levels.map((l) => l.config.minNarrowings)).toEqual([0, 1, 9])
    expect(levels[0].config.maxNarrowings).toBe(0)
    for (const level of levels) {
      expect(level.config.maxNarrowings).toBeGreaterThanOrEqual(level.config.minNarrowings)
      expect(level.config.maxRounds).toBeGreaterThanOrEqual(level.config.minRounds)
    }
  })
})
