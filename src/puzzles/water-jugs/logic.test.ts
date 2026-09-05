import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { reachableCount, shortestSolution } from '../../lib/search'
import { makeRng } from '../../lib/rng'
import type { PuzzleLevel } from '../../lib/types'
import { waterJugs } from './index'
import { Board } from './Board'
import type { JugsAction, JugsConfig, JugsState } from './logic'
import {
  canEmpty,
  canFill,
  canPour,
  canPourFrom,
  describeMove,
  init,
  isSealed,
  isSolved,
  legalMoves,
  pourAmount,
  reduce,
} from './logic'

const levels = waterJugs.levels as PuzzleLevel<JugsConfig>[]
const byId = (id: string) => {
  const level = levels.find((l) => l.id === id)
  if (!level) throw new Error(`no level ${id}`)
  return level
}

/**
 * The pars, written down here independently of the level data, so that a
 * typo in a level cannot quietly agree with itself. Each one was re-derived
 * by hand-rolled breadth-first search over the raw jug arithmetic:
 *   5,3 -> 4 in six; 8,5,3 sealed -> 4|4 in seven; 9,4 -> 6 in eight.
 */
const EXPECTED_PAR: Record<string, number> = {
  'four-litres': 6,
  'half-and-half': 7,
  'six-litres': 8,
}

const key = (s: JugsState) => s.litres.join(',')

const solve = (state: JugsState) =>
  shortestSolution<JugsState, JugsAction>({
    start: state,
    moves: legalMoves,
    apply: reduce,
    key,
    solved: isSolved,
  })

const replay = (state: JugsState, path: JugsAction[]) => path.reduce(reduce, state)

/** Every position the player can possibly get to on this level. */
function allReachable(state: JugsState): JugsState[] {
  const seen = new Map<string, JugsState>([[key(state), state]])
  const stack = [state]
  while (stack.length) {
    const cur = stack.pop() as JugsState
    for (const action of legalMoves(cur)) {
      const next = reduce(cur, action)
      const k = key(next)
      if (seen.has(k)) continue
      seen.set(k, next)
      stack.push(next)
    }
  }
  return [...seen.values()]
}

/** Every action the board could conceivably dispatch, legal or not. */
function everyAction(state: JugsState): JugsAction[] {
  const n = state.cfg.jugs.length
  const out: JugsAction[] = []
  for (let i = 0; i < n; i++) {
    out.push({ type: 'fill', jug: i }, { type: 'empty', jug: i })
    for (let j = 0; j < n; j++) out.push({ type: 'pour', from: i, to: j })
  }
  return out
}

/** Indices no jug has, and values that are not indices at all. */
const NONSENSE = [-1, 1.5, 0.5, 99, NaN, Infinity, -Infinity, '0' as unknown as number]

function nonsenseActions(state: JugsState): JugsAction[] {
  const n = state.cfg.jugs.length
  const out: JugsAction[] = []
  for (const bad of [...NONSENSE, n, n + 1]) {
    out.push({ type: 'fill', jug: bad }, { type: 'empty', jug: bad })
    for (let i = 0; i < n; i++) {
      out.push({ type: 'pour', from: bad, to: i }, { type: 'pour', from: i, to: bad })
    }
  }
  for (let i = 0; i < n; i++) out.push({ type: 'pour', from: i, to: i })
  out.push({ type: 'nonsense' } as unknown as JugsAction)
  out.push({} as unknown as JugsAction)
  return out
}

