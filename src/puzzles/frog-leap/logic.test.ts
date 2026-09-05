import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PuzzleLevel } from '../../lib/types'
import type { Settings } from '../../lib/settings'
import { underSettings } from '../../test/settings'
import { reachableCount, shortestSolution } from '../../lib/search'
import { frogLeap } from './index'
import { Board } from './Board'
import type { FrogAction, FrogConfig, FrogState, Seat } from './logic'
import {
  STUCK,
  describeMove,
  failure,
  hopTarget,
  init,
  isJump,
  isSolved,
  legalMoves,
  reduce,
  refusalOf,
} from './logic'

const levels = frogLeap.levels as PuzzleLevel<FrogConfig>[]
const key = (state: FrogState) => state.seats.join(',')
const hops = (state: FrogState): FrogAction[] =>
  legalMoves(state).map((from) => ({ type: 'hop', from }))
const hop = (state: FrogState, from: number) => reduce(state, { type: 'hop', from })
const show = (state: FrogState) =>
  state.seats.map((v) => (v === 1 ? 'G' : v === -1 ? 'B' : '_')).join('')
const read = (row: string): FrogState => ({
  seats: [...row].map((c): Seat => (c === 'G' ? 1 : c === 'B' ? -1 : 0)),
})

const solve = (start: FrogState) =>
  shortestSolution<FrogState, FrogAction>({
    start,
    moves: hops,
    apply: reduce,
    key,
    solved: isSolved,
  })

/** Can this position still be finished? Memoised — the tests ask a lot. */
const solvableCache = new Map<string, boolean>()
function solvable(state: FrogState): boolean {
  const k = key(state)
  const hit = solvableCache.get(k)
  if (hit !== undefined) return hit
  const answer = solve(state) !== null
  solvableCache.set(k, answer)
  return answer
}

/** Every position reachable from the start, dead ends included. */
function allStates(start: FrogState): FrogState[] {
  const seen = new Map([[key(start), start]])
  const stack = [start]
  while (stack.length) {
    const state = stack.pop() as FrogState
    for (const from of legalMoves(state)) {
      const next = hop(state, from)
      if (seen.has(key(next))) continue
      seen.set(key(next), next)
      stack.push(next)
    }
  }
  return [...seen.values()]
}

/** How far every frog has travelled from its own end of the row. */
function progress(state: FrogState): number {
  const last = state.seats.length - 1
  return state.seats.reduce<number>(
    (sum, seat, i) => sum + (seat === 1 ? i : seat === -1 ? last - i : 0),
    0,
  )
}

const finishedRow = (n: number): FrogState => read(`${'B'.repeat(n)}_${'G'.repeat(n)}`)

/**
 * After the opening move only one move ever keeps the puzzle alive (proved
 * below), so this walks the one true solution, taking the leftmost frog at
 * the fork the opening offers.
 */
function forcedSolution(start: FrogState): FrogState[] {
  const path = [start]
  let state = start
  while (!isSolved(state)) {
    const live = legalMoves(state).filter((from) => solvable(hop(state, from)))
    if (live.length === 0) throw new Error(`no way on from ${show(state)}`)
    state = hop(state, live[0])
    path.push(state)
  }
  return path
}

const moveKinds = (path: FrogState[]) =>
  path.slice(0, -1).map((state, i) => {
    const from = state.seats.findIndex((seat, j) => seat !== 0 && path[i + 1].seats[j] === 0)
    return isJump(state, from) ? 'jump' : 'step'
  })

/**
 * The whole solution to each level, worked out by hand from the rules with a
 * separate brute-force search — not by running the code under test. If a
 * change to `hopTarget` quietly alters the puzzle, these rows stop matching.
 */
const SOLUTIONS: Record<number, string[]> = {
  2: 'GG_BB G_GBB GBG_B GBGB_ GB_BG _BGBG B_GBG BBG_G BB_GG'.split(' '),
  3: (
    'GGG_BBB GG_GBBB GGBG_BB GGBGB_B GGB_BGB G_BGBGB _GBGBGB BG_GBGB ' +
    'BGBG_GB BGBGBG_ BGBGB_G BGB_BGG B_BGBGG BB_GBGG BBBG_GG BBB_GGG'
  ).split(' '),
  4: (
    'GGGG_BBBB GGG_GBBBB GGGBG_BBB GGGBGB_BB GGGB_BGBB GG_BGBGBB G_GBGBGBB ' +
    'GBG_GBGBB GBGBG_GBB GBGBGBG_B GBGBGBGB_ GBGBGB_BG GBGB_BGBG GB_BGBGBG ' +
    '_BGBGBGBG B_GBGBGBG BBG_GBGBG BBGBG_GBG BBGBGBG_G BBGBGB_GG BBGB_BGGG ' +
    'BB_BGBGGG BBB_GBGGG BBBBG_GGG BBBB_GGGG'
  ).split(' '),
}

