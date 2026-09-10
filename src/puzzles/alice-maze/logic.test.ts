import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { underSettings } from '../../test/settings'
import { makeRng } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { aliceMaze } from './index'
import { Board } from './Board'
import type { AliceAction, AliceConfig, AliceState, Maze } from './logic'
import {
  CARD,
  DIRS,
  STUCK_NOWHERE,
  STUCK_NO_HOME,
  STUCK_NO_HOP,
  canHop,
  colOf,
  dealMaze,
  describeMove,
  failure,
  gradeOf,
  hopsOf,
  init,
  isSolved,
  keyOf,
  landingsOf,
  lineTo,
  reduce,
  refusalOf,
  rowOf,
  spotOf,
  stateOf,
  stepFrom,
  stepsTo,
} from './logic'

const levels = aliceMaze.levels as PuzzleLevel<AliceConfig>[]

/**
 * The seeds every per-deal promise is held against — forty of them, spread
 * across the range rather than bunched at the bottom, because the app asks for
 * a seed with `Math.random()`.
 *
 * A maze costs a few milliseconds to deal and half a dozen tests want the same
 * ones, so they are dealt once here and shared. A separate test times a fresh
 * deal on its own.
 */
const SEEDS = Array.from({ length: 40 }, (_, i) => 1 + i * 7919)
const DEALS: AliceState[][] = levels.map((level) => SEEDS.map((seed) => init(level, makeRng(seed))))

/**
 * The shortest route to the ring, searched over every square as a landing from
 * every position rather than over a list of legal ones, so a bug shared between
 * a move list and the rule cannot make the search agree with itself.
 */
const solve = (state: AliceState) =>
  shortestSolution<AliceState, AliceAction>({
    start: state,
    moves: hopsOf,
    apply: reduce,
    key: keyOf,
    solved: isSolved,
  })

/** Every position the kangaroo can reach on a maze. */
function everyPosition(start: AliceState): AliceState[] {
  const seen = new Map([[keyOf(start), start]])
  const stack = [start]
  while (stack.length > 0) {
    const here = stack.pop() as AliceState
    for (const to of landingsOf(here)) {
      const child = reduce(here, { type: 'hop', to })
      if (child === here || seen.has(keyOf(child))) continue
      seen.set(keyOf(child), child)
      stack.push(child)
    }
  }
  return [...seen.values()]
}

/**
 * Can the ring still be reached from here, by any run of hops at all?
 *
 * Written out here rather than asked of `logic.ts`, because it is the question
 * `failure` now has to answer and a test that asked `failure`'s own search
 * would only be checking it against itself. It floods forwards over
 * `landingsOf` and `reduce` — the rules a finger plays by — and stops the first
 * time a hop finishes on the ring.
 */
function reaches(from: AliceState): boolean {
  const seen = new Set([keyOf(from)])
  const stack = [from]
  while (stack.length > 0) {
    const here = stack.pop() as AliceState
    if (isSolved(here)) return true
    for (const to of landingsOf(here)) {
      const child = reduce(here, { type: 'hop', to })
      const k = keyOf(child)
      if (seen.has(k)) continue
      seen.add(k)
      stack.push(child)
    }
  }
  return false
}

/** Every position on this maze a child would be shown a dead end on. */
const stuckOn = (start: AliceState) => everyPosition(start).filter((here) => failure(here) !== null)

const marksOn = (maze: Maze, sign: number) => maze.marks.filter((mark) => mark === sign).length
const arrowCount = (bits: number) => DIRS.filter((dir) => (bits & (1 << dir)) !== 0).length

