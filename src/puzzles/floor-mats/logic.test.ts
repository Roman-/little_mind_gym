import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { underSettings } from '../../test/settings'
import { cues } from '../../lib/motion'
import { makeRng, randInt, shuffled } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel, Rng } from '../../lib/types'
import { floorMats } from './index'
import { Board } from './Board'
import type { DealStats, Fault, Mark, Mat, MatsAction, MatsConfig, MatsState } from './logic'
import {
  FLAT,
  NONE,
  PLUS,
  STANDING,
  answers,
  areaOf,
  bare,
  candidatesFor,
  carveMarks,
  cellsOf,
  colOf,
  countSolutions,
  cutFloor,
  deal,
  describeFault,
  describeMove,
  faultOf,
  faults,
  fits,
  init,
  isSolved,
  keyOf,
  markWord,
  marksIn,
  matAt,
  newestFault,
  orient,
  ownerOf,
  parseFloor,
  rectBetween,
  reduce,
  refusalOf,
  rowOf,
  shapeOf,
  sizeWords,
  solveByLogic,
  stateKey,
  uncovered,
} from './logic'

const levels = floorMats.levels as PuzzleLevel<MatsConfig>[]
const SEEDS = Array.from({ length: 36 }, (_, i) => 1000 + i * 37)

/**
 * Dealt once and kept, because dealing is the dear thing in this file. `deal`
 * cuts a floor, carves its marks until it has one answer, and throws the pair
 * away when the floor asks for the wrong amount of thinking, so one floor costs
 * several cuts: the median is 9, 11 and 14 cuts a level, and a six-wide deal is
 * 25ms of CPU at the median and 266ms at its worst over six hundred seeds.
 * The 108 floors below come to 1.7 to 2.1 seconds of CPU on a machine with a
 * hundred other jobs on it, which is what the budget on `beforeAll` is sized
 * for. One deal on its own is held to a blink by a test in `the floor it
 * deals`.
 */
const dealt = new Map<string, MatsState>()
function start(level: PuzzleLevel<MatsConfig>, seed: number): MatsState {
  const key = `${level.id}:${seed}`
  const hit = dealt.get(key)
  if (hit) return hit
  const state = init(level, makeRng(seed))
  dealt.set(key, state)
  return state
}

/**
 * Every floor this file asks about, dealt up front and on one clock, so that
 * whichever test happens to run first is not the one that pays for all of them
 * and runs past vitest's 5s default on a busy machine.
 */
beforeAll(() => {
  for (const level of levels) for (const seed of SEEDS) start(level, seed)
}, 30_000)

/** The one way this floor can be covered, as one mat a mark. */
const answerFor = (state: MatsState): Mat[] =>
  (solveByLogic(state.n, state.marks) as { mats: Mat[] }).mats

/** Laying a mat is two corners: its top-left square and its bottom-right. */
const laying = (n: number, m: Mat): MatsAction => ({
  type: 'lay',
  a: m.r0 * n + m.c0,
  b: m.r1 * n + m.c1,
})

const solutionActions = (state: MatsState): MatsAction[] =>
  answerFor(state).map((m) => laying(state.n, m))

const play = (state: MatsState, actions: MatsAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** The squares of a floor that carry a mark. */
const markCells = (marks: Mark[]) => marks.map((_, i) => i).filter((i) => marks[i] !== NONE)

const rect = (r0: number, c0: number, r1: number, c1: number): Mat => ({ r0, c0, r1, c1 })

const sameMat = (a: Mat, b: Mat): boolean =>
  a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1

/**
 * Every rectangle on this floor that breaks no rule, less the one-square ones,
 * which the board cannot lay: a second tap on the marked corner lets go.
 */
function goodMats(state: MatsState): Mat[] {
  const { n } = state
  const out: Mat[] = []
  for (let r0 = 0; r0 < n; r0++) {
    for (let c0 = 0; c0 < n; c0++) {
      for (let r1 = r0; r1 < n; r1++) {
        for (let c1 = c0; c1 < n; c1++) {
          const m = rect(r0, c0, r1, c1)
          if (areaOf(m) > 1 && faultOf(state, m) === null) out.push(m)
        }
      }
    }
  }
  return out
}

afterEach(cleanup)

/* ============================================================
   The floor it deals
   ============================================================ */

describe('the floor it deals', () => {
  for (const level of levels) {
    const { n, mats, maxArea, minStuck, maxStuck, maxPairs, always } = level.config

    it(`"${level.label}" prints ${mats} marks of all three kinds, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.n).toBe(n)
        expect(state.marks).toHaveLength(n * n)
        const printed = markCells(state.marks).map((i) => state.marks[i])
        // The mark count is the level's par, and the shell prints par to a
        // child as a fact — so it is exact on every seed, not on average.
        expect(printed).toHaveLength(mats)
        expect(new Set(printed)).toEqual(new Set([PLUS, FLAT, STANDING]))
      }
    })

    it(`"${level.label}" has exactly one way to lay the mats, every seed`, () => {
      for (const seed of SEEDS) {
        // The plainest counter there is, capped at three, so the clever
        // solver agreeing with it means the clever one is not lying. Both
        // take their mats from `candidatesFor`, which `the solver` below holds
        // to every rectangle that `faultOf` passes, so they cannot share a
        // slip there. It knows nothing of the four-corner rule, and neither
        // does anything else.
        expect(countSolutions(n, start(level, seed).marks, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out from the board alone, inside the level’s window, every seed`, () => {
      for (const seed of SEEDS) {
        const { marks } = start(level, seed)
        // The fallbacks in `deal` are for a run of luck the tests have never
        // seen: every seed lands on a floor that suits the level.
        const reasoned = fits(level.config, marks)
        expect(reasoned).not.toBeNull()
        const { steps, stuck, pairs, mats: laid } = reasoned as NonNullable<typeof reasoned>
        expect(stuck).toBeGreaterThanOrEqual(minStuck)
        expect(stuck).toBeLessThanOrEqual(maxStuck)
        expect(pairs).toBeLessThanOrEqual(maxPairs)
        // The first mat is certain before any fact, so the first level's
        // second hint is true of every floor.
        expect(steps[0]).toBe('L')
        if (always === 'never') expect(steps).not.toContain('A')
        if (always === 'needed') {
          const plain = solveByLogic(n, marks, { always: false })
          expect(plain === null || plain.pairs > maxPairs).toBe(true)
        }
        for (const m of laid) {
          expect(areaOf(m)).toBeLessThanOrEqual(maxArea)
          expect(areaOf(m)).toBeGreaterThan(1)
        }
      }
    })

    it(`"${level.label}" starts bare, and is not already solved`, () => {
      const state = start(level, SEEDS[0])
      expect(state.mats).toHaveLength(0)
      expect(bare(state)).toBe(n * n)
      expect(uncovered(state)).toBe(mats)
      expect(isSolved(state)).toBe(false)
      expect(faults(state)).toHaveLength(0)
    })

    it(`"${level.label}" deals the same floor for the same seed, and another for another`, () => {
      expect(init(level, makeRng(SEEDS[1])).marks).toEqual(start(level, SEEDS[1]).marks)
      expect(start(level, SEEDS[1]).marks).not.toEqual(start(level, SEEDS[2]).marks)
    })
  }

  it('deals a floor for every level inside a blink', () => {
    // A deal happens with a child watching the page, so one of them is a blink
    // and not a wait. Two hundred seeds a level, timed one at a time —
    // `deal(makeRng(9000 + k * 13), config)` for k under 200 — came out at a
    // median of 1ms, 6ms and 26ms, four wide to six, and the slowest six-wide
    // deal of the two hundred took 215ms, at a load average of 124. Seed 4242
    // is a tail seed on purpose: it takes 14, 4 and 108 cuts, where the ninth
    // decile at six across is 49 to 52, and its six-wide deal took 170ms to
    // 278ms on the same machine. The bound is the 400ms that the quilt, the
    // garden cats and the kangaroo's hops hold their own deals to.
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at, level.id).toBeLessThan(400)
    }
  })

  it('falls back on a reasoned floor that keeps every hint true, when the window cannot be met', () => {
    for (const level of levels) {
      const { config } = level
      // A window nothing can meet, so all 400 cuts run and the first path
      // never returns: what comes back is the second path's floor.
      const stats: DealStats = { attempts: 0, fell: 'fit' }
      const marks = deal(makeRng(5), { ...config, minStuck: 99 }, stats)
      expect(stats.fell).toBe('reasoned')
      // Everything but the count of facts: the kinds, the sizes, the pair cap,
      // the always setting and the opening mat. So one answer, par marks, and
      // no hint that is false of it.
      expect(fits(config, marks, false)).not.toBeNull()
      expect(countSolutions(config.n, marks, 3)).toBe(1)
      expect(markCells(marks)).toHaveLength(level.par as number)
    }
  }, 20_000)

  it('falls back on its bank when no floor can be cut, and every bank floor fits its level', () => {
    for (const level of levels) {
      const { config } = level
      const stats: DealStats = { attempts: 0, fell: 'fit' }
      const marks = deal(makeRng(5), { ...config, maxArea: 0 }, stats)
      expect(stats.fell).toBe('bank')
      expect(config.bank.map((rows) => parseFloor(rows))).toContainEqual(marks)
      for (const rows of config.bank) {
        const floor = parseFloor(rows)
        expect(rows).toHaveLength(config.n)
        expect(fits(config, floor)).not.toBeNull()
        expect(countSolutions(config.n, floor, 3)).toBe(1)
      }
    }
  })

  it('keeps as its bank the floors that seeds 1 and 2 deal', () => {
    // So a bank floor is a floor the level really deals, with the steps it
    // really takes: LLLRR and LRLRL, LLLLRRLR and LLLRRRRR, LLRLRLLRRPR and
    // LLLLRRRRALR.
    const steps = [
      ['LLLRR', 'LRLRL'],
      ['LLLLRRLR', 'LLLRRRRR'],
      ['LLRLRLLRRPR', 'LLLLRRRRALR'],
    ]
    for (const [k, level] of levels.entries()) {
      level.config.bank.forEach((rows, b) => {
        expect(start(level, b + 1).marks).toEqual(parseFloor(rows))
        expect(fits(level.config, parseFloor(rows))?.steps).toBe(steps[k][b])
      })
    }
  })
})

