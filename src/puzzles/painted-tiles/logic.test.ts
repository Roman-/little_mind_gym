import { createElement, useState } from 'react'
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { colourRegions, regionPaint } from '../../lib/regions'
import { makeRng, randInt, shuffled } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel, Rng } from '../../lib/types'
import { paintedTiles } from './index'
import { Board } from './Board'
import { PaintedTilesIcon } from './glyphs'
import type { Deal, Reasoned, TileAction, TileConfig, TileState } from './logic'
import {
  ATTEMPTS,
  BIGGEST_TILE,
  CARD,
  EASIER,
  SMALLEST_TILE,
  STEPS,
  cluesOf,
  colCells,
  colOf,
  countSolutions,
  countWord,
  cutTiles,
  deal,
  describeMove,
  draw,
  fits,
  init,
  isPainted,
  isSolved,
  legalMoves,
  neededAtStart,
  orthogonal,
  reasoned,
  reduce,
  rowCells,
  rowOf,
  solveByLogic,
  tileCells,
  tileNames,
  tileSizes,
} from './logic'

const levels = paintedTiles.levels as PuzzleLevel<TileConfig>[]
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/**
 * Every board is dealt once and shared. Dealing all 180 takes about a second
 * and a half with the machine under load, and half the tests below want the
 * same boards.
 */
const dealt = new Map<string, TileState>()
function start(level: PuzzleLevel<TileConfig>, seed: number): TileState {
  const key = `${level.id}:${seed}`
  const found = dealt.get(key)
  if (found !== undefined) return found
  const made = init(level, makeRng(seed))
  dealt.set(key, made)
  return made
}

/** The steps of the level that deals boards of this size, or all three for a fixture. */
const stepsFor = (state: TileState) =>
  STEPS[levels.find((level) => level.config.n === state.n)?.config.step ?? 'sums']

/** The one answer, worked out the way a child would, with the level's own steps. */
const answerFor = (state: TileState) =>
  (solveByLogic(state.n, state.tiles, state.rowClues, state.colClues, stepsFor(state)) as Reasoned)
    .painted

/**
 * The deal behind each of those boards, drawn answer and all. `init` keeps only
 * what the player sees, so the answer the numbers were counted off is reached
 * through `deal` on the same seed — and the first tests below prove that `init`
 * hands out that very board, so what they prove of the deal holds of the game.
 * Dealing the second copy of all 180 was measured at 722ms.
 */
const drawn = new Map<string, Deal>()
function drawnFor(level: PuzzleLevel<TileConfig>, seed: number): Deal {
  const key = `${level.id}:${seed}`
  const found = drawn.get(key)
  if (found !== undefined) return found
  const made = deal(makeRng(seed), level.config)
  drawn.set(key, made)
  return made
}

/** One tap on the first square of each tile the answer paints. Each is one move. */
function solutionActions(state: TileState): TileAction[] {
  const cells = tileCells(state.tiles)
  return answerFor(state)
    .map((on, t) => (on ? t : -1))
    .filter((t) => t >= 0)
    .map((t) => ({ type: 'toggle', cell: cells[t][0] }) as TileAction)
}

