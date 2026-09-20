import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { longTable } from './index'
import board from './board.module.css'
import type { TableConfig, TableState } from './logic'
import {
  OUT_OF_SWAPS,
  canStillWin,
  canSwap,
  climberGetsHome,
  dealsFor,
  describeMove,
  distanceTable,
  everySeam,
  everySeating,
  failure,
  failureOf,
  init,
  isGoodSeating,
  isSolved,
  legalMoves,
  luckyLines,
  nameFor,
  quarrelGrid,
  quarrelSeams,
  reduce,
  seatKey,
  swapSeats,
  swapsLeft,
  swapsToGo,
} from './logic'

const levels = longTable.levels as PuzzleLevel<TableConfig>[]
const start = (level: PuzzleLevel<TableConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 40 }, (_, i) => 1234 + i * 57)

/** The ids of everybody this guest cannot sit next to, in one order. */
function quarrelsWith(cfg: TableConfig, id: string): string[] {
  return cfg.quarrels
    .filter((q) => q.a === id || q.b === id)
    .map((q) => (q.a === id ? q.b : q.a))
    .sort()
}

const idsAt = (cfg: TableConfig) => cfg.guests.map((g) => g.id)

/** A seating written out as ids, for a readable failure message. */
const readRow = (cfg: TableConfig, seats: readonly number[]) =>
  seats.map((who) => cfg.guests[who].id).join(' ')

/**
 * The shortest run of swaps to a seating that works, found by the shared
 * breadth-first search rather than by the puzzle's own distance table. 120,
 * 720 and 5040 seatings are far under the search's 200,000-state cap, so this
 * is the whole graph every time, and it is what `par` has to match.
 */
function shortest(cfg: TableConfig, seats: readonly number[]): number[] | null {
  return shortestSolution<number[], number>({
    start: seats.slice(),
    moves: (row) => everySeam(row),
    apply: (row, seam) => swapSeats(row, seam),
    key: seatKey,
    solved: (row) => isGoodSeating(cfg, row),
  })
}

/**
 * Whether any run of `left` swaps reaches a seating that works — worked out by
 * looking, with no distance table anywhere near it. `failure` has to agree
 * with this on every position a player can reach.
 */
function canStillFinish(
  cfg: TableConfig,
  seats: readonly number[],
  left: number,
  memo = new Map<string, boolean>(),
): boolean {
  if (isGoodSeating(cfg, seats)) return true
  if (left === 0) return false
  const key = `${seatKey(seats)}:${left}`
  const known = memo.get(key)
  if (known !== undefined) return known
  let found = false
  for (const seam of everySeam(seats)) {
    if (!canStillFinish(cfg, swapSeats(seats, seam), left - 1, memo)) continue
    found = true
    break
  }
  memo.set(key, found)
  return found
}

/**
 * Where every shortest run out of this deal finishes. A level hands out
 * exactly par, so the only swaps it will pay for are the ones that shorten the
 * way: this keeps those and hands back the seatings those runs end on. It is
 * what a hint that tells a child to *do* something has to be held to — the
 * board in front of them and the swaps in their hand, rather than somewhere in
 * the whole seating graph.
 */
function parFinishes(cfg: TableConfig, seats: readonly number[]): number[][] {
  let rows = [seats.slice()]
  for (let left = cfg.swaps; left > 0; left--) {
    const next = new Map<string, number[]>()
    for (const row of rows) {
      for (const seam of everySeam(row)) {
        const child = swapSeats(row, seam)
        if (swapsToGo(cfg, child) !== left - 1) continue
        next.set(seatKey(child), child)
      }
    }
    rows = [...next.values()]
  }
  return rows
}

/** Every position a player can reach from here, stopping where the shell stops. */
function everyPosition(from: TableState): TableState[] {
  const seen = new Map<string, TableState>()
  const stack = [from]
  while (stack.length > 0) {
    const state = stack.pop() as TableState
    const key = `${seatKey(state.seats)}:${state.used}`
    if (seen.has(key)) continue
    seen.set(key, state)
    // The shell locks a solved level and a dead end, so nothing is played on
    // from either of them.
    if (isSolved(state) || failure(state) !== null) continue
    for (const move of legalMoves(state)) {
      const next = reduce(state, move)
      if (next !== state) stack.push(next)
    }
  }
  return [...seen.values()]
}

/* ============================================================
   The table

   Who is sitting down, who cannot sit next to whom, and the
   nesting: every level is the one before it with one more
   animal pulling up a chair.
   ============================================================ */

describe('the table', () => {
  it('is three levels of five, six and seven, each harder than the last', () => {
    expect(levels.map((l) => l.config.guests.length)).toEqual([5, 6, 7])
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.par)).toEqual([3, 4, 5])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
  })

  it('hands out exactly par swaps, so a wasted one cannot be paid for', () => {
    for (const level of levels) expect(level.config.swaps).toBe(level.par)
  })

  for (const level of levels) {
    it(`"${level.label}" seats everybody once and quarrels only about guests at it`, () => {
      const { config } = level
      expect(new Set(idsAt(config)).size).toBe(config.guests.length)
      for (const guest of config.guests) {
        expect(guest.label.length).toBeGreaterThan(0)
        expect(guest.art.length).toBeGreaterThan(0)
      }
      for (const { a, b } of config.quarrels) {
        expect(idsAt(config)).toContain(a)
        expect(idsAt(config)).toContain(b)
        expect(a).not.toBe(b)
      }
      // One quarrel a pair, and never the same pair twice.
      const pairs = config.quarrels.map(({ a, b }) => [a, b].sort().join(':'))
      expect(new Set(pairs).size).toBe(pairs.length)
    })
  }

  it('grows by one animal a level, and keeps every quarrel it had', () => {
    for (let i = 1; i < levels.length; i++) {
      const before = levels[i - 1].config
      const after = levels[i].config
      expect(idsAt(after).slice(0, idsAt(before).length)).toEqual(idsAt(before))
      for (const { a, b } of before.quarrels) {
        expect(after.quarrels).toContainEqual({ a, b })
      }
    }
  })

  it('can seat everybody at all, on every level', () => {
    for (const level of levels) {
      const good = everySeating(level.config.guests.length).filter((seats) =>
        isGoodSeating(level.config, seats),
      )
      expect(good.length).toBeGreaterThan(0)
    }
  })
})

/* ============================================================
   The deal

   A pool rather than a retry: every seating of the cast is
   looked at once, and the ones that keep all three promises
   are the ones a level may open on.
   ============================================================ */

