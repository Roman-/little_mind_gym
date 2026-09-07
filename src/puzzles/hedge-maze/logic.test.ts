import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../lib/settings'
import { underSettings } from '../../test/settings'
import { makeRng } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { hedgeMaze } from './index'
import type { Dir, MazeAction, MazeConfig, MazeState } from './logic'
import {
  ACTIONS,
  DIRS,
  DIR_WORDS,
  canStep,
  caughtAt,
  colOf,
  describeMove,
  dogPath,
  dogStep,
  failure,
  hedged,
  init,
  isSolved,
  onBoard,
  parseMaze,
  reduce,
  refusalOf,
  rowOf,
  seamId,
  stateKey,
  stepCell,
} from './logic'

const levels = hedgeMaze.levels as PuzzleLevel<MazeConfig>[]

/**
 * The escape each level ships. It is written out in the same words the board
 * says, replayed move by move below, and never used to derive `par` — the
 * search does that on its own, over all five actions.
 */
const SOLUTIONS: Record<string, string[]> = {
  'six-squares': ['right', 'hold', 'right', 'up', 'up', 'up', 'right', 'right'],
  'seven-squares': [
    'down', 'hold', 'left', 'up', 'up', 'up', 'up', 'left', 'left', 'up', 'left',
  ],
  'eight-squares': [
    'right', 'down', 'down', 'right', 'hold', 'left', 'up', 'up', 'left', 'up',
    'left', 'left', 'up', 'up', 'up',
  ],
}

const asAction = (word: string): MazeAction => {
  if (word === 'hold') return { type: 'hold' }
  const dir = DIR_WORDS.indexOf(word as (typeof DIR_WORDS)[number])
  expect(dir, `${word} is not a direction`).toBeGreaterThanOrEqual(0)
  return { type: 'step', dir: dir as Dir }
}

/**
 * The shortest escape, searched over all five actions rather than over a list
 * of legal ones, so a bug shared between a move list and the rule cannot make
 * the search agree with itself. `invalid` is load-bearing: without it the
 * search walks through the dog's own square and reports a par no player can
 * reach.
 */
const solve = (state: MazeState) =>
  shortestSolution<MazeState, MazeAction>({
    start: state,
    moves: () => ACTIONS,
    apply: reduce,
    key: stateKey,
    solved: isSolved,
    invalid: (s) => failure(s) !== null,
  })

/** Every position reachable without being caught, with the moves out of each. */
function graphOf(start: MazeState) {
  const states = new Map<string, MazeState>([[stateKey(start), start]])
  const edges = new Map<string, { action: MazeAction; to: string }[]>()
  const stack: MazeState[] = [start]
  while (stack.length > 0) {
    const state = stack.pop() as MazeState
    const k = stateKey(state)
    if (isSolved(state)) {
      edges.set(k, [])
      continue
    }
    const outs: { action: MazeAction; to: string }[] = []
    for (const action of ACTIONS) {
      const next = reduce(state, action)
      if (next === state) continue
      if (failure(next) !== null) continue
      const nk = stateKey(next)
      outs.push({ action, to: nk })
      if (states.has(nk)) continue
      states.set(nk, next)
      stack.push(next)
    }
    edges.set(k, outs)
  }
  return { states, edges }
}

/**
 * Turns from every position to the way out, worked backwards from the solved
 * states. An independent second derivation of `par`, and what the "a hold is
 * needed" proof walks over.
 */
function distances(start: MazeState) {
  const { states, edges } = graphOf(start)
  const back = new Map<string, string[]>()
  for (const [from, outs] of edges) {
    for (const out of outs) {
      const list = back.get(out.to) ?? []
      list.push(from)
      back.set(out.to, list)
    }
  }
  const dist = new Map<string, number>()
  const queue: string[] = []
  for (const [k, state] of states) {
    if (!isSolved(state)) continue
    dist.set(k, 0)
    queue.push(k)
  }
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]
    for (const from of back.get(k) ?? []) {
      if (dist.has(from)) continue
      dist.set(from, (dist.get(k) as number) + 1)
      queue.push(from)
    }
  }
  return { states, edges, dist }
}