/**
 * The looser reading of the rules — jump over any one frog, your own colour
 * included. Kept here to check the claim `hopTarget` makes: forbidding it
 * costs the puzzle nothing at all.
 */
function permissiveTarget(state: FrogState, from: number): number {
  const { seats } = state
  const dir = seats[from]
  if (dir === 0) return -1
  const step = from + dir
  if (step < 0 || step >= seats.length) return -1
  if (seats[step] === 0) return step
  const leap = from + 2 * dir
  if (leap < 0 || leap >= seats.length) return -1
  return seats[leap] === 0 ? leap : -1
}
const permissiveMoves = (state: FrogState): FrogAction[] =>
  state.seats
    .map((_, i) => i)
    .filter((i) => permissiveTarget(state, i) >= 0)
    .map((from) => ({ type: 'hop', from }) as FrogAction)
const permissiveApply = (state: FrogState, action: FrogAction): FrogState => {
  const to = permissiveTarget(state, action.from)
  if (to < 0) return state
  const seats = state.seats.slice()
  seats[to] = seats[action.from]
  seats[action.from] = 0
  return { seats }
}

afterEach(cleanup)

describe('leapfrog', () => {
  for (const level of levels) {
    const n = level.config.perSide
    const par = level.par as number

    describe(`"${level.label}"`, () => {
      it('starts as n greens, a free stone, then n blues', () => {
        const state = init(level)
        expect(show(state)).toBe(`${'G'.repeat(n)}_${'B'.repeat(n)}`)
        expect(state.seats).toHaveLength(2 * n + 1)
        expect(isSolved(state)).toBe(false)
        expect(failure(state)).toBeNull()
        expect(legalMoves(state)).toHaveLength(2) // never one, never a lone trap
      })

      it(`is solvable in exactly par (${par}) hops`, () => {
        const path = solve(init(level))
        expect(path).not.toBeNull()
        expect(path?.length).toBe(par)
      })

      it('has the par the classic count predicts, n squared plus two n', () => {
        expect(par).toBe(n * n + 2 * n)
      })

      it('plays out exactly as the hand-checked solution says', () => {
        const rows = forcedSolution(init(level)).map(show)
        expect(rows).toEqual(SOLUTIONS[n])
        expect(rows).toHaveLength(par + 1)
        expect(rows[rows.length - 1]).toBe(`${'B'.repeat(n)}_${'G'.repeat(n)}`)
      })

      it('is safe and unsolved at every step until the very last one', () => {
        const path = forcedSolution(init(level))
        path.forEach((state, i) => {
          expect(failure(state)).toBeNull()
          expect(isSolved(state)).toBe(i === path.length - 1)
          if (i > 0) expect(state).not.toBe(path[i - 1])
        })
      })

      it('returns the identical state object for every action that is not a move', () => {
        for (const state of allStates(init(level))) {
          const legal = new Set(legalMoves(state))
          for (let i = 0; i < state.seats.length; i++) {
            if (legal.has(i)) continue
            expect(hop(state, i)).toBe(state) // no frog, or nowhere to go
          }
        }
        const state = init(level)
        const last = state.seats.length - 1
        for (const from of [-1, -0.5, 1.5, NaN, Infinity, -Infinity, last + 1, 99]) {
          expect(hop(state, from)).toBe(state)
        }
        expect(hop(state, n)).toBe(state) // the free stone holds no frog
        expect(reduce(state, { type: 'sit' } as unknown as FrogAction)).toBe(state)
        // A finished row: every frog is walled in by the edge or its own colour.
        const finished = finishedRow(n)
        expect(isSolved(finished)).toBe(true)
        for (let i = 0; i <= last; i++) expect(hop(finished, i)).toBe(finished)
      })

      it('never touches the state it was handed', () => {
        const state = init(level)
        Object.freeze(state)
        Object.freeze(state.seats)
        const before = state.seats.join(',')
        for (let i = 0; i < state.seats.length; i++) {
          hopTarget(state, i)
          legalMoves(state)
          isSolved(state)
          failure(state)
          hop(state, i)
        }
        expect(state.seats.join(',')).toBe(before)
      })

      it('never lets a frog move backwards, land anywhere but the free stone, or jump two', () => {
        for (const state of allStates(init(level))) {
          for (const from of legalMoves(state)) {
            const dir = state.seats[from]
            const to = hopTarget(state, from)
            const distance = to - from
            expect(dir).not.toBe(0)
            expect(Math.sign(distance)).toBe(dir)
            expect(Math.abs(distance)).toBeLessThanOrEqual(2)
            expect(state.seats[to]).toBe(0)
            if (Math.abs(distance) === 2) {
              // Jumps clear exactly one frog, and it is always the other colour.
              expect(state.seats[from + dir]).toBe(-dir)
            }
            const next = hop(state, from)
            expect(next).not.toBe(state)
            expect(next.seats[from]).toBe(0)
            expect(next.seats[to]).toBe(dir)
            // The row keeps exactly the frogs it started with.
            expect([...next.seats].sort().join()).toBe([...state.seats].sort().join())
          }
        }
      })

      it('keeps each colour in its original order for ever, so a frog has an identity', () => {
        for (const state of allStates(init(level))) {
          for (const from of legalMoves(state)) {
            const dir = state.seats[from]
            const to = hopTarget(state, from)
            const between = state.seats.slice(Math.min(from, to) + 1, Math.max(from, to))
            expect(between.includes(dir)).toBe(false)
          }
        }
      })

      it('reports the jam exactly when nobody can move and the row is not swapped', () => {
        let jams = 0
        for (const state of allStates(init(level))) {
          const stuck = legalMoves(state).length === 0 && !isSolved(state)
          expect(failure(state)).toBe(stuck ? STUCK : null)
          if (stuck) jams++
        }
        expect(jams).toBeGreaterThan(0) // the dead end is reachable, which is the point
      })

      it('never jams before the player has had a real choice to make', () => {
        // Breadth-first: how many moves in is the earliest possible dead end?
        let frontier = [init(level)]
        const seen = new Set([key(frontier[0])])
        let depth = 0
        let firstJam = Infinity
        while (frontier.length && firstJam === Infinity) {
          const next: FrogState[] = []
          for (const state of frontier) {
            if (failure(state) !== null) firstJam = Math.min(firstJam, depth)
            for (const from of legalMoves(state)) {
              const child = hop(state, from)
              if (seen.has(key(child))) continue
              seen.add(key(child))
              next.push(child)
            }
          }
          frontier = next
          depth++
        }
        expect(firstJam).toBe(n)
      })

      it('always ends: every hop moves the frogs strictly further along', () => {
        for (const state of allStates(init(level))) {
          for (const from of legalMoves(state)) {
            expect(progress(hop(state, from))).toBeGreaterThan(progress(state))
          }
        }
        // ...so there are no cycles and no play can wander for ever.
        expect(progress(init(level))).toBe(n * (n - 1))
      })

      it('makes stepping twice in a row fatal, and a jump always safe', () => {
        let doubleSteps = 0
        let jumps = 0
        for (const state of allStates(init(level))) {
          if (!solvable(state)) continue
          for (const from of legalMoves(state)) {
            const next = hop(state, from)
            if (isJump(state, from)) {
              // Hint two: a jump is how you get past, and it never costs you.
              expect(solvable(next)).toBe(true)
              jumps++
              continue
            }
            if (!solvable(next)) continue
            for (const again of legalMoves(next)) {
              if (isJump(next, again)) continue
              // Hint three: stepping twice in a row leaves everyone stuck.
              expect(solvable(hop(next, again))).toBe(false)
              doubleSteps++
            }
          }
        }
        expect(jumps).toBeGreaterThan(0)
        expect(doubleSteps).toBeGreaterThan(0)
      })

      it('has exactly one solution, once the opening side is chosen', () => {
        const start = init(level)
        for (const state of allStates(start)) {
          if (!solvable(state) || isSolved(state)) continue
          const live = legalMoves(state).filter((from) => solvable(hop(state, from)))
          expect(live).toHaveLength(key(state) === key(start) ? 2 : 1)
        }
      })

      it('needs n squared jumps and 2n steps, in runs that grow then shrink', () => {
        const kinds = moveKinds(forcedSolution(init(level)))
        expect(kinds.filter((k) => k === 'jump')).toHaveLength(n * n)
        expect(kinds.filter((k) => k === 'step')).toHaveLength(2 * n)
        // A step, then runs of jumps 1, 2, ... n, ... 2, 1 with one step between.
        expect(kinds[0]).toBe('step')
        expect(kinds[kinds.length - 1]).toBe('step')
        const runs: number[] = []
        let run = 0
        for (const kind of kinds) {
          if (kind === 'jump') run++
          else {
            if (run > 0) runs.push(run)
            run = 0
          }
        }
        if (run > 0) runs.push(run)
        expect(runs).toEqual([
          ...Array.from({ length: n }, (_, i) => i + 1),
          ...Array.from({ length: n - 1 }, (_, i) => n - 1 - i),
        ])
      })

      it('loses nothing by refusing jumps over your own colour', () => {
        const start = init(level)
        const strict = reachableCount<FrogState, FrogAction>({
          start,
          moves: hops,
          apply: reduce,
          key,
        })
        const loose = reachableCount<FrogState, FrogAction>({
          start,
          moves: permissiveMoves,
          apply: permissiveApply,
          key,
        })
        expect(strict).toBe(loose)
        const loosePar = shortestSolution<FrogState, FrogAction>({
          start,
          moves: permissiveMoves,
          apply: permissiveApply,
          key,
          solved: isSolved,
        })
        expect(loosePar?.length).toBe(par)
        // ...and the looser rule would hand a child a dead end on tap one.
        expect(permissiveMoves(start)).toHaveLength(4)
        expect(legalMoves(start)).toHaveLength(2)
      })
    })
  }

  it('has the reachable positions the rules imply', () => {
    const counts = levels.map((level) =>
      reachableCount<FrogState, FrogAction>({
        start: init(level),
        moves: hops,
        apply: reduce,
        key,
      }),
    )
    expect(counts).toEqual([23, 72, 195])
  })

  it('refuses to jump a frog over its own colour', () => {
    const start = init(levels[0]) // GG_BB
    expect(hopTarget(start, 0)).toBe(-1)
    expect(hopTarget(start, 4)).toBe(-1)
    expect(hop(start, 0)).toBe(start)
    expect(hop(start, 4)).toBe(start)
    expect(legalMoves(start)).toEqual([1, 3])
  })

  it('names what stopped every frog that cannot move, and leaves the row alone', () => {
    const start = init(levels[0]) // GG_BB
    expect(refusalOf(start, 0)?.message).toBe(
      'A frog only jumps over a frog of the other colour.',
    )
    expect(refusalOf(start, 4)?.message).toBe(
      'A frog only jumps over a frog of the other colour.',
    )
    // A frog that has a hop has nothing to refuse.
    expect(refusalOf(start, 1)).toBeNull()
    expect(refusalOf(start, 3)).toBeNull()
    // …and neither has the free stone, or a stone off the end of the row.
    expect(refusalOf(start, 2)).toBeNull()
    expect(refusalOf(start, 9)).toBeNull()

    // A green frog home at the right-hand end, and a jam with nowhere to land.
    expect(refusalOf(read('BB_GG'), 4)?.message).toBe('That frog is at the end of the row.')
    expect(refusalOf(read('_GGBB'), 2)?.message).toBe(
      'There is no free stone for that frog to land on.',
    )
  })

  it('never moves a frog to refuse it, because the row could not draw the move', () => {
    for (const level of levels) {
      for (const state of allStates(init(level))) {
        for (let from = 0; from < state.seats.length; from++) {
          const no = refusalOf(state, from)
          if (hopTarget(state, from) >= 0 || state.seats[from] === 0) {
            expect(no).toBeNull()
            continue
          }
          expect(no?.message).toMatch(/^[A-Z].*\.$/)
          // The refusal is a sentence and a cue, never a position: a frog that
          // jumped its own colour would swap two frogs of one colour past each
          // other, which the board draws in colour order and cannot show.
          expect(no?.pretend).toBe(state)
        }
      }
    }
  })

  it('jams the row when a colour steps twice in a row', () => {
    const start = init(levels[0]) // GG_BB
    const once = hop(start, 1) // G_GBB
    const stuck = hop(once, 0) // _GGBB — the second step, and it is fatal
    expect(show(once)).toBe('G_GBB')
    expect(show(stuck)).toBe('_GGBB')
    expect(legalMoves(stuck)).toEqual([])
    expect(failure(stuck)).toBe(STUCK)
    expect(isSolved(stuck)).toBe(false)
    // Every tap from here is refused, so stepping back is the only way out —
    // and the position behind it is a fine place to be.
    for (let i = 0; i < stuck.seats.length; i++) expect(hop(stuck, i)).toBe(stuck)
    expect(failure(once)).toBeNull()
    expect(solvable(once)).toBe(true)
  })

  it('says nothing is wrong once the frogs have swapped, even though nobody can move', () => {
    const solved = finishedRow(levels[0].config.perSide)
    expect(isSolved(solved)).toBe(true)
    expect(legalMoves(solved)).toEqual([])
    expect(failure(solved)).toBeNull()
  })

  it('only calls the row solved when both colours are home and the gap is central', () => {
    expect(isSolved(read('BB_GG'))).toBe(true)
    expect(isSolved(read('B_BGG'))).toBe(false)
    expect(isSolved(read('BBG_G'))).toBe(false)
    expect(isSolved(read('GG_BB'))).toBe(false)
    expect(isSolved(read('BGB_G'))).toBe(false)
    expect(isSolved(read('BBB_GGG'))).toBe(true)
  })

  it('puts the free stone back in the middle, colours alternating, halfway through', () => {
    const level = levels[2]
    const seats = forcedSolution(init(level))[(level.par as number) / 2].seats
    expect(seats[(seats.length - 1) / 2]).toBe(0)
    for (let i = 1; i < seats.length; i++) {
      if (seats[i] !== 0 && seats[i - 1] !== 0) expect(seats[i]).not.toBe(seats[i - 1])
    }
  })

  it('describes a move the way a player would say it', () => {
    const start = init(levels[0]) // GG_BB
    const stepped = hop(start, 1)
    expect(describeMove(start, stepped, { type: 'hop', from: 1 })).toBe(
      'Stepped a green frog forward',
    )
    const jumped = hop(stepped, 3) // G_GBB — a blue clears the green
    expect(show(jumped)).toBe('GBG_B')
    expect(describeMove(stepped, jumped, { type: 'hop', from: 3 })).toBe(
      'Jumped a blue frog over a green one',
    )
    expect(describeMove(jumped, jumped, { type: 'hop', from: 3 })).toBe('Nobody moved')
    expect(describeMove(start, start, { type: 'hop', from: 2 })).toBe('Nobody moved')
    expect(describeMove(start, start, { type: 'hop', from: 0 })).toBe('Nobody moved')
  })

  it('offers three levels that climb, each with a stable id and three hints', () => {
    expect(levels.map((l) => l.id)).toEqual(['two-each', 'three-each', 'four-each'])
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.config.perSide)).toEqual([2, 3, 4])
    expect(levels.map((l) => l.par)).toEqual([8, 15, 24])
    for (const level of levels) {
      expect(level.label).toMatch(/^[A-Z][a-z]/) // sentence case
      expect(level.hints).toHaveLength(3)
      for (const hint of level.hints) {
        expect(hint.length).toBeGreaterThan(20)
        expect(hint.length).toBeLessThan(130) // a hint a child will actually read
        expect(hint).toMatch(/[.]$/)
        expect(hint).not.toMatch(/!/)
      }
    }
    expect(frogLeap.instructions.length).toBeGreaterThanOrEqual(2)
    expect(frogLeap.instructions.length).toBeLessThanOrEqual(4)
    expect(frogLeap.reseedable).toBe(false)
    expect(frogLeap.engine.init).toBe(init)
    expect(frogLeap.engine.reduce).toBe(reduce)
    expect(frogLeap.engine.failure).toBe(failure)
    expect(frogLeap.engine.isSolved).toBe(isSolved)
    expect(frogLeap.engine.describe).toBe(describeMove)
    expect(frogLeap.engine.Board).toBe(Board)
  })

  it('never puts an emoji in front of a child', () => {
    const words = [
      frogLeap.title,
      frogLeap.tagline,
      STUCK,
      ...frogLeap.instructions,
      ...levels.flatMap((l) => [l.label, ...l.hints]),
    ]
    for (const word of words) expect(word).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

/* ============================================================
   The board. It renders the pieces and nothing else, it is a
   pure function of the state, and it obeys `locked`.
   ============================================================ */

const paint = (state: FrogState, locked = false, settings?: Partial<Settings>) => {
  const dispatch = vi.fn()
  const view = render(createElement(Board, { state, dispatch, locked }), {
    wrapper: underSettings(settings),
  })
  const buttons = () => screen.getAllByRole('button') as HTMLButtonElement[]
  const live = () => buttons().filter((b) => !b.disabled)
  const stoneOf = (b: HTMLButtonElement) =>
    Number(/on stone (\d+)/.exec(b.getAttribute('aria-label') ?? '')?.[1]) - 1
  return { dispatch, view, buttons, live, stoneOf }
}

describe('leapfrog board', () => {
  for (const level of levels) {
    const n = level.config.perSide

    it(`"${level.label}" draws one button per frog, and with forbidden hops off enables exactly the legal ones`, () => {
      for (const state of allStates(init(level)).slice(0, 20)) {
        cleanup()
        const { buttons, live, stoneOf } = paint(state, false, { allowForbiddenMoves: false })
        expect(buttons()).toHaveLength(2 * n)
        expect(live().map(stoneOf).sort((a, b) => a - b)).toEqual(legalMoves(state))
        for (const b of buttons()) {
          expect(b.getAttribute('type')).toBe('button')
          expect(b.className).toContain('u-press')
          const label = b.getAttribute('aria-label') ?? ''
          expect(label).toMatch(/^(Green|Blue) frog on stone \d+, (step it|jump it|blocked)/)
          expect(b.disabled).toBe(hopTarget(state, stoneOf(b)) < 0)
        }
      }
    })

    it(`"${level.label}" sends one hop per tap, for the frog that was tapped`, () => {
      const state = init(level)
      for (const from of legalMoves(state)) {
        cleanup()
        const { dispatch, live, stoneOf } = paint(state)
        const button = live().find((b) => stoneOf(b) === from)
        fireEvent.click(button as HTMLButtonElement)
        expect(dispatch).toHaveBeenCalledTimes(1)
        expect(dispatch).toHaveBeenCalledWith({ type: 'hop', from })
      }
    })
  }

  it('ignores every input while locked', () => {
    const { dispatch, buttons } = paint(init(levels[0]), true)
    expect(buttons()).toHaveLength(4)
    for (const b of buttons()) {
      expect(b.disabled).toBe(true)
      fireEvent.click(b)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('locks a jammed row too, so a dead end cannot be played out of', () => {
    const stuck = read('_GGBB')
    const { dispatch, buttons } = paint(stuck, true)
    for (const b of buttons()) fireEvent.click(b)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('is a pure function of the state — the same row always draws the same way', () => {
    const off = { allowForbiddenMoves: false }
    const a = paint(read('GBG_B'), false, off)
    const labels = a.buttons().map((b) => b.getAttribute('aria-label'))
    cleanup()
    const b = paint(read('GBG_B'), false, off)
    expect(b.buttons().map((x) => x.getAttribute('aria-label'))).toEqual(labels)
    // ...and re-rendering with a new state redraws from that state alone.
    // The frogs are drawn every green and then every blue, never in row order;
    // the test below says why.
    b.view.rerender(createElement(Board, { state: read('GBGB_'), dispatch: vi.fn(), locked: false }))
    expect(screen.getAllByRole('button').map((x) => x.getAttribute('aria-label'))).toEqual([
      'Green frog on stone 1, blocked',
      'Green frog on stone 3, jump it over the blue frog to stone 5',
      'Blue frog on stone 2, blocked',
      'Blue frog on stone 4, blocked',
    ])
  })

  it('places every frog from the state alone, as a bare number the CSS can use', () => {
    paint(read('GBG_B'))
    const stage = document.querySelector('[style*="--seats"]') as HTMLElement
    expect(stage.style.getPropertyValue('--seats')).toBe('5')
    const slots = [...document.querySelectorAll('[style*="--pos"]')] as HTMLElement[]
    // Greens first, so stone 3 before stone 2: a slot is placed by --pos alone
    // and owes nothing to where it sits among its siblings.
    expect(slots.map((el) => el.style.getPropertyValue('--pos'))).toEqual(['0', '2', '1', '4'])
  })

  /**
   * The frogs were once drawn in row order, which a jump changes by definition.
   * React answers a reordered list by lifting the node that moved out of the
   * document and putting it straight back, and a node that has left the
   * document has no transform to travel from — so a step, and then a jump over
   * the frog that had just stepped, put the jumper on its landing stone before
   * the arc had begun.
   */
  it('keeps every frog in the node it started in, so a jump travels', () => {
    const b = paint(read('GG_BB'))
    const slots = () => [...document.querySelectorAll('[style*="--pos"]')] as HTMLElement[]
    slots().forEach((el, i) => (el.dataset.frog = String(i)))
    const replay = (row: string) => {
      b.view.rerender(createElement(Board, { state: read(row), dispatch: vi.fn(), locked: false }))
      return slots().map((el) => el.dataset.frog)
    }
    // The blue frog steps, and then the green frog jumps over it.
    expect(replay('GGB_B')).toEqual(['0', '1', '2', '3'])
    expect(replay('G_BGB')).toEqual(['0', '1', '2', '3'])
    // ...and the same again backwards, the way the move tape replays it.
    expect(replay('GGB_B')).toEqual(['0', '1', '2', '3'])
    expect(replay('GG_BB')).toEqual(['0', '1', '2', '3'])
  })

  it('reads the whole row out for anyone who cannot see it', () => {
    paint(read('GBG_B'))
    expect(
      screen.getByText(
        'Left to right: a green frog, a blue frog, a green frog, the free stone, a blue frog.',
      ),
    ).toBeInTheDocument()
  })

  /* ----------------------------------------------------------
     A hop that breaks the rule, with the setting that offers it
     on — which is how the collection ships.

     jsdom loads no stylesheet, so --dur-4 is put on the root by
     hand: the cue lives for exactly as long as its token says.
     ---------------------------------------------------------- */
  describe('a frog that cannot go', () => {
    const DUR_4 = 480
    const runCue = () => act(() => vi.advanceTimersByTime(DUR_4))
    const label = (b: HTMLButtonElement) => b.getAttribute('aria-label')

    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
      })
      document.documentElement.style.setProperty('--dur-4', `${DUR_4}ms`)
    })

    afterEach(() => {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    })

    it('looks exactly like a frog that can', () => {
      const { buttons } = paint(read('GG_BB'))
      // Nothing faded, nothing dead, and no label that gives a frog away.
      for (const b of buttons()) expect(b.disabled).toBe(false)
      expect(buttons().map(label)).toEqual([
        'Green frog on stone 1, hop it',
        'Green frog on stone 2, hop it',
        'Blue frog on stone 4, hop it',
        'Blue frog on stone 5, hop it',
      ])
    })

    it('takes the tap, says no, and leaves the row exactly as it was', () => {
      const { dispatch, buttons, view } = paint(read('GG_BB'))
      const pond = () => view.container.querySelector('[class*="frogs"]')?.innerHTML
      const said = () => view.container.querySelector('[role="status"]')?.textContent
      const before = pond()

      fireEvent.click(buttons()[0]) // the green frog behind another green one
      expect(dispatch).not.toHaveBeenCalled()
      expect(buttons()[0].className).toContain('flash')
      expect(view.container.querySelector('[data-hop]')?.className).toContain('shake')
      expect(said()).toBe(
        'A frog only jumps over a frog of the other colour. Left to right: a green frog, ' +
          'a green frog, the free stone, a blue frog, a blue frog.',
      )

      runCue()
      // Every frog back where it was, and both cues off by themselves.
      expect(pond()).toBe(before)
      expect(dispatch).not.toHaveBeenCalled()
      // The sentence outlasts the cue: under reduced motion it is all there is.
      expect(said()).toContain('A frog only jumps over a frog of the other colour.')
    })

    it('still sends the hops that are real', () => {
      const { dispatch, buttons } = paint(read('GG_BB'))
      fireEvent.click(buttons()[1])
      expect(dispatch).toHaveBeenCalledTimes(1)
      expect(dispatch).toHaveBeenCalledWith({ type: 'hop', from: 1 })
    })
  })

  it('leaves the title, hints, move count and win message to the shell', () => {
    paint(init(levels[0]))
    const text = document.body.textContent ?? ''
    expect(text).not.toContain(frogLeap.title)
    expect(text).not.toContain(frogLeap.tagline)
    for (const line of frogLeap.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|moves?|undo|reset|solved|well done)\b/i)
    expect(text).not.toContain(STUCK)
  })
})