describe('the kangaroo’s hops — the mazes it deals', () => {
  for (const [index, level] of levels.entries()) {
    const deals = DEALS[index]
    const cfg = level.config
    const each = (run: (start: AliceState, why: string) => void) => {
      for (const [i, start] of deals.entries()) run(start, `${level.id}, seed ${SEEDS[i]}`)
    }

    it(`"${level.label}" reaches the ring in exactly par (${level.par}) hops, and one way only`, () => {
      each((start, why) => {
        // Two proofs of the same number. The shell's own breadth-first search
        // finds the shortest route over the whole (square, hop) graph; the
        // generator's own grade counts how many routes are that short, and a
        // level ships only when there is one.
        const route = solve(start)
        expect(route, why).not.toBeNull()
        expect(route?.length, why).toBe(level.par)

        const grade = gradeOf(start.maze)
        expect(grade.hops, why).toBe(level.par)
        expect(grade.routes, why).toBe(1)

        const done = (route as AliceAction[]).reduce((here, action) => {
          const next = reduce(here, action)
          expect(next, why).not.toBe(here)
          expect(isSolved(here), why).toBe(false)
          return next
        }, start)
        expect(isSolved(done), why).toBe(true)
        expect(done.trail, why).toHaveLength((level.par as number) + 1)
      })
    })

    it(`"${level.label}" deals a maze that reads as a maze`, () => {
      each((start, why) => {
        const { maze } = start
        expect(maze.n, why).toBe(cfg.n)
        expect(maze.hop, why).toBe(cfg.hop)
        expect(start.hop, why).toBe(cfg.hop)
        expect(start.at, why).toBe(maze.start)
        expect(start.trail, why).toEqual([maze.start])
        expect(maze.start, why).not.toBe(maze.home)
        expect(isSolved(start), why).toBe(false)

        // The ring ends the walk, so nothing sets off from it and nothing on it
        // changes the number. The square the kangaroo starts on carries no mark
        // either: it has not landed there, it woke up there.
        expect(maze.arrows[maze.home], why).toBe(0)
        expect(maze.marks[maze.home], why).toBe(0)
        expect(maze.marks[maze.start], why).toBe(0)

        for (let cell = 0; cell < cfg.n * cfg.n; cell++) {
          expect([-1, 0, 1], `${why} mark ${cell}`).toContain(maze.marks[cell])
          expect(arrowCount(maze.arrows[cell]), `${why} arrows ${cell}`).toBeLessThanOrEqual(
            cfg.arrows,
          )
          // Every arrow is one some hop could follow. A square in the top row
          // wearing an "up" arrow is a signpost pointing off the board: no
          // number the kangaroo could be carrying lands anywhere along it, and
          // an arrow no hop can ever take is a mark that cannot be decoded
          // from the board it is on.
          for (const dir of DIRS) {
            if ((maze.arrows[cell] & (1 << dir)) === 0) continue
            const lands = Array.from({ length: cfg.n - 1 }, (_, hop) =>
              stepFrom(cfg.n, cell, dir, hop + 1),
            )
            expect(lands.some((to) => to >= 0), `${why} arrow ${dir} on ${cell}`).toBe(true)
          }
          if (cell === maze.home) continue
          expect(arrowCount(maze.arrows[cell]), `${why} arrows ${cell}`).toBeGreaterThan(0)
        }

        // Both hints and both instructions that name a plus and a minus are
        // true of every board they are shown on.
        expect(marksOn(maze, 1), why).toBeGreaterThan(0)
        expect(marksOn(maze, 1), why).toBeLessThanOrEqual(cfg.plus)
        expect(marksOn(maze, -1), why).toBeGreaterThan(0)
        expect(marksOn(maze, -1), why).toBeLessThanOrEqual(cfg.minus)
      })
    })

    it(`"${level.label}" has the character it was dealt for`, () => {
      each((start, why) => {
        const grade = gradeOf(start.maze)
        expect(grade.deadEnds, `${why} dead ends`).toBeGreaterThanOrEqual(cfg.needs.deadEnds.least)
        expect(grade.deadEnds, `${why} dead ends`).toBeLessThanOrEqual(cfg.needs.deadEnds.most)
        expect(grade.forks, `${why} forks`).toBeGreaterThanOrEqual(cfg.needs.forks.least)
        expect(grade.forks, `${why} forks`).toBeLessThanOrEqual(cfg.needs.forks.most)
        expect(grade.squares, `${why} squares`).toBeGreaterThanOrEqual(cfg.needs.squares)
        expect(grade.changes, `${why} changes`).toBeGreaterThanOrEqual(cfg.needs.changes)
        expect(grade.numbers, `${why} numbers`).toBeGreaterThanOrEqual(cfg.needs.numbers)

        // And `deadEnds` counts what a child actually meets: one for every
        // position the shell puts a sentence and a Step back under, whichever
        // of the two kinds it is. The generator and the game have to mean the
        // same thing by "dead end" or a level's promise about them is empty.
        expect(grade.deadEnds, `${why} dead ends`).toBe(stuckOn(start).length)
      })
    })

    it(`"${level.label}" keeps its whole graph far inside the search cap`, () => {
      each((start, why) => {
        // A live position is a square and a number between 1 and n - 1, because
        // nothing on an n-wide board is n squares away — so a six-wide board
        // has at most 36 * 5 = 180 of them, and the stuck ones it can reach on
        // top of that. Either way it is nowhere near the 200,000 the shell's
        // search will follow.
        const reached = reachableCount<AliceState, AliceAction>({
          start,
          moves: hopsOf,
          apply: reduce,
          key: keyOf,
        })
        expect(reached, why).toBe(gradeOf(start.maze).positions)
        expect(reached, why).toBeLessThanOrEqual(cfg.n * cfg.n * (cfg.n + 1))

        const live = everyPosition(start).filter(
          (here) => here.hop >= 1 && here.hop <= cfg.n - 1,
        )
        expect(live.length, why).toBeLessThanOrEqual(cfg.n * cfg.n * (cfg.n - 1))
      })
    })

    it(`"${level.label}" reports a dead end exactly where there is one`, () => {
      each((start, why) => {
        for (const here of everyPosition(start)) {
          const stuck = failure(here)
          const canMove = landingsOf(here).length > 0
          // A dead end is a position the ring can no longer be reached from,
          // and that is checked against this file's own search rather than
          // against the one `failure` runs. Two of them show on the board — no
          // number left, no arrow that lands anywhere — and the third does not:
          // the hops go on and the ring is gone. All three have to be named.
          const lost = !isSolved(here) && !reaches(here)
          expect(stuck !== null, `${why} ${keyOf(here)}`).toBe(lost)
          if (stuck === null) continue
          expect(stuck, `${why} ${keyOf(here)}`).toBe(
            canMove ? STUCK_NO_HOME : here.hop < 1 ? STUCK_NO_HOP : STUCK_NOWHERE,
          )
          if (canMove) continue
          for (let cell = 0; cell < cfg.n * cfg.n; cell++) {
            expect(reduce(here, { type: 'hop', to: cell }), why).toBe(here)
          }
        }
      })
    })
  }

  it('cannot strand the kangaroo on the first level, and can on the other two', () => {
    // Every hint that says so is checked here, on every seed it could be shown
    // on, and against the whole of what "strand" means. A board with a hop left
    // on every square can still strand a child: hopping on for ever with the
    // ring out of reach is being stranded, and the first level promises that
    // cannot happen anywhere on it. The second and the third really can be got
    // wrong, which is what Step back is for.
    for (const [index, level] of levels.entries()) {
      for (const [i, start] of DEALS[index].entries()) {
        const why = `${level.id}, seed ${SEEDS[i]}`
        const stuck = stuckOn(start)
        const lost = everyPosition(start).filter((here) => !isSolved(here) && !reaches(here))
        expect(stuck.map(keyOf), why).toEqual(lost.map(keyOf))
        if (index === 0) expect(stuck, why).toHaveLength(0)
        else expect(stuck.length, why).toBeGreaterThan(0)
      }
    }
  })

  it('changes the number more than once on the way through the third board', () => {
    // "The kangaroo lands on a plus or a minus more than once here" is a claim
    // about the answer, not about the board, so it is checked on the answer.
    for (const [i, start] of DEALS[2].entries()) {
      expect(gradeOf(start.maze).changes, `seed ${SEEDS[i]}`).toBeGreaterThan(1)
    }
  })

  it('deals a different maze for a different seed', () => {
    for (const [index, level] of levels.entries()) {
      const drawn = new Set(
        DEALS[index].map((start) => `${start.maze.arrows.join()}|${start.maze.marks.join()}`),
      )
      expect(drawn.size, level.id).toBe(SEEDS.length)
    }
  })

  it('deals a maze for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      dealMaze(level.config, makeRng(4242))
      expect(performance.now() - at, level.id).toBeLessThan(400)
    }
  })

  it('never runs out of draws, over a wider sweep than the tests above', () => {
    // The one thing a generator with no fallback has to be: reliable. Every one
    // of these certifies, or `dealMaze` throws and this fails. These hundred
    // and the forty above are the 420 deals `MAX_DRAWS` quotes: run them with a
    // clock round `dealMaze` and the slowest is the number in that comment.
    for (let i = 0; i < 100; i++) {
      const seed = 3 + i * 104729
      for (const level of levels) {
        const grade = gradeOf(dealMaze(level.config, makeRng(seed)))
        expect(grade.hops, `${level.id}, seed ${seed}`).toBe(level.par)
        expect(grade.routes, `${level.id}, seed ${seed}`).toBe(1)
      }
    }
  }, 30_000)

  it('throws rather than handing over a maze it could not certify', () => {
    // A maze that has not been through `accepts` is a maze whose par is a guess
    // and whose one answer might be two. There is no board to fall back on, and
    // this is what that costs when the ask is impossible: an error, not a
    // quietly worse puzzle. Nothing here can meet it — a maze with no plus and
    // no minus on its route is turned down by every draw.
    const impossible: AliceConfig = {
      n: 4,
      par: 2,
      hop: 1,
      arrows: 1,
      plus: 0,
      minus: 0,
      needs: {
        deadEnds: { least: 0, most: Number.POSITIVE_INFINITY },
        forks: { least: 0, most: Number.POSITIVE_INFINITY },
        squares: 0,
        changes: 0,
        numbers: 0,
      },
    }
    expect(() => dealMaze(impossible, makeRng(1))).toThrow(/no 4 by 4 maze/)
  })
})