/** True when some shortest escape never once stands still. */
function escapesWithoutHolding(start: MazeState): boolean {
  const { states, edges, dist } = distances(start)
  const memo = new Map<string, boolean>()
  const walk = (k: string): boolean => {
    if (isSolved(states.get(k) as MazeState)) return true
    const cached = memo.get(k)
    if (cached !== undefined) return cached
    memo.set(k, false)
    const here = dist.get(k) as number
    let found = false
    for (const edge of edges.get(k) ?? []) {
      if (edge.action.type === 'hold') continue
      if (dist.get(edge.to) !== here - 1) continue
      if (!walk(edge.to)) continue
      found = true
      break
    }
    memo.set(k, found)
    return found
  }
  return walk(stateKey(start))
}

/** Walk a written escape, one move at a time, checking each one really moved. */
function replay(start: MazeState, plan: string[]): MazeState[] {
  const seen: MazeState[] = [start]
  let current = start
  for (const word of plan) {
    const next = reduce(current, asAction(word))
    expect(next, `"${word}" was rejected`).not.toBe(current)
    expect(failure(next), `"${word}" walked into the dog`).toBeNull()
    seen.push(next)
    current = next
  }
  return seen
}

describe('the hedge maze — the three boards', () => {
  for (const level of levels) {
    const picture = level.config.picture

    it(`"${level.label}" is a maze that can be read off its own picture`, () => {
      const state = parseMaze(picture)
      const { n } = state
      expect(picture).toHaveLength(2 * n + 1)
      expect([6, 7, 8]).toContain(n)

      // No line may start or end with a space, so no formatter can eat a door.
      for (const line of picture) {
        expect(line).toHaveLength(2 * n + 1)
        expect(line).toBe(line.trim())
      }

      // Exactly one gap, and the rest of the frame is solid.
      const frame = [
        picture[0],
        picture[2 * n],
        ...picture.filter((_, i) => i % 2 === 1).map((line) => line.charAt(0) + line.charAt(2 * n)),
      ].join('')
      expect([...frame].filter((ch) => ch === 'o')).toHaveLength(1)
      expect([...picture.join('')].filter((ch) => ch === 'R')).toHaveLength(1)
      expect([...picture.join('')].filter((ch) => ch === 'D')).toHaveLength(1)

      // The mask is symmetric, and no bit points off the board.
      for (let cell = 0; cell < n * n; cell++) {
        for (const dir of DIRS) {
          if (!hedged(state, cell, dir)) continue
          expect(onBoard(n, cell, dir), `${cell} has a hedge off the board`).toBe(true)
          const other = stepCell(n, cell, dir)
          expect(hedged(state, other, ((dir + 2) % 4) as Dir)).toBe(true)
        }
      }

      // The way out is a way out: the door square opens onto the frame there.
      expect(hedged(state, state.door, state.doorDir)).toBe(false)
      expect(onBoard(n, state.door, state.doorDir)).toBe(false)
      expect(canStep(state, state.door, state.doorDir)).toBe(false)
      expect(state.hero).not.toBe(state.dog)
      expect(isSolved(state)).toBe(false)
      expect(failure(state)).toBeNull()
    })

    it(`"${level.label}" is solvable in exactly par (${level.par}) turns`, () => {
      const path = solve(init(level))
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
      const walked = (path as MazeAction[]).reduce((state, action) => {
        const next = reduce(state, action)
        expect(next).not.toBe(state)
        return next
      }, init(level))
      expect(isSolved(walked)).toBe(true)
    })

    it(`"${level.label}" agrees with a second, backwards count of the same number`, () => {
      const start = init(level)
      const { dist } = distances(start)
      expect(dist.get(stateKey(start))).toBe(level.par)
    })

    it(`"${level.label}" keeps its whole graph far inside the search cap`, () => {
      const reached = reachableCount<MazeState, MazeAction>({
        start: init(level),
        moves: () => ACTIONS,
        apply: reduce,
        key: stateKey,
        invalid: (s) => failure(s) !== null,
      })
      expect(reached).toBeGreaterThan(20)
      expect(reached).toBeLessThan(1000)
    })

    it(`"${level.label}" plays out exactly as the escape it ships`, () => {
      const plan = SOLUTIONS[level.id]
      expect(plan).toHaveLength(level.par as number)
      const seen = replay(init(level), plan)
      expect(isSolved(seen[seen.length - 1])).toBe(true)
      // Every position but the last is a real, unfinished one.
      for (const state of seen.slice(0, -1)) expect(isSolved(state)).toBe(false)
    })

    it(`"${level.label}" cannot be escaped without standing still at least once`, () => {
      expect(escapesWithoutHolding(init(level))).toBe(false)
      // …and the escape it ships is one of the shortest, so it holds too.
      expect(SOLUTIONS[level.id]).toContain('hold')
    })

    it(`"${level.label}" keeps the dog moving for at least half the escape`, () => {
      const seen = replay(init(level), SOLUTIONS[level.id])
      let live = 0
      for (let i = 1; i < seen.length; i++) if (seen[i].dog !== seen[i - 1].dog) live++
      expect(live).toBeGreaterThanOrEqual(Math.ceil((level.par as number) / 2))
    })

    it(`"${level.label}" is forgiving: few taps along the way end the level`, () => {
      const seen = replay(init(level), SOLUTIONS[level.id])
      let acted = 0
      let fatal = 0
      for (const state of seen.slice(0, -1)) {
        for (const action of ACTIONS) {
          const next = reduce(state, action)
          if (next === state) continue
          acted++
          if (failure(next) !== null) fatal++
        }
      }
      expect(acted).toBeGreaterThan(2 * (level.par as number))
      expect(fatal / acted).toBeLessThan(0.15)
    })
  }

  it('ramps 1 → 2 → 3 with three hints and a stable id each', () => {
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['six-squares', 'seven-squares', 'eight-squares'])
    expect(levels.map((l) => l.label)).toEqual(['Six squares', 'Seven squares', 'Eight squares'])
    expect(levels.map((l) => l.par)).toEqual([8, 11, 15])
    expect(levels.map((l) => parseMaze(l.config.picture).n)).toEqual([6, 7, 8])
    for (const level of levels) expect(level.hints).toHaveLength(3)
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    const lines = [...hedgeMaze.instructions, ...levels.flatMap((l) => l.hints)]
    expect(hedgeMaze.instructions.length).toBeGreaterThanOrEqual(2)
    expect(hedgeMaze.instructions.length).toBeLessThanOrEqual(4)
    expect(hedgeMaze.instructions[0]).toMatch(/gap/)
    for (const line of lines) {
      expect(line, line).toMatch(/^[A-Z]/)
      expect(line, line).toMatch(/\.$/)
      expect(line.length, line).toBeLessThanOrEqual(140)
      expect(line, line).not.toMatch(/[!]/)
      expect(line, line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}]/u)
    }
  })

  it('nudges in the hints instead of handing over the escape', () => {
    for (const level of levels) {
      const opening = SOLUTIONS[level.id].slice(0, 3).join(' ')
      for (const hint of level.hints) {
        // Never an instruction to take a particular step…
        expect(hint, hint).not.toMatch(/\b(step|move|go|walk)\s+(up|right|down|left)\b/i)
        // …and never any run of the escape read out.
        expect(hint.toLowerCase(), hint).not.toContain(opening)
        expect(hint, hint).not.toMatch(/(up|right|down|left),\s*(up|right|down|left)/i)
      }
    }
  })

  it('describes itself for the index row without hype', () => {
    expect(hedgeMaze.id).toBe('hedge-maze')
    expect(hedgeMaze.title).toBe('The hedge maze')
    expect(hedgeMaze.tagline).toMatch(/\.$/)
    expect(hedgeMaze.reseedable).toBe(false)
  })
})