const play = (state: TileState, actions: TileAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** How many tiles hold paint. The one number par is cut from. */
const paintedTileCount = (state: TileState) => state.painted.filter(Boolean).length

/**
 * Painted squares among these, for a test that reads a line. It lives here and
 * not in `logic.ts` because nothing in the game ever sets a line's paint against
 * its number while a child plays: the board says nothing, and `isSolved` counts
 * every line at once with `cluesOf`.
 */
const paintedIn = (state: TileState, cells: number[]) =>
  cells.filter((cell) => isPainted(state, cell)).length

/** The tap that flips tile t. */
const tapTile = (state: TileState, t: number) =>
  reduce(state, { type: 'toggle', cell: tileCells(state.tiles)[t][0] })

/** Lines holding more than their number, and lines holding exactly it, counted in one pass. */
function readLines(state: TileState) {
  const has = cluesOf(state.n, state.tiles, state.painted)
  let over = 0
  let right = 0
  for (let k = 0; k < state.n; k++) {
    for (const [got, want] of [
      [has.rowClues[k], state.rowClues[k]],
      [has.colClues[k], state.colClues[k]],
    ]) {
      if (got > want) over++
      if (got === want) right++
    }
  }
  return { over, right }
}

/**
 * A hand-built board, so a test can name a square rather than hunt for one. It
 * has one answer, counting finishes it in two passes, and it holds a bent three,
 * a straight three and five dominoes:
 *
 *            1 1 1 3
 *        0   a b b b      a is a bent three, b a straight three, c to g dominoes
 *        1   a a c D      row 1 is 0: a and b stay plain, all of them
 *        3   E E c D      column 4 wants 3 and has exactly 3 open: D and G painted
 *        2   f f G G      row 2 then has its 1, so c is plain; row 3 needs E
 *
 * Capitals are the answer's three painted tiles, so par here is 3.
 */
const FIXTURE_TILES = [0, 1, 1, 1, 0, 0, 2, 3, 4, 4, 2, 3, 5, 5, 6, 6]
const FIXTURE_ROWS = [0, 1, 3, 2]
const FIXTURE_COLUMNS = [1, 1, 1, 3]
const FIXTURE_ANSWER = [false, false, false, true, true, false, true]

const fixture = (painted: boolean[] = FIXTURE_ANSWER.map(() => false)): TileState => ({
  n: 4,
  tiles: FIXTURE_TILES,
  rowClues: FIXTURE_ROWS,
  colClues: FIXTURE_COLUMNS,
  painted,
})

/** The fixture as a level would have asked for it, for `reasoned`. */
const FIXTURE_CONFIG: TileConfig = {
  n: 4,
  painted: 3,
  minTiles: 7,
  maxTiles: 7,
  step: 'count',
  minPasses: 2,
  zero: true,
  noWayIn: false,
  bothHalves: false,
  neededAtStart: false,
}

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n, minTiles, maxTiles, painted, step, minPasses } = level.config

    it(`"${level.label}" lays tiles of two or three squares over every square, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        const cells = tileCells(state.tiles)
        expect(cells.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: n * n }, (_, i) => i))
        expect(cells.length).toBeGreaterThanOrEqual(minTiles)
        expect(cells.length).toBeLessThanOrEqual(maxTiles)
        cells.forEach((squares, t) => {
          expect(squares.length).toBeGreaterThanOrEqual(SMALLEST_TILE)
          expect(squares.length).toBeLessThanOrEqual(BIGGEST_TILE)
          // Joined up: every square of a tile shares an edge with another of it,
          // which for two or three squares is the same as the tile being one piece.
          for (const cell of squares) {
            expect(orthogonal(n, cell).some((nb) => state.tiles[nb] === t)).toBe(true)
          }
          // Numbered in reading order, so tile 0 holds the top left square and the
          // letters on the board run the way a child reads.
          if (t > 0) expect(squares[0]).toBeGreaterThan(cells[t - 1][0])
        })
      }
    })

    it(`"${level.label}" numbers every line off the answer it drew, and deals the child that board, every seed`, () => {
      for (const seed of SEEDS) {
        const d = drawnFor(level, seed)
        expect(d.rowClues).toHaveLength(n)
        expect(d.colClues).toHaveLength(n)
        expect(d.answer).toHaveLength(tileCells(d.tiles).length)
        expect(d.answer.filter(Boolean)).toHaveLength(painted)
        // The numbers are counted off the paint that was drawn, not off anything
        // the solver later finds — so this cannot pass by reading its own answer.
        expect(cluesOf(n, d.tiles, d.answer)).toEqual({ rowClues: d.rowClues, colClues: d.colClues })
        // And `init` is that deal, less the answer.
        const state = start(level, seed)
        expect(state.tiles).toEqual(d.tiles)
        expect(state.rowClues).toEqual(d.rowClues)
        expect(state.colClues).toEqual(d.colClues)
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(countSolutions(n, state.tiles, state.rowClues, state.colClues, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out with its own steps, and never falls back, every seed`, () => {
      for (const seed of SEEDS) {
        const d = drawnFor(level, seed)
        // The fallback in `deal` is for a run of luck no seed has ever had: every
        // one of these lands on a board that suits the level.
        expect(fits(level.config, d)).toBe(true)
        // Reasoned out with the level's own steps, the board lands on the paint
        // that was drawn — the answer the numbers were counted off.
        const found = reasoned(level.config, d) as Reasoned
        expect(found.painted).toEqual(d.answer)
        expect(found[step]).toBeGreaterThanOrEqual(minPasses)
      }
    })

    it(`"${level.label}" starts unpainted, and is not already solved`, () => {
      for (const seed of SEEDS.slice(0, 8)) {
        const state = start(level, seed)
        expect(state.painted).toEqual(tileCells(state.tiles).map(() => false))
        expect(isSolved(state)).toBe(false)
      }
      expect(painted).toBe(level.par)
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(init(level, makeRng(12)).tiles).toEqual(init(level, makeRng(12)).tiles)
      expect(init(level, makeRng(12)).rowClues).toEqual(init(level, makeRng(12)).rowClues)
      expect(init(level, makeRng(12)).tiles).not.toEqual(init(level, makeRng(13)).tiles)
    })
  }

  it('cannot be finished by an easier level’s steps, every seed', () => {
    // The dial. No board of a later level comes out with an earlier level's
    // steps, so the three levels are three questions, not one on three grids.
    for (const level of levels.slice(1)) {
      for (const seed of SEEDS) {
        const { n, tiles, rowClues, colClues } = start(level, seed)
        expect(solveByLogic(n, tiles, rowClues, colClues, ['count'])).toBeNull()
        if (level.config.step === 'sums') {
          expect(solveByLogic(n, tiles, rowClues, colClues, ['count', 'size'])).toBeNull()
        }
      }
    }
    expect(levels.map((l) => EASIER[l.config.step])).toEqual([null, ['count'], ['count', 'size']])
  })

  it('deals a board for every level inside a blink', () => {
    // The worst of 600 seeds a level was measured at 74ms under load.
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })

  it('keeps the promises its hints make, every seed', () => {
    // A hint may only name something that is on every board it is shown on, so
    // each of these is a gate in the config and this is the claim it holds up.
    const [five, six, seven] = levels
    expect(five.hints[0]).toContain('0')
    for (const seed of SEEDS) {
      // Five across: "Start with a 0 at the side or along the top."
      const a = start(five, seed)
      expect([...a.rowClues, ...a.colClues]).toContain(0)

      // Six across: "A tile can put more than one square into a line." And each
      // half of the size step is needed: take either away and the board stalls.
      const b = start(six, seed)
      for (const squares of tileCells(b.tiles)) {
        // Each square is in one row and one column; the busiest of those lines
        // is where the tile puts the most squares at once.
        const lines = [
          ...squares.map((cell) => `row ${rowOf(b.n, cell)}`),
          ...squares.map((cell) => `column ${colOf(b.n, cell)}`),
        ]
        const most = Math.max(...lines.map((line) => lines.filter((x) => x === line).length))
        expect(most).toBeGreaterThanOrEqual(2)
      }
      const halves = (half: 'needed' | 'tooBig') =>
        solveByLogic(b.n, b.tiles, b.rowClues, b.colClues, STEPS.size, [half])
      expect(halves('needed')).toBeNull()
      expect(halves('tooBig')).toBeNull()

      // Seven across: no 0 and no full line to start from, and "a line that wants
      // nearly every square" holding a tile "with more squares in that line than
      // the line can leave plain".
      const c = start(seven, seed)
      const clues = [...c.rowClues, ...c.colClues]
      expect(clues.every((clue) => clue > 0 && clue < c.n)).toBe(true)
      expect(neededAtStart(c.n, c.tiles, c.rowClues, c.colClues)).toBe(true)
      const lines = [
        ...Array.from({ length: c.n }, (_, r) => rowCells(c.n, r)),
        ...Array.from({ length: c.n }, (_, k) => colCells(c.n, k)),
      ]
      const opening = lines.filter((cells, line) =>
        tileCells(c.tiles).some((squares) => {
          const inLine = squares.filter((cell) => cells.includes(cell)).length
          return inLine > 0 && c.n - inLine < clues[line]
        }),
      )
      expect(opening.length).toBeGreaterThan(0)
      for (const cells of opening) {
        const line = lines.indexOf(cells)
        expect(clues[line]).toBeGreaterThanOrEqual(c.n - 2)
      }
    }
  })

  it('never hands back a board with two answers, whatever it settles for', () => {
    // No band is this deep, so `deal` has to fall back, and it does so inside
    // thirty draws on every seed here (a few milliseconds each). The fallback
    // gives up the difficulty band and nothing else: it is still reasoned out
    // by the level's own steps, still one answer, still par to the move.
    expect(ATTEMPTS).toBe(1000)
    for (const level of levels) {
      for (let seed = 7; seed <= 11; seed++) {
        const board = deal(makeRng(seed), { ...level.config, minPasses: 99 }, 30)
        const { n } = level.config
        expect(reasoned(level.config, board)).not.toBeNull()
        expect(countSolutions(n, board.tiles, board.rowClues, board.colClues, 3)).toBe(1)
        expect(board.answer.filter(Boolean)).toHaveLength(level.config.painted)
      }
    }
  })

  it('draws a candidate with paint on exactly as many tiles as par', () => {
    const board = draw(makeRng(5), levels[1].config) as Deal
    expect(board).not.toBeNull()
    expect(board.answer.filter(Boolean)).toHaveLength(levels[1].config.painted)
    expect(cluesOf(6, board.tiles, board.answer)).toEqual({
      rowClues: board.rowClues,
      colClues: board.colClues,
    })
  })

  it('cuts a tiling for every seed it is handed', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const n of [5, 6, 7]) {
        const tiles = cutTiles(makeRng(seed * 13 + 1), n)
        expect(tiles).toHaveLength(n * n)
        expect(tiles.every((t) => t >= 0)).toBe(true)
        expect(tileSizes(tiles).every((size) => size >= 2 && size <= 3)).toBe(true)
      }
    }
  })
})

/* ============================================================
   The hints, as second implementations

   Each of these is written from the sentences a child is shown
   rather than from `solveByLogic`: it marks tiles rather than
   reading plain off the paint, or it applies every rule to every
   line in one go rather than rung by rung. So it can only settle
   what the sentences themselves settle, and it is not the solver
   called twice.
   ============================================================ */

/** Every row and every column as one line, rows first. */
function linesOf(state: TileState) {
  const { n } = state
  return [
    ...Array.from({ length: n }, (_, r) => ({ cells: rowCells(n, r), clue: state.rowClues[r] })),
    ...Array.from({ length: n }, (_, c) => ({ cells: colCells(n, c), clue: state.colClues[c] })),
  ]
}

/** How many of tile t's squares lie among these cells. */
const inLine = (state: TileState, t: number, cells: number[]) =>
  tileCells(state.tiles)[t].filter((cell) => cells.includes(cell)).length

/** The tiles with a square among these cells. */
const tilesIn = (state: TileState, cells: number[]) => [...new Set(cells.map((c) => state.tiles[c]))]

/**
 * Paint a board with nothing but the three sentences five across shows a child,
 * and hand back how many tiles are still unknown. 0 is a board that came out;
 * anything else is a board where a child who followed the hints would have had
 * to guess.
 *
 * With `finishedLine` off, the second hint is taken away and only the 0 of the
 * first is left of it. With `wholeTile` off, a tile that a line proves plain is
 * plain in that line only, which is how a child who has just played the
 * thermometers might read "stays plain".
 */