describe('water jugs — the level set', () => {
  it('is three levels, one of each difficulty, with stable unique ids', () => {
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(levels.map((l) => l.id)).toEqual(Object.keys(EXPECTED_PAR))
  })

  it('gives every level three real hints, a par and a sentence-case label', () => {
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.hints.every((h) => h.trim().length > 0)).toBe(true)
      expect(new Set(level.hints).size).toBe(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      expect(level.par).toBe(EXPECTED_PAR[level.id])
      expect(level.config.goalLine.trim().length).toBeGreaterThan(0)
    }
  })

  /**
   * Both the jug labels the screen reader reads out and `describeMove` name a
   * jug by its capacity alone, so two jugs of the same size on one level would
   * make the board and the move tape ambiguous.
   */
  it('never puts two jugs of the same capacity on one level', () => {
    for (const level of levels) {
      const caps = level.config.jugs.map((j) => j.capacity)
      expect(new Set(caps).size).toBe(caps.length)
      for (const jug of level.config.jugs) {
        expect(Number.isInteger(jug.capacity)).toBe(true)
        expect(jug.capacity).toBeGreaterThan(0)
        expect(Number.isInteger(jug.start)).toBe(true)
        expect(jug.start).toBeGreaterThanOrEqual(0)
        expect(jug.start).toBeLessThanOrEqual(jug.capacity)
      }
    }
  })

  it('introduces itself in two to four imperative lines', () => {
    expect(waterJugs.instructions.length).toBeGreaterThanOrEqual(2)
    expect(waterJugs.instructions.length).toBeLessThanOrEqual(4)
    expect(waterJugs.tagline.trim().length).toBeGreaterThan(0)
  })
})

describe('water jugs — every par is the shortest solution', () => {
  for (const level of levels) {
    it(`"${level.label}" starts unsolved and is solvable in exactly ${EXPECTED_PAR[level.id]}`, () => {
      const start = init(level)
      expect(isSolved(start)).toBe(false)
      expect(legalMoves(start).length).toBeGreaterThan(1) // not a one-move walkover

      const path = solve(start)
      expect(path).not.toBeNull()
      expect((path as JugsAction[]).length).toBe(EXPECTED_PAR[level.id])
      expect(level.par).toBe(EXPECTED_PAR[level.id])

      // The search and the engine agree: the path really works through reduce.
      expect(isSolved(replay(start, path as JugsAction[]))).toBe(true)
    })

    it(`"${level.label}" cannot be solved in fewer than ${EXPECTED_PAR[level.id]} moves`, () => {
      // Exhaustive, not a sample: nothing reachable in par-1 moves is a solution.
      const start = init(level)
      let frontier = [start]
      const seen = new Set([key(start)])
      for (let depth = 0; depth < (level.par as number) - 1; depth++) {
        const next: JugsState[] = []
        for (const s of frontier) {
          for (const action of legalMoves(s)) {
            const child = reduce(s, action)
            const k = key(child)
            if (seen.has(k)) continue
            seen.add(k)
            expect(isSolved(child)).toBe(false)
            next.push(child)
          }
        }
        frontier = next
      }
      expect(frontier.length).toBeGreaterThan(0)
    })

    /**
     * There is no `failure()` on this puzzle, so the player is never told to
     * step back. That is only honest if no wrong turn can strand them.
     */
    it(`"${level.label}" has no dead end: the goal is reachable from every position`, () => {
      for (const state of allReachable(init(level))) {
        const path = solve(state)
        expect(path, `stranded at ${key(state)}`).not.toBeNull()
      }
    })

    it(`"${level.label}" always leaves the player something to do`, () => {
      for (const state of allReachable(init(level))) {
        if (!isSolved(state)) expect(legalMoves(state).length).toBeGreaterThan(0)
      }
    })
  }
})