/* ============================================================
   Reading the floor
   ============================================================ */

/**
 * A four-wide floor, the first level's first bank floor, so a test can say
 * which rule breaks rather than hunting for one. Its five mats: a flat line on
 * each of three strips of two — top left, top right, and the left of the
 * second row; a standing line on the block of three rows by two columns down
 * the right; and a plus on the two by two in the bottom left.
 *
 *   . - . -
 *   . - | .
 *   + . . .
 *   . . . .
 */
const HAND = parseFloor(['.-.-', '.-|.', '+...', '....'])
const HAND_ANSWER = [
  rect(0, 0, 0, 1),
  rect(0, 2, 0, 3),
  rect(1, 0, 1, 1),
  rect(1, 2, 3, 3),
  rect(2, 0, 3, 1),
]
const hand = (mats: Mat[] = []): MatsState => ({ n: 4, marks: HAND, mats })

describe('reading the floor', () => {
  it('bounds a rectangle from two corners, whichever way round they come', () => {
    expect(rectBetween(4, 0, 5)).toEqual(rect(0, 0, 1, 1))
    expect(rectBetween(4, 5, 0)).toEqual(rect(0, 0, 1, 1))
    expect(rectBetween(4, 3, 12)).toEqual(rect(0, 0, 3, 3))
    expect(rectBetween(4, 6, 6)).toEqual(rect(1, 2, 1, 2))
  })

  it('bounds nothing from a corner that is not a square of the floor', () => {
    expect(rectBetween(4, -1, 5)).toBeNull()
    expect(rectBetween(4, 0, 16)).toBeNull()
    expect(rectBetween(4, 1.5, 5)).toBeNull()
  })

  it('reads a mat’s shape the way the rules say it', () => {
    expect(shapeOf(rect(0, 0, 0, 0))).toBe(PLUS)
    expect(shapeOf(rect(0, 0, 1, 1))).toBe(PLUS)
    expect(shapeOf(rect(0, 0, 0, 2))).toBe(FLAT)
    expect(shapeOf(rect(0, 0, 1, 2))).toBe(FLAT)
    expect(shapeOf(rect(0, 0, 2, 0))).toBe(STANDING)
  })

  it('lists a rectangle’s squares and names it by its top-left one', () => {
    expect(areaOf(rect(1, 1, 2, 3))).toBe(6)
    expect(cellsOf(4, rect(1, 1, 2, 2))).toEqual([5, 6, 9, 10])
    expect(keyOf(4, rect(1, 1, 2, 2))).toBe('5')
  })

  it('says which mat lies on a square, and which squares are still bare', () => {
    const floor = hand([rect(0, 0, 0, 1), rect(0, 2, 1, 3)])
    expect(ownerOf(floor)).toEqual([0, 0, 1, 1, -1, -1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1])
    expect(matAt(floor, 1)).toBe(0)
    expect(matAt(floor, 7)).toBe(1)
    expect(matAt(floor, 8)).toBe(-1)
    expect(matAt(floor, 99)).toBe(-1)
    expect(bare(floor)).toBe(10)
    // The flat line at the top left, and the flat line and the standing line
    // under the second mat, are covered; the flat line at row 2 and the plus
    // are not.
    expect(uncovered(floor)).toBe(2)
    expect(marksIn(floor, rect(0, 0, 1, 3))).toEqual([FLAT, FLAT, FLAT, STANDING])
    expect(marksIn(floor, rect(3, 0, 3, 3))).toEqual([])
  })

  it('is the same position however the same mats were laid', () => {
    const one = hand([rect(0, 0, 0, 1), rect(0, 2, 1, 3)])
    const other = hand([rect(0, 2, 1, 3), rect(0, 0, 0, 1)])
    expect(stateKey(one)).toBe(stateKey(other))
    expect(stateKey(one)).not.toBe(stateKey(hand([rect(0, 0, 0, 1)])))
  })

  it('says every mark and every size in words, never in characters a screen reader spells out', () => {
    expect([NONE, PLUS, FLAT, STANDING].map((m) => markWord(m as Mark))).toEqual([
      'no mark',
      'a plus',
      'a flat line',
      'a standing line',
    ])
    expect(sizeWords(rect(0, 0, 0, 1))).toBe('2 squares wide and 1 square tall')
    expect(sizeWords(rect(0, 0, 2, 1))).toBe('2 squares wide and 3 squares tall')
  })
})

/* ============================================================
   The three rules
   ============================================================ */

describe('the three rules a mat can break', () => {
  const floor = hand()

  it('says nothing about a mat that holds one mark and has its shape', () => {
    for (const m of HAND_ANSWER) expect(faultOf(floor, m)).toBeNull()
  })

  it('names a mat with no mark on it', () => {
    const fault = faultOf(floor, rect(3, 2, 3, 3)) as Fault
    expect(fault.kind).toBe('empty')
    expect(fault.cells).toEqual([14, 15])
    expect(fault.blamed).toEqual([])
    expect(describeFault(fault)).toBe('This mat has no mark on it.')
  })

  it('names a mat with two marks on it, and blames both of them', () => {
    const fault = faultOf(floor, rect(0, 0, 0, 3)) as Fault
    expect(fault.kind).toBe('crowded')
    expect(fault.blamed).toEqual([1, 3])
    expect(describeFault(fault)).toBe('This mat has more than one mark on it.')
  })

  it('says what shape the mat is, then what its mark needs, for every mark', () => {
    const says = (m: Mat) => {
      const fault = faultOf(floor, m) as Fault
      expect(fault.kind).toBe('shape')
      expect(fault.blamed).toHaveLength(1)
      return describeFault(fault)
    }
    // The plus, on a mat stood up and on a mat laid flat.
    expect(says(rect(2, 0, 3, 0))).toBe(
      'This mat is taller than it is wide. A plus needs a square mat.',
    )
    expect(says(rect(2, 0, 2, 1))).toBe(
      'This mat is wider than it is tall. A plus needs a square mat.',
    )
    // The flat line in the top right corner, stood up, and alone on one square.
    expect(says(rect(0, 3, 1, 3))).toBe(
      'This mat is taller than it is wide. A flat line needs a mat that is wider than it is tall.',
    )
    expect(says(rect(0, 3, 0, 3))).toBe(
      'This mat is a square. A flat line needs a mat that is wider than it is tall.',
    )
    // The standing line, laid flat.
    expect(says(rect(1, 2, 1, 3))).toBe(
      'This mat is wider than it is tall. A standing line needs a mat that is taller than it is wide.',
    )
  })

  it('flags every mat at fault and no mat that is behaving', () => {
    const found = faults(hand([rect(0, 0, 0, 1), rect(3, 2, 3, 3), rect(2, 0, 3, 1)]))
    expect(found[0]).toBeNull()
    expect((found[1] as Fault).kind).toBe('empty')
    expect(found[2]).toBeNull()
  })

  it('names the newest mat that breaks a rule, from the floor alone', () => {
    const one = reduce(floor, { type: 'lay', a: 3, b: 7 })
    expect(describeFault(newestFault(one) as Fault)).toBe(
      'This mat is taller than it is wide. A flat line needs a mat that is wider than it is tall.',
    )
    const two = reduce(one, { type: 'lay', a: 14, b: 15 })
    expect(describeFault(newestFault(two) as Fault)).toBe('This mat has no mark on it.')
    // A good mat on top changes nothing: it is the newest *broken* mat.
    const three = reduce(two, laying(4, rect(2, 0, 3, 1)))
    expect(describeFault(newestFault(three) as Fault)).toBe('This mat has no mark on it.')
    // Lift the empty mat, and the sentence is about the one still down.
    const back = reduce(three, { type: 'lift', cell: 15 })
    expect(describeFault(newestFault(back) as Fault)).toBe(
      'This mat is taller than it is wide. A flat line needs a mat that is wider than it is tall.',
    )
    expect(newestFault(reduce(back, { type: 'lift', cell: 3 }))).toBeNull()
  })
})

/* ============================================================
   reduce
   ============================================================ */