describe('the deal', () => {
  for (const level of levels) {
    const { config } = level

    it(`"${level.label}" has a pool, and every deal in it is exactly ${level.par} swaps from home`, () => {
      const pool = dealsFor(config)
      expect(pool.length).toBeGreaterThanOrEqual(30)
      for (const seats of pool) {
        expect(`${readRow(config, seats)}: ${swapsToGo(config, seats)}`).toBe(
          `${readRow(config, seats)}: ${config.swaps}`,
        )
        // Never a seating that is already right, and never one nobody could fix.
        expect(isGoodSeating(config, seats)).toBe(false)
        expect(quarrelSeams(config, seats).length).toBeGreaterThan(0)
      }
    })

    it(`"${level.label}" ${
      config.climberProof
        ? 'deals nothing a mindless climber could walk home'
        : 'lets the mindless climber home, which is what a first level is for'
    }`, () => {
      const climbed = dealsFor(config).filter((seats) =>
        climberGetsHome(config, seats, config.swaps),
      )
      // Level one leaves the gate off on purpose — see index.ts — and the
      // check there is that it really is off rather than quietly doing
      // nothing.
      if (config.climberProof) expect(climbed.map((seats) => readRow(config, seats))).toEqual([])
      else expect(climbed.length).toBeGreaterThan(0)
    })

    it(`"${level.label}" keeps every deal between its floor and its cap of lucky tapping`, () => {
      for (const seats of dealsFor(config)) {
        const lucky = luckyLines(config, seats, config.swaps)
        expect(lucky).toBeGreaterThan(0)
        const held = Math.min(Math.max(lucky, config.floor), config.lucky)
        expect(`${readRow(config, seats)}: ${lucky} lucky lines`).toBe(
          `${readRow(config, seats)}: ${held} lucky lines`,
        )
      }
    })

    it(`"${level.label}" deals from that pool and nowhere else, on 40 seeds`, () => {
      const pool = new Set(dealsFor(config).map(seatKey))
      const dealt = new Set<string>()
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.used).toBe(0)
        expect(state.cfg).toBe(config)
        expect(pool.has(seatKey(state.seats))).toBe(true)
        expect(isSolved(state)).toBe(false)
        expect(failure(state)).toBeNull()
        expect(swapsToGo(config, state.seats)).toBe(level.par)
        dealt.add(seatKey(state.seats))
      }
      // Forty seeds should not keep handing back the same table.
      expect(dealt.size).toBeGreaterThanOrEqual(10)
    })
  }

  it('says what each gate turns away, so a gate that stops biting is visible', () => {
    // Finding: the cap on the third level rejects real seatings while the one
    // on the first rejects none, and neither floor rejects anything at all.
    // That is worth knowing rather than assuming, because a gate that turns
    // nothing away is a promise nobody is keeping yet — so the counts are
    // written down and this test is where they are re-taken.
    const counted = levels.map((level) => {
      const { config } = level
      const at = everySeating(config.guests.length).filter(
        (seats) => swapsToGo(config, seats) === config.swaps,
      )
      const climbed = config.climberProof
        ? at.filter((seats) => climberGetsHome(config, seats, config.swaps))
        : []
      const kept = at.filter((seats) => !climbed.includes(seats))
      const over = kept.filter((seats) => luckyLines(config, seats, config.swaps) > config.lucky)
      const under = kept.filter((seats) => luckyLines(config, seats, config.swaps) < config.floor)
      return [
        `${level.id}:`,
        `${at.length} at par,`,
        `climber turns away ${climbed.length},`,
        `cap ${over.length},`,
        `floor ${under.length},`,
        `pool ${dealsFor(config).length}`,
      ].join(' ')
    })
    expect(counted).toEqual([
      'five-at-the-table: 48 at par, climber turns away 0, cap 0, floor 0, pool 48',
      'six-at-the-table: 92 at par, climber turns away 52, cap 4, floor 0, pool 36',
      'seven-at-the-table: 152 at par, climber turns away 72, cap 22, floor 0, pool 58',
    ])
  })

  it('hands a player a copy, never the pool\'s own row', () => {
    // The pool is enumerated once and kept for the life of the page, and every
    // deal after this one, every cross-check and every test reads out of it.
    // A player who was handed one of its rows could write through it — nothing
    // does today, but nothing would see it happen either.
    for (const level of levels) {
      const pool = dealsFor(level.config)
      const state = start(level, 3)
      expect(pool.some((seats) => seats === state.seats)).toBe(false)
      expect(pool.map(seatKey)).toContain(seatKey(state.seats))
      const before = pool.map(seatKey)
      state.seats.reverse()
      expect(pool.map(seatKey)).toEqual(before)
    }
  })

  it('builds a table it has never seen inside 300ms, and deals from a built one at once', () => {
    for (const level of levels) {
      // A fresh object, so the kept table and pool are missed and the whole
      // cost — every seating, the walk out from the good ones, and all three
      // gates — is paid again here.
      const cold: TableConfig = { ...level.config, guests: [...level.config.guests] }
      const built = performance.now()
      expect(dealsFor(cold).length).toBe(dealsFor(level.config).length)
      expect(performance.now() - built).toBeLessThan(300)

      const dealt = performance.now()
      start(level, 7)
      expect(performance.now() - dealt).toBeLessThan(20)
    }
  })
})

/* ============================================================
   Par

   The whole seating graph, walked by the shared breadth-first
   search, with nothing of this puzzle's own in it but the
   rules.
   ============================================================ */

describe('par', () => {
  for (const level of levels) {
    const { config } = level

    it(`"${level.label}" is ${level.par} swaps for every deal in the pool`, () => {
      for (const seats of dealsFor(config)) {
        const path = shortest(config, seats)
        expect(path).not.toBeNull()
        expect(`${readRow(config, seats)}: ${(path as number[]).length}`).toBe(
          `${readRow(config, seats)}: ${level.par}`,
        )
      }
    })

    it(`"${level.label}" plays that run through the engine and comes out solved`, () => {
      for (const seed of SEEDS.slice(0, 8)) {
        let state = start(level, seed)
        const path = shortest(config, state.seats) as number[]
        for (const seam of path) {
          expect(isSolved(state)).toBe(false)
          expect(failure(state)).toBeNull()
          const next = reduce(state, { type: 'swap', seam })
          expect(next).not.toBe(state)
          state = next
        }
        expect(isSolved(state)).toBe(true)
        expect(failure(state)).toBeNull()
        expect(state.used).toBe(level.par)
        expect(swapsLeft(state)).toBe(0)
      }
    })

    it(`"${level.label}" agrees with its own distance table`, () => {
      const dist = distanceTable(config)
      expect(dist.size).toBe(everySeating(config.guests.length).length)
      for (const seats of dealsFor(config).slice(0, 6)) {
        expect(dist.get(seatKey(seats))).toBe((shortest(config, seats) as number[]).length)
      }
    })
  }
})

/* ============================================================
   Moves that change nothing

   The one signal the shell has that a tap did nothing is the
   same object coming back.
   ============================================================ */

describe('a swap that cannot happen', () => {
  const level = levels[2]
  const state = start(level, 3)

  it('hands back the very same state for a gap that is not there', () => {
    for (const seam of [-1, -0.5, 1.5, NaN, state.seats.length - 1, state.seats.length, 99]) {
      expect(reduce(state, { type: 'swap', seam })).toBe(state)
      expect(canSwap(state, seam)).toBe(false)
    }
  })

  it('hands back the very same state for an action it does not have', () => {
    expect(reduce(state, { type: 'sit' } as unknown as Parameters<typeof reduce>[1])).toBe(state)
    expect(reduce(state, undefined as unknown as Parameters<typeof reduce>[1])).toBe(state)
  })

  it('hands back the very same state once the swaps are spent', () => {
    const spent: TableState = { ...state, used: state.cfg.swaps }
    expect(swapsLeft(spent)).toBe(0)
    expect(legalMoves(spent)).toEqual([])
    for (const seam of everySeam(spent.seats)) {
      expect(canSwap(spent, seam)).toBe(false)
      expect(reduce(spent, { type: 'swap', seam })).toBe(spent)
    }
  })

  it('takes every real gap while a swap is left, whoever is sitting there', () => {
    for (const seam of everySeam(state.seats)) {
      expect(canSwap(state, seam)).toBe(true)
      const next = reduce(state, { type: 'swap', seam })
      expect(next).not.toBe(state)
      expect(next.used).toBe(1)
      expect(next.seats).toEqual(swapSeats(state.seats, seam))
    }
  })
})

/* ============================================================
   The dead end

   It fires when the swaps are spent and the row is still
   wrong, and it says nothing before then. `legalMoves` is
   empty at exactly that moment, so it is frog-leap's `STUCK`
   written for a budget.

   The rule this replaced fired the instant the row could no
   longer be put right with what was left — which, since a
   level hands out exactly par, is the instant a swap goes the
   wrong way. What that gave away and what this costs instead
   are both measured at the bottom of this file.
   ============================================================ */

