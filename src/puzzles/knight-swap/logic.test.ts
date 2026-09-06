import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../lib/settings'
import { underSettings } from '../../test/settings'
import { makeRng } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { BoardProps, PuzzleLevel } from '../../lib/types'
import { knightSwap } from './index'
import { Board } from './Board'
import type { HorsesAction, HorsesConfig, HorsesState, Team } from './logic'
import {
  JUMPS,
  MIDDLE,
  RING,
  SQUARES,
  SQUARE_NAMES,
  canJump,
  describeMove,
  horseCount,
  horsesHome,
  init,
  isHome,
  isSolved,
  legalMoves,
  readBoard,
  reduce,
  refusalOf,
  stateKey,
  teamWord,
} from './logic'

const levels = knightSwap.levels as PuzzleLevel<HorsesConfig>[]
const start = (level: PuzzleLevel<HorsesConfig>) => init(level)

/**
 * Every (from, to) pair on the board, legal or not. The searches run over this
 * rather than over `legalMoves`, so a bug shared between the move list and the
 * rule cannot make a search agree with itself.
 */
const ALL_MOVES: HorsesAction[] = []
for (let from = 0; from < SQUARES; from++) {
  for (let to = 0; to < SQUARES; to++) {
    if (from !== to) ALL_MOVES.push({ type: 'jump', from, to })
  }
}

const solve = (state: HorsesState) =>
  shortestSolution<HorsesState, HorsesAction>({
    start: state,
    moves: () => ALL_MOVES,
    apply: reduce,
    key: stateKey,
    solved: isSolved,
  })

/** Every position reachable from `start`, walked without the shared search. */
function allStates(from: HorsesState): HorsesState[] {
  const seen = new Map<string, HorsesState>([[stateKey(from), from]])
  const queue: HorsesState[] = [from]
  while (queue.length > 0) {
    const state = queue.shift() as HorsesState
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

/** How far every reachable position is from this one. The graph is undirected. */
function distances(from: HorsesState): Map<string, number> {
  const dist = new Map<string, number>([[stateKey(from), 0]])
  let frontier: HorsesState[] = [from]
  while (frontier.length > 0) {
    const next: HorsesState[] = []
    for (const state of frontier) {
      const d = dist.get(stateKey(state)) as number
      for (const action of ALL_MOVES) {
        const child = reduce(state, action)
        if (child === state) continue
        const k = stateKey(child)
        if (dist.has(k)) continue
        dist.set(k, d + 1)
        next.push(child)
      }
    }
    frontier = next
  }
  return dist
}

function replay(from: HorsesState, plan: HorsesAction[]): HorsesState {
  return plan.reduce((current, action) => {
    const next = reduce(current, action)
    expect(next, `jump ${action.from} to ${action.to} was rejected`).not.toBe(current)
    return next
  }, from)
}

/* --- a second, independently written model: the ring ---------------------- */

/**
 * The eight rim squares laid out in a row of beads that joins up at the ends.
 * A horse steps into an adjacent empty bead, and nothing in here knows what a
 * knight is or that there ever was a middle square. If this model and the
 * board's own rules agree on the shortest solution, the number is not an
 * artefact of one of them.
 */
type Beads = (Team | null)[]

const beadsOf = (squares: readonly (Team | null)[]): Beads => RING.map((i) => squares[i])

/** Which bead of the ring each rim square is. The middle is in no bead at all. */
const BEAD_OF = new Map<number, number>(RING.map((square, i) => [square, i]))

function beadMoves(beads: Beads): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    if (beads[i] === null) continue
    for (const step of [1, 7]) {
      const to = (i + step) % 8
      if (beads[to] === null) out.push([i, to])
    }
  }
  return out
}

function beadApply(beads: Beads, [from, to]: [number, number]): Beads {
  const next = beads.slice()
  next[to] = next[from]
  next[from] = null
  return next
}

const beadKey = (beads: Beads) => beads.map((team) => (team === null ? '.' : team[0])).join('')

afterEach(cleanup)

