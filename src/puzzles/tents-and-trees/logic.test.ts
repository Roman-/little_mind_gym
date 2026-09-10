import { readFileSync } from 'node:fs'
import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import { underSettings } from '../../test/settings'
import type { PuzzleLevel } from '../../lib/types'
import { tentsAndTrees } from './index'
import { Board } from './Board'
import type { Deduction, TentsAction, TentsConfig, TentsState } from './logic'
import {
  blockedCells,
  canPitch,
  clashOf,
  cluesOf,
  colCells,
  colMarks,
  colOf,
  countSolutions,
  deal,
  describeClash,
  describeMove,
  fits,
  hasRoom,
  init,
  isSolved,
  legalMoves,
  lineMark,
  lonelyTrees,
  maxPairs,
  orthogonal,
  pitchCamp,
  reasonedOut,
  reduce,
  refusalOf,
  rowCells,
  rowMarks,
  rowOf,
  solveByLogic,
  solveByTrees,
  space,
  strandedTrees,
  tentCells,
  tentsIn,
  touching,
  treeCells,
} from './logic'

const levels = tentsAndTrees.levels as PuzzleLevel<TentsConfig>[]
const start = (level: PuzzleLevel<TentsConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/** The one way the tents can be pitched, worked out the way a child would. */
const answerFor = (state: TentsState) =>
  (solveByLogic(state.n, state.trees, state.rowClues, state.colClues) as Deduction).tents

/** Pitches every tent of the answer. Each one is exactly one move. */
const solutionActions = (state: TentsState): TentsAction[] =>
  answerFor(state).map((index) => ({ type: 'toggle', index }))

const play = (state: TentsState, actions: TentsAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/**
 * A hand-built board, so a test can say which square breaks which rule rather
 * than hunting for one. Three trees, three tents, and one answer:
 *
 *     1 0 1 1 0
 *   1 . T . . .        the tents go in row 1 column 1,
 *   1 . . . . .        row 2 column 4, and row 4 column 3
 *   0 . . . T .
 *   1 . . . . .
 *   0 . . T . .
 *
 * It is also a board a legal move can spoil: a tent in row 1 column 3 keeps
 * every rule on the way down and leaves row 2 with nowhere to put its own.
 */
const FIXTURE_TREES = [1, 13, 22]
const FIXTURE_ROWS = [1, 1, 0, 1, 0]
const FIXTURE_COLUMNS = [1, 0, 1, 1, 0]
const FIXTURE_ANSWER = [0, 8, 17]

const fixture = (tents: number[] = []): TentsState => ({
  n: 5,
  trees: Array.from({ length: 25 }, (_, i) => FIXTURE_TREES.includes(i)),
  rowClues: FIXTURE_ROWS,
  colClues: FIXTURE_COLUMNS,
  tents: Array.from({ length: 25 }, (_, i) => tents.includes(i)),
})

/**
 * A second hand-built board, for the mark that says a line is spoilt. Five
 * trees, five tents, and one answer:
 *
 *     1 1 1 1 1
 *   1 . T . . .        the tents go in row 1 column 5, row 2 column 2,
 *   1 . . . . T        row 3 column 4, row 5 column 1 and row 5 column 3
 *   1 . . . . .
 *   0 . . T T .
 *   2 . T . . .
 *
 * A tent in row 3 column 3 keeps every rule on the way down and takes the last
 * three squares of column 2 with it, which still wants a tent of its own.
 */
const CROWD_TREES = [1, 9, 17, 18, 21]

const crowded = (tents: number[] = []): TentsState => ({
  n: 5,
  trees: Array.from({ length: 25 }, (_, i) => CROWD_TREES.includes(i)),
  rowClues: [1, 1, 1, 0, 2],
  colClues: [1, 1, 1, 1, 1],
  tents: Array.from({ length: 25 }, (_, i) => tents.includes(i)),
})

/**
 * The hole a tally cannot see. Two tents either side of one tree: every number
 * on the board is right, no two tents touch, each tent stands beside a tree —
 * and the second tree never gets one. Move that tree one square and the very
 * same tents become an answer.
 */
const pairs = (secondTree: number): TentsState => ({
  n: 4,
  trees: Array.from({ length: 16 }, (_, i) => i === 1 || i === secondTree),
  rowClues: [2, 0, 0, 0],
  colClues: [1, 0, 1, 0],
  tents: Array.from({ length: 16 }, (_, i) => i === 0 || i === 2),
})

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, tents } = level.config

    it(`"${level.label}" plants ${tents} trees and numbers every line, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.trees).toHaveLength(n * n)
        expect(treeCells(state)).toHaveLength(tents)
        expect(state.rowClues).toHaveLength(n)
        expect(state.colClues).toHaveLength(n)
        const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
        expect(total(state.rowClues)).toBe(tents)
        expect(total(state.colClues)).toBe(tents)
        expect(state.rowClues.every((c) => c >= 0 && c <= n)).toBe(true)
        expect(state.colClues.every((c) => c >= 0 && c <= n)).toBe(true)
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        const { trees, rowClues, colClues } = start(level, seed)
        expect(countSolutions(n, trees, rowClues, colClues, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // The fallback in `deal` is for a run of luck the tests have never
        // seen: every seed lands on a board that suits the level.
        expect(fits(level.config, state)).toBe(true)
        const reasoned = solveByLogic(n, state.trees, state.rowClues, state.colClues) as Deduction
        expect(reasoned).not.toBeNull()
        expect(reasoned.rounds).toBeGreaterThanOrEqual(level.config.minRounds)
        expect(reasoned.rounds).toBeLessThanOrEqual(level.config.maxRounds)
        expect(reasoned.packed).toBeGreaterThanOrEqual(level.config.minPacked)
        expect(reasoned.packed).toBeLessThanOrEqual(level.config.maxPacked)
      }
    })

    it(`"${level.label}" cannot be finished with the numbers covered up, every seed`, () => {
      // The one thing that keeps this puzzle from being a board of trees with a
      // margin drawn round it. A board the trees settle on their own is thrown
      // away by `deal`, so every board a child is handed has to be counted.
      for (const seed of SEEDS) {
        const { trees } = start(level, seed)
        expect(solveByTrees(n, trees)).toBeNull()
      }
    })

    it(`"${level.label}" starts with no tent on it, and is not already solved`, () => {
      const state = start(level, 5)
      expect(tentCells(state)).toHaveLength(0)
      expect(isSolved(state)).toBe(false)
      expect(rowMarks(state).includes('stuck')).toBe(false)
      expect(colMarks(state).includes('stuck')).toBe(false)
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(start(level, 12).trees).toEqual(start(level, 12).trees)
      expect(start(level, 12).rowClues).toEqual(start(level, 12).rowClues)
      expect(start(level, 12).trees).not.toEqual(start(level, 13).trees)
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
    const camp = pitchCamp(makeRng(9), 6, 6) as { trees: boolean[]; tents: boolean[] }
    const { rowClues, colClues } = cluesOf(6, camp.tents)
    for (let r = 0; r < 6; r++) {
      expect(rowClues[r]).toBe(rowCells(6, r).filter((i) => camp.tents[i]).length)
    }
    for (let c = 0; c < 6; c++) {
      expect(colClues[c]).toBe(colCells(6, c).filter((i) => camp.tents[i]).length)
    }
    // A camp is drawn finished: one tree a tent, and no two tents touching.
    expect(camp.tents.filter(Boolean)).toHaveLength(6)
    expect(camp.trees.filter(Boolean)).toHaveLength(6)
    expect(camp.tents.some((tent, i) => tent && camp.trees[i])).toBe(false)
  })

  it('meets the tightest band of the three from a hundred and fifty fresh seeds', () => {
    // Seven tents is the band that the camps meet least often, so it is the
    // one that a poor run could starve: `deal` looks at 63 camps on average to
    // fill it and 506 at its worst, where five tents takes 1.4 and ten tents
    // 26. Every seed from 0 to 1999 lands inside its band on all three levels,
    // and this is as much of that same walk as the suite can afford.
    const level = levels[1]
    for (let seed = 0; seed < 150; seed++) {
      expect(fits(level.config, init(level, makeRng(seed)))).toBe(true)
    }
  })

  it('keeps both promises when no camp meets the band', () => {
    // A band that no camp can meet, so the fallback is walked on purpose. What
    // comes back has given up the level's difficulty and nothing else: it
    // still reasons out, which is also what makes its answer the only one, and
    // it still needs its numbers.
    const impossible: TentsConfig = { ...levels[1].config, minRounds: 99, maxRounds: 99 }
    const board = deal(makeRng(7), impossible)
    expect(fits(impossible, board)).toBe(false)
    expect(reasonedOut(impossible.n, board)).not.toBeNull()
    expect(solveByTrees(impossible.n, board.trees)).toBeNull()
    expect(countSolutions(impossible.n, board.trees, board.rowClues, board.colClues, 3)).toBe(1)
  })

  it('says so rather than hand back a board that it cannot vouch for', () => {
    // Five tents will not go on a three-wide board — every tent wants a tree
    // of its own beside it — so no camp is ever drawn at all, and there is no
    // honest board left to hand back.
    const airless: TentsConfig = {
      n: 3,
      tents: 5,
      minRounds: 1,
      maxRounds: 99,
      minPacked: 0,
      maxPacked: 99,
    }
    expect(() => deal(makeRng(3), airless)).toThrow(/came out by reasoning/)
  })

  it('keeps two camps in three, which is what puts the fallback out of reach', () => {
    // The recipe for the counts written into `deal`.
    const kept = levels.map((level) => {
      const { n, tents } = level.config
      const rng = makeRng(12345)
      let count = 0
      for (let k = 0; k < 2000; k++) {
        const camp = pitchCamp(rng, n, tents)
        if (camp === null) continue
        if (reasonedOut(n, { trees: camp.trees, ...cluesOf(n, camp.tents) }) !== null) count++
      }
      return count
    })
    expect(kept).toEqual([1517, 1578, 1304])
  })
})

describe('the rules', () => {
  const at = (r: number, c: number) => r * 5 + c

  it('holds the eight squares round a tent, and the nine with it', () => {
    expect(touching(5, at(0, 0)).sort((a, b) => a - b)).toEqual([at(0, 1), at(1, 0), at(1, 1)])
    expect(touching(5, at(2, 2))).toHaveLength(8)
    expect(space(5, at(2, 2))).toHaveLength(9)
    expect(space(5, at(2, 2))[0]).toBe(at(2, 2))
    expect(orthogonal(5, at(0, 0)).sort((a, b) => a - b)).toEqual([at(0, 1), at(1, 0)])
    expect(orthogonal(5, at(2, 2))).toHaveLength(4)
  })

  it('says nothing when the square takes the tent', () => {
    for (const index of FIXTURE_ANSWER) expect(clashOf(fixture(), index)).toBeNull()
    expect(canPitch(fixture(), FIXTURE_ANSWER[0])).toBe(true)
  })

  it('will not have two tents touching, and lights the nine squares round them', () => {
    // A tent in row 1 column 3, and then one on the corner of it.
    const clash = clashOf(fixture([2]), 8)
    expect(clash).toMatchObject({ kind: 'touching', blamed: [8, 2] })
    expect(clash?.cells).toEqual(space(5, 8))
    expect(describeClash(clash!)).toBe('These two tents would be touching.')
  })

  it('will not take a line past its number, and lights the whole line', () => {
    // Row 3 wants none at all, so nothing may stand in it.
    const empty = clashOf(fixture(), 12)
    expect(empty).toMatchObject({ kind: 'row', ordinal: 3, wanted: 0, cells: rowCells(5, 2) })
    expect(describeClash(empty!)).toBe('Row 3 wants no tents at all.')

    // Row 1 wants one, and now has it: the rest of the row is spoken for.
    const full = clashOf(fixture([0]), 2)
    expect(full).toMatchObject({ kind: 'row', ordinal: 1, wanted: 1, blamed: [2, 0] })
    expect(describeClash(full!)).toBe('Row 1 already has its 1 tent.')

    // And a column says the same thing about itself.
    const down = clashOf(fixture([17]), 2)
    expect(down).toMatchObject({ kind: 'column', ordinal: 3, wanted: 1, blamed: [2, 17] })
    expect(describeClash(down!)).toBe('Column 3 already has its 1 tent.')
  })

  it('falls last to the tree that is not there, and lights the four squares it looked at', () => {
    const clash = clashOf(fixture(), 5)
    expect(clash).toMatchObject({ kind: 'tree', blamed: [5] })
    expect(clash?.cells).toEqual([5, ...orthogonal(5, 5)])
    expect(describeClash(clash!)).toBe('A tent has to stand next to a tree.')
  })

  it('reports the rule a child sees first, and only that one', () => {
    // Row 2 column 4 both touches the tent in row 1 column 3 and stands in a
    // column that already has its tent. One tap, one sentence.
    const state = fixture([2, 19])
    expect(tentsIn(state, colCells(5, 3))).toBe(0)
    expect(clashOf(fixture([2, 3]), 8)?.kind).toBe('touching')
  })

  it('offers a forbidden tent, with the sentence that hands it back', () => {
    const state = fixture([2])
    const no = refusalOf(state, 8)
    expect(no?.message).toBe('These two tents would be touching.')
    expect(no?.clash.kind).toBe('touching')
    // The position the tap pretends to reach: the tent stands where the child
    // put it, on a board the puzzle itself never takes.
    expect(no?.pretend.tents[8]).toBe(true)
    expect(no?.pretend.trees).toBe(state.trees)
    expect(state.tents[8]).toBe(false)
    // And there is nothing to refuse where the square takes the tent, where a
    // tent is coming down, or where there is no square at all.
    expect(refusalOf(fixture(), 0)).toBeNull()
    expect(refusalOf(fixture([0]), 0)).toBeNull()
    expect(refusalOf(fixture(), 1)).toBeNull()
    expect(refusalOf(fixture(), -1)).toBeNull()
  })

  it('says nothing at all about a tree, a tent, or a square off the board', () => {
    expect(clashOf(fixture(), 1)).toBeNull() // a tree
    expect(clashOf(fixture([0]), 0)).toBeNull() // a tent already up
    expect(clashOf(fixture(), -1)).toBeNull()
    expect(clashOf(fixture(), 25)).toBeNull()
    expect(clashOf(fixture(), 1.5)).toBeNull()
    expect(canPitch(fixture(), 1)).toBe(false)
    expect(canPitch(fixture(), -1)).toBe(false)
  })
})

describe('reduce', () => {
  it('pitches a tent and takes it down again', () => {
    const state = fixture()
    const up = reduce(state, { type: 'toggle', index: 0 })
    expect(up.tents[0]).toBe(true)
    expect(up.trees).toBe(state.trees)
    expect(up.rowClues).toBe(state.rowClues)
    const down = reduce(up, { type: 'toggle', index: 0 })
    expect(down.tents[0]).toBe(false)
    expect(down.tents).toEqual(state.tents)
  })

  it('hands back the very same state for an action that is not one', () => {
    const state = fixture()
    expect(reduce(state, { type: 'toggle', index: -1 })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: 25 })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: 1.5 })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: 1 })).toBe(state) // a tree
    expect(reduce(state, { type: 'nudge' } as unknown as TentsAction)).toBe(state)
    expect(reduce(state, undefined as unknown as TentsAction)).toBe(state)
  })

  it('hands back the very same state for a tent that would break a rule', () => {
    const touching = fixture([2]) // a tent on the corner of another
    expect(reduce(touching, { type: 'toggle', index: 8 })).toBe(touching)
    const rowFull = fixture([0])
    expect(reduce(rowFull, { type: 'toggle', index: 2 })).toBe(rowFull)
    const colFull = fixture([17])
    expect(reduce(colFull, { type: 'toggle', index: 2 })).toBe(colFull)
    const state = fixture()
    expect(reduce(state, { type: 'toggle', index: 5 })).toBe(state) // no tree beside it
  })

  it('never lets a board hold a tent that breaks a rule', () => {
    // Every board this deals, walked with every move that changes anything:
    // nothing reachable has a tent standing where the rules will not have one.
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 4)) {
        const first = start(level, seed)
        for (const state of positions(first)) {
          for (const action of legalMoves(state)) {
            const next = reduce(state, action)
            if (next === state) continue
            for (const i of tentCells(next)) {
              expect(next.trees[i]).toBe(false)
              expect(touching(next.n, i).some((j) => next.tents[j])).toBe(false)
            }
            for (let r = 0; r < next.n; r++) {
              expect(tentsIn(next, rowCells(next.n, r))).toBeLessThanOrEqual(next.rowClues[r])
            }
            for (let c = 0; c < next.n; c++) {
              expect(tentsIn(next, colCells(next.n, c))).toBeLessThanOrEqual(next.colClues[c])
            }
          }
        }
      }
    }
  })
})

/** Real positions: the answer laid down a tent at a time. */
function positions(state: TentsState): TentsState[] {
  const out = [state]
  let cur = state
  for (const index of answerFor(state)) {
    cur = reduce(cur, { type: 'toggle', index })
    out.push(cur)
  }
  return out
}

describe('isSolved', () => {
  it('will not call a board solved while a tree still wants a tent', () => {
    const short = play(fixture(), solutionActions(fixture()).slice(0, -1))
    expect(tentCells(short)).toHaveLength(2)
    expect(isSolved(short)).toBe(false)
    expect(isSolved(fixture(FIXTURE_ANSWER))).toBe(true)
  })

  it('runs a real pairing, so a board with every number right can still be wrong', () => {
    // Two tents either side of one tree, and a second tree at the far corner
    // with nothing beside it. Every count on this board is right.
    const wrong = pairs(15)
    expect(tentCells(wrong)).toHaveLength(2)
    expect(treeCells(wrong)).toHaveLength(2)
    for (let r = 0; r < 4; r++) expect(tentsIn(wrong, rowCells(4, r))).toBe(wrong.rowClues[r])
    for (let c = 0; c < 4; c++) expect(tentsIn(wrong, colCells(4, c))).toBe(wrong.colClues[c])
    for (const i of tentCells(wrong)) {
      expect(touching(4, i).some((j) => wrong.tents[j])).toBe(false)
      expect(orthogonal(4, i).some((j) => wrong.trees[j])).toBe(true)
    }
    // And it is still not an answer: one tree can be paired, and the other cannot.
    expect(maxPairs(wrong)).toBe(1)
    expect(lonelyTrees(wrong)).toBe(1)
    expect(isSolved(wrong)).toBe(false)

    // Move that second tree one square, so the right-hand tent can own it, and
    // the very same tents under the very same numbers become an answer.
    const right = pairs(6)
    expect(right.tents).toEqual(wrong.tents)
    expect(right.rowClues).toEqual(wrong.rowClues)
    expect(maxPairs(right)).toBe(2)
    expect(lonelyTrees(right)).toBe(0)
    expect(isSolved(right)).toBe(true)
  })

  it('will not have a tent standing on a tree, or two tents touching', () => {
    const onATree: TentsState = { ...fixture(), tents: fixture([1, 8, 17]).tents }
    expect(isSolved(onATree)).toBe(false)
    const both: TentsState = {
      ...fixture(),
      rowClues: [2, 1, 0, 0, 0],
      colClues: [1, 1, 0, 1, 0],
      tents: fixture([0, 6, 8]).tents,
    }
    expect(tentsIn(both, rowCells(5, 0))).toBe(1)
    expect(isSolved(both)).toBe(false)
  })

  it('is worked out from the board alone, never from the board it was dealt', () => {
    for (const level of levels.slice(0, 2)) {
      const first = start(level, 7)
      const done = play(first, solutionActions(first))
      expect(isSolved(done)).toBe(true)
      // The same tents, one number changed: the same position is no longer an
      // answer, so nothing here is remembering how the board was made.
      const bent: TentsState = { ...done, rowClues: done.rowClues.map((c, i) => (i === 0 ? c + 1 : c)) }
      expect(isSolved(bent)).toBe(false)
    }
  })
})

describe('par', () => {
  it('is one move a tent, and one tent a tree', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.tents)
      expect(treeCells(start(level, 3))).toHaveLength(level.par as number)
    }
  })

  it('cannot be beaten, because a move moves exactly one tent', () => {
    /* The floor, checked by construction rather than asserted. A board starts
       with no tents on it; `isSolved` wants one for every tree; and every move
       that changes anything moves the count by exactly one. So `trees` moves is
       the fewest there can be. */
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 4)) {
        const first = start(level, seed)
        expect(tentCells(first)).toHaveLength(0)
        for (const state of positions(first)) {
          for (const action of legalMoves(state)) {
            const next = reduce(state, action)
            if (next === state) continue
            expect(Math.abs(tentCells(next).length - tentCells(state).length)).toBe(1)
          }
          if (isSolved(state)) expect(tentCells(state)).toHaveLength(treeCells(state).length)
        }
      }
    }
  })

  it('is reached, because the answer can be pitched in any order', () => {
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
    const seeds = [[1000, 1037], [1000], [1000]]
    levels.forEach((level, k) => {
      for (const seed of seeds[k]) {
        const path = shortestSolution<TentsState, TentsAction>({
          start: start(level, seed),
          moves: legalMoves,
          apply: reduce,
          key: (s) => s.tents.map((tent) => (tent ? '1' : '0')).join(''),
          solved: isSolved,
        })
        expect(path).not.toBeNull()
        expect(path).toHaveLength(level.par as number)
      }
    })
  })
})

describe('what the board may say without being asked', () => {
  it('shades a square a tent stands beside', () => {
    const blocked = blockedCells(fixture([2]))
    for (const i of touching(5, 2)) if (!fixture().trees[i]) expect(blocked[i]).toBe(true)
  })

  it('shades a square in a line that has all the tents its number wants', () => {
    // Row 3 and row 5 want none at all, and column 2 and column 5 want none:
    // every square in them is spoken for before a tent is pitched.
    const blocked = blockedCells(fixture())
    for (const i of [...rowCells(5, 2), ...rowCells(5, 4), ...colCells(5, 1), ...colCells(5, 4)]) {
      if (!fixture().trees[i]) expect(blocked[i]).toBe(true)
    }
    // And once row 1 has its tent, the rest of row 1 goes with it.
    expect(blockedCells(fixture([0]))[2]).toBe(true)
  })

  it('never shades a square for the trees, which is the part the child works out', () => {
    // Row 2 column 1 has no tree beside it, so no tent may ever stand there —
    // and the board does not say so. Which squares the trees leave is the
    // puzzle; what a child's own tents rule out is not.
    const state = fixture()
    expect(canPitch(state, 5)).toBe(false)
    expect(clashOf(state, 5)?.kind).toBe('tree')
    expect(blockedCells(state)[5]).toBe(false)
    for (let i = 0; i < 25; i++) {
      const clash = clashOf(state, i)
      expect(blockedCells(state)[i]).toBe(clash !== null && clash.kind !== 'tree')
    }
  })

  it('crosses a number off when its line is full, and boxes it when it can never be', () => {
    const empty = fixture()
    expect(rowMarks(empty)).toEqual(['open', 'open', 'done', 'open', 'done'])
    expect(colMarks(empty)).toEqual(['open', 'done', 'open', 'open', 'done'])

    // A tent in row 3 column 3 breaks no rule. It also takes every square
    // column 2 had left for the tent its number still wants.
    const board = crowded()
    expect(countSolutions(5, board.trees, board.rowClues, board.colClues, 3)).toBe(1)
    expect(canPitch(board, 12)).toBe(true)
    const spoiled = reduce(board, { type: 'toggle', index: 12 })
    expect(spoiled).not.toBe(board)
    expect(colMarks(spoiled)[1]).toBe('stuck')
    expect(colCells(5, 1).every((i) => !canPitch(spoiled, i))).toBe(true)
    expect(tentsIn(spoiled, colCells(5, 1))).toBeLessThan(spoiled.colClues[1])

    // Nothing on the board breaks a rule, so this is not a dead end the shell
    // has to lock: taking the tent down puts the board back.
    const back = reduce(spoiled, { type: 'toggle', index: 12 })
    expect(colMarks(back)).toEqual(colMarks(board))
    expect(isSolved(play(back, solutionActions(back)))).toBe(true)
  })

  it('boxes a line for the tents already pitched, and never for the trees', () => {
    // A tent in row 1 column 3 leaves row 2 nowhere its own rules allow — but
    // row 2 column 1 is empty, undotted, and out only because no tree stands
    // beside it. That is the child's deduction, so the number stays open.
    const spoiled = reduce(fixture(), { type: 'toggle', index: 2 })
    expect(hasRoom(spoiled, 5)).toBe(true)
    expect(canPitch(spoiled, 5)).toBe(false)
    expect(clashOf(spoiled, 5)?.kind).toBe('tree')
    expect(blockedCells(spoiled)[5]).toBe(false)
    expect(rowMarks(spoiled)[1]).toBe('open')
  })

  it('boxes a number exactly when the dots under it say so', () => {
    // The claim the clay box rests on: a child can check it by looking. Every
    // square of a boxed line is a tree, a tent or a dotted square, and every
    // open line has a square that is none of those.
    for (const level of levels.slice(0, 2)) {
      for (const seed of SEEDS.slice(0, 3)) {
        const first = start(level, seed)
        for (const action of legalMoves(first)) {
          const next = reduce(first, action)
          if (next === first) continue
          const dotted = blockedCells(next)
          const spoken = (i: number) => next.trees[i] || next.tents[i] || dotted[i]
          const check = (mark: string, cells: number[]) => {
            if (mark === 'stuck') expect(cells.every(spoken)).toBe(true)
            if (mark === 'open') expect(cells.some((i) => !spoken(i))).toBe(true)
          }
          rowMarks(next).forEach((mark, r) => check(mark, rowCells(next.n, r)))
          colMarks(next).forEach((mark, c) => check(mark, colCells(next.n, c)))
        }
      }
    }
  })

  it('boxes a tree the tents have walled in, which the numbers cannot see', () => {
    expect(strandedTrees(fixture())).toEqual([])
    // The same tent in row 1 column 3, and this is what it really spoiled: the
    // tree in row 5 column 3 has row 5 wanting no tents at all on two sides of
    // it and a full column 3 on the third.
    const spoiled = reduce(fixture(), { type: 'toggle', index: 2 })
    expect(strandedTrees(spoiled)).toEqual([22])
    expect(orthogonal(5, 22).every((i) => !hasRoom(spoiled, i) && !spoiled.tents[i])).toBe(true)
    // No line is boxed here, so it is a wrong turn the numbers say nothing about.
    expect(rowMarks(spoiled).includes('stuck')).toBe(false)
    expect(colMarks(spoiled).includes('stuck')).toBe(false)
    // Taking the tent down gives the tree its squares back.
    expect(strandedTrees(reduce(spoiled, { type: 'toggle', index: 2 }))).toEqual([])
  })

  it('never cries wrong turn on a position the answer goes through', () => {
    // Every prefix of the one answer, on every level: nothing the board says
    // without being asked ever calls a position spoilt that is not.
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 6)) {
        for (const state of positions(start(level, seed))) {
          expect(rowMarks(state).includes('stuck')).toBe(false)
          expect(colMarks(state).includes('stuck')).toBe(false)
          expect(strandedTrees(state)).toEqual([])
        }
      }
    }
  })

  it('counts a line it has never seen the same way', () => {
    expect(lineMark(fixture(), rowCells(5, 2), 0)).toBe('done')
    expect(lineMark(fixture([0]), rowCells(5, 0), 1)).toBe('done')
    expect(lineMark(fixture(), rowCells(5, 0), 1)).toBe('open')
  })
})

describe('describe', () => {
  it('names the square, in the past tense, both ways round', () => {
    const state = fixture()
    const up = reduce(state, { type: 'toggle', index: 8 })
    expect(describeMove(state, up, { type: 'toggle', index: 8 })).toBe(
      'Pitched a tent in row 2, column 4',
    )
    expect(describeMove(up, state, { type: 'toggle', index: 8 })).toBe(
      'Took the tent down in row 2, column 4',
    )
    expect(rowOf(5, 8)).toBe(1)
    expect(colOf(5, 8)).toBe(3)
  })

  it('names the square the move actually changed, for every square', () => {
    const state = start(levels[1], 44)
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      if (next === state) continue
      const changed = next.tents.findIndex((tent, i) => tent !== state.tents[i])
      expect(describeMove(state, next, action)).toContain(
        `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
      )
    }
  })
})