describe('the dead end', () => {
  for (const level of levels) {
    const { config } = level

    it(`"${level.label}" says so exactly when the swaps are spent and the row is wrong`, () => {
      for (const seed of SEEDS.slice(0, 3)) {
        for (const state of everyPosition(start(level, seed))) {
          const at = `${readRow(config, state.seats)}/${state.used}`
          const spent = swapsLeft(state) === 0 && !isSolved(state)
          expect(`${at}: ${failure(state) ?? 'playing on'}`).toBe(
            `${at}: ${spent ? OUT_OF_SWAPS : 'playing on'}`,
          )
          // Which is frog-leap's dead end in the same words: nothing left to
          // do, and the puzzle not done.
          const stuck = legalMoves(state).length === 0 && !isSolved(state)
          expect(`${at}: ${failure(state) !== null}`).toBe(`${at}: ${stuck}`)
        }
      }
    })

    it(`"${level.label}" says nothing about a swap that does not shorten the way`, () => {
      // The rule this replaced ended the level here, on the first tap. Both
      // kinds of tap are always on the table — a deal with no wrong turn would
      // not be a puzzle, and one with no right turn would not be solvable —
      // and the board now answers neither of them.
      for (const seed of SEEDS.slice(0, 6)) {
        const state = start(level, seed)
        let wasted = 0
        let kept = 0
        for (const seam of everySeam(state.seats)) {
          const next = reduce(state, { type: 'swap', seam })
          expect(`${readRow(config, next.seats)}: ${failure(next)}`).toBe(
            `${readRow(config, next.seats)}: null`,
          )
          if (swapsToGo(config, next.seats) < swapsToGo(config, state.seats)) kept++
          else wasted++
        }
        expect(kept).toBeGreaterThan(0)
        expect(wasted).toBeGreaterThan(0)
      }
    })

    it(`"${level.label}" says only what is true of the position it fires on`, () => {
      // Both halves of the sentence, at every position it is said at: every
      // swap used, and two who cannot sit next to each other still next to
      // each other. It claims nothing about which swap lost the level, which
      // is the thing the eager rule gave away after every tap.
      let fired = 0
      for (const seed of SEEDS.slice(0, 3)) {
        for (const state of everyPosition(start(level, seed))) {
          if (failure(state) === null) continue
          fired++
          expect(`${readRow(config, state.seats)}: ${state.used} used`).toBe(
            `${readRow(config, state.seats)}: ${config.swaps} used`,
          )
          expect(quarrelSeams(config, state.seats).length).toBeGreaterThan(0)
        }
      }
      expect(fired).toBeGreaterThan(0)
    })

    it(`"${level.label}" stays quiet in a row that cannot be saved, which is the price`, () => {
      // What the late rule costs, counted rather than argued about.
      // `canStillFinish` looks for a finishing run by looking, with none of
      // this puzzle's distance table in it, so it is an outside opinion on
      // whether a position is already lost.
      const memo = new Map<string, boolean>()
      let doomed = 0
      let longest = 0
      for (const seed of SEEDS.slice(0, 3)) {
        for (const state of everyPosition(start(level, seed))) {
          if (isSolved(state) || failure(state) !== null) continue
          if (canStillFinish(config, state.seats, swapsLeft(state), memo)) continue
          doomed++
          longest = Math.max(longest, swapsLeft(state))
        }
      }
      // Positions like that are real and the board says nothing at any of
      // them; the most taps a child can spend in one is par less the swap
      // that lost it, because the deal itself is always winnable.
      expect(doomed).toBeGreaterThan(0)
      expect(`${level.id}: ${longest} taps of silence`).toBe(
        `${level.id}: ${config.swaps - 1} taps of silence`,
      )
    })

    it(`"${level.label}" hands the board the pair it is about, and nobody else`, () => {
      // What the clay is drawn from. The sentence says two who cannot sit next
      // to each other are still next to each other; this is who they are, and
      // the board never works it out a second time.
      let named = 0
      for (const seed of SEEDS.slice(0, 3)) {
        for (const state of everyPosition(start(level, seed))) {
          const dead = failureOf(state)
          if (failure(state) === null) {
            expect(dead).toBeNull()
            continue
          }
          named++
          const seams = quarrelSeams(config, state.seats)
          expect(dead?.message).toBe(OUT_OF_SWAPS)
          expect(dead?.seams).toEqual(seams)
          // Everybody sitting either side of one of those gaps, each named
          // once however many of the pairs they are in.
          const both = new Set<string>()
          for (const seam of seams) {
            both.add(config.guests[state.seats[seam]].id)
            both.add(config.guests[state.seats[seam + 1]].id)
          }
          expect([...(dead?.blamed ?? [])].sort()).toEqual([...both].sort())
          expect(dead?.blamed.length).toBeGreaterThan(1)
        }
      }
      expect(named).toBeGreaterThan(0)
    })

    it(`"${level.label}" never says so at a table nobody has touched`, () => {
      for (const seats of dealsFor(config)) {
        expect(failure({ cfg: config, seats, used: 0 })).toBeNull()
      }
    })

    it(`"${level.label}" says nothing once everybody is seated, even with no swaps left`, () => {
      for (const seed of SEEDS.slice(0, 4)) {
        let state = start(level, seed)
        for (const seam of shortest(config, state.seats) as number[]) {
          state = reduce(state, { type: 'swap', seam })
        }
        expect(isSolved(state)).toBe(true)
        expect(swapsLeft(state)).toBe(0)
        expect(failure(state)).toBeNull()
      }
    })
  }
})

/* ============================================================
   The way back out

   The swaps run out several taps after the one that lost the
   level, so the position one move back is usually lost as
   well: Step back has to go further than one move or it is a
   button that ends the level again. The shell walks back
   through the positions a player has already been in and stops
   at the last one `canStillWin` says a win is still reachable
   from.

   What follows holds that answer to an outside opinion —
   `canStillFinish`, which looks for a finishing run and has
   none of this puzzle's distance table in it — and then plays
   the shell's own rule out over every way of tapping a deal.
   ============================================================ */

describe('the way back out', () => {
  for (const level of levels) {
    const { config } = level

    it(`"${level.label}" says a row can still be saved exactly when it can`, () => {
      const memo = new Map<string, boolean>()
      let alive = 0
      let lost = 0
      for (const seed of SEEDS.slice(0, 3)) {
        for (const state of everyPosition(start(level, seed))) {
          const looked = canStillFinish(config, state.seats, swapsLeft(state), memo)
          const row = `${readRow(config, state.seats)}, ${swapsLeft(state)} left`
          expect(`${row}: ${canStillWin(state)}`).toBe(`${row}: ${looked}`)
          if (looked) alive++
          else lost++
        }
      }
      // Both kinds are really there, so neither half of that is vacuous.
      expect(alive).toBeGreaterThan(0)
      expect(lost).toBeGreaterThan(0)
    })

    it(`"${level.label}" opens on a row that can be saved, on 40 seeds`, () => {
      // Where this ever failed there would be no way back out at all: the
      // walk back would run off the start of the level.
      for (const seed of SEEDS) expect(canStillWin(start(level, seed))).toBe(true)
      for (const seats of dealsFor(config)) {
        expect(canStillWin({ cfg: config, seats, used: 0 })).toBe(true)
      }
    })

    it(`"${level.label}" lands one press on a row a win is still reachable from`, () => {
      // The shell's rule, played out over every one of the
      // (seats - 1) ^ swaps ways of tapping the deal: where the swaps ran out
      // on a row that is still wrong, walk back the way PuzzlePage.tsx walks
      // back and check where it stops. Every losing run is followed, so this
      // is the promise under the notice — "nothing is lost" — rather than a
      // sample of it.
      const memo = new Map<string, boolean>()
      let ends = 0
      let further = 0
      let landedLost = 0
      let skippedWinnable = 0
      for (const seats of dealsFor(config)) {
        const run: TableState[] = [{ cfg: config, seats: seats.slice(), used: 0 }]
        const walk = () => {
          const here = run[run.length - 1]
          if (isSolved(here)) return
          if (failure(here) !== null) {
            ends++
            let back = run.length - 2
            while (back > 0 && !canStillWin(run[back])) back--
            // Where it stops really can be finished, by an opinion that knows
            // nothing of this puzzle's distance table.
            if (!canStillFinish(config, run[back].seats, swapsLeft(run[back]), memo)) landedLost++
            // And one press is the whole way back: everything the run did
            // after that position was already lost, so there is nothing
            // between where it stops and where it ended worth stopping at.
            for (let i = back + 1; i < run.length; i++) {
              if (canStillFinish(config, run[i].seats, swapsLeft(run[i]), memo)) skippedWinnable++
            }
            if (run.length - 2 > back) further++
            return
          }
          for (const move of legalMoves(here)) {
            run.push(reduce(here, move))
            walk()
            run.pop()
          }
        }
        walk()
      }
      // Counted rather than asserted a run at a time: the third level walks
      // 7776 runs a deal, and an expectation inside that loop is minutes.
      expect(`${level.id}: ${landedLost} lost landings, ${skippedWinnable} skipped`).toBe(
        `${level.id}: 0 lost landings, 0 skipped`,
      )
      expect(ends).toBeGreaterThan(0)
      // And it is not one move back dressed up: most of those dead ends are
      // further back than the move that ended them.
      expect(further).toBeGreaterThan(ends / 2)
    })
  }
})

/* ============================================================
   Why the board does not light the quarrels

   Two facts, and between them they are the design of this
   board. Swapping two who cannot sit next to each other leaves
   them next to each other, so a lit seam is the one gap tapping
   cannot fix and
   a board that lit them would be pointing at the wrong tap.
   And a climber who counts the pairs still together and always
   makes the swap that leaves the fewest — the one thing a lit
   board really would hand a player — never gets home on the
   two levels that are dealt against it.
   ============================================================ */

describe('a lit seam would be a trap', () => {
  for (const level of levels) {
    const { config } = level
    const n = config.guests.length

    it(`"${level.label}" never parts two who quarrel by swapping them`, () => {
      for (const seats of everySeating(n)) {
        for (const seam of quarrelSeams(config, seats)) {
          const after = swapSeats(seats, seam)
          // The same two, in the same gap, the other way round.
          expect(after[seam]).toBe(seats[seam + 1])
          expect(after[seam + 1]).toBe(seats[seam])
          expect(quarrelSeams(config, after)).toContain(seam)
          expect(isGoodSeating(config, after)).toBe(false)
        }
      }
    })

    it(`"${level.label}" cannot be finished by tapping lit seams at all`, () => {
      // A seating that works has no lit seam to tap, so it has no way out; the
      // check is that it has no way *in* either. Every swap of a lit seam
      // lands on a seating that is still wrong — proved just above, over the
      // whole graph — so no run of lit-seam taps, however long, ever seats
      // anybody.
      const arrivals = everySeating(n).flatMap((seats) =>
        quarrelSeams(config, seats)
          .map((seam) => swapSeats(seats, seam))
          .filter((after) => isGoodSeating(config, after)),
      )
      expect(arrivals).toEqual([])
    })
  }

  it('walks the climber the same with a plain memo as with no memo at all', () => {
    // `climberGetsHome` keeps what it has already worked out under a key of
    // the row and the swaps left. The swaps left fall by one at every step, so
    // a key cannot be reached again while its own walk is still open, and the
    // memo needs no guard against that. The proof is the same walk written out
    // with nothing kept, over every seating of all three tables.
    const bare = (cfg: TableConfig, seats: readonly number[], left: number): boolean => {
      if (isGoodSeating(cfg, seats)) return true
      if (left === 0) return false
      const tried = everySeam(seats).map((seam) => swapSeats(seats, seam))
      const fewest = Math.min(...tried.map((row) => quarrelSeams(cfg, row).length))
      return tried.some(
        (row) => quarrelSeams(cfg, row).length === fewest && bare(cfg, row, left - 1),
      )
    }
    for (const level of levels) {
      const { config } = level
      const off = everySeating(config.guests.length).filter(
        (seats) =>
          climberGetsHome(config, seats, config.swaps) !== bare(config, seats, config.swaps),
      )
      expect(off.map((seats) => readRow(config, seats))).toEqual([])
    }
  })

  it('is dealt against on the two levels that claim it, and never claimed falsely', () => {
    const climbed = levels.map((level) => {
      const at = everySeating(level.config.guests.length).filter(
        (seats) => swapsToGo(level.config, seats) === level.config.swaps,
      )
      const home = at.filter((seats) => climberGetsHome(level.config, seats, level.config.swaps))
      return { total: at.length, home: home.length, proof: level.config.climberProof }
    })
    // The climber does get home on plenty of seatings at par: this is a real
    // gate, not one that passes because there was nothing to keep out.
    for (const row of climbed) expect(row.home).toBeGreaterThan(0)
    expect(climbed.map((r) => r.proof)).toEqual([false, true, true])
    // How much of each level's seatings at par it can walk home: three in
    // four of the five-seat ones, and about half of the other two, which is
    // what the gate on levels two and three is keeping out.
    expect(climbed.map((r) => Math.round((100 * r.home) / r.total))).toEqual([75, 57, 47])
  })
})