describe('the board itself', () => {
  it('joins the eight rim squares into one loop, and joins nothing to the middle', () => {
    // Every rim square has exactly two squares an L away; the middle has none,
    // and appears in nobody else's list.
    for (let i = 0; i < SQUARES; i++) {
      expect(JUMPS[i], `square ${i}`).toHaveLength(i === MIDDLE ? 0 : 2)
      expect(JUMPS[i], `square ${i}`).not.toContain(MIDDLE)
      // A jump is its own way back.
      for (const to of JUMPS[i]) expect(JUMPS[to], `${i} to ${to}`).toContain(i)
    }
    expect(MIDDLE).toBe(4)
  })

  it('is the same loop RING writes down, walked from end to end', () => {
    expect([...RING].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 5, 6, 7, 8])
    for (let i = 0; i < RING.length; i++) {
      expect(JUMPS[RING[i]], `${RING[i]} to ${RING[(i + 1) % 8]}`).toContain(RING[(i + 1) % 8])
    }
  })

  it('reads a board back the way it was written', () => {
    expect(readBoard('b.. ... ..g')).toEqual([
      'brown', null, null,
      null, null, null,
      null, null, 'grey',
    ])
    expect(readBoard('... ... ...')).toEqual(new Array(9).fill(null))
  })

  it('names all nine squares, each with its own words', () => {
    expect(SQUARE_NAMES).toHaveLength(SQUARES)
    expect(new Set(SQUARE_NAMES).size).toBe(SQUARES)
    expect(SQUARE_NAMES[MIDDLE]).toBe('middle')
    expect(teamWord('brown')).toBe('brown')
    expect(teamWord('grey')).toBe('grey')
  })
})

describe('the levels', () => {
  for (const level of levels) {
    const first = start(level)
    const horses = horseCount(first)
    const states = allStates(first)

    it(`"${level.label}" starts with ${horses} horses off their mats, and is not solved`, () => {
      expect(first.squares).toHaveLength(SQUARES)
      expect(first.goal).toHaveLength(SQUARES)
      expect(first.squares[MIDDLE]).toBeNull()
      expect(first.goal[MIDDLE]).toBeNull()
      // As many mats as horses, and one mat a team for every horse of that team.
      expect(horseCount({ ...first, squares: first.goal })).toBe(horses)
      expect(horsesHome(first)).toBe(0)
      expect(isSolved(first)).toBe(false)
      // Not solvable in one jump either — the start is a real puzzle.
      expect(legalMoves(first).some((m) => isSolved(reduce(first, m)))).toBe(false)
    })

    it(`"${level.label}" is solvable in exactly par (${level.par}) jumps`, () => {
      const path = solve(first)
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
      // The shortest path is not merely the right length — it really solves it.
      expect(isSolved(replay(first, path as HorsesAction[]))).toBe(true)
    })

    it(`"${level.label}" par matches a second, independently written model`, () => {
      const path = shortestSolution<Beads, [number, number]>({
        start: beadsOf(first.squares),
        moves: beadMoves,
        apply: beadApply,
        key: beadKey,
        solved: (beads) => beadKey(beads) === beadKey(beadsOf(first.goal)),
      })
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
    })

    it(`"${level.label}" par is four steps of the ring for each of its ${horses} horses`, () => {
      // The goal is the start turned half a turn round the eight-square ring,
      // so every horse walks four beads and no horse can shortcut.
      const turned: (Team | null)[] = new Array(SQUARES).fill(null)
      RING.forEach((square, i) => {
        turned[RING[(i + 4) % 8]] = first.squares[square]
      })
      expect(turned).toEqual(first.goal)
      expect(level.par).toBe(4 * horses)
    })

    it(`"${level.label}" puts its goal at the far edge of the whole graph`, () => {
      const dist = distances(first)
      const eccentricity = Math.max(...dist.values())
      expect(dist.get(stateKey({ ...first, squares: first.goal }))).toBe(level.par)
      // Not merely a hard-looking start: the hardest position of its own size.
      expect(level.par).toBe(eccentricity)
    })

    it(`"${level.label}" reaches exactly C(8, ${horses}) x ${horses} positions and no more`, () => {
      const choose = (n: number, k: number) =>
        Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1)
      const expected = Math.round(choose(8, horses)) * horses
      expect(states).toHaveLength(expected)
      expect(
        reachableCount<HorsesState, HorsesAction>({
          start: first,
          moves: legalMoves,
          apply: reduce,
          key: stateKey,
        }),
      ).toBe(expected)
      // And the goal is not behind a one-way door: the component is the same
      // walked from either end.
      expect(allStates({ ...first, squares: first.goal.slice() })).toHaveLength(expected)
    })

    it(`"${level.label}" never lets a horse onto the middle, in any of its positions`, () => {
      for (const state of states) {
        expect(state.squares[MIDDLE], stateKey(state)).toBeNull()
        expect(horseCount(state)).toBe(horses)
      }
    })

    it(`"${level.label}" has no dead ends anywhere, so nothing has to be guessed`, () => {
      for (const state of states) {
        // Every position offers at least two jumps, and every jump can be
        // taken straight back, so a child can never lock themselves out.
        const moves = legalMoves(state)
        expect(moves.length, stateKey(state)).toBeGreaterThanOrEqual(2)
        for (const move of moves) {
          const next = reduce(state, move)
          expect(canJump(next, move.to, move.from)).toBe(true)
          expect(stateKey(reduce(next, { type: 'jump', from: move.to, to: move.from }))).toBe(
            stateKey(state),
          )
        }
      }
    })

    it(`"${level.label}" has exactly one solved position in the whole graph`, () => {
      const solved = states.filter(isSolved)
      expect(solved).toHaveLength(1)
      expect(solved[0].squares).toEqual(first.goal)
    })

    it(`"${level.label}" offers exactly the moves the ring model offers, everywhere`, () => {
      for (const state of states) {
        const mine = legalMoves(state)
          .map((m) => `${BEAD_OF.get(m.from)}-${BEAD_OF.get(m.to)}`)
          .sort()
        const theirs = beadMoves(beadsOf(state.squares))
          .map(([a, b]) => `${a}-${b}`)
          .sort()
        expect(mine).toEqual(theirs)
      }
    })
  }

  it('ramps 1 to 2 to 3 by how many horses have to get past each other', () => {
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['horses-2', 'horses-3', 'horses-4'])
    expect(levels.map((l) => l.label)).toEqual(['Two horses', 'Three horses', 'Four horses'])
    expect(levels.map((l) => horseCount(start(l)))).toEqual([2, 3, 4])
    expect(levels.map((l) => l.par)).toEqual([8, 12, 16])
  })

  it('finishes on the 1512 board: two brown corners and two grey, swapped', () => {
    const last = start(levels[2])
    expect(stateKey(last)).toBe('b.b...g.g')
    expect(stateKey({ ...last, squares: last.goal })).toBe('g.g...b.b')
  })
})

