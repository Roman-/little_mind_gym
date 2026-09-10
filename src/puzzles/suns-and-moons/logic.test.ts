import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { sunsAndMoons } from './index'
import { Board } from './Board'
import type { Clash, SunsAction, SunsConfig, SunsState } from './logic'
import {
  EMPTY,
  MOON,
  SUN,
  blankCount,
  blanksIn,
  clashOf,
  colOf,
  conflicts,
  countSolutions,
  deal,
  describeClash,
  describeMove,
  filledCount,
  fullGrid,
  halfOf,
  init,
  isSolved,
  legalMoves,
  linesOf,
  makesTriple,
  markName,
  overCount,
  reduce,
  rowOf,
  solveByRules,
  solveGrid,
  triplesThrough,
  valuesOf,
} from './logic'

const levels = sunsAndMoons.levels as PuzzleLevel<SunsConfig>[]
const start = (level: PuzzleLevel<SunsConfig>, seed: number) => init(level, makeRng(seed))

/** Thirty-odd seeds, and the same ones every run. */
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37)
/** The sweep the candidates note measured the generator with. */
const SWEEP = Array.from({ length: 200 }, (_, i) => 1 + i * 2654435761)
/**
 * How long a test that deals the whole sweep is given. Two hundred eight-wide
 * boards take a second or so on a quiet machine, and a machine running nine
 * other jobs can stretch that past vitest's five-second default while the
 * generator is doing nothing wrong.
 */
const SWEEP_MS = 20000

/** A board written out by hand: 'S' a sun, 'M' a moon, '.' an empty square. */
const gridOf = (rows: string[]): number[] =>
  rows
    .join('')
    .split('')
    .map((ch) => (ch === 'S' ? SUN : ch === 'M' ? MOON : EMPTY))

const stateOf = (printed: string[], written?: string[]): SunsState => ({
  n: printed.length,
  givens: gridOf(printed),
  entries: written ? gridOf(written) : new Array<number>(printed.length ** 2).fill(EMPTY),
})

/** Writes the one true answer into every empty square, in order. */
function solutionActions(state: SunsState): SunsAction[] {
  const answer = solveGrid(state.givens, state.n)
  expect(answer).not.toBeNull()
  const out: SunsAction[] = []
  state.givens.forEach((given, index) => {
    if (given === EMPTY) out.push({ type: 'set', index, value: (answer as number[])[index] })
  })
  return out
}

