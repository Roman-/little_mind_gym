import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import { underSettings } from '../../test/settings'
import type { PuzzleLevel } from '../../lib/types'
import { suguru } from './index'
import { Board } from './Board'
import type { QuiltAction, QuiltConfig, QuiltState } from './logic'
import {
  BIGGEST_PATCH,
  SMALLEST_PATCH,
  biggestAt,
  blankCount,
  clashOf,
  colOf,
  conflicts,
  countSolutions,
  countWord,
  cutQuilt,
  deal,
  describeClash,
  describeMove,
  describeRange,
  digTo,
  filledCount,
  init,
  isSolved,
  legalMoves,
  nearlyFullPatches,
  orthogonal,
  patchCells,
  patchNames,
  patchSizes,
  peersOf,
  reduce,
  refusalOf,
  rowOf,
  shapesAt,
  smallestOpenPatch,
  solveByLogic,
  touching,
  valuesOf,
} from './logic'

const levels = suguru.levels as PuzzleLevel<QuiltConfig>[]
const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 37)

/**
 * Dealt once and kept, because dealing is the dear thing in this file. `deal`
 * cuts a quilt, digs the squares out of it and throws the pair away where the
 * board comes out the wrong shape, so one board costs several quilts: the
 * thirty seeds below come to about 0.4s at five wide, 0.3s at six and 1.1s at
 * seven. That is `for (const seed of SEEDS) init(level, makeRng(seed))` inside
 * `performance.now()`, on a machine with nothing much else running; a busy one
 * takes two or three times as long, which is what the budget on `beforeAll`
 * below is for. One deal on its own is held to a blink by the last test in
 * `the quilt`.
 */
const dealt = new Map<string, QuiltState>()
function start(level: PuzzleLevel<QuiltConfig>, seed: number): QuiltState {
  const key = `${level.id}:${seed}`
  const hit = dealt.get(key)
  if (hit) return hit
  const state = init(level, makeRng(seed))
  dealt.set(key, state)
  return state
}

/** The one true answer to a dealt board. */
function answerOf(state: QuiltState): number[] {
  const done = solveByLogic(state.n, state.patches, state.givens)
  expect(done).not.toBeNull()
  return (done as { grid: number[] }).grid
}

/** Writing the answer into every blank square, in reading order. */
function solutionActions(state: QuiltState): QuiltAction[] {
  const answer = answerOf(state)
  const out: QuiltAction[] = []
  state.givens.forEach((given, index) => {
    if (given === 0) out.push({ type: 'set', index, value: answer[index] })
  })
  return out
}