/* ============================================================
   The rules, on a maze built to ask about them rather than to
   be played.
   ============================================================ */

const UP = 1
const RIGHT = 2
const DOWN = 4
const LEFT = 8

function mazeOf(
  n: number,
  spec: {
    start: number
    hop: number
    home: number
    arrows?: Record<number, number>
    marks?: Record<number, number>
  },
): Maze {
  const arrows = new Array<number>(n * n).fill(0)
  const marks = new Array<number>(n * n).fill(0)
  for (const [cell, bits] of Object.entries(spec.arrows ?? {})) arrows[Number(cell)] = bits
  for (const [cell, mark] of Object.entries(spec.marks ?? {})) marks[Number(cell)] = mark
  return { n, arrows, marks, home: spec.home, start: spec.start, hop: spec.hop }
}

/**
 * Five squares across, the kangaroo in the middle of it on a hop of two, and
 * one square for every answer the rules can give: a square it may land on, a
 * square the right way off but the wrong number away, a square the arrows will
 * not let it set off towards, and a square on neither its row nor its column.
 *
 * Square 7 carries a plus that no hop on this board can land on, which is what
 * makes it useful: a hop of three from square 2 passes straight over it, and
 * the number has to come out as though it were not there.
 *
 * It is a real maze as well as a bench. The way home runs right, back left, and
 * then down, down and left again — five hops, every one of them a single square
 * after the minus on square 14. That matters for the board tests: `failure`
 * says nothing about any position they draw, so a shake on the kangaroo there
 * is always a refusal's and never a dead end's.
 */
const bench = stateOf(
  mazeOf(5, {
    start: 12,
    hop: 2,
    home: 22,
    arrows: { 12: UP | RIGHT, 2: DOWN, 14: LEFT, 13: DOWN, 18: DOWN, 23: LEFT, 7: UP },
    marks: { 2: 1, 7: 1, 14: -1, 17: 1 },
  }),
)