describe('water jugs — reduce is a well-behaved state machine', () => {
  for (const level of levels) {
    it(`"${level.label}" returns the identical object for every action that changes nothing`, () => {
      for (const state of allReachable(init(level))) {
        for (const action of everyAction(state)) {
          const next = reduce(state, action)
          if (key(next) !== key(state)) expect(next).not.toBe(state)
          else expect(next, `${JSON.stringify(action)} @ ${key(state)}`).toBe(state)
        }
      }
    })

    it(`"${level.label}" returns the identical object for nonsense, everywhere`, () => {
      for (const state of allReachable(init(level))) {
        for (const action of nonsenseActions(state)) {
          expect(reduce(state, action), `${JSON.stringify(action)} @ ${key(state)}`).toBe(state)
        }
      }
    })

    it(`"${level.label}" never mutates the state it is given`, () => {
      for (const state of allReachable(init(level))) {
        const before = state.litres.slice()
        Object.freeze(state)
        Object.freeze(state.litres)
        for (const action of [...everyAction(state), ...nonsenseActions(state)]) {
          const next = reduce(state, action)
          if (next !== state) expect(next.litres).not.toBe(state.litres)
        }
        expect(state.litres).toEqual(before)
      }
    })

    it(`"${level.label}" never spills: 0 <= litres <= capacity everywhere`, () => {
      for (const state of allReachable(init(level))) {
        state.litres.forEach((l, i) => {
          expect(Number.isInteger(l)).toBe(true)
          expect(l).toBeGreaterThanOrEqual(0)
          expect(l).toBeLessThanOrEqual(level.config.jugs[i].capacity)
        })
      }
    })

    it(`"${level.label}" — legalMoves is exactly the set of actions that change something`, () => {
      for (const state of allReachable(init(level))) {
        const changing = everyAction(state)
          .filter((a) => reduce(state, a) !== state)
          .map((a) => JSON.stringify(a))
          .sort()
        const listed = legalMoves(state)
          .map((a) => JSON.stringify(a))
          .sort()
        expect(listed).toEqual(changing)
      }
    })

    it(`"${level.label}" — a pour either empties the first jug or fills the second`, () => {
      for (const state of allReachable(init(level))) {
        for (const a of legalMoves(state)) {
          if (a.type !== 'pour') continue
          const next = reduce(state, a)
          const full = next.litres[a.to] === level.config.jugs[a.to].capacity
          expect(next.litres[a.from] === 0 || full).toBe(true)
          expect(next.litres[a.from]).toBe(state.litres[a.from] - pourAmount(state, a.from, a.to))
          // No water is created or destroyed by a pour.
          const sum = (s: JugsState) => s.litres.reduce((x, y) => x + y, 0)
          expect(sum(next)).toBe(sum(state))
        }
      }
    })

    it(`"${level.label}" — a fill fills to the brim and an empty empties right out`, () => {
      for (const state of allReachable(init(level))) {
        for (const a of legalMoves(state)) {
          const next = reduce(state, a)
          if (a.type === 'fill') expect(next.litres[a.jug]).toBe(level.config.jugs[a.jug].capacity)
          if (a.type === 'empty') expect(next.litres[a.jug]).toBe(0)
        }
      }
    })

    it(`"${level.label}" — reachableCount agrees with an independent walk`, () => {
      const start = init(level)
      expect(reachableCount({ start, moves: legalMoves, apply: reduce, key })).toBe(
        allReachable(start).length,
      )
    })
  }

  it('the reachable spaces are the size an independent count says they are', () => {
    // 5,3 with a tap and a drain: 16. 8,5,3 sealed: 16. 9,4 with both: 26.
    expect(allReachable(init(byId('four-litres'))).length).toBe(16)
    expect(allReachable(init(byId('half-and-half'))).length).toBe(16)
    expect(allReachable(init(byId('six-litres'))).length).toBe(26)
  })
})

