import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PuzzleLevel } from '../../lib/types'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import { Board } from './Board'
import { lightsOut } from './index'
import type { LightsAction, LightsConfig, LightsState } from './logic'
import {
  allSolutions,
  boardFrom,
  describeMove,
  firstBoard,
  init,
  isSolved,
  litCount,
  minimalSolution,
  needsExactly,
  neighbourhood,
  pressAt,
  reduce,
  scramble,
} from './logic'
import { readFileSync } from 'node:fs'

/** The stylesheet as written, so the design rules can be asserted on it. */
// (Built by hand rather than `new URL('./x', import.meta.url)`, which Vite rewrites.)
const css = readFileSync(
  new URL(import.meta.url).pathname.replace(/[^/]+$/, 'board.module.css'),
  'utf8',
)

const levels = lightsOut.levels as PuzzleLevel<LightsConfig>[]
/** 50 unrelated seeds, spread out so consecutive runs of mulberry32 do not overlap. */
const SEEDS = Array.from({ length: 50 }, (_, i) => 1013 + i * 7919)

const start = (level: PuzzleLevel<LightsConfig>, seed: number) => init(level, makeRng(seed))

const press = (state: LightsState, indices: readonly number[]) =>
  indices.reduce<LightsState>((s, index) => reduce(s, { type: 'press', index }), state)

const shape = (state: LightsState) => state.lit.map((on) => (on ? '1' : '0')).join('')

/** Column p of the toggle matrix, as a bitmask. Built from the primitive the board uses. */
const maskOf = (state: LightsState, index: number) =>
  neighbourhood(state.width, state.height, index).reduce((m, i) => m | (1 << i), 0)

const litMask = (lit: readonly boolean[]) => lit.reduce((m, on, i) => (on ? m | (1 << i) : m), 0)

/** Every subset of presses that clears the board, found the dumb way. Only for <= 16 lamps. */
function bruteForceSolutions(state: LightsState): number[][] {
  const n = state.width * state.height
  const masks = Array.from({ length: n }, (_, i) => maskOf(state, i))
  const target = litMask(state.lit)
  const found: number[][] = []
  for (let subset = 0; subset < 1 << n; subset++) {
    let acc = 0
    const chosen: number[] = []
    for (let i = 0; i < n; i++) {
      if ((subset >>> i) & 1) {
        acc ^= masks[i]
        chosen.push(i)
      }
    }
    if (acc === target) found.push(chosen)
  }
  return found
}

/**
 * Exhaustive, solver-free minimality check: is there ANY set of fewer than
 * `limit` presses that clears the board? Walks every subset of size < limit.
 */
function anySolutionSmallerThan(state: LightsState, limit: number): number[] | null {
  const n = state.width * state.height
  const masks = Array.from({ length: n }, (_, i) => maskOf(state, i))
  const target = litMask(state.lit)
  const chosen: number[] = []
  const walk = (from: number, acc: number): number[] | null => {
    if (acc === target) return chosen.slice()
    if (chosen.length + 1 >= limit) return null
    for (let i = from; i < n; i++) {
      chosen.push(i)
      const hit = walk(i + 1, acc ^ masks[i])
      chosen.pop()
      if (hit) return hit
    }
    return null
  }
  return walk(0, 0)
}

const asKeys = (sets: number[][]) => new Set(sets.map((s) => s.join(',')))

/** Which of the top-row lamps a solution presses, as a bitmask. */
const topRowOf = (solution: readonly number[], width: number) =>
  solution.reduce((m, i) => (i < width ? m | (1 << i) : m), 0)

/** Presses the top row per `top`, then chases every lit lamp downwards. */
function chase(state: LightsState, top: number): LightsState {
  const { width, height } = state
  let s = state
  for (let c = 0; c < width; c++) if ((top >>> c) & 1) s = reduce(s, { type: 'press', index: c })
  for (let row = 0; row + 1 < height; row++) {
    for (let c = 0; c < width; c++) {
      const above = row * width + c
      if (s.lit[above]) s = reduce(s, { type: 'press', index: above + width })
    }
  }
  return s
}

/* ================================================================== */