describe('reduce', () => {
  const first = start(levels[2]) // b.b / ... / g.g

  it('jumps a horse in an L and leaves the mats alone', () => {
    const next = reduce(first, { type: 'jump', from: 0, to: 5 })
    expect(stateKey(next)).toBe('..b..bg.g')
    expect(next.goal).toBe(first.goal)
    expect(next.squares).not.toBe(first.squares)
    expect(stateKey(first)).toBe('b.b...g.g')
  })

  it('hands back the very same object when nothing happens', () => {
    // 1. not a jump at all
    expect(reduce(first, { type: 'canter' } as unknown as HorsesAction)).toBe(first)
    expect(reduce(first, undefined as unknown as HorsesAction)).toBe(first)
    // 2. not a square on the board
    for (const bad of [-1, 9, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reduce(first, { type: 'jump', from: bad, to: 5 }), `from ${bad}`).toBe(first)
      expect(reduce(first, { type: 'jump', from: 0, to: bad }), `to ${bad}`).toBe(first)
    }
    // 3. no horse to pick up
    expect(reduce(first, { type: 'jump', from: 1, to: 6 })).toBe(first)
    expect(reduce(first, { type: 'jump', from: MIDDLE, to: 0 })).toBe(first)
    // 4. a horse is already standing there
    expect(reduce(first, { type: 'jump', from: 0, to: 2 })).toBe(first)
    // 5. not an L away — including the horse's own square and the middle
    expect(reduce(first, { type: 'jump', from: 0, to: 0 })).toBe(first)
    expect(reduce(first, { type: 'jump', from: 0, to: 1 })).toBe(first)
    expect(reduce(first, { type: 'jump', from: 0, to: MIDDLE })).toBe(first)
    // …and a legal jump must NOT return the same object.
    expect(reduce(first, { type: 'jump', from: 0, to: 5 })).not.toBe(first)
  })

  it('agrees with canJump everywhere, and never edits what it was handed', () => {
    for (const level of levels) {
      const states = allStates(start(level))
      const before = states.map((state) => JSON.stringify(state))
      for (const state of states) {
        for (const action of [...ALL_MOVES, { type: 'jump', from: 3, to: 3 } as HorsesAction]) {
          const next = reduce(state, action)
          expect(next === state).toBe(!canJump(state, action.from, action.to))
          if (next === state) continue
          expect(next.squares[action.to]).toBe(state.squares[action.from])
          expect(next.squares[action.from]).toBeNull()
          expect(next.goal).toBe(state.goal)
          expect(next.squares).not.toBe(state.squares)
        }
      }
      expect(states.map((state) => JSON.stringify(state))).toEqual(before)
    }
  })

  it('never touches the rng, so every seed gives the same three boards', () => {
    let calls = 0
    for (let seed = 1; seed <= 50; seed++) {
      const inner = makeRng(seed)
      const rng = () => {
        calls += 1
        return inner()
      }
      for (const level of levels) {
        const state = knightSwap.engine.init(level, rng)
        expect(stateKey(state)).toBe(stateKey(start(level)))
        expect(isSolved(state)).toBe(false)
      }
    }
    expect(calls).toBe(0)
    expect(knightSwap.reseedable).toBe(false)
    // Two starts never share a mutable array.
    expect(start(levels[0]).squares).not.toBe(start(levels[0]).squares)
    expect(start(levels[0]).goal).not.toBe(start(levels[0]).goal)
  })
})

