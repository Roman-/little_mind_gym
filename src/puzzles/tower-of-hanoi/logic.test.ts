import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeRng } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { towerOfHanoi } from './index'
import type { HanoiAction, HanoiConfig, HanoiState } from './logic'
import {
  GOAL_PEG,
  PEG_COUNT,
  PEG_LETTERS,
  PEG_NAMES,
  canMove,
  describeDisc,
  describeMove,
  init,
  isSolved,
  isWellFormed,
  legalMoves,
  reduce,
  stateKey,
  topOf,
} from './logic'

const levels = towerOfHanoi.levels as PuzzleLevel<HanoiConfig>[]

/** All nine (from, to) pairs, legal or not — the search filters by `reduce` alone. */
const ALL_MOVES: HanoiAction[] = []
for (let from = 0; from < PEG_COUNT; from++) {
  for (let to = 0; to < PEG_COUNT; to++) ALL_MOVES.push({ type: 'move', from, to })
}

/**
 * The shortest solution, searched over every (from, to) pair rather than over
 * `legalMoves`, so a bug shared between the move list and the rule cannot make
 * the search agree with itself.
 */
const solve = (state: HanoiState) =>
  shortestSolution<HanoiState, HanoiAction>({
    start: state,
    moves: () => ALL_MOVES,
    apply: reduce,
    key: stateKey,
    solved: isSolved,
  })

/** Every position reachable from `start`, walked without the shared search. */
function allStates(start: HanoiState): HanoiState[] {
  const seen = new Map<string, HanoiState>([[stateKey(start), start]])
  const queue: HanoiState[] = [start]
  while (queue.length > 0) {
    const state = queue.shift() as HanoiState
    for (const action of ALL_MOVES) {
      const next = reduce(state, action)
      if (next === state) continue
      const k = stateKey(next)
      if (seen.has(k)) continue
      seen.set(k, next)
      queue.push(next)
    }
  }
  return [...seen.values()]
}

/* --- a second, independent model: pos[size] = which peg that disc is on ----- */

type Pos = number[]
const posOf = (state: HanoiState): Pos => {
  const pos = new Array<number>(state.discs + 1).fill(-1)
  state.pegs.forEach((peg, i) => peg.forEach((size) => (pos[size] = i)))
  return pos
}
const posKey = (p: Pos) => p.slice(1).join(',')
const smallestOn = (p: Pos, peg: number) => {
  for (let size = 1; size < p.length; size++) if (p[size] === peg) return size
  return 0
}
function posMoves(p: Pos): [number, number][] {
  const out: [number, number][] = []
  for (let from = 0; from < PEG_COUNT; from++) {
    for (let to = 0; to < PEG_COUNT; to++) {
      if (from === to) continue
      const disc = smallestOn(p, from)
      if (disc === 0) continue
      const blocker = smallestOn(p, to)
      if (blocker !== 0 && blocker < disc) continue
      out.push([from, to])
    }
  }
  return out
}
function posApply(p: Pos, [from, to]: [number, number]): Pos {
  const q = p.slice()
  q[smallestOn(p, from)] = to
  return q
}

/** The textbook recursive solution — an independent witness that par is reachable. */
function recursivePlan(n: number, from: number, to: number, via: number): HanoiAction[] {
  if (n === 0) return []
  return [
    ...recursivePlan(n - 1, from, via, to),
    { type: 'move', from, to } as HanoiAction,
    ...recursivePlan(n - 1, via, to, from),
  ]
}

function replay(state: HanoiState, plan: HanoiAction[]): HanoiState {
  return plan.reduce((current, action) => {
    const next = reduce(current, action)
    expect(next, `move ${action.from}->${action.to} was rejected`).not.toBe(current)
    expect(isWellFormed(next)).toBe(true)
    return next
  }, state)
}