describe('reduce', () => {
  const floor = hand()

  it('lays a mat, and lifts the whole of it from any of its squares', () => {
    const down = reduce(floor, { type: 'lay', a: 11, b: 6 })
    expect(down).not.toBe(floor)
    expect(down.mats).toEqual([rect(1, 2, 2, 3)])
    expect(down.marks).toBe(floor.marks)
    for (const cell of [6, 7, 10, 11]) {
      const up = reduce(down, { type: 'lift', cell })
      expect(up.mats).toHaveLength(0)
      expect(up.marks).toBe(floor.marks)
    }
  })

  it('hands back the very same state for an action that is not one', () => {
    const down = reduce(floor, { type: 'lay', a: 0, b: 1 })
    for (const state of [floor, down]) {
      expect(reduce(state, { type: 'lay', a: -1, b: 5 })).toBe(state)
      expect(reduce(state, { type: 'lay', a: 4, b: 16 })).toBe(state)
      expect(reduce(state, { type: 'lay', a: 1.5, b: 5 })).toBe(state)
      for (const cell of [-1, 16, 99, 1.5, 12, 15]) {
        expect(reduce(state, { type: 'lift', cell })).toBe(state)
      }
      expect(reduce(state, { type: 'nudge' } as unknown as MatsAction)).toBe(state)
      // Both corners on one square is a change of mind, not a mat — on every
      // square, marked or not, bare or under a mat.
      for (let cell = 0; cell < 16; cell++) {
        expect(reduce(state, { type: 'lay', a: cell, b: cell })).toBe(state)
      }
    }
  })

  it('will not lay a mat across a mat already down', () => {
    const down = reduce(floor, { type: 'lay', a: 0, b: 1 })
    expect(reduce(down, { type: 'lay', a: 1, b: 6 })).toBe(down)
    expect(reduce(down, { type: 'lay', a: 0, b: 15 })).toBe(down)
    expect(reduce(down, { type: 'lay', a: 4, b: 0 })).toBe(down)
    // And the squares beside it still take a mat.
    expect(reduce(down, { type: 'lay', a: 2, b: 3 })).not.toBe(down)
  })

  /**
   * The one thing this puzzle would lose if anybody tidied `reduce` up. All
   * three of these land, so the board can draw them, ring them in clay and say
   * what is wrong — and so one tap lifts them.
   */
  it('lets a mat that breaks a rule land, all three ways', () => {
    for (const wrong of [
      { type: 'lay', a: 14, b: 15 } as MatsAction, // no mark on it
      { type: 'lay', a: 0, b: 3 } as MatsAction, // two marks on it
      { type: 'lay', a: 8, b: 12 } as MatsAction, // a plus on a mat taller than it is wide
    ]) {
      const next = reduce(floor, wrong)
      expect(next).not.toBe(floor)
      expect(next.mats).toHaveLength(1)
      expect(faultOf(next, next.mats[0])).not.toBeNull()
      expect(isSolved(next)).toBe(false)
    }
  })

  it('adds or takes away exactly one mat, and never more, over a long random walk', () => {
    // The whole of the lower bound on par, in two halves. From a start of no
    // mats, one dispatched action moves the count by one; and a solved floor
    // has exactly one mat a mark. So a floor with k marks cannot be finished
    // in fewer than k moves.
    //
    // A walk of nothing but random corners never finishes a floor — this one
    // did not, once, in 4,000 actions — so the second half would be an
    // assertion that never runs. One action in seven or so is one of the
    // answer's own mats that is not down yet, which is enough for the walk to
    // come out, fall apart again and come out again.
    const rng = makeRng(99)
    const level = levels[1]
    let state = start(level, 7)
    const answer = answerFor(state)
    let moved = 0
    let solvedSeen = 0
    for (let step = 0; step < 4000; step++) {
      const size = state.n * state.n
      const roll = rng()
      let action: MatsAction
      if (roll < 0.15) {
        const missing = answer.filter((m) => !state.mats.some((down) => sameMat(down, m)))
        if (missing.length === 0) continue
        action = laying(state.n, missing[randInt(rng, missing.length)])
      } else if (roll < 0.4) {
        action = { type: 'lift', cell: randInt(rng, size) }
      } else {
        action = { type: 'lay', a: randInt(rng, size), b: randInt(rng, size) }
      }
      const next = reduce(state, action)
      if (next === state) continue
      moved++
      expect(Math.abs(next.mats.length - state.mats.length)).toBe(1)
      if (isSolved(next)) {
        solvedSeen++
        expect(next.mats).toHaveLength(level.par as number)
      }
      state = next
    }
    // The walk has to have done something, or it proves nothing. Pinned: 1,001
    // of the 4,000 actions are taken, the floor comes out 14 times along the
    // way, and the walk ends with seven mats down.
    expect(moved).toBe(1001)
    expect(solvedSeen).toBe(14)
    expect(state.mats).toHaveLength(7)
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
        expect(done.mats).toHaveLength(level.par as number)
        expect(isSolved(done)).toBe(true)
        expect(faults(done).some(Boolean)).toBe(false)
        expect(uncovered(done)).toBe(0)
        expect(bare(done)).toBe(0)
      }
    })
  }

  it('comes out whatever order the mats are laid in', () => {
    const first = start(levels[0], SEEDS[3])
    const backwards = solutionActions(first).reverse()
    expect(isSolved(play(first, backwards))).toBe(true)
    const reversed = [...HAND_ANSWER].reverse().map((m) => laying(4, m))
    expect(isSolved(play(hand(), reversed))).toBe(true)
  })

  it('is not solved one mat short', () => {
    const first = start(levels[0], SEEDS[5])
    const short = play(first, solutionActions(first).slice(0, -1))
    expect(faults(short).some(Boolean)).toBe(false)
    expect(bare(short)).toBeGreaterThan(0)
    expect(isSolved(short)).toBe(false)
  })

  it('is not solved when the whole floor is covered but a mat breaks a rule', () => {
    // Four two-by-twos: two of them hold two marks each, one is the plus's own
    // mat, and the last holds nothing at all.
    const full = hand([rect(0, 0, 1, 1), rect(0, 2, 1, 3), rect(2, 0, 3, 1), rect(2, 2, 3, 3)])
    expect(bare(full)).toBe(0)
    expect(faults(full).map((f) => f?.kind ?? null)).toEqual(['crowded', 'crowded', null, 'empty'])
    expect(isSolved(full)).toBe(false)
  })

  it('is not solved when every mark has a good mat and squares are still bare', () => {
    // A shape does not fix a size. Every mark here sits on a mat of its own
    // shape, and four squares are left over: the standing line took a mat of
    // two where the answer gives it six.
    const short = hand([
      rect(0, 0, 0, 1),
      rect(0, 2, 0, 3),
      rect(1, 0, 1, 1),
      rect(1, 2, 2, 2),
      rect(2, 0, 3, 1),
    ])
    expect(uncovered(short)).toBe(0)
    expect(bare(short)).toBe(4)
    expect(faults(short).some(Boolean)).toBe(false)
    expect(isSolved(short)).toBe(false)
  })
})

/* ============================================================
   The refusal
   ============================================================ */

describe('the one move it refuses', () => {
  const down = reduce(hand(), { type: 'lay', a: 0, b: 1 })

  it('says nothing about a rectangle that crosses nothing, or about one square', () => {
    expect(refusalOf(down, 2, 7)).toBeNull()
    expect(refusalOf(down, 4, 4)).toBeNull()
    expect(refusalOf(down, 0, 0)).toBeNull()
    expect(refusalOf(down, 4, 99)).toBeNull()
  })

  it('names the mat that is in the way, and moves nothing', () => {
    const no = refusalOf(down, 1, 6)
    expect(no).not.toBeNull()
    const { message, pretend, where } = no as NonNullable<typeof no>
    expect(message).toBe('A mat is already lying there.')
    // A mat cannot be laid through another one, so nothing can even pretend to
    // move — which is what makes `useRefusal` shake the mat in the way rather
    // than draw a position that never existed.
    expect(pretend).toBe(down)
    expect(where).toBe(keyOf(4, down.mats[0]))
  })

  it('fires exactly when reduce hands the same state back', () => {
    for (const level of levels) {
      const first = start(level, SEEDS[8])
      const some = play(first, solutionActions(first).slice(0, 3))
      const size = some.n * some.n
      for (let a = 0; a < size; a++) {
        for (let b = 0; b < size; b++) {
          if (a === b) continue
          const refused = refusalOf(some, a, b) !== null
          expect(refused).toBe(reduce(some, { type: 'lay', a, b }) === some)
        }
      }
    }
  })
})

/* ============================================================
   describe
   ============================================================ */

describe('describe', () => {
  it('names the mat by its size and where it lies, in the past tense, both ways', () => {
    const floor = hand()
    const action: MatsAction = { type: 'lay', a: 1, b: 0 }
    const down = reduce(floor, action)
    expect(describeMove(floor, down, action)).toBe(
      'Laid a mat 2 squares wide and 1 square tall at row 1, column 1',
    )
    const up: MatsAction = { type: 'lift', cell: 1 }
    expect(describeMove(down, reduce(down, up), up)).toBe(
      'Lifted the mat 2 squares wide and 1 square tall at row 1, column 1',
    )
  })

  it('names the mat the move actually changed, over a whole solution', () => {
    const state = start(levels[1], SEEDS[4])
    let cur = state
    for (const action of solutionActions(state)) {
      const next = reduce(cur, action)
      const m = next.mats[next.mats.length - 1]
      expect(describeMove(cur, next, action)).toBe(
        `Laid a mat ${sizeWords(m)} at row ${m.r0 + 1}, column ${m.c0 + 1}`,
      )
      cur = next
    }
  })
})