describe('isSolved', () => {
  const first = start(levels[0])

  it('wants every horse on a mat of its own colour, and nothing less', () => {
    expect(isSolved(first)).toBe(false)
    expect(isSolved({ ...first, squares: first.goal.slice() })).toBe(true)
    // One horse home is not the same as both.
    const half = { ...first, squares: readBoard('g.. ... ..g') }
    expect(isHome(half, 0)).toBe(true)
    expect(isHome(half, 8)).toBe(false)
    expect(horsesHome(half)).toBe(1)
    expect(isSolved(half)).toBe(false)
  })

  it('will not call a board with no mats on it solved', () => {
    const blank = { squares: new Array(9).fill(null), goal: new Array(9).fill(null) }
    expect(isSolved(blank)).toBe(false)
  })

  it('lets either horse of a team take either mat of that team', () => {
    // The state records a team a square and nothing else, so the two brown
    // horses are the same thing and an element-wise match is exactly right.
    const level = levels[2]
    const done = replay(start(level), solve(start(level)) as HorsesAction[])
    expect(isSolved(done)).toBe(true)
    expect(horsesHome(done)).toBe(4)
  })
})

describe('a move the rule will not keep', () => {
  const first = start(levels[2])

  it('says the three things that can go wrong, in one sentence each', () => {
    expect(refusalOf(first, 0, 2)?.message).toBe('There is already a horse on that square.')
    expect(refusalOf(first, 0, MIDDLE)?.message).toBe('No horse can reach the middle square.')
    expect(refusalOf(first, 0, 1)?.message).toBe('A horse only jumps in an L.')
  })

  it('draws the horse where the child put it, except where nothing can move', () => {
    // Not an L: the horse really lands there, on a position the engine would
    // never build for itself.
    const wandered = refusalOf(first, 0, 1) as { pretend: HorsesState }
    expect(stateKey(wandered.pretend)).toBe('.bb...g.g')
    expect(reduce(first, { type: 'jump', from: 0, to: 1 })).toBe(first)
    // The middle, likewise — the one square the engine can never put a horse on.
    expect(stateKey((refusalOf(first, 0, MIDDLE) as { pretend: HorsesState }).pretend)).toBe(
      '..b.b.g.g',
    )
    // Occupied: two horses cannot stand on one square, so nothing can honestly
    // pretend to move and the board shakes the square instead.
    expect((refusalOf(first, 0, 2) as { pretend: HorsesState }).pretend).toBe(first)
  })

  it('refuses exactly the taps that break a rule, and nothing else', () => {
    for (const level of levels) {
      for (const state of allStates(start(level))) {
        for (let from = 0; from < SQUARES; from++) {
          for (let to = 0; to < SQUARES; to++) {
            const no = refusalOf(state, from, to)
            // A legal jump, a tap on the horse's own square, and a square with
            // no horse on it are all nothing happening rather than a rule
            // broken: only a broken rule is refused.
            if (canJump(state, from, to) || from === to || state.squares[from] === null) {
              expect(no, `${from} to ${to}`).toBeNull()
              continue
            }
            expect(no?.message, `${from} to ${to}`).toMatch(
              /^(There is already a horse on that square|No horse can reach the middle square|A horse only jumps in an L)\.$/,
            )
            if (state.squares[to] !== null) {
              expect(no?.pretend).toBe(state)
              continue
            }
            const pretend = no?.pretend as HorsesState
            expect(pretend.squares[to]).toBe(state.squares[from])
            expect(pretend.squares[from]).toBeNull()
            // Never a position the engine itself would make.
            expect(reduce(state, { type: 'jump', from, to })).toBe(state)
          }
        }
      }
    }
  })

  it('can pretend to finish the board, which is why the shell never sees a pretend', () => {
    // Three horses home and the fourth standing where no L reaches its mat.
    const nearly: HorsesState = {
      squares: readBoard('g.g b.. ..b'),
      goal: readBoard('g.g ... b.b'),
    }
    expect(canJump(nearly, 3, 6)).toBe(false)
    const pretend = refusalOf(nearly, 3, 6)?.pretend as HorsesState
    expect(isSolved(pretend)).toBe(true)
    // The engine will not make it, so the only place that position can exist
    // is the board's own drawing, for the length of one cue.
    expect(reduce(nearly, { type: 'jump', from: 3, to: 6 })).toBe(nearly)
    expect(isSolved(nearly)).toBe(false)
  })
})