describe('lights out — the levels', () => {
  it('are three, escalating, with stable ids and three hints each', () => {
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['lights-3x3', 'lights-4x4', 'lights-5x5'])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      for (const hint of level.hints) {
        expect(hint.trim().length).toBeGreaterThan(20)
        // A hint an eight-year-old will actually read to the end.
        expect(hint.length).toBeLessThanOrEqual(140)
      }
      // Sentence case: a capital first, and no other word shouting.
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
    }
  })

  it('declares a par on every level, and it grows with the board', () => {
    expect(levels.map((l) => l.par)).toEqual([4, 6, 8])
    for (const level of levels) expect(level.par).toBe(level.config.presses)
    const pars = levels.map((l) => l.par as number)
    expect(pars[0]).toBeLessThan(pars[1])
    expect(pars[1]).toBeLessThan(pars[2])
    // Never a one-press "puzzle" on any level.
    for (const par of pars) expect(par).toBeGreaterThan(2)
  })

  it('grows: 3x3, then 4x4, then 5x5', () => {
    expect(levels.map((l) => [l.config.width, l.config.height])).toEqual([
      [3, 3],
      [4, 4],
      [5, 5],
    ])
  })

  it('says what it is, in plain words and with no emoji', () => {
    const copy = [
      lightsOut.title,
      lightsOut.tagline,
      ...lightsOut.instructions,
      ...levels.flatMap((l) => [l.label, ...l.hints]),
    ]
    for (const line of copy) {
      expect(line).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(line).not.toMatch(/!/)
    }
    expect(lightsOut.instructions.length).toBeGreaterThanOrEqual(2)
    expect(lightsOut.instructions.length).toBeLessThanOrEqual(4)
    expect(lightsOut.id).toBe('lights-out')
    expect(lightsOut.reseedable).toBe(true)
    // The rule as written must be true at the edges too: a corner press flips 3 lamps.
    expect(lightsOut.instructions.join(' ')).not.toMatch(/four lamps beside/)
    expect(neighbourhood(5, 5, 0)).toHaveLength(3)
  })
})

describe('lights out — generation', () => {
  for (const level of levels) {
    const par = level.par as number

    it(`"${level.label}" gives a lit, solvable board needing exactly ${par} presses, for 50 seeds`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(state.lit).toHaveLength(level.config.width * level.config.height)
        expect(state.width).toBe(level.config.width)
        expect(state.height).toBe(level.config.height)
        // Never already solved, never a one-press giveaway.
        expect(isSolved(state)).toBe(false)
        expect(litCount(state)).toBeGreaterThan(0)
        const solution = minimalSolution(state.lit, state.width, state.height)
        expect(solution).not.toBeNull()
        expect(solution).toHaveLength(par)
        // ...and that solution really clears it.
        expect(isSolved(press(state, solution as number[]))).toBe(true)
      }
    })

    it(`"${level.label}" — every member of the solution set clears the board`, () => {
      for (const seed of SEEDS.slice(0, 12)) {
        const state = start(level, seed)
        const all = allSolutions(state.lit, state.width, state.height)
        expect(all.length).toBeGreaterThan(0)
        for (const candidate of all) expect(isSolved(press(state, candidate))).toBe(true)
      }
    })

    it(`"${level.label}" is deterministic for a seed and varied across seeds`, () => {
      for (const seed of SEEDS.slice(0, 5)) {
        expect(start(level, seed)).toEqual(start(level, seed))
      }
      const shapes = new Set(SEEDS.map((seed) => shape(start(level, seed))))
      expect(shapes.size).toBeGreaterThanOrEqual(20)
    })

    it(`"${level.label}" has a deterministic fallback board, so \`scramble\` cannot throw`, () => {
      const settled = firstBoard(level.config.width, level.config.height, par)
      expect(settled).not.toBeNull()
      expect(minimalSolution(settled as boolean[], level.config.width, level.config.height))
        .toHaveLength(par)
    })
  }

  it('rejects the scrambles that would hand the player a shorter puzzle', () => {
    // Two presses on the same lamp cancel: the naive "k random presses" scramble
    // this replaced produced a one-press 3x3 for roughly a third of all seeds.
    const cancelled = boardFrom(3, 3, [4, 4, 0])
    expect(minimalSolution(cancelled, 3, 3)).toEqual([0])
    expect(needsExactly(cancelled, 3, 3, 3)).toBe(false)
    expect(needsExactly(boardFrom(3, 3, [0, 1, 2]), 3, 3, 3)).toBe(true)
  })

  it('never mutates the level it is handed', () => {
    const level = Object.freeze({
      ...levels[2],
      config: Object.freeze({ ...levels[2].config }),
      hints: Object.freeze([...levels[2].hints]) as unknown as string[],
    }) as PuzzleLevel<LightsConfig>
    const before = JSON.stringify(level)
    const state = init(level, makeRng(99))
    expect(JSON.stringify(level)).toBe(before)
    expect(state.lit).toHaveLength(25)
  })

  it('uses the rng: two seeds, two boards', () => {
    const a = scramble(5, 5, 8, makeRng(1))
    const b = scramble(5, 5, 8, makeRng(2))
    expect(a).not.toEqual(b)
  })
})