describe('tower of hanoi — levels', () => {
  for (const level of levels) {
    const n = level.config.discs

    it(`"${level.label}" starts as one stack on the left peg, unsolved`, () => {
      const state = init(level)
      expect(state.discs).toBe(n)
      expect(state.pegs[0]).toEqual(Array.from({ length: n }, (_, i) => n - i))
      expect(state.pegs[1]).toEqual([])
      expect(state.pegs[2]).toEqual([])
      expect(isWellFormed(state)).toBe(true)
      expect(isSolved(state)).toBe(false)
      // Not solvable in one move either — the start is a real puzzle.
      expect(legalMoves(state).some((m) => isSolved(reduce(state, m)))).toBe(false)
    })

    it(`"${level.label}" is solvable in exactly par (${level.par}) moves`, () => {
      const path = solve(init(level))
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
      // The shortest path is not just the right length — it really solves it.
      expect(isSolved(replay(init(level), path as HanoiAction[]))).toBe(true)
    })

    it(`"${level.label}" par matches a second, independently written model`, () => {
      const start = posOf(init(level))
      const path = shortestSolution<Pos, [number, number]>({
        start,
        moves: posMoves,
        apply: posApply,
        key: posKey,
        solved: (p) => p.slice(1).every((peg) => peg === GOAL_PEG),
      })
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
      expect(level.par).toBe(2 ** n - 1)
    })

    it(`"${level.label}" is reachable by the recursive plan in par moves`, () => {
      const plan = recursivePlan(n, 0, GOAL_PEG, 1)
      expect(plan.length).toBe(level.par)
      expect(isSolved(replay(init(level), plan))).toBe(true)
    })

    it(`"${level.label}" offers the same moves as the independent model everywhere`, () => {
      for (const state of allStates(init(level))) {
        const mine = legalMoves(state)
          .map((m) => `${m.from}${m.to}`)
          .sort()
        const theirs = posMoves(posOf(state))
          .map(([a, b]) => `${a}${b}`)
          .sort()
        expect(mine).toEqual(theirs)
        expect(mine.length).toBeGreaterThan(0) // no dead ends anywhere
      }
    })

    it(`"${level.label}" has no dead ends — all 3^${n} positions are reachable`, () => {
      expect(
        reachableCount<HanoiState, HanoiAction>({
          start: init(level),
          moves: legalMoves,
          apply: reduce,
          key: stateKey,
        }),
      ).toBe(3 ** n)
    })

    it(`"${level.label}" has exactly one solved position in the whole graph`, () => {
      const solved = allStates(init(level)).filter(isSolved)
      expect(solved).toHaveLength(1)
      expect(solved[0].pegs).toEqual([[], [], Array.from({ length: n }, (_, i) => n - i)])
    })
  }

  it('ramps 1 → 2 → 3 with three hints and a stable id each', () => {
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['hanoi-3', 'hanoi-4', 'hanoi-5'])
    expect(levels.map((l) => l.label)).toEqual(['Three discs', 'Four discs', 'Five discs'])
    expect(levels.map((l) => l.config.discs)).toEqual([3, 4, 5])
    expect(levels.map((l) => l.par)).toEqual([7, 15, 31])
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    const lines = [...towerOfHanoi.instructions, ...levels.flatMap((l) => l.hints)]
    for (const level of levels) expect(level.hints).toHaveLength(3)
    expect(towerOfHanoi.instructions.length).toBeGreaterThanOrEqual(2)
    expect(towerOfHanoi.instructions.length).toBeLessThanOrEqual(4)
    // The first thing a player must be told is where the tower has to end up.
    expect(towerOfHanoi.instructions[0]).toMatch(/peg C/)
    for (const line of lines) {
      expect(line, line).toMatch(/^[A-Z]/)
      expect(line, line).toMatch(/\.$/)
      expect(line.length, line).toBeLessThanOrEqual(140)
      expect(line, line).not.toMatch(/[!]/)
      expect(line, line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}]/u)
    }
  })

  it('nudges in the hints instead of handing over the algorithm', () => {
    for (const level of levels) {
      for (const hint of level.hints) {
        // Naming two pegs in one breath is a move, not a nudge.
        expect((hint.match(/peg [ABC]/g) ?? []).length, hint).toBeLessThanOrEqual(1)
        // Nor may a hint recite the order the smallest disc travels in, which
        // together with "never move it back" is the whole solution.
        expect(hint, hint).not.toMatch(/left.*(middle|right)/i)
        expect(hint, hint).not.toMatch(/\bA\b.*\bB\b/)
      }
    }
  })

  it('describes itself for the index row without hype', () => {
    expect(towerOfHanoi.id).toBe('tower-of-hanoi')
    expect(towerOfHanoi.title).toBe('Tower of Hanoi')
    expect(towerOfHanoi.tagline).toMatch(/\.$/)
  })
})