/* ============================================================
   The ramp

   Not the number of seats and not par: how many of the ways of
   tapping the swaps out with no thought at all end with
   everybody seated. Every deal on a level is stiffer than
   every deal on the level before it — and that is two gates
   and not one. A cap bounds the *easiest* deal on a level; the
   claim also needs a bound on the *hardest* deal on the level
   before, which is what `floor` is. The three tests below are
   the claim off the configs, the claim off the pools the gates
   build, and how much room the tightest of the two boundaries
   has.
   ============================================================ */

describe('the ramp', () => {
  const ways = (level: PuzzleLevel<TableConfig>) =>
    Math.pow(level.config.guests.length - 1, level.config.swaps)
  const lines = levels.map((level) =>
    dealsFor(level.config).map((seats) => luckyLines(level.config, seats, level.config.swaps)),
  )

  it('is 1 to 2 of 64, then 2 to 6 of 625, then 4 to 24 of 7776', () => {
    const span = lines.map(
      (rows, i) => `${Math.min(...rows)} to ${Math.max(...rows)} of ${ways(levels[i])}`,
    )
    expect(span).toEqual(['1 to 2 of 64', '2 to 6 of 625', '4 to 24 of 7776'])
    // Both ends of every span are the config's own two numbers, so nothing
    // here is a measurement that happened to land where the comment says.
    expect(lines.map((rows) => Math.max(...rows))).toEqual(levels.map((l) => l.config.lucky))
    expect(lines.map((rows) => Math.min(...rows))).toEqual(levels.map((l) => l.config.floor))
  })

  it('reads off the configs alone: cap here under floor there', () => {
    for (let i = 1; i < levels.length; i++) {
      const easiest = levels[i].config.lucky / ways(levels[i])
      const hardest = levels[i - 1].config.floor / ways(levels[i - 1])
      expect(`${levels[i].id}: ${easiest < hardest}`).toBe(`${levels[i].id}: true`)
    }
  })

  it('and the pools the gates build agree, deal by deal', () => {
    for (let i = 1; i < lines.length; i++) {
      const easiest = Math.max(...lines[i]) / ways(levels[i])
      const hardest = Math.min(...lines[i - 1]) / ways(levels[i - 1])
      expect(`${levels[i].id}: ${easiest < hardest}`).toBe(`${levels[i].id}: true`)
    }
  })

  it('has 39% of room at the first boundary and 3.5% at the second', () => {
    // How much room each boundary really has, because "it holds" and "it
    // holds comfortably" are different facts and only one of them is true
    // here. Raising the third level's cap by one would break it.
    const room = []
    for (let i = 1; i < levels.length; i++) {
      const easiest = levels[i].config.lucky / ways(levels[i])
      const hardest = levels[i - 1].config.floor / ways(levels[i - 1])
      room.push(Math.round((10000 * (hardest - easiest)) / hardest) / 100)
    }
    expect(room).toEqual([38.56, 3.55])
    expect(25 / ways(levels[2])).toBeGreaterThan(levels[1].config.floor / ways(levels[1]))
  })
})

/* ============================================================
   What the puzzle says
   ============================================================ */

describe('the words', () => {
  it('says what it is in one plain line, and how to play in four', () => {
    expect(longTable.title).toBe('The long table')
    expect(longTable.id).toBe('long-table')
    expect(longTable.tagline.length).toBeLessThanOrEqual(100)
    expect(longTable.instructions.length).toBeLessThanOrEqual(4)
    for (const line of longTable.instructions) expect(line.length).toBeLessThanOrEqual(80)
    // The way to undo a swap is a swap, and the way out of one is Step back:
    // both are in the four lines.
    expect(longTable.instructions.join(' ')).toMatch(/step back/i)
    expect(longTable.reseedable).toBe(true)
  })

  it('answers a dead end with what happened and then what it means', () => {
    // docs/DESIGN.md, Words: say what happened and what to do. The shell adds
    // the way out — "Nothing is lost. Go back one move and try another way." —
    // so the message owes the other two, in that order, and balance-scales'
    // 'You have used every weighing. More than one ball could still be the
    // heavy one.' is the same shape, for the same reason: a budget that ran
    // out, and then what is still wrong with the board.
    //
    // Both halves are true of the position at the moment it is said, and "the
    // dead end" above holds them to that at every position a player can reach.
    // Neither half says which swap lost the level, because a board that knew
    // that would have had to say it after every tap.
    const [what, means] = OUT_OF_SWAPS.split(/(?<=\.) /)
    expect(what).toBe('You have used every swap.')
    expect(means).toBe(
      'Two animals who cannot sit next to each other are still next to each other.',
    )
    expect(OUT_OF_SWAPS.length).toBeLessThanOrEqual(110)
  })

  it('calls the one relation by one name, everywhere a child can read it', () => {
    // The puzzle used to say "do not get on", "cannot sit together", "side by
    // side" and "sit next to" for the single relation it is about — two of
    // them inside the first sentence a child meets. It is one relation, so it
    // gets one name, and the name is the roster's and the aria-labels':
    // "sit next to".
    const said = [
      longTable.tagline,
      ...longTable.instructions,
      ...levels.flatMap((level) => level.hints),
      OUT_OF_SWAPS,
    ]
    const dropped = [
      /side by side/i,
      /sit(ting)? together/i,
      /\bgets? on\b/i,
      /\bsit by\b/i,
      /\bbeside\b/i,
    ]
    for (const line of said) {
      for (const gone of dropped) {
        expect(`${gone.source}: ${line}`).toBe(`${gone.source}: ${line.replace(gone, '<<>>')}`)
      }
    }
    // And named rather than dodged: every line that is about who may sit
    // where says it in those words.
    expect(said.filter((line) => /next to/i.test(line)).length).toBeGreaterThanOrEqual(12)
  })

  it('gives three hints a level, short ones, and never a seat number', () => {
    for (const level of levels) {
      expect(level.label.length).toBeLessThanOrEqual(24)
      expect(level.hints).toHaveLength(3)
      for (const hint of level.hints) {
        expect(hint.length).toBeGreaterThan(20)
        expect(hint.length).toBeLessThanOrEqual(110)
        expect(hint).not.toMatch(/seat \d|gap \d|tap the \w+ gap/i)
      }
    }
  })

  it('spends no hint on the swap budget, which the page already states twice', () => {
    // The rule of the level — you have exactly this many swaps — is in the
    // how-to-play drawer and again in the counter under the board, and a hint
    // that says it a third time costs a child one of their three nudges and
    // tells them nothing about the table in front of them. A hint is about the
    // seating or about the move; the budget is neither.
    for (const level of levels) {
      for (const hint of level.hints) {
        expect(`${level.id}: ${hint}`).toBe(`${level.id}: ${hint.replace(/\bswaps?\b/i, '')}`)
      }
    }
  })

  it('names only animals who are actually at that table', () => {
    const everybody = levels[2].config.guests.map((g) => g.label.toLowerCase())
    for (const level of levels) {
      const here = new Set(level.config.guests.map((g) => g.label.toLowerCase()))
      const said = `${level.hints.join(' ')}`.toLowerCase()
      for (const animal of everybody) {
        if (here.has(animal)) continue
        expect(`${level.id} says ${animal}: ${said.includes(animal)}`).toBe(
          `${level.id} says ${animal}: false`,
        )
      }
    }
  })
})