function fillByHints(state: TileState, finishedLine: boolean, wholeTile: boolean): number {
  const lines = linesOf(state)
  const count = tileCells(state.tiles).length
  const painted = new Array<boolean>(count).fill(false)
  /** `plainIn[line][t]`: this line knows tile t is plain. */
  const plainIn = lines.map(() => new Array<boolean>(count).fill(false))
  for (;;) {
    let moved = false
    lines.forEach(({ cells, clue }, line) => {
      const ts = tilesIn(state, cells)
      const has = ts.reduce((sum, t) => sum + (painted[t] ? inLine(state, t, cells) : 0), 0)
      const open = ts.filter((t) => !painted[t] && !plainIn[line][t])
      if (open.length === 0) return
      const room = open.reduce((sum, t) => sum + inLine(state, t, cells), 0)
      // "Start with a 0", and "When a line has as many painted squares as its
      // number, its other tiles stay plain. They are plain in every line."
      if (finishedLine ? has === clue : clue === 0) {
        for (const t of open) {
          if (wholeTile) for (const known of plainIn) known[t] = true
          else plainIn[line][t] = true
        }
        moved = true
      } else if (has + room === clue) {
        // "If that comes to its number, paint them all."
        for (const t of open) painted[t] = true
        moved = true
      }
    })
    if (!moved) break
  }
  const found = cluesOf(state.n, state.tiles, painted)
  if (found.rowClues.join() === state.rowClues.join() && found.colClues.join() === state.colClues.join()) {
    return 0
  }
  return Math.max(1, painted.filter((on) => !on).length)
}

/**
 * Seven across's hints, with paint as the only mark: plain is read off the paint
 * (a finished line, a tile too big for what a line still wants), and then in
 * every line "count what each tile that could still be painted adds, find every
 * way those tiles make up what the line still wants, and paint any tile that
 * every one of those ways uses". Null where a line goes over its number.
 *
 * With `number` on, a way makes up the line's number instead of what it still
 * wants — the reading the hint used to invite.
 */
function fillBySevenHints(state: TileState, number: boolean): boolean[] | null {
  const lines = linesOf(state)
  const count = tileCells(state.tiles).length
  const painted = new Array<boolean>(count).fill(false)
  const all = Array.from({ length: count }, (_, t) => t)
  for (;;) {
    const want = lines.map(
      ({ cells, clue }) =>
        clue - all.reduce((sum, t) => sum + (painted[t] ? inLine(state, t, cells) : 0), 0),
    )
    if (want.some((w) => w < 0)) return null
    const plain = (t: number) =>
      !painted[t] &&
      lines.some(({ cells }, line) => {
        const k = inLine(state, t, cells)
        return k > 0 && (want[line] === 0 || k > want[line])
      })
    const paint = new Set<number>()
    lines.forEach(({ cells, clue }, line) => {
      if (want[line] === 0) return
      const open = tilesIn(state, cells).filter((t) => !painted[t] && !plain(t))
      const adds = open.map((t) => inLine(state, t, cells))
      const target = number ? clue : want[line]
      let every = (1 << open.length) - 1
      let ways = 0
      for (let mask = 1; mask < 1 << open.length; mask++) {
        let sum = 0
        for (let j = 0; j < open.length; j++) if (mask & (1 << j)) sum += adds[j]
        if (sum !== target) continue
        ways++
        every &= mask
      }
      if (ways === 0) return
      open.forEach((t, j) => {
        if (every & (1 << j)) paint.add(t)
      })
    })
    if (paint.size === 0) break
    for (const t of paint) painted[t] = true
  }
  return painted
}

describe('the hints', () => {
  it('five across: finishes every board it is shown, and never has to guess', () => {
    for (const seed of SEEDS) {
      const state = start(levels[0], seed)
      expect(`${seed}: ${fillByHints(state, true, true)} unknown`).toBe(`${seed}: 0 unknown`)
    }
  })

  it('five across: needs the one about a line that already has all it wants', () => {
    // Hold "finished" to a 0 alone and the boards stop short — every one of
    // them, measured, where a child would have been left to guess.
    const stalled = SEEDS.filter((seed) => fillByHints(start(levels[0], seed), false, true) > 0)
    expect(stalled).toHaveLength(60)
  })

  it('five across: needs a plain tile to stay plain all over', () => {
    // The rule that makes this puzzle its own. Read "stays plain" as the squares
    // in the proving line only, and the same three hints finish none of the
    // sixty boards; read as written, they finish all sixty (the first test).
    const finished = SEEDS.filter((seed) => fillByHints(start(levels[0], seed), true, false) === 0)
    expect(finished.length).toBeLessThan(10)
    expect(finished).toHaveLength(0)
  })

  it('seven across: says how to tell which nearly full line has a tile to give', () => {
    // "A line that wants nearly every square" is a 5 or a 6, and most of those
    // have no tile to give on the empty board: only a tile with more squares in
    // the line than the line can leave plain has to be painted. So the first hint
    // carries that test rather than "a tile the line cannot do without", and a
    // child who reads it off a 5 knows at once whether that 5 is the one.
    let lines = 0
    let giving = 0
    let boardsWithADudFive = 0
    for (const seed of SEEDS) {
      const { n, tiles, rowClues, colClues } = start(levels[2], seed)
      const clues = [...rowClues, ...colClues]
      const cellsOf = [
        ...Array.from({ length: n }, (_, r) => rowCells(n, r)),
        ...Array.from({ length: n }, (_, c) => colCells(n, c)),
      ]
      let dudFive = false
      cellsOf.forEach((cells, line) => {
        if (clues[line] < n - 2) return
        lines++
        const gives = tileCells(tiles).some(
          (squares) => squares.filter((cell) => cells.includes(cell)).length > n - clues[line],
        )
        if (gives) giving++
        else if (clues[line] === n - 2) dudFive = true
      })
      if (dudFive) boardsWithADudFive++
    }
    expect({ lines, giving, boardsWithADudFive }).toEqual({
      lines: 177,
      giving: 75,
      boardsWithADudFive: 53,
    })
  })

  it('seven across: finishes every board from what each line still wants', () => {
    for (const seed of SEEDS) {
      const state = start(levels[2], seed)
      expect(fillBySevenHints(state, false)).toEqual(answerFor(state))
    }
  })

  it('seven across: goes wrong if it makes up the line’s number instead', () => {
    // A fifth of the lines that need the sums step already hold paint, so "what
    // the line still wants" is not the line's number — and a reader who takes
    // it for the number paints a tile the answer leaves plain, or pushes a line
    // over, on most boards. Measured: 51 of the 60.
    const wrong = SEEDS.filter((seed) => {
      const state = start(levels[2], seed)
      const got = fillBySevenHints(state, true)
      const answer = answerFor(state)
      return got === null || got.some((on, t) => on && !answer[t])
    })
    expect(wrong.length).toBeGreaterThan(SEEDS.length / 2)
    expect(wrong).toHaveLength(51)
  })
})

/**
 * A solver that does carry plain tiles from one pass to the next, the way a
 * pencil dot would: every line, every way its open tiles make what it still
 * wants, and a tile that every way uses is painted, a tile that no way uses is
 * marked plain for good. It is the strongest thing one line can say, and it
 * remembers everything.
 */
function solveWithMemory(n: number, tiles: number[], rowClues: number[], colClues: number[]) {
  const state: TileState = { n, tiles, rowClues, colClues, painted: [] }
  const lines = linesOf(state)
  const count = tileCells(tiles).length
  /** 1 painted, -1 plain for good, 0 not known. */
  const mark = new Array<number>(count).fill(0)
  for (;;) {
    let moved = false
    for (const { cells, clue } of lines) {
      const ts = tilesIn(state, cells)
      const want = clue - ts.reduce((sum, t) => sum + (mark[t] === 1 ? inLine(state, t, cells) : 0), 0)
      const open = ts.filter((t) => mark[t] === 0)
      const adds = open.map((t) => inLine(state, t, cells))
      let every = (1 << open.length) - 1
      let any = 0
      let ways = 0
      for (let mask = 0; mask < 1 << open.length; mask++) {
        let sum = 0
        for (let j = 0; j < open.length; j++) if (mask & (1 << j)) sum += adds[j]
        if (sum !== want) continue
        ways++
        every &= mask
        any |= mask
      }
      if (ways === 0) return null
      open.forEach((t, j) => {
        if (every & (1 << j)) mark[t] = 1
        else if (!(any & (1 << j))) mark[t] = -1
        else return
        moved = true
      })
    }
    if (!moved) break
  }
  return mark.every((m) => m !== 0) ? mark.map((m) => m === 1) : null
}