/* ============================================================
   The board
   ============================================================ */

const paint = (state: TentsState, locked = false, allow = true) => {
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
const Play = ({ from }: { from: TentsState }) => {
  const [state, setState] = useState(from)
  return createElement(Board, {
    state,
    dispatch: (action: TentsAction) => setState((cur) => reduce(cur, action)),
    locked: false,
  })
}

const playing = (from: TentsState) =>
  render(createElement(Play, { from }), { wrapper: underSettings() })

const wearing = (cue: string) =>
  [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

describe('the board', () => {
  it('draws a square you can press wherever no tree stands, and a picture where one does', () => {
    const { all } = paint(fixture())
    expect(all()).toHaveLength(25 - FIXTURE_TREES.length)
    for (const button of all()) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).toMatch(/^Row \d+, column \d+, (empty|a tent)/)
    }
    // A tree is not a control, and neither is a number.
    expect(screen.getByRole('img', { name: 'Row 1, column 2, a tree' })).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(FIXTURE_TREES.length + 10)
  })

  it('stands a number at the end of every row and every column, and says how it is doing', () => {
    paint(fixture())
    expect(screen.getByRole('img', { name: 'Row 1 wants 1 tent and has 0' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Row 3 wants no tents at all' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Column 3 wants 1 tent and has 0' })).toBeInTheDocument()
    const marks = [...document.querySelectorAll('[data-mark]')].map((el) =>
      el.getAttribute('data-mark'),
    )
    expect(marks).toEqual([
      // The columns along the top, then the rows down the side.
      'open', 'done', 'open', 'open', 'done',
      'open', 'open', 'done', 'open', 'done',
    ])
  })

  it('crosses the number off when its line is full, and boxes it when it can never be', () => {
    const one = playing(fixture())
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 3, empty$/ }))
    expect(screen.getByRole('img', { name: 'Row 1 has its 1 tent' })).toHaveAttribute(
      'data-mark',
      'done',
    )
    one.unmount()

    // A tent in row 3 column 3 takes the last of column 2 with it.
    const two = playing(crowded())
    fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 3, empty$/ }))
    expect(
      screen.getByRole('img', { name: 'Column 2 wants 1 tent, has 0, and has no room for another' }),
    ).toHaveAttribute('data-mark', 'stuck')
    expect(
      screen.getAllByText('Column 2 has no room left for another tent.').length,
    ).toBeGreaterThan(0)
    two.unmount()
  })

  it('boxes the tree its own tents have walled in, and says which tree', () => {
    const view = playing(fixture())
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 3, empty$/ }))
    const walled = screen.getByRole('img', {
      name: 'Row 5, column 3, a tree with no room left for its tent',
    })
    expect(walled).toHaveAttribute('data-mark', 'stuck')
    expect(
      screen.getAllByText('The tree in row 5, column 3 has no room left for its tent.').length,
    ).toBeGreaterThan(0)
    // The other trees are still owed a tent they can have, and say nothing.
    expect(screen.getByRole('img', { name: 'Row 1, column 2, a tree' })).not.toHaveAttribute(
      'data-mark',
    )
    expect(screen.getByRole('img', { name: 'Row 3, column 4, a tree' })).not.toHaveAttribute(
      'data-mark',
    )
    view.unmount()
  })

  it('marks the squares its own tents rule out, and no others', () => {
    const state = fixture([2])
    paint(state)
    const dotted = [...document.querySelectorAll('[data-room="none"]')].map(
      (el) => el.getAttribute('aria-label') as string,
    )
    const blocked = blockedCells(state)
    const expected = blocked
      .map((no, i) => (no ? `Row ${rowOf(5, i) + 1}, column ${colOf(5, i) + 1}, empty, no room for a tent` : ''))
      .filter(Boolean)
    expect(dotted.sort()).toEqual(expected.sort())
    // Row 2, column 1 has no tree beside it and takes no mark: the board never
    // does the part about the trees.
    expect(screen.getByRole('button', { name: '' + 'Row 2, column 1, empty' })).not.toHaveAttribute(
      'data-room',
    )
  })

  it('sends exactly one action for one tap', () => {
    const { dispatch, by } = paint(fixture())
    fireEvent.click(by(/^Row 1, column 1, empty$/))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle', index: 0 })
  })

  it('counts what is left to pitch, and then what will not pair up', () => {
    const view = playing(fixture())
    expect(screen.getAllByText('3 tents still to pitch.').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^Row 1, column 1, empty$/ }))
    expect(screen.getAllByText('2 tents still to pitch.').length).toBeGreaterThan(0)
    view.unmount()

    // Every number right, and one tree still without a tent of its own.
    paint(pairs(15))
    expect(
      screen.getAllByText('Every number is right. 1 tree has no tent of its own.').length,
    ).toBeGreaterThan(0)
  })

  it('pitches a forbidden tent, answers it, and puts it back', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    try {
      const { dispatch, view } = paint(fixture([2]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 4, empty/ }))
      // Nothing forbidden reaches the shell, so nothing reaches the history.
      expect(dispatch).not.toHaveBeenCalled()
      // The tent went where the child put it, for one cue.
      const flashed = view.container.querySelector(`.${cues.flash}`) as HTMLElement
      expect(flashed.getAttribute('aria-label')).toBe('Row 2, column 4, a tent')
      for (const line of screen.getAllByRole('status')) {
        expect(line.textContent).toContain('These two tents would be touching.')
      }
      // And the nine squares round it are lit, less the one wearing the ring.
      expect(wearing(cues.highlight)).toHaveLength(space(5, 8).length - 1)

      act(() => vi.advanceTimersByTime(480))
      expect(view.container.querySelector(`.${cues.flash}`)).toBeNull()
      expect(screen.getByRole('button', { name: /^Row 2, column 4, empty/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('lights the group for the length the highlight is animated over', () => {
    // `.highlight` runs for --dur-5, so the cue that puts it on has to hold it
    // for --dur-5: taken off at --dur-4 the light would be cut at 53% of its
    // run, in the middle of the plateau, and blink out at full clay.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const { view } = paint(fixture([2]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 4, empty/ }))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // The ring goes with the tent it was about, at --dur-4.
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
    // move tape under it at any time at all. `useRefusal` drops its pretend
    // position the moment the state moves; the light has to go with it, or it
    // blames squares on the position in front of the child for a tap that was
    // made on another one.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-4', '480ms')
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const view = playing(fixture([2]))
      fireEvent.click(screen.getByRole('button', { name: /^Row 2, column 4, empty/ }))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // The ring is over, the light is not, and the board is live again.
      act(() => vi.advanceTimersByTime(480))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      // One tent that the rules take, and the lit group is about a board that is gone.
      fireEvent.click(screen.getByRole('button', { name: /^Row 4, column 4, empty$/ }))
      expect(screen.getByRole('button', { name: /^Row 4, column 4, a tent$/ })).toBeInTheDocument()
      expect(wearing(cues.highlight)).toHaveLength(0)
      view.unmount()
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('lights the line a refused tent would have taken past its number', () => {
    const { view } = paint(fixture())
    fireEvent.click(screen.getByRole('button', { name: /^Row 3, column 1, empty/ }))
    // The number itself is what the tap fell foul of, so it is lit with its row.
    const clue = screen.getByRole('img', { name: 'Row 3 wants no tents at all' })
    expect(clue.className).toContain(cues.highlight)
    expect(wearing(cues.highlight)).toHaveLength(rowCells(5, 2).length - 1 + 1)
    for (const line of screen.getAllByRole('status')) {
      expect(line.textContent).toContain('Row 3 wants no tents at all.')
    }
    view.unmount()
  })

  it('takes the square back once the player has asked for a rule to refuse up front', () => {
    const { dispatch, by } = paint(fixture(), false, false)
    expect(by(/^Row 1, column 1, empty$/)).not.toHaveAttribute('aria-disabled')
    const dead = by(/^A tent has to stand next to a tree\. Row 2, column 1, empty$/)
    expect(dead).toHaveAttribute('aria-disabled', 'true')
    expect(
      by(/^Row 3 wants no tents at all\. Row 3, column 1, empty, no room for a tent$/),
    ).toHaveAttribute('aria-disabled', 'true')
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
    // way round. The tab stop is seeded on the first square with no tree on
    // it, and on every one of these boards that square clashes: while a
    // clashing square was `disabled` the board had no tab stop at all, and a
    // child playing by keyboard or switch could not get onto it.
    const dealt: [number, number][] = [
      [0, 1000],
      [0, 1037],
      [1, 1000],
      [1, 1037],
      [2, 1037],
    ]
    for (const [level, seed] of dealt) {
      const state = start(levels[level], seed)
      expect(clashOf(state, state.trees.indexOf(false))).not.toBeNull()
      const { view, all } = paint(state, false, false)
      const stops = all().filter((el) => el.getAttribute('tabindex') === '0')
      expect(stops).toHaveLength(1)
      // A disabled button cannot be focused, so a tab stop on one is no tab
      // stop at all — and jsdom hands it focus anyway, which is why this asks
      // the DOM rather than `document.activeElement`.
      expect(stops[0]).toBeEnabled()
      stops[0].focus()
      expect(document.activeElement).toBe(stops[0])
      view.unmount()
    }
  })

  it('walks the arrow keys onto a square that will not take a tent, and keeps the stop there', () => {
    const { by, all } = paint(fixture(), false, false)
    const corner = by(/^Row 1, column 1, empty$/)
    corner.focus()
    fireEvent.keyDown(corner, { key: 'ArrowDown' })
    // Row 2 column 1 has no tree beside it, so it will not take a tent — and a
    // child reading the board with the arrow keys still gets to hear why.
    const dead = by(/^A tent has to stand next to a tree\. Row 2, column 1, empty$/)
    expect(dead).toBeEnabled()
    expect(document.activeElement).toBe(dead)
    expect(all().filter((el) => el.getAttribute('tabindex') === '0')).toEqual([dead])
  })

  it('walks the arrow keys from square to square, stepping over the trees', () => {
    const { by } = paint(fixture())
    const corner = by(/^Row 1, column 1, empty$/)
    corner.focus()
    fireEvent.keyDown(corner, { key: 'ArrowRight' })
    // Row 1, column 2 is a tree, so the step carries on to column 3.
    expect(document.activeElement).toBe(by(/^Row 1, column 3, empty$/))
    // And it stands still at the edge rather than wrapping round.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(by(/^Row 1, column 3, empty$/))

    const stops = [...document.querySelectorAll('[aria-label^="Row 1, column 3"]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toHaveLength(1)
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
  })

  it('leaves the title, the hints and the win message to the shell', () => {
    const { view } = paint(fixture())
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(tentsAndTrees.title)
    expect(text).not.toContain(tentsAndTrees.tagline)
    for (const line of tentsAndTrees.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(tentsAndTrees.id).toBe('tents-and-trees')
    expect(tentsAndTrees.title).toBe('The tents and trees')
    expect(tentsAndTrees.reseedable).toBe(true)
    // A tent in the wrong place is taken down, not stepped back from, so there
    // is deliberately no failure(): nothing on this board ever breaks a rule,
    // and the one wrong turn it has — a line with no room left — is said on
    // the line's own number and undone by taking a tent down.
    expect(tentsAndTrees.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(levels.map((l) => l.id)).toEqual(['five-tents', 'seven-tents', 'ten-tents'])
    expect(tentsAndTrees.instructions.length).toBeGreaterThanOrEqual(2)
    expect(tentsAndTrees.instructions.length).toBeLessThanOrEqual(4)
    for (const line of tentsAndTrees.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(140)
    }
  })

  it('never borrows a board word for something the board does not mean by it', () => {
    // The board calls a square 'empty' whether or not a tent could ever stand
    // on it, so a hint about 'an empty square beside a tree' is read as the
    // board's word and is true of nine boards in ten at the start.
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

  it('ramps by size, and asks for more counting as it goes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.par)).toEqual([5, 7, 10])
    const floors = levels.map((l) => l.config.minRounds)
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
    // And the step that takes real counting is asked for by name, so the harder
    // levels are not the easy one with more squares.
    expect(levels.map((l) => l.config.minPacked)).toEqual([0, 1, 2])
    // Five tents is dealt without that step and its three hints never teach
    // it, so it is the one level that may not ask for it either. Without the
    // ceiling one board in two hundred and fifty arrived here needing up to
    // seven squares of it, where the sit-down level is asked for two.
    expect(levels[0].config.maxPacked).toBe(0)
    for (const level of levels) {
      expect(level.config.maxPacked).toBeGreaterThanOrEqual(level.config.minPacked)
    }
  })

  it('stands every ceiling no higher than the floor of the level above it', () => {
    // The ladder rule, on both dials. A floor on its own only stops a level
    // from being the level below with more squares; the ceiling is what stops
    // it from being the level above. With `maxPacked: 99` on the six-wide
    // level it settled up to eleven squares by counting, where the seven-wide
    // level settles nine at its worst: put the 99 back, deal seeds 0 to 499 a
    // level, and read `packed` off `solveByLogic`.
    const bands = levels.map((l) => l.config)
    for (let k = 0; k + 1 < bands.length; k++) {
      expect(bands[k].maxRounds).toBeLessThanOrEqual(bands[k + 1].minRounds)
      expect(bands[k].maxPacked).toBeLessThanOrEqual(bands[k + 1].minPacked)
    }
    // And the last level is the one left open, because nothing stands above
    // it. A pass has to settle a square to count, so the board's own squares
    // are past every number either dial can reach.
    const last = bands[bands.length - 1]
    expect(last.maxRounds).toBeGreaterThanOrEqual(last.n * last.n)
    expect(last.maxPacked).toBeGreaterThanOrEqual(last.n * last.n)
  })

  it('deals five tents without the counting step, over far more seeds than the rest', () => {
    const level = levels[0]
    for (let seed = 0; seed < 300; seed++) {
      const { trees, rowClues, colClues } = init(level, makeRng(seed))
      const reasoned = solveByLogic(5, trees, rowClues, colClues) as Deduction
      expect(reasoned).not.toBeNull()
      expect(reasoned.packed).toBe(0)
      expect(reasoned.rounds).toBeLessThanOrEqual(2)
    }
  })
})

/* ============================================================
   The stylesheet, as written. The margin is the whole point of
   this board, so the one thing asserted here is that a number
   stays inside the gutter that it stands in.
   ============================================================ */

describe('the margin', () => {
  // jsdom's URL is not node's, so take the directory off the module url by hand.
  const css = readFileSync(
    new URL(import.meta.url).pathname.replace(/[^/]+$/, 'board.module.css'),
    'utf8',
  )
  const block = (selector: string) =>
    new RegExp(`\\.${selector} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''

  it('keeps a number narrower than its gutter, at all three sizes of board', () => {
    // Both are fractions of --cell, so the two cannot drift apart. Sized off
    // the viewport instead, the number's 1.6em came to 1.6 x 0.044 = 0.0704 of
    // the viewport, while a seven-wide board holds --cell at its 44px floor —
    // and the gutter at 29px — until 8.5vw catches 44px at 518px wide. From
    // 413px up, the row numbers stood wider than their gutter and ran under
    // the rim of the field.
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
})