describe('lights out — par, re-derived without the solver', () => {
  it('matches breadth-first search on the 3x3, for all 50 seeds', () => {
    const level = levels[0]
    for (const seed of SEEDS) {
      const state = start(level, seed)
      const path = shortestSolution<LightsState, LightsAction>({
        start: state,
        moves: (s) => s.lit.map((_, index) => ({ type: 'press', index })),
        apply: reduce,
        key: shape,
        solved: isSolved,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(level.par as number)
    }
  })

  it('matches breadth-first search on the 4x4, for 12 seeds', () => {
    const level = levels[1]
    for (const seed of SEEDS.slice(0, 12)) {
      const state = start(level, seed)
      const path = shortestSolution<LightsState, LightsAction>({
        start: state,
        moves: (s) => s.lit.map((_, index) => ({ type: 'press', index })),
        apply: reduce,
        key: shape,
        solved: isSolved,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(level.par as number)
      // The path BFS found really is a solution.
      expect(isSolved(press(state, (path as LightsAction[]).map((a) => a.index)))).toBe(true)
    }
  })

  it('has no shorter answer, by exhaustive subset search — every level', () => {
    // The 5x5 is far too big for BFS (2^23 reachable boards), so prove minimality
    // directly: no set of fewer than par presses clears it.
    for (const level of levels) {
      const par = level.par as number
      const seeds = level.config.width === 5 ? SEEDS.slice(0, 3) : SEEDS.slice(0, 8)
      for (const seed of seeds) {
        const state = start(level, seed)
        expect(anySolutionSmallerThan(state, par)).toBeNull()
        // ...while a set of exactly par presses does exist.
        const solution = minimalSolution(state.lit, state.width, state.height) as number[]
        expect(anySolutionSmallerThan(state, par + 1)).toEqual(solution)
      }
    }
  })

  it('finds the whole solution set, and nothing but — 3x3 and 4x4, brute forced', () => {
    for (const level of [levels[0], levels[1]]) {
      for (const seed of SEEDS.slice(0, 6)) {
        const state = start(level, seed)
        const brute = bruteForceSolutions(state)
        expect(asKeys(allSolutions(state.lit, state.width, state.height))).toEqual(asKeys(brute))
        expect(Math.min(...brute.map((s) => s.length))).toBe(level.par)
      }
    }
  })

  it('returns null for a pattern no set of presses can reach', () => {
    // 4x4 has a 4-dimensional null space, so only 1 in 16 patterns is solvable.
    const lit = Array.from({ length: 16 }, (_, i) => i === 0)
    expect(minimalSolution(lit, 4, 4)).toBeNull()
    expect(allSolutions(lit, 4, 4)).toEqual([])
    expect(bruteForceSolutions({ width: 4, height: 4, lit })).toEqual([])
  })

  it('solves the already-dark board with no presses at all', () => {
    expect(minimalSolution(new Array(9).fill(false), 3, 3)).toEqual([])
  })

  it('is stable: the same board always yields the same shortest answer', () => {
    const state = start(levels[2], SEEDS[3])
    expect(minimalSolution(state.lit, state.width, state.height)).toEqual(
      minimalSolution(state.lit.slice(), state.width, state.height),
    )
  })
})

describe('lights out — the claims the hints make', () => {
  const claims = [
    { level: levels[0], solutions: 1, topRows: 1, of: 8 },
    { level: levels[1], solutions: 16, topRows: 16, of: 16 },
    { level: levels[2], solutions: 4, topRows: 4, of: 32 },
  ]

  for (const { level, solutions, topRows, of } of claims) {
    it(`"${level.label}" has exactly ${solutions} solution(s), ${topRows} of ${of} top rows`, () => {
      for (const seed of SEEDS.slice(0, 15)) {
        const state = start(level, seed)
        const all = allSolutions(state.lit, state.width, state.height)
        expect(all).toHaveLength(solutions)
        // A solution is pinned by its top row: the rest is forced by chasing downwards.
        expect(new Set(all.map((s) => topRowOf(s, state.width))).size).toBe(topRows)
        expect(of).toBe(1 << state.width)
      }
    })
  }

  it('"Nine lamps" hint 3: exactly one set of the nine turns everything off', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      expect(bruteForceSolutions(start(levels[0], seed))).toHaveLength(1)
    }
  })

  it('"Sixteen lamps" hint 3: chasing downwards always clears a 4x4', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const state = start(levels[1], seed)
      for (let top = 0; top < 16; top++) expect(isSolved(chase(state, top))).toBe(true)
    }
  })

  it('"Twenty-five lamps" hint 3: exactly four of the thirty-two top rows clear a 5x5', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const state = start(levels[2], seed)
      let works = 0
      for (let top = 0; top < 32; top++) if (isSolved(chase(state, top))) works++
      expect(works).toBe(4)
    }
  })
})