describe('the hedge maze — rules', () => {
  const level = levels[0]
  const start = init(level)

  it('never touches the rng, so every seed gives the same maze', () => {
    let calls = 0
    for (let seed = 1; seed <= 40; seed++) {
      const inner = makeRng(seed)
      const rng = () => {
        calls += 1
        return inner()
      }
      for (const one of levels) {
        const state = hedgeMaze.engine.init(one, rng)
        expect(stateKey(state)).toBe(stateKey(init(one)))
      }
    }
    expect(calls).toBe(0)
    // Two starts never share the one array a state is allowed to hold.
    expect(init(level).hedges).not.toBe(init(level).hedges)
  })

  it('returns the identical state object for every action that changes nothing', () => {
    // Up is hedged from this square, down is off the board.
    expect(hedged(start, start.hero, 0)).toBe(true)
    expect(onBoard(start.n, start.hero, 2)).toBe(false)
    expect(reduce(start, { type: 'step', dir: 0 })).toBe(start)
    expect(reduce(start, { type: 'step', dir: 2 })).toBe(start)

    const rejected = [
      { type: 'step', dir: 4 },
      { type: 'step', dir: -1 },
      { type: 'step', dir: 1.5 },
      { type: 'step', dir: Number.NaN },
      { type: 'step' },
      { type: 'never' },
      {},
    ]
    for (const action of rejected) {
      expect(reduce(start, action as unknown as MazeAction), JSON.stringify(action)).toBe(start)
    }
    expect(reduce(start, undefined as unknown as MazeAction)).toBe(start)

    // …and the two steps this square really has must NOT return the same object.
    expect(reduce(start, { type: 'step', dir: 1 })).not.toBe(start)
    expect(reduce(start, { type: 'step', dir: 3 })).not.toBe(start)
  })

  it('treats a hold the dog cannot answer as nothing happening, not a rule broken', () => {
    let held = 0
    for (const one of levels) {
      const { states } = graphOf(init(one))
      for (const state of states.values()) {
        if (isSolved(state)) continue
        const next = reduce(state, { type: 'hold' })
        const still = dogPath(state, state.hero).to === state.dog
        expect(next === state, stateKey(state)).toBe(still)
        if (still) held++
        // Nothing about standing still is ever refused: it breaks no rule.
        expect(refusalOf(state, 0)?.message ?? null).not.toBe('Standing still')
      }
    }
    expect(held).toBeGreaterThan(0)
  })

  it('changes something on every state it hands back, and nothing on the rest', () => {
    for (const one of levels) {
      const { states } = graphOf(init(one))
      const before = [...states.values()].map((state) => JSON.stringify(state))
      for (const state of states.values()) {
        for (const action of ACTIONS) {
          const next = reduce(state, action)
          if (next === state) continue
          expect(next.hero !== state.hero || next.dog !== state.dog).toBe(true)
          // The maze is one array, allocated by init and shared through every spread.
          expect(next.hedges).toBe(state.hedges)
          expect(next.n).toBe(state.n)
          expect(next.door).toBe(state.door)
        }
      }
      expect([...states.values()].map((state) => JSON.stringify(state))).toEqual(before)
    }
  })

  it('lets the rabbit walk onto the dog, and calls that a dead end', () => {
    // (5,2) → right → (5,3), and the dog is nowhere near yet.
    expect(failure(start)).toBeNull()
    expect(caughtAt(start)).toBeNull()

    const caught: MazeState = { ...start, hero: 10, dog: 11 }
    const onto = reduce(caught, { type: 'step', dir: 1 })
    expect(onto).not.toBe(caught)
    expect(onto.hero).toBe(11)
    expect(onto.dog).toBe(11)
    expect(caughtAt(onto)).toBe(11)
    expect(failure(onto)).toBe('The dog caught you.')
    // A dog standing on the rabbit has nowhere it wants to go.
    expect(dogStep(onto, onto.dog, onto.hero)).toBe(onto.dog)
  })

  it('lets the dog catch the rabbit, and says so in the same sentence', () => {
    for (const one of levels) {
      const { states } = graphOf(init(one))
      for (const state of states.values()) {
        for (const action of ACTIONS) {
          const next = reduce(state, action)
          if (next === state) continue
          const said = failure(next)
          expect(said).toBe(next.hero !== -1 && next.hero === next.dog ? 'The dog caught you.' : null)
        }
      }
    }
  })

  it('stops once the rabbit is out, and gives the dog no turn on the way', () => {
    const { door, doorDir } = start
    const atDoor: MazeState = { ...start, hero: door }
    const out = reduce(atDoor, { type: 'step', dir: doorDir })
    expect(isSolved(out)).toBe(true)
    expect(out.hero).toBe(-1)
    expect(out.dog).toBe(atDoor.dog)
    for (const action of ACTIONS) expect(reduce(out, action)).toBe(out)
    expect(failure(out)).toBeNull()
    expect(refusalOf(out, 0)).toBeNull()
  })

  it('refuses a step into a hedge, and refuses nothing else', () => {
    for (const one of levels) {
      const { states } = graphOf(init(one))
      for (const state of states.values()) {
        if (isSolved(state)) continue
        for (const dir of DIRS) {
          const no = refusalOf(state, dir)
          const isDoor = state.hero === state.door && dir === state.doorDir
          const wall = !isDoor && hedged(state, state.hero, dir)
          if (!wall) {
            expect(no, `${stateKey(state)} ${dir}`).toBeNull()
            continue
          }
          expect(no?.message).toBe('A hedge is in the way.')
          // Nothing moves: a rabbit cannot be drawn standing inside a hedge.
          expect(no?.pretend).toBe(state)
          expect(reduce(state, { type: 'step', dir })).toBe(state)
        }
      }
    }
  })

  it('names the hedge between two squares the same way from either side', () => {
    const { n } = start
    for (let cell = 0; cell < n * n; cell++) {
      for (const dir of DIRS) {
        if (!onBoard(n, cell, dir)) continue
        const other = stepCell(n, cell, dir)
        expect(seamId(n, cell, dir)).toBe(seamId(n, other, ((dir + 2) % 4) as Dir))
      }
    }
  })

  it('walks the dog sideways first, and stands it still when a hedge says no', () => {
    for (const one of levels) {
      const { states } = graphOf(init(one))
      for (const state of states.values()) {
        if (isSolved(state)) continue
        const { via, to } = dogPath(state, state.hero)
        // A first step that goes nowhere means a second one that goes nowhere.
        if (via === state.dog) expect(to).toBe(via)
        for (const [dog, hero, next] of [
          [state.dog, state.hero, via],
          [via, state.hero, to],
        ]) {
          if (next === dog) continue
          const sideways = rowOf(state.n, next) === rowOf(state.n, dog)
          const nearer = sideways
            ? Math.abs(colOf(state.n, next) - colOf(state.n, hero)) <
              Math.abs(colOf(state.n, dog) - colOf(state.n, hero))
            : Math.abs(rowOf(state.n, next) - rowOf(state.n, hero)) <
              Math.abs(rowOf(state.n, dog) - rowOf(state.n, hero))
          expect(nearer, `${dog} → ${next}`).toBe(true)
          // It only goes up or down once sideways is closed to it.
          if (!sideways && colOf(state.n, dog) !== colOf(state.n, hero)) {
            const towards: Dir = colOf(state.n, hero) > colOf(state.n, dog) ? 1 : 3
            expect(canStep(state, dog, towards)).toBe(false)
          }
        }
      }
    }
  })

  it('describes a turn in the same words the board uses', () => {
    const stepped = reduce(start, { type: 'step', dir: 1 })
    expect(describeMove(start, stepped, { type: 'step', dir: 1 })).toBe('Stepped right')
    const holding = reduce(start, { type: 'hold' })
    expect(describeMove(start, holding, { type: 'hold' })).toBe('Stood still')
    const atDoor: MazeState = { ...start, hero: start.door }
    const out = reduce(atDoor, { type: 'step', dir: start.doorDir })
    expect(describeMove(atDoor, out, { type: 'step', dir: start.doorDir })).toBe(
      'Went out through the gap',
    )
    expect(describeMove(start, start, { type: 'never' } as unknown as MazeAction)).toBe(
      'Nothing moved',
    )
  })

  it('refuses to read a maze it cannot make sense of', () => {
    const broken: [string, string[]][] = [
      ['an even number of lines', ['+-+', '|.|']],
      ['a short line', ['+-+-+', '|. .|', '+ + +', '|. .', '+-+-+']],
      ['no gap in the frame', ['+-+-+', '|R .|', '+ + +', '|. D|', '+-+-+']],
      ['two gaps', ['+-+-+', 'oR .o', '+ + +', '|. D|', '+-+-+']],
      ['no rabbit', ['+-+-+', 'o. .|', '+ + +', '|. D|', '+-+-+']],
      ['no dog', ['+-+-+', 'oR .|', '+ + +', '|. .|', '+-+-+']],
      ['a corner that is not a corner', ['+-+-+', 'oR .|', '- + +', '|. D|', '+-+-+']],
      ['a square that is not a square', ['+-+-+', 'oR x|', '+ + +', '|. D|', '+-+-+']],
      ['a seam that is neither hedge nor space', ['+-+-+', 'oR .|', '+ x +', '|. D|', '+-+-+']],
      ['a line with a space at the end', ['+-+-+', 'oR . ', '+ + +', '|. D|', '+-+-+']],
    ]
    for (const [why, picture] of broken) {
      expect(() => parseMaze(picture), why).toThrow()
    }
    // …and the smallest well-formed maze reads fine.
    expect(parseMaze(['+-+-+', 'oR .|', '+ + +', '|. D|', '+-+-+']).n).toBe(2)
  })
})