describe('water jugs — the sealed level really is sealed', () => {
  const level = byId('half-and-half')

  it('has no tap and no drain', () => {
    expect(level.config.tap).toBe(false)
    expect(level.config.drain).toBe(false)
    expect(isSealed(init(level))).toBe(true)
    expect(isSealed(init(byId('four-litres')))).toBe(false)
  })

  it('refuses every fill and every empty, without changing state', () => {
    for (const state of allReachable(init(level))) {
      for (let i = 0; i < state.cfg.jugs.length; i++) {
        expect(canFill(state, i)).toBe(false)
        expect(canEmpty(state, i)).toBe(false)
        expect(reduce(state, { type: 'fill', jug: i })).toBe(state)
        expect(reduce(state, { type: 'empty', jug: i })).toBe(state)
      }
      expect(legalMoves(state).every((a) => a.type === 'pour')).toBe(true)
    }
  })

  it('conserves all 8 litres in every position the player can reach', () => {
    for (const state of allReachable(init(level))) {
      expect(state.litres.reduce((a, b) => a + b, 0)).toBe(8)
    }
  })

  it("splits 4 and 4 in the known seven pours, and the goal's null really is a don't-care", () => {
    const moves: JugsAction[] = [
      { type: 'pour', from: 0, to: 1 },
      { type: 'pour', from: 1, to: 2 },
      { type: 'pour', from: 2, to: 0 },
      { type: 'pour', from: 1, to: 2 },
      { type: 'pour', from: 0, to: 1 },
      { type: 'pour', from: 1, to: 2 },
      { type: 'pour', from: 2, to: 0 },
    ]
    let state = init(level)
    expect(state.litres).toEqual([8, 0, 0])
    for (const move of moves) {
      const next = reduce(state, move)
      expect(next).not.toBe(state)
      state = next
    }
    expect(state.litres).toEqual([4, 4, 0])
    expect(isSolved(state)).toBe(true)
    expect(moves).toHaveLength(level.par as number)
    // Conservation means the third jug can only ever be 0 when the first two
    // hold 4 each, so declaring it "don't care" costs nothing.
    const solvedStates = allReachable(init(level)).filter(isSolved)
    expect(solvedStates.map(key)).toEqual(['4,4,0'])
  })
})

describe('water jugs — what counts as solved', () => {
  it('"any" is satisfied by whichever jug holds the amount, and by nothing else', () => {
    const start = init(byId('four-litres'))
    expect(isSolved({ ...start, litres: [4, 0] })).toBe(true)
    expect(isSolved({ ...start, litres: [4, 3] })).toBe(true)
    expect(isSolved({ ...start, litres: [0, 3] })).toBe(false)
    expect(isSolved({ ...start, litres: [5, 3] })).toBe(false)
    expect(isSolved({ ...start, litres: [1, 3] })).toBe(false)
    expect(isSolved({ ...start, litres: [0, 0] })).toBe(false)
  })

  it('"each" needs both named jugs at once, and does not care about the third', () => {
    const start = init(byId('half-and-half'))
    expect(isSolved({ ...start, litres: [4, 4, 0] })).toBe(true)
    expect(isSolved({ ...start, litres: [4, 4, 3] })).toBe(true) // the null really is a don't-care
    expect(isSolved({ ...start, litres: [4, 0, 3] })).toBe(false)
    expect(isSolved({ ...start, litres: [0, 4, 3] })).toBe(false)
    expect(isSolved({ ...start, litres: [8, 0, 0] })).toBe(false)
  })

  it('six litres can only ever land in the big jug', () => {
    // Not just on one search path — in every position the player can reach.
    const level = byId('six-litres')
    const solved = allReachable(init(level)).filter(isSolved)
    expect(solved.length).toBeGreaterThan(0)
    for (const state of solved) expect(state.litres[0]).toBe(6)
  })
})