describe('the solver', () => {
  it('agrees with a plain exhaustive count', () => {
    // `countSolutions` prunes on two running counts a line. This is the
    // stupidest possible counter — every set of tiles, one after another — so
    // the two agreeing means the clever one is not lying. Half the boards have
    // one number nudged, so there are boards with no answer and boards with
    // several among them, not only the easy case.
    const rng = makeRng(99)
    const seen = new Set<number>()
    for (let k = 0; k < 12; k++) {
      const tiles = cutTiles(rng, 4)
      const count = tileCells(tiles).length
      const on = tileCells(tiles).map(() => rng() < 0.5)
      const { rowClues, colClues } = cluesOf(4, tiles, on)
      if (k % 2 === 1) {
        rowClues[randInt(rng, 4)]++
        colClues[randInt(rng, 4)]++
      }
      let brute = 0
      for (let mask = 0; mask < 1 << count; mask++) {
        const got = cluesOf(
          4,
          tiles,
          tileCells(tiles).map((_, t) => (mask & (1 << t)) !== 0),
        )
        if (got.rowClues.join() === rowClues.join() && got.colClues.join() === colClues.join()) brute++
      }
      expect(countSolutions(4, tiles, rowClues, colClues, 1 << count)).toBe(brute)
      seen.add(brute)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('never finishes a board that has two answers', () => {
    // A random painting almost always has one answer, so boards with two have
    // to be hunted for: ten of them took 1,453 six-across draws here, in about
    // a third of a second. The solver gives up on every one of them rather than
    // guessing.
    const rng = makeRng(2026)
    let loose = 0
    let draws = 0
    while (loose < 10 && draws < 5000) {
      draws++
      const tiles = cutTiles(rng, 6)
      const count = tileCells(tiles).length
      const on = new Array<boolean>(count).fill(false)
      for (const t of shuffled(
        rng,
        Array.from({ length: count }, (_, t) => t),
      ).slice(0, Math.round(count / 2))) {
        on[t] = true
      }
      const { rowClues, colClues } = cluesOf(6, tiles, on)
      if (countSolutions(6, tiles, rowClues, colClues, 2) < 2) continue
      loose++
      expect(solveByLogic(6, tiles, rowClues, colClues, STEPS.sums)).toBeNull()
    }
    expect(loose).toBe(10)
    expect(draws).toBe(1453)
  })

  it('finds the fixture’s answer in two passes of counting', () => {
    expect(countSolutions(4, FIXTURE_TILES, FIXTURE_ROWS, FIXTURE_COLUMNS, 3)).toBe(1)
    const found = solveByLogic(4, FIXTURE_TILES, FIXTURE_ROWS, FIXTURE_COLUMNS, ['count'])
    expect(found?.painted).toEqual(FIXTURE_ANSWER)
    expect(found?.passes).toBe(2)
  })

  it('remembers nothing but paint', () => {
    // A seven-across board with one answer, which a solver that keeps its plain
    // tiles from pass to pass finishes — and which this one, reading plain
    // fresh off the paint every pass, does not. That is the board `deal` turns
    // down, because nothing on the board would carry that plain tile for a child.
    const tiles = [
      0, 1, 1, 2, 3, 3, 4, 0, 1, 2, 2, 5, 3, 4, 6, 6, 6, 7, 5, 8, 9, 10, 10, 7, 7, 5, 8, 9, 11, 10,
      12, 13, 13, 14, 14, 11, 15, 12, 12, 13, 16, 14, 11, 15, 17, 17, 17, 16, 16,
    ]
    const rows = [5, 5, 1, 3, 4, 3, 3]
    const cols = [3, 2, 4, 5, 4, 2, 4]
    const T = true
    const F = false
    const answer = [T, F, T, T, T, F, F, F, F, T, T, F, T, T, F, F, F, T]
    expect(cluesOf(7, tiles, answer)).toEqual({ rowClues: rows, colClues: cols })
    expect(countSolutions(7, tiles, rows, cols, 3)).toBe(1)
    expect(solveWithMemory(7, tiles, rows, cols)).toEqual(answer)
    expect(solveByLogic(7, tiles, rows, cols, STEPS.sums)).toBeNull()
  })

  it('turns down a board whose numbers contradict each other', () => {
    // Column 4 wants a fourth painted square, which no row has room to give.
    expect(solveByLogic(4, FIXTURE_TILES, FIXTURE_ROWS, [1, 1, 1, 4], STEPS.sums)).toBeNull()
  })

  it('takes each rung only when the one below it has run dry', () => {
    // Offered all three steps, a board that counting finishes is finished by
    // counting alone. A solver that tried a harder rung first would show it
    // here, and the `minPasses` gates rest on these counts.
    const all = STEPS.sums
    const fx = solveByLogic(4, FIXTURE_TILES, FIXTURE_ROWS, FIXTURE_COLUMNS, all) as Reasoned
    expect([fx.count, fx.size, fx.sums]).toEqual([2, 0, 0])
    for (const seed of SEEDS) {
      const a = start(levels[0], seed)
      const five = solveByLogic(a.n, a.tiles, a.rowClues, a.colClues, all) as Reasoned
      expect([five.size, five.sums]).toEqual([0, 0])
      const b = start(levels[1], seed)
      const six = solveByLogic(b.n, b.tiles, b.rowClues, b.colClues, all) as Reasoned
      expect(six.sums).toBe(0)
    }
  })

  it('checks its answer against the drawn one', () => {
    const right: Deal = {
      tiles: FIXTURE_TILES,
      rowClues: FIXTURE_ROWS,
      colClues: FIXTURE_COLUMNS,
      answer: FIXTURE_ANSWER,
    }
    expect(reasoned(FIXTURE_CONFIG, right)).not.toBeNull()
    for (let t = 0; t < FIXTURE_ANSWER.length; t++) {
      const answer = FIXTURE_ANSWER.map((on, k) => (k === t ? !on : on))
      expect(reasoned(FIXTURE_CONFIG, { ...right, answer })).toBeNull()
    }
  })
})

describe('reading the board', () => {
  it('knows each tile’s squares, its size, its letter and its paint', () => {
    expect(tileCells(FIXTURE_TILES)).toEqual([
      [0, 4, 5],
      [1, 2, 3],
      [6, 10],
      [7, 11],
      [8, 9],
      [12, 13],
      [14, 15],
    ])
    // The same array, asked twice, is the same answer: the cache is the array's.
    expect(tileCells(FIXTURE_TILES)).toBe(tileCells(FIXTURE_TILES))
    expect(tileSizes(FIXTURE_TILES)).toEqual([3, 3, 2, 2, 2, 2, 2])
    expect(tileNames(FIXTURE_TILES)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(countWord(2)).toBe('two')
    expect(countWord(3)).toBe('three')
    const state = fixture(FIXTURE_ANSWER)
    expect(isPainted(state, 7)).toBe(true)
    expect(isPainted(state, 0)).toBe(false)
    expect(FIXTURE_ROWS.map((_, r) => paintedIn(state, rowCells(4, r)))).toEqual(FIXTURE_ROWS)
    expect(FIXTURE_COLUMNS.map((_, c) => paintedIn(state, colCells(4, c)))).toEqual(FIXTURE_COLUMNS)
  })

  it('offers one tap a tile, on the tile’s first square', () => {
    expect(legalMoves(fixture())).toEqual(
      [0, 1, 6, 7, 8, 12, 14].map((cell) => ({ type: 'toggle', cell })),
    )
  })
})

describe('reduce', () => {
  it('paints the whole tile from any of its squares, and wipes it again', () => {
    const state = fixture()
    for (const cell of [0, 4, 5]) {
      const next = reduce(state, { type: 'toggle', cell })
      expect(next.painted).toEqual([true, false, false, false, false, false, false])
      expect(next.tiles).toBe(state.tiles)
      expect(next.rowClues).toBe(state.rowClues)
      expect(next.colClues).toBe(state.colClues)
      // And a tap on any square of it again takes the paint off the whole tile.
      expect(reduce(next, { type: 'toggle', cell: 5 }).painted).toEqual(state.painted)
    }
  })

  it('hands back the very same state for an action that is not one', () => {
    const state = fixture()
    expect(reduce(state, { type: 'toggle', cell: -1 })).toBe(state)
    expect(reduce(state, { type: 'toggle', cell: 16 })).toBe(state)
    expect(reduce(state, { type: 'toggle', cell: 1.5 })).toBe(state)
    expect(reduce(state, { type: 'toggle', cell: Number.NaN })).toBe(state)
    expect(reduce(state, { type: 'nudge' } as unknown as TileAction)).toBe(state)
    expect(reduce(state, undefined as unknown as TileAction)).toBe(state)
  })

  it('takes every tap, because no number forbids a move', () => {
    // Row 1 wants no painted squares. Painting the straight three across it puts
    // three there, and breaks no rule this puzzle has: a number says what the
    // finished board looks like, not what a child may do on the way there.
    const state = fixture()
    const over = reduce(state, { type: 'toggle', cell: 2 })
    expect(over).not.toBe(state)
    expect(paintedIn(over, rowCells(4, 0))).toBe(3)
    expect(over.rowClues[0]).toBe(0)
    expect(isSolved(over)).toBe(false)
  })

  it('changes exactly one tile, and always changes something', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 3)) {
        for (const state of positions(start(level, seed))) {
          for (const action of legalMoves(state)) {
            const next = reduce(state, action)
            expect(next).not.toBe(state)
            const moved = next.painted.filter((on, t) => on !== state.painted[t])
            expect(moved).toHaveLength(1)
          }
        }
      }
    }
  })
})