describe('lights out — the reducer', () => {
  const state = start(levels[1], SEEDS[0])

  it('flips the pressed lamp and its neighbours, and nothing else', () => {
    for (let i = 0; i < state.lit.length; i++) {
      const next = reduce(state, { type: 'press', index: i })
      expect(next).not.toBe(state)
      const expected = new Set(neighbourhood(state.width, state.height, i))
      for (let j = 0; j < state.lit.length; j++) {
        expect(next.lit[j]).toBe(expected.has(j) ? !state.lit[j] : state.lit[j])
      }
    }
  })

  it('flips a corner three ways, an edge four and the middle five', () => {
    expect(neighbourhood(4, 4, 0)).toEqual([0, 1, 4])
    expect(neighbourhood(4, 4, 1)).toEqual([0, 1, 2, 5])
    expect(neighbourhood(4, 4, 5)).toEqual([1, 4, 5, 6, 9])
    expect(neighbourhood(4, 4, 15)).toEqual([11, 14, 15])
    // Ascending and free of duplicates, whatever the cell.
    for (let i = 0; i < 25; i++) {
      const cells = neighbourhood(5, 5, i)
      expect(cells).toEqual([...cells].sort((a, b) => a - b))
      expect(new Set(cells).size).toBe(cells.length)
    }
  })

  it('undoes itself when the same lamp is pressed twice', () => {
    for (let i = 0; i < state.lit.length; i++) {
      expect(press(state, [i, i]).lit).toEqual(state.lit)
    }
  })

  it('does not care in which order the presses happen', () => {
    const order = [2, 7, 11, 5, 0]
    expect(press(state, order).lit).toEqual(press(state, order.slice().reverse()).lit)
  })

  it('returns the IDENTICAL state object for every action that changes nothing', () => {
    for (const index of [-1, -100, state.lit.length, state.lit.length + 40, 1.5, NaN, Infinity]) {
      expect(reduce(state, { type: 'press', index })).toBe(state)
    }
    // An action the engine does not know about must be ignored, not applied.
    for (const bogus of [{ type: 'nudge', index: 0 }, { type: '', index: 0 }, {}, null]) {
      expect(reduce(state, bogus as unknown as LightsAction)).toBe(state)
    }
  })

  it('never mutates the state it is given', () => {
    const frozen: LightsState = Object.freeze({
      width: state.width,
      height: state.height,
      lit: Object.freeze(state.lit.slice()) as unknown as boolean[],
    })
    const before = frozen.lit.slice()
    const next = reduce(frozen, { type: 'press', index: 5 })
    expect(frozen.lit).toEqual(before)
    expect(next.lit).not.toEqual(before)
    expect(next.lit).not.toBe(frozen.lit)
  })

  it('carries the board shape through untouched', () => {
    const next = reduce(state, { type: 'press', index: 0 })
    expect(next.width).toBe(state.width)
    expect(next.height).toBe(state.height)
    expect(next.lit).toHaveLength(state.lit.length)
  })

  it('is solved only when nothing is lit', () => {
    expect(isSolved(state)).toBe(false)
    const solution = minimalSolution(state.lit, state.width, state.height) as number[]
    for (let k = 0; k < solution.length; k++) {
      expect(isSolved(press(state, solution.slice(0, k)))).toBe(false)
    }
    expect(isSolved(press(state, solution))).toBe(true)
    // One lamp anywhere is enough to keep it unsolved.
    for (let i = 0; i < state.lit.length; i++) {
      const lit = new Array<boolean>(state.lit.length).fill(false)
      lit[i] = true
      expect(isSolved({ ...state, lit })).toBe(false)
    }
    // A board with no lamps at all is not a solved board.
    expect(isSolved({ width: 0, height: 0, lit: [] })).toBe(false)
  })

  it('names the move in row and column, one-based', () => {
    const wide = start(levels[2], SEEDS[0])
    const next = reduce(state, { type: 'press', index: 6 })
    expect(describeMove(state, next, { type: 'press', index: 6 })).toBe('Pressed row 2, column 3')
    expect(describeMove(state, next, { type: 'press', index: 0 })).toBe('Pressed row 1, column 1')
    expect(describeMove(wide, wide, { type: 'press', index: 24 })).toBe('Pressed row 5, column 5')
    expect(describeMove(wide, wide, { type: 'press', index: 6 })).toBe('Pressed row 2, column 2')
  })

  it('has no dead ends to step back from', () => {
    expect(lightsOut.engine.failure).toBeUndefined()
    // Nothing a player can do makes the board unsolvable: every press keeps a way home.
    const level = levels[2]
    let s = start(level, SEEDS[1])
    for (const index of [0, 12, 7, 24, 13, 3, 3, 18]) {
      s = reduce(s, { type: 'press', index })
      const way = minimalSolution(s.lit, s.width, s.height)
      expect(way).not.toBeNull()
      expect(isSolved(press(s, way as number[]))).toBe(true)
    }
  })

  it('exposes the same primitive the board draws with', () => {
    expect(pressAt(state.lit, state.width, state.height, 3)).toEqual(
      reduce(state, { type: 'press', index: 3 }).lit,
    )
    expect(litCount(state)).toBe(state.lit.filter(Boolean).length)
  })
})