describe('the kangaroo’s hops — rules', () => {
  it('lands only where the number and the arrows agree', () => {
    // Up two and right two are the two hops on this board.
    expect(landingsOf(bench)).toEqual([2, 14])
    expect(canHop(bench, 2)).toBe(true)
    expect(canHop(bench, 14)).toBe(true)
    // The right number of squares, the wrong way: no arrow points down or left.
    expect(canHop(bench, 22)).toBe(false)
    expect(canHop(bench, 10)).toBe(false)
    // The right way, the wrong number of squares.
    expect(canHop(bench, 7)).toBe(false)
    expect(canHop(bench, 13)).toBe(false)
    // Neither row nor column, and the square underfoot.
    expect(canHop(bench, 6)).toBe(false)
    expect(canHop(bench, 12)).toBe(false)
  })

  it('reads a line the same way whichever end it is asked from', () => {
    expect(lineTo(bench, 2)).toBe(0)
    expect(lineTo(bench, 14)).toBe(1)
    expect(lineTo(bench, 22)).toBe(2)
    expect(lineTo(bench, 10)).toBe(3)
    expect(lineTo(bench, 6)).toBe(-1)
    expect(lineTo(bench, 12)).toBe(-1)
    expect(lineTo(bench, -1)).toBe(-1)
    expect(lineTo(bench, 25)).toBe(-1)
    expect(stepsTo(bench, 2)).toBe(2)
    expect(stepsTo(bench, 7)).toBe(1)
    expect(stepsTo(bench, 6)).toBe(-1)
    expect(spotOf(5, 0)).toBe('row 1, column 1')
    expect(spotOf(5, 24)).toBe('row 5, column 5')
    expect(rowOf(5, 14)).toBe(2)
    expect(colOf(5, 14)).toBe(4)
  })

  it('returns the identical state object for every hop the rules will not take', () => {
    for (const cell of [22, 10, 7, 13, 6, 12, 0, 24]) {
      expect(reduce(bench, { type: 'hop', to: cell }), `square ${cell}`).toBe(bench)
    }
    const rejected = [
      { type: 'hop', to: -1 },
      { type: 'hop', to: 25 },
      { type: 'hop', to: 1.5 },
      { type: 'hop', to: Number.NaN },
      { type: 'hop' },
      { type: 'never', to: 2 },
      {},
    ]
    for (const action of rejected) {
      expect(reduce(bench, action as unknown as AliceAction), JSON.stringify(action)).toBe(bench)
    }
    expect(reduce(bench, undefined as unknown as AliceAction)).toBe(bench)

    // …and every hop the rules do take must NOT return the same object.
    for (const cell of [2, 14]) {
      expect(reduce(bench, { type: 'hop', to: cell })).not.toBe(bench)
    }
  })

  it('carries the landing square’s mark into the number', () => {
    const up = reduce(bench, { type: 'hop', to: 2 })
    expect(up.at).toBe(2)
    expect(up.hop).toBe(3)
    expect(up.trail).toEqual([12, 2])
    expect(up.maze).toBe(bench.maze)

    const right = reduce(bench, { type: 'hop', to: 14 })
    expect(right.at).toBe(14)
    expect(right.hop).toBe(1)
    expect(right.trail).toEqual([12, 14])

    // A square with no mark leaves the number where it was: square 13 carries
    // nothing, so the hop of one that lands there is still a hop of one.
    const along = reduce(right, { type: 'hop', to: 13 })
    expect(along.at).toBe(13)
    expect(along.hop).toBe(1)
    expect(along.trail).toEqual([12, 14, 13])

    // And only the landing square's mark counts. This hop of three passes over
    // square 7, which wears a plus, and over square 12, which the kangaroo set
    // off from two hops ago; the number takes the plus on square 17 and
    // nothing else — 3 + 1, not 3 + 1 + 1. Flying over a mark is not landing
    // on it, and that one rule is the whole of what makes this an Alice maze.
    const down = reduce(up, { type: 'hop', to: 17 })
    expect(down.at).toBe(17)
    expect(down.hop).toBe(4)
    expect(down.trail).toEqual([12, 2, 17])
  })

  it('reports a dead end only where there is one', () => {
    // The number grown past every square there is.
    const wide = reduce(reduce(bench, { type: 'hop', to: 2 }), { type: 'hop', to: 17 })
    expect(wide.hop).toBe(4)
    expect(failure(wide)).toBe(STUCK_NOWHERE)

    // The number run down to nothing. Two ways off the first square: down twice
    // is the ring, and right once is a minus that ends the walk on the spot.
    const spent = stateOf(
      mazeOf(4, {
        start: 0,
        hop: 1,
        home: 8,
        arrows: { 0: RIGHT | DOWN, 4: DOWN, 1: RIGHT },
        marks: { 1: -1 },
      }),
    )
    expect(failure(spent)).toBeNull()
    expect(solve(spent)).toHaveLength(2)
    const flat = reduce(spent, { type: 'hop', to: 1 })
    expect(flat.hop).toBe(0)
    expect(landingsOf(flat)).toEqual([])
    expect(failure(flat)).toBe(STUCK_NO_HOP)
    expect(isSolved(flat)).toBe(false)
    expect(solve(flat)).toBeNull()

    // Arrows that point only off the edge are a dead end as well, and there is
    // still a number left, so it is the other sentence.
    const cornered = stateOf(mazeOf(4, { start: 0, hop: 1, home: 15, arrows: { 0: UP | LEFT } }))
    expect(failure(cornered)).toBe(STUCK_NOWHERE)

    // The third dead end, and the one the board cannot show: arrows to follow
    // and a number to spend, and the ring behind it for good. One hop down
    // instead of right and the kangaroo hops between two squares for ever.
    const astray = stateOf(
      mazeOf(4, {
        start: 0,
        hop: 1,
        home: 3,
        arrows: { 0: RIGHT | DOWN, 1: RIGHT, 2: RIGHT, 4: RIGHT, 5: LEFT },
      }),
    )
    expect(failure(astray)).toBeNull()
    expect(solve(astray)).toHaveLength(3)
    const wandered = reduce(astray, { type: 'hop', to: 4 })
    expect(landingsOf(wandered)).toEqual([5])
    expect(isSolved(wandered)).toBe(false)
    expect(failure(wandered)).toBe(STUCK_NO_HOME)
    expect(solve(wandered)).toBeNull()
    // …and it stays a dead end however long the kangaroo goes on hopping.
    expect(failure(reduce(wandered, { type: 'hop', to: 5 }))).toBe(STUCK_NO_HOME)

    // The boundary the other way: the ring has no arrows either, and landing on
    // it is winning rather than being stuck.
    const won = reduce(
      stateOf(mazeOf(4, { start: 0, hop: 1, home: 1, arrows: { 0: RIGHT } })),
      { type: 'hop', to: 1 },
    )
    expect(isSolved(won)).toBe(true)
    expect(landingsOf(won)).toEqual([])
    expect(failure(won)).toBeNull()
  })

  it('says which rule a tap broke, and says nothing about a tap that broke none', () => {
    expect(refusalOf(bench, 6)?.message).toBe(
      'The kangaroo only hops straight up, down, left or right.',
    )
    expect(refusalOf(bench, 22)?.message).toBe(
      'The kangaroo cannot set off that way from this square.',
    )
    expect(refusalOf(bench, 10)?.message).toBe(
      'The kangaroo cannot set off that way from this square.',
    )
    expect(refusalOf(bench, 7)?.message).toBe(
      'That square is 1 square away, and the kangaroo hops 2.',
    )
    // The plural, one hop along: from the right-hand square the kangaroo
    // carries a hop of one, and the square it came from is two away.
    const right = reduce(bench, { type: 'hop', to: 14 })
    expect(refusalOf(right, 12)?.message).toBe(
      'That square is 2 squares away, and the kangaroo hops 1.',
    )

    // The two squares the rules take say nothing at all, and neither does the
    // square the kangaroo is already on: that tap changes nothing, so it is a
    // dead control rather than a rule broken.
    expect(refusalOf(bench, 2)).toBeNull()
    expect(refusalOf(bench, 14)).toBeNull()
    expect(refusalOf(bench, 12)).toBeNull()
    expect(refusalOf(bench, -1)).toBeNull()
    expect(refusalOf(bench, 99)).toBeNull()
  })

  it('lets the kangaroo pretend to land wherever a straight hop could reach', () => {
    // The tap names a square to stand on, so there is an honest position to
    // draw and take back — and seeing the hop come out the wrong length is how
    // a child learns to count it.
    const over = refusalOf(bench, 7)
    expect(over?.pretend.at).toBe(7)
    expect(over?.pretend.hop).toBe(bench.hop)
    expect(over?.pretend.trail).toEqual([12, 7])
    expect(over?.where).toBe('7')

    // Except where nothing could pretend: no straight hop reaches a square that
    // shares neither the row nor the column, so nothing moves.
    const off = refusalOf(bench, 6)
    expect(off?.pretend).toBe(bench)
    expect(off?.where).toBe('6')
  })

  it('refuses exactly the taps the rules refuse, everywhere on every board', () => {
    for (const [index, level] of levels.entries()) {
      for (const start of everyPosition(DEALS[index][0])) {
        for (let cell = 0; cell < level.config.n * level.config.n; cell++) {
          const no = refusalOf(start, cell)
          const dead = cell === start.at
          expect(no === null, `${keyOf(start)} ${cell}`).toBe(canHop(start, cell) || dead)
        }
      }
    }
  })

  it('describes a hop in the same words the board uses', () => {
    const say = (state: AliceState, to: number) =>
      describeMove(state, reduce(state, { type: 'hop', to }), { type: 'hop', to })
    expect(say(bench, 2)).toBe('Hopped up to row 1, column 3, and the hop grew to 3')
    expect(say(bench, 14)).toBe('Hopped right to row 3, column 5, and the hop shrank to 1')
    const plain = stateOf(mazeOf(4, { start: 0, hop: 1, home: 15, arrows: { 0: RIGHT } }))
    expect(say(plain, 1)).toBe('Hopped right to row 1, column 2')

    // A hop the rules will not take never reaches the tape, and says so anyway.
    expect(describeMove(bench, bench, { type: 'hop', to: 6 })).toBe('Nothing moved')
    expect(describeMove(bench, bench, { type: 'never' } as unknown as AliceAction)).toBe(
      'Nothing moved',
    )
  })

  it('counts two positions the same when the same hops are left in them', () => {
    // The trail is a record of how the kangaroo got here and changes nothing
    // about what it can do next, so it is not part of the key. That is what
    // keeps the search small enough to run in a test.
    const up = reduce(bench, { type: 'hop', to: 2 })
    expect(keyOf({ ...up, trail: [...up.trail, 99, 98] })).toBe(keyOf(up))
    expect(keyOf(up)).not.toBe(keyOf(bench))
    // …and the number is in it, because it is what the next hop is measured by.
    expect(keyOf({ ...up, hop: 2 })).not.toBe(keyOf(up))
  })

  it('never touches the rng twice for the same seed', () => {
    for (const level of levels) {
      const once = init(level, makeRng(99))
      const again = init(level, makeRng(99))
      expect(once.maze.arrows, level.id).toEqual(again.maze.arrows)
      expect(once.maze.marks, level.id).toEqual(again.maze.marks)
      expect(once.maze.home, level.id).toBe(again.maze.home)
      expect(once.maze.start, level.id).toBe(again.maze.start)
      // Two starts never share the arrays a state is allowed to hold.
      expect(once.maze.arrows, level.id).not.toBe(again.maze.arrows)
      expect(once.trail, level.id).not.toBe(again.trail)
    }
  })

  it('draws a card the rules would allow', () => {
    // The card is one row of a board rather than a whole one, but the numbers
    // on it are a real position: a hop of one, a landing on a plus, a hop of
    // two, and the ring two squares further on. Played out on a real maze, the
    // picture finishes in one more hop.
    expect(CARD.at - CARD.over).toBe(CARD.hop + 1)
    expect(CARD.over - CARD.from).toBe(CARD.hop)
    expect(CARD.ring - CARD.at).toBe(CARD.hop + 1)
    expect(CARD.ring).toBeLessThan(CARD.squares)

    const n = CARD.squares
    const row = (i: number) => i
    const story = stateOf(
      mazeOf(n, {
        start: row(CARD.from),
        hop: CARD.hop,
        home: row(CARD.ring),
        arrows: { [row(CARD.from)]: RIGHT, [row(CARD.over)]: RIGHT, [row(CARD.at)]: RIGHT },
        marks: { [row(CARD.over)]: 1 },
      }),
    )
    const route = solve(story)
    expect(route).toHaveLength(3)
    const drawn = reduce(reduce(story, route![0]), route![1])
    expect(drawn.at).toBe(row(CARD.at))
    expect(drawn.hop).toBe(CARD.hop + 1)
    expect(isSolved(drawn)).toBe(false)
    expect(solve(drawn)).toHaveLength(1)
  })
})