describe('describe', () => {
  it('names the horse and the square it landed on, in the past tense', () => {
    const first = start(levels[2])
    const next = reduce(first, { type: 'jump', from: 0, to: 5 })
    expect(describeMove(first, next, { type: 'jump', from: 0, to: 5 })).toBe(
      'Jumped the brown horse to the middle right',
    )
    expect(describeMove(first, next, { type: 'jump', from: 6, to: 1 })).toBe(
      'Jumped the grey horse to the top middle',
    )
    expect(describeMove(first, next, { type: 'jump', from: 0, to: 1 })).toBe('Nothing moved')
    expect(describeMove(first, next, { type: 'jump', from: 1, to: 6 })).toBe('Nothing moved')
  })

  it('names the square every legal jump really landed on, everywhere', () => {
    for (const state of allStates(start(levels[1]))) {
      for (const action of legalMoves(state)) {
        const next = reduce(state, action)
        const landed = next.squares.findIndex((team, i) => team !== null && state.squares[i] === null)
        expect(describeMove(state, next, action)).toBe(
          `Jumped the ${teamWord(state.squares[action.from] as Team)} horse to the ${SQUARE_NAMES[landed]}`,
        )
      }
    }
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(knightSwap.id).toBe('knight-swap')
    expect(knightSwap.title).toBe('The four horses')
    expect(knightSwap.tagline).toMatch(/\.$/)
    // Every jump can be taken straight back and no position is a dead end, so
    // there is nothing to step back from: deliberately no failure().
    expect(knightSwap.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
  })

  it('writes its words as plain, finished sentences', () => {
    const lines = [knightSwap.tagline, ...knightSwap.instructions, ...levels.flatMap((l) => l.hints)]
    expect(knightSwap.instructions.length).toBeGreaterThanOrEqual(2)
    expect(knightSwap.instructions.length).toBeLessThanOrEqual(4)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
    }
    for (const line of lines) {
      expect(line, line).toMatch(/^[A-Z]/)
      expect(line, line).toMatch(/\.$/)
      expect(line.length, line).toBeLessThanOrEqual(140)
      expect(line, line).not.toMatch(/[!]/)
      expect(line, line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}]/u)
    }
  })

  it('never names a square a horse could stand on, in any hint', () => {
    // The eight rim squares are the answer written out. "The middle" is not
    // one of them: nothing can ever stand there, so saying so gives away
    // nothing a child would not find on their first wrong tap.
    const rim = SQUARE_NAMES.filter((_, i) => i !== MIDDLE)
    for (const level of levels) {
      for (const hint of level.hints) {
        for (const name of rim) expect(hint.toLowerCase(), hint).not.toContain(name)
        expect(hint, hint).not.toMatch(/\bcorner\b/i)
      }
    }
  })

  it('keeps the loop back for the last level, so the first does not give it away', () => {
    const early = [...levels[0].hints, ...levels[1].hints].join(' ')
    expect(early).not.toMatch(/\bloop\b|\bring\b|\bcircle\b/i)
    expect(levels[2].hints.join(' ')).toMatch(/\bloop\b/)
  })
})