describe('water jugs — pour arithmetic', () => {
  const level = byId('four-litres')

  it('moves the smaller of "what is in it" and "what will fit"', () => {
    const start = init(level)
    const full5 = { ...start, litres: [5, 0] }
    expect(pourAmount(full5, 0, 1)).toBe(3) // the 3 fills, 2 stay behind
    expect(reduce(full5, { type: 'pour', from: 0, to: 1 }).litres).toEqual([2, 3])

    const dribble = { ...start, litres: [2, 0] }
    expect(pourAmount(dribble, 0, 1)).toBe(2) // the 5 empties, the 3 is not full
    expect(reduce(dribble, { type: 'pour', from: 0, to: 1 }).litres).toEqual([0, 2])
  })

  it('will not pour out of an empty jug or into a full one', () => {
    const start = init(level)
    expect(canPour(start, 0, 1)).toBe(false)
    expect(canPourFrom(start, 0)).toBe(false)
    const both = { ...start, litres: [0, 3] }
    expect(canPour(both, 1, 0)).toBe(true)
    expect(canPourFrom(both, 1)).toBe(true)
    expect(canPourFrom(both, 0)).toBe(false)
    const brimful = { ...start, litres: [2, 3] }
    expect(canPour(brimful, 0, 1)).toBe(false)
    expect(canPourFrom(brimful, 0)).toBe(false)
    expect(reduce(brimful, { type: 'pour', from: 0, to: 1 })).toBe(brimful)
  })

  it('never lets a jug pour into itself', () => {
    const full = { ...init(level), litres: [5, 3] }
    expect(pourAmount(full, 0, 0)).toBe(0)
    expect(pourAmount(full, 1, 1)).toBe(0)
    expect(canPourFrom(full, 0)).toBe(false) // the other jug is full, not itself
  })
})

describe('water jugs — the move tape', () => {
  it('names the jug by its capacity', () => {
    const start = init(byId('four-litres'))
    const filled = reduce(start, { type: 'fill', jug: 0 })
    expect(describeMove(start, filled, { type: 'fill', jug: 0 })).toBe('Filled the 5-litre jug')

    const topped = reduce(filled, { type: 'pour', from: 0, to: 1 })
    expect(describeMove(filled, topped, { type: 'pour', from: 0, to: 1 })).toBe(
      'Poured the 5-litre jug into the 3-litre jug',
    )
    expect(describeMove(topped, topped, { type: 'empty', jug: 1 })).toBe('Emptied the 3-litre jug')
  })

  it('describes every legal move on every level, naming the jugs involved', () => {
    for (const level of levels) {
      for (const state of allReachable(init(level))) {
        for (const action of legalMoves(state)) {
          const next = reduce(state, action)
          const line = describeMove(state, next, action)
          expect(line.length).toBeGreaterThan(0)
          expect(line[0]).toBe(line[0].toUpperCase())
          const caps =
            action.type === 'pour'
              ? [state.cfg.jugs[action.from].capacity, state.cfg.jugs[action.to].capacity]
              : [state.cfg.jugs[action.jug].capacity]
          for (const c of caps) expect(line).toContain(String(c))
        }
      }
    }
  })
})

describe('water jugs — the meta', () => {
  it('is not reseedable, and init never touches the rng', () => {
    expect(waterJugs.reseedable).toBe(false)
    for (const level of levels) {
      let calls = 0
      const rng = () => {
        calls++
        return makeRng(1)()
      }
      const a = waterJugs.engine.init(level, rng)
      const b = waterJugs.engine.init(level, makeRng(987654))
      expect(calls).toBe(0)
      expect(a.litres).toEqual(b.litres)
      expect(a.litres).toEqual(level.config.jugs.map((j) => j.start))
      expect(a.litres).not.toBe(b.litres) // a fresh array each time
      expect(a.cfg).toBe(level.config)
    }
  })

  it('declares no failure state — there is no dead end to step back from', () => {
    expect(waterJugs.engine.failure).toBeUndefined()
  })

  it('wires the engine to the functions the tests exercise', () => {
    expect(waterJugs.id).toBe('water-jugs')
    expect(waterJugs.engine.reduce).toBe(reduce)
    expect(waterJugs.engine.isSolved).toBe(isSolved)
    expect(waterJugs.engine.describe).toBe(describeMove)
    expect(waterJugs.engine.Board).toBe(Board)
    expect(typeof waterJugs.Icon).toBe('function')
  })
})

/* --------------------------------------------------------------------------
   The board. Rendered through createElement so the puzzle stays at the six
   files the contract asks for.
   -------------------------------------------------------------------------- */

const show = (state: JugsState, locked = false) => {
  const dispatch = vi.fn<(a: JugsAction) => void>()
  const result = render(createElement(Board, { state, dispatch, locked }))
  return { dispatch, ...result }
}