describe('tower of hanoi — rules', () => {
  const level = levels[0]
  const start = init(level) // pegs: [[3, 2, 1], [], []]

  it('returns the identical state object for every illegal move', () => {
    const rejected: HanoiAction[] = [
      { type: 'move', from: 0, to: 0 }, // nowhere
      { type: 'move', from: 1, to: 1 },
      { type: 'move', from: 1, to: 0 }, // empty source
      { type: 'move', from: 2, to: 1 },
      { type: 'move', from: -1, to: 1 }, // off the board
      { type: 'move', from: 0, to: 3 },
      { type: 'move', from: 3, to: 0 },
      { type: 'move', from: 0, to: 1.5 }, // not a peg
      { type: 'move', from: Number.NaN, to: 1 },
      { type: 'move', from: 0, to: Number.POSITIVE_INFINITY },
    ]
    for (const action of rejected) {
      expect(reduce(start, action), JSON.stringify(action)).toBe(start)
    }
    expect(reduce(start, { type: 'never' } as unknown as HanoiAction)).toBe(start)
    expect(reduce(start, undefined as unknown as HanoiAction)).toBe(start)
    // …and a legal move must NOT return the same object.
    expect(reduce(start, { type: 'move', from: 0, to: 2 })).not.toBe(start)
  })

  it('refuses to put a big disc on a smaller one', () => {
    const mid: HanoiState = { discs: 3, pegs: [[3, 2], [1], []] }
    expect(canMove(mid, 0, 1)).toBe(false)
    expect(reduce(mid, { type: 'move', from: 0, to: 1 })).toBe(mid)
    expect(canMove(mid, 0, 2)).toBe(true)
    expect(canMove(mid, 1, 0)).toBe(true)
    expect(reduce(mid, { type: 'move', from: 0, to: 2 }).pegs).toEqual([[3], [1], [2]])
  })

  it('agrees with canMove on every reachable position, and never mutates anything', () => {
    for (const level5 of levels) {
      const states = allStates(init(level5))
      expect(states).toHaveLength(3 ** level5.config.discs)
      const before = states.map((state) => JSON.stringify(state))
      for (const state of states) {
        expect(isWellFormed(state)).toBe(true)
        for (const action of ALL_MOVES) {
          const next = reduce(state, action)
          expect(next === state).toBe(!canMove(state, action.from, action.to))
          if (next === state) continue
          expect(topOf(next, action.to)).toBe(topOf(state, action.from))
          expect(next.pegs[action.from].length).toBe(state.pegs[action.from].length - 1)
          expect(next.pegs[action.to].length).toBe(state.pegs[action.to].length + 1)
          expect(next.discs).toBe(state.discs)
          // fresh arrays for the two pegs it touched: nothing is edited in place
          expect(next.pegs).not.toBe(state.pegs)
          expect(next.pegs[action.from]).not.toBe(state.pegs[action.from])
          expect(next.pegs[action.to]).not.toBe(state.pegs[action.to])
        }
      }
      expect(states.map((state) => JSON.stringify(state))).toEqual(before)
    }
  })

  it('offers only the legal moves', () => {
    expect(legalMoves(start)).toEqual([
      { type: 'move', from: 0, to: 1 },
      { type: 'move', from: 0, to: 2 },
    ])
    const lifted = reduce(start, { type: 'move', from: 0, to: 1 })
    expect(legalMoves(lifted)).toEqual([
      { type: 'move', from: 0, to: 2 },
      { type: 'move', from: 1, to: 0 },
      { type: 'move', from: 1, to: 2 },
    ])
  })

  it('is solved only when every disc is stacked on peg C', () => {
    expect(isSolved({ discs: 3, pegs: [[], [3, 2, 1], []] })).toBe(false)
    expect(isSolved({ discs: 3, pegs: [[3], [], [2, 1]] })).toBe(false)
    expect(isSolved({ discs: 3, pegs: [[3, 2, 1], [], []] })).toBe(false)
    expect(isSolved({ discs: 3, pegs: [[], [], [3, 2, 1]] })).toBe(true)
    expect(isSolved({ discs: 0, pegs: [[], [], []] })).toBe(false)
  })

  it('describes a move in the same words the board uses', () => {
    expect(PEG_NAMES).toEqual(PEG_LETTERS.map((letter) => `peg ${letter}`))
    expect(describeMove(start, start, { type: 'move', from: 0, to: 1 })).toBe(
      'Moved the small disc to peg B',
    )
    const four = init(levels[1])
    expect(describeMove(four, four, { type: 'move', from: 0, to: 2 })).toBe(
      'Moved the smallest disc to peg C',
    )
    const mid: HanoiState = { discs: 3, pegs: [[3, 2], [1], []] }
    expect(describeMove(mid, mid, { type: 'move', from: 0, to: 2 })).toBe(
      'Moved the middle disc to peg C',
    )
    expect(describeMove(mid, mid, { type: 'move', from: 0, to: 1 })).toBe('Nothing moved')
    expect(describeDisc(6, 6)).toBe('disc 6')
  })

  it('names every disc of every level with a distinct word', () => {
    for (const level6 of levels) {
      const n = level6.config.discs
      const names = Array.from({ length: n }, (_, i) => describeDisc(i + 1, n))
      expect(new Set(names).size).toBe(n)
      for (const name of names) expect(name).toMatch(/^the .+ disc$/)
    }
  })

  it('never leaves the player stuck, so it declares no failures', () => {
    expect(towerOfHanoi.engine.failure).toBeUndefined()
  })

  it('never touches the rng, so every seed gives the same start', () => {
    let calls = 0
    for (let seed = 1; seed <= 50; seed++) {
      const inner = makeRng(seed)
      const rng = () => {
        calls += 1
        return inner()
      }
      for (const level7 of levels) {
        const state = towerOfHanoi.engine.init(level7, rng)
        expect(stateKey(state)).toBe(stateKey(init(level7)))
        expect(isSolved(state)).toBe(false)
      }
    }
    expect(calls).toBe(0)
    expect(towerOfHanoi.reseedable).toBe(false)
    // Two starts never share a mutable array.
    expect(init(levels[0]).pegs[0]).not.toBe(init(levels[0]).pegs[0])
  })
})

