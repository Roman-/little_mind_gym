import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Pictogram } from '../../components/Pictogram'
import { makeRng, randInt, shuffled } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { Board } from './Board'
import { PipeMark } from './glyphs'
import { pipes } from './index'
import type { Dealt, PipesAction, PipesConfig, PipesState } from './logic'
import {
  DOWN,
  FALLBACK,
  LEFT,
  RIGHT,
  SOLVED_LINE,
  SPLIT_LINE,
  UP,
  beyond,
  deal,
  describeMove,
  endsOf,
  fits,
  growNetwork,
  init,
  isSolved,
  isStraight,
  lookAlikes,
  offsetsFor,
  openEnds,
  period,
  pictures,
  reduce,
  scrambleFits,
  settle,
  settleTrusting,
  sidesAt,
  sourceFor,
  squareLabel,
  statusLine,
  tapsBetween,
  turn,
  wetSquares,
} from './logic'

/** The stylesheet as written, so the design rules can be asserted on it. */
// (Built by hand rather than `new URL('./x', import.meta.url)`, which Vite rewrites.)
const css = readFileSync(
  new URL(import.meta.url).pathname.replace(/[^/]+$/, 'board.module.css'),
  'utf8',
)

const levels = pipes.levels as PuzzleLevel<PipesConfig>[]
/** 50 unrelated seeds, spread out so consecutive runs of mulberry32 do not overlap. */
const SEEDS = Array.from({ length: 50 }, (_, i) => 1013 + i * 7919)

/**
 * The dealt boards, dealt once. The third level takes about 3ms a deal, and
 * most blocks below walk the same fifty seeds a level, so dealing them afresh
 * for every block would cost more than everything the blocks then check.
 */