/** Real positions: the answer painted in one tile at a time. */
function positions(state: TileState): TileState[] {
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
    // One tile short, and one tile over.
    expect(isSolved(fixture([false, false, false, true, true, false, false]))).toBe(false)
    expect(isSolved(fixture([false, false, true, true, true, false, true]))).toBe(false)
  })

  it('is worked out from the board alone, never from the board it was dealt', () => {
    for (const level of levels) {
      const first = start(level, SEEDS[7])
      const done = play(first, solutionActions(first))
      expect(isSolved(done)).toBe(true)
      // The same paint, one number changed: the same position is no longer an
      // answer, so nothing here is remembering how the board was made.
      const bent: TileState = {
        ...done,
        rowClues: done.rowClues.map((clue, r) => (r === 0 ? clue + 1 : clue)),
      }
      expect(isSolved(bent)).toBe(false)
    }
  })
})

describe('there is no dead end to step back from', () => {
  it('leaves the puzzle with no failure() and no canStillWin()', () => {
    expect(paintedTiles.engine.failure).toBeUndefined()
    expect(paintedTiles.engine.canStillWin).toBeUndefined()
  })

  it('can be finished from every position it can reach, five across', () => {
    // The claim behind leaving both out: every tap undoes itself, so from any
    // position at all, tapping each tile that differs from the answer once lands
    // on it. Walked here over every position of four boards — 3,072 of them —
    // rather than argued.
    let walked = 0
    for (const seed of SEEDS.slice(0, 4)) {
      const first = start(levels[0], seed)
      const answer = answerFor(first)
      const count = first.painted.length
      const seen = new Set<string>()
      const stack = [first]
      let solvedAt = 0
      while (stack.length > 0) {
        const state = stack.pop() as TileState
        const key = state.painted.map((on) => (on ? '1' : '0')).join('')
        if (seen.has(key)) continue
        seen.add(key)
        if (isSolved(state)) solvedAt++
        let cur = state
        let moves = 0
        for (let t = 0; t < count; t++) {
          if (cur.painted[t] === answer[t]) continue
          cur = tapTile(cur, t)
          moves++
        }
        expect(isSolved(cur)).toBe(true)
        expect(moves).toBeLessThanOrEqual(count)
        for (const action of legalMoves(state)) stack.push(reduce(state, action))
      }
      // Every set of tiles is a position, and exactly one of them is solved.
      expect(seen.size).toBe(2 ** count)
      expect(solvedAt).toBe(1)
      walked += seen.size
    }
    expect(walked).toBe(3072)
  })

  it('can be finished after any wrong tap, six and seven across', () => {
    // Too many positions to walk, and the argument above covers them all; this
    // checks it from the positions a child is most likely to be in.
    for (const level of levels.slice(1)) {
      for (const seed of SEEDS.slice(0, 3)) {
        const first = start(level, seed)
        const answer = answerFor(first)
        for (const action of legalMoves(first)) {
          let cur = reduce(first, action)
          let moves = 0
          for (let t = 0; t < cur.painted.length; t++) {
            if (cur.painted[t] === answer[t]) continue
            cur = tapTile(cur, t)
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
  const key = (state: TileState) => state.painted.map((on) => (on ? '1' : '0')).join('')

  it('is the number of tiles the answer paints', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.painted)
      for (const seed of SEEDS.slice(0, 10)) {
        expect(answerFor(start(level, seed)).filter(Boolean)).toHaveLength(level.par as number)
      }
    }
  })

  it('ramps, and stays inside what the collection asks of a last level', () => {
    expect(levels.map((l) => l.par)).toEqual([5, 7, 9])
    // The suns and moons' last level is 24 taps, the most the collection asks.
    expect(levels[2].par as number).toBeLessThanOrEqual(24)
  })

  it('cannot be beaten, because a move moves exactly one tile', () => {
    /* The floor, checked by construction rather than asserted. A board starts
       with no tile painted; the only solved position is the one answer, which
       paints `par` of them; and every move changes the count of painted tiles
       by exactly one. So `par` moves is the fewest there can be. */
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 3)) {
        const first = start(level, seed)
        expect(paintedTileCount(first)).toBe(0)
        for (const state of positions(first)) {
          for (const action of legalMoves(state)) {
            expect(Math.abs(paintedTileCount(reduce(state, action)) - paintedTileCount(state))).toBe(1)
          }
          if (isSolved(state)) expect(paintedTileCount(state)).toBe(level.par)
        }
      }
    }
  })

  it('is reached, because the answer can be painted in any order', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 12)) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        for (const order of [actions, [...actions].reverse()]) {
          expect(isSolved(play(first, order))).toBe(true)
        }
      }
    }
  })

  it('has no shorter path than par under breadth-first search, five and six across', () => {
    // The whole graph: nothing pruned. At five across it is small enough to
    // count as well, and the count is every set of tiles — so every set of tiles
    // is a position a child can reach, which is what makes the arithmetic of
    // the next test but one the size of the graph.
    for (const level of levels.slice(0, 2)) {
      for (const seed of SEEDS.slice(0, 4)) {
        const state = start(level, seed)
        const path = shortestSolution<TileState, TileAction>({
          start: state,
          moves: legalMoves,
          apply: reduce,
          key,
          solved: isSolved,
        })
        expect(path).toHaveLength(level.par as number)
        if (level === levels[0]) {
          expect(
            reachableCount<TileState, TileAction>({ start: state, moves: legalMoves, apply: reduce, key }),
          ).toBe(2 ** state.painted.length)
        }
      }
    }
  }, 20_000)

  /**
   * Seven across, with every position holding a line over its number pruned. No
   * shortest path passes through one: a path of `par` moves flips each answer
   * tile once and nothing else, so every position on it is part of the answer
   * and no line on it is ever over. And a path in the pruned graph is a path in
   * the whole one, so it cannot beat the floor either. Measured on these three
   * seeds, the pruned graph is 2,906 to 6,763 positions, and the two searches
   * together take about 200 to 600ms a board under load.
   */
  it('has no shorter path than par at seven across, with over-full positions pruned', () => {
    const level = levels[2]
    const over = (state: TileState) => readLines(state).over > 0
    for (const seed of SEEDS.slice(0, 3)) {
      const state = start(level, seed)
      const spec = { start: state, moves: legalMoves, apply: reduce, key, invalid: over }
      expect(reachableCount<TileState, TileAction>(spec)).toBeLessThan(200_000)
      const path = shortestSolution<TileState, TileAction>({ ...spec, solved: isSolved })
      expect(path).toHaveLength(level.par as number)
    }
  }, 20_000)

  it('would be past the search’s cap at seven across without the pruning', () => {
    // Why the test above prunes. Every set of tiles is a position, so the whole
    // graph is 2 to the number of tiles, and from 18 tiles up that is past the
    // search's 200,000 — 51 of the 60 seven-across seeds, the first of them
    // among them. Worked out rather than searched, so it takes no time at all.
    const state = start(levels[2], SEEDS[0])
    expect(state.painted.length).toBeGreaterThanOrEqual(18)
    expect(2 ** state.painted.length).toBeGreaterThan(200_000)
    expect(SEEDS.filter((seed) => start(levels[2], seed).painted.length >= 18)).toHaveLength(51)
  })
})