describe('the hedge maze — board', () => {
  afterEach(cleanup)

  const show = (state: MazeState, locked = false, settings?: Partial<Settings>) => {
    const dispatch = vi.fn()
    const view = render(createElement(hedgeMaze.engine.Board, { state, dispatch, locked }), {
      wrapper: underSettings(settings),
    })
    return { dispatch, view }
  }

  const start = init(levels[0])
  const status = (view: { container: HTMLElement }) =>
    view.container.querySelector('[role="status"]')?.textContent

  it('offers one control a direction, plus standing still, and no more', () => {
    show(start)
    // (5,2) on a six-wide board: up, right and left have squares; down is the frame.
    expect(screen.getByRole('button', { name: 'Step up, but a hedge stands there.' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Step right.' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Step left.' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /step down/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stand still.' })).toBeEnabled()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
    }
  })

  it('sends one action a tap', () => {
    const { dispatch } = show(start)
    fireEvent.click(screen.getByRole('button', { name: 'Step right.' }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'step', dir: 1 })
  })

  it('makes the arrow keys the four steps', () => {
    const { dispatch } = show(start)
    const button = screen.getByRole('button', { name: 'Step left.' })
    button.focus()
    fireEvent.keyDown(button, { key: 'ArrowLeft' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'step', dir: 3 })
    fireEvent.keyDown(button, { key: 'Home' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('takes the arrows from the stage as well, where the shell parks focus', () => {
    const { dispatch, view } = show(start)
    // The shell puts focus on the stage — the board's parent — when a control
    // a child has just used goes away. A maze that ignored that would go deaf
    // for one press every time the rabbit reached an edge.
    const stage = view.container
    stage.tabIndex = -1
    stage.focus()
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'step', dir: 1 })
  })

  it('leaves the arrows alone everywhere else on the page', () => {
    const { dispatch } = show(start)
    document.body.focus()
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('offers the step a hedge will not take, then says no and keeps it off the tape', () => {
    const { dispatch, view } = show(start)
    const blocked = screen.getByRole('button', { name: 'Step up, but a hedge stands there.' })
    expect(blocked).not.toHaveAttribute('aria-disabled')
    fireEvent.click(blocked)
    expect(dispatch).not.toHaveBeenCalled()
    expect(status(view)).toContain('A hedge is in the way.')
    expect(view.container.querySelectorAll('[class*="flash"]')).toHaveLength(1)
    expect(view.container.querySelectorAll('[class*="shake"]')).toHaveLength(1)
  })

  it('lets the setting turn that step back into a dead control', () => {
    const { dispatch, view } = show(start, false, { allowForbiddenMoves: false })
    const blocked = screen.getByRole('button', { name: 'Step up, but a hedge stands there.' })
    expect(blocked).toHaveAttribute('aria-disabled', 'true')
    // aria-disabled, never disabled: the tab stop stays where a child left it.
    expect(blocked).toBeEnabled()
    fireEvent.click(blocked)
    expect(dispatch).not.toHaveBeenCalled()
    expect(status(view)).not.toContain('A hedge is in the way.')
  })

  it('kills the Stand still control on a turn the dog cannot answer', () => {
    // The dog is walled into the top-left corner behind the rabbit's own row.
    const stuck: MazeState = { ...start, hero: 32, dog: 32 - 6 }
    expect(reduce(stuck, { type: 'hold' })).toBe(stuck)
    const { dispatch } = show(stuck)
    const hold = screen.getByRole('button', { name: 'Stand still.' })
    expect(hold).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(hold)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores every input while locked', () => {
    const { dispatch } = show(start, true)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('says what the dog did, in words as well as in motion', () => {
    const { view } = show(start)
    expect(status(view)).toContain('The rabbit is on row 6, column 3.')
    const moved = reduce(start, { type: 'step', dir: 1 })
    view.rerender(
      createElement(hedgeMaze.engine.Board, { state: moved, dispatch: vi.fn(), locked: false }),
    )
    expect(status(view)).toMatch(/^The dog went right, then right again\./)
    expect(view.container.textContent).toContain('The dog went right, then right again.')
  })

  it('says nothing about the dog when the board is handed an older position', () => {
    const { view } = show(start)
    const moved = reduce(start, { type: 'step', dir: 1 })
    const props = (state: MazeState) => ({ state, dispatch: vi.fn(), locked: false })
    view.rerender(createElement(hedgeMaze.engine.Board, props(moved)))
    expect(status(view)).toContain('The dog went')
    // A rewind through the move tape is not a turn anybody took.
    view.rerender(createElement(hedgeMaze.engine.Board, props(init(levels[0]))))
    expect(status(view)).not.toContain('The dog went')
  })

  it('draws the rabbit out through the gap once it is out', () => {
    const atDoor: MazeState = { ...start, hero: start.door }
    const { view } = show(atDoor)
    expect(screen.getByRole('button', { name: 'Go out through the gap.' })).toBeEnabled()
    const out = reduce(atDoor, { type: 'step', dir: atDoor.doorDir })
    view.rerender(createElement(hedgeMaze.engine.Board, { state: out, dispatch: vi.fn(), locked: true }))
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(status(view)).toContain('The rabbit is out through the gap.')
  })

  it('draws one bar a hedge, and one picture an animal', () => {
    const { view } = show(start)
    const bars = view.container.querySelectorAll('[class*="hedge"][data-lie]')
    let seams = 0
    for (let cell = 0; cell < start.n * start.n; cell++) {
      for (const dir of [1, 2] as Dir[]) if (hedged(start, cell, dir)) seams++
    }
    expect(bars).toHaveLength(seams)
    expect(seams).toBeGreaterThan(4)
    const pieces = view.container.querySelector('[class*="pieces"]') as HTMLElement
    expect(pieces.children).toHaveLength(2)
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = reduce(start, { type: 'step', dir: 3 })
    const a = show(state)
    const first = a.view.container.innerHTML
    cleanup()
    const b = show(state)
    expect(b.view.container.innerHTML).toBe(first)
  })

  it('renders the rule and the pieces — the shell owns everything else', () => {
    const { view } = show(start)
    expect(view.container.querySelectorAll('h1, h2, h3, h4')).toHaveLength(0)
    expect(view.container.textContent).toContain('The dog takes two steps for every one of yours.')
    expect(view.container.textContent).toContain('Out')
    expect(view.container.textContent).not.toMatch(/solved|par|move [0-9]/i)
  })
})