describe('lights out — the styles', () => {
  it('uses tokens only: no hex colours, no raw durations, no font families', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3}/)
    expect(css).not.toMatch(/\b\d+m?s\b/)
    expect(css).not.toMatch(/font-family/)
    expect(css).not.toMatch(/\p{Extended_Pictographic}/u)
    // rgb()/hsl() are colours written by hand just as much as hex is.
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
  })

  it('keeps every lamp a 44px finger target and the board inside a 360px screen', () => {
    const cell = css.match(/--cell:\s*clamp\((\d+)px/)
    expect(cell).not.toBeNull()
    const min = Number((cell as RegExpMatchArray)[1])
    expect(min).toBeGreaterThanOrEqual(44)
    // 5 lamps + 4 gaps (--s2) + the scroller's padding (--s1) + the shell's
    // stage padding (--s3), both sides of each.
    expect(5 * min + 4 * 8 + 2 * 4 + 2 * 12).toBeLessThanOrEqual(360)
  })

  it('leaves the shadow to u-press and never invents its own', () => {
    expect(css).not.toMatch(/box-shadow:/)
  })
})

afterEach(cleanup)

describe('lights out — the board', () => {
  const mount = (state: LightsState, locked: boolean) => {
    const sent: LightsAction[] = []
    const view = render(
      createElement(Board, { state, locked, dispatch: (action: LightsAction) => sent.push(action) }),
    )
    return { sent, view }
  }

  const labelsOf = (state: LightsState) =>
    state.lit.map(
      (on, i) =>
        `Row ${Math.floor(i / state.width) + 1}, column ${(i % state.width) + 1}, ${on ? 'on' : 'off'}`,
    )

  it('gives every lamp a button with its own row, column and state', () => {
    const state = start(levels[0], SEEDS[0])
    mount(state, false)
    expect(screen.getAllByRole('button')).toHaveLength(9)
    for (const label of labelsOf(state)) expect(screen.getByLabelText(label)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Lamps, 3 rows and 3 columns' })).toBeInTheDocument()
  })

  it('counts the lamps still on, and says what to do about them', () => {
    const state = start(levels[0], SEEDS[0])
    const remaining = litCount(state)
    mount(state, false)
    expect(
      screen.getByText(
        remaining === 1
          ? '1 lamp is still on. Turn it off.'
          : `${remaining} lamps are still on. Turn them all off.`,
      ),
    ).toBeInTheDocument()
    cleanup()
    mount({ ...state, lit: state.lit.map(() => false) }, true)
    expect(screen.getByText('Every lamp is off.')).toBeInTheDocument()
  })

  it('draws every lamp as the bulb pictogram, and the index mark with it', () => {
    const state = start(levels[0], SEEDS[0])
    const { view } = mount(state, false)
    // OpenMoji artwork is 72x72; the glyphs we drew by hand were 24x24.
    const bulbs = view.container.querySelectorAll('button > svg[viewBox="0 0 72 72"]')
    expect(bulbs).toHaveLength(9)
    expect(view.container.querySelectorAll('svg')).toHaveLength(9)
    for (const bulb of bulbs) expect(bulb.getAttribute('aria-hidden')).toBe('true')
    cleanup()
    const icon = render(createElement(lightsOut.Icon))
    expect(icon.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 72 72')
  })

  it('dispatches exactly one press per tap, and nothing else', () => {
    const state = start(levels[0], SEEDS[0])
    const { sent } = mount(state, false)
    fireEvent.click(screen.getAllByRole('button')[4])
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(sent).toEqual([
      { type: 'press', index: 4 },
      { type: 'press', index: 0 },
    ])
  })

  it('renders nothing the shell already owns', () => {
    const state = start(levels[0], SEEDS[0])
    const { view } = mount(state, false)
    const text = view.container.textContent ?? ''
    for (const owned of [lightsOut.title, ...lightsOut.instructions, ...levels[0].hints]) {
      expect(text).not.toContain(owned)
    }
    expect(text).not.toMatch(/move|par|reset|undo|hint|solved|well done/i)
  })

  it('ignores every input while locked, and takes the lamps out of the tab order', () => {
    const state = start(levels[0], SEEDS[0])
    const { sent } = mount(state, true)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
      fireEvent.pointerEnter(button)
    }
    expect(sent).toEqual([])
  })

  it('is a pure function of state, so rewinding through the tape just works', () => {
    const before = start(levels[2], SEEDS[2])
    const after = press(before, [0, 13, 24])
    const { view } = mount(after, false)
    for (const label of labelsOf(after)) expect(screen.getByLabelText(label)).toBeInTheDocument()
    // Hand it an earlier state — the same instance must redraw that one exactly.
    view.rerender(createElement(Board, { state: before, locked: false, dispatch: () => {} }))
    for (const label of labelsOf(before)) expect(screen.getByLabelText(label)).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(25)
  })

  it('traces the lamps a press would flip, and drops the trace when the state moves on', () => {
    const state = start(levels[0], SEEDS[0])
    const { view } = mount(state, false)
    const buttons = screen.getAllByRole('button')
    fireEvent.pointerEnter(buttons[4])
    expect(view.container.querySelectorAll('[data-traced="true"]')).toHaveLength(5)
    fireEvent.pointerLeave(buttons[4])
    expect(view.container.querySelectorAll('[data-traced="true"]')).toHaveLength(0)
    // A corner traces three lamps, matching the rule as written.
    fireEvent.pointerEnter(buttons[0])
    expect(view.container.querySelectorAll('[data-traced="true"]')).toHaveLength(3)
    // A new state clears it, exactly as the contract asks of local board state.
    view.rerender(
      createElement(Board, {
        state: reduce(state, { type: 'press', index: 0 }),
        locked: false,
        dispatch: () => {},
      }),
    )
    expect(view.container.querySelectorAll('[data-traced="true"]')).toHaveLength(0)
  })

  it('marks the lit lamps, and only those', () => {
    const state = start(levels[1], SEEDS[4])
    const { view } = mount(state, false)
    const cells = [...view.container.querySelectorAll('[data-lit]')]
    expect(cells.map((c) => c.getAttribute('data-lit') === 'true')).toEqual(state.lit)
  })
})