/* ============================================================
   What the board may not say

   Measured, as the thermometers measured theirs, because a cue
   that marks a line is an oracle, and this is how much of the
   answer it gives away. Every tap here is a real `reduce`, so a
   tap counted here and a move counted on the board are the same
   number. The shipped boards give these numbers exactly as the
   prototype's did; over all 60 boards a level they are 206 of 274
   plain tiles named by the sweep, greedy landings on 41, 14 and 3
   boards, climbers winning 57, 42 and 29 off an over-count cue
   and 58, 32 and 31 off a tick, and a blind tapper winning 14, 2
   and 1.
   ============================================================ */

type Feedback = 'overfull' | 'done' | 'silent'

/**
 * The thermometers' mindless climber. It raises tiles the cue lets stand, knocks
 * one down at a local top, and peeks at what a tap would do for free — the most
 * generous model of a cue there is, and the refusal model as well: a refused tap
 * is exactly a peek.
 */
function climb(from: TileState, feedback: Feedback, rng: Rng, budget: number): number {
  let state = from
  let taps = 0
  const count = state.painted.length
  const set = (t: number) => {
    state = tapTile(state, t)
    taps++
  }
  while (taps < budget) {
    if (feedback === 'silent') {
      // Nothing to read but the shell's stamp, so: try something and look.
      set(randInt(rng, count))
    } else if (feedback === 'overfull') {
      // Paint every tile the board lets stand. A position with no over-full line
      // is at most the answer, and only the answer is all of it.
      const was = taps
      for (const t of shuffled(
        rng,
        state.painted.map((_, k) => k),
      )) {
        if (state.painted[t]) continue
        if (readLines(tapTile(state, t)).over === 0) set(t)
        if (isSolved(state)) return taps
        if (taps >= budget) break
      }
      // A local top: wipe one tile and climb again.
      if (taps === was) {
        const on = state.painted.map((p, t) => (p ? t : -1)).filter((t) => t >= 0)
        set(on.length > 0 ? on[randInt(rng, on.length)] : randInt(rng, count))
      }
    } else {
      // A tick on every line that has come right: climb on how many there are.
      let best = -1
      let score = readLines(state).right
      for (let t = 0; t < count; t++) {
        const now = readLines(tapTile(state, t)).right
        if (now > score) {
          score = now
          best = t
        }
      }
      set(best === -1 ? randInt(rng, count) : best)
    }
    if (isSolved(state)) return taps
  }
  return -1
}

describe('what the board may not say', () => {
  it('an over-count cue would name most plain tiles on an empty five-across board', () => {
    // One sweep: tap each tile once on the empty board and read the cue. Every
    // plain tile it rings is one a child never had to count.
    let named = 0
    let plain = 0
    for (const seed of SEEDS) {
      const state = start(levels[0], seed)
      const answer = answerFor(state)
      for (let t = 0; t < state.painted.length; t++) {
        if (answer[t]) continue
        plain++
        if (readLines(tapTile(state, t)).over > 0) named++
      }
    }
    expect(named / plain).toBeGreaterThan(0.7)
    expect(`${named} of ${plain}`).toBe('206 of 274')
  })

  it('a player who never counts lands five across in par off an over-count cue', () => {
    // Paint every tile the cue lets stand, in a random order, and never go back.
    // It only ever paints, so a landing is one tap a tile: par exactly.
    let landed = 0
    for (const [k, seed] of SEEDS.slice(0, 20).entries()) {
      const first = start(levels[0], seed)
      let state = first
      for (const t of shuffled(
        makeRng(77 + k),
        first.painted.map((_, i) => i),
      )) {
        const tried = tapTile(state, t)
        if (readLines(tried).over === 0) state = tried
      }
      if (!isSolved(state)) continue
      landed++
      expect(paintedTileCount(state)).toBe(levels[0].par)
    }
    expect(landed).toBe(15)
  })

  const BOARDS = 12
  const BUDGET = 50 * (levels[1].par as number)
  const run = (feedback: Feedback) => {
    let won = 0
    for (let k = 0; k < BOARDS; k++) {
      if (climb(start(levels[1], SEEDS[k]), feedback, makeRng(k * 31 + 5), BUDGET) >= 0) won++
    }
    return won
  }

  it('the climber wins six across off an over-count cue, and off a tick', () => {
    expect(BUDGET).toBe(350)
    expect(run('overfull')).toBe(9)
    expect(run('done')).toBe(7)
  })

  it('wins almost none against the board as it ships, which says nothing', () => {
    // Fifty taps a move of par. This is why the board is silent: neither mark
    // above can be drawn without doing most of a level for the child.
    expect(run('silent')).toBe(0)
  })
})

describe('describe', () => {
  it('names the square that was tapped, both ways round', () => {
    const state = fixture()
    const on = reduce(state, { type: 'toggle', cell: 7 })
    expect(describeMove(state, on, { type: 'toggle', cell: 7 })).toBe(
      'Painted the tile at row 2, column 4',
    )
    expect(describeMove(on, state, { type: 'toggle', cell: 7 })).toBe(
      'Wiped the paint off the tile at row 2, column 4',
    )
  })

  it('names the tapped square, for every square', () => {
    const state = start(levels[0], SEEDS[3])
    for (let cell = 0; cell < state.tiles.length; cell++) {
      const action: TileAction = { type: 'toggle', cell }
      const next = reduce(state, action)
      expect(describeMove(state, next, action)).toBe(
        `Painted the tile at row ${rowOf(state.n, cell) + 1}, column ${colOf(state.n, cell) + 1}`,
      )
      expect(describeMove(next, state, action)).toContain('Wiped the paint off')
    }
  })
})

/* ============================================================
   The board
   ============================================================ */