describe('the board', () => {
  const show = (state: HorsesState, locked = false, settings?: Partial<Settings>) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }), {
      wrapper: underSettings(settings),
    })
    return { dispatch, view, squares: () => screen.getAllByRole('button') }
  }

  /** The shell always draws a board inside the settings; a bare render has to too. */
  const drawn = (props: BoardProps<HorsesState, HorsesAction>) =>
    render(createElement(Board, props), { wrapper: underSettings() })

  const status = (view: { container: HTMLElement }) =>
    view.container.querySelector('[role="status"]')?.textContent

  /** The board with a real state behind it, so a cue runs from the tap that fires it. */
  const Play = ({ from }: { from: HorsesState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: HorsesAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  it('draws nine pressable squares and nothing else touchable', () => {
    const { squares } = show(start(levels[2]))
    expect(squares()).toHaveLength(SQUARES)
    for (const square of squares()) {
      expect(square).toHaveAttribute('type', 'button')
      expect(square.className).toContain('u-press')
      expect((square.getAttribute('aria-label') ?? '').length).toBeGreaterThan(8)
    }
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = show(start(levels[2]))
    expect(view.container.querySelectorAll('h1, h2, h3, h4')).toHaveLength(0)
    // The rule under the board, the tally, and the screen-reader line. No
    // title, no counter, no hint, no win message.
    expect(view.container.textContent).toBe(
      'A horse jumps two squares, then one across.' +
        '4 horses still have to reach their own mats.' +
        'You are not holding a horse.',
    )
  })

  it('lifts a horse on the first tap and jumps it on the second', () => {
    const { dispatch, squares } = show(start(levels[2]))
    expect(squares()[0]).toHaveAttribute('aria-label', 'Lift the brown horse off the top left.')

    fireEvent.click(squares()[0])
    expect(dispatch).not.toHaveBeenCalled()
    expect(squares()[0]).toHaveAttribute('aria-pressed', 'true')
    expect(squares()[0]).toHaveAttribute('aria-label', 'Put the brown horse back on the top left.')
    expect(squares()[5]).toHaveAttribute(
      'aria-label',
      'Jump the brown horse to the middle right. The middle right is empty.',
    )

    fireEvent.click(squares()[5])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'jump', from: 0, to: 5 })
  })

  it('puts the horse back down when its own square is tapped again', () => {
    const { dispatch, squares } = show(start(levels[2]))
    fireEvent.click(squares()[0])
    fireEvent.click(squares()[0])
    expect(dispatch).not.toHaveBeenCalled()
    expect(squares()[0]).toHaveAttribute('aria-pressed', 'false')
    expect(squares()[0]).toHaveAttribute('aria-label', 'Lift the brown horse off the top left.')
  })

  it('puts the horse back down on Escape', () => {
    const { dispatch, view, squares } = show(start(levels[2]))
    fireEvent.click(squares()[0])
    expect(status(view)).toBe('You are holding the brown horse above the top left.')
    fireEvent.keyDown(squares()[0], { key: 'Escape' })
    expect(status(view)).toBe('You are not holding a horse.')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('marks every empty square while a horse is in the air, the middle included', () => {
    const { view, squares } = show(start(levels[2]))
    expect(view.container.querySelectorAll('[data-show="true"]')).toHaveLength(0)
    fireEvent.click(squares()[0])
    // Nine squares, four horses: five empties, and the mark is on all of them.
    // Never on only the two an L reaches — that is the answer, drawn.
    const marked = [...view.container.querySelectorAll('[data-show="true"]')].map((mark) =>
      squares().findIndex((square) => square.contains(mark)),
    )
    expect(marked.sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 7])
  })

  it('offers the middle like any other square, and says why it will not take a horse', () => {
    const { squares } = show(start(levels[2]))
    fireEvent.click(squares()[0])
    expect(squares()[MIDDLE]).toBeEnabled()
    expect(squares()[MIDDLE]).not.toHaveAttribute('aria-disabled')
    expect(squares()[MIDDLE]).toHaveAttribute(
      'aria-label',
      'Jump the brown horse to the middle. The middle is a hole.',
    )
  })

  it('leaves a square dead when the tap would change nothing, without disabling it', () => {
    const { dispatch, squares } = show(start(levels[2]))
    // Nothing in hand and nothing to lift: honestly dead, but still walkable by
    // the arrow keys, which a disabled button would not be.
    expect(squares()[1]).toHaveAttribute('aria-disabled', 'true')
    expect(squares()[1]).toBeEnabled()
    fireEvent.click(squares()[1])
    expect(dispatch).not.toHaveBeenCalled()
    expect(squares()[0]).not.toHaveAttribute('aria-disabled')
  })

  it('shrinks the mark back to the legal squares once forbidden moves are off', () => {
    const { dispatch, view, squares } = show(start(levels[2]), false, {
      allowForbiddenMoves: false,
    })
    fireEvent.click(squares()[0])
    const marked = [...view.container.querySelectorAll('[data-show="true"]')].map((mark) =>
      squares().findIndex((square) => square.contains(mark)),
    )
    expect(marked.sort((a, b) => a - b)).toEqual([5, 7])
    expect(squares()[1]).toHaveAttribute('aria-disabled', 'true')
    expect(squares()[1]).toHaveAttribute(
      'aria-label',
      'A horse only jumps in an L. The top middle is empty.',
    )
    expect(squares()[MIDDLE]).toHaveAttribute(
      'aria-label',
      'No horse can reach the middle square. The middle is a hole.',
    )
    fireEvent.click(squares()[1])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('walks the arrow keys square by square, and keeps exactly one tab stop', () => {
    const { squares } = show(start(levels[2]))
    squares()[0].focus()
    fireEvent.keyDown(squares()[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(squares()[1])
    fireEvent.keyDown(squares()[1], { key: 'ArrowDown' })
    // Straight across the dead middle square, which is why it is not disabled.
    expect(document.activeElement).toBe(squares()[MIDDLE])
    const stops = squares().filter((square) => square.getAttribute('tabindex') === '0')
    expect(stops).toEqual([squares()[MIDDLE]])

    // And it stops at the edge rather than wrapping round to the next row.
    fireEvent.keyDown(squares()[MIDDLE], { key: 'ArrowUp' })
    fireEvent.keyDown(squares()[1], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(squares()[1])
  })

  it('counts the horses that still have to get home', () => {
    const first = start(levels[0])
    render(createElement(Play, { from: first }), { wrapper: underSettings() })
    expect(screen.getByText('2 horses still have to reach their own mats.')).toBeInTheDocument()
    // Walk one horse a quarter of the way round: still two off their mats.
    fireEvent.click(screen.getAllByRole('button')[0])
    fireEvent.click(screen.getAllByRole('button')[5])
    expect(screen.getByText('2 horses still have to reach their own mats.')).toBeInTheDocument()
  })

  it('says nothing at all once the level is locked', () => {
    const first = start(levels[0])
    const done = { ...first, squares: first.goal.slice() }
    const { view, squares } = show(done, true)
    for (const square of squares()) expect(square).toBeDisabled()
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(status(view)).toBe('')
  })

  it('ignores every input while it is locked', () => {
    const { dispatch, squares } = show(start(levels[2]), true)
    fireEvent.click(squares()[0])
    fireEvent.click(squares()[5])
    fireEvent.keyDown(squares()[0], { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = reduce(start(levels[2]), { type: 'jump', from: 0, to: 5 })
    const a = drawn({ state, dispatch: vi.fn(), locked: false })
    const first = a.container.innerHTML
    cleanup()
    const b = drawn({ state, dispatch: vi.fn(), locked: false })
    expect(b.container.innerHTML).toBe(first)
  })

  it('forgets the lift when the state moves, and keeps it when it does not', () => {
    const state = start(levels[2])
    const dispatch = vi.fn()
    const props = (from: HorsesState) => ({ state: from, dispatch, locked: false })
    const view = drawn(props(state))
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')

    // A re-render on the same state keeps the selection…
    view.rerender(createElement(Board, props(state)))
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')

    // …and a move, an undo or a rewind always clears it — even a rewind back to
    // a position that looks exactly the same.
    const moved = reduce(state, { type: 'jump', from: 0, to: 5 })
    view.rerender(createElement(Board, props(moved)))
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-disabled', 'true')
    view.rerender(createElement(Board, props(start(levels[2]))))
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'false')
    expect(view.container.querySelectorAll('[data-lifted="true"]')).toHaveLength(0)
    expect(view.container.querySelectorAll('[data-show="true"]')).toHaveLength(0)
  })

  it('draws a mat under every square a horse has to end up on, and no others', () => {
    const { view } = show(start(levels[1]))
    const mats = [...view.container.querySelectorAll('[class*="mat"]')]
    expect(mats).toHaveLength(3)
    const colours = mats.map((mat) =>
      (mat.closest('button') as HTMLElement).style.getPropertyValue('--mat'),
    )
    expect(colours.filter((c) => c === 'var(--p-slate)')).toHaveLength(1)
    expect(colours.filter((c) => c === 'var(--p-ochre)')).toHaveLength(2)
  })

  it('tells the two teams apart in words as well as in colour', () => {
    const { view, squares } = show(start(levels[2]))
    expect(squares()[0].getAttribute('aria-label')).toContain('brown horse')
    expect(squares()[6].getAttribute('aria-label')).toContain('grey horse')
    // Same artwork, one class turning half of it grey.
    const art = view.container.querySelectorAll('[class*="art"]')
    expect(art).toHaveLength(4)
    expect([...art].filter((el) => (el.getAttribute('class') ?? '').includes('grey'))).toHaveLength(2)
  })

  /* ----------------------------------------------------------
     A square that will not take the horse, with the setting
     that offers it on — which is how the collection ships.

     jsdom loads no stylesheet, so --dur-4 goes on the root by
     hand: a cue lives exactly as long as its token says.
     ---------------------------------------------------------- */
  describe('a square that will not take the horse', () => {
    const DUR_4 = 480
    const runCue = () => act(() => vi.advanceTimersByTime(DUR_4))

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

    it('takes the horse, says no, and puts it back with nothing sent to the shell', () => {
      const { dispatch, view, squares } = show(start(levels[2]))
      fireEvent.click(squares()[0])
      fireEvent.click(squares()[1])

      // The horse really is standing on the top middle, for one cue.
      expect(squares()[1].querySelector('[class*="seat"]')).not.toBeNull()
      expect(squares()[0].querySelector('[class*="seat"]')).toBeNull()
      expect(squares()[1].className).toContain('flash')
      expect(status(view)).toBe('A horse only jumps in an L. You are not holding a horse.')
      expect(screen.getAllByText('A horse only jumps in an L.')).toHaveLength(1)

      runCue()
      expect(squares()[0].querySelector('[class*="seat"]')).not.toBeNull()
      expect(squares()[1].querySelector('[class*="seat"]')).toBeNull()
      expect(squares()[1].className).not.toContain('flash')
      // Nothing reached the shell, so nothing reached the history, the move
      // tape, or the solved check.
      expect(dispatch).not.toHaveBeenCalled()
    })

    it('shakes a square that already has a horse on it, and moves nothing', () => {
      const { dispatch, view, squares } = show(start(levels[2]))
      fireEvent.click(squares()[0])
      fireEvent.click(squares()[2])
      expect(status(view)).toBe(
        'There is already a horse on that square. You are holding the brown horse above the top left.',
      )
      expect(squares()[2].className).toContain('flash')
      expect(squares()[2].querySelector('[class*="shake"]')).not.toBeNull()
      // Both horses are exactly where they were, and the first is still in hand.
      expect(squares()[0]).toHaveAttribute('aria-pressed', 'true')
      runCue()
      expect(dispatch).not.toHaveBeenCalled()
    })

    it('takes the horse to the middle, and says the one thing the middle is for', () => {
      const { dispatch, view, squares } = show(start(levels[2]))
      fireEvent.click(squares()[0])
      fireEvent.click(squares()[MIDDLE])
      expect(squares()[MIDDLE].querySelector('[class*="seat"]')).not.toBeNull()
      expect(status(view)).toContain('No horse can reach the middle square.')
      runCue()
      expect(squares()[MIDDLE].querySelector('[class*="seat"]')).toBeNull()
      expect(dispatch).not.toHaveBeenCalled()
    })

    it('takes no second tap while it is putting the first one back', () => {
      const { dispatch, squares } = show(start(levels[2]))
      fireEvent.click(squares()[0])
      fireEvent.click(squares()[1])
      fireEvent.click(squares()[5])
      expect(dispatch).not.toHaveBeenCalled()

      // …and once the horse is back, the board plays on.
      runCue()
      fireEvent.click(squares()[0])
      fireEvent.click(squares()[5])
      expect(dispatch).toHaveBeenCalledWith({ type: 'jump', from: 0, to: 5 })
    })

    it('never refuses a move a rewind has already undone', () => {
      const state = start(levels[2])
      const dispatch = vi.fn()
      const view = drawn({ state, dispatch, locked: false })
      fireEvent.click(screen.getAllByRole('button')[0])
      fireEvent.click(screen.getAllByRole('button')[1])
      expect(status(view)).toContain('only jumps in an L')

      // The move tape can be tapped while a cue is still running. The pretend
      // position belongs to the state it was refused from, so it goes the
      // moment the board is handed another one.
      view.rerender(
        createElement(Board, {
          state: reduce(state, { type: 'jump', from: 0, to: 5 }),
          dispatch,
          locked: false,
        }),
      )
      expect(status(view)).toBe('You are not holding a horse.')
    })
  })
})