/** A seeded wander through the state graph, used to sample real positions. */
function walk(state: QuiltState, seed: number, steps: number): QuiltState[] {
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

/**
 * The same board with everything but the last `left` empty squares printed on
 * it. It is a board of exactly these rules, only an easier one, and it is
 * small enough for the search to walk to the end of.
 */
function tailOf(state: QuiltState, left: number): QuiltState {
  const answer = answerOf(state)
  const blanks = state.givens.map((g, i) => (g === 0 ? i : -1)).filter((i) => i >= 0)
  const keep = new Set(blanks.slice(blanks.length - left))
  return {
    ...state,
    givens: state.givens.map((g, i) => (g !== 0 || keep.has(i) ? g : answer[i])),
    entries: new Array<number>(state.n * state.n).fill(0),
  }
}

/**
 * The shortest way to fill a board in, by breadth-first search.
 *
 * Two moves are left out of the search, and each one is an argument rather
 * than a convenience.
 *
 * A shortest path never rubs anything out. Every move changes one square and a
 * finished board has `par` squares written into it, so a path that rubs one
 * out has spent two moves — the writing and the rubbing out — on a square it
 * has to write again: the same path without them is shorter and still ends
 * solved.
 *
 * And a shortest path never writes a number that repeats a peer, for exactly
 * the same reason: a solved board holds no repeat, so that number has to come
 * off again, which is the same two wasted moves. Left in, the graph would hold
 * every arrangement of numbers rather than every legal-looking one, and no
 * search would walk it.
 */
function search(state: QuiltState) {
  return shortestSolution<QuiltState, QuiltAction>({
    start: state,
    moves: (s) =>
      legalMoves(s).filter((a) => a.value !== 0 && clashOf(s, a.index, a.value) === null),
    apply: reduce,
    key: (s) => s.entries.join(','),
    solved: isSolved,
  })
}

/* A hand-cut quilt, four squares by four, with its one answer written out.
   Everything about the board — how it draws, what it says, what it refuses —
   is tested on this rather than on a dealt board, so a test can name a square
   and its patch. The patches are an L of five along the top, an L of four, a P
   of five, and a domino at the bottom left:

     A A A A       4 3 5 1
     B B B A       2 1 4 2
     B C C C       3 5 3 1
     D D C C       2 1 4 2                                                   */
const FIXTURE_PATCHES = [0, 0, 0, 0, 1, 1, 1, 0, 1, 2, 2, 2, 3, 3, 2, 2]
const FIXTURE_ANSWER = [4, 3, 5, 1, 2, 1, 4, 2, 3, 5, 3, 1, 2, 1, 4, 2]
/** Seven squares printed, nine to fill. */
const FIXTURE_GIVENS = [4, 0, 5, 0, 0, 1, 0, 2, 0, 5, 0, 0, 2, 0, 0, 2]

const fixture = (): QuiltState => ({
  n: 4,
  patches: FIXTURE_PATCHES,
  givens: FIXTURE_GIVENS,
  entries: new Array<number>(16).fill(0),
})

/** The two-square patch at the bottom left, and its neighbour up the side. */
const DOMINO = 12
const ROOMY = 9

afterEach(cleanup)

/**
 * Every board this file asks about, dealt up front and on one clock.
 *
 * The tests share `start`, so whichever of them runs first pays for all thirty
 * seeds of its level and every test after it gets them free. That puts a
 * second of arithmetic on a test that reads as a cheap one, and on a different
 * test every time this file is reordered — and a second of arithmetic on a
 * machine that nine other people are building on has run past vitest's 5s
 * default and failed a test that was doing nothing wrong. Dealing here gives
 * the whole ninety boards one budget, sized for the busy machine rather than
 * the quiet one.
 */
beforeAll(() => {
  for (const level of levels) for (const seed of SEEDS) start(level, seed)
}, 60_000)

describe('the quilt', () => {
  for (const level of levels) {
    const { n, clues, minRounds, maxRounds } = level.config

    it(`"${level.label}" cuts every square into a patch of two to five`, () => {
      for (const seed of SEEDS) {
        const { patches } = start(level, seed)
        expect(patches).toHaveLength(n * n)
        const cells = patchCells(patches)
        expect(cells.flat().sort((a, b) => a - b)).toEqual(
          Array.from({ length: n * n }, (_, i) => i),
        )
        for (const patch of cells) {
          expect(patch.length).toBeGreaterThanOrEqual(SMALLEST_PATCH)
          expect(patch.length).toBeLessThanOrEqual(BIGGEST_PATCH)
          // Joined edge to edge: a patch a child cannot trace round with one
          // finger is not a patch.
          const inside = new Set(patch)
          const seen = new Set([patch[0]])
          const stack = [patch[0]]
          while (stack.length > 0) {
            for (const nb of orthogonal(n, stack.pop() as number)) {
              if (inside.has(nb) && !seen.has(nb)) {
                seen.add(nb)
                stack.push(nb)
              }
            }
          }
          expect(seen.size).toBe(patch.length)
        }
      }
    })

    it(`"${level.label}" prints exactly ${clues} squares, so par cannot wobble`, () => {
      expect(level.par).toBe(n * n - clues)
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.givens.filter((v) => v !== 0)).toHaveLength(clues)
        expect(state.entries.every((v) => v === 0)).toBe(true)
        expect(blankCount(state)).toBe(level.par)
        expect(filledCount(state)).toBe(clues)
      }
    })

    it(`"${level.label}" prints nothing that already breaks a rule`, () => {
      for (const seed of SEEDS) {
        const { n: size, patches, givens } = start(level, seed)
        const peers = peersOf(size, patches)
        const sizes = patchSizes(patches)
        givens.forEach((v, i) => {
          if (v === 0) return
          expect(v).toBeLessThanOrEqual(sizes[patches[i]])
          expect(peers[i].some((p) => givens[p] === v)).toBe(false)
        })
      }
    })

    it(`"${level.label}" has exactly one answer, and never needs a guess`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(countSolutions(n, state.patches, state.givens, 2)).toBe(1)
        const done = solveByLogic(n, state.patches, state.givens)
        expect(done).not.toBeNull()
        expect((done as { grid: number[] }).grid.every((v) => v !== 0)).toBe(true)
      }
    })

    it(`"${level.label}" takes ${minRounds} to ${maxRounds} passes to reason out`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const done = solveByLogic(n, state.patches, state.givens)
        const rounds = (done as { rounds: number }).rounds
        expect(rounds, `seed ${seed}`).toBeGreaterThanOrEqual(minRounds)
        expect(rounds, `seed ${seed}`).toBeLessThanOrEqual(maxRounds)
      }
    })

    it(`"${level.label}" always leaves a patch of ${level.config.smallest} squares or fewer open`, () => {
      // The shape a level is dealt, and it is not decoration. A quilt cut
      // entirely into patches of five never asks the question this puzzle is
      // about: every number fits every square, nothing is ever too big for its
      // patch, and the board never has to say so. 85 of 300 five-wide quilts
      // came out that way when nothing asked them not to, and half of the 300
      // held no patch of two squares at all.
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(smallestOpenPatch(state.patches, state.givens), `seed ${seed}`).toBeLessThanOrEqual(
          level.config.smallest,
        )
      }
    })

    it(`"${level.label}" always has an empty square that some number is too big for`, () => {
      // The other half of the same thing, said the way a child meets it: there
      // is always a key on the pad that this square cannot take, so the
      // 'oversize' refusal is a thing the puzzle really does rather than a
      // branch nobody reaches.
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const sizes = patchSizes(state.patches)
        const small = state.givens.findIndex(
          (given, i) => given === 0 && sizes[state.patches[i]] < BIGGEST_PATCH,
        )
        expect(small, `seed ${seed}`).toBeGreaterThanOrEqual(0)
        expect(refusalOf(state, small, BIGGEST_PATCH), `seed ${seed}`).not.toBeNull()
      }
    })

    it(`"${level.label}" deals a start that is neither solved nor nearly solved`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(isSolved(state)).toBe(false)
        expect(conflicts(state).some(Boolean)).toBe(false)
        expect(blankCount(state)).toBeGreaterThanOrEqual(8)
        for (const action of legalMoves(state)) expect(isSolved(reduce(state, action))).toBe(false)
      }
    })

    it(`"${level.label}" actually varies with the seed, and never with anything else`, () => {
      const seen = new Set(
        SEEDS.map((seed) => {
          const state = start(level, seed)
          return `${state.patches.join(',')}|${state.givens.join(',')}`
        }),
      )
      expect(seen.size).toBeGreaterThan(SEEDS.length - 4)
      const twice = init(level, makeRng(4242))
      expect(twice.patches).toEqual(init(level, makeRng(4242)).patches)
      expect(twice.givens).toEqual(init(level, makeRng(4242)).givens)
    })
  }

  it('deals a board for every level inside a blink', () => {
    // A deal happens with a child watching the page, so one of them is a blink
    // and not a wait. Two hundred seeds a level, timed one at a time —
    // `init(level, makeRng(9000 + k * 13))` for k under 200 — came out at a
    // median of 7ms, 6ms and 18ms, five wide to seven, and the slowest
    // seven-wide draw of the two hundred took 214ms. The bound below is that
    // tail with room over it, and it is the same 400ms that the garden cats
    // and the kangaroo's hops hold their own deals to.
    for (const level of levels) {
      const at = performance.now()
      init(level, makeRng(4242))
      expect(performance.now() - at, level.id).toBeLessThan(400)
    }
  })
})