/* ============================================================
   The words.
   ============================================================ */

describe('the kangaroo’s hops — what it says', () => {
  it('ramps 1 → 2 → 3 with three hints and a stable id each', () => {
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['four-across', 'five-across', 'six-across'])
    expect(levels.map((l) => l.label)).toEqual([
      'Four squares across',
      'Five squares across',
      'Six squares across',
    ])
    expect(levels.map((l) => l.par)).toEqual([5, 8, 12])
    expect(levels.map((l) => l.config.n)).toEqual([4, 5, 6])
    for (const level of levels) expect(level.hints, level.id).toHaveLength(3)
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    const lines = [...aliceMaze.instructions, ...levels.flatMap((l) => l.hints)]
    expect(aliceMaze.instructions[0]).toMatch(/kangaroo/)
    for (const line of lines) {
      expect(line, line).toMatch(/^[A-Z]/)
      expect(line, line).toMatch(/\.$/)
      expect(line.length, line).toBeLessThanOrEqual(115)
      expect(line, line).not.toMatch(/[!]/)
      expect(line, line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}]/u)
    }

    // The instruction block is the one thing here a child is handed before the
    // first hop, and docs/PUZZLE_CONTRACT.md asks for two to four short lines.
    // "Short" is measured against what the rest of the collection actually
    // writes rather than against nothing. Sum the instruction lengths in every
    // other `src/puzzles/*/index.ts` and the blocks run from 184 characters
    // (garden-cats) to 296 (frog-leap), with no single line past 113
    // (hedge-maze). So the caps here are the collection's own ceiling rather
    // than a line drawn round this block: 296 for the block, 100 for a line.
    // These three lines come to 249 — 68, 87 and 94 — which is the middle of
    // that range rather than the top of it, and a block that grew past the
    // longest the collection writes would fail here.
    //
    // Three lines, not four, because the arrows are already said on the board
    // itself, above the maze and outside this drawer — 'renders the rule and
    // the maze' below is what holds them there. A fourth line would be the
    // board's own sentence written twice, and a block nobody reads to the end
    // teaches none of its lines.
    expect(aliceMaze.instructions).toHaveLength(3)
    const block = aliceMaze.instructions.reduce((sum, line) => sum + line.length, 0)
    expect(block).toBeLessThanOrEqual(296)
    for (const line of aliceMaze.instructions) expect(line.length, line).toBeLessThanOrEqual(100)
  })

  it('nudges in the hints instead of handing over a route', () => {
    for (const level of levels) {
      for (const hint of level.hints) {
        // Never a square to go to…
        expect(hint, hint).not.toMatch(/row \d|column \d/i)
        // …and never a run of directions read out.
        expect(hint, hint).not.toMatch(/\b(up|right|down|left)\b[^.]*\b(up|right|down|left)\b/i)
      }
    }
  })

  it('says in words that a hop only counts where it lands', () => {
    // The one rule that makes this an Alice maze rather than a maze with a
    // number on it. `reduce` applies a mark only to the square a hop finishes
    // on and `isSolved` asks the kangaroo to finish one on the ring, and on
    // most deals the answer itself flies over the ring or over a plus on the
    // way through — so a child who is never told it is a child the board
    // contradicts. Both instructions it belongs in have to carry it.
    const about = (what: RegExp) => aliceMaze.instructions.filter((line) => what.test(line))
    const home = about(/ring/)
    expect(home).toHaveLength(1)
    expect(home[0]).toMatch(/^Land the kangaroo on the ring\./)
    expect(home[0]).toMatch(/Hopping over the ring does not count/)
    const marks = about(/plus square/)
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatch(/^Landing on a plus square/)
    expect(marks[0]).toMatch(/Landing on a minus square/)
  })

  it('calls a hop a hop wherever it says anything', () => {
    // The board says Hop on a tile above every tap, the tape says "Hopped", and
    // the title says hops. A second word for the same act is a tax on an early
    // reader with nothing bought by it.
    const said = [
      aliceMaze.title,
      aliceMaze.tagline,
      ...aliceMaze.instructions,
      ...levels.flatMap((level) => level.hints),
    ]
    for (const line of said) expect(line, line).not.toMatch(/jump/i)
  })

  it('describes itself for the index row without hype', () => {
    expect(aliceMaze.id).toBe('alice-maze')
    expect(aliceMaze.title).toBe('The kangaroo’s hops')
    expect(aliceMaze.tagline).toMatch(/\.$/)
    // One line under a picture on a card, so it is held to the same length the
    // rest of the collection writes taglines at — 62 to 98 characters — and to
    // one idea a sentence rather than two clauses hung on an "until".
    expect(aliceMaze.tagline.length).toBeLessThanOrEqual(95)
    expect(aliceMaze.reseedable).toBe(true)
  })
})