describe('tower of hanoi — board', () => {
  afterEach(cleanup)

  const show = (state: HanoiState, locked = false) => {
    const dispatch = vi.fn()
    const view = render(createElement(towerOfHanoi.engine.Board, { state, dispatch, locked }))
    return { dispatch, view, pegs: () => screen.getAllByRole('button') }
  }

  const discsOn = (view: { container: HTMLElement }, peg: number) =>
    view.container.querySelectorAll('button')[peg].querySelectorAll('[class*="disc"]')

  it('lifts a disc on the first tap and moves it on the second', () => {
    const { dispatch, pegs } = show(init(levels[0]))
    expect(pegs()).toHaveLength(3)
    expect(pegs()[0]).toHaveAttribute('aria-label', 'Lift the small disc off peg A.')
    expect(pegs()[1]).toBeDisabled()
    expect(pegs()[2]).toBeDisabled()

    fireEvent.click(pegs()[0])
    expect(dispatch).not.toHaveBeenCalled()
    expect(pegs()[0]).toHaveAttribute('aria-pressed', 'true')
    expect(pegs()[0]).toHaveAttribute('aria-label', 'Put the small disc back on peg A.')
    expect(pegs()[1]).toBeEnabled()
    expect(pegs()[2]).toHaveAttribute(
      'aria-label',
      'Drop the small disc on peg C. Peg C is empty.',
    )

    fireEvent.click(pegs()[2])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'move', from: 0, to: 2 })
  })

  it('puts the disc back when the armed peg is tapped again', () => {
    const { dispatch, pegs } = show(init(levels[0]))
    fireEvent.click(pegs()[0])
    fireEvent.click(pegs()[0])
    expect(dispatch).not.toHaveBeenCalled()
    expect(pegs()[0]).toHaveAttribute('aria-pressed', 'false')
    expect(pegs()[1]).toBeDisabled()
  })

  it('does not let a peg that would break the rule look pressable', () => {
    const { dispatch, pegs, view } = show({ discs: 3, pegs: [[3, 2], [1], []] })
    fireEvent.click(pegs()[0])
    expect(pegs()[1]).toBeDisabled()
    expect(pegs()[1]).toHaveAttribute(
      'aria-label',
      'The middle disc is too big for peg B. Peg B has 1 disc, and the small disc is on top.',
    )
    expect(pegs()[2]).toBeEnabled()
    fireEvent.click(pegs()[1])
    expect(dispatch).not.toHaveBeenCalled()
    // The drop mark marks the legal peg, and only the legal peg.
    const marks = view.container.querySelectorAll('[class*="mark"][data-show="true"]')
    expect(marks).toHaveLength(1)
    expect(pegs()[2].contains(marks[0])).toBe(true)
  })

  it('lifts exactly one disc, the top one, and only on the armed peg', () => {
    const { pegs, view } = show({ discs: 3, pegs: [[3, 2], [1], []] })
    expect(view.container.querySelectorAll('[data-lifted="true"]')).toHaveLength(0)
    fireEvent.click(pegs()[0])
    const lifted = view.container.querySelectorAll('[data-lifted="true"]')
    expect(lifted).toHaveLength(1)
    expect(lifted[0]).toBe(discsOn(view, 0)[1]) // the size-2 disc, drawn last = on top
  })

  it('ignores every input while locked', () => {
    const { dispatch, pegs } = show(init(levels[0]), true)
    for (const peg of pegs()) expect(peg).toBeDisabled()
    fireEvent.click(pegs()[0])
    fireEvent.click(pegs()[2])
    expect(dispatch).not.toHaveBeenCalled()
    expect(pegs()[0]).toHaveAttribute(
      'aria-label',
      'Peg A has 3 discs, and the small disc is on top.',
    )
  })

  it('draws one bar per disc and forgets the lift when the state changes', () => {
    const state = init(levels[0])
    const dispatch = vi.fn()
    const view = render(createElement(towerOfHanoi.engine.Board, { state, dispatch, locked: false }))
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')

    // A re-render that does not change the state keeps the selection…
    view.rerender(createElement(towerOfHanoi.engine.Board, { state, dispatch, locked: false }))
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')

    // …but a new state (a move, an undo, a rewind) always clears it.
    const moved = reduce(state, { type: 'move', from: 0, to: 2 })
    view.rerender(createElement(towerOfHanoi.engine.Board, { state: moved, dispatch, locked: false }))
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'false')
    expect(view.container.querySelectorAll('[data-lifted="true"]')).toHaveLength(0)
    expect(view.container.querySelectorAll('[class*="disc"]')).toHaveLength(3)
    expect(discsOn(view, 0)).toHaveLength(2)
    expect(discsOn(view, 2)).toHaveLength(1)
  })

  it('drops the selection on an undo, even back to a position that looks the same', () => {
    const state = init(levels[0])
    const dispatch = vi.fn()
    const props = (s: HanoiState) => ({ state: s, dispatch, locked: false })
    const view = render(createElement(towerOfHanoi.engine.Board, props(state)))
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')

    // move, then step back — peg A once again has the small disc on top, but the
    // player has not chosen it this time round.
    const moved = reduce(state, { type: 'move', from: 0, to: 2 })
    view.rerender(createElement(towerOfHanoi.engine.Board, props(moved)))
    view.rerender(createElement(towerOfHanoi.engine.Board, props(init(levels[0]))))
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'false')
    expect(view.container.querySelectorAll('[data-lifted="true"]')).toHaveLength(0)
    expect(view.container.querySelectorAll('[data-show="true"]')).toHaveLength(0)
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = reduce(init(levels[2]), { type: 'move', from: 0, to: 1 })
    const a = render(createElement(towerOfHanoi.engine.Board, { state, dispatch: vi.fn(), locked: false }))
    const first = a.container.innerHTML
    cleanup()
    const b = render(createElement(towerOfHanoi.engine.Board, { state, dispatch: vi.fn(), locked: false }))
    expect(b.container.innerHTML).toBe(first)
  })

  it('draws the discs at visibly different widths, biggest at the bottom', () => {
    const { view } = show(init(levels[2]))
    const widths = [...discsOn(view, 0)].map((d) =>
      Number.parseFloat((d as HTMLElement).style.getPropertyValue('--disc-w')),
    )
    const colours = [...discsOn(view, 0)].map((d) =>
      (d as HTMLElement).style.getPropertyValue('--disc-color'),
    )
    expect(widths).toHaveLength(5)
    for (const w of widths) expect(w).toBeGreaterThan(0)
    // DOM order is bottom-first, so widths must shrink all the way up the peg.
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i], `disc ${i} is not narrower than the one below it`).toBeLessThan(
        widths[i - 1] - 5,
      )
    }
    expect(widths[0]).toBeLessThanOrEqual(100)
    expect(new Set(colours).size).toBe(5)
  })

  it('gives every peg a real button, a press shadow and an aria-label', () => {
    const { pegs } = show(init(levels[2]))
    for (const peg of pegs()) {
      expect(peg).toHaveAttribute('type', 'button')
      expect(peg.className).toContain('u-press')
      expect(peg.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(8)
    }
  })

  it('renders the goal and the pegs — the shell owns everything else', () => {
    const { view } = show(init(levels[0]))
    expect(view.container.querySelectorAll('h1, h2, h3, h4')).toHaveLength(0)
    // One goal sentence, the three peg letters and the screen-reader status.
    // No other words at all: no title, no counter, no hint, no win message.
    expect(view.container.textContent).toBe(
      'Get the whole tower onto peg C.ABCYou are not holding a disc.',
    )
  })

  it('flags the goal peg with a mark on the peg, and marks no other peg', () => {
    const { view, pegs } = show(init(levels[0]))
    const flags = view.container.querySelectorAll('[class*="flag"]')
    expect(flags).toHaveLength(1)
    expect(pegs()[GOAL_PEG].contains(flags[0])).toBe(true)
    expect(GOAL_PEG).toBe(2)
    // A mark, not a word: the flag says nothing a reader has to decode.
    expect(flags[0].textContent).toBe('')
  })

  it('announces what is in the air for a screen reader', () => {
    const { pegs, view } = show(init(levels[0]))
    const status = () => view.container.querySelector('[role="status"]')?.textContent
    expect(status()).toBe('You are not holding a disc.')
    fireEvent.click(pegs()[0])
    expect(status()).toBe('You are holding the small disc above peg A.')
  })
})