describe('cutting a quilt', () => {
  it('always comes back with a quilt that is already filled in', () => {
    for (const seed of [11, 202, 3003, 40004]) {
      const rng = makeRng(seed)
      for (const n of [5, 6, 7]) {
        const quilt = cutQuilt(rng, n)
        expect(quilt.patches).toHaveLength(n * n)
        for (const patch of patchCells(quilt.patches)) {
          expect(patch.length).toBeGreaterThanOrEqual(SMALLEST_PATCH)
          expect(patch.length).toBeLessThanOrEqual(BIGGEST_PATCH)
          // 1 to however many squares it has, once each.
          expect(patch.map((i) => quilt.values[i]).sort()).toEqual(
            Array.from({ length: patch.length }, (_, k) => k + 1),
          )
        }
        for (let i = 0; i < quilt.values.length; i++) {
          for (const t of touching(n, i)) expect(quilt.values[t]).not.toBe(quilt.values[i])
        }
      }
    }
  })

  it('thins a quilt to the number of squares a level prints, on uniqueness alone', () => {
    // The road `deal` only takes when reasoning alone will not thin a quilt
    // that far. It is a fallback nothing in the tests has ever reached, so it
    // is exercised here rather than left to be found by a child.
    const rng = makeRng(2024)
    const quilt = cutQuilt(rng, 5)
    const givens = digTo(rng, 5, quilt, 12, 'unique')
    expect(givens).not.toBeNull()
    expect((givens as number[]).filter((v) => v !== 0)).toHaveLength(12)
    expect(countSolutions(5, quilt.patches, givens as number[], 2)).toBe(1)
  })

  it('offers only patches a child could trace round with one finger', () => {
    const free = new Array<boolean>(25).fill(true)
    free[7] = false
    const shapes = shapesAt(5, free, 0, SMALLEST_PATCH, BIGGEST_PATCH)
    const seen = new Set<string>()
    for (const cells of shapes) {
      expect(cells).toContain(0)
      expect(cells.length).toBeGreaterThanOrEqual(SMALLEST_PATCH)
      expect(cells.length).toBeLessThanOrEqual(BIGGEST_PATCH)
      expect(cells.every((i) => free[i])).toBe(true)
      // Joined edge to edge, and offered exactly once.
      const inside = new Set(cells)
      const stack = [0]
      const reached = new Set([0])
      while (stack.length > 0) {
        for (const nb of orthogonal(5, stack.pop() as number)) {
          if (inside.has(nb) && !reached.has(nb)) {
            reached.add(nb)
            stack.push(nb)
          }
        }
      }
      expect(reached.size).toBe(cells.length)
      const key = [...cells].sort((a, b) => a - b).join(',')
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    expect(shapes.length).toBeGreaterThan(20)
  })

  it('counts the patches with one square left to fill', () => {
    // The domino at the bottom left holds a printed 2 and one empty square, so
    // it is the only patch on the fixture with a single square left. This
    // count is what `nearlyFull` holds a level to, and level 2's first hint is
    // about the patch that it counts.
    expect(nearlyFullPatches(FIXTURE_PATCHES, FIXTURE_GIVENS)).toBe(1)
    expect(nearlyFullPatches(FIXTURE_PATCHES, FIXTURE_ANSWER)).toBe(0)
    const started = FIXTURE_GIVENS.slice()
    started[1] = FIXTURE_ANSWER[1]
    expect(nearlyFullPatches(FIXTURE_PATCHES, started)).toBe(2)
  })

  it(
    'says so rather than handing over a board it could not build',
    () => {
      // Each rung of `deal`'s fallback hands over a real board and says in its
      // own comment what that board gives up. The one thing no rung may give
      // up is the single answer, because nothing downstream of `deal` counts
      // the answers again: a board with two ways through it would read as a
      // board with one until a child filled it in a way that the hints did not
      // expect. So an ask that no quilt can meet is an error rather than a
      // quietly worse board. Nothing a level asks for is anywhere near this
      // one: a board with `clues: 0` has nothing printed on it at all.
      expect(() =>
        deal(makeRng(1), {
          n: 5,
          clues: 0,
          minRounds: 1,
          maxRounds: 9,
          smallest: BIGGEST_PATCH,
          nearlyFull: 0,
        }),
      ).toThrow(/5 by 5/)
    },
    20_000,
  )
})

describe('reasoning a board out', () => {
  it('will not call a grid finished when two squares of it repeat each other', () => {
    // Two squares, each with one number left, and it is the same number: the
    // board contradicts itself and has no answer at all. Both writes used to
    // land, the grid came out full, and a full grid was reported as finished
    // with the rule broken across the middle of it.
    expect(solveByLogic(3, [0, 1, 1, 0, 2, 2, 0, 2, 2], [3, 1, 0, 0, 0, 0, 0, 0, 2])).toBeNull()
  })

  it('hands back a grid that is full, breaks no rule, and is the only one there is', () => {
    // Boards this is never asked about through `deal`: random squares off a
    // random quilt, and one board in three with a number moved somewhere it
    // does not belong, which is how a board that contradicts itself gets in
    // front of the solver at all.
    const rng = makeRng(31337)
    let finished = 0
    for (let k = 0; k < 120; k++) {
      const quilt = cutQuilt(rng, 4)
      const sizes = patchSizes(quilt.patches)
      const givens = quilt.values.map((v) => (rng() < 0.45 ? v : 0))
      if (rng() < 0.34) {
        const at = Math.floor(rng() * givens.length)
        givens[at] = 1 + Math.floor(rng() * sizes[quilt.patches[at]])
      }
      const done = solveByLogic(4, quilt.patches, givens)
      if (done === null) continue
      finished++
      const peers = peersOf(4, quilt.patches)
      expect(done.grid.every((v) => v !== 0)).toBe(true)
      done.grid.forEach((v, i) => {
        expect(v).toBeLessThanOrEqual(sizes[quilt.patches[i]])
        expect(peers[i].some((p) => done.grid[p] === v)).toBe(false)
      })
      // Which is the whole claim in the header: no guessing and one answer are
      // one check here rather than two.
      expect(countSolutions(4, quilt.patches, givens, 2)).toBe(1)
    }
    expect(finished).toBeGreaterThan(20)
  })
})

describe('the peers of a square', () => {
  it('are its patch-mates and the eight squares round it, and nothing else', () => {
    const state = fixture()
    const peers = peersOf(4, state.patches)
    // Square 5 is in the L of four with 4, 6 and 8, and touches 0, 1, 2, 4,
    // 6, 8, 9 and 10.
    expect([...peers[5]].sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 6, 8, 9, 10])
    for (let i = 0; i < 16; i++) {
      for (const p of peers[i]) {
        expect(peers[p]).toContain(i)
        const samePatch = state.patches[p] === state.patches[i]
        expect(samePatch || touching(4, i).includes(p)).toBe(true)
      }
    }
  })

  it('counts eight squares round the middle and three round a corner', () => {
    expect(touching(4, 5)).toHaveLength(8)
    expect(touching(4, 0)).toHaveLength(3)
    expect(orthogonal(4, 0)).toHaveLength(2)
  })

  it('gives every patch a letter of its own, in the order they are read in', () => {
    // The letter is what a listener has instead of the seams. Reading order
    // rather than the order the cutter happened to lay the patches down in:
    // the patch holding the top left square is A whoever cut it.
    expect(patchNames(fixture().patches)).toEqual(['A', 'B', 'C', 'D'])
    expect(patchNames([1, 1, 0, 0])).toEqual(['B', 'A'])
    for (const level of levels) {
      const state = start(level, 21)
      const names = patchNames(state.patches)
      expect(names).toHaveLength(patchSizes(state.patches).length)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('knows how big a number each patch takes', () => {
    const state = fixture()
    expect(patchSizes(state.patches)).toEqual([5, 4, 5, 2])
    expect(biggestAt(state, DOMINO)).toBe(2)
    expect(biggestAt(state, ROOMY)).toBe(5)
  })
})

describe('reduce', () => {
  for (const level of levels) {
    it(`"${level.label}" returns the identical state for every action that changes nothing`, () => {
      const state = start(level, 99)
      const given = state.givens.findIndex((v) => v !== 0)
      const blank = state.givens.indexOf(0)
      const last = state.n * state.n - 1

      const noOps: [string, QuiltAction][] = [
        ['another action type', { type: 'nudge' } as unknown as QuiltAction],
        ['no action at all', undefined as unknown as QuiltAction],
        ['writing over a printed number', { type: 'set', index: given, value: 1 }],
        ['rubbing out a printed number', { type: 'set', index: given, value: 0 }],
        ['rubbing out a square that is already empty', { type: 'set', index: blank, value: 0 }],
        ['an index before the grid', { type: 'set', index: -1, value: 1 }],
        ['an index past the grid', { type: 'set', index: last + 1, value: 1 }],
        ['a fractional index', { type: 'set', index: 1.5, value: 1 }],
        ['an index that is NaN', { type: 'set', index: NaN, value: 1 }],
        ['an index that is Infinity', { type: 'set', index: Infinity, value: 1 }],
        ['a missing index', { type: 'set', index: undefined as unknown as number, value: 1 }],
        ['a null index', { type: 'set', index: null as unknown as number, value: 1 }],
        ['a number bigger than any patch', { type: 'set', index: blank, value: BIGGEST_PATCH + 1 }],
        ['a negative number', { type: 'set', index: blank, value: -1 }],
        ['a fractional number', { type: 'set', index: blank, value: 1.5 }],
        ['a number that is NaN', { type: 'set', index: blank, value: NaN }],
        ['a number that is Infinity', { type: 'set', index: blank, value: Infinity }],
        ['a missing number', { type: 'set', index: blank, value: undefined as unknown as number }],
        ['a null number', { type: 'set', index: blank, value: null as unknown as number }],
      ]
      for (const [what, action] of noOps) {
        // toBe, not toEqual: a fresh but equal object would pollute the move tape.
        expect(reduce(state, action), what).toBe(state)
      }

      const written = reduce(state, { type: 'set', index: blank, value: 1 })
      expect(written).not.toBe(state)
      expect(reduce(written, { type: 'set', index: blank, value: 1 }), 'rewriting the same').toBe(
        written,
      )
    })

    it(`"${level.label}" refuses a number too big for the patch, without moving`, () => {
      const state = start(level, 7)
      const sizes = patchSizes(state.patches)
      const small = state.givens.findIndex(
        (given, i) => given === 0 && sizes[state.patches[i]] < BIGGEST_PATCH,
      )
      expect(small).toBeGreaterThanOrEqual(0)
      for (let value = biggestAt(state, small) + 1; value <= BIGGEST_PATCH; value++) {
        expect(reduce(state, { type: 'set', index: small, value })).toBe(state)
      }
    })

    it(`"${level.label}" leaves the state it was handed exactly as it found it`, () => {
      const state = start(level, 12)
      const givensBefore = state.givens.slice()
      const entriesBefore = state.entries.slice()
      const blank = state.givens.indexOf(0)
      const next = reduce(state, { type: 'set', index: blank, value: 1 })
      expect(state.givens).toEqual(givensBefore)
      expect(state.entries).toEqual(entriesBefore)
      // A fresh entries array, so the position before it in the move tape is
      // safe; the quilt and the printed squares are passed straight through.
      expect(next.entries).not.toBe(state.entries)
      expect(next.givens).toBe(state.givens)
      expect(next.patches).toBe(state.patches)
      expect(next.entries[blank]).toBe(1)
      expect(next.entries.filter((v) => v !== 0)).toHaveLength(1)
      expect(reduce(next, { type: 'set', index: blank, value: 0 }).entries[blank]).toBe(0)
    })

    it(`"${level.label}" changes exactly one square, and never a printed one`, () => {
      // The whole lower bound on par rests on this, so it is checked over
      // every action from every state on a real wander rather than only from
      // the start.
      for (const state of walk(start(level, 5), 5, 12)) {
        for (const action of legalMoves(state)) {
          const next = reduce(state, action)
          expect(next).not.toBe(state)
          expect(next.givens).toBe(state.givens)
          const moved = next.entries
            .map((v, i) => (v === state.entries[i] ? -1 : i))
            .filter((i) => i >= 0)
          expect(moved).toEqual([action.index])
          expect(state.givens[action.index]).toBe(0)
        }
      }
    })

    it(`"${level.label}" has legalMoves that are exactly the actions that change something`, () => {
      // If legalMoves hid a move, every par proved by search would be wrong.
      for (const state of walk(start(level, 17), 17, 8)) {
        const listed = new Set(legalMoves(state).map((a) => `${a.index}:${a.value}`))
        for (let index = 0; index < state.n * state.n; index++) {
          for (let value = 0; value <= BIGGEST_PATCH; value++) {
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

   par is the number of empty squares a level deals, and the two
   halves of that claim are proved separately.

   The floor: `isSolved` needs every square filled, and the test
   above shows one action changes exactly one square — so a board
   with `par` empty squares cannot be finished in fewer than `par`
   actions. The test below checks that by construction, walking
   real positions and watching the count of empty squares fall by
   at most one a move, rather than asserting a number.

   The ceiling: writing the one answer into each empty square is
   `par` actions, every one of them legal, and the board is solved
   at the end of them.

   And the search agrees. The five-wide level is small enough to
   walk outright — a few hundred clash-free positions, against the
   200,000 the search allows — so its par is settled by
   breadth-first search on three separate seeds as well. Six and
   seven wide are far past that cap, so the search is run on the
   last few squares of those boards instead: the same rules, the
   same reduce, at a size a search can reach the end of.
   ============================================================ */
describe('par', () => {
  for (const level of levels) {
    it(`"${level.label}" deals exactly par (${level.par}) empty squares`, () => {
      for (const seed of SEEDS) expect(blankCount(start(level, seed))).toBe(level.par)
    })

    it(`"${level.label}" cannot be finished in fewer than par (${level.par}) moves`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        expect(isSolved(first)).toBe(false)
        for (const state of walk(first, seed, 15)) {
          for (const action of legalMoves(state)) {
            // One move fills in at most one empty square, so a board with
            // `blankCount` of them needs at least that many moves.
            expect(blankCount(reduce(state, action))).toBeGreaterThanOrEqual(
              blankCount(state) - 1,
            )
          }
          if (blankCount(state) > 0) expect(isSolved(state)).toBe(false)
        }
      }
    })

    it(`"${level.label}" is finished in exactly par (${level.par}) moves, and not before`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        let state = first
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

  it(
    'has no shorter path than par on the five-wide board, under breadth-first search',
    () => {
      // The whole board fits: eight empty squares with no repeat allowed among
      // them come to a few hundred positions, well inside the 200,000 the
      // search allows. Six and seven wide are far past that cap, which is why
      // the two levels below are searched a few squares at a time.
      const level = levels[0]
      for (const seed of [1111, 5, 61]) {
        const path = search(start(level, seed))
        expect(path, `seed ${seed}`).not.toBeNull()
        expect(path, `seed ${seed}`).toHaveLength(level.par as number)
      }
    },
    60_000,
  )

  for (const level of levels.slice(1)) {
    it(`"${level.label}" has no shortcut through its last eight squares either`, () => {
      const state = tailOf(start(level, 5), 8)
      expect(blankCount(state)).toBe(8)
      expect(countSolutions(state.n, state.patches, state.givens, 2)).toBe(1)
      expect(search(state)).toHaveLength(8)
    })
  }
})

describe('isSolved', () => {
  it('will not call a full board solved when a number repeats a peer', () => {
    const state = fixture()
    const full = FIXTURE_ANSWER.reduce(
      (cur, value, index) =>
        state.givens[index] === 0 ? reduce(cur, { type: 'set', index, value }) : cur,
      state,
    )
    expect(isSolved(full)).toBe(true)
    expect(conflicts(full).some(Boolean)).toBe(false)

    // Two squares of the P of five swapped: still full, still 1 to 5 in the
    // patch, but the two 3s now touch.
    const swapped = reduce(reduce(full, { type: 'set', index: 10, value: 1 }), {
      type: 'set',
      index: 11,
      value: 3,
    })
    expect(blankCount(swapped)).toBe(0)
    expect(isSolved(swapped)).toBe(false)
    expect(conflicts(swapped).filter(Boolean)).toHaveLength(2)
  })

  it('never blames a printed number for a repeat beside it', () => {
    const state = fixture()
    // Square 1 is printed nowhere near a 5; square 2 holds a printed 5.
    const wrong = reduce(state, { type: 'set', index: 1, value: 5 })
    const flagged = conflicts(wrong)
    expect(flagged[1]).toBe(true)
    expect(flagged[2]).toBe(false)
    expect(valuesOf(wrong)[2]).toBe(5)
  })
})

describe('the rule a number breaks', () => {
  it('says a patch is too small before it says anything else', () => {
    const state = fixture()
    const clash = clashOf(state, DOMINO + 1, 5)
    expect(clash?.kind).toBe('oversize')
    expect(clash?.patchSize).toBe(2)
    expect(describeClash(clash!)).toBe('A patch of two squares holds only 1 and 2.')
    expect(describeRange(5)).toBe('A patch of five squares holds only 1, 2, 3, 4 and 5.')
    expect(countWord(3)).toBe('three')
  })

  it('names the patch when a number is already somewhere in it', () => {
    const state = fixture()
    // The P of five already holds a printed 5 at square 9.
    const clash = clashOf(state, 11, 5)
    expect(clash?.kind).toBe('patch')
    expect(clash?.blamed.sort((a, b) => a - b)).toEqual([9, 11])
    expect(clash?.cells).toEqual(patchCells(state.patches)[2])
    expect(describeClash(clash!)).toBe('This patch already has a 5.')
  })

  it('names the neighbour when the same number is standing next to the square', () => {
    const state = fixture()
    // Square 0 holds a printed 4; square 4 is empty and touches it.
    const clash = clashOf(state, 4, 4)
    expect(clash?.kind).toBe('touching')
    expect(clash?.blamed.sort((a, b) => a - b)).toEqual([0, 4])
    expect(clash?.cells).toContain(4)
    expect(describeClash(clash!)).toBe('A square touching this one already has a 4.')
  })

  it('says nothing at all about a number that fits', () => {
    const state = fixture()
    expect(clashOf(state, 1, 3)).toBeNull()
    expect(clashOf(state, 1, 0)).toBeNull()
    expect(clashOf(state, 0, 4)).toBeNull()
  })

  it('never gives the answer away in the sentence', () => {
    const state = fixture()
    const clash = clashOf(state, 4, 4)
    expect(describeClash(clash!)).not.toMatch(/goes|instead|should|try/i)
  })
})

describe('a number too big for its patch', () => {
  it('is drawn where the child put it, answered, and never dispatched', () => {
    const state = fixture()
    const no = refusalOf(state, DOMINO + 1, 4)
    expect(no).not.toBeNull()
    expect(no?.message).toBe('A patch of two squares holds only 1 and 2.')
    // The position the tap pretends to reach, and it is not the real one.
    expect(no?.pretend).not.toBe(state)
    expect(no?.pretend.entries[DOMINO + 1]).toBe(4)
    expect(state.entries[DOMINO + 1]).toBe(0)
    // reduce refuses the same action outright, so nothing forbidden can reach
    // the history even if a board dispatched it.
    expect(reduce(state, { type: 'set', index: DOMINO + 1, value: 4 })).toBe(state)
  })

  it('is not claimed for a number that fits, or for a square nobody may write in', () => {
    const state = fixture()
    expect(refusalOf(state, ROOMY, 5)).toBeNull()
    expect(refusalOf(state, ROOMY, 0)).toBeNull()
    expect(refusalOf(state, 0, 5)).toBeNull() // printed
    expect(refusalOf(state, -1, 5)).toBeNull()
    expect(refusalOf(state, DOMINO + 1, BIGGEST_PATCH + 1)).toBeNull()
  })
})

describe('a wrong number', () => {
  it('is never a dead end: the engine has none, and nothing can be painted into a corner', () => {
    expect(suguru.engine.failure).toBeUndefined()
    for (const level of levels) {
      const first = start(level, 3)
      const answer = answerOf(first)
      for (const state of walk(first, 3, 15)) {
        // Rub out everything the player has written, then write the answer.
        let back = state
        state.entries.forEach((v, index) => {
          if (v !== 0) back = reduce(back, { type: 'set', index, value: 0 })
        })
        let done = back
        back.givens.forEach((given, index) => {
          if (given === 0) done = reduce(done, { type: 'set', index, value: answer[index] })
        })
        expect(isSolved(done)).toBe(true)
      }
    }
  })
})

describe('the move tape', () => {
  it('says what each tap did, in the words the level uses', () => {
    const state = fixture()
    const written = reduce(state, { type: 'set', index: 1, value: 3 })
    expect(describeMove(state, written, { type: 'set', index: 1, value: 3 })).toBe(
      'Put 3 in row 1, column 2',
    )
    expect(describeMove(written, state, { type: 'set', index: 1, value: 0 })).toBe(
      'Rubbed out row 1, column 2',
    )
    expect(rowOf(4, 6)).toBe(1)
    expect(colOf(4, 6)).toBe(2)
  })
})

/* ============================================================
   The board
   ============================================================ */

const paint = (state: QuiltState, locked = false, allow = true) => {
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
const Play = ({ from }: { from: QuiltState }) => {
  const [state, setState] = useState(from)
  return createElement(Board, {
    state,
    dispatch: (action: QuiltAction) => setState((cur) => reduce(cur, action)),
    locked: false,
  })
}

const play = (from: QuiltState) =>
  render(createElement(Play, { from }), { wrapper: underSettings() })

describe('the board', () => {
  it('draws one button a square you can write in, and a key a number', () => {
    const state = fixture()
    const { all } = paint(state)
    // Nine empty squares, five numbers and the rubber.
    expect(all()).toHaveLength(9 + BIGGEST_PATCH + 1)
    for (const button of all()) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect((button.getAttribute('aria-label') ?? '').length).toBeGreaterThan(8)
    }
  })

  it('says which patch a square is in, so a listener can count it too', () => {
    const state = fixture()
    paint(state)
    expect(
      screen.getByRole('button', { name: /row 4, column 2/i }).getAttribute('aria-label'),
    ).toBe('Row 4, column 2, patch D of two squares, empty')
    expect(screen.getByRole('img', { name: /row 1, column 1/i })).toHaveAttribute(
      'aria-label',
      'Row 1, column 1, patch A of five squares, 4, printed',
    )
  })

  it('names the patch, so two squares either side of a seam do not read the same', () => {
    // Row 2 column 4 and row 3 column 4 sit one above the other, and both are
    // in a patch of five — the L along the top and the P below it. The seam
    // between them is the whole difference between the two squares, and the
    // size alone does not say it: a listener given only the size is given
    // nothing.
    const { view } = paint(fixture())
    const labels = [...view.container.querySelectorAll('[aria-label^="Row "]')].map(
      (el) => el.getAttribute('aria-label') as string,
    )
    expect(labels).toHaveLength(16)
    const at = (r: number, c: number) =>
      labels.find((l) => l.startsWith(`Row ${r}, column ${c},`)) as string
    expect(at(2, 4)).toBe('Row 2, column 4, patch A of five squares, 2, printed')
    expect(at(3, 4)).toBe('Row 3, column 4, patch C of five squares, empty')

    // One letter to a patch, one patch to a letter, in reading order.
    const letters = labels.map((l) => /patch (\w+) of/.exec(l)?.[1] as string)
    const byPatch = new Map<number, string>()
    FIXTURE_PATCHES.forEach((patch, i) => {
      const r = Math.floor(i / 4) + 1
      const c = (i % 4) + 1
      const letter = letters[labels.indexOf(at(r, c))]
      const seen = byPatch.get(patch)
      if (seen === undefined) byPatch.set(patch, letter)
      else expect(letter).toBe(seen)
    })
    expect([...byPatch.entries()]).toEqual([
      [0, 'A'],
      [1, 'B'],
      [2, 'C'],
      [3, 'D'],
    ])
  })

  it('writes a number on a tap of a square and then a tap of a key', () => {
    const state = fixture()
    const { dispatch, by } = paint(state)
    fireEvent.click(by(/row 1, column 2/i))
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(by(/^put 3 in the square$/i))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: 1, value: 3 })
  })

  it('goes dead on the number the square already holds, and rubs out with the rubber', () => {
    // docs/DESIGN.md draws the line at a rule broken, never at a move that
    // changes nothing, and names writing the number that is already there as
    // one of those: tapping the 3 again would write the 3 again. The small
    // square's pad takes the same key off for the same reason, and the rubber
    // beside it is how a number comes off on both boards.
    const view = play(fixture())
    fireEvent.click(screen.getByRole('button', { name: /row 1, column 2/i }))
    fireEvent.click(screen.getByRole('button', { name: /^put 3 in the square$/i }))
    expect(screen.getByRole('button', { name: /row 1, column 2, patch A of five squares, 3/i }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^put 3 in the square$/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /rub out the square/i }))
    expect(
      screen.getByRole('button', { name: /row 1, column 2, patch A of five squares, empty/i }),
    ).toBeInTheDocument()
    view.unmount()
  })

  it('keeps the square chosen after a number lands, so the next number goes straight in', () => {
    const view = play(fixture())
    fireEvent.click(screen.getByRole('button', { name: /row 1, column 2/i }))
    fireEvent.click(screen.getByRole('button', { name: /^put 3 in the square$/i }))
    // The ring, the sentence under the board and every other key still say the
    // same thing: this square is the one the next number goes into.
    expect(screen.getByRole('button', { name: /row 1, column 2/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.body.textContent).toContain('Now tap a number for row 1, column 2.')
    for (const value of [1, 2, 4, 5]) {
      expect(screen.getByRole('button', { name: new RegExp(`^put ${value} in the square$`, 'i') }))
        .toBeEnabled()
    }
    expect(screen.getByRole('button', { name: /rub out the square/i })).toBeEnabled()
    view.unmount()
  })

  it('rings the square the keyboard is writing into, and lets go of it on Escape', () => {
    const view = play(fixture())
    const square = () => screen.getByRole('button', { name: /row 1, column 2/i })
    square().focus()
    fireEvent.keyDown(square(), { key: '3' })
    // The write landed, and the board says which square took it.
    expect(square().getAttribute('aria-label')).toContain('patch A of five squares, 3')
    expect(square()).toHaveAttribute('aria-pressed', 'true')
    expect(document.body.textContent).toContain('Now tap a number for row 1, column 2.')
    fireEvent.keyDown(square(), { key: 'Escape' })
    expect(square()).toHaveAttribute('aria-pressed', 'false')
    expect(document.body.textContent).toContain('Tap a square, then tap a number.')
    view.unmount()
  })

  it('offers every key on the pad, including the ones a small patch cannot take', () => {
    const state = fixture()
    const { dispatch, by } = paint(state)
    fireEvent.click(by(/row 4, column 2/i)) // the two-square patch
    for (const value of [1, 2, 3, 4, 5]) {
      expect(by(new RegExp(`^put ${value} in the square$`, 'i'))).toBeEnabled()
    }
    // The tap lands, the board says why it cannot stay, and nothing is sent on.
    fireEvent.click(by(/^put 5 in the square$/i))
    expect(dispatch).not.toHaveBeenCalled()
    expect(
      screen.getAllByRole('status').map((el) => el.textContent).join(' '),
    ).toContain('A patch of two squares holds only 1 and 2.')
  })

  it('draws the refused number in the square it was put in, for one cue', () => {
    const state = fixture()
    const { by, view } = paint(state)
    fireEvent.click(by(/row 4, column 2/i))
    fireEvent.click(by(/^put 5 in the square$/i))
    const square = view.container.querySelector(`.${cues.flash}`)
    expect(square?.getAttribute('aria-label')).toContain('patch D of two squares, 5')
  })

  it('answers a number too big for its patch with that rule and no other', () => {
    // Row 4, column 2 is in the domino, and the P of five above it holds a
    // printed 5 in a square that touches it. So a 5 here is both too big for
    // its patch and the same number as a neighbour — but it is refused, which
    // means it never lands, and a rule about the numbers on the board cannot
    // be about a number the board does not have. One tap, one sentence, and
    // nothing red left over for a second sentence to point at.
    const { by, view } = paint(fixture())
    fireEvent.click(by(/row 4, column 2/i))
    fireEvent.click(by(/^put 5 in the square$/i))
    const square = view.container.querySelector(`.${cues.flash}`) as HTMLElement
    expect(square.getAttribute('aria-label')).toBe('Row 4, column 2, patch D of two squares, 5')
    expect(square).not.toHaveAttribute('data-conflict')
    expect(document.body.textContent).not.toContain('Red means')
    for (const line of screen.getAllByRole('status')) {
      expect(line.textContent).toBe('A patch of two squares holds only 1 and 2.')
    }
  })

  it('takes the key back once the player has asked for a rule to refuse up front', () => {
    const state = fixture()
    const { by } = paint(state, false, false)
    fireEvent.click(by(/row 4, column 2/i))
    expect(by(/^put 2 in the square$/i)).toBeEnabled()
    const dead = by(/holds only 1 and 2\. put 5 in the square\./i)
    expect(dead).toBeDisabled()
    expect(by(/holds only 1 and 2\. put 3 in the square\./i)).toBeDisabled()
  })

  it('lights the patch and shakes both numbers when one repeats another', () => {
    const view = play(fixture())
    // The P of five already holds a printed 5 at row 3, column 2.
    fireEvent.click(screen.getByRole('button', { name: /row 3, column 4/i }))
    fireEvent.click(screen.getByRole('button', { name: /^put 5 in the square$/i }))
    expect(
      screen.getAllByRole('status').map((el) => el.textContent).join(' '),
    ).toContain('This patch already has a 5.')
    expect(view.container.querySelectorAll(`.${cues.highlight}`).length).toBe(5)
    expect(view.container.querySelectorAll(`.${cues.shake}`).length).toBe(2)
    view.unmount()
  })

  it('rubs a square out from the rubber key, and keeps it dead while there is nothing to rub', () => {
    const view = play(fixture())
    fireEvent.click(screen.getByRole('button', { name: /row 1, column 2/i }))
    expect(screen.getByRole('button', { name: /rub out the square/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^put 3 in the square$/i }))
    fireEvent.click(screen.getByRole('button', { name: /rub out the square/i }))
    expect(
      screen.getByRole('button', { name: /row 1, column 2, patch A of five squares, empty/i }),
    ).toBeInTheDocument()
    view.unmount()
  })

  it('walks the arrow keys over the squares a player may write in, with one tab stop', () => {
    const state = fixture()
    const { all } = paint(state)
    const squares = () => all().filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Row'))
    squares()[0].focus()
    expect(document.activeElement?.getAttribute('aria-label')).toContain('Row 1, column 2')
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
    // Column 3 is printed, so the walk carries on to column 4.
    expect(document.activeElement?.getAttribute('aria-label')).toContain('Row 1, column 4')
    const stops = squares().filter((b) => b.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
    expect(stops[0].getAttribute('aria-label')).toContain('Row 1, column 4')
    // And it stops at the edge rather than wrapping round to the next row.
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('aria-label')).toContain('Row 1, column 4')
  })

  it('writes from the number keys on the keyboard, and rubs out with Backspace', () => {
    const view = play(fixture())
    const square = screen.getByRole('button', { name: /row 1, column 2/i })
    square.focus()
    fireEvent.keyDown(square, { key: '3' })
    expect(
      screen.getByRole('button', { name: /row 1, column 2, patch A of five squares, 3/i }),
    ).toBeInTheDocument()
    // And typing it again writes what is already there, which is nothing
    // happening: the same key on the pad is dead for the same reason.
    fireEvent.keyDown(screen.getByRole('button', { name: /row 1, column 2/i }), { key: '3' })
    expect(
      screen.getByRole('button', { name: /row 1, column 2, patch A of five squares, 3/i }),
    ).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: /row 1, column 2/i }), {
      key: 'Backspace',
    })
    expect(
      screen.getByRole('button', { name: /row 1, column 2, patch A of five squares, empty/i }),
    ).toBeInTheDocument()
    view.unmount()
  })

  it('ignores every input while locked', () => {
    const { dispatch, all } = paint(fixture(), true)
    for (const button of all()) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('leaves the title, hints, move count and win message to the shell', () => {
    paint(fixture())
    const text = document.body.textContent ?? ''
    expect(text).not.toContain(suguru.title)
    expect(text).not.toContain(suguru.tagline)
    for (const line of suguru.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

describe('the words', () => {
  it('gives every level a stable id, a short label and three hints', () => {
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    for (const level of levels) {
      expect(level.label.length).toBeLessThanOrEqual(24)
      expect(level.hints).toHaveLength(3)
      for (const hint of level.hints) {
        expect(hint.length).toBeGreaterThan(20)
        // A hint is read off a phone in the middle of a puzzle, so it is one
        // or two short sentences and the cap says so out loud. The two longest
        // in this collection were both here, at 147 and 138, until the cap
        // went in; the longest anywhere else is 134.
        expect(hint.length, hint).toBeLessThanOrEqual(130)
        expect(hint).toMatch(/[.!?]$/)
      }
    }
  })

  it('never names a patch in a hint that the board does not have', () => {
    // A hint is about the board in front of the child, and these three name a
    // patch on it. Level 1 sends them to a patch of two squares; level 2 to a
    // patch with one square left to fill; level 3 tells them to work outwards
    // from the small ones. `deal` is what keeps all three sentences true —
    // `smallest` for the first and third, `nearlyFull` for the second — and it
    // is checked here rather than assumed.
    const [first, second, third] = levels
    expect(first.hints[0]).toContain('A patch of two squares')
    expect(second.hints[0]).toContain('A patch with one square left to fill')
    expect(third.hints[1]).toContain('Work outwards from the small ones')
    for (const seed of SEEDS) {
      const one = start(first, seed)
      const two = start(second, seed)
      const three = start(third, seed)
      expect(smallestOpenPatch(one.patches, one.givens), `seed ${seed}`).toBe(2)
      expect(nearlyFullPatches(two.patches, two.givens), `seed ${seed}`).toBeGreaterThanOrEqual(1)
      expect(smallestOpenPatch(three.patches, three.givens), `seed ${seed}`).toBeLessThanOrEqual(3)
    }
  })

  it('never hands the answer over in a hint', () => {
    for (const level of levels) {
      for (const hint of level.hints) {
        expect(hint, hint).not.toMatch(/row \d|column \d/i)
      }
    }
  })
})