/** A seeded wander through the state graph, used to sample real positions. */
function walk(state: SunsState, seed: number, steps: number): SunsState[] {
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

describe('the two rules', () => {
  it('lets a line hold half of each mark and no more', () => {
    const state = stateOf(['SSS.', '....', '....', '....'])
    expect(halfOf(4)).toBe(2)
    // The third sun in a four-long row is over the line's share.
    expect(overCount(state.givens, 4, 2, SUN)).toEqual([0, 1, 2, 3])
    expect(overCount(state.givens, 4, 3, MOON)).toBeNull()
  })

  it('will not have three of the same in a line, across or down', () => {
    const across = stateOf(['SS....', '......', '......', '......', '......', '......'])
    expect(makesTriple(across.givens, 6, 2, SUN)).toEqual([0, 1, 2])
    expect(makesTriple(across.givens, 6, 2, MOON)).toBeNull()
    const down = stateOf(['M.....', 'M.....', '......', '......', '......', '......'])
    expect(makesTriple(down.givens, 6, 12, MOON)).toEqual([0, 6, 12])
    // A gap between two of the same is three in a line just as much.
    const gap = stateOf(['S.S...', '......', '......', '......', '......', '......'])
    expect(makesTriple(gap.givens, 6, 1, SUN)).toEqual([0, 1, 2])
  })

  it('tells the two shapes of the three-in-a-line rule apart', () => {
    // A hint names one shape or the other, so `gaps` and `pairs` have to mean
    // what those words do. Each board below is three squares short of full,
    // and on each one the run rule settles exactly one of the three while
    // counting settles the other two.
    //
    // Row 4 reads `S M . M . S`. A moon in that gap would leave three moons
    // with the new one in the middle, and no line here is full of either mark
    // yet, so the run is the only reason there is: a sun goes in.
    const gap = solveByRules(
      gridOf(['MMSSMS', 'SSMSMM', 'MMSMSS', 'SM.M.S', 'MS.SSM', 'SSMMSM']),
      6,
    )
    expect(gap?.grid).toEqual(
      gridOf(['MMSSMS', 'SSMSMM', 'MMSMSS', 'SMSMMS', 'MSMSSM', 'SSMMSM']),
    )
    expect(gap?.gaps).toBe(1)
    expect(gap?.pairs).toBe(0)
    expect(gap?.counted).toBe(2)

    // Row 2 reads `M M . . S S`. A moon in the third square would leave three
    // moons as well, but with the new one at the end of them rather than in
    // between: the same rule, the other shape.
    const pair = solveByRules(
      gridOf(['SSMMSM', 'MM..SS', 'SSMSMM', 'MMSMSS', 'MS.SMS', 'SMSSMM']),
      6,
    )
    expect(pair?.grid).toEqual(
      gridOf(['SSMMSM', 'MMSMSS', 'SSMSMM', 'MMSMSS', 'MSMSMS', 'SMSSMM']),
    )
    expect(pair?.pairs).toBe(1)
    expect(pair?.gaps).toBe(0)
    expect(pair?.counted).toBe(2)
  })

  it('never needs the three-in-a-line rule on a four-wide board', () => {
    // Three of one mark in a four-long line has already broken the count, so
    // at four wide the second rule can never be the one that settles a square.
    // Level one's minGaps and minPairs are both 0 because of this, and its
    // hints say nothing about three in a line.
    // Every run of three lies inside one four-long line, so the two squares a
    // triple needs beside this one are two of that line's share of two. The
    // third is over it. Checked for every square, every run through it and
    // both marks, with nothing else on the board: adding marks only ever
    // raises a count, so the argument holds from there on.
    let runs = 0
    for (const v of [SUN, MOON]) {
      for (let i = 0; i < 16; i++) {
        for (const run of triplesThrough(4, i)) {
          const g = new Array<number>(16).fill(EMPTY)
          for (const k of run) if (k !== i) g[k] = v
          expect(makesTriple(g, 4, i, v)).not.toBeNull()
          expect(overCount(g, 4, i, v)).not.toBeNull()
          runs++
        }
      }
    }
    expect(runs).toBeGreaterThan(0)
    // And the same claim, made against the boards a child is actually dealt:
    // neither shape of the run rule ever settles a square at four wide.
    for (const seed of SEEDS) {
      const read = solveByRules(start(levels[0], seed).givens, 4)
      expect(read?.gaps).toBe(0)
      expect(read?.pairs).toBe(0)
    }
  })
})

describe('the boards a child is dealt', () => {
  for (const level of levels) {
    const { n, blanks, minRounds, maxRounds, minGaps, minPairs } = level.config

    it(`"${level.label}" deals 200 boards, every one of them with exactly one answer`, () => {
      // The measurement the candidates note was written on, reproduced at the
      // sizes this puzzle actually ships.
      for (const seed of SWEEP) {
        const clues = deal(makeRng(seed), level.config)
        expect(clues).toHaveLength(n * n)
        expect(blanksIn(clues)).toBe(blanks)
        expect(countSolutions(clues, n, 2)).toBe(1)
      }
    }, SWEEP_MS)

    it(`"${level.label}" deals boards the two rules finish on their own`, () => {
      // A solver that only ever writes a square the rules leave one answer for
      // proves both halves of the bargain at once: no guessing, and one answer.
      for (const seed of SWEEP) {
        const clues = deal(makeRng(seed), level.config)
        const read = solveByRules(clues, n)
        expect(read).not.toBeNull()
        expect((read as { grid: number[] }).grid.every((v) => v !== EMPTY)).toBe(true)
      }
    }, SWEEP_MS)

    it(`"${level.label}" deals boards inside its own difficulty window`, () => {
      // The whole sweep rather than the short list of seeds, because this is
      // also the check on `deal`'s last resort: a board dealt by that last
      // resort would land outside the window and fail here.
      for (const seed of SWEEP) {
        const read = solveByRules(deal(makeRng(seed), level.config), n)
        expect(read).not.toBeNull()
        const { rounds, gaps, pairs, counted } = read as {
          rounds: number
          gaps: number
          pairs: number
          counted: number
        }
        expect(rounds).toBeGreaterThanOrEqual(minRounds)
        expect(rounds).toBeLessThanOrEqual(maxRounds)
        // The run rule in each of its two shapes, counted apart: this is what
        // the last hint of a level is written against.
        expect(gaps).toBeGreaterThanOrEqual(minGaps)
        expect(pairs).toBeGreaterThanOrEqual(minPairs)
        // Every empty square was settled by exactly one of the two rules, and
        // there were `blanks` of them: no square was ever guessed at.
        expect(counted + gaps + pairs).toBe(blanks)
      }
    }, SWEEP_MS)

    it(`"${level.label}" prints no mark that already breaks a rule`, () => {
      for (const seed of SEEDS) {
        const clues = deal(makeRng(seed), level.config)
        for (let i = 0; i < clues.length; i++) {
          const v = clues[i]
          if (v === EMPTY) continue
          const others = clues.slice()
          others[i] = EMPTY
          expect(overCount(others, n, i, v)).toBeNull()
          expect(makesTriple(others, n, i, v)).toBeNull()
        }
      }
    })
  }

  it('deals a board for every level inside a blink', () => {
    // A tighter window costs draws, and draws cost time. The eight-wide level
    // asks the most — four passes over the rules, with a gap among the squares
    // they settle — so what that costs is measured rather than assumed.
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })

  it('builds whole boards that obey both rules, at every size it ships', () => {
    for (const level of levels) {
      const { n } = level.config
      for (let seed = 0; seed < 20; seed++) {
        const grid = fullGrid(makeRng(seed * 7919 + 1), n)
        expect(grid).not.toBeNull()
        const done = { n, givens: grid as number[], entries: new Array<number>(n * n).fill(EMPTY) }
        expect(isSolved(done)).toBe(true)
      }
    }
  })
})

describe('init', () => {
  for (const level of levels) {
    it(`"${level.label}" starts with exactly par (${level.par}) squares to fill, on every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.n).toBe(level.config.n)
        expect(state.entries.every((v) => v === EMPTY)).toBe(true)
        expect(blankCount(state)).toBe(level.par)
        expect(filledCount(state)).toBe(level.config.n ** 2 - (level.par as number))
        expect(isSolved(state)).toBe(false)
      }
    })

    it(`"${level.label}" gives the same seed the same board, and different seeds different ones`, () => {
      expect(start(level, 77).givens).toEqual(start(level, 77).givens)
      const keys = new Set(SEEDS.map((seed) => start(level, seed).givens.join('')))
      expect(keys.size).toBeGreaterThan(SEEDS.length * 0.9)
    })
  }
})

describe('reduce', () => {
  for (const level of levels) {
    it(`"${level.label}" returns the identical state for every action that changes nothing`, () => {
      const state = start(level, 99)
      const given = state.givens.findIndex((v) => v !== EMPTY)
      const blank = state.givens.indexOf(EMPTY)
      const last = state.n * state.n - 1

      const noOps: [string, SunsAction][] = [
        ['another action type', { type: 'nudge' } as unknown as SunsAction],
        ['no action at all', undefined as unknown as SunsAction],
        ['writing over a printed mark', { type: 'set', index: given, value: SUN }],
        ['rubbing out a printed mark', { type: 'set', index: given, value: EMPTY }],
        ['rubbing out a square that is already empty', { type: 'set', index: blank, value: EMPTY }],
        ['an index before the grid', { type: 'set', index: -1, value: SUN }],
        ['an index past the grid', { type: 'set', index: last + 1, value: SUN }],
        ['a fractional index', { type: 'set', index: 1.5, value: SUN }],
        ['an index that is NaN', { type: 'set', index: NaN, value: SUN }],
        ['an index that is Infinity', { type: 'set', index: Infinity, value: SUN }],
        ['a missing index', { type: 'set', index: undefined as unknown as number, value: SUN }],
        ['a null index', { type: 'set', index: null as unknown as number, value: SUN }],
        ['a mark that is not on the board', { type: 'set', index: blank, value: 3 }],
        ['a negative mark', { type: 'set', index: blank, value: -1 }],
        ['a fractional mark', { type: 'set', index: blank, value: 1.5 }],
        ['a mark that is NaN', { type: 'set', index: blank, value: NaN }],
        ['a missing mark', { type: 'set', index: blank, value: undefined as unknown as number }],
        ['a null mark', { type: 'set', index: blank, value: null as unknown as number }],
      ]
      for (const [what, action] of noOps) {
        // toBe, not toEqual: a fresh but equal object would pollute the move tape.
        expect(reduce(state, action), what).toBe(state)
      }

      const written = reduce(state, { type: 'set', index: blank, value: MOON })
      expect(written).not.toBe(state)
      expect(reduce(written, { type: 'set', index: blank, value: MOON }), 'the same again').toBe(
        written,
      )
    })

    it(`"${level.label}" leaves the state it was handed exactly as it found it`, () => {
      const state = start(level, 12)
      const givensBefore = state.givens.slice()
      const entriesBefore = state.entries.slice()
      const blank = state.givens.indexOf(EMPTY)
      const next = reduce(state, { type: 'set', index: blank, value: SUN })
      expect(state.givens).toEqual(givensBefore)
      expect(state.entries).toEqual(entriesBefore)
      // A fresh entries array, so the previous state in the move tape is safe.
      expect(next.entries).not.toBe(state.entries)
      expect(next.givens).toBe(state.givens)
      expect(next.entries[blank]).toBe(SUN)
      expect(next.entries.filter((v) => v !== EMPTY)).toHaveLength(1)
      expect(reduce(next, { type: 'set', index: blank, value: EMPTY }).entries[blank]).toBe(EMPTY)
    })

    it(`"${level.label}" changes exactly one square, and never a printed one`, () => {
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
          expect(state.givens[action.index]).toBe(EMPTY)
          expect(filledCount(next) - filledCount(state)).toBeLessThanOrEqual(1)
        }
      }
    })

    it(`"${level.label}" has legalMoves that are exactly the actions that change something`, () => {
      // If legalMoves hid a move, every par proved by search would be wrong.
      for (const state of walk(start(level, 17), 17, 12)) {
        const listed = new Set(legalMoves(state).map((a) => `${a.index}:${a.value}`))
        for (let index = 0; index < state.n * state.n; index++) {
          for (const value of [EMPTY, SUN, MOON]) {
            const changes = reduce(state, { type: 'set', index, value }) !== state
            expect(listed.has(`${index}:${value}`), `${index}:${value}`).toBe(changes)
          }
        }
      }
    })
  }
})

describe('par', () => {
  /*
   * Par is the count of empty squares, and the three tests below are the whole
   * proof of it.
   *
   * The floor: `isSolved` wants every square filled; the start has exactly par
   * of them empty; and "changes exactly one square" above shows that one move
   * fills at most one of them. So no run of fewer than par moves can finish a
   * board — whatever order they are made in, and whichever marks they put
   * down.
   *
   * The ceiling: writing the one true answer into each empty square, once, is
   * par moves long and ends solved.
   *
   * The four-wide level is small enough to settle the whole thing by breadth-
   * first search as well, which is the check on the argument itself.
   */
  for (const level of levels) {
    it(`"${level.label}" cannot be finished in fewer than par (${level.par}) moves`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        expect(blankCount(first)).toBe(level.par)
        expect(isSolved(first)).toBe(false)
        // isSolved is false for every state with an empty square in it, so the
        // only way to the end is through filling all of them.
        for (const state of walk(first, seed, 24)) {
          if (blankCount(state) > 0) expect(isSolved(state)).toBe(false)
        }
      }
    })

    it(`"${level.label}" is finished in exactly par (${level.par}) moves, and not before`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        let state: SunsState = first
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

  it('"Four wide" has no shorter path than par under breadth-first search', () => {
    for (const seed of [5, 61]) {
      const path = shortestSolution<SunsState, SunsAction>({
        start: start(levels[0], seed),
        moves: legalMoves,
        apply: reduce,
        key: (s) => s.entries.join(','),
        solved: isSolved,
        // A mark that breaks a rule is never on a shortest path: it has to
        // come off again, which costs two more moves than not putting it down.
        // Pruning them keeps the graph walkable.
        invalid: (s) => conflicts(s).some(Boolean),
        maxStates: 100_000,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[0].par as number)
    }
  })
})

describe('isSolved and conflicts', () => {
  it('wants every square filled, both rules kept, and nothing less', () => {
    // Every row and every column two and two, and no three in a line.
    const done = stateOf(['SSMM', 'MMSS', 'SMSM', 'MSMS'])
    expect(isSolved(done)).toBe(true)
    // Two marks side by side are fine. It is the third that is not.
    const alsoDone = stateOf(['SSMM', 'SSMM', 'MMSS', 'MMSS'])
    expect(isSolved(alsoDone)).toBe(true)

    // One square empty, and everything else right: still not solved.
    const short = stateOf(['SSM.', 'MMSS', 'SMSM', 'MSMS'])
    expect(isSolved(short)).toBe(false)
  })

  it('calls a full board unsolved when a line is out of balance', () => {
    // Column 1 reads S, S, S, M: three suns where a four-long line takes two.
    const overCounted = stateOf(['SMSM', 'SMSM', 'SMSM', 'MSMS'])
    expect(overCounted.givens.every((v) => v !== EMPTY)).toBe(true)
    expect(isSolved(overCounted)).toBe(false)
    const firstColumn = linesOf(4)[4]
    expect(firstColumn.filter((i) => overCounted.givens[i] === SUN)).toHaveLength(3)
    expect(firstColumn.map((i) => colOf(4, i))).toEqual([0, 0, 0, 0])
  })

  it('calls a full and balanced board unsolved when three stand in a line', () => {
    // Every row is three and three and every column is three and three, and
    // every row still has three suns side by side. Counting alone is not the
    // puzzle: this is the other rule, on its own.
    const runsOfThree = stateOf(['SSSMMM', 'MMMSSS', 'SSSMMM', 'MMMSSS', 'SSSMMM', 'MMMSSS'])
    for (const line of linesOf(6)) {
      expect(line.filter((i) => runsOfThree.givens[i] === SUN)).toHaveLength(3)
    }
    expect(rowOf(6, 2)).toBe(0)
    expect(makesTriple(runsOfThree.givens, 6, 1, SUN)).toEqual([0, 1, 2])
    expect(isSolved(runsOfThree)).toBe(false)
  })

  it('marks only the player’s own squares, and only the ones in the wrong', () => {
    // The printed row already holds two suns; the third is the player's.
    const state = stateOf(['SS..', '....', '....', '....'], ['..S.', '....', '....', '....'])
    const wrong = conflicts(state)
    expect(wrong[2]).toBe(true)
    // The printed marks beside it are never blamed: they are right by
    // construction, and it is the mark next to them that is wrong.
    expect(wrong[0]).toBe(false)
    expect(wrong[1]).toBe(false)
    expect(wrong.filter(Boolean)).toHaveLength(1)
  })

  it('marks a square that only breaks the counting rule', () => {
    const state = stateOf(['SS.S..', '......', '......', '......', '......', '......'], [
      '....S.',
      '......',
      '......',
      '......',
      '......',
      '......',
    ])
    // Four suns in a six-long row: no three of them stand together, and the
    // row is still over its share.
    expect(makesTriple(valuesOf(state), 6, 4, SUN)).toBeNull()
    expect(conflicts(state)[4]).toBe(true)
  })

  it('stops blaming anything the moment the mark comes off', () => {
    const state = stateOf(['SS..', '....', '....', '....'], ['..S.', '....', '....', '....'])
    const rubbed = reduce(state, { type: 'set', index: 2, value: EMPTY })
    expect(conflicts(rubbed).some(Boolean)).toBe(false)
  })
})

describe('the clash a mark makes', () => {
  it('says three in a line when three stand in a line, and lights only those three', () => {
    const state = stateOf(['SS....', '......', '......', '......', '......', '......'])
    const clash = clashOf(state, 2, SUN) as Clash
    expect(clash.kind).toBe('triple')
    expect(clash.along).toBe('row')
    expect(clash.ordinal).toBe(1)
    expect(clash.cells).toEqual([0, 1, 2])
    expect(clash.blamed).toEqual([0, 1, 2])
    expect(describeClash(clash)).toBe('Row 1 has three suns side by side.')
  })

  it('says it going down when the three go down', () => {
    const state = stateOf(['M.....', 'M.....', '......', '......', '......', '......'])
    const clash = clashOf(state, 12, MOON) as Clash
    expect(clash.kind).toBe('triple')
    expect(clash.along).toBe('column')
    expect(clash.ordinal).toBe(1)
    expect(clash.cells).toEqual([0, 6, 12])
    expect(describeClash(clash)).toBe('Column 1 has three moons one under the other.')
  })

  it('says the count is out when the line has more of one mark than the other', () => {
    // Three suns are all a six-long row can hold, and no three of these four
    // stand together, so the only rule this breaks is the count.
    const state = stateOf(['SS.S..', '......', '......', '......', '......', '......'])
    const clash = clashOf(state, 4, SUN) as Clash
    expect(makesTriple(state.givens, 6, 4, SUN)).toBeNull()
    expect(clash.kind).toBe('count')
    expect(clash.along).toBe('row')
    expect(clash.cells).toHaveLength(6)
    expect(clash.blamed.sort((a, b) => a - b)).toEqual([0, 1, 3, 4])
    expect(describeClash(clash)).toBe('Row 1 has more suns than moons.')
  })

  it('names a broken column count as a column', () => {
    const state = stateOf(['S.....', 'S.....', '..M...', 'S.....', '......', '......'])
    const clash = clashOf(state, 24, SUN) as Clash
    expect(clash.kind).toBe('count')
    expect(clash.along).toBe('column')
    expect(clash.ordinal).toBe(1)
    expect(describeClash(clash)).toBe('Column 1 has more suns than moons.')
  })

  it('tells the two rules apart in words, so the sentence teaches which one broke', () => {
    const triple = clashOf(
      stateOf(['SS....', '......', '......', '......', '......', '......']),
      2,
      SUN,
    ) as Clash
    const count = clashOf(
      stateOf(['SS.S..', '......', '......', '......', '......', '......']),
      4,
      SUN,
    ) as Clash
    // One sentence is about three squares standing together and the other is
    // about how a whole line adds up. No child has to guess which rule they
    // broke, and the group lit under each says it a second time.
    expect(describeClash(triple)).not.toBe(describeClash(count))
    expect(describeClash(triple)).toMatch(/three suns/)
    expect(describeClash(count)).toMatch(/more suns than moons/)
    expect(triple.cells).toHaveLength(3)
    expect(count.cells).toHaveLength(6)
  })

  it('reports the tighter group when a mark breaks both rules at once', () => {
    // Row 1 already holds its two suns, side by side. A third makes three in a
    // line and puts the row over its share in the same stroke.
    const state = stateOf(['SS..', '....', '....', '....'])
    const clash = clashOf(state, 2, SUN) as Clash
    expect(overCount(state.givens, 4, 2, SUN)).not.toBeNull()
    expect(clash.kind).toBe('triple')
    expect(clash.cells).toEqual([0, 1, 2])
  })

  it('hands out arrays of its own, so a caller cannot reorder the shared lines', () => {
    // `linesOf` memoises its rows and columns for the life of the page, and
    // the count clash is about one of them. A board or a test that sorted or
    // reversed what it was given would otherwise leave every six-wide board
    // reading its lines backwards.
    const state = stateOf(['SS.S..', '......', '......', '......', '......', '......'])
    const clash = clashOf(state, 4, SUN) as Clash
    const line = linesOf(6)[0]
    expect(clash.cells).toEqual(line)
    expect(clash.cells).not.toBe(line)
    clash.cells.reverse()
    clash.blamed.reverse()
    expect(linesOf(6)[0]).toEqual([0, 1, 2, 3, 4, 5])

    // The two lists of a triple are not each other either.
    const triple = clashOf(stateOf(['SS..', '....', '....', '....']), 2, SUN) as Clash
    expect(triple.cells).not.toBe(triple.blamed)
  })

  it('is null for a square that takes the mark, and for a printed one', () => {
    const state = stateOf(['SS....', '......', '......', '......', '......', '......'])
    expect(clashOf(state, 2, MOON)).toBeNull()
    expect(clashOf(state, 8, SUN)).toBeNull()
    expect(clashOf(state, 0, SUN)).toBeNull()
    expect(clashOf(state, 2, EMPTY)).toBeNull()
  })

  it('agrees with conflicts about every square, on every board a child plays', () => {
    for (const level of levels) {
      for (const state of walk(start(level, 3), 3, 40)) {
        const wrong = conflicts(state)
        for (let i = 0; i < state.givens.length; i++) {
          if (state.givens[i] !== EMPTY || state.entries[i] === EMPTY) continue
          const before = reduce(state, { type: 'set', index: i, value: EMPTY })
          expect(clashOf(before, i, state.entries[i]) !== null, `square ${i}`).toBe(wrong[i])
        }
      }
    }
  })
})

describe('a dead end', () => {
  it('is not a thing this puzzle has, and that is on purpose', () => {
    // A mark in the wrong square is rubbed out, not stepped back from, exactly
    // as it is in the small square. So there is no failure(), the shell never
    // locks a board a child is still working on, and every wrong mark stays
    // one move from being right.
    expect(sunsAndMoons.engine.failure).toBeUndefined()
  })

  it('never leaves a board the player cannot put right', () => {
    for (const level of levels) {
      const first = start(level, 41)
      for (const state of walk(first, 41, 40)) {
        // The shell locks on isSolved or failure. Neither can fire while
        // squares are still empty, so a child is never shut out.
        expect(isSolved(state) && blankCount(state) > 0).toBe(false)
        // And whatever they have written, rubbing it out gets back to a board
        // the two rules still finish.
        const clean = { ...state, entries: new Array<number>(state.n ** 2).fill(EMPTY) }
        expect(solveByRules(clean.givens, clean.n)).not.toBeNull()
      }
    }
  })
})

describe('describe', () => {
  it('says what went down and where, in the past tense', () => {
    const state = stateOf(['S...', '....', '....', '....'])
    const put = reduce(state, { type: 'set', index: 5, value: MOON })
    expect(describeMove(state, put, { type: 'set', index: 5, value: MOON })).toBe(
      'Put a moon in row 2, column 2',
    )
    expect(describeMove(put, state, { type: 'set', index: 5, value: EMPTY })).toBe(
      'Took the moon out of row 2, column 2',
    )
  })

  it('names every square on the board, and never twice the same way', () => {
    const state = start(levels[2], 8)
    const notes = new Set<string>()
    for (const action of legalMoves(state)) {
      if (action.value === EMPTY) continue
      notes.add(describeMove(state, reduce(state, action), action))
    }
    expect(notes.size).toBe(legalMoves(state).filter((a) => a.value !== EMPTY).length)
    for (const note of notes) expect(note).toMatch(/^Put a (sun|moon) in row \d+, column \d+$/)
  })
})

describe('the board', () => {
  const setup = (state: SunsState, locked = false) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }))
    return { state, dispatch, view }
  }

  const squareAt = (state: SunsState, index: number) =>
    document.querySelector(
      `[aria-label^="Row ${rowOf(state.n, index) + 1}, column ${colOf(state.n, index) + 1},"]`,
    ) as HTMLButtonElement

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  /** The board with a real state behind it, so a cue can be watched from the tap that fires it. */
  const Play = ({ from }: { from: SunsState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: SunsAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  /**
   * The board under the shell's Step back, which truncates the history and
   * hands the same Board instance an earlier state. Anything the board is
   * holding about the move that has just been taken back has to go with it.
   */
  const Tape = ({ from }: { from: SunsState }) => {
    const [tape, setTape] = useState([from])
    return createElement(
      'div',
      null,
      createElement(Board, {
        state: tape[tape.length - 1],
        dispatch: (action: SunsAction) =>
          setTape((cur) => [...cur, reduce(cur[cur.length - 1], action)]),
        locked: false,
      }),
      createElement(
        'button',
        { type: 'button', onClick: () => setTape((cur) => cur.slice(0, -1)) },
        'Step back',
      ),
    )
  }

  it('draws a pressable square for every empty one and a printed mark for the rest', () => {
    const state = start(levels[1], 2)
    setup(state)
    const printed = state.givens.filter((v) => v !== EMPTY).length
    expect(screen.getAllByRole('img')).toHaveLength(printed)
    const tiles = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-label')?.startsWith('Row '))
    expect(tiles).toHaveLength(state.n * state.n - printed)
    for (const tile of tiles) {
      expect(tile.getAttribute('type')).toBe('button')
      expect(tile.className).toContain('u-press')
    }
  })

  it('gives a printed mark no button and no press shadow', () => {
    setup(start(levels[0], 2))
    for (const mark of screen.getAllByRole('img')) {
      expect(mark.tagName).not.toBe('BUTTON')
      expect(mark.className).not.toContain('u-press')
      expect(mark.getAttribute('aria-label')).toMatch(/, (sun|moon), printed$/)
    }
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = setup(start(levels[0], 2))
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|move|solved|par/i)
  })

  it('sends one action for one tap, with the mark the key says', () => {
    const state = stateOf(['SM..', '....', '....', '....'])
    const { dispatch } = setup(state)
    // The sun is up when the board opens, and the key says so.
    expect(screen.getByRole('button', { name: 'Put suns down' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(squareAt(state, 6))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: 6, value: SUN })

    dispatch.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Put moons down' }))
    // Choosing a mark is not a move: nothing reaches the shell.
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(squareAt(state, 6))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: 6, value: MOON })
  })

  it('takes a mark off again when the square already holds the one on the key', () => {
    const state = stateOf(['SM..', '....', '....', '....'], ['..S.', '....', '....', '....'])
    const { dispatch } = setup(state)
    fireEvent.click(squareAt(state, 2))
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: 2, value: EMPTY })
  })

  it('fills a square in one move whichever mark it wants, which is what par rests on', () => {
    const state = start(levels[2], 12)
    render(createElement(Play, { from: state }))
    const answer = solveGrid(state.givens, state.n) as number[]
    let moves = 0
    for (const mark of [SUN, MOON]) {
      fireEvent.click(screen.getByRole('button', { name: `Put ${markName(mark)}s down` }))
      for (let i = 0; i < answer.length; i++) {
        if (state.givens[i] !== EMPTY || answer[i] !== mark) continue
        fireEvent.click(squareAt(state, i))
        moves++
      }
    }
    // One tap a square, par taps, and the board is finished.
    expect(moves).toBe(levels[2].par)
    expect(screen.queryAllByLabelText(/, empty/)).toHaveLength(0)
    for (const square of screen.getAllByRole('button')) {
      expect(square.getAttribute('data-conflict')).toBeNull()
    }
  })

  it('ignores every tap once the level is locked', () => {
    const state = stateOf(['SM..', '....', '....', '....'])
    const { dispatch } = setup(state, true)
    fireEvent.click(squareAt(state, 6))
    fireEvent.click(screen.getByRole('button', { name: 'Put moons down' }))
    expect(dispatch).not.toHaveBeenCalled()
    expect(squareAt(state, 6)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Put moons down' })).toBeDisabled()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('walks the arrow keys from square to square, never onto a printed one', () => {
    const state = stateOf(['S...', '....', '....', '....'])
    setup(state)
    const cell = squareAt(state, 1)
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    const moved = document.activeElement as HTMLElement
    expect(moved).toBe(squareAt(state, 2))
    expect(moved.getAttribute('aria-label')).not.toMatch(/printed/)
    // Exactly one tab stop, and it followed the focus.
    const stops = [...document.querySelectorAll('[aria-label^="Row "]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toEqual([moved])
  })

  it('writes from the keyboard, and picks the key up as it goes', () => {
    const state = stateOf(['S...', '....', '....', '....'])
    render(createElement(Play, { from: state }))
    const cell = squareAt(state, 1)
    fireEvent.keyDown(cell, { key: 'm' })
    expect(squareAt(state, 1).getAttribute('aria-label')).toBe('Row 1, column 2, moon')
    // The keyboard and the keys under the board never disagree about what the
    // next tap puts down.
    expect(screen.getByRole('button', { name: 'Put moons down' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(squareAt(state, 1).getAttribute('aria-label')).toBe('Row 1, column 2, empty')
  })

  it('lights the three squares in a line and shakes the marks at fault', () => {
    const state = stateOf(['SS....', '......', '......', '......', '......', '......'])
    render(createElement(Play, { from: state }))
    fireEvent.click(squareAt(state, 2))

    const lit = wearing(cues.highlight)
    expect(lit).toHaveLength(3)
    for (const square of lit) {
      expect(square.getAttribute('aria-label')).toMatch(/^Row 1, column [123],/)
    }
    const shaking = wearing(cues.shake).map((mark) => mark.closest('[aria-label]'))
    expect(shaking).toHaveLength(3)
    expect(shaking).toContain(squareAt(state, 2))
  })

  it('lights the whole line when the line has more of one mark than the other', () => {
    const state = stateOf(['SS.S..', '......', '......', '......', '......', '......'])
    render(createElement(Play, { from: state }))
    fireEvent.click(squareAt(state, 4))

    // The lit group is the answer to "which rule": a whole row, not three
    // squares standing together.
    const lit = wearing(cues.highlight)
    expect(lit).toHaveLength(6)
    for (const square of lit) expect(square.getAttribute('aria-label')).toMatch(/^Row 1, /)
    expect(screen.getByRole('status')).toHaveTextContent('Row 1 has more suns than moons.')
  })

  it('says the broken rule in words, under the board and out loud', () => {
    const state = stateOf(['SS....', '......', '......', '......', '......', '......'])
    render(createElement(Play, { from: state }))
    fireEvent.click(squareAt(state, 2))

    const said = 'Row 1 has three suns side by side.'
    expect(screen.getByRole('status')).toHaveTextContent(said)
    // Both lines say it: the one a child reads and the one a screen reader speaks.
    expect(screen.getAllByText(said)).toHaveLength(2)
    expect(squareAt(state, 2)).toHaveAttribute('data-conflict', 'true')
    expect(squareAt(state, 2).getAttribute('aria-label')).toMatch(/, breaking a rule$/)

    // Take it off and there is nothing left to say.
    fireEvent.click(squareAt(state, 2))
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.queryByText(said)).toBeNull()
  })

  it('takes the lit group off with the mistake, and not only when the cue ends', () => {
    const state = stateOf(['SS....', '......', '......', '......', '......', '......'])
    render(createElement(Play, { from: state }))
    fireEvent.click(squareAt(state, 2))
    expect(wearing(cues.highlight)).toHaveLength(3)

    // Rubbed out inside the cue's own run. A group still lit over a board with
    // nothing wrong on it would say a mistake is there when it is not.
    fireEvent.click(squareAt(state, 2))
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('never announces a mistake a step back has taken off the board', () => {
    const state = stateOf(['SS..', 'M...', 'M...', '....'])
    render(createElement(Tape, { from: state }))
    fireEvent.click(squareAt(state, 2))
    expect(screen.getByRole('status')).toHaveTextContent('Row 1 has three suns side by side.')
    fireEvent.click(screen.getByRole('button', { name: 'Put moons down' }))
    fireEvent.click(squareAt(state, 12))
    const moons = 'Column 1 has three moons one under the other.'
    expect(screen.getByRole('status')).toHaveTextContent(moons)

    // One step back. The moon is off the board, so its sentence goes with it,
    // even though the sun is still there and still wrong.
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }))
    expect(squareAt(state, 12).getAttribute('aria-label')).toBe('Row 4, column 1, empty')
    expect(screen.queryByText(moons)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Red means a sun or a moon is breaking one of the two rules.',
    )
    expect(squareAt(state, 2)).toHaveAttribute('data-conflict', 'true')
  })

  it('leaves a chord to the browser, so Ctrl+S still saves the page', () => {
    const state = stateOf(['S...', '....', '....', '....'])
    render(createElement(Play, { from: state }))
    const cell = squareAt(state, 1)
    const empty = 'Row 1, column 2, empty'

    // fireEvent hands back false when the handler called preventDefault, so
    // these three say the board took neither the key nor the browser's answer
    // to it.
    expect(fireEvent.keyDown(cell, { key: 's', ctrlKey: true })).toBe(true)
    expect(squareAt(state, 1).getAttribute('aria-label')).toBe(empty)
    expect(fireEvent.keyDown(cell, { key: 'm', metaKey: true })).toBe(true)
    expect(squareAt(state, 1).getAttribute('aria-label')).toBe(empty)
    expect(fireEvent.keyDown(cell, { key: 'ArrowRight', altKey: true })).toBe(true)
    expect(document.activeElement).not.toBe(squareAt(state, 2))

    // The bare key is still the board's.
    expect(fireEvent.keyDown(cell, { key: 's' })).toBe(false)
    expect(squareAt(state, 1).getAttribute('aria-label')).toBe('Row 1, column 2, sun')
  })

  it('tells a child which mark the next tap puts down, and how to take it out', () => {
    const state = stateOf(['SM..', '....', '....', '....'])
    setup(state)
    // Taking a mark off again is the way back out of a guess, and the only
    // thing that says so is this line and the instructions: nothing on the
    // board is a rubber, and the keys carry the two marks and nothing else.
    expect(
      screen.getByText('Tap a square to put a sun in it. Tap that sun again to take it out.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Put moons down' }))
    expect(
      screen.getByText('Tap a square to put a moon in it. Tap that moon again to take it out.'),
    ).toBeInTheDocument()
  })

  it('keeps the key a child picked, move after move', () => {
    const state = stateOf(['SM..', '....', '....', '....'])
    render(createElement(Play, { from: state }))
    fireEvent.click(screen.getByRole('button', { name: 'Put moons down' }))
    fireEvent.click(squareAt(state, 4))
    // A choice that reset itself after every square would cost a tap a square.
    expect(screen.getByRole('button', { name: 'Put moons down' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(squareAt(state, 6))
    expect(squareAt(state, 6).getAttribute('aria-label')).toBe('Row 2, column 3, moon')
  })

  it('says nothing about winning when the level comes out', () => {
    const first = start(levels[0], 21)
    let state: SunsState = first
    for (const action of solutionActions(first)) state = reduce(state, action)
    render(createElement(Board, { state, dispatch: vi.fn(), locked: true }))
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(sunsAndMoons.id).toBe('suns-and-moons')
    expect(sunsAndMoons.title).toBe('Suns and moons')
    expect(sunsAndMoons.reseedable).toBe(true)
    expect(sunsAndMoons.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['four-wide', 'six-wide', 'eight-wide'])
    expect(sunsAndMoons.instructions.length).toBeGreaterThanOrEqual(2)
    expect(sunsAndMoons.instructions.length).toBeLessThanOrEqual(4)
    for (const line of sunsAndMoons.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(120)
    }
  })

  it('ramps the board and the count of squares to fill together', () => {
    expect(levels.map((l) => l.config.n)).toEqual([4, 6, 8])
    expect(levels.map((l) => l.par)).toEqual([8, 16, 22])
    for (const level of levels) {
      expect(level.config.n % 2).toBe(0)
      expect(level.par).toBe(level.config.blanks)
      // The cap that keeps the last level a sit-down rather than a rail of
      // marks: run the removal to exhaustion and an eight-wide board gives up
      // about 47 squares.
      expect(level.par as number).toBeLessThanOrEqual(24)
    }
  })

  it('tells a child how to take a mark off again, since no rubber key does', () => {
    // Erasing is the way back out of a guess: tap a square that already holds
    // the mark on the key. There is no rubber key to find it by, and the note
    // under the board hands its line to the broken rule the moment a mark goes
    // red — which is exactly when a child wants it — so the instructions have
    // to carry it too.
    expect(sunsAndMoons.instructions.some((line) => /take it out/.test(line))).toBe(true)
  })

  it('never names a square that would give the answer away', () => {
    for (const level of levels) {
      for (const hint of level.hints) {
        expect(hint).not.toMatch(/row \d|column \d/i)
      }
    }
  })
})

/**
 * A hint that points at a technique the puzzle never rewards is worse than no
 * hint at all, so every claim the hints make is checked against the boards a
 * player is actually dealt.
 */
describe('the hints tell the truth', () => {
  const words = ['', 'one', 'two', 'three', 'four']

  for (const level of levels) {
    it(`"${level.label}" hint 1 counts a line the way the board really does`, () => {
      const half = halfOf(level.config.n)
      expect(level.hints[0]).toContain(`${words[half]} suns and ${words[half]} moons`)
      for (const seed of SEEDS) {
        const answer = solveGrid(start(level, seed).givens, level.config.n) as number[]
        for (const line of linesOf(level.config.n)) {
          expect(line.filter((i) => answer[i] === SUN)).toHaveLength(half)
          expect(line.filter((i) => answer[i] === MOON)).toHaveLength(half)
        }
      }
    })
  }

  it('"Four wide" is settled by counting alone, which is all its hints talk about', () => {
    for (const hint of levels[0].hints) expect(hint).not.toMatch(/side by side|in a line|gap/)
    for (const seed of SEEDS) {
      const read = solveByRules(start(levels[0], seed).givens, 4)
      expect(read?.gaps).toBe(0)
      expect(read?.pairs).toBe(0)
    }
  })

  /*
   * The three-in-a-line rule comes in two shapes, and the last hint of each of
   * the top two levels names one of them and not the other: "side by side" is
   * the pair `sun sun .`, answered at either end, and the gap is `sun . sun`,
   * answered in the middle. A board can want one all the way through and never
   * once want the other, so a count of runs cannot stand in for either — each
   * level is held to the shape that its own hint names, on every board it
   * deals.
   */
  const shapes = [
    {
      level: levels[1],
      word: 'pair',
      shape: 'pairs',
      dial: 'minPairs',
      names: /side by side/,
      silent: /gap/,
    },
    {
      level: levels[2],
      word: 'gap',
      shape: 'gaps',
      dial: 'minGaps',
      names: /gap/,
      silent: /side by side/,
    },
  ] as const
  for (const { level, word, shape, dial, names, silent } of shapes) {
    it(`"${level.label}" really does need the ${word} that its last hint names`, () => {
      expect(level.hints[2]).toMatch(names)
      expect(level.hints[2]).not.toMatch(silent)
      expect(level.config[dial]).toBeGreaterThan(0)
      for (const seed of SEEDS) {
        const read = solveByRules(start(level, seed).givens, level.config.n)
        expect(read?.[shape]).toBeGreaterThanOrEqual(level.config[dial])
        expect(read?.[shape]).toBeGreaterThan(0)
      }
    })
  }

  it('asks each level for more passes over the board than the level before it', () => {
    // Why every level spends its second hint on a line that has just been
    // finished: the last board is not settled by one sweep of the counting
    // rule, so a square filled in now is what settles a line later.
    //
    // The floor climbs 2, 3, 4, so the dial ramps rather than sitting still
    // across the top two levels, and the boards a child is actually dealt ramp
    // with it.
    const floors = levels.map((l) => l.config.minRounds)
    expect(floors).toEqual([2, 3, 4])
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]).toBeGreaterThan(floors[i - 1])
      expect(levels[i].config.maxRounds).toBeGreaterThanOrEqual(floors[i])
    }
    const passes = (level: PuzzleLevel<SunsConfig>) =>
      SEEDS.map((seed) => solveByRules(start(level, seed).givens, level.config.n)?.rounds ?? 0)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(passes(levels[1]))).toBeGreaterThan(mean(passes(levels[0])))
    expect(mean(passes(levels[2]))).toBeGreaterThan(mean(passes(levels[1])))
  })
})