/* ============================================================
   The board. Squares to tap, a trail over them, and the number
   on a tile above.
   ============================================================ */

describe('the kangaroo’s hops — board', () => {
  afterEach(cleanup)

  const draw = (state: AliceState, locked = false, settings?: { allowForbiddenMoves: boolean }) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }), {
      wrapper: underSettings(settings),
    })
    return { dispatch, view }
  }

  const square = (cell: number) => {
    const where = spotOf(5, cell)
    return screen.getByRole('button', {
      name: new RegExp(`^${where.charAt(0).toUpperCase()}${where.slice(1)}\\.`),
    })
  }
  const note = () => document.querySelector('p[class*="note"]')?.textContent
  /** An svg's `className` is not a string, so ask the attribute for it. */
  const roo = (view: { container: HTMLElement }) =>
    view.container.querySelector('[class*="roo"]')?.getAttribute('class') ?? ''

  it('draws a pressable square for every square, and nothing else to touch', () => {
    draw(bench)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(25)
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).toMatch(/^Row \d, column \d\./)
    }
  })

  it('says what is on every square, and what a tap on it does', () => {
    draw(bench)
    expect(square(12).getAttribute('aria-label')).toBe(
      'Row 3, column 3. The kangaroo is here. Arrows point up and right.',
    )
    expect(square(2).getAttribute('aria-label')).toBe(
      'Row 1, column 3. It makes the hop one longer. An arrow points down. Hop to it.',
    )
    expect(square(14).getAttribute('aria-label')).toBe(
      'Row 3, column 5. It makes the hop one shorter. An arrow points left. Hop to it.',
    )
    expect(square(22).getAttribute('aria-label')).toBe('Row 5, column 3. The ring. No arrows. Hop to it.')
    // While a forbidden hop is offered every square reads the same, so a child
    // listening counts the lines out from the same facts a child looking does.
    for (const button of screen.getAllByRole('button')) {
      const label = button.getAttribute('aria-label') ?? ''
      if (label.includes('The kangaroo is here')) continue
      expect(label, label).toMatch(/Hop to it\.$/)
      expect(label, label).not.toMatch(/\b(cannot|only|away)\b/)
    }
  })

  it('takes one tap and sends one hop', () => {
    const { dispatch } = draw(bench)
    fireEvent.click(square(2))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'hop', to: 2 })
  })

  it('shows the number the kangaroo is carrying, in figures', () => {
    const { view } = draw(bench)
    // Left in the page rather than hidden from it: read straight through, the
    // tile says "Hop 2" before a screen reader ever reaches the squares.
    expect(view.container.querySelector('[class*="hop"]')?.getAttribute('aria-hidden')).toBeNull()
    expect(view.container.textContent).toContain('Hop')
    expect(view.container.querySelector('[class*="hopNumber"]')?.textContent).toBe('2')
    cleanup()
    const shorter = draw(reduce(bench, { type: 'hop', to: 14 }))
    expect(shorter.view.container.querySelector('[class*="hopNumber"]')?.textContent).toBe('1')
  })

  it('lets the kangaroo overshoot, says why, and puts it back', () => {
    const { dispatch, view } = draw(bench)
    const wrong = square(7)
    expect(wrong).not.toHaveAttribute('aria-disabled')
    fireEvent.click(wrong)
    expect(dispatch).not.toHaveBeenCalled()
    expect(note()).toContain('That square is 1 square away, and the kangaroo hops 2.')
    // Clay round the square the finger landed on, and the kangaroo really
    // standing there for the length of one cue.
    expect(wrong.className).toMatch(/flash/)
    expect(wrong).toHaveAttribute('data-here', 'true')
    expect(square(12)).not.toHaveAttribute('data-here')
    // It went, so it did not strain.
    expect(roo(view)).not.toMatch(/shake/)
  })

  it('strains where it stands for a square no straight hop reaches', () => {
    const { dispatch, view } = draw(bench)
    fireEvent.click(square(6))
    expect(dispatch).not.toHaveBeenCalled()
    expect(note()).toContain('The kangaroo only hops straight up, down, left or right.')
    expect(square(6).className).toMatch(/flash/)
    expect(square(12)).toHaveAttribute('data-here', 'true')
    expect(roo(view)).toMatch(/shake/)
  })

  it('answers a hop the arrows will not allow, and never calls one a win', () => {
    const { dispatch, view } = draw(bench)
    const ring = square(22)
    fireEvent.click(ring)
    expect(dispatch).not.toHaveBeenCalled()
    expect(note()).toContain('The kangaroo cannot set off that way from this square.')

    // The kangaroo really stands on the ring for the length of one cue, and
    // moss is this app's "solved". A refused tap on the one square a child is
    // aiming at must not paint it the colour of a win under a clay flash saying
    // the hop was not allowed. Amber and the flash are the honest pair.
    expect(ring.className).toMatch(/flash/)
    expect(ring).toHaveAttribute('data-here', 'true')
    expect(ring).not.toHaveAttribute('data-won')
    expect(view.container.querySelector('[data-won="true"]')).toBeNull()
  })

  it('goes back to a dead control where the settings ask for one, and stays reachable', () => {
    const { dispatch } = draw(bench, false, { allowForbiddenMoves: false })
    const wrong = screen.getByRole('button', {
      name: /^That square is 1 square away, and the kangaroo hops 2\. Row 2, column 3\./,
    })
    expect(wrong).toHaveAttribute('aria-disabled', 'true')
    // aria-disabled rather than disabled: the arrow keys rove this board, so a
    // refused square has to keep its place under the cursor.
    expect(wrong).toBeEnabled()
    fireEvent.click(wrong)
    expect(dispatch).not.toHaveBeenCalled()

    // The two squares the rules take are still live, and still say only what a
    // tap on them does.
    expect(square(2)).not.toHaveAttribute('aria-disabled')
    expect(square(14)).not.toHaveAttribute('aria-disabled')
  })

  it('keeps the square the kangaroo is on dead, because that tap changes nothing', () => {
    const { dispatch } = draw(bench)
    const home = square(12)
    expect(home).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(home)
    expect(dispatch).not.toHaveBeenCalled()
    expect(note()).toBe('')
  })

  it('roves one tab stop over the squares with the arrow keys', () => {
    draw(bench)
    // The cursor starts where the kangaroo does, and it is the only tab stop.
    expect(screen.getAllByRole('button').filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(square(12).tabIndex).toBe(0)

    fireEvent.keyDown(square(12), { key: 'ArrowRight' })
    expect(square(13).tabIndex).toBe(0)
    expect(square(12).tabIndex).toBe(-1)
    fireEvent.keyDown(square(13), { key: 'ArrowUp' })
    expect(square(8).tabIndex).toBe(0)

    // The rim stops it rather than wrapping.
    for (let i = 0; i < 4; i++) fireEvent.keyDown(square(8), { key: 'ArrowUp' })
    expect(square(3).tabIndex).toBe(0)
  })

  it('leaves the browser’s own arrow chords alone', () => {
    draw(bench)
    for (const chord of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      fireEvent.keyDown(square(12), { key: 'ArrowRight', ...chord })
      expect(square(12).tabIndex).toBe(0)
    }
    fireEvent.keyDown(square(12), { key: 'Home' })
    expect(square(12).tabIndex).toBe(0)
  })

  it('draws the trail it has hopped, one arc a hop', () => {
    const { view } = draw(reduce(reduce(bench, { type: 'hop', to: 2 }), { type: 'hop', to: 17 }))
    const legs = view.container.querySelectorAll('path[class*="leg"]')
    expect(legs).toHaveLength(2)
    expect(legs[1]).toHaveAttribute('data-last', 'true')
    expect(legs[0]).not.toHaveAttribute('data-last')
    // Nothing to draw before it has been anywhere.
    cleanup()
    draw(bench)
    expect(document.querySelector('path[class*="leg"]')).toBeNull()
  })

  it('goes on naming the plus or the minus under the kangaroo', () => {
    // A mark is not spent by being landed on: it does the same thing again
    // every time the kangaroo comes back to it, and the answer really does
    // come back. The picture cannot say so — the kangaroo covers the middle of
    // the square it is standing on — so the words carry it, exactly as they do
    // for the ring.
    draw(reduce(bench, { type: 'hop', to: 14 }))
    expect(square(14).getAttribute('aria-label')).toBe(
      'Row 3, column 5. It makes the hop one shorter. The kangaroo is here. An arrow points left.',
    )
  })

  it('turns the ring moss when the kangaroo lands on it, and goes on naming it', () => {
    const won = reduce(
      stateOf(mazeOf(4, { start: 0, hop: 1, home: 1, arrows: { 0: RIGHT } })),
      { type: 'hop', to: 1 },
    )
    const { view } = draw(won, true)
    expect(view.container.querySelector('[data-won="true"]')).not.toBeNull()
    expect(note()).toBe('')

    // The one square whose name matters most goes on saying what it is at the
    // moment it is reached. A listener who reads the board back afterwards can
    // still find the ring under the kangaroo.
    const home = screen.getByRole('button', { name: /^Row 1, column 2\./ })
    expect(home.getAttribute('aria-label')).toBe(
      'Row 1, column 2. The ring. The kangaroo is here. No arrows.',
    )
  })

  it('shakes the kangaroo once when it is stuck, and only on that position', () => {
    const spent = reduce(
      stateOf(mazeOf(4, { start: 0, hop: 1, home: 15, arrows: { 0: RIGHT }, marks: { 1: -1 } })),
      { type: 'hop', to: 1 },
    )
    const { view } = draw(spent, true)
    expect(failure(spent)).toBe(STUCK_NO_HOP)
    expect(roo(view)).toMatch(/shake/)
  })

  it('ignores every input while locked', () => {
    const { dispatch, view } = draw(bench, true)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-disabled', 'true')
      // aria-disabled rather than disabled, because the cursor goes on roving
      // the squares — which is exactly why focus is still inside the grid when
      // the board locks, and why the keys have to be turned away by hand.
      expect(button).toBeEnabled()
      fireEvent.click(button)
    }

    // The cursor stays where it was, and the arrow key is left to the page: a
    // locked board is a solved one or a dead end, and both put what a child
    // needs next — the notice, Step back, the stamp — under the board. A
    // handler that swallowed the key would stop the page scrolling to it and
    // walk a tab stop round a board that cannot be played instead.
    const untouched = fireEvent.keyDown(square(12), { key: 'ArrowRight' })
    expect(untouched).toBe(true)
    expect(square(12).tabIndex).toBe(0)
    expect(square(13).tabIndex).toBe(-1)
    expect(dispatch).not.toHaveBeenCalled()
    expect(view.container.textContent).not.toContain('The kangaroo hops')
  })

  it('sits still while a refusal is on screen, keys and all', () => {
    // A board drawing a pretend position has to sit still until it is over —
    // src/lib/refusal.ts asks for exactly that — and the cursor is part of the
    // board. Moving it out from under the square the clay ring is on would
    // take a child's eye off the one thing the cue is pointing at.
    const { dispatch } = draw(bench)
    fireEvent.click(square(7))
    expect(note()).toContain('That square is 1 square away, and the kangaroo hops 2.')

    const untouched = fireEvent.keyDown(square(12), { key: 'ArrowRight' })
    expect(untouched).toBe(true)
    expect(square(12).tabIndex).toBe(0)
    expect(square(13).tabIndex).toBe(-1)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = reduce(bench, { type: 'hop', to: 14 })
    const first = draw(state).view.container.innerHTML
    cleanup()
    expect(draw(state).view.container.innerHTML).toBe(first)
  })

  it('renders the rule and the maze — the shell owns everything else', () => {
    const { view } = draw(bench)
    expect(view.container.querySelectorAll('h1, h2, h3, h4')).toHaveLength(0)
    // The two rules a child has to hold in a head: the ring is landed on
    // rather than flown over, and the arrows that count are the ones under the
    // kangaroo's own feet on a board where every square wears some.
    expect(view.container.textContent).toContain('Land the kangaroo on the ring.')
    expect(view.container.textContent).toContain('an arrow on its own square points')
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(aliceMaze.title)
    expect(text).not.toContain(aliceMaze.tagline)
    for (const line of aliceMaze.instructions) expect(text).not.toContain(line)
    for (const hint of levels[1].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })

  it('reads the position out for anyone who cannot see it', () => {
    draw(bench)
    expect(screen.getByRole('status').textContent).toBe(
      'The kangaroo hops 2 squares. It is on row 3, column 3.',
    )
    cleanup()
    draw(reduce(bench, { type: 'hop', to: 14 }))
    expect(screen.getByRole('status').textContent).toBe(
      'The kangaroo hops 1 square. It is on row 3, column 5.',
    )
  })
})