/** Every control on the board, cheaply, with the name a screen reader hears. */
const controls = (c: HTMLElement) =>
  [...c.querySelectorAll('button')].map((b) => ({
    el: b,
    label: b.getAttribute('aria-label') ?? '',
    live: !b.disabled,
  }))

const named = (c: HTMLElement, re: RegExp) => {
  const hits = controls(c).filter((b) => re.test(b.label))
  if (hits.length > 1) throw new Error(`${re} matches ${hits.length} controls`)
  return hits[0] ?? null
}

const jugAt = (c: HTMLElement, state: JugsState, i: number) =>
  named(c, new RegExp(`^${state.cfg.jugs[i].capacity}-litre jug, `))!

const actAt = (c: HTMLElement, state: JugsState, kind: 'Fill' | 'Empty', i: number) =>
  named(c, new RegExp(`^${kind} the ${state.cfg.jugs[i].capacity}-litre jug`))

const vessel = (state: JugsState, i: number) =>
  screen.getByRole('button', {
    name: new RegExp(`^${state.cfg.jugs[i].capacity}-litre jug, `),
  }) as HTMLButtonElement

/**
 * A canonical picture of the rendered board: tag, attributes in a fixed order,
 * text. Attribute *order* in innerHTML depends on whether React built the node
 * or patched it, which is not something the player can see.
 */
function snapshot(node: Element): string {
  const attrs = [...node.attributes]
    .filter((a) => !/^id$|clip-path/.test(a.name))
    .map((a) => `${a.name}=${a.value}`)
    .sort()
    .join(' ')
  const kids = [...node.childNodes]
    .map((n) =>
      n.nodeType === 1
        ? snapshot(n as Element)
        : (n.textContent ?? '').trim() && `#${(n.textContent ?? '').trim()}`,
    )
    .filter(Boolean)
    .join('')
  return `<${node.tagName} ${attrs}>${kids}</${node.tagName}>`
}