/* ============================================================
   par
   ============================================================ */

/**
 * The moves worth searching: every good mat that still fits, and one lift for
 * every mat already down.
 *
 * A mat that breaks a rule is never on a shortest path, because `isSolved`
 * will not have it, so it has to be lifted again — which costs two more moves
 * than not laying it. Delete a bad lay and its matching lift from any solution
 * and what is left is a solution of the same length or shorter, so leaving
 * them out cannot hide a shorter path. That is the chocolate bar's argument,
 * word for word.
 *
 * There is no `invalid` here, unlike on the chocolate bar: these moves only
 * ever lay good mats, so it could prune nothing, and it cost 15% to 40% more.
 */
function tidyMoves(state: MatsState, good: Mat[]): MatsAction[] {
  const owner = ownerOf(state)
  const out: MatsAction[] = []
  for (const m of good) {
    const cells = cellsOf(state.n, m)
    if (cells.some((cell) => owner[cell] !== -1)) continue
    out.push({ type: 'lay', a: cells[0], b: cells[cells.length - 1] })
  }
  for (const m of state.mats) out.push({ type: 'lift', cell: m.r0 * state.n + m.c0 })
  return out
}

function shortest(state: MatsState): MatsAction[] | null {
  const good = goodMats(state)
  return shortestSolution<MatsState, MatsAction>({
    start: state,
    moves: (s) => tidyMoves(s, good),
    apply: reduce,
    key: stateKey,
    solved: isSolved,
    maxStates: 100_000,
  })
}

describe('par', () => {
  it('is one move a mat, on every level', () => {
    for (const level of levels) expect(level.par).toBe(level.config.mats)
  })

  /**
   * At most 384 positions a floor at four across, over all thirty-six seeds,
   * and 6,768, 7,008 and 1,830 on the three five-wide floors below. On seeds 5
   * and 61 the five-wide search costs 0.31 of the chocolate bar's own six-wide
   * search test, run in the same process.
   */
  it('is exactly the shortest path on "Five mats", by breadth-first search, every seed', () => {
    for (const seed of SEEDS) {
      const path = shortest(start(levels[0], seed))
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[0].par as number)
    }
  }, 30_000)

  it('is exactly the shortest path on "Eight mats", by breadth-first search', () => {
    for (const seed of [5, 61, 777]) {
      const path = shortest(init(levels[1], makeRng(seed)))
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[1].par as number)
    }
  }, 30_000)

  /**
   * The six-wide floor is not searched, and `maxStates` is not raised to make
   * it searchable: its reachable positions ran past the search's 200,000 cap on
   * seven of twelve seeds tried, so the run would throw and the failure would
   * look like a bug in the key.
   *
   * Its par rests on the same two facts the search confirms on the other two
   * levels. The first is tested here, on every floor the file deals: the
   * answer's mats are pairwise disjoint and none is one square, so eleven
   * moves is reachable without a refusal. The second is tested above, in the
   * random walk under `reduce`: one action changes the mat count by exactly
   * one from a start of none, and a solved floor holds one mat a mark, so
   * nothing shorter is.
   */
  it('is reachable on "Eleven mats", and nothing shorter can be, on every seed', () => {
    const level = levels[2]
    for (const seed of SEEDS) {
      const first = start(level, seed)
      expect(answerFor(first)).toHaveLength(level.par as number)
      let cur = first
      for (const action of solutionActions(first)) {
        const next = reduce(cur, action)
        // No refusal along the way, and no mat of one square to let go of.
        expect(next).not.toBe(cur)
        expect(faultOf(next, next.mats[next.mats.length - 1])).toBeNull()
        cur = next
      }
      expect(isSolved(cur)).toBe(true)
      expect(cur.mats).toHaveLength(level.par as number)
    }
  })
})

/* ============================================================
   No dead ends
   ============================================================ */

describe('no dead ends', () => {
  it('has no failure and no canStillWin, and needs neither', () => {
    /**
     * A mat in the wrong place is not a dead end — it is lifted, not stepped
     * back from — so there is deliberately no failure().
     *
     * The one that would be worth writing says "some mark has no mat left, or
     * some bare square has no mark that can reach it", and it fires at once on
     * 487 of 559 (87%), 923 of 1,040 (89%) and 1,807 of 2,216 (82%) of the
     * good but wrong first mats a child can lay, over sixty floors a level.
     * `PuzzlePage.tsx` locks the board the moment `failure` is non-null, so
     * that check would be an answer key, one tap at a time. It is the
     * chocolate bar's 75% to 92%, found again.
     */
    expect(floorMats.engine.failure).toBeUndefined()
    expect(floorMats.engine.canStillWin).toBeUndefined()
  })

  it('can still be won from every position a player can reach', () => {
    // Every move undoes — a lay by a lift, a lift by the same lay — so the
    // floor can always be cleared and the answer laid. Walk it: lays from
    // random corners, so the walk takes in broken mats and one-square changes
    // of mind, and lifts from random squares; then from every position the
    // walk accepts, clear the floor, lay the answer, and see it come out.
    const taken: number[] = []
    for (const level of levels) {
      const rng = makeRng(99)
      let state = start(level, SEEDS[0])
      const { n } = state
      const answer = solutionActions(state)
      let accepted = 0
      for (let step = 0; step < 4000; step++) {
        const action: MatsAction =
          rng() < 0.6
            ? { type: 'lay', a: randInt(rng, n * n), b: randInt(rng, n * n) }
            : { type: 'lift', cell: randInt(rng, n * n) }
        const next = reduce(state, action)
        if (next === state) continue
        state = next
        accepted++
        const cleared = play(
          state,
          state.mats.map((m) => ({ type: 'lift', cell: m.r0 * n + m.c0 }) as MatsAction),
        )
        expect(cleared.mats).toHaveLength(0)
        const won = play(cleared, answer)
        expect(isSolved(won)).toBe(true)
        expect(won.mats).toHaveLength(level.par as number)
      }
      taken.push(accepted)
    }
    // Pinned, so a walk that quietly stopped moving would fail here: over a
    // thousand positions a level, each one cleared and won from.
    expect(taken).toEqual([1216, 1143, 1068])
  })
})

/* ============================================================
   The solver
   ============================================================ */

/**
 * An outside opinion on the working, from the house review of this puzzle:
 * a walker that reads the floor alone before every mat, as `solveByLogic`
 * does, but searches chains of up to three facts rather than stopping at two,
 * and counts how deep each sticking point goes. It is the review's own code,
 * renamed and laid out the house way, with one change: it uses the always fact
 * only where the level does. Over three hundred deals a level it agreed with
 * `solveByLogic` on 900 floors of 900: 2.0, 4.1 and 6.0 facts a floor, no
 * two-fact step below the last level, at most one there, and never three.
 */
interface WalkShape {
  mat: Mat
  cells: number[]
}
interface WalkFact {
  kind: 'R' | 'A'
  mark: number
  cell: number
}

function walkFacts(
  n: number,
  owner: number[],
  laid: boolean[],
  shapes: WalkShape[][],
  always: boolean,
): WalkFact[] {
  const k = shapes.length
  const out: WalkFact[] = []
  for (let cell = 0; cell < n * n; cell++) {
    if (owner[cell] !== -1) continue
    const reach: number[] = []
    for (let j = 0; j < k && reach.length < 2; j++) {
      if (!laid[j] && shapes[j].some((s) => s.cells.includes(cell))) reach.push(j)
    }
    if (reach.length === 1 && shapes[reach[0]].some((s) => !s.cells.includes(cell))) {
      out.push({ kind: 'R', mark: reach[0], cell })
    }
  }
  if (always) {
    for (let j = 0; j < k; j++) {
      if (laid[j] || shapes[j].length === 0) continue
      for (const cell of shapes[j][0].cells) {
        if (!shapes[j].every((s) => s.cells.includes(cell))) continue
        if (shapes.some((s, m) => m !== j && !laid[m] && s.some((sh) => sh.cells.includes(cell)))) {
          out.push({ kind: 'A', mark: j, cell })
        }
      }
    }
  }
  return out
}

const walkApply = (f: WalkFact, laid: boolean[], from: WalkShape[][]) =>
  from.map((s, m) => {
    if (laid[m]) return s
    if (f.kind === 'R') return m === f.mark ? s.filter((sh) => sh.cells.includes(f.cell)) : s
    return m === f.mark ? s : s.filter((sh) => !sh.cells.includes(f.cell))
  })

function walkOpen(
  n: number,
  owner: number[],
  laid: boolean[],
  shapes: WalkShape[][],
  maxDepth: number,
  always: boolean,
): [number, number, WalkShape | null] {
  let frontier: WalkShape[][][] = [shapes]
  for (let d = 1; d <= maxDepth; d++) {
    const next: WalkShape[][][] = []
    const seen = new Set<string>()
    for (const sh of frontier) {
      for (const f of walkFacts(n, owner, laid, sh, always)) {
        const after = walkApply(f, laid, sh)
        const m = after.findIndex((s, q) => !laid[q] && s.length === 1)
        if (m >= 0) return [d, m, after[m][0]]
        const key = after.map((s) => s.length).join(',')
        if (!seen.has(key) && next.length < 4000) {
          seen.add(key)
          next.push(after)
        }
      }
    }
    frontier = next
    if (!frontier.length) break
  }
  return [Infinity, -1, null]
}