const cache = new Map<string, PipesState>()
const start = (level: PuzzleLevel<PipesConfig>, seed: number): PipesState => {
  const key = `${level.id}:${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const state = init(level, makeRng(seed))
  cache.set(key, state)
  return state
}

const tapAll = (state: PipesState, indices: readonly number[]) =>
  indices.reduce<PipesState>((s, index) => reduce(s, { type: 'turn', index }), state)

/** The answer as `settle` finds it. Only the proofs below keep away from `settle`. */
const answerOf = (state: PipesState) => settle(state.n, state.pieces, state.source).answer as number[]

/** The turns that put every square at its answer: the solved position. */
const solvedTurns = (state: PipesState) => state.pieces.map((p, i) => tapsBetween(p, answerOf(state)[i]))

/* ------------------------------------------------------------------
   The independent counters. Written here, over the rules as the
   child reads them, and knowing nothing of `settle`: a pipe end
   meets an end pointing back, and none points off the board.
   ------------------------------------------------------------------ */

/** `mask` turned `k` quarter turns clockwise, written again rather than borrowed. */
const spun = (mask: number, k: number) => {
  let m = mask
  for (let t = 0; t < k; t++) m = ((m << 1) | (m >> 3)) & 15
  return m
}

/** Each side of square `i`: its bit, the square beyond it (-1 off the board), and the bit facing back. */
const around = (n: number, i: number): [number, number, number][] => {
  const r = Math.floor(i / n)
  const c = i % n
  return [
    [1, r > 0 ? i - n : -1, 4],
    [2, c < n - 1 ? i + 1 : -1, 8],
    [4, r < n - 1 ? i + n : -1, 1],
    [8, c > 0 ? i - 1 : -1, 2],
  ]
}

/** True when picture `p` on square `i` points nowhere off the board and agrees with every placed neighbour. */
const agrees = (n: number, pic: readonly number[], i: number, p: number) =>
  around(n, i).every(([side, j, back]) => {
    const has = (p & side) !== 0
    if (j < 0) return !has
    return pic[j] < 0 || has === ((pic[j] & back) !== 0)
  })

/**
 * Every way to turn the board that `isSolved` accepts, up to `cap`, as turn
 * vectors. A column-major search that matches ends against the edge and the
 * squares already placed, with no ring pruning and no reasoning at all:
 * `isSolved` alone judges each full picture. It is the engine skeptic's
 * counter, and it proves one answer on its own terms.
 */
function answersOf(n: number, source: number, pieces: number[], cap: number): number[][] {
  const N = n * n
  const order: number[] = []
  for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) order.push(r * n + c)
  const pic = new Array<number>(N).fill(-1)
  const turns = new Array<number>(N).fill(0)
  const out: number[][] = []
  const walk = (k: number) => {
    if (out.length >= cap) return
    if (k === N) {
      if (isSolved({ n, source, pieces, turns: turns.slice() })) out.push(turns.slice())
      return
    }
    const i = order[k]
    const seen = new Set<number>()
    for (let t = 0; t < 4; t++) {
      const p = spun(pieces[i], t)
      if (seen.has(p) || !agrees(n, pic, i, p)) continue
      seen.add(p)
      pic[i] = p
      turns[i] = t
      walk(k + 1)
      pic[i] = -1
      turns[i] = 0
    }
  }
  walk(0)
  return out
}

/** The same search with no `isSolved`: every picture in which every pipe end meets another. */
function allMeet(n: number, pieces: number[], cap: number): number[][] {
  const N = n * n
  const pic = new Array<number>(N).fill(-1)
  const turns = new Array<number>(N).fill(0)
  const out: number[][] = []
  const walk = (i: number) => {
    if (out.length >= cap) return
    if (i === N) {
      out.push(turns.slice())
      return
    }
    const seen = new Set<number>()
    for (let t = 0; t < 4; t++) {
      const p = spun(pieces[i], t)
      if (seen.has(p) || !agrees(n, pic, i, p)) continue
      seen.add(p)
      pic[i] = p
      turns[i] = t
      walk(i + 1)
      pic[i] = -1
      turns[i] = 0
    }
  }
  walk(0)
  return out
}

/** Pipe ends of square `i` that meet nothing: off the board, or at a side with no pipe. */
const openAt = (n: number, pic: readonly number[], i: number) =>
  around(n, i).filter(([side, j, back]) => (pic[i] & side) !== 0 && (j < 0 || (pic[j] & back) === 0)).length

/** A flood from the drop, written again: the squares joined to it through ends that meet. */
function flood(n: number, source: number, pic: readonly number[]): boolean[] {
  const wet = pic.map((_, i) => i === source)
  const queue = [source]
  while (queue.length > 0) {
    const i = queue.shift() as number
    for (const [side, j, back] of around(n, i)) {
      if (j >= 0 && !wet[j] && (pic[i] & side) !== 0 && (pic[j] & back) !== 0) {
        wet[j] = true
        queue.push(j)
      }
    }
  }
  return wet
}

/* ------------------------------------------------------------------
   The children. A careful child works out one square at a time, choosing
   at random among the squares that the edge and the neighbours force
   right now (or else, when those run dry, the flower rule), and turns it
   straight to its answer. A trusting child does the same but also treats
   every pipe whose ends all meet as known.
   ------------------------------------------------------------------ */

/** The pictures of square `i` that the known squares allow, under rule 1 or rule 1 and 2. */
const allowed = (
  n: number,
  piece: number,
  i: number,
  known: readonly number[],
  flower: readonly boolean[],
  rule: 1 | 2,
) =>
  pictures(piece).filter((p) =>
    around(n, i).every(([side, j, back]) => {
      const has = (p & side) !== 0
      if (j < 0) return !has
      if (known[j] >= 0) return has === ((known[j] & back) !== 0)
      return !(rule === 2 && has && flower[i] && flower[j])
    }),
  )

/** Squares forced right now: by rule 1, or by rule 2 only when rule 1 finds nothing. */
function forced(n: number, start: readonly number[], known: readonly number[], flower: readonly boolean[]) {
  for (const rule of [1, 2] as const) {
    const found: [number, number][] = []
    for (let i = 0; i < start.length; i++) {
      if (known[i] >= 0) continue
      const left = allowed(n, start[i], i, known, flower, rule)
      if (left.length === 1) found.push([i, left[0]])
    }
    if (found.length > 0) return found
  }
  return []
}

interface Walked {
  /** Wrong squares that showed every end meeting, summed over the steps. */
  lookAlikes: number
  /** Open ends of worked-out squares that point off the board, or at a neighbour already at its answer. */
  heldAtRight: number
  /** The most worked-out squares showing an open end at once: what the child holds in their head. */
  mostHeld: number
  finished: boolean
}

function carefulWalk(n: number, start: number[], answer: number[], source: number, pick: (k: number) => number): Walked {
  const N = n * n
  const done = new Array<number>(N).fill(-1)
  const flower = start.map((p, i) => i !== source && endsOf(p) === 1)
  const pic = start.slice()
  const out: Walked = { lookAlikes: 0, heldAtRight: 0, mostHeld: 0, finished: false }
  for (;;) {
    const found = forced(n, start, done, flower)
    if (found.length === 0) break
    const [i, p] = found[pick(found.length)]
    done[i] = p
    pic[i] = p
    let held = 0
    for (let j = 0; j < N; j++) {
      if (done[j] < 0) {
        if (pic[j] !== answer[j] && openAt(n, pic, j) === 0) out.lookAlikes++
        continue
      }
      if (openAt(n, pic, j) === 0) continue
      held++
      for (const [side, w, back] of around(n, j)) {
        if ((pic[j] & side) !== 0 && (w < 0 || (pic[w] & back) === 0) && (w < 0 || pic[w] === answer[w])) {
          out.heldAtRight++
        }
      }
    }
    out.mostHeld = Math.max(out.mostHeld, held)
  }
  out.finished = pic.every((p, j) => p === answer[j])
  return out
}

/** Returns how many times the trusting child treated a wrong square as known, and whether it finished. */
function trustingWalk(n: number, start: number[], answer: number[], source: number, pick: (k: number) => number) {
  const N = n * n
  const pic = start.slice()
  const worked = new Array<boolean>(N).fill(false)
  const flower = start.map((p, i) => i !== source && endsOf(p) === 1)
  let trustedWrong = 0
  for (;;) {
    const known = pic.map((p, i) => (worked[i] || openAt(n, pic, i) === 0 ? p : -1))
    for (let i = 0; i < N; i++) if (known[i] >= 0 && known[i] !== answer[i]) trustedWrong++
    const found = forced(n, start, known, flower)
    if (found.length === 0) break
    const [i, p] = found[pick(found.length)]
    pic[i] = p
    worked[i] = true
  }
  return { trustedWrong, finished: pic.every((p, j) => p === answer[j]) }
}

/* ================================================================== */

describe('the pipes — the levels', () => {
  it('are three, escalating, with stable ids and three hints each', () => {
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['pipes-3x3', 'pipes-4x4', 'pipes-5x5'])
    expect(levels.map((l) => l.label)).toEqual(['Nine pipes', 'Sixteen pipes', 'Twenty-five pipes'])
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      for (const hint of level.hints) {
        expect(hint.trim().length).toBeGreaterThanOrEqual(20)
        // A hint an eight-year-old will actually read to the end.
        expect(hint.length).toBeLessThanOrEqual(120)
      }
      // Sentence case: a capital first, and no other word shouting.
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
    }
  })

  it('declares a par on every level that is its config’s, rising, and never past the tower of Hanoi’s 31', () => {
    expect(levels.map((l) => l.par)).toEqual([12, 20, 30])
    for (const level of levels) expect(level.par).toBe(level.config.par)
    const pars = levels.map((l) => l.par as number)
    expect(pars[0]).toBeLessThan(pars[1])
    expect(pars[1]).toBeLessThan(pars[2])
    for (const par of pars) expect(par).toBeLessThanOrEqual(31)
  })

  it('grows 3x3, 4x4, 5x5, and keeps the flower rule for the last', () => {
    expect(levels.map((l) => l.config.n)).toEqual([3, 4, 5])
    expect(levels.map((l) => [l.config.minPasses, l.config.maxPasses])).toEqual([
      [3, 4],
      [4, 6],
      [6, 12],
    ])
    expect(levels.map((l) => l.config.minFirst)).toEqual([1, 1, 1])
    expect(levels.map((l) => [l.config.minFlowerRule, l.config.maxFlowerRule])).toEqual([
      [0, 0],
      [0, 0],
      [1, 99],
    ])
  })

  it('says what it is, in plain words and with no emoji', () => {
    const copy = [pipes.title, pipes.tagline, ...pipes.instructions, ...levels.flatMap((l) => [l.label, ...l.hints])]
    for (const line of copy) {
      expect(line).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(line).not.toMatch(/!/)
    }
    expect(pipes.instructions.length).toBeGreaterThanOrEqual(2)
    expect(pipes.instructions.length).toBeLessThanOrEqual(4)
    expect(pipes.id).toBe('pipes')
    expect(pipes.title).toBe('The pipes')
    expect(pipes.reseedable).toBe(true)
  })

  it('calls each thing by one name: a pipe, a pipe end, the drop, a flower', () => {
    // The thing a child taps is always a pipe, and a square is only a place.
    // Two pipe ends "meet"; nothing joins, connects or lines up. A pipe end
    // "points off the board"; nothing "ends in the open" or leaks. And a
    // pipe the child has reasoned out is one "you are sure of", never one
    // that is settled or finished — those are the solver's words. Everything
    // the child reads or hears is held to it: the card, the drawer, the
    // board's own sentences and every square's label.
    const state = start(levels[2], SEEDS[0])
    const copy = [
      pipes.tagline,
      ...pipes.instructions,
      ...levels.flatMap((l) => l.hints),
      SOLVED_LINE,
      SPLIT_LINE,
      ...state.pieces.map((_, i) => squareLabel(state, i)),
    ]
    for (const line of copy) {
      expect(line).not.toMatch(/\b(piece|pieces|tile|tiles|settled|finished)\b/i)
      expect(line).not.toMatch(/\b(join\w*|connect\w*|mouths?|arms?|openings?|leak\w*|leaf)\b/i)
      expect(line).not.toMatch(/in the open|lines? up|dead end|the (tap|well)\b|drop of water/i)
    }
  })
})

describe('the pipes — the deal', () => {
  for (const level of levels) {
    const { n, par } = level.config

    it(`"${level.label}" deals ${n * n} untouched pipes, no cross, around the drop, and unsolved, for 50 seeds`, () => {
      const middle = n % 2 === 1 ? [((n - 1) / 2) * n + (n - 1) / 2] : [5, 6, 9, 10]
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.n).toBe(n)
        expect(state.pieces).toHaveLength(n * n)
        expect(state.turns).toEqual(new Array(n * n).fill(0))
        expect(middle).toContain(state.source)
        for (const piece of state.pieces) {
          expect(endsOf(piece)).toBeGreaterThanOrEqual(1)
          expect(endsOf(piece)).toBeLessThanOrEqual(3)
        }
        expect(isSolved(state)).toBe(false)
      }
    })

    it(`"${level.label}" reasons out for both children inside its window, with no look-alike, for 50 seeds`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const careful = settle(n, state.pieces, state.source)
        const trusting = settleTrusting(n, state.pieces, state.source)
        expect(careful.answer).not.toBeNull()
        expect(fits(level.config, careful)).toBe(true)
        expect(trusting.answer).not.toBeNull()
        expect(fits(level.config, trusting)).toBe(true)
        expect(trusting.answer).toEqual(careful.answer)
        expect(lookAlikes(n, state.pieces, careful.answer as number[])).toEqual([])
        // Every square is worked out once, by exactly one of the two rules: all
        // of them for the careful child, and for the trusting child all but
        // the ones it trusted as they stood.
        expect(careful.order).toHaveLength(n * n)
        expect(new Set(careful.order).size).toBe(n * n)
        expect(careful.byEdge + careful.byFlowerRule).toBe(n * n)
        expect(trusting.byEdge + trusting.byFlowerRule).toBe(trusting.order.length)
        expect(new Set(trusting.order).size).toBe(trusting.order.length)
      }
    })

    it(`"${level.label}" has exactly one answer, found by a counter that knows nothing of the solver`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const found = answersOf(n, state.source, state.pieces, 3)
        expect(found).toHaveLength(1)
        expect(state.pieces.map((p, i) => spun(p, found[0][i]))).toEqual(answerOf(state))
      }
    })

    it(`"${level.label}" needs exactly ${par} taps: the fewest the counter finds, and the closed form`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // The true fewest taps: the least, over every answer isSolved takes, of
        // the turns it needs. There is only one, but this does not assume so.
        const fewest = Math.min(
          ...answersOf(n, state.source, state.pieces, 3).map((t) => t.reduce((a, b) => a + b, 0)),
        )
        expect(fewest).toBe(par)

        // Taps on different squares commute and a square reaches its answer
        // only after its own clockwise taps, so par is their sum.
        const answer = answerOf(state)
        const taps = state.pieces.map((p, i) => tapsBetween(p, answer[i]))
        expect(taps.reduce((a, b) => a + b, 0)).toBe(par)

        const plan = taps.flatMap((k, i) => new Array<number>(k).fill(i))
        expect(isSolved(tapAll(state, plan))).toBe(true)
        // ...and one tap short on any square is not solved.
        for (let i = 0; i < taps.length; i++) {
          if (taps[i] === 0) continue
          const short = plan.slice()
          short.splice(short.indexOf(i), 1)
          expect(isSolved(tapAll(state, short))).toBe(false)
        }
      }
    })

    it(`"${level.label}" is deterministic for a seed, and all 50 seeds deal different boards`, () => {
      for (const seed of SEEDS.slice(0, 5)) {
        expect(init(level, makeRng(seed))).toEqual(init(level, makeRng(seed)))
      }
      // Measured: every one of the fifty differs. The contract asks for thirty.
      expect(new Set(SEEDS.map((seed) => start(level, seed).pieces.join())).size).toBe(50)
    })
  }

  it('matches breadth-first search on "Nine pipes", which knows neither the answer nor the solver', () => {
    // BFS is handed nothing but the rules: every square is a move, and
    // `isSolved` says when to stop. So a closer second answer would be found
    // if there were one. Within 12 taps of a start there are at most 100,796
    // positions (the bound for nine four-way pieces), under search's cap of
    // 200,000. Measured at 1.6s for the three seeds, and 3.3s on a busier
    // machine, hence the timeout.
    const level = levels[0]
    const key = (s: PipesState) => s.turns.map((t, i) => t % period(s.pieces[i])).join('')
    for (const seed of SEEDS.slice(0, 3)) {
      const state = start(level, seed)
      const path = shortestSolution<PipesState, PipesAction>({
        start: state,
        moves: (s) => s.pieces.map((_, index) => ({ type: 'turn', index })),
        apply: reduce,
        key,
        solved: isSolved,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(level.par as number)
      expect(isSolved((path as PipesAction[]).reduce(reduce, state))).toBe(true)
    }
  }, 30_000)

  it('never falls back, and ships no look-alike, over 200 seeds a level', () => {
    // Measured at 0 fallbacks on 20,000 shell-range seeds a level as well;
    // the most networks any of those deals needed was 4, 11 and 149 of 400.
    const median = (xs: number[]) => {
      const sorted = xs.slice().sort((a, b) => a - b)
      return (sorted[xs.length / 2 - 1] + sorted[xs.length / 2]) / 2
    }
    const networks: number[][] = []
    const scrambles: number[][] = []
    for (const level of levels) {
      const { n } = level.config
      const drawn: Dealt[] = []
      for (let k = 0; k < 200; k++) drawn.push(deal(makeRng(1013 + k * 7919), level.config))
      for (const d of drawn) {
        expect(d.fallback).toBe(0)
        // The board that ships, and not only the scrambles `scrambleFits` saw.
        expect(lookAlikes(n, d.start, d.answer)).toEqual([])
      }
      networks.push(drawn.map((d) => d.attempts))
      scrambles.push(drawn.map((d) => d.scrambles))
    }
    // What a deal costs, on these seeds: networks drawn, of the 400 allowed,
    // and scrambles drawn over all of them. Most of the third level's cost is
    // the scrambles that the look-alike filter and the trusting child's
    // window turn down.
    expect(networks.map(median)).toEqual([1, 1, 12])
    expect(networks.map((xs) => Math.max(...xs))).toEqual([2, 8, 87])
    expect(scrambles.map(median)).toEqual([2, 8, 41])
    expect(scrambles.map((xs) => Math.max(...xs))).toEqual([28, 69, 365])
  })

  it('scrambles to exactly par, and never past what the pieces can take', () => {
    for (const level of levels) {
      const { n, par } = level.config
      const rng = makeRng(level.difficulty)
      for (let k = 0; k < 200; k++) {
        const network = growNetwork(rng, n, sourceFor(rng, n)) as number[]
        expect(network).not.toBeNull()
        expect(network).not.toContain(15)
        const periods = network.map(period)
        const capacity = periods.reduce((a, p) => a + p - 1, 0)
        // A corner square has neighbours on two perpendicular sides only, so
        // it is never a straight: at most n² - 4 straights, and a capacity of
        // at least n² + 8, which is more than par on every level.
        expect(capacity).toBeGreaterThanOrEqual(n * n + 8)
        expect(n * n + 8).toBeGreaterThanOrEqual(par)
        const off = offsetsFor(rng, periods, par) as number[]
        expect(off.reduce((a, b) => a + b, 0)).toBe(par)
        off.forEach((d, i) => {
          expect(d).toBeGreaterThanOrEqual(0)
          expect(d).toBeLessThan(periods[i])
        })
        expect(offsetsFor(rng, periods, capacity + 1)).toBeNull()
        expect(offsetsFor(rng, periods, capacity)).toEqual(periods.map((p) => p - 1))
      }
    }
    // A straight takes at most one tap: two more and it looks the same again.
    expect(offsetsFor(makeRng(1), [2, 2, 2], 3)).toEqual([1, 1, 1])
    expect(offsetsFor(makeRng(1), [2, 2, 2], 4)).toBeNull()
  })

  it('reports a wrong pipe whose every end could meet, and not one with an end off the board', () => {
    // FALLBACK[3], by rows: a bend going right and down, a bend going down and
    // left, a flower going down; a flower going up, the drop going up, right
    // and down, a pipe going up, down and left; a flower going right, a bend
    // going up and left, a flower going up.
    const { source, answer } = FALLBACK[3]
    const start = answer.slice()
    // The corner bend turned wrong points off the board: always safe.
    start[0] = turn(answer[0], 1)
    // The drop turned to go right, down and left, and the flower beside it
    // turned to point back at it: both show every end meeting, and both are
    // wrong. That is a look-alike, twice.
    start[4] = turn(answer[4], 1)
    start[3] = turn(answer[3], 1)
    expect(start[4]).toBe(RIGHT | DOWN | LEFT)
    expect(start[3]).toBe(RIGHT)
    expect(lookAlikes(3, start, answer)).toEqual([3, 4])
    expect(scrambleFits(levels[0].config, source, answer, start)).toBe(false)
    // Turn the flower back to its answer and the drop's left end can never
    // meet anything, as dealt or at its answer: no look-alike left.
    start[3] = answer[3]
    expect(lookAlikes(3, start, answer)).toEqual([])
  })

  it('scrambleFits turns down every scramble with a look-alike, and most raw scrambles have one', () => {
    // This is the filter alone. That no dealt board carries a look-alike is
    // held on the boards themselves, in "never falls back" above.
    let caught = 0
    for (const level of levels) {
      const { n, par } = level.config
      const { source, answer } = FALLBACK[n]
      const rng = makeRng(11)
      for (let k = 0; k < 200; k++) {
        const off = offsetsFor(rng, answer.map(period), par) as number[]
        const start = answer.map((p, i) => turn(p, -off[i]))
        if (lookAlikes(n, start, answer).length === 0) continue
        caught++
        expect(scrambleFits(level.config, source, answer, start)).toBe(false)
      }
    }
    // Most raw scrambles have one, which is what the filter is for.
    expect(caught).toBeGreaterThan(300)
  })

  it('holds each fallback network to its own level', () => {
    const fitting: number[] = []
    const capacities: number[] = []
    for (const level of levels) {
      const { n, par } = level.config
      const { source, answer } = FALLBACK[n]
      expect(answer).toHaveLength(n * n)
      expect(answer).not.toContain(15)
      expect(fits(level.config, settle(n, answer, source))).toBe(true)
      expect(answersOf(n, source, answer, 3)).toHaveLength(1)
      const capacity = answer.reduce((a, p) => a + period(p) - 1, 0)
      expect(capacity).toBeGreaterThanOrEqual(par)
      capacities.push(capacity)
      const rng = makeRng(5)
      let ok = 0
      for (let k = 0; k < 400; k++) {
        const off = offsetsFor(rng, answer.map(period), par) as number[]
        if (scrambleFits(level.config, source, answer, answer.map((p, i) => turn(p, -off[i])))) ok++
      }
      fitting.push(ok)
    }
    expect(capacities).toEqual([27, 40, 71])
    // Scrambles of 400 that a fallback could ship, measured.
    expect(fitting).toEqual([135, 58, 8])
  })

  it('deals inside a blink', () => {
    // Measured over 1,000 seeds: a median of 0.08, 0.28 and 3.02ms a deal,
    // and 58.6ms at worst over 20,000 shell-range seeds.
    for (const level of levels) {
      const t = performance.now()
      init(level, makeRng(4242))
      expect(performance.now() - t).toBeLessThan(400)
    }
  })

  it('never mutates the level it is handed, and uses the rng', () => {
    const level = Object.freeze({
      ...levels[2],
      config: Object.freeze({ ...levels[2].config }),
      hints: Object.freeze([...levels[2].hints]) as unknown as string[],
    }) as PuzzleLevel<PipesConfig>
    const before = JSON.stringify(level)
    const state = init(level, makeRng(99))
    expect(JSON.stringify(level)).toBe(before)
    expect(state.pieces).toHaveLength(25)
    expect(deal(makeRng(1), levels[1].config).start).not.toEqual(deal(makeRng(2), levels[1].config).start)
  })
})

describe('the pipes — the reducer', () => {
  const state = start(levels[1], SEEDS[0])

  it('turns exactly the tapped pipe a quarter turn clockwise, and nothing else', () => {
    for (let i = 0; i < state.pieces.length; i++) {
      const next = reduce(state, { type: 'turn', index: i })
      expect(next).not.toBe(state)
      expect(sidesAt(next, i)).toBe(turn(sidesAt(state, i), 1))
      // Every tap changes the picture: no cross is dealt.
      expect(sidesAt(next, i)).not.toBe(sidesAt(state, i))
      for (let j = 0; j < state.pieces.length; j++) if (j !== i) expect(sidesAt(next, j)).toBe(sidesAt(state, j))
      expect(next.pieces).toBe(state.pieces)
    }
    // Clockwise: up becomes right, right becomes down.
    expect(turn(UP, 1)).toBe(RIGHT)
    expect(turn(RIGHT | DOWN, 1)).toBe(DOWN | LEFT)
    expect(turn(UP | RIGHT | DOWN, -1)).toBe(LEFT | UP | RIGHT)
  })

  it('comes back round after four taps, and a straight after two', () => {
    for (let i = 0; i < state.pieces.length; i++) {
      expect(tapAll(state, [i, i, i, i]).turns).toEqual(state.turns)
      const twice = tapAll(state, [i, i])
      expect(sidesAt(twice, i) === sidesAt(state, i)).toBe(isStraight(state.pieces[i]))
    }
  })

  it('returns the IDENTICAL state object for every action that changes nothing', () => {
    const N = state.pieces.length
    for (const index of [-1, N, N + 40, 1.5, NaN, Infinity]) {
      expect(reduce(state, { type: 'turn', index })).toBe(state)
    }
    // An action the engine does not know about must be ignored, not applied.
    for (const bogus of [{ type: 'nudge' }, { type: '' }, {}, null]) {
      expect(reduce(state, bogus as unknown as PipesAction)).toBe(state)
    }
  })

  it('never mutates the state it is given', () => {
    const frozen: PipesState = Object.freeze({
      ...state,
      pieces: Object.freeze(state.pieces.slice()) as unknown as number[],
      turns: Object.freeze(state.turns.slice()) as unknown as number[],
    })
    const before = JSON.stringify(frozen)
    const next = reduce(frozen, { type: 'turn', index: 5 })
    expect(JSON.stringify(frozen)).toBe(before)
    expect(next.turns[5]).toBe(1)
  })

  it('is solved on the answer and not a tap away from it, nor on an empty board', () => {
    const solved = { ...state, turns: solvedTurns(state) }
    expect(isSolved(solved)).toBe(true)
    for (let i = 0; i < state.pieces.length; i++) {
      expect(isSolved(reduce(solved, { type: 'turn', index: i }))).toBe(false)
    }
    expect(isSolved({ n: 0, source: 0, pieces: [], turns: [] })).toBe(false)
  })

  it('is not solved when every end meets but the pipes are two networks', () => {
    // By rows: a bend going right and down, a bend going down and left, a
    // flower going down; a bend going up and right, the drop going up and
    // left, a straight going up and down; a flower going right, a straight
    // going right and left, a bend going up and left. A ring of four through
    // the drop, and a line of five that never meets it.
    const split: PipesState = { n: 3, source: 4, pieces: [6, 12, 4, 3, 9, 5, 2, 10, 9], turns: new Array(9).fill(0) }
    expect(openEnds(split)).toBe(0)
    expect(wetSquares(split).map(Number).join('')).toBe('110110000')
    expect(isSolved(split)).toBe(false)
  })

  it('names the move in row and column, one-based', () => {
    const next = reduce(state, { type: 'turn', index: 6 })
    expect(describeMove(state, next, { type: 'turn', index: 6 })).toBe('Turned row 2, column 3')
    expect(describeMove(state, next, { type: 'turn', index: 0 })).toBe('Turned row 1, column 1')
    expect(describeMove(state, next, { type: 'turn', index: 15 })).toBe('Turned row 4, column 4')
  })

  it('has no dead ends: from anywhere, each pipe’s own taps bring it home', () => {
    // So `failure` and `canStillWin` are both left out. Squares turn on their
    // own, and each is at most three taps from its answer whatever came before.
    expect(pipes.engine.failure).toBeUndefined()
    expect(pipes.engine.canStillWin).toBeUndefined()
    for (const level of levels) {
      const rng = makeRng(level.difficulty + 20)
      for (const seed of SEEDS.slice(0, 20)) {
        const dealt = start(level, seed)
        const N = dealt.pieces.length
        const lost = tapAll(dealt, Array.from({ length: 40 }, () => randInt(rng, N)))
        const answer = answerOf(dealt)
        const home = answer.flatMap((want, i) => new Array<number>(tapsBetween(sidesAt(lost, i), want)).fill(i))
        expect(home.length).toBeLessThanOrEqual(3 * N)
        expect(isSolved(tapAll(lost, home))).toBe(true)
      }
    }
  })
})

describe('the pipes — the claims the hints make', () => {
  const corners = (n: number) => [0, n - 1, n * n - n, n * n - 1]
  const onRim = (n: number, i: number) => {
    const r = Math.floor(i / n)
    const c = i % n
    return r === 0 || c === 0 || r === n - 1 || c === n - 1
  }
  const bent = (p: number) => endsOf(p) === 2 && !isStraight(p)
  const offBoard = (n: number, i: number, p: number) => [UP, RIGHT, DOWN, LEFT].some((side) => (p & side) !== 0 && beyond(n, i, side) < 0)

  it('a corner holds only a flower or a bent pipe, and a bent pipe fits a corner one way', () => {
    for (const level of levels) {
      const { n } = level.config
      for (const seed of SEEDS) {
        const state = start(level, seed)
        for (const i of corners(n)) {
          const p = state.pieces[i]
          expect(endsOf(p) === 1 || bent(p)).toBe(true)
          if (bent(p)) expect(pictures(p).filter((q) => !offBoard(n, i, q))).toHaveLength(1)
        }
      }
    }
  })

  it('"Nine pipes": every deal has a bent pipe in a corner, and the first pass settles one', () => {
    const level = levels[0]
    for (const seed of SEEDS) {
      const state = start(level, seed)
      const s = settle(3, state.pieces, state.source)
      const firstPass = s.order.slice(0, s.first)
      expect(firstPass.some((i) => corners(3).includes(i) && bent(state.pieces[i]))).toBe(true)
    }
  })

  it('"Sixteen pipes": the first pass settles only corner bends, edge straights and edge pipes with three ends', () => {
    const level = levels[1]
    for (const seed of SEEDS) {
      const state = start(level, seed)
      const s = settle(4, state.pieces, state.source)
      expect(s.first).toBeGreaterThanOrEqual(1)
      for (const i of s.order.slice(0, s.first)) {
        const p = state.pieces[i]
        const kind =
          (corners(4).includes(i) && bent(p)) ||
          (onRim(4, i) && isStraight(p)) ||
          (onRim(4, i) && endsOf(p) === 3)
        expect(kind).toBe(true)
      }
    }
  })

  it('a straight on the edge runs along it, and a pipe with three ends turns its bare side to the edge', () => {
    for (const level of levels) {
      const { n } = level.config
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const answer = answerOf(state)
        answer.forEach((p, i) => {
          const edgeSides = [UP, RIGHT, DOWN, LEFT].filter((side) => beyond(n, i, side) < 0)
          if (isStraight(p) && onRim(n, i)) {
            for (const side of edgeSides) expect(p & side).toBe(0)
          }
          if (endsOf(p) === 3) {
            expect(corners(n)).not.toContain(i)
            if (onRim(n, i)) expect(15 ^ p).toBe(edgeSides[0])
          }
        })
      }
    }
  })

  it('no answer joins two flowers', () => {
    for (const level of levels) {
      const { n } = level.config
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const answer = answerOf(state)
        const flower = (i: number) => i !== state.source && endsOf(state.pieces[i]) === 1
        answer.forEach((p, i) => {
          if (!flower(i)) return
          expect(flower(beyond(n, i, p))).toBe(false)
        })
      }
    }
  })

  it('"Twenty-five pipes" needs the flower rule on every deal, for both children, and the others never do', () => {
    for (const level of levels) {
      const { n } = level.config
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const careful = settle(n, state.pieces, state.source).byFlowerRule
        const trusting = settleTrusting(n, state.pieces, state.source).byFlowerRule
        if (n === 5) {
          expect(careful).toBeGreaterThanOrEqual(1)
          expect(trusting).toBeGreaterThanOrEqual(1)
        } else {
          expect(careful).toBe(0)
          expect(trusting).toBe(0)
        }
      }
    }
  })
})

describe('the pipes — the working on the board', () => {
  it('shows no look-alike to any child, careful or trusting, in any order of work', () => {
    // Twenty seeds a level and five random orders each. The same measurement
    // over 1,000 seeds a level met none in 15,000 careful walks and trusted
    // nothing wrong in 15,000 trusting ones. Without the filter, a careful
    // child met one in 33.8%, 67.7% and 92.6% of walks.
    const most: number[] = []
    for (const level of levels) {
      const { n } = level.config
      let held = 0
      for (const [k, seed] of SEEDS.slice(0, 20).entries()) {
        const state = start(level, seed)
        const answer = answerOf(state)
        const rng = makeRng(k)
        for (let r = 0; r < 5; r++) {
          const careful = carefulWalk(n, state.pieces, answer, state.source, (m) => randInt(rng, m))
          expect(careful.finished).toBe(true)
          expect(careful.lookAlikes).toBe(0)
          // A worked-out pipe that still shows an open end points at a pipe
          // that is still wrong: if that pipe were right, the two would meet.
          // So it points at the next square to work on.
          expect(careful.heldAtRight).toBe(0)
          held = Math.max(held, careful.mostHeld)
          const trusting = trustingWalk(n, state.pieces, answer, state.source, (m) => randInt(rng, m))
          expect(trusting.finished).toBe(true)
          expect(trusting.trustedWrong).toBe(0)
        }
      }
      most.push(held)
    }
    // What the child still holds in their head at worst, on these walks: the
    // pipes worked out that still show an open end. Over 5,000 walks a level
    // it was 4, 7 and 7 at most, and 1.18, 1.59 and 1.39 on average.
    expect(most).toEqual([3, 5, 5])
  })
})

describe('the pipes — the water', () => {
  /**
   * 2,000 positions a level: from each of the fifty dealt boards, twenty with
   * every pipe turned at random, and twenty that are its answer with nought to
   * four random taps on top, so that the solved picture and the ones next to
   * it are in the sample too.
   */
  const positions = (() => {
    const rng = makeRng(3)
    return levels.map((level) =>
      SEEDS.flatMap((seed) => {
        const dealt = start(level, seed)
        const N = dealt.pieces.length
        const answer = solvedTurns(dealt)
        const random = Array.from({ length: 20 }, () => ({ ...dealt, turns: dealt.turns.map(() => randInt(rng, 4)) }))
        const near = Array.from({ length: 20 }, (_, k) =>
          tapAll({ ...dealt, turns: answer }, Array.from({ length: k % 5 }, () => randInt(rng, N))),
        )
        return [...random, ...near]
      }),
    )
  })()

  it('floods from the drop through ends that meet, and nowhere else', () => {
    for (const set of positions) {
      for (const s of set) {
        const wet = wetSquares(s)
        expect(wet[s.source]).toBe(true)
        expect(wet).toEqual(flood(s.n, s.source, s.pieces.map((p, i) => spun(p, s.turns[i]))))
      }
    }
  })

  it('reaches every pipe only when every end meets, so the goal is one condition', () => {
    // The proof is two facts. The pieces come from a tree on N squares, so
    // between them they carry exactly 2(N - 1) pipe ends: held here on every
    // board dealt and every fallback. And the water reaching all N squares
    // takes at least N - 1 places where two ends meet, no two of them sharing
    // an end — so a board with every square wet has used up every end, and
    // has none left meeting nothing.
    for (const level of levels) {
      for (const seed of SEEDS) {
        const { pieces } = start(level, seed)
        expect(pieces.reduce((a, p) => a + endsOf(p), 0)).toBe(2 * (pieces.length - 1))
      }
    }
    for (const { answer } of Object.values(FALLBACK)) {
      expect(answer.reduce((a, p) => a + endsOf(p), 0)).toBe(2 * (answer.length - 1))
    }

    // And the claim itself, outright, on two "Nine pipes" boards: every
    // picture each can show, 4^9 of them. A random sample cannot do this —
    // of the 3,000 random positions above, not one has every square wet —
    // so this looks at all of them. Over all fifty seeds it is 10,715,136
    // pictures and 6.7s, with the same result on every board.
    const seen = SEEDS.slice(0, 2).map((seed) => {
      const dealt = start(levels[0], seed)
      const periods = dealt.pieces.map(period)
      const total = periods.reduce((a, p) => a * p, 1)
      const answer = answerOf(dealt)
      let wet = 0
      for (let code = 0; code < total; code++) {
        let rest = code
        const turns = periods.map((p) => {
          const t = rest % p
          rest = Math.floor(rest / p)
          return t
        })
        const s = { ...dealt, turns }
        if (!wetSquares(s).every(Boolean)) continue
        wet++
        expect(openEnds(s)).toBe(0)
        expect(s.pieces.map((_, i) => sidesAt(s, i))).toEqual(answer)
      }
      return [total, wet]
    })
    // Every square wet in exactly one picture of each: the answer.
    expect(seen).toEqual([
      [262_144, 1],
      [262_144, 1],
    ])
  })

  it('is not live: the board says nothing while a pipe end meets nothing', () => {
    for (const set of positions) {
      for (const s of set) if (openEnds(s) > 0) expect(statusLine(s)).toBe('')
    }
  })

  it('can only show "every end meets, and still split" on "Twenty-five pipes"', () => {
    // On the first two levels the answer is the only picture in which every
    // end meets, so the sentence cannot appear. Measured on 1,000 deals of
    // each: none. On the third, 988 of 1,000 deals have such a picture.
    for (const level of levels.slice(0, 2)) {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const every = allMeet(state.n, state.pieces, 10)
        expect(every).toEqual([solvedTurns(state)])
      }
    }
    const state = start(levels[2], SEEDS[0])
    const split = { ...state, turns: [2, 1, 1, 0, 1, 3, 1, 3, 3, 1, 1, 0, 0, 1, 0, 2, 0, 1, 1, 3, 0, 1, 0, 2, 2] }
    expect(openEnds(split)).toBe(0)
    expect(isSolved(split)).toBe(false)
    expect(statusLine(split)).toBe('Every pipe end meets another pipe end. The water still cannot reach every pipe.')
    expect(statusLine({ ...state, turns: solvedTurns(state) })).toBe('The water reaches every pipe and every flower.')
    expect(statusLine(state)).toBe('')
  })

  it('can be climbed by the picture alone only a little, and hardly at all on the last level', () => {
    // A child who does no reasoning. Visit the squares in a random order and
    // turn each to the picture with the fewest open ends, ties at random,
    // round and round until the board is solved or three times par is spent.
    // Every look is free, because Step back takes the tap off the count again:
    // it pays only for the taps it leaves on a square.
    //
    // Pinned, because it is a measurement rather than a bound, and these
    // thirty seeds are the front of a wider one. Deal each level over
    // `makeRng(1000 + k * 37)` for k in 0..399, climb with `makeRng(k)`, and
    // this climber lands on "Twenty-five pipes" 0, 18 and 66 times within
    // one, two and three times par. It is the picture's own gradient and it
    // cannot be taken away; it is intrinsic to Net.
    //
    // The water that followed the drop across the board while the child
    // worked would have been a second gradient. With it, the same climber
    // lands 1, 56 and 165 times, which is why there is no live water and the
    // teal appears only on the solving position. A count of dry flowers was
    // nearly as bad (1, 49 and 139) and went too.
    const withTurn = (s: PipesState, i: number, t: number): PipesState => {
      const turns = s.turns.slice()
      turns[i] = t % 4
      return { ...s, turns }
    }
    const climb = (from: PipesState, budget: number, seed: number): number => {
      const rng = makeRng(seed)
      let s = from
      let taps = 0
      const squares = s.pieces.map((_, k) => k)
      for (let sweep = 0; sweep < 400; sweep++)
        for (const i of shuffled(rng, squares)) {
          const seen = Array.from({ length: period(s.pieces[i]) }, (_, k) => -openEnds(withTurn(s, i, s.turns[i] + k)))
          const top = Math.max(...seen)
          const best = seen.map((v, k) => (v === top ? k : -1)).filter((k) => k >= 0)
          const k = best[Math.floor(rng() * best.length)]
          if (k > 0) {
            s = withTurn(s, i, s.turns[i] + k)
            taps += k
          }
          if (isSolved(s)) return taps
          if (taps >= budget) return -1
        }
      return -1
    }
    const landed = levels.map((level) => {
      const par = level.par as number
      const spent = SEEDS.slice(0, 30).map((seed, k) => climb(start(level, seed), 3 * par, k))
      return [1, 2, 3].map((m) => spent.filter((t) => t >= 0 && t <= m * par).length)
    })
    expect(landed).toEqual([
      [3, 12, 22],
      [0, 6, 14],
      [0, 2, 3],
    ])
  })
})

describe('the pipes — the styles', () => {
  it('uses tokens only: no hex colours, no raw durations, no font families', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3}/)
    expect(css).not.toMatch(/\b\d+m?s\b/)
    expect(css).not.toMatch(/font-family/)
    expect(css).not.toMatch(/\p{Extended_Pictographic}/u)
    // rgb()/hsl() are colours written by hand just as much as hex is.
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
  })

  it('leaves the shadow to u-press, and only asks the focus ring back', () => {
    // u-press sets box-shadow after the global :focus-visible, at the same
    // specificity, so the ring is the one shadow this stylesheet may write.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const shadows = [...bare.matchAll(/([^{}]+)\{[^}]*box-shadow:\s*([^;]+);/g)].map((m) => [m[1].trim(), m[2]])
    expect(shadows).toEqual([['.square:focus-visible', 'var(--focus-ring)']])
  })

  it('lets a tap through the pipe and the picture to the plate', () => {
    // Every redraw replaces the drop's and the tulip's artwork, and the first
    // tap on a square redraws the board by moving the tab stop to it. A tap
    // that went down on the old artwork and came up on the new was lost.
    const rule = css.match(/\.turn,\s*\.art\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/pointer-events:\s*none/)
  })

  it('keeps a seam wider than the press, and the 5x5 inside a 360px phone', () => {
    const seam = Number((css.match(/--seam:\s*clamp\((\d+)px/) as RegExpMatchArray)[1])
    const cell = Number((css.match(/--cell:\s*clamp\((\d+)px/) as RegExpMatchArray)[1])
    // The press moves a plate 2px, so a seam of 4 never lets two plates touch.
    expect(seam).toBeGreaterThanOrEqual(4)
    expect(seam).toBeGreaterThan(2)
    // A fingertip, and more.
    expect(cell).toBeGreaterThanOrEqual(40)
    // 284px is the stage's content box, measured in Chromium in the shell at a
    // 360px viewport. Five plates, four seams, and the scroller's padding.
    expect(5 * cell + 4 * seam + 2 * 4).toBeLessThanOrEqual(284)
    // And the smaller boards share the same 65vw out by the row, so that a 3x3
    // on that phone is not a huddle in the middle of the stage: 242px of 284.
    expect(css).toMatch(/--cell:\s*clamp\(\d+px, calc\(65vw \/ var\(--n\)\)/)
    expect(3 * Math.max(cell, (0.65 * 360) / 3) + 2 * seam).toBe(242)
  })

  /** Every rule in the stylesheet, comments left out, as its selectors and its body. */
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((sel) => sel.trim()),
    body: m[2],
  }))
  const bodiesFor = (selector: string) => rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)

  it('turns a pipe and brings the water in at --dur-2, rim and all', () => {
    expect(css).toMatch(/\.turn\s*\{[^}]*transition:\s*transform var\(--dur-2\) var\(--ease\)/)
    for (const part of ['rim', 'water']) {
      expect(bodiesFor(`.pipe [data-part='${part}']`).join()).toMatch(/transition:\s*opacity var\(--dur-2\) var\(--ease\)/)
    }
  })

  it('keeps the water and its rim invisible unless the board is solved', () => {
    for (const part of ['rim', 'water']) {
      const opacity = (selector: string) =>
        bodiesFor(selector)
          .map((body) => body.match(/opacity:\s*([\d.]+)/)?.[1])
          .filter((o) => o !== undefined)
      expect(opacity(`.pipe [data-part='${part}']`)).toEqual(['0'])
      expect(opacity(`.grid[data-water='true'] .pipe [data-part='${part}']`)).toEqual(['1'])
    }
    // Nothing else in the stylesheet reaches either of them.
    const reaching = rules.filter((r) => r.selectors.some((sel) => /data-part='(rim|water)'/.test(sel)))
    expect(reaching).toHaveLength(4)
  })

  it('rims the water in an ink that reads on slate and on teal, in both themes', () => {
    // Teal on slate is 1.22:1 in the light theme and 1.07:1 in the dark: the
    // water differs from the pipe by hue alone. The rim is the pair that
    // src/styles/contrast.test.ts holds every mark on enamel to, and it is
    // held here to the same 3:1 for a graphic: measured 7.1 and 5.8 in the
    // light theme, 4.9 and 5.3 in the dark.
    expect(bodiesFor(".pipe [data-part='body']").join()).toMatch(/color:\s*var\(--p-slate\)/)
    expect(bodiesFor(".pipe [data-part='water']").join()).toMatch(/color:\s*var\(--p-teal\)/)
    expect(bodiesFor(".pipe [data-part='rim']").join()).toMatch(/color:\s*var\(--p-on-dark\)/)
    const tokens = readFileSync(new URL(import.meta.url).pathname.replace(/[^/]+$/, '../../styles/tokens.css'), 'utf8')
    const block = (selector: string) => {
      const from = tokens.indexOf(selector)
      const out: Record<string, string> = {}
      for (const [, name, value] of tokens.slice(from, tokens.indexOf('}', from)).matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)) {
        out[name] = value
      }
      return out
    }
    const light = block(':root {')
    const dark = { ...light, ...block(":root[data-theme='dark'] {") }
    const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    for (const palette of [light, dark]) {
      expect(contrast(palette['--p-on-dark'], palette['--p-slate'])).toBeGreaterThanOrEqual(3)
      expect(contrast(palette['--p-on-dark'], palette['--p-teal'])).toBeGreaterThanOrEqual(3)
    }
  })
})

afterEach(cleanup)

describe('the pipes — the board', () => {
  const mount = (state: PipesState, locked = false) => {
    const sent: PipesAction[] = []
    const view = render(createElement(Board, { state, locked, dispatch: (action: PipesAction) => sent.push(action) }))
    return { sent, view }
  }

  const buttonsIn = (root: ParentNode) => [...root.querySelectorAll('button')]
  const angleOf = (button: Element) => (button.querySelector('span') as HTMLElement).style.getPropertyValue('--angle')
  const degrees = (button: Element) => Number.parseFloat(angleOf(button))
  const gridIn = (root: ParentNode) => root.querySelector('[role="group"]') as HTMLElement

  /** The board with a real state behind it, so a tap can be watched from the click that makes it. */
  const Play = ({ from }: { from: PipesState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: PipesAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  it('gives every square a button that says what its pipe shows', () => {
    const state = start(levels[0], SEEDS[0])
    mount(state)
    expect(screen.getAllByRole('button')).toHaveLength(9)
    for (let i = 0; i < 9; i++) expect(screen.getByLabelText(squareLabel(state, i))).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Pipes, 3 rows and 3 columns' })).toBeInTheDocument()
    // Read clockwise from up, and nothing about water.
    expect(screen.getByLabelText('Row 2, column 3, a pipe going up, right and down')).toBeInTheDocument()
    expect(screen.getByLabelText('Row 1, column 3, a flower, its pipe going up')).toBeInTheDocument()
    expect(screen.getByLabelText('Row 2, column 2, the drop, its pipe going up, right and down')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).not.toMatch(/water|wet|dry/)
    }
  })

  it('draws the drop on its square and a tulip on every flower, and nothing on a plain pipe', () => {
    const artOf = (name: 'drop' | 'tulip') => {
      const { container } = render(createElement(Pictogram, { name }))
      const html = (container.querySelector('svg') as SVGElement).innerHTML
      cleanup()
      return html
    }
    const drop = artOf('drop')
    const tulip = artOf('tulip')
    const state = start(levels[2], SEEDS[1])
    const { view } = mount(state)
    buttonsIn(view.container).forEach((button, i) => {
      const art = [...button.querySelectorAll('svg[viewBox="0 0 72 72"]')]
      const flower = i !== state.source && endsOf(state.pieces[i]) === 1
      expect(button.getAttribute('data-kind')).toBe(i === state.source ? 'drop' : flower ? 'flower' : 'pipe')
      if (i === state.source || flower) {
        expect(art).toHaveLength(1)
        expect(art[0].innerHTML).toBe(i === state.source ? drop : tulip)
        expect(art[0].getAttribute('aria-hidden')).toBe('true')
        // The picture stays upright: it is outside the span that turns.
        expect(art[0].closest('span')).toBeNull()
        expect(art[0].getAttribute('style')).toBeNull()
      } else {
        expect(art).toHaveLength(0)
      }
    })
  })

  it('draws each pipe at its turns on a fresh mount, and lands a new deal without turning', () => {
    const dealt = start(levels[1], SEEDS[2])
    const { view } = mount(dealt)
    for (const button of buttonsIn(view.container)) expect(angleOf(button)).toBe('0deg')
    cleanup()
    const turned = tapAll(dealt, [0, 0, 3, 7, 7, 7])
    const again = mount(turned)
    buttonsIn(again.view.container).forEach((button, i) => expect(angleOf(button)).toBe(`${turned.turns[i] * 90}deg`))
    expect(gridIn(again.view.container).getAttribute('data-snap')).toBe('true')
  })

  it('draws the water on the solved position and on no other', () => {
    const dealt = start(levels[0], SEEDS[3])
    const { view } = mount(dealt)
    expect(gridIn(view.container).hasAttribute('data-water')).toBe(false)
    const rng = makeRng(8)
    let s = dealt
    for (let k = 0; k < 30; k++) {
      s = reduce(s, { type: 'turn', index: randInt(rng, 9) })
      view.rerender(createElement(Board, { state: s, locked: false, dispatch: () => {} }))
      expect(gridIn(view.container).getAttribute('data-water')).toBe(isSolved(s) ? 'true' : null)
    }
    const solved = { ...dealt, turns: solvedTurns(dealt) }
    view.rerender(createElement(Board, { state: solved, locked: true, dispatch: () => {} }))
    expect(gridIn(view.container).getAttribute('data-water')).toBe('true')
  })

  it('dispatches exactly one turn per tap, and nothing else', () => {
    const { sent } = mount(start(levels[0], SEEDS[0]))
    fireEvent.click(screen.getAllByRole('button')[4])
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(sent).toEqual([
      { type: 'turn', index: 4 },
      { type: 'turn', index: 0 },
    ])
  })

  it('ignores every input while locked', () => {
    const state = start(levels[0], SEEDS[0])
    const { sent } = mount({ ...state, turns: solvedTurns(state) }, true)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(sent).toEqual([])
  })

  it('keeps one tab stop, walks it with the arrows, stops at the edge, and keeps it through a move', () => {
    const state = start(levels[0], SEEDS[0])
    const { view } = mount(state)
    const buttons = () => buttonsIn(view.container)
    const stops = () => buttons().filter((b) => b.getAttribute('tabindex') === '0')
    expect(stops()).toEqual([buttons()[0]])

    // act(), not a bare focus(): the roving tab stop moves in React state, and
    // the key handler has to be the one rendered after the focus landed.
    act(() => buttons()[0].focus())
    fireEvent.keyDown(buttons()[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons()[1])
    fireEvent.keyDown(buttons()[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons()[4])
    expect(stops()).toEqual([buttons()[4]])

    // It stands still at the edge rather than wrapping round.
    act(() => buttons()[2].focus())
    fireEvent.keyDown(buttons()[2], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons()[2])
    fireEvent.keyDown(buttons()[2], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons()[2])

    // A move keeps it where the keyboard left it: the pieces have not changed.
    view.rerender(createElement(Board, { state: reduce(state, { type: 'turn', index: 2 }), locked: false, dispatch: () => {} }))
    expect(stops()).toEqual([buttons()[2]])
    // A new deal starts it again.
    view.rerender(createElement(Board, { state: start(levels[0], SEEDS[1]), locked: false, dispatch: () => {} }))
    expect(stops()).toEqual([buttons()[0]])
  })

  it('says nothing while the child works, and says so when the water reaches everything', () => {
    const state = start(levels[0], SEEDS[0])
    const { view } = mount(state)
    expect(screen.getByRole('status')).toHaveTextContent(/^$/)
    view.rerender(createElement(Board, { state: { ...state, turns: solvedTurns(state) }, locked: true, dispatch: () => {} }))
    expect(screen.getByRole('status')).toHaveTextContent('The water reaches every pipe and every flower.')
  })

  it('keeps room for everything it can say, so a sentence never moves the board', () => {
    // The room is a hidden copy of each sentence in the same grid cell as the
    // live one. Measured in Chromium on the level-3 split picture: at 360px
    // and 390px the board stood still as the sentence came and went, where a
    // room of one line let it jump 27px each way.
    const { view } = mount(start(levels[2], SEEDS[0]))
    const live = screen.getByRole('status')
    const cell = live.parentElement as HTMLElement
    const room = [...cell.children].filter((el) => el !== live)
    expect(room.map((el) => el.textContent)).toEqual([SPLIT_LINE, SOLVED_LINE])
    for (const el of room) {
      expect(el.getAttribute('aria-hidden')).toBe('true')
      expect(el.getAttribute('role')).toBeNull()
      // Every class the live sentence has, so it wraps where that would.
      expect([...el.classList]).toEqual(expect.arrayContaining([...live.classList]))
    }
    // A screen reader hears one sentence, and only when there is one.
    expect(view.container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(live).toHaveTextContent(/^$/)
  })

  it('draws each pipe as a hairline, the pipe, a rim and the water, bottom up', () => {
    const { container } = render(createElement(PipeMark, { mask: UP | RIGHT | DOWN }))
    const layers = [...container.querySelectorAll('g[data-part]')]
    expect(layers.map((g) => g.getAttribute('data-part'))).toEqual(['edge', 'body', 'rim', 'water'])
    // Each sits inside the one under it, arm and hub alike: the rim shows 2
    // units either side of the water, and the pipe 7 either side of the rim.
    const arms = layers.map((g) => Number((g.querySelector('path') as SVGPathElement).getAttribute('stroke-width')))
    const hubs = layers.map((g) => Number((g.querySelector('circle') as SVGCircleElement).getAttribute('r')))
    expect(arms).toEqual([33, 30, 16, 12])
    expect(hubs).toEqual(arms.map((w) => w / 2))
  })

  it('turns a pipe clockwise on every tap, round past the last quarter rather than back', () => {
    const state = start(levels[0], SEEDS[0])
    render(createElement(Play, { from: state }))
    const button = screen.getAllByRole('button')[5]
    const seen: string[] = []
    for (let k = 0; k < 4; k++) {
      fireEvent.click(button)
      seen.push(angleOf(button))
    }
    // The fourth tap puts the state back to 0 turns, and the pipe goes on
    // round to 360 rather than spinning three quarters the other way.
    expect(seen).toEqual(['90deg', '180deg', '270deg', '360deg'])
    expect(gridIn(document).hasAttribute('data-snap')).toBe(false)
  })

  it('turns a pipe back on a step back, takes the short way along the tape, and lands a new deal', () => {
    const state = start(levels[0], SEEDS[0])
    const { view } = mount(state)
    const at = () => buttonsIn(view.container)[5]
    const redraw = (s: PipesState) => view.rerender(createElement(Board, { state: s, locked: false, dispatch: () => {} }))
    // Rerendering the position before a tap is Step back: a quarter turn back.
    redraw(reduce(state, { type: 'turn', index: 5 }))
    expect(degrees(at())).toBe(90)
    redraw(state)
    expect(degrees(at())).toBe(0)
    // A jump along the tape to three taps on is a quarter turn back too, the
    // short way round; two taps at once are half a turn, and no more.
    redraw(tapAll(state, [5, 5, 5]))
    expect(degrees(at())).toBe(-90)
    redraw(tapAll(state, [5]))
    expect(degrees(at())).toBe(90)
    expect(gridIn(view.container).hasAttribute('data-snap')).toBe(false)
    // A new deal lands on its picture, with nothing turning to get there.
    redraw(start(levels[0], SEEDS[1]))
    expect(gridIn(view.container).getAttribute('data-snap')).toBe('true')
    expect(degrees(at())).toBe(0)
  })

  it('renders nothing the shell already owns', () => {
    const { view } = mount(start(levels[0], SEEDS[0]))
    const text = view.container.textContent ?? ''
    for (const owned of [pipes.title, ...pipes.instructions, ...levels[0].hints]) expect(text).not.toContain(owned)
    expect(text).not.toMatch(/move|par|reset|undo|hint|solved|well done/i)
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
  })

  it('is a pure function of state, so rewinding through the tape just works', () => {
    const dealt = start(levels[1], SEEDS[5])
    const rng = makeRng(12)
    const history = [dealt]
    for (let k = 0; k < 16; k++) history.push(reduce(history[k], { type: 'turn', index: randInt(rng, 16) }))
    // Four taps on one square come back to the dealt picture.
    history.push(tapAll(history[history.length - 1], [3, 3, 3, 3]))

    const look = (root: ParentNode) =>
      buttonsIn(root).map((b) => [b.getAttribute('aria-label'), b.getAttribute('data-kind'), ((degrees(b) % 360) + 360) % 360])

    const { view } = mount(history[history.length - 1])
    for (const k of [0, ...shuffled(rng, history.map((_, j) => j)), 0]) {
      view.rerender(createElement(Board, { state: history[k], locked: false, dispatch: () => {} }))
      const fresh = render(createElement(Board, { state: history[k], locked: false, dispatch: () => {} }))
      expect(look(view.container)).toEqual(look(fresh.container))
      fresh.unmount()
    }
  })

  it('draws the card as the corner of a board, one tap from finished', () => {
    const { container } = render(createElement(pipes.Icon))
    const scene = container.querySelector('svg') as SVGSVGElement
    expect(scene.getAttribute('viewBox')).toBe('0 0 32 32')
    expect(scene.querySelectorAll(':scope > rect')).toHaveLength(4)
    const slate = [...scene.querySelectorAll('path[stroke="var(--p-slate)"]')]
    expect(slate).toHaveLength(4)
    for (const path of slate) {
      // Walk the path's corners. Each pipe stays on its own plate — every
      // corner on one side of the seam, across and down — and stops at the
      // plate's edge, 15.5 or 16.5, rather than crossing to the next one.
      const corners: [number, number][] = []
      for (const [, cmd, args] of (path.getAttribute('d') ?? '').matchAll(/([MHV])([^MHV]+)/g)) {
        const v = args.trim().split(/\s+/).map(Number)
        const [x, y] = corners.length > 0 ? corners[corners.length - 1] : [0, 0]
        corners.push(cmd === 'M' ? [v[0], v[1]] : cmd === 'H' ? [v[0], y] : [x, v[0]])
      }
      for (const axis of [0, 1]) {
        const at = corners.map((c) => c[axis])
        expect(at.every((v) => v <= 15.5) || at.every((v) => v >= 16.5)).toBe(true)
      }
      const [x, y] = corners[corners.length - 1]
      expect([x, y].some((v) => v === 15.5 || v === 16.5)).toBe(true)
    }
    expect(container.innerHTML).not.toContain('var(--p-teal)')
    expect(scene.querySelectorAll('svg[viewBox="0 0 72 72"]')).toHaveLength(2)

    // The position it draws is a real one: the drop going right, a bend going
    // down and left, the flower going up and a bend going up and left. It is
    // not solved, and one clockwise tap on the flower solves it.
    const corner: PipesState = { n: 2, source: 0, pieces: [RIGHT, DOWN | LEFT, UP, UP | LEFT], turns: [0, 0, 0, 0] }
    expect(isSolved(corner)).toBe(false)
    expect(isSolved(reduce(corner, { type: 'turn', index: 2 }))).toBe(true)
  })
})