describe('the hints tell the truth', () => {
  it('level one: only the horse can sit next to the wolf', () => {
    const { config } = levels[0]
    expect(quarrelsWith(config, 'wolf')).toEqual(['goat', 'mouse', 'rabbit'])
    const friends = idsAt(config).filter(
      (id) => id !== 'wolf' && !quarrelsWith(config, 'wolf').includes(id),
    )
    expect(friends).toEqual(['horse'])
    expect(levels[0].hints[1]).toContain('Only the horse can sit next to the wolf')
  })

  it('level one: so the wolf ends up at an end, with the horse beside it', () => {
    const { config } = levels[0]
    const wolf = idsAt(config).indexOf('wolf')
    const horse = idsAt(config).indexOf('horse')
    const good = everySeating(config.guests.length).filter((seats) => isGoodSeating(config, seats))
    expect(good.length).toBeGreaterThan(0)
    for (const seats of good) {
      const at = seats.indexOf(wolf)
      expect(at === 0 || at === seats.length - 1).toBe(true)
      expect(seats[at === 0 ? 1 : at - 1]).toBe(horse)
    }
    expect(levels[0].hints[2]).toContain('one end of the table')
  })

  it('level two: nothing above the table keeps the wolf and the cat apart', () => {
    // The first hint's claim, held to the same standard as the last one: the
    // pair is not on the roster, and every deal has a shortest run that ends
    // with those two next to each other.
    const { config } = levels[1]
    expect(quarrelsWith(config, 'wolf')).not.toContain('cat')
    const wolf = idsAt(config).indexOf('wolf')
    const cat = idsAt(config).indexOf('cat')
    for (const seats of dealsFor(config)) {
      const ends = parFinishes(config, seats)
      expect(ends.length).toBeGreaterThan(0)
      for (const row of ends) expect(isGoodSeating(config, row)).toBe(true)
      const sat = ends.some((row) => Math.abs(row.indexOf(wolf) - row.indexOf(cat)) === 1)
      expect(`${readRow(config, seats)}: ${sat}`).toBe(`${readRow(config, seats)}: true`)
    }
    expect(levels[1].hints[0]).toContain('they can sit next to each other')
  })

  it('level two: where the wolf already sits by the cat, no shortest run parts them', () => {
    // Twelve of the 36 deals open with those two already next to each other, and
    // those are the deals where that first hint earns its place rather than
    // wasting itself. A child arrives from level one holding "only the horse
    // can sit next to the wolf", sees a wolf sitting next to a cat, and reads
    // it as the thing to put right. It is not: every shortest run out of all
    // twelve of those deals still has the wolf beside the cat at the end of
    // it, so the swap that belief asks for is the one swap the level will not
    // pay for. The hint is a licence, and a licence is worth most where the
    // thing it allows is already on the table.
    const { config } = levels[1]
    const ids = idsAt(config)
    const wolf = ids.indexOf('wolf')
    const cat = ids.indexOf('cat')
    const together = (row: readonly number[]) =>
      Math.abs(row.indexOf(wolf) - row.indexOf(cat)) === 1
    const already = dealsFor(config).filter(together)
    expect(`${already.length} of ${dealsFor(config).length} deals`).toBe('12 of 36 deals')
    for (const seats of already) {
      const parted = parFinishes(config, seats).filter((row) => !together(row))
      expect(`${readRow(config, seats)}: ${parted.length}`).toBe(`${readRow(config, seats)}: 0`)
    }
  })

  it('level two: the wolf can only sit next to the horse or the cat', () => {
    const { config } = levels[1]
    const friends = idsAt(config).filter(
      (id) => id !== 'wolf' && !quarrelsWith(config, 'wolf').includes(id),
    )
    expect(friends.sort()).toEqual(['cat', 'horse'])
  })

  it('level two: the mouse and the rabbit may sit together, and are wanted by the same two', () => {
    const { config } = levels[1]
    expect(quarrelsWith(config, 'mouse')).toEqual(['cat', 'wolf'])
    expect(quarrelsWith(config, 'rabbit')).toEqual(['cat', 'wolf'])
    const grid = quarrelGrid(config)
    const mouse = idsAt(config).indexOf('mouse')
    const rabbit = idsAt(config).indexOf('rabbit')
    expect(grid[mouse][rabbit]).toBe(false)
  })

  it('level three: three of them chase the rabbit, and it is the hardest to seat', () => {
    const { config } = levels[2]
    expect(quarrelsWith(config, 'rabbit')).toEqual(['cat', 'dog', 'wolf'])
    const most = Math.max(...idsAt(config).map((id) => quarrelsWith(config, id).length))
    expect(quarrelsWith(config, 'rabbit').length).toBe(most)
    const friends = idsAt(config).filter(
      (id) => id !== 'rabbit' && !quarrelsWith(config, 'rabbit').includes(id),
    )
    expect(friends.sort()).toEqual(['goat', 'horse', 'mouse'])
    // The first hint's own count, and it is the fewest anybody at this table
    // has: three of the six others will sit next to the rabbit.
    expect(levels[2].hints[0]).toContain('Only three animals can sit next to the rabbit')
    const fewest = Math.min(
      ...idsAt(config).map((id) => idsAt(config).length - 1 - quarrelsWith(config, id).length),
    )
    expect(`${friends.length} of ${idsAt(config).length - 1}`).toBe(`${fewest} of 6`)
  })

  it('the horse minds nobody, on every level', () => {
    for (const level of levels) expect(quarrelsWith(level.config, 'horse')).toEqual([])
  })

  it('level three: the cat is sitting next to trouble, on every deal', () => {
    // The last hint of the hardest level is the one a stuck child reaches for,
    // so it has to have work in it *here*: on the deal in front of them, not
    // somewhere in the 5040 seatings. This one reads out who will have the cat
    // beside them, and the cat is the one guest at this table who is sitting
    // next to somebody it cannot sit next to on every single deal — so the
    // hint always names a pair the child can see from where they are.
    const { config } = levels[2]
    const ids = idsAt(config)
    const cat = ids.indexOf('cat')
    // The hint's own fact first, and in the order the hint says it: the wolf,
    // the goat and the horse are the whole of who the cat may sit beside.
    expect(quarrelsWith(config, 'cat')).toEqual(['dog', 'mouse', 'rabbit'])
    const friends = ids.filter((id) => id !== 'cat' && !quarrelsWith(config, 'cat').includes(id))
    expect(friends).toEqual(['wolf', 'goat', 'horse'])
    for (const seats of dealsFor(config)) {
      const sat = quarrelSeams(config, seats).some(
        (seam) => seats[seam] === cat || seats[seam + 1] === cat,
      )
      expect(`${readRow(config, seats)}: ${sat}`).toBe(`${readRow(config, seats)}: true`)
    }
    expect(levels[2].hints[2]).toContain('can only sit next to the wolf, the goat or the horse')
  })

  it('and that check has teeth: the two wordings it replaced both fail it', () => {
    // Two hints have stood in that slot and neither of them held.
    //
    // The first said "sit the horse between two who cannot sit next to each
    // other", and it was checked against the whole graph: whichever
    // quarrelling pair a child picked, some finished table did sit the horse
    // between those two. That is still true and it is the first half of this
    // test. It was also not the question. On 22 of the 58 deals no shortest run
    // out of the deal ends with the horse between two who quarrel, so a child
    // who followed the hint spent a swap that could not be bought back, and
    // the level was already lost by the time the board said so.
    //
    // The second said "sit the mouse and the rabbit next to each other", and it
    // passed that check — every deal does have a shortest run ending with those
    // two together. It failed the other way round: on 26 of the 58 deals they
    // are already next to each other when the board opens, so the last nudge of
    // the hardest level asked a stuck child for a thing the deal had already
    // done.
    // Both counts are kept here, because a hint that tells a child to arrange
    // somebody has to clear both of them: reachable from this deal, and not
    // already true of it.
    const { config } = levels[2]
    const ids = idsAt(config)
    const horse = ids.indexOf('horse')
    const grid = quarrelGrid(config)
    const between = (row: readonly number[]) => {
      const at = row.indexOf(horse)
      return at > 0 && at < row.length - 1 && grid[row[at - 1]][row[at + 1]]
    }
    const good = everySeating(config.guests.length).filter((seats) => isGoodSeating(config, seats))
    for (const { a, b } of config.quarrels) {
      const one = ids.indexOf(a)
      const two = ids.indexOf(b)
      const sat = good.some((row) => {
        const at = row.indexOf(horse)
        return between(row) && [one, two].every((who) => Math.abs(row.indexOf(who) - at) === 1)
      })
      expect(`${a} horse ${b}: ${sat}`).toBe(`${a} horse ${b}: true`)
    }
    const beyond = dealsFor(config).filter((seats) => !parFinishes(config, seats).some(between))
    expect(`${beyond.length} of ${dealsFor(config).length} deals`).toBe('22 of 58 deals')
    const mouse = ids.indexOf('mouse')
    const rabbit = ids.indexOf('rabbit')
    const paired = (row: readonly number[]) =>
      Math.abs(row.indexOf(mouse) - row.indexOf(rabbit)) === 1
    const done = dealsFor(config).filter(paired)
    expect(`${done.length} of ${dealsFor(config).length} deals`).toBe('26 of 58 deals')
  })

  it('level three: the first hint asks for a plan, not a first swap', () => {
    // The standard this file holds the *last* hint of this level to, applied
    // to the first one: a hint that tells a child to arrange somebody has to
    // clear both halves — reachable from this deal, and not already true of
    // it. The wording this replaced, "Find the rabbit a seat first", failed
    // the second half on four of the 58 deals, where the rabbit is already
    // sitting next to nobody who chases it. And on those four it was worse
    // than wasted: not one of the swaps that shorten the way moves the rabbit,
    // so a child who read it as a first tap lost the level on the first tap
    // and played out the rest of the budget before hearing about it.
    //
    // Deciding where the rabbit goes is work on all 58 — it is a decision, not
    // a swap, and the deal cannot have made it already — so the hint is held
    // here to the fact it states instead, which is true of the whole table.
    const { config } = levels[2]
    const ids = idsAt(config)
    const rabbit = ids.indexOf('rabbit')
    expect(quarrelsWith(config, 'rabbit')).toEqual(['cat', 'dog', 'wolf'])
    const settled = dealsFor(config).filter(
      (seats) =>
        !quarrelSeams(config, seats).some(
          (seam) => seats[seam] === rabbit || seats[seam + 1] === rabbit,
        ),
    )
    expect(`${settled.length} of ${dealsFor(config).length} deals`).toBe('4 of 58 deals')
    for (const seats of settled) {
      const shortening = everySeam(seats).filter(
        (seam) => swapsToGo(config, swapSeats(seats, seam)) === config.swaps - 1,
      )
      expect(shortening.length).toBeGreaterThan(0)
      const moves = shortening.filter(
        (seam) => seats[seam] === rabbit || seats[seam + 1] === rabbit,
      )
      expect(`${readRow(config, seats)}: ${moves.length}`).toBe(`${readRow(config, seats)}: 0`)
    }
    expect(levels[2].hints[0]).toContain('Decide where the rabbit will sit')
  })

  it('level two: the hint that does tell a child to seat somebody clears both halves', () => {
    // "Start by finding the wolf a seat" is the other hint in this puzzle that
    // tells a child to arrange somebody, so it is held to the same two things
    // rather than only its neighbour being held to them. Reachable: every
    // shortest run ends on a good seating, and a good seating is one where the
    // wolf is seated. Not already true: the wolf is sitting next to somebody
    // it cannot sit next to on every deal this level has, so the nudge always
    // points at something the child can still do.
    const { config } = levels[1]
    const wolf = idsAt(config).indexOf('wolf')
    const settled = dealsFor(config).filter(
      (seats) =>
        !quarrelSeams(config, seats).some(
          (seam) => seats[seam] === wolf || seats[seam + 1] === wolf,
        ),
    )
    expect(`${settled.length} of ${dealsFor(config).length} deals`).toBe('0 of 36 deals')
    for (const seats of dealsFor(config)) {
      for (const row of parFinishes(config, seats)) expect(isGoodSeating(config, row)).toBe(true)
    }
    expect(levels[1].hints[1]).toContain('Start by finding the wolf a seat')
  })

  it('every level: there is a pair sitting together to find, on every deal', () => {
    for (const level of levels) {
      for (const seats of dealsFor(level.config)) {
        expect(quarrelSeams(level.config, seats).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('the move tape', () => {
  it('says who changed places', () => {
    const level = levels[0]
    const state = start(level, 5)
    const next = reduce(state, { type: 'swap', seam: 1 })
    const one = nameFor(level.config.guests[state.seats[1]])
    const two = nameFor(level.config.guests[state.seats[2]])
    expect(describeMove(state, next, { type: 'swap', seam: 1 })).toBe(`Swapped ${one} and ${two}`)
  })

  it('says nothing about a gap that is not there', () => {
    const level = levels[0]
    const state = start(level, 5)
    expect(describeMove(state, state, { type: 'swap', seam: 99 })).toBe('Swapped nobody')
  })
})

/* ============================================================
   The board
   ============================================================ */

describe('the long table — board', () => {
  afterEach(cleanup)

  const show = (state: TableState, locked = false) => {
    const dispatch = vi.fn()
    const view = render(createElement(longTable.engine.Board, { state, dispatch, locked }))
    return { dispatch, view }
  }
  const gaps = () => screen.getAllByRole('button')
  const level = levels[0]

  it('draws one gap between every two neighbours, each naming both of them', () => {
    const state = start(level, 11)
    show(state)
    const buttons = gaps()
    expect(buttons).toHaveLength(state.seats.length - 1)
    buttons.forEach((button, seam) => {
      const one = nameFor(state.cfg.guests[state.seats[seam]])
      const two = nameFor(state.cfg.guests[state.seats[seam + 1]])
      expect(button).toHaveAttribute('aria-label', `Swap ${one} and ${two}`)
    })
  })

  it('sends one swap for one tap', () => {
    const state = start(level, 12)
    const { dispatch } = show(state)
    fireEvent.click(gaps()[2])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'swap', seam: 2 })
  })

  it('says nothing about which pairs are sitting together', () => {
    // The one thing this board must never do. Every gap is drawn the same
    // whether the two either side of it quarrel or not, so the reading is the
    // child's: what is on the page is the roster above the table, which says
    // the same thing all the way through.
    const state = start(level, 13)
    show(state)
    const lit = quarrelSeams(state.cfg, state.seats)
    expect(lit.length).toBeGreaterThan(0)
    expect(lit.length).toBeLessThan(state.seats.length - 1)
    const looks = gaps().map((button) =>
      [...button.attributes]
        .filter((attr) => attr.name !== 'aria-label' && attr.name !== 'data-seam')
        .map((attr) => `${attr.name}=${attr.value}`)
        .sort()
        .join(' ')
        .concat(` ${button.innerHTML}`),
    )
    expect(new Set(looks).size).toBe(1)
    expect(document.body.querySelectorAll(`.${cues.flash}, .${cues.highlight}`)).toHaveLength(0)
    // And no animal is ringed, which is the same tell drawn behind the table.
    expect(document.body.querySelectorAll(`.${board.blamed}, .${board.stuckSeam}`)).toHaveLength(0)
  })

  it('and points at them the moment the swaps are gone', () => {
    // The other half of the same rule. The level is over, the sentence under
    // the board says two who cannot sit next to each other are still next to
    // each other, and a child who cannot find them in a row of seven is being
    // told a fact about a picture they cannot read. So the two are ringed and
    // the gap between them carries the roster's own mark.
    const state = start(levels[2], 21)
    let dead = state
    for (let i = 0; i < state.cfg.swaps; i++) dead = reduce(dead, { type: 'swap', seam: 0 })
    const named = failureOf(dead)
    expect(named?.seams.length).toBeGreaterThan(0)

    const { view } = show(dead, true)
    expect(view.container.querySelectorAll(`.${board.blamed}`)).toHaveLength(
      named?.blamed.length as number,
    )
    gaps().forEach((button, seam) => {
      const one = dead.cfg.guests[dead.seats[seam]]
      const two = dead.cfg.guests[dead.seats[seam + 1]]
      if (named?.seams.includes(seam)) {
        expect(button.className).toContain(board.stuckSeam)
        expect(button).toHaveAttribute(
          'aria-label',
          `The ${one.label.toLowerCase()} cannot sit next to the ${two.label.toLowerCase()}.`,
        )
      } else {
        expect(button.className).not.toContain(board.stuckSeam)
        expect(button).toHaveAttribute('aria-label', `Swap ${nameFor(one)} and ${nameFor(two)}`)
      }
    })

    // A screen reader hears the same thing, in the same words.
    const said = view.container.querySelector('[role="status"]')?.textContent ?? ''
    expect(said).toContain('No swaps left')
    for (const seam of named?.seams ?? []) {
      const one = dead.cfg.guests[dead.seats[seam]]
      const two = dead.cfg.guests[dead.seats[seam + 1]]
      expect(said).toContain(
        `The ${one.label.toLowerCase()} cannot sit next to the ${two.label.toLowerCase()}.`,
      )
    }

    // And the roster above the table is left alone. A quarrel card states a
    // rule that is simply true, and it says the same thing on the last tap as
    // on the first.
    for (const card of view.container.querySelectorAll('[role="img"]')) {
      expect(card.className).not.toContain(board.blamed)
    }
  })

  it('reads the row and the swaps left out for anyone who cannot see it', () => {
    const state = start(level, 14)
    const { view } = show(state)
    const said = view.container.querySelector('[role="status"]')?.textContent ?? ''
    for (const who of state.seats) expect(said).toContain(nameFor(state.cfg.guests[who]))
    expect(said).toContain('3 swaps left')
    expect(screen.getByText('3 swaps left')).toBeInTheDocument()
  })

  it('counts the swaps down, and says it in the singular when there is one', () => {
    const state = start(level, 15)
    const { view } = show({ ...state, used: 2 })
    expect(view.container.textContent).toContain('1 swap left')
  })

  it('states the quarrels as a standing fact, in words as well as pictures', () => {
    const state = start(levels[2], 16)
    const { view } = show(state)
    const cards = view.container.querySelectorAll('[role="img"]')
    expect(cards).toHaveLength(state.cfg.quarrels.length)
    expect(screen.getByLabelText('The wolf cannot sit next to the goat.')).toBeInTheDocument()
    expect(screen.getByLabelText('The dog cannot sit next to the rabbit.')).toBeInTheDocument()
  })

  it('says how a swap is made until one has been made, and then stops saying it', () => {
    // The board's one line is not a second copy of the how-to-play drawer: it
    // is a prompt about the position in front of the child, and the position
    // stops calling for it the moment a swap lands.
    const state = start(level, 22)
    const { view } = show(state)
    expect(view.container.textContent).toContain('Tap an arrow between two animals')

    const swapped = reduce(state, { type: 'swap', seam: 0 })
    view.rerender(
      createElement(longTable.engine.Board, { state: swapped, dispatch: vi.fn(), locked: false }),
    )
    expect(view.container.textContent).not.toContain('Tap an arrow')

    // A finished level says nothing there either; the shell has the news.
    view.rerender(
      createElement(longTable.engine.Board, { state, dispatch: vi.fn(), locked: true }),
    )
    expect(view.container.textContent).not.toContain('Tap an arrow')
  })

  it('keeps its gaps in the tab order when the level is over, and takes no taps', () => {
    const state = start(level, 17)
    const { dispatch } = show(state, true)
    for (const button of gaps()) {
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).not.toBeDisabled()
      fireEvent.click(button)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('walks the gaps with the arrow keys, and leaves every chord to the browser', () => {
    show(start(level, 18))
    const [first, second] = gaps()
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)

    fireEvent.keyDown(second, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(first)

    // The browser's own shortcuts stay the browser's.
    for (const chord of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      fireEvent.keyDown(first, { key: 'ArrowRight', ...chord })
      expect(document.activeElement).toBe(first)
    }
    // And the ends of the table are the ends of the table.
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(first)
  })

  it('flashes the counter when the last swap has been spent', () => {
    // The cue and the counter now say the same thing at the same moment: the
    // sentence under the board is that every swap has gone, and the number it
    // is pointing at reads "No swaps left". Under the rule this replaced the
    // cue landed on a counter still reading "2 swaps left".
    const state = start(level, 19)
    let dead = state
    for (let i = 0; i < state.cfg.swaps; i++) dead = reduce(dead, { type: 'swap', seam: 0 })
    expect(dead.used).toBe(state.cfg.swaps)
    expect(isSolved(dead)).toBe(false)
    expect(failure(dead)).toBe(OUT_OF_SWAPS)

    const { view } = show(dead, true)
    const flashing = view.container.querySelectorAll(`.${cues.flash}`)
    expect(flashing).toHaveLength(1)
    expect(flashing[0].textContent).toBe('No swaps left')
  })

  it('flashes nothing while a swap is left, even after one that got no closer', () => {
    // The wasted swap is the tap the old rule ended the level on. The board
    // takes it and says nothing at all.
    const state = start(level, 20)
    const wasted = everySeam(state.seats).find(
      (seam) =>
        swapsToGo(state.cfg, swapSeats(state.seats, seam)) >= swapsToGo(state.cfg, state.seats),
    ) as number
    const next = reduce(state, { type: 'swap', seam: wasted })
    expect(failure(next)).toBeNull()
    const { view } = show(next)
    expect(view.container.querySelectorAll(`.${cues.flash}`)).toHaveLength(0)
    expect(view.container.textContent).toContain('2 swaps left')
  })

  it('shows a keyboard where it is, locked or not', () => {
    // The gaps are the only control on this board and the arrow keys above are
    // there to walk them, so the ring that says where the focus is has to
    // survive two things in the cascade — and neither can be settled by
    // reading the rule on its own.
    //
    // `u-press` sets `box-shadow` in src/styles/base.css, after the global
    // `:focus-visible` and at the same specificity, so it wins on order and
    // takes the ring with it — the global rule also sets `outline: none`, so
    // nothing is left behind. `.seam[aria-disabled='true']` sets `box-shadow`
    // at one class and one attribute, which beats a bare `:focus-visible`
    // whatever the order. So the rule asks twice: `.seam:focus-visible` for
    // the live gaps, and the same with the attribute for a level that is over,
    // which is exactly when a child reads the row back. The alice maze, the
    // tents, the thermometers and the balance scales carry the first half of
    // this; this board is the only one that needs the second.
    const css = readFileSync(
      resolvePath(process.cwd(), 'src/puzzles/long-table/board.module.css'),
      'utf8',
    )
    const dead = css.indexOf(".seam[aria-disabled='true'],")
    const ring = css.indexOf('.seam:focus-visible,')
    expect(dead).toBeGreaterThan(-1)
    expect(ring).toBeGreaterThan(dead)
    const rule = css.slice(ring, css.indexOf('}', ring))
    expect(rule).toContain(".seam[aria-disabled='true']:focus-visible")
    expect(rule).toContain('box-shadow: var(--focus-ring)')
  })

  it('says how a swap is made in the words the how-to-play drawer uses', () => {
    // One action, one sentence. The drawer said "Tap the arrows between two
    // animals to swap them over" while the board said "Tap an arrow between
    // two animals to swap them", for the identical tap.
    const { view } = show(start(level, 31))
    expect(view.container.textContent).toContain(longTable.instructions[2])
  })

  it('keeps every gap and every animal on the same node when a swap lands', () => {
    // A place stays a place, and a piece keeps its node: the row is drawn in
    // the cast's own order and moved by a transform, so a swap is two animals
    // travelling rather than two nodes lifted out and dropped back.
    const state = start(level, 21)
    const { view } = show(state)
    const before = [...view.container.querySelectorAll('button, [class*="guest"]')]
    view.rerender(
      createElement(longTable.engine.Board, {
        state: reduce(state, { type: 'swap', seam: 0 }),
        dispatch: vi.fn(),
        locked: false,
      }),
    )
    const after = [...view.container.querySelectorAll('button, [class*="guest"]')]
    expect(after).toEqual(before)
  })
})

/* ============================================================
   The picture on the card
   ============================================================ */

describe('the card', () => {
  it('draws a position the first level really opens on', () => {
    // The wolf sitting next to the goat, which is one of the level's quarrels
    // and one of the seatings it deals.
    const { config } = levels[0]
    const wolf = idsAt(config).indexOf('wolf')
    const goat = idsAt(config).indexOf('goat')
    const together = dealsFor(config).filter((seats) =>
      everySeam(seats).some(
        (seam) =>
          (seats[seam] === wolf && seats[seam + 1] === goat) ||
          (seats[seam] === goat && seats[seam + 1] === wolf),
      ),
    )
    expect(together.length).toBeGreaterThan(0)
    for (const seats of together) expect(shortest(config, seats)).toHaveLength(config.swaps)
  })
})

/* ============================================================
   What thoughtless tapping costs

   The dead end holds back until the swaps are spent, so no tap
   is ever answered right-or-wrong and a child who does not
   look at the row has to find a whole line by luck. `lucky`
   counts those lines; this is what they cost. The rule this
   replaced is worked out here too, by its own rule and from
   the same deals, so the trade is on the record as two numbers
   rather than as an argument in a comment.

   Every number quoted at the top of logic.ts is taken here,
   exactly rather than by sampling, so re-taking them after a
   change to the deal gives one answer and not a different one
   for every seed.
   ============================================================ */

describe('a child who does not look at the row', () => {
  const mean = (rows: number[]) => rows.reduce((sum, x) => sum + x, 0) / rows.length
  const to2 = (x: number) => Math.round(100 * x) / 100
  const waysOf = (cfg: TableConfig) => Math.pow(cfg.guests.length - 1, cfg.swaps)

  /**
   * The best a thoughtless player can do: tap a gap at random, and when the
   * board says the swaps have gone, press Step back and take a gap not tried
   * yet from where that lands — remembering nothing but which gaps have
   * already been tried there. It is the strongest player who never reads the
   * row, so it is the cheapest this can honestly be.
   *
   * What one press is worth is the whole of the difference from the rule this
   * replaced. Step back lands on the last position a win is still reachable
   * from, so tapping a gap that leaves the shortest line costs the swaps that
   * remain — one for the tap, and the rest spent inside a row that can no
   * longer be put right — and then the table is back where it was with one
   * more gap crossed off. Under one-move-at-a-time that same wrong tap cost
   * the whole subtree under it, which is where 34.75, 230.52 and 1410.65 came
   * from.
   *
   * Worked out rather than sampled, and worked out through `reduce`,
   * `failure` and `isSolved`, so what is counted is the board the child really
   * has. At a node with `s` children a win is still reachable through and `f`
   * children where it is not, a uniform order puts f / (s + 1) losers in front
   * of the first winner, and that first winner is uniform among the winners
   * and independent of how many losers came before it. So the whole thing is
   * one recursion, kept under the row and the swaps left.
   *
   * There is no early win to allow for: a deal is `swaps` from a good seating
   * and one swap moves one step, so nothing short of the last tap is solved.
   */
  function expectedTaps(cfg: TableConfig, seats: readonly number[]): number {
    const memo = new Map<string, number | null>()
    const walk = (state: TableState): number | null => {
      if (isSolved(state)) return 0
      if (failure(state) !== null) return null
      const key = `${seatKey(state.seats)}:${state.used}`
      const known = memo.get(key)
      if (known !== undefined) return known
      const wins: number[] = []
      let lost = 0
      for (const move of legalMoves(state)) {
        const on = walk(reduce(state, move))
        if (on === null) lost++
        else wins.push(on)
      }
      const left = swapsLeft(state)
      const taps = wins.length === 0 ? null : (lost / (wins.length + 1)) * left + 1 + mean(wins)
      memo.set(key, taps)
      return taps
    }
    const taps = walk({ cfg, seats: seats.slice(), used: 0 })
    expect(taps).not.toBeNull()
    return taps as number
  }

  /**
   * The same child, actually tapping, one gap at a time.
   *
   * `canStillWin` appears here as the *board's* behaviour and never as the
   * child's knowledge: the tap is taken either way, and all it decides is what
   * happens afterwards — play on, or spend the swaps that are left in a row
   * that cannot be put right and then take one press of Step back home.
   * Whatever those last taps land on, there are exactly that many of them.
   */
  function playIt(cfg: TableConfig, seats: readonly number[], rng: () => number): number {
    let taps = 0
    const walk = (state: TableState): boolean => {
      if (isSolved(state)) return true
      if (failure(state) !== null) return false
      const order = legalMoves(state)
        .map((move) => ({ move, at: rng() }))
        .sort((a, b) => a.at - b.at)
      for (const { move } of order) {
        taps++
        const next = reduce(state, move)
        if (canStillWin(next)) {
          if (walk(next)) return true
        } else {
          // The rest of the budget, tapped out blind, and then one press back
          // to this very row.
          taps += swapsLeft(next)
        }
      }
      return false
    }
    expect(walk({ cfg, seats: seats.slice(), used: 0 })).toBe(true)
    return taps
  }

  it('is not walked home: 10.75, 18.51 and 27.48 taps against a par of 3, 4 and 5', () => {
    const cost = levels.map((level) =>
      to2(mean(dealsFor(level.config).map((seats) => expectedTaps(level.config, seats)))),
    )
    expect(cost).toEqual([10.75, 18.51, 27.48])
    // Four, five and five times par, and the ramp is still a ramp: a longer
    // table costs a thoughtless child more, level after level.
    // (`config.swaps` is the level's par, which the top of this file holds it
    // to.)
    expect(levels.map((level, i) => Math.round(cost[i] / level.config.swaps))).toEqual([4, 5, 5])
    expect(cost[0] < cost[1] && cost[1] < cost[2]).toBe(true)
    // Half of what it is worth to read the row: the eager rule below walked
    // the same child home in 7.08, 10.46 and 13.94, and one-move-at-a-time
    // Step back charged them 34.75, 230.52 and 1410.65 — most of which was a
    // child pressing it into another row that could not be saved either.
    expect(levels.map((_, i) => cost[i] > [7.08, 10.46, 13.94][i])).toEqual([true, true, true])
  })

  it('and the rule this replaced walked the same child home in 7.08, 10.46 and 13.94', () => {
    // The eager dead end: the level ended on the first swap that did not
    // shorten the way, so every tap was answered right-or-wrong and a child
    // who read the answer and stepped back never had to look at the row. This
    // is the only place left in the puzzle that plays by that rule, and it is
    // kept so the trade stays a measurement.
    //
    // Same recipe as `expectedTaps` above, minus the backing out: under that
    // rule every tap the board allowed was on a shortest line, so no subtree
    // ever had to be abandoned. Of the `wrong` gaps that ended the level and
    // the `right` ones that did not, a uniform order puts wrong / (right + 1)
    // of the first kind before the first of the second.
    const eager = (cfg: TableConfig, seats: readonly number[]): number => {
      const memo = new Map<string, number>()
      const walk = (row: readonly number[]): number => {
        const togo = swapsToGo(cfg, row)
        if (togo === 0) return 0
        const key = seatKey(row)
        const known = memo.get(key)
        if (known !== undefined) return known
        const right = everySeam(row)
          .map((seam) => swapSeats(row, seam))
          .filter((child) => swapsToGo(cfg, child) === togo - 1)
        const wrong = cfg.guests.length - 1 - right.length
        const taps = 1 + wrong / (right.length + 1) + mean(right.map(walk))
        memo.set(key, taps)
        return taps
      }
      return walk(seats)
    }
    const cost = levels.map((level) =>
      to2(mean(dealsFor(level.config).map((seats) => eager(level.config, seats)))),
    )
    expect(cost).toEqual([7.08, 10.46, 13.94])
    // Two to three times par, and a step back for every wrong tap — a solve
    // for about four, six and nine wrong taps and no thought about the row.
    levels.forEach((level, i) => {
      const par = level.config.swaps
      expect(`${level.id}: ${cost[i] > 2 * par && cost[i] < 3 * par}`).toBe(`${level.id}: true`)
    })
  })

  it('and a child really tapping it out pays about that, whatever the seed', () => {
    // The closed form against the play it describes, driven through `reduce`
    // and `failure`: three seeds, three runs a deal. Twenty seeds at this
    // sample put the widest miss at 13%, so a quarter is the line.
    for (const seed of [99, 1, 2024]) {
      const rng = makeRng(seed)
      for (const level of levels) {
        const pool = dealsFor(level.config)
        let taps = 0
        for (const seats of pool) {
          for (let go = 0; go < 3; go++) taps += playIt(level.config, seats, rng)
        }
        const played = taps / (pool.length * 3)
        const worked = mean(pool.map((seats) => expectedTaps(level.config, seats)))
        expect(`${level.id}: ${Math.abs(played - worked) / worked < 0.25}`).toBe(
          `${level.id}: true`,
        )
      }
    }
  })

  it('and a child who starts over instead of stepping back pays 144, 866 and 4054', () => {
    // The other thoughtless player, and the one who remembers nothing at all:
    // tap the swaps out, and when the board says they have gone, start the
    // deal again. A run is `swaps` taps whatever happens, because nothing is
    // ever solved early, and it comes home with probability lucky / ways — so
    // the taps are par * ways / lucky exactly, and `lucky` is the cost rather
    // than a number beside it.
    const cost = levels.map((level) =>
      Math.round(
        mean(
          dealsFor(level.config).map(
            (seats) =>
              (level.config.swaps * waysOf(level.config)) /
              luckyLines(level.config, seats, level.config.swaps),
          ),
        ),
      ),
    )
    expect(cost).toEqual([144, 866, 4054])
  })

  it('wins one blind run in 43, then 188, then 555', () => {
    // The ramp as a child would feel it, rather than as a ratio: tap the
    // swaps out once, without looking, and this is how often everybody ends
    // up seated. Under the rule this replaced the question did not arise,
    // because the board answered every tap and nobody ever walked a whole
    // line blind.
    const odds = levels.map((level) => {
      const lucky = mean(
        dealsFor(level.config).map((seats) =>
          luckyLines(level.config, seats, level.config.swaps),
        ),
      )
      return Math.round(waysOf(level.config) / lucky)
    })
    expect(odds).toEqual([43, 188, 555])
  })

  it('and pays for a wrong tap with 1.57, 2.44 and 3.12 more taps, worth one press', () => {
    // The price of holding the dead end back, over every one of the
    // ways ^ swaps runs of each deal: where a losing run left the set of
    // positions a win is still reachable from, how many taps it spent after
    // that, and how far back the one press of Step back then carries it.
    // Walking the whole tree of taps once a deal is what makes this exact
    // rather than sampled.
    //
    // The second number is what the shell now does in one press. It used to
    // be a count of presses — the child pressed Step back 2.57 times on
    // average, and every press but the last landed on a row that was just as
    // lost with the board saying nothing about it.
    const priced = levels.map((level) => {
      const { config } = level
      const memo = new Map<string, boolean>()
      let lost = 0
      let onward = 0
      let back = 0
      for (const seats of dealsFor(config)) {
        const walk = (row: readonly number[], depth: number, lastGood: number) => {
          if (depth === config.swaps) {
            if (isGoodSeating(config, row)) return
            lost++
            onward += config.swaps - lastGood - 1
            back += config.swaps - lastGood
            return
          }
          for (const seam of everySeam(row)) {
            const child = swapSeats(row, seam)
            const alive = canStillFinish(config, child, config.swaps - depth - 1, memo)
            walk(child, depth + 1, alive ? depth + 1 : lastGood)
          }
        }
        walk(seats, 0, 0)
      }
      return `${to2(onward / lost)} taps then one press worth ${to2(back / lost)} moves`
    })
    expect(priced).toEqual([
      '1.57 taps then one press worth 2.57 moves',
      '2.44 taps then one press worth 3.44 moves',
      '3.12 taps then one press worth 4.12 moves',
    ])
  })
})