/** How many facts each sticking point needed, in the order they came; null if it never finished. */
function boardOnlyDepths(
  n: number,
  marks: Mark[],
  maxDepth: number,
  always: boolean,
): number[] | null {
  const spots = markCells(marks)
  const all = spots.map((p) =>
    candidatesFor(n, marks, p).map((mat) => ({ mat, cells: cellsOf(n, mat) })),
  )
  const owner = new Array<number>(n * n).fill(-1)
  const laid = new Array<boolean>(spots.length).fill(false)
  const depths: number[] = []
  while (!laid.every(Boolean)) {
    const shapes = all.map((s, j) =>
      laid[j] ? s : s.filter((sh) => sh.cells.every((c) => owner[c] === -1)),
    )
    let j = shapes.findIndex((s, m) => !laid[m] && s.length === 1)
    let pick: WalkShape | null = j >= 0 ? shapes[j][0] : null
    if (!pick) {
      const [d, m, sh] = walkOpen(n, owner, laid, shapes, maxDepth, always)
      if (!sh) return null
      depths.push(d)
      j = m
      pick = sh
    }
    laid[j] = true
    for (const c of pick.cells) owner[c] = j
  }
  return depths
}

/** A cut with one random mark in each mat, and no carve: a raw draw, which often has two answers. */
function rawDraw(rng: Rng, config: MatsConfig): Mark[] | null {
  const cut = cutFloor(rng, config.n, config.mats, config.maxArea, config.maxSingles)
  if (cut === null) return null
  const marks = new Array<Mark>(config.n * config.n).fill(NONE)
  for (const m of cut) {
    const cells = cellsOf(config.n, m)
    marks[cells[randInt(rng, cells.length)]] = shapeOf(m)
  }
  return marks
}

describe('the solver', () => {
  it('finds the answer the floor was cut round, and it is the only one', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 12)) {
        const state = start(level, seed)
        const answer = answerFor(state)
        expect(answer).toHaveLength(level.config.mats)
        expect(countSolutions(state.n, state.marks, 2)).toBe(1)
        // It really is a cover of the whole floor: disjoint, and nothing left over.
        const covered = answer.flatMap((m) => cellsOf(state.n, m))
        expect(covered).toHaveLength(state.n * state.n)
        expect(new Set(covered).size).toBe(state.n * state.n)
        for (const m of answer) expect(faultOf(state, m)).toBeNull()
      }
    }
  })

  it('counts the answers the carve works from exactly as the plain counter does', () => {
    const rng = makeRng(808)
    let twice = 0
    for (const level of levels.slice(0, 2)) {
      for (let k = 0; k < 40; k++) {
        const marks = rawDraw(rng, level.config)
        if (marks === null) continue
        const found = answers(level.config.n, marks, 3)
        expect(found.length).toBe(countSolutions(level.config.n, marks, 3))
        if (found.length > 1) twice++
        // And each one it hands back really is a way to cover the floor. Put
        // down whole rather than laid through `reduce`: a second answer to a
        // raw draw can hold a plus on one square — four of these eighty do —
        // which the words allow and the board lets go of instead of laying.
        for (const cover of found) {
          expect(isSolved({ n: level.config.n, marks, mats: cover })).toBe(true)
        }
      }
    }
    // Pinned: 63 of the 80 raw draws have more than one answer, so the two
    // counters are held to each other where they have something to disagree
    // about, not only on floors with one answer.
    expect(twice).toBe(63)
    for (const level of levels) {
      for (const seed of SEEDS) {
        const { n, marks } = start(level, seed)
        expect(answers(n, marks, 3)).toHaveLength(1)
      }
    }
  }, 20_000)

  /**
   * The claim the whole generator rests on: a floor the solver can finish is a
   * floor with one answer. Raw draws are mostly not like that, which is what
   * makes them worth testing against.
   */
  it('never finishes a floor that has two answers', () => {
    const rng = makeRng(2024)
    const config = levels[1].config
    let loose = 0
    let checked = 0
    while (checked < 150) {
      const marks = rawDraw(rng, config)
      if (marks === null) continue
      checked++
      if (countSolutions(config.n, marks, 2) > 1) {
        loose++
        expect(solveByLogic(config.n, marks)).toBeNull()
      } else if (solveByLogic(config.n, marks) !== null) {
        expect(countSolutions(config.n, marks, 2)).toBe(1)
      }
    }
    // Pinned: 145 of the 150 raw five-wide draws have a second answer, so the
    // filter is doing nearly all the work rather than agreeing with floors
    // that were fine already. It moves if `cutFloor` draws its rng differently.
    expect(loose).toBe(145)
  }, 20_000)

  it('gives up rather than guessing', () => {
    // Two standing lines in the top corners of a three-wide floor. Both mats
    // run the whole height, one of them has to take the middle column as
    // well, and nothing on the floor says which.
    const floor = parseFloor(['|.|', '...', '...'])
    expect(countSolutions(3, floor, 3)).toBe(2)
    expect(solveByLogic(3, floor)).toBeNull()
  })

  it('gives up on a floor that has no answer at all', () => {
    // Two plusses on the top row, each a square of one, and nothing that can
    // reach the bottom row. Every mark has a mat and squares are bare.
    const floor = parseFloor(['++', '..'])
    expect(countSolutions(2, floor, 3)).toBe(0)
    expect(solveByLogic(2, floor)).toBeNull()
  })

  it('reads each mat off the board alone', () => {
    const reasoned = solveByLogic(4, HAND, { always: false })
    expect(reasoned).not.toBeNull()
    const { mats, steps, stuck, pairs } = reasoned as NonNullable<typeof reasoned>
    expect(steps).toBe('LLLRR')
    expect(stuck).toBe(2)
    expect(pairs).toBe(0)
    expect(mats).toEqual(HAND_ANSWER)
    // What each mark could have before a mat is down. The plus's two include
    // its one-square mat: the words allow it, so the solver counts it.
    expect(markCells(HAND).map((p) => `${p}:${candidatesFor(4, HAND, p).length}`)).toEqual([
      '1:3',
      '3:1',
      '5:1',
      '6:6',
      '8:2',
    ])
    for (const p of markCells(HAND)) {
      for (const m of candidatesFor(4, HAND, p)) {
        expect(cellsOf(4, m)).toContain(p)
        expect(faultOf(hand(), m)).toBeNull()
      }
    }
  })

  it('lists every mat a mark could have, and no other, on every floor the file deals', () => {
    // `candidatesFor` is where the solver, `answers` and `countSolutions` all
    // get their mats, so those three agreeing with each other proves nothing
    // about it. Held here to the plainest list there is: every rectangle on the
    // floor, one square included, that covers the mark and that `faultOf` —
    // the rule the board rings in clay — finds nothing wrong with.
    const name = (m: Mat) => `${m.r0},${m.c0},${m.r1},${m.c1}`
    let listed = 0
    for (const level of levels) {
      for (const seed of SEEDS) {
        const floor = start(level, seed)
        const { n, marks } = floor
        for (const p of markCells(marks)) {
          const plain: string[] = []
          for (let r0 = 0; r0 < n; r0++) {
            for (let c0 = 0; c0 < n; c0++) {
              for (let r1 = r0; r1 < n; r1++) {
                for (let c1 = c0; c1 < n; c1++) {
                  const m = rect(r0, c0, r1, c1)
                  if (cellsOf(n, m).includes(p) && faultOf(floor, m) === null) plain.push(name(m))
                }
              }
            }
          }
          const fast = candidatesFor(n, marks, p).map(name)
          expect(fast.sort()).toEqual(plain.sort())
          listed += fast.length
        }
      }
    }
    // Pinned, so a list that quietly came back empty on both sides would fail:
    // 3,286 mats over the 108 floors, one-square mats for a plus among them.
    expect(listed).toBe(3286)
  })

  it('agrees with an outside board-only walker on every sticking point', () => {
    // 900 of 900 floors agreed when this was measured over three hundred deals
    // a level; these are the 108 the file already has.
    for (const level of levels) {
      const always = level.config.always !== 'never'
      for (const seed of SEEDS) {
        const { n, marks } = start(level, seed)
        const depths = boardOnlyDepths(n, marks, 3, always)
        expect(depths).not.toBeNull()
        const found = depths as number[]
        const reasoned = fits(level.config, marks) as NonNullable<ReturnType<typeof fits>>
        expect(found).toHaveLength(reasoned.stuck)
        expect(found.filter((d) => d === 2)).toHaveLength(reasoned.pairs)
        expect(found.filter((d) => d > 2)).toHaveLength(0)
      }
    }
  }, 20_000)
})

/* ============================================================
   Cutting a floor
   ============================================================ */