const paint = (state: TileState, locked = false) => {
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
const Play = ({ from }: { from: TileState }) => {
  const [state, setState] = useState(from)
  return createElement(Board, {
    state,
    dispatch: (action: TileAction) => setState((cur) => reduce(cur, action)),
    locked: false,
  })
}

/** Which buttons carry a trace, by square. */
const tracedSquares = (container: HTMLElement) =>
  [...container.querySelectorAll('button')]
    .map((el, cell) => (el.getAttribute('data-traced') === 'true' ? cell : -1))
    .filter((cell) => cell >= 0)

/**
 * jsdom lays nothing out, so it has no scrollIntoView to call, and the board
 * calls it after every arrow key. A spy stands in, and the arrow-key test reads
 * it.
 */
const scrolled = vi.fn()
Element.prototype.scrollIntoView = scrolled

describe('the board', () => {
  it('draws a button on every square', () => {
    const { all } = paint(fixture())
    expect(all()).toHaveLength(16)
    for (const button of all()) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).toMatch(
        /^Row \d, column \d, tile [A-S] of (two|three) squares, (plain, paint the tile|painted, wipe the paint off)$/,
      )
    }
  })

  it('says which tile a square is in, how big it is, and what a tap does', () => {
    paint(fixture(FIXTURE_ANSWER))
    for (const name of [
      'Row 1, column 1, tile A of three squares, plain, paint the tile',
      'Row 2, column 2, tile A of three squares, plain, paint the tile',
      'Row 1, column 4, tile B of three squares, plain, paint the tile',
      'Row 2, column 4, tile D of two squares, painted, wipe the paint off',
      'Row 3, column 4, tile D of two squares, painted, wipe the paint off',
      'Row 4, column 1, tile F of two squares, plain, paint the tile',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('stands a number at the end of every row and every column', () => {
    paint(fixture())
    expect(screen.getAllByRole('img')).toHaveLength(8)
    expect(screen.getByRole('img', { name: 'Row 1 wants no painted squares' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Row 2 wants 1 painted square' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Row 3 wants 3 painted squares' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Column 4 wants 3 painted squares' })).toBeInTheDocument()
  })

  it('sends exactly one action for one tap', () => {
    const { dispatch, by } = paint(fixture())
    fireEvent.click(by(/^Row 3, column 2, /))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle', cell: 9 })
  })

  it('paints every square of a tile from one tap', () => {
    const view = render(createElement(Play, { from: fixture() }))
    const buttons = () => [...view.container.querySelectorAll('button')]
    fireEvent.click(buttons()[7])
    for (const cell of [7, 11]) {
      expect(buttons()[cell]).toHaveAttribute('data-painted', 'true')
      expect(buttons()[cell].getAttribute('aria-label')).toMatch(/painted, wipe the paint off$/)
    }
    expect(buttons().filter((el) => el.getAttribute('data-painted') === 'true')).toHaveLength(2)
    // And one more tap on the other square wipes the whole tile.
    fireEvent.click(buttons()[11])
    expect(buttons().filter((el) => el.getAttribute('data-painted') === 'true')).toHaveLength(0)
  })

  it('keeps the seat under a painted square', () => {
    // Paint goes on the button and nowhere else: the seat, its wash, its seams
    // and its hairline are the tile's identity, and they stay put.
    const view = render(createElement(Play, { from: fixture() }))
    const button = () => view.container.querySelectorAll('button')[7]
    const seat = () => button().parentElement as HTMLElement
    const before = {
      className: seat().className,
      top: seat().getAttribute('data-top'),
      left: seat().getAttribute('data-left'),
      patch: seat().style.getPropertyValue('--patch'),
    }
    expect(button().getAttribute('data-painted')).toBeNull()
    fireEvent.click(button())
    expect(button()).toHaveAttribute('data-painted', 'true')
    expect({
      className: seat().className,
      top: seat().getAttribute('data-top'),
      left: seat().getAttribute('data-left'),
      patch: seat().style.getPropertyValue('--patch'),
    }).toEqual(before)
    expect(before.top).toBe('seam')
    expect(before.left).toBe('seam')
    // Square 11 is D's second square, stitched to 7 by a hairline above it.
    expect((view.container.querySelectorAll('button')[11].parentElement as HTMLElement).getAttribute('data-top')).toBe('hair')
  })

  it('traces the whole tile under the pointer, and nothing else', () => {
    const state = fixture()
    const { view, all } = paint(state)
    fireEvent.pointerEnter(all()[5])
    expect(tracedSquares(view.container)).toEqual([0, 4, 5])
    fireEvent.pointerLeave(all()[5])
    expect(tracedSquares(view.container)).toEqual([])
    // The keyboard gets the same trace as the pointer.
    act(() => all()[2].focus())
    expect(tracedSquares(view.container)).toEqual([1, 2, 3])
    // A move clears it, as the contract asks of board-local state.
    view.rerender(
      createElement(Board, {
        state: reduce(state, { type: 'toggle', cell: 2 }),
        dispatch: () => {},
        locked: false,
      }),
    )
    expect(tracedSquares(view.container)).toEqual([])
  })

  it('traces nothing while it is locked', () => {
    const { view, all } = paint(fixture(FIXTURE_ANSWER), true)
    fireEvent.pointerEnter(all()[7])
    expect(tracedSquares(view.container)).toEqual([])
  })

  it('colours touching tiles apart, corners included', () => {
    const state = start(levels[2], SEEDS[0])
    const { view } = paint(state)
    const patches = [...view.container.querySelectorAll('button')].map((el) =>
      (el.parentElement as HTMLElement).style.getPropertyValue('--patch'),
    )
    expect(patches.every((p) => /^var\(--p-[a-z]+\)$/.test(p))).toBe(true)
    const { n, tiles } = state
    for (let i = 0; i < n * n; i++) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = rowOf(n, i) + dr
          const c = colOf(n, i) + dc
          if (r < 0 || r >= n || c < 0 || c >= n) continue
          const j = r * n + c
          if (tiles[j] === tiles[i]) expect(patches[j]).toBe(patches[i])
          else expect(patches[j]).not.toBe(patches[i])
        }
      }
    }
    // The board and the colouring are the same map.
    const colours = colourRegions(n, tiles)
    expect(patches).toEqual(tiles.map((t) => regionPaint(colours[t])))
  })

  it('says nothing whatever about how a line is getting on', () => {
    // The design decision the climbers above measure, held here as a fact about
    // the page: the only words on this board are the eight numbers in the
    // margin, and they never change.
    const view = render(createElement(Play, { from: fixture() }))
    const text = () => view.container.textContent
    expect(text()).toBe('11130132')
    // Row 1 wants none, and now holds three.
    fireEvent.click(view.container.querySelectorAll('button')[1])
    expect(view.container.querySelectorAll('[data-painted="true"]')).toHaveLength(3)
    expect(text()).toBe('11130132')
    expect(view.container.querySelector('[data-over]')).toBeNull()
    expect(view.container.querySelector('[role="status"]')).toBeNull()
  })

  it('walks the arrow keys from square to square, and stands still at the edge', () => {
    const { by, all } = paint(fixture())
    scrolled.mockClear()
    const corner = by(/^Row 1, column 1, /)
    corner.focus()
    fireEvent.keyDown(corner, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(by(/^Row 1, column 2, /))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(by(/^Row 1, column 2, /))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(by(/^Row 2, column 2, /))
    // Each step brings the square it lands on out from under the row numbers,
    // which stay put while a narrow phone slides the field, and scrolls no
    // further than it must. Standing still at the edge scrolls nothing.
    expect(scrolled).toHaveBeenCalledTimes(2)
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(scrolled.mock.contexts.at(-1)).toBe(by(/^Row 2, column 2, /))
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
    // The arrows are left to the page, so it still scrolls.
    expect(fireEvent.keyDown(all()[0], { key: 'ArrowRight' })).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('leaves the title, the hints and the win message to the shell', () => {
    const { view } = paint(fixture())
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(paintedTiles.title)
    expect(text).not.toContain(paintedTiles.tagline)
    for (const line of paintedTiles.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

describe('the picture on the card', () => {
  it('draws a real answer, with the numbers that count it', () => {
    expect(cluesOf(CARD.n, CARD.tiles, CARD.painted)).toEqual({
      rowClues: CARD.rowClues,
      colClues: CARD.colClues,
    })
    expect(countSolutions(CARD.n, CARD.tiles, CARD.rowClues, CARD.colClues, 3)).toBe(1)
    const found = solveByLogic(CARD.n, CARD.tiles, CARD.rowClues, CARD.colClues, ['count'])
    expect(found?.painted).toEqual(CARD.painted)
    expect(found?.passes).toBe(1)
    // The 0 across the middle is what makes the bent tile plain all over,
    // including its square in the bottom row.
    expect(CARD.rowClues[1]).toBe(0)
    expect(tileCells(CARD.tiles)[2]).toEqual([4, 5, 8])
  })

  it('has no straight three, and lays both painted tiles flat', () => {
    const cells = tileCells(CARD.tiles)
    for (const squares of cells) {
      if (squares.length !== 3) continue
      expect(new Set(squares.map((c) => rowOf(CARD.n, c))).size).toBeGreaterThan(1)
      expect(new Set(squares.map((c) => colOf(CARD.n, c))).size).toBeGreaterThan(1)
    }
    cells.forEach((squares, t) => {
      if (CARD.painted[t]) expect(new Set(squares.map((c) => rowOf(CARD.n, c))).size).toBe(1)
    })
  })

  it('colours the tiles the way the board colours its own', () => {
    expect(colourRegions(CARD.n, CARD.tiles)).toEqual([0, 1, 2, 3])
  })

  it('paints exactly the answer’s squares in the board’s paint', () => {
    const card = render(createElement(PaintedTilesIcon)).container
    const fills = [...card.querySelectorAll('rect')].map((el) => el.getAttribute('fill') ?? '')
    expect(fills.filter((fill) => fill.endsWith('40%, var(--ink))'))).toHaveLength(4)
    expect(fills.filter((fill) => fill.includes('var(--wash-raised)'))).toHaveLength(5)
    expect(fills.filter((fill) => fill.includes('var(--wash-ground)'))).toHaveLength(9)
  })

  it('draws its numerals as strokes', () => {
    const card = render(createElement(PaintedTilesIcon)).container
    expect(card.querySelector('text')).toBeNull()
    expect(card.querySelectorAll('ellipse')).toHaveLength(1)
    expect(card.querySelectorAll('path[stroke-linejoin="round"]')).toHaveLength(5)
  })
})

describe('the stylesheet', () => {
  // jsdom's URL is not node's, so take the directory off the module url by hand.
  const here = new URL(import.meta.url).pathname.replace(/[^/]+$/, '')
  const css = readFileSync(`${here}board.module.css`, 'utf8')
  const [wide, narrow] = css.split('@media (max-width: 30rem)')
  const floors = (block: string) =>
    [...block.matchAll(/--cell: clamp\((\d+)px/g)].map((m) => Number(m[1]))
  const seam = Number(/--seam: (\d+)px/.exec(wide)?.[1])
  const seat = (block: string) => Number(/--seat: (\d+)px/.exec(block)?.[1])

  it('keeps a 40px button under a fingertip, seam and seat and all', () => {
    // The narrowest button is one with a seam down its left side: its square's
    // pitch, less the seam, less a seat either side. box-sizing is border-box,
    // so all three come out of the pitch. --tap-sm is 40px.
    expect(floors(wide)).toEqual([56, 50, 47])
    expect(floors(narrow)).toEqual([47, 47, 47])
    expect(seam).toBe(3)
    expect([seat(wide), seat(narrow)]).toEqual([2, 1])
    for (const floor of floors(wide)) expect(floor - seam - 2 * seat(wide)).toBeGreaterThanOrEqual(40)
    for (const floor of floors(narrow)) {
      expect(floor - seam - 2 * seat(narrow)).toBeGreaterThanOrEqual(40)
    }
  })

  it('fits five across on a 360px phone', () => {
    // The plan is the margin (0.66 of a square), five squares, and the rim either
    // side. The shell leaves the plan 276px at a 360px window, once the page's,
    // the panel's, the stage's and the frame's paddings are taken off.
    const [five] = floors(narrow)
    expect(0.66 * five + 5 * five + 2 * seam).toBeLessThanOrEqual(276)
  })

  /** Each size's pitch on a phone of this width, off the stylesheet's own clamp(). */
  const pitches = [
    ...narrow.matchAll(/--cell: clamp\((\d+)px, ([\d.]+)vw, (\d+)px\)/g),
  ].map(([, floor, vw, cap]) => (width: number) =>
    Math.min(Number(cap), Math.max(Number(floor), (Number(vw) * width) / 100)),
  )
  /** The plan's width at this window: margin, n squares, two rims. */
  const planAt = (k: number, width: number) =>
    (0.66 + [5, 6, 7][k]) * pitches[k](width) + 2 * seam
  /** What the shell leaves the plan: the window less 84px, measured from 320 to 480. */
  const room = (width: number) => width - 84

  it('grows five across with the phone, and never past the window', () => {
    // At the floor five across stood at 272px on every phone up to 448px, and a
    // 430px phone left a quarter of its stage empty. It grows now, inside the
    // window at every width from 360 to 480.
    expect(pitches).toHaveLength(3)
    for (let width = 360; width <= 480; width++) {
      expect(planAt(0, width)).toBeLessThanOrEqual(room(width))
    }
    expect(Math.round(planAt(0, 430))).toBe(322)
    expect(Math.round((planAt(0, 430) / room(430)) * 100)).toBe(93)
    // Six across fits from 404px, and seven across from 451px. (A browser shows
    // each a pixel sooner, because the 0.02px that 0.66 of 47px runs over is
    // rounded away; the sums here are held to the whole of it.)
    for (let width = 404; width <= 480; width++) {
      expect(planAt(1, width)).toBeLessThanOrEqual(room(width))
    }
    expect(planAt(1, 403)).toBeGreaterThan(room(403))
    expect(planAt(2, 451)).toBeLessThanOrEqual(room(451))
    expect(planAt(2, 450)).toBeGreaterThan(room(450))
  })

  it('keeps the row numbers on screen while a narrow phone slides the field', () => {
    // At 360px seven across slides 90px, and the row numbers would slide away
    // with the first columns. They stand on the frame's own edge instead, on the
    // stage's ground, and a square the arrow keys reach is scrolled clear of
    // them with room for its focus ring.
    expect(css).toContain(
      '.corner,\n.left {\n  position: sticky;\n  left: 0;\n  z-index: 2;\n  background: var(--surface-sunk);\n}',
    )
    expect(css).toContain('.frame {\n  overflow-x: auto;\n  padding-block: var(--s1);\n}')
    expect(css).toContain('scroll-margin-inline-start: calc(var(--gutter) + var(--s1));')
  })

  it('never shrinks a board as the window widens past 30rem', () => {
    // The phone rule stops at the wide rule's floor, so the pitch a board has at
    // 480px is no more than the one it has at 481px.
    const wideFloors = floors(wide)
    for (let k = 0; k < 3; k++) {
      expect(pitches[k](480)).toBeLessThanOrEqual(wideFloors[k])
    }
  })

  it('paints in 40% of the tile’s colour', () => {
    // src/styles/contrast.test.ts holds this mix 3:1 from every plain tile, so
    // the stylesheet and that test cannot drift apart.
    expect(css).toContain(
      ".tile[data-painted='true'] {\n  background: color-mix(in oklab, var(--patch) 40%, var(--ink));\n}",
    )
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(paintedTiles.id).toBe('painted-tiles')
    expect(paintedTiles.title).toBe('The painted tiles')
    expect(paintedTiles.reseedable).toBe(true)
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['five-across', 'six-across', 'seven-across'])
    expect(paintedTiles.instructions.length).toBeGreaterThanOrEqual(2)
    expect(paintedTiles.instructions.length).toBeLessThanOrEqual(4)
    for (const line of paintedTiles.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(130)
    }
  })

  it('says in its own instructions both things a tap does, and what a tile left alone is called', () => {
    // `describeMove` has two sentences — paint, and wipe the paint off — and
    // every square's label calls an unpainted tile plain.
    const how = paintedTiles.instructions.join(' ')
    expect(how).toContain('paint it')
    expect(how).toContain('wipe the paint off')
    expect(how).toContain('plain')
  })

  it('says in its own instructions which line each number counts', () => {
    // Every hint speaks of "a line", and a line of writing only runs across. So
    // the instructions tie a number at the side to its row and a number along
    // the top to its column, and the tagline is left free to say "its line".
    const how = paintedTiles.instructions.join(' ')
    expect(how).toContain('at the side counts its row')
    expect(how).toContain('along the top counts its column')
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toContain('margin')
    }
  })

  it('never names a square that would give an answer away', () => {
    // Every board is dealt fresh, so a hint that named a square would be wrong
    // as often as it was right.
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('ramps by size, and by the step each level needs', () => {
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.config.step)).toEqual(['count', 'size', 'sums'])
    expect(levels.map((l) => l.par)).toEqual([5, 7, 9])
    // A 0 is promised only where the first hint is about one.
    expect(levels.map((l) => l.config.zero)).toEqual([true, false, false])
  })
})