describe('water jugs — the board', () => {
  afterEach(cleanup)

  it('prints the goal line from the level config and nothing the shell owns', () => {
    for (const level of levels) {
      const { container } = show(init(level))
      expect(screen.getByText(level.config.goalLine)).toBeInTheDocument()
      // No title, no hints, no move counter, no reset, no "you win".
      expect(container.querySelector('h1,h2,h3')).toBeNull()
      const text = container.textContent ?? ''
      expect(text).not.toMatch(/move|hint|reset|undo|par\b|solved|well done|you win/i)
      expect(text).not.toContain(waterJugs.title)
      for (const hint of level.hints) expect(text).not.toContain(hint)
      cleanup()
    }
  })

  it('makes every control a real button with a useful label', () => {
    for (const level of levels) {
      const { container } = show({
        ...init(level),
        litres: level.config.jugs.map((j) => Math.min(1, j.capacity)),
      })
      const all = controls(container)
      expect(all.length).toBeGreaterThan(0)
      for (const b of all) {
        expect(b.el).toHaveAttribute('type', 'button')
        expect(b.el.className).toContain('u-press')
        expect(b.label.trim().length).toBeGreaterThan(8)
      }
      cleanup()
    }
  })

  it('shows a tap and a drain per jug, and hides both on the sealed level', () => {
    show(init(byId('four-litres')))
    expect(screen.getAllByRole('button', { name: /^Fill the/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^Empty the/ })).toHaveLength(2)
    cleanup()

    show(init(byId('half-and-half')))
    expect(screen.queryAllByRole('button', { name: /^Fill the/ })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /^Empty the/ })).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(3) // three jugs, nothing else
  })

  it('counts picking a jug up and pouring it out as one single move', () => {
    const level = byId('four-litres')
    const state = { ...init(level), litres: [5, 0] }
    const { dispatch } = show(state)
    fireEvent.click(vessel(state, 0))
    expect(dispatch).not.toHaveBeenCalled() // picking up is local state, not a move
    fireEvent.click(vessel(state, 1))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'pour', from: 0, to: 1 })
  })

  it('puts a jug back down when you tap it again, without spending a move', () => {
    const level = byId('four-litres')
    const state = { ...init(level), litres: [5, 0] }
    const { dispatch } = show(state)
    fireEvent.click(vessel(state, 0))
    expect(vessel(state, 0)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(vessel(state, 0))
    expect(vessel(state, 0)).toHaveAttribute('aria-pressed', 'false')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('lets you change your mind: tapping a jug that cannot take the pour picks it up', () => {
    // 8,5,3 sealed at [0,5,3]: the 3 is full, so it cannot receive the 5.
    const level = byId('half-and-half')
    const state = { ...init(level), litres: [0, 5, 3] }
    const { dispatch } = show(state)
    fireEvent.click(vessel(state, 1))
    const three = vessel(state, 2)
    expect(three).toBeEnabled()
    fireEvent.click(three)
    expect(dispatch).not.toHaveBeenCalled()
    expect(vessel(state, 2)).toHaveAttribute('aria-pressed', 'true')
    expect(vessel(state, 1)).toHaveAttribute('aria-pressed', 'false')
    // and the 3 now pours into the 8
    fireEvent.click(vessel(state, 0))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'pour', from: 2, to: 0 })
  })

  it('drops the jug in hand when the state changes, so rewinding is clean', () => {
    const level = byId('four-litres')
    const before = { ...init(level), litres: [5, 0] }
    const after = reduce(before, { type: 'pour', from: 0, to: 1 })
    const dispatch = vi.fn<(a: JugsAction) => void>()

    const go = (from: JugsState, to: JugsState, pickUp: number) => {
      const view = render(createElement(Board, { state: from, dispatch, locked: false }))
      fireEvent.click(vessel(from, pickUp))
      expect(vessel(from, pickUp)).toHaveAttribute('aria-pressed', 'true')
      view.rerender(createElement(Board, { state: to, dispatch, locked: false }))
      const travelled = snapshot(view.container)
      cleanup()
      const { container: cold } = show(to)
      // Identical to a board handed that state cold: the board is a pure
      // function of state, with no selection left over.
      expect(travelled).toBe(snapshot(cold))
      cleanup()
    }

    go(before, after, 0) // forward, the way a move happens
    go(after, before, 1) // backward, the way the move tape rewinds
  })

  it('ignores every input while locked', () => {
    for (const level of levels) {
      const state = { ...init(level), litres: level.config.jugs.map((j) => j.capacity) }
      const { dispatch, container } = show(state, true)
      const all = controls(container)
      expect(all.length).toBeGreaterThan(0)
      for (const b of all) {
        expect(b.el).toBeDisabled()
        expect(b.label).not.toMatch(/Pick it up|Pour the|Put it down/)
        fireEvent.click(b.el)
      }
      expect(dispatch).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('draws one litre as the same height in every jug on the level', () => {
    for (const level of levels) {
      const caps = level.config.jugs.map((j) => j.capacity)
      const { container } = show({ ...init(level), litres: caps })
      const jugs = [...container.querySelectorAll('svg[viewBox]')].filter((el) =>
        el.querySelector('rect'),
      )
      expect(jugs).toHaveLength(caps.length)

      const perLitre = jugs.map((svg, i) => {
        const rect = svg.querySelector('rect') as SVGRectElement
        const [, , width, height] = (svg.getAttribute('viewBox') as string).split(' ').map(Number)
        expect(width).toBe(76) // one shared drawing width, so one unit is one length
        expect(height).toBe(Number(rect.getAttribute('height')) + 7) // rim and foot
        return Number(rect.getAttribute('height')) / caps[i]
      })
      expect(new Set(perLitre).size).toBe(1)
      cleanup()
    }
  })

  it('slides the water down by exactly the missing litres', () => {
    const level = byId('six-litres')
    const { container } = show({ ...init(level), litres: [6, 0] })
    const shifts = [...container.querySelectorAll('rect')].map((r) =>
      Number(/translateY\((-?\d+(?:\.\d+)?)px\)/.exec(r.getAttribute('style') ?? '')?.[1]),
    )
    // 9-litre jug holding 6 is short by 3; the 4-litre jug is short by 4.
    expect(shifts).toEqual([3 * 22, 4 * 22])
  })

  it('tells a screen reader what the running note says as it changes', () => {
    const level = byId('four-litres')
    const state = { ...init(level), litres: [5, 0] }
    const { container } = show(state)
    const note = container.querySelector('[role="status"]') as HTMLElement
    expect(note).toBeTruthy()
    expect(note.textContent).toContain('Tap a jug to pick it up')
    fireEvent.click(vessel(state, 0))
    expect(note.textContent).toContain('pour the water in')
  })

  /* --- exhaustive: the board is exactly the rules, in every position ----- */

  for (const level of levels) {
    it(`"${level.label}" — the board offers every legal move and nothing dead`, () => {
      for (const state of allReachable(init(level))) {
        const n = state.cfg.jugs.length
        const dispatched: JugsAction[] = []

        /** No disabled control may invite a tap. */
        const honest = (c: HTMLElement) => {
          for (const b of controls(c)) {
            if (!b.live) expect(b.label, b.label).not.toMatch(/Pick it up|Pour the|Put it down/)
          }
        }

        // Nothing in hand: fill, empty and "pick up" match the rules exactly.
        const first = show(state)
        for (let i = 0; i < n; i++) {
          const fill = actAt(first.container, state, 'Fill', i)
          const empty = actAt(first.container, state, 'Empty', i)
          expect(Boolean(fill)).toBe(state.cfg.tap)
          expect(Boolean(empty)).toBe(state.cfg.drain)
          if (fill) expect(fill.live).toBe(canFill(state, i))
          if (empty) expect(empty.live).toBe(canEmpty(state, i))
          expect(jugAt(first.container, state, i).live).toBe(canPourFrom(state, i))
        }
        honest(first.container)
        if (!isSolved(state)) {
          expect(
            controls(first.container).some((b) => b.live),
            `nothing to press at ${key(state)}`,
          ).toBe(true)
        }
        for (let i = 0; i < n; i++) {
          for (const kind of ['Fill', 'Empty'] as const) {
            const b = actAt(first.container, state, kind, i)
            if (!b?.live) continue
            fireEvent.click(b.el)
            dispatched.push(kind === 'Fill' ? { type: 'fill', jug: i } : { type: 'empty', jug: i })
          }
        }
        expect(first.dispatch.mock.calls.map(([a]) => a)).toEqual(dispatched)
        cleanup()

        // With a jug in hand, every jug it can pour into is one more tap away,
        // and pouring does not disturb what is in hand.
        for (let i = 0; i < n; i++) {
          if (!canPourFrom(state, i)) continue
          const { dispatch, container } = show(state)
          fireEvent.click(jugAt(container, state, i).el)
          honest(container)
          const expected: JugsAction[] = []
          for (let j = 0; j < n; j++) {
            const target = jugAt(container, state, j)
            const usable = j === i || canPour(state, i, j) || canPourFrom(state, j)
            expect(target.live, `jug ${j} while holding ${i} @ ${key(state)}`).toBe(usable)
            if (canPour(state, i, j)) {
              fireEvent.click(target.el)
              expected.push({ type: 'pour', from: i, to: j })
            }
          }
          expect(dispatch.mock.calls.map(([a]) => a)).toEqual(expected)
          dispatched.push(...expected)
          cleanup()
        }

        // Everything the rules allow, and nothing else, came out of the board.
        const sortKeys = (xs: JugsAction[]) => xs.map((a) => JSON.stringify(a)).sort()
        expect(sortKeys(dispatched)).toEqual(sortKeys(legalMoves(state)))
      }
    })
  }
})