describe('cutting a floor', () => {
  it('always hands back the number of mats it was asked for', () => {
    const rng = makeRng(31337)
    const cuts: number[] = []
    for (const level of levels) {
      const { n, mats, maxArea, maxSingles } = level.config
      let cut = 0
      for (let k = 0; k < 60; k++) {
        const found = cutFloor(rng, n, mats, maxArea, maxSingles)
        if (found === null) continue
        cut++
        // Exactly the count asked for, no square covered twice, none left
        // out, and no mat bigger than the level allows or of one square.
        expect(found).toHaveLength(mats)
        const cells = found.flatMap((m) => cellsOf(n, m))
        expect(cells).toHaveLength(n * n)
        expect(new Set(cells).size).toBe(n * n)
        for (const m of found) {
          expect(areaOf(m)).toBeGreaterThan(1)
          expect(areaOf(m)).toBeLessThanOrEqual(maxArea)
        }
      }
      cuts.push(cut)
    }
    // It gives up on a bad start rather than backtracking forever, and the
    // caller draws another: pinned, it gives up on none of the sixty four-wide
    // draws, one five-wide and three six-wide.
    expect(cuts).toEqual([60, 59, 57])
  })

  it('keeps the cover whichever way it turns the floor, and a quarter turn swaps flat and standing', () => {
    const count = (cut: Mat[], mark: Mark) => cut.filter((m) => shapeOf(m) === mark).length
    for (let t = 0; t < 8; t++) {
      // An rng that always says t/8, so `orient` takes symmetry t.
      const turned = orient(() => (t + 0.5) / 8, 4, HAND_ANSWER)
      const cells = turned.flatMap((m) => cellsOf(4, m))
      expect(new Set(cells).size).toBe(16)
      expect(cells).toHaveLength(16)
      // Symmetries 1, 3, 5 and 7 swap rows for columns.
      const swaps = (t & 1) === 1
      expect(count(turned, FLAT)).toBe(count(HAND_ANSWER, swaps ? STANDING : FLAT))
      expect(count(turned, STANDING)).toBe(count(HAND_ANSWER, swaps ? FLAT : STANDING))
      expect(count(turned, PLUS)).toBe(count(HAND_ANSWER, PLUS))
    }
  })

  it('carves one mark of the right shape into every mat, and nowhere else', () => {
    const rng = makeRng(4242)
    let carved = 0
    for (const level of levels) {
      const { n, mats, maxArea, maxSingles } = level.config
      for (let k = 0; k < 12; k++) {
        const cut = cutFloor(rng, n, mats, maxArea, maxSingles)
        if (cut === null) continue
        const marks = carveMarks(rng, n, cut, 30)
        if (marks === null) continue
        carved++
        expect(markCells(marks)).toHaveLength(mats)
        for (const m of cut) {
          const inside = cellsOf(n, m).filter((cell) => marks[cell] !== NONE)
          expect(inside).toHaveLength(1)
          expect(marks[inside[0]]).toBe(shapeOf(m))
        }
        // And the cut is the only way to cover what it carved.
        expect(answers(n, marks, 2)).toHaveLength(1)
      }
    }
    // Pinned: 13 of the 36 draws carve down to one answer inside thirty moves.
    // The rest come back null, and `deal` would draw again.
    expect(carved).toBe(13)
  })

  it('turns a floor down for the right reasons', () => {
    // Four floors, each of them wrong for the first level in exactly one way,
    // and each shown passing once that one thing is out of the way — so a
    // floor turned down for some other reason would fail here. The first three
    // were found by cutting and carving four-wide floors from `makeRng(1)`.
    const config = levels[0].config

    // Six marks. It is a good floor for a level of six mats, and it has one
    // answer, but this level's par is five.
    const six = parseFloor(['.-+.', '||..', '....', '.-.+'])
    expect(fits(config, six)).toBeNull()
    expect(fits({ ...config, mats: 6 }, six)?.steps).toBe('LLRRLL')

    // A flat line and a standing line, and no plus. Everything else holds: one
    // answer, reasoned out in the level's two facts, from a first mat that is
    // certain, with no mat bigger than six squares or of one.
    const noPlus = parseFloor(['...-', '.|.-', '.-..', '|...'])
    expect(fits(config, noPlus)).toBeNull()
    expect(countSolutions(4, noPlus, 3)).toBe(1)
    const plain = solveByLogic(4, noPlus, { always: false })
    expect(plain?.steps).toBe('LLLRR')
    for (const m of plain?.mats ?? []) {
      expect(areaOf(m)).toBeGreaterThan(1)
      expect(areaOf(m)).toBeLessThanOrEqual(config.maxArea)
    }

    // Four facts where the level asks for two. The fallback in `deal`, which
    // asks everything but the count of facts, takes it.
    const tooHard = parseFloor(['-...', '.|-.', '..+.', '|...'])
    expect(fits(config, tooHard)).toBeNull()
    expect(fits(config, tooHard, false)?.steps).toBe('LRRRR')

    // The first bank floor padded out to twenty-five squares: the right marks
    // on a floor of the wrong size. Unpadded, it is the level's own.
    expect(fits(config, [...HAND, ...new Array<Mark>(9).fill(NONE)])).toBeNull()
    expect(fits(config, HAND)?.steps).toBe('LLLRR')
  })
})

/* ============================================================
   The clay ring
   ============================================================ */

describe('the clay ring', () => {
  it('knows nothing a child cannot see', () => {
    // The ring, the light and the sentence all come from `faultOf`, and it
    // reads the rectangle's own squares and nothing else: the same mat is
    // judged the same on a bare floor and on a floor half covered, however the
    // other mats lie.
    for (const level of levels) {
      const first = start(level, SEEDS[2])
      const half = play(first, solutionActions(first).slice(0, 3))
      const { n } = half
      for (let a = 0; a < n * n; a++) {
        for (let b = a; b < n * n; b++) {
          const m = rectBetween(n, a, b) as Mat
          expect(faultOf(half, m)).toEqual(faultOf({ ...half, mats: [] }, m))
        }
      }
    }
  })

  /**
   * A player who reasons about nothing at all. Walk the squares in a random
   * order, and on each bare one lay a random mat that the ring would never
   * light — one mark, the right shape, not one square — and never lift one.
   *
   * It is the mindless climber that `docs/PUZZLE_CANDIDATES.md` puts on
   * record, and the ring carries nothing a child cannot see before tapping, so
   * what it lands is the luck of a small floor rather than a leak.
   */
  it('can be climbed only by luck, and less as the floor grows', () => {
    // Pinned, because it is a measurement rather than a bound. Widened to four
    // hundred floors, `1000 + 37s` for s in 0..399, the climber was measured
    // two ways at once: on each floor this random-order climb, then the same
    // climb walking the squares in reading order, both drawing from the one
    // `makeRng(77)` a level. It landed 102, 16 and 1 times in 400 in random
    // order, and 129, 49 and 4 in reading order. The chocolate bar, one card
    // earlier, was measured the same way, both climbs on one rng, and lands
    // 85, 44 and 6, and 235, 148 and 84. This loop on its own, widened the same
    // way, draws a different stream and lands 89, 14 and 0. Re-pin from this
    // loop if `deal` or the loop ever draws its rng differently.
    const landed = [0, 0, 0]
    for (const [k, level] of levels.entries()) {
      const rng = makeRng(77)
      for (const seed of SEEDS) {
        const first = start(level, seed)
        const good = goodMats(first)
        let cur = first
        for (const cell of shuffled(
          rng,
          first.marks.map((_, i) => i),
        )) {
          const owner = ownerOf(cur)
          if (owner[cell] !== -1) continue
          const fit = good.filter((m) => {
            const cells = cellsOf(cur.n, m)
            return cells.includes(cell) && cells.every((c) => owner[c] === -1)
          })
          if (fit.length === 0) continue
          cur = reduce(cur, laying(cur.n, fit[randInt(rng, fit.length)]))
        }
        // It never lays a ring, whether it lands or not.
        expect(faults(cur).some(Boolean)).toBe(false)
        if (isSolved(cur)) {
          landed[k]++
          expect(cur.mats).toHaveLength(level.par as number)
        }
      }
    }
    expect(landed).toEqual([8, 2, 0])
  }, 20_000)
})

/* ============================================================
   The board
   ============================================================ */

describe('the board', () => {
  const level = levels[0]
  const seed = SEEDS[0]

  const show = (state: MatsState, locked = false, allowForbiddenMoves = true) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }), {
      wrapper: underSettings({ allowForbiddenMoves }),
    })
    return { state, dispatch, view }
  }

  /** The board with a real state behind it, so a cue can be watched from the tap. */
  const Play = ({ from }: { from: MatsState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: MatsAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  const playing = (from: MatsState) =>
    render(createElement(Play, { from }), { wrapper: underSettings() })

  const squareAt = (state: MatsState, cell: number) =>
    document.querySelector(
      `[aria-label*="Row ${rowOf(state.n, cell) + 1}, column ${colOf(state.n, cell) + 1},"]`,
    ) as HTMLButtonElement

  const matButton = (m: Mat) =>
    document.querySelector(
      `[aria-label*=" at row ${m.r0 + 1}, column ${m.c0 + 1},"]`,
    ) as HTMLButtonElement

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  const status = () => screen.getByRole('status').textContent

  /** Two taps, corner to corner, the way a child lays a mat. */
  const lay = (state: MatsState, m: Mat) => {
    fireEvent.click(squareAt(state, m.r0 * state.n + m.c0))
    fireEvent.click(squareAt(state, m.r1 * state.n + m.c1))
  }

  it('draws a pressable square for every square of a bare floor', () => {
    const { state } = show(start(level, seed))
    const squares = screen.getAllByRole('button')
    expect(squares).toHaveLength(state.n * state.n)
    for (const square of squares) {
      expect(square.className).toContain('u-press')
      expect(square.getAttribute('aria-label')).toMatch(
        /^Row \d+, column \d+, (no mark|a plus|a flat line|a standing line)\. Mark a corner here\.$/,
      )
    }
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe(
      'A floor, 4 squares by 4 squares',
    )
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = show(start(level, seed))
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|solved|par\b/i)
  })

  it('marks a corner on the first tap and sends one action on the second', () => {
    const { state, dispatch } = show(start(level, seed))
    fireEvent.click(squareAt(state, 0))
    expect(dispatch).not.toHaveBeenCalled()
    expect(squareAt(state, 0)).toHaveAttribute('data-marked', 'true')
    expect(squareAt(state, 0).getAttribute('aria-label')).toMatch(/Drop the corner\.$/)
    expect(squareAt(state, 6).getAttribute('aria-label')).toMatch(
      /Lay a mat from the corner to here\.$/,
    )

    fireEvent.click(squareAt(state, 6))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lay', a: 0, b: 6 })
  })

  it('lets go of the corner when it is tapped again, and when Escape is pressed, and sends nothing', () => {
    const { state, dispatch } = show(start(level, seed))
    fireEvent.click(squareAt(state, 5))
    fireEvent.click(squareAt(state, 5))
    expect(dispatch).not.toHaveBeenCalled()
    expect(squareAt(state, 5)).not.toHaveAttribute('data-marked')

    fireEvent.click(squareAt(state, 5))
    expect(squareAt(state, 5)).toHaveAttribute('data-marked', 'true')
    fireEvent.keyDown(squareAt(state, 5), { key: 'Escape' })
    expect(squareAt(state, 5)).not.toHaveAttribute('data-marked')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('outlines the mat the second tap would lay, and never says anything about it', () => {
    const { state } = show(start(level, seed))
    fireEvent.click(squareAt(state, 0))
    // Not over the marked corner itself: a mat of one square cannot be laid.
    fireEvent.mouseEnter(squareAt(state, 0))
    expect(document.querySelector('[class*="preview"]')).toBeNull()

    fireEvent.mouseEnter(squareAt(state, state.n + 1))
    const outline = document.querySelector('[class*="preview"]') as HTMLElement
    expect(outline).not.toBeNull()
    expect(outline.style.gridRow).toBe('1 / 3')
    expect(outline.style.gridColumn).toBe('1 / 3')
    // Measuring it against the mark is the puzzle, so the outline says nothing.
    expect(outline.textContent).toBe('')
    expect(outline).toHaveAttribute('aria-hidden', 'true')

    // And it is gone the moment there is no corner to draw from.
    fireEvent.click(squareAt(state, 0))
    expect(document.querySelector('[class*="preview"]')).toBeNull()
  })

  it('lifts a mat with one tap', () => {
    const first = start(level, seed)
    const m = answerFor(first).find((mat) => areaOf(mat) > 2) as Mat
    const floor = reduce(first, laying(first.n, m))
    const { dispatch } = show(floor)
    fireEvent.click(matButton(m))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lift', cell: m.r0 * floor.n + m.c0 })
  })

  it('draws one button for a whole mat, however many squares it covers, with its marks in it', () => {
    const floor = play(hand(), [laying(4, rect(0, 0, 0, 1)), laying(4, rect(0, 2, 0, 3))])
    const { view } = show(reduce(floor, laying(4, rect(1, 2, 3, 3))))
    expect(screen.getAllByRole('button')).toHaveLength(16 - 2 - 2 - 6 + 3)
    expect(matButton(rect(0, 0, 0, 1)).className).toContain('u-press')
    expect(matButton(rect(0, 0, 0, 1)).getAttribute('aria-label')).toBe(
      'Mat 2 squares wide and 1 square tall at row 1, column 1, holding a flat line. Lift it.',
    )
    expect(matButton(rect(1, 2, 3, 3)).getAttribute('aria-label')).toBe(
      'Mat 2 squares wide and 3 squares tall at row 2, column 3, holding a standing line. Lift it.',
    )
    // A mark on a mat is the same drawing as a mark on bare floor.
    expect(matButton(rect(1, 2, 3, 3)).querySelectorAll('svg')).toHaveLength(1)
    expect(view.container.querySelectorAll('svg')).toHaveLength(5)
  })

  it('names every mark on a mat that holds more than one, and says it breaks a rule', () => {
    show(reduce(hand(), laying(4, rect(0, 1, 1, 2))))
    expect(matButton(rect(0, 1, 1, 2)).getAttribute('aria-label')).toBe(
      'Mat 2 squares wide and 2 squares tall at row 1, column 2, holding a flat line, a flat line and a standing line, breaking a rule. Lift it.',
    )
  })

  it('counts the marks still waiting for a mat, and says what to do with a corner marked', () => {
    const first = start(level, seed)
    playing(first)
    expect(screen.getByText('5 marks still need a mat.')).toBeInTheDocument()
    const m = answerFor(first)[0]
    lay(first, m)
    expect(screen.getByText('4 marks still need a mat.')).toBeInTheDocument()
    fireEvent.click(squareAt(first, ownerOf(reduce(first, laying(first.n, m))).indexOf(-1)))
    expect(screen.getByText('Now tap the opposite corner.')).toBeInTheDocument()
    // The count is not read out on every move; there is nothing to announce.
    expect(status()).toBe('')
  })

  it('says so, in words and out loud, when every mark has a mat and squares are still bare', () => {
    const silent = hand([
      rect(0, 0, 0, 1),
      rect(0, 2, 0, 3),
      rect(1, 0, 1, 1),
      rect(1, 2, 2, 2),
      rect(2, 0, 3, 1),
    ])
    show(silent)
    const said = 'Every mark has a mat. 4 squares are still bare.'
    expect(status()).toBe(said)
    expect(screen.getAllByText(said)).toHaveLength(2)
  })

  it('says so, in words and out loud, when a mat lands breaking a rule', () => {
    const floor = hand()
    playing(floor)
    // The whole top row: two flat lines under one mat.
    lay(floor, rect(0, 0, 0, 3))
    const said = 'This mat has more than one mark on it.'
    expect(status()).toBe(said)
    expect(screen.getAllByText(said)).toHaveLength(2)
    const mat = matButton(rect(0, 0, 0, 3))
    expect(mat).toHaveAttribute('data-fault', 'true')
    expect(mat.getAttribute('aria-label')).toContain(', breaking a rule.')

    // Lift it and there is nothing left to say.
    fireEvent.click(mat)
    expect(status()).toBe('')
  })

  it('says the sentence that belongs to the floor in front of it, after a lift and after a rewind', () => {
    const floor = hand()
    playing(floor)
    // A flat line on a standing mat, then a mat with nothing on it.
    lay(floor, rect(0, 3, 1, 3))
    lay(floor, rect(3, 2, 3, 3))
    expect(status()).toBe('This mat has no mark on it.')
    // Lift the second: the first is still down, and still wrong.
    fireEvent.click(matButton(rect(3, 2, 3, 3)))
    const flat =
      'This mat is taller than it is wide. A flat line needs a mat that is wider than it is tall.'
    expect(status()).toBe(flat)
    cleanup()

    // The move tape rewinds by handing the board an earlier state.
    const one = reduce(floor, laying(4, rect(0, 3, 1, 3)))
    const two = reduce(one, laying(4, rect(3, 2, 3, 3)))
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state: two, dispatch, locked: false }), {
      wrapper: underSettings(),
    })
    expect(status()).toBe('This mat has no mark on it.')
    view.rerender(createElement(Board, { state: one, dispatch, locked: false }))
    expect(status()).toBe(flat)
    view.rerender(createElement(Board, { state: floor, dispatch, locked: false }))
    expect(status()).toBe('')
  })

  it('lights the whole mat and shakes the two marks at fault', () => {
    const floor = hand()
    playing(floor)
    lay(floor, rect(0, 0, 0, 3))
    // The light is on the field, which fills the mat inside its binding: the
    // mat itself is kept free to shake if a refused rectangle runs into it.
    const mat = matButton(rect(0, 0, 0, 3))
    expect(wearing(cues.highlight)).toEqual([mat.firstElementChild])
    const shaking = wearing(cues.shake)
    expect(shaking).toHaveLength(2)
    for (const mark of shaking) expect(mat.contains(mark)).toBe(true)
  })

  it('names the shape and what the mark needs when a mat is the wrong shape, and shakes nothing', () => {
    const floor = hand()
    playing(floor)
    lay(floor, rect(1, 2, 1, 3))
    expect(status()).toBe(
      'This mat is wider than it is tall. A standing line needs a mat that is taller than it is wide.',
    )
    expect(wearing(cues.highlight)).toHaveLength(1)
    // Nothing shakes: one mark, and the light over the mat is the measurement.
    expect(wearing(cues.shake)).toHaveLength(0)
  })

  it('takes the light off again and leaves the sentence and the clay ring standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const floor = hand()
      playing(floor)
      lay(floor, rect(3, 2, 3, 3))
      expect(wearing(cues.highlight)).toHaveLength(1)

      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(matButton(rect(3, 2, 3, 3))).toHaveAttribute('data-fault', 'true')
      expect(status()).toBe('This mat has no mark on it.')
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('offers the rectangle that runs over a mat, then refuses it and keeps the corner', () => {
    const first = start(level, seed)
    const m = answerFor(first)[0]
    const floor = reduce(first, laying(first.n, m))
    const { dispatch } = show(floor)
    const free = ownerOf(floor).indexOf(-1)
    fireEvent.click(squareAt(floor, free))
    expect(matButton(m)).toBeEnabled()
    fireEvent.click(matButton(m))
    expect(dispatch).not.toHaveBeenCalled()
    expect(status()).toBe('A mat is already lying there.')
    expect(screen.getByText('A mat is already lying there. Now tap the opposite corner.')).toBeInTheDocument()
    // The place the mat takes flashes, lifted over its neighbours so that the
    // whole ring shows, and the whole mat inside it shakes: one element runs
    // one animation, and the two say different halves of the refusal.
    const slot = matButton(m).parentElement as HTMLElement
    expect(wearing(cues.flash)).toEqual([slot])
    expect(slot).toHaveAttribute('data-refused', 'true')
    expect(wearing(cues.shake)).toEqual([matButton(m)])
    // Nothing moved, so the corner is still marked and the next tap is heard.
    expect(squareAt(floor, free)).toHaveAttribute('data-marked', 'true')
  })

  it('shakes a mat with no mark on it as plainly as any other', () => {
    // The shake is on the whole mat, not on the marks inside it, so the one
    // mat that has nothing inside it to move still says no.
    const floor = reduce(hand(), laying(4, rect(3, 2, 3, 3)))
    show(floor)
    fireEvent.click(squareAt(floor, 4))
    fireEvent.click(matButton(rect(3, 2, 3, 3)))
    expect(wearing(cues.shake)).toEqual([matButton(rect(3, 2, 3, 3))])
  })

  it('says the refusal alone, and never a broken rule about some other mat after it', () => {
    // Two marks under one mat along the top, and the plus's own good mat. A
    // rectangle from the second row into the plus's mat is refused, and it is
    // the good mat that flashes: the crowded one's sentence after the refusal
    // would read as being about the mat that flashed.
    const floor = hand()
    playing(floor)
    lay(floor, rect(0, 0, 0, 3))
    lay(floor, rect(2, 0, 3, 1))
    const crowded = 'This mat has more than one mark on it.'
    expect(status()).toBe(crowded)

    fireEvent.click(squareAt(floor, 4))
    fireEvent.click(matButton(rect(2, 0, 3, 1)))
    expect(status()).toBe('A mat is already lying there.')
    const note = screen.getByText('A mat is already lying there. Now tap the opposite corner.')
    expect(note.textContent).not.toContain('This mat')
    // The ring goes on marking the crowded mat meanwhile.
    expect(matButton(rect(0, 0, 0, 3))).toHaveAttribute('data-fault', 'true')

    // And the next move brings its sentence back: the corner that was kept
    // lays a good mat, and the crowded one is still the newest broken mat.
    fireEvent.click(squareAt(floor, 5))
    expect(status()).toBe(crowded)
    expect(screen.getAllByText(crowded)).toHaveLength(2)
  })

  it('says why when a corner on a plus lets go, and says nothing on any other square', () => {
    // The words allow a mat of one square for a plus, so tapping the plus
    // twice is often a child asking for one. The board lets go instead, and
    // says so; the answer never needs one.
    const floor = hand()
    const { dispatch } = show(floor)
    const plus = 8
    const said = 'A mat covers at least two squares.'
    fireEvent.click(squareAt(floor, plus))
    fireEvent.click(squareAt(floor, plus))
    expect(dispatch).not.toHaveBeenCalled()
    expect(squareAt(floor, plus)).not.toHaveAttribute('data-marked')
    expect(status()).toBe(said)
    expect(screen.getAllByText(said)).toHaveLength(2)

    // Marking a corner again is a new start, and the sentence goes.
    fireEvent.click(squareAt(floor, plus))
    expect(screen.getByText('Now tap the opposite corner.')).toBeInTheDocument()
    expect(status()).toBe('')

    // A square with no mark on it, or a line on it, lets go without a word: a
    // mat of one square could never be good there.
    fireEvent.click(squareAt(floor, plus))
    for (const cell of [0, 1]) {
      fireEvent.click(squareAt(floor, cell))
      fireEvent.click(squareAt(floor, cell))
      expect(status()).toBe('')
      expect(screen.getByText('5 marks still need a mat.')).toBeInTheDocument()
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('goes dead on that one move instead, once forbidden moves are turned off', () => {
    const first = start(level, seed)
    const m = answerFor(first)[0]
    const floor = reduce(first, laying(first.n, m))
    const { dispatch } = show(floor, false, false)
    fireEvent.click(squareAt(floor, ownerOf(floor).indexOf(-1)))
    expect(matButton(m)).toBeDisabled()
    expect(matButton(m).getAttribute('aria-label')).toMatch(/^A mat is already lying there\. Mat /)
    fireEvent.click(matButton(m))
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
    fireEvent.keyDown(moved, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(squareAt(state, 0))
  })

  it('never leaves the tab stop on a control that is dead, once forbidden moves are turned off', () => {
    // A browser will not focus a disabled button, so a tab stop left on one
    // takes the floor out of the Tab order altogether.
    const floor = reduce(hand(), laying(4, rect(0, 0, 0, 1)))
    show(floor, false, false)
    const oneLiveStop = () => {
      const stops = screen.getAllByRole('button').filter((el) => el.tabIndex === 0)
      expect(stops).toHaveLength(1)
      expect(stops[0]).toBeEnabled()
      return stops[0]
    }

    // By keyboard: a corner under the mat, and an arrow up into it. The mat is
    // dead, so the arrow stops as it would at the edge.
    squareAt(floor, 4).focus()
    fireEvent.click(squareAt(floor, 4))
    expect(matButton(rect(0, 0, 0, 1))).toBeDisabled()
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(squareAt(floor, 4))
    expect(oneLiveStop()).toBe(squareAt(floor, 4))
    // Sideways is live, and up from there is the mat again.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(squareAt(floor, 5))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(squareAt(floor, 5))
    expect(oneLiveStop()).toBe(squareAt(floor, 5))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    cleanup()

    // By pointer, from a mat: a click that does not move focus, as Safari's
    // does not, marks a corner that makes the mat under the cursor dead. The
    // tab stop goes to the corner, which is never dead.
    show(floor, false, false)
    matButton(rect(0, 0, 0, 1)).focus()
    fireEvent.click(squareAt(floor, 4))
    expect(matButton(rect(0, 0, 0, 1))).toBeDisabled()
    expect(oneLiveStop()).toBe(squareAt(floor, 4))
  })

  it('walks the cursor into the middle of a mat and finds the mat there', () => {
    const floor = reduce(hand(), laying(4, rect(1, 2, 3, 3)))
    show(floor)
    const mat = matButton(rect(1, 2, 3, 3))
    const grid = screen.getByRole('group')
    // Walk from the top-left corner to the mat's *last* square, which is not
    // the corner the mat is named by. A mat that registered only its top-left
    // would leave dead cursor positions inside every big mat.
    squareAt(floor, 0).focus()
    for (let step = 0; step < 3; step++) fireEvent.keyDown(grid, { key: 'ArrowDown' })
    for (let step = 0; step < 3; step++) fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(mat)
    const stops = screen.getAllByRole('button').filter((el) => el.tabIndex === 0)
    expect(stops).toEqual([mat])
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

  it('draws a solved floor without a word of celebration', () => {
    const first = start(level, seed)
    const done = play(first, solutionActions(first))
    const { view } = show(done, true)
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(status()).toBe('')
    expect(view.container.querySelector('p')?.textContent).toBe('')
    expect(view.container.querySelector(`.${cues.highlight}`)).toBeNull()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })
})

/* ============================================================
   The meta
   ============================================================ */

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(floorMats.id).toBe('floor-mats')
    expect(floorMats.reseedable).toBe(true)
    expect(floorMats.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(floorMats.instructions.length).toBeGreaterThanOrEqual(2)
    expect(floorMats.instructions.length).toBeLessThanOrEqual(4)
    for (const line of floorMats.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(140)
    }
  })

  it('never names a square that would give the answer away, and never says a mark as a character', () => {
    for (const level of levels) {
      for (const hint of level.hints) {
        expect(hint).not.toMatch(/row \d|column \d/i)
        expect(hint).not.toMatch(/[+|]| - /)
      }
    }
    for (const line of floorMats.instructions) expect(line).not.toMatch(/[+|]| - |!/)
  })

  it('ramps by size, and asks for more thinking as it goes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([4, 5, 6])
    expect(levels.map((l) => l.config.mats)).toEqual([5, 8, 11])
    const floors = levels.map((l) => l.config.minStuck)
    expect(floors).toEqual([2, 3, 5])
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
    expect(levels.map((l) => l.config.maxPairs)).toEqual([0, 0, 1])
    expect(levels.map((l) => l.config.always)).toEqual(['never', 'never', 'needed'])
    expect(levels.map((l) => l.config.maxSingles)).toEqual([0, 0, 0])
  })
})
