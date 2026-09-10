import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { underSettings } from '../../test/settings'
import { makeRng } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { stonePath } from './index'
import { Board } from './Board'
import type { Dir, StoneAction, StoneConfig, StoneState } from './logic'
import {
  DIRS,
  DIR_WORDS,
  STUCK,
  back,
  canWalk,
  describeMove,
  failure,
  init,
  isSolved,
  keyOf,
  lineTo,
  nextStone,
  parseBoard,
  reduce,
  refusalOf,
  spotOf,
  stepTarget,
  stonesLeft,
  walksOf,
} from './logic'

const levels = stonePath.levels as PuzzleLevel<StoneConfig>[]

/**
 * The walk each level ships, written the way the board says it and replayed
 * one step at a time below. It is never used to derive `par` — the search does
 * that on its own, over all four ways from every position — but a level whose
 * shipped walk came apart would be a level nobody had played.
 */
const SOLUTIONS: Record<string, string[]> = {
  'seven-stones': ['down', 'left', 'up', 'right', 'up', 'left'],
  'eight-stones': ['down', 'right', 'up', 'right', 'down', 'left', 'down'],
  'eleven-stones': ['left', 'up', 'left', 'down', 'left', 'down', 'left', 'up', 'right', 'up'],
}

/** "down" → the action a tap on the stone below makes. */
function asAction(word: string): StoneAction {
  const dir = DIR_WORDS.indexOf(word as (typeof DIR_WORDS)[number])
  expect(dir, `${word} is not a direction`).toBeGreaterThanOrEqual(0)
  return { type: 'walk', dir: dir as Dir }
}

/**
 * The shortest walk that clears the board, searched over all four ways from
 * every position rather than over a list of legal ones, so a bug shared
 * between a move list and the rule cannot make the search agree with itself.
 */
const solve = (state: StoneState) =>
  shortestSolution<StoneState, StoneAction>({
    start: state,
    moves: walksOf,
    apply: reduce,
    key: keyOf,
    solved: isSolved,
  })

/** Walk a written plan, one step at a time, checking each one really moved. */
function replay(start: StoneState, plan: string[]): StoneState[] {
  const seen: StoneState[] = [start]
  let current = start
  for (const step of plan) {
    const next = reduce(current, asAction(step))
    expect(next, `"${step}" walked nowhere`).not.toBe(current)
    seen.push(next)
    current = next
  }
  return seen
}

/**
 * Everything the three boards were picked for, worked out again from the
 * picture rather than trusted from the comment above them.
 *
 *   ways          how many different walks clear the board
 *   worstWrongRun the longest run of taps a wrong turn buys before it jams,
 *                 counting the wrong turn itself — the one number this
 *                 puzzle's boards were chosen on, because it is also the
 *                 number of Step backs it costs to undo
 *   wrongTurns    how many moves anywhere on the board lead from a position
 *                 that can still be finished to one that cannot
 *   jams          reachable positions with stones left and nowhere to go
 */
function gradeOf(start: StoneState) {
  const ways = new Map<string, number>()
  const height = new Map<string, number>()

  // The graph is a strict downhill: every move takes a stone and no move ever
  // puts one back, so it cannot come round on itself and one walk of it
  // settles both numbers.
  const walk = (state: StoneState): string => {
    const k = keyOf(state)
    if (ways.has(k)) return k
    ways.set(k, 0)
    height.set(k, 0)
    if (isSolved(state)) {
      ways.set(k, 1)
      return k
    }
    let count = 0
    let tall = 0
    for (const action of walksOf(state)) {
      const next = reduce(state, action)
      if (next === state) continue
      const child = walk(next)
      count += ways.get(child) as number
      tall = Math.max(tall, 1 + (height.get(child) as number))
    }
    ways.set(k, count)
    height.set(k, tall)
    return k
  }
  walk(start)

  let worstWrongRun = 0
  let wrongTurns = 0
  let jams = 0
  const seen = new Set([keyOf(start)])
  const stack = [start]
  while (stack.length > 0) {
    const state = stack.pop() as StoneState
    const live = (ways.get(keyOf(state)) as number) > 0
    let moves = 0
    for (const action of walksOf(state)) {
      const next = reduce(state, action)
      if (next === state) continue
      moves++
      const child = keyOf(next)
      if (live && ways.get(child) === 0) {
        wrongTurns++
        worstWrongRun = Math.max(worstWrongRun, 1 + (height.get(child) as number))
      }
      if (seen.has(child)) continue
      seen.add(child)
      stack.push(next)
    }
    if (moves === 0 && !isSolved(state)) jams++
  }

  return { ways: ways.get(keyOf(start)) as number, worstWrongRun, wrongTurns, jams, states: seen.size }
}

/** Every position along a walk, and every position anywhere on the board. */
function statesAlong(start: StoneState, plan: string[]): StoneState[] {
  return replay(start, plan).slice(0, -1)
}

function everyPosition(start: StoneState): StoneState[] {
  const seen = new Map([[keyOf(start), start]])
  const stack = [start]
  while (stack.length > 0) {
    const state = stack.pop() as StoneState
    for (const action of walksOf(state)) {
      const next = reduce(state, action)
      if (next === state || seen.has(keyOf(next))) continue
      seen.set(keyOf(next), next)
      stack.push(next)
    }
  }
  return [...seen.values()]
}

/** The steps of a walk where more than one move is on offer. */
const forksAlong = (start: StoneState, plan: string[]): number[] =>
  statesAlong(start, plan).flatMap((state, step) =>
    walksOf(state).filter((action) => reduce(state, action) !== state).length > 1 ? [step] : [],
  )

/**
 * The steps of a walk where a stone is lying straight behind. These are the
 * only moments the never-turn-back rule can be met by putting a finger on the
 * stone it forbids, which is why a level with none of them is a level that
 * never asks about it.
 */
const turnBacksAlong = (start: StoneState, plan: string[]): number[] =>
  statesAlong(start, plan).flatMap((state, step) =>
    state.heading !== -1 && nextStone(state, state.at, back(state.heading)) >= 0 ? [step] : [],
  )

describe('the stone path — the three boards', () => {
  for (const level of levels) {
    const picture = level.config.picture

    it(`"${level.label}" is a board that can be read off its own picture`, () => {
      const state = parseBoard(picture)
      const { n } = state
      expect(picture).toHaveLength(n)
      expect([4, 5, 6]).toContain(n)
      for (const line of picture) {
        expect(line).toHaveLength(n)
        expect(line).toMatch(/^[.oS]+$/)
      }

      // Exactly one stone to start on, and it is picked up as the level opens:
      // the walk begins standing on a square it has already cleared, with no
      // way in behind it.
      expect([...picture.join('')].filter((ch) => ch === 'S')).toHaveLength(1)
      expect(state.stones[state.at]).toBe(false)
      expect(state.heading).toBe(-1)
      expect(state.trail).toEqual([state.at])
      expect(isSolved(state)).toBe(false)
    })

    it(`"${level.label}" is solvable in exactly par (${level.par}) moves`, () => {
      // Two proofs of the same number, and both have to hold. The search finds
      // the shortest walk over the whole graph; the counting argument says
      // there is only one length a walk can have, because every move takes
      // exactly one stone and the walk is over when the last one is up.
      const start = init(level)
      const path = solve(start)
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
      expect(stonesLeft(start)).toBe(level.par)

      const walked = (path as StoneAction[]).reduce((state, action) => {
        const next = reduce(state, action)
        expect(next).not.toBe(state)
        expect(stonesLeft(next)).toBe(stonesLeft(state) - 1)
        return next
      }, start)
      expect(isSolved(walked)).toBe(true)
    })

    it(`"${level.label}" plays out exactly as the walk it ships`, () => {
      const plan = SOLUTIONS[level.id]
      expect(plan).toHaveLength(level.par as number)
      const seen = replay(init(level), plan)
      expect(isSolved(seen[seen.length - 1])).toBe(true)
      // Every position but the last is a real, unfinished one.
      for (const state of seen.slice(0, -1)) expect(isSolved(state)).toBe(false)
      // And the trail is the whole walk, one square a step.
      expect(seen[seen.length - 1].trail).toHaveLength(plan.length + 1)
    })

    it(`"${level.label}" keeps its whole graph far inside the search cap`, () => {
      const reached = reachableCount<StoneState, StoneAction>({
        start: init(level),
        moves: walksOf,
        apply: reduce,
        key: keyOf,
      })
      expect(reached).toBeGreaterThan(5)
      expect(reached).toBeLessThan(200)
    })
  }

  /**
   * The character each board was picked for, measured rather than promised.
   *
   * `worstWrongRun` is the whole design. A board thrown down at random has one
   * answer and a first wrong turn that wanders five or six moves at five wide,
   * and seven or eight at six wide, before it jams — and every one of those
   * moves is a Step back on the way out again. These three were searched for
   * offline until the worst wrong turn on them ran three, and the first of
   * them cannot be got wrong at all.
   */
  const GRADES: Record<
    string,
    { ways: number; worstWrongRun: number; wrongTurns: number; forks: number[]; turnBacks: number }
  > = {
    'seven-stones': { ways: 1, worstWrongRun: 0, wrongTurns: 0, forks: [], turnBacks: 0 },
    'eight-stones': { ways: 1, worstWrongRun: 3, wrongTurns: 2, forks: [1, 2], turnBacks: 1 },
    'eleven-stones': { ways: 1, worstWrongRun: 3, wrongTurns: 2, forks: [4, 5], turnBacks: 1 },
  }

  for (const level of levels) {
    it(`"${level.label}" has the difficulty character it was chosen for`, () => {
      const want = GRADES[level.id]
      const start = init(level)
      const grade = gradeOf(start)
      expect(grade.ways, 'one answer, and only one').toBe(want.ways)
      expect(grade.worstWrongRun, 'taps a wrong turn buys before it jams').toBe(want.worstWrongRun)
      expect(grade.wrongTurns, 'ways to go wrong anywhere on the board').toBe(want.wrongTurns)
      expect(forksAlong(start, SOLUTIONS[level.id]), 'where the choices sit').toEqual(want.forks)
      expect(turnBacksAlong(start, SOLUTIONS[level.id]), 'where a stone lies behind').toHaveLength(
        want.turnBacks,
      )
    })
  }

  it('cannot be got wrong at all on the first level', () => {
    // Every position on it has exactly one move, so there is no wrong turn to
    // make and no jam to step back from. A first level is for learning to look
    // along four lines; the choice and the dead end arrive together on the
    // second one.
    const start = init(levels[0])
    const grade = gradeOf(start)
    expect(grade.jams).toBe(0)
    for (const state of everyPosition(start)) {
      expect(failure(state), keyOf(state)).toBeNull()
      const moves = walksOf(state).filter((action) => reduce(state, action) !== state)
      expect(moves.length, keyOf(state)).toBe(isSolved(state) ? 0 : 1)
    }
  })

  for (const level of levels.slice(1)) {
    it(`"${level.label}" really can be walked into a dead end`, () => {
      const grade = gradeOf(init(level))
      expect(grade.jams).toBeGreaterThan(0)
      const stuck = everyPosition(init(level)).filter((state) => failure(state) !== null)
      expect(stuck.length).toBeGreaterThan(0)
      for (const state of stuck) {
        expect(failure(state)).toBe(STUCK)
        expect(isSolved(state)).toBe(false)
        expect(stonesLeft(state)).toBeGreaterThan(0)
        for (const dir of DIRS) expect(reduce(state, { type: 'walk', dir })).toBe(state)
      }
    })
  }

  it('ramps 1 → 2 → 3 with three hints and a stable id each', () => {
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['seven-stones', 'eight-stones', 'eleven-stones'])
    expect(levels.map((l) => l.label)).toEqual(['Seven stones', 'Eight stones', 'Eleven stones'])
    expect(levels.map((l) => l.par)).toEqual([6, 7, 10])
    // The board grows with the walk, and the label counts what is on it.
    expect(levels.map((l) => init(l).n)).toEqual([4, 5, 6])
    expect(levels.map((l) => stonesLeft(init(l)) + 1)).toEqual([7, 8, 11])
    for (const level of levels) expect(level.hints).toHaveLength(3)
  })

  it('lays every board out over its own grid', () => {
    // A board huddled in one corner of a grid is a board drawn on the wrong
    // grid. Every one of these leaves at most one row and one column bare.
    for (const level of levels) {
      const state = init(level)
      const on = state.stones.flatMap((there, cell) => (there ? [cell] : [])).concat(state.at)
      const rows = new Set(on.map((cell) => Math.floor(cell / state.n)))
      const cols = new Set(on.map((cell) => cell % state.n))
      expect(rows.size, level.id).toBeGreaterThanOrEqual(state.n - 1)
      expect(cols.size, level.id).toBeGreaterThanOrEqual(state.n - 1)
    }
  })

  it('turns a corner rather than running in a straight line', () => {
    // A walk that never turns is a walk with nothing in it. Each of these
    // changes direction on most of its steps.
    for (const level of levels) {
      const plan = SOLUTIONS[level.id]
      const turns = plan.filter((word, i) => i > 0 && word !== plan[i - 1]).length
      expect(turns, level.id).toBeGreaterThanOrEqual(plan.length - 2)
    }
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    const lines = [...stonePath.instructions, ...levels.flatMap((l) => l.hints)]
    expect(stonePath.instructions.length).toBeGreaterThanOrEqual(2)
    expect(stonePath.instructions.length).toBeLessThanOrEqual(4)
    expect(stonePath.instructions[0]).toMatch(/stone/)
    for (const line of lines) {
      expect(line, line).toMatch(/^[A-Z]/)
      expect(line, line).toMatch(/\.$/)
      expect(line.length, line).toBeLessThanOrEqual(140)
      expect(line, line).not.toMatch(/[!]/)
      expect(line, line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}]/u)
    }
  })

  it('nudges in the hints instead of handing over the walk', () => {
    for (const level of levels) {
      const opening = SOLUTIONS[level.id].slice(0, 2).join(' ')
      for (const hint of level.hints) {
        // Never a direction to go in…
        expect(hint, hint).not.toMatch(/\b(go|walk|take)\b[^.]*\b(up|right|down|left)\b/i)
        // …and never any run of the answer read out.
        expect(hint.toLowerCase(), hint).not.toContain(opening)
        expect(hint, hint).not.toMatch(/(up|right|down|left),\s*(up|right|down|left)/i)
      }
    }
  })

  it('describes itself for the index row without hype', () => {
    expect(stonePath.id).toBe('stone-path')
    expect(stonePath.title).toBe('The stone path')
    expect(stonePath.tagline).toMatch(/\.$/)
    expect(stonePath.reseedable).toBe(false)
  })
})

/* ============================================================
   The rules, on boards built to ask about them rather than to
   be played.
   ============================================================ */

describe('the stone path — rules', () => {
  /**
   * Five stones round the rim, and one of them behind the walk the moment it
   * has taken a step. Between them they hold every answer the rules can give:
   * a legal walk, a line with nothing on it, the way back, a stone with
   * another one in front of it, and a stone on neither the row nor the column.
   */
  const lines = parseBoard([
    'o.S.o',
    '.....',
    '....o',
    '.....',
    'o...o',
  ])

  /** Every route on this board jams: whichever way the first step goes. */
  const trap = parseBoard(['S.o', '...', 'o..'])

  /** Two stones in a line from the start, so the last one ends the walk. */
  const pair = parseBoard(['S.o', '...', '..o'])

  it('never touches the rng, so every seed gives the same board', () => {
    let calls = 0
    for (let seed = 1; seed <= 40; seed++) {
      const inner = makeRng(seed)
      const rng = () => {
        calls += 1
        return inner()
      }
      for (const one of levels) {
        expect(keyOf(stonePath.engine.init(one, rng))).toBe(keyOf(init(one)))
      }
    }
    expect(calls).toBe(0)
    // Two starts never share the arrays a state is allowed to hold.
    expect(init(levels[0]).stones).not.toBe(init(levels[0]).stones)
    expect(init(levels[0]).trail).not.toBe(init(levels[0]).trail)
  })

  it('returns the identical state object for every walk the rules will not take', () => {
    // Nothing that way at all: the two lines off this board's start.
    expect(DIRS.filter((dir) => canWalk(lines, dir))).toEqual([1, 3])
    expect(reduce(lines, { type: 'walk', dir: 0 })).toBe(lines)
    expect(reduce(lines, { type: 'walk', dir: 2 })).toBe(lines)

    // The way back, with a stone standing on it.
    const east = reduce(lines, { type: 'walk', dir: 1 })
    expect(east).not.toBe(lines)
    expect(east.heading).toBe(1)
    expect(nextStone(east, east.at, 3)).toBe(0)
    expect(stepTarget(east, 3)).toBe(-1)
    expect(reduce(east, { type: 'walk', dir: 3 })).toBe(east)

    const rejected = [
      { type: 'walk', dir: 4 },
      { type: 'walk', dir: -1 },
      { type: 'walk', dir: 1.5 },
      { type: 'walk', dir: Number.NaN },
      { type: 'walk' },
      { type: 'never', dir: 1 },
      {},
    ]
    for (const action of rejected) {
      expect(reduce(lines, action as unknown as StoneAction), JSON.stringify(action)).toBe(lines)
    }
    expect(reduce(lines, undefined as unknown as StoneAction)).toBe(lines)

    // …and every walk the rules do take must NOT return the same object.
    for (const dir of DIRS) {
      if (!canWalk(lines, dir)) continue
      expect(reduce(lines, { type: 'walk', dir })).not.toBe(lines)
    }
  })

  it('goes to the first stone on the line and no further', () => {
    // Four empty squares crossed in one move, and the stone beyond the first
    // one left where it is.
    const east = reduce(lines, { type: 'walk', dir: 1 })
    expect(nextStone(east, 4, 2)).toBe(14)
    const down = reduce(east, { type: 'walk', dir: 2 })
    expect(down.at).toBe(14)
    expect(down.stones[24]).toBe(true)

    // A square whose stone has been picked up is an empty square: the walk
    // crosses the square it started from without stopping on it.
    const home = reduce(down, { type: 'walk', dir: 2 })
    expect(home.at).toBe(24)
    expect(reduce(home, { type: 'walk', dir: 3 }).at).toBe(20)
  })

  it('takes exactly one stone a move, and changes nothing else', () => {
    for (const level of levels) {
      for (const state of everyPosition(init(level))) {
        for (const action of walksOf(state)) {
          const next = reduce(state, action)
          if (next === state) continue
          expect(stonesLeft(next)).toBe(stonesLeft(state) - 1)
          expect(next.stones[next.at]).toBe(false)
          expect(state.stones[next.at]).toBe(true)
          expect(next.heading).toBe(action.dir)
          expect(next.trail).toEqual([...state.trail, next.at])
          expect(next.n).toBe(state.n)
          expect(next.stones).not.toBe(state.stones)
          // Only the square that was landed on ever changes.
          const moved = state.stones.filter((_, cell) => cell !== next.at)
          expect(next.stones.filter((_, cell) => cell !== next.at)).toEqual(moved)
        }
      }
    }
  })

  it('lets the first move go any way it likes, and never turns back after it', () => {
    for (const level of levels) {
      // There is no way in on the square the walk starts from, so nothing is
      // forbidden: every line with a stone on it is a move.
      const first = init(level)
      expect(first.heading).toBe(-1)
      expect(DIRS.filter((dir) => canWalk(first, dir))).toEqual(
        DIRS.filter((dir) => nextStone(first, first.at, dir) >= 0),
      )

      // And from the first move on, the way back is closed whatever is
      // standing on it.
      for (const state of everyPosition(first)) {
        if (state.heading === -1) {
          expect(state.at).toBe(first.at)
          continue
        }
        const behind = back(state.heading)
        expect(stepTarget(state, behind), keyOf(state)).toBe(-1)
        expect(reduce(state, { type: 'walk', dir: behind })).toBe(state)
      }
    }
  })

  it('meets a stone standing on the way back, so the rule is a rule about something', () => {
    // A rule nobody can break is a rule nobody learns. On the two levels with
    // a choice in them there is a moment on the way through where a stone is
    // lying straight behind the walk, and tapping it is answered.
    for (const level of levels.slice(1)) {
      const tempted = statesAlong(init(level), SOLUTIONS[level.id]).filter(
        (state) => state.heading !== -1 && nextStone(state, state.at, back(state.heading)) >= 0,
      )
      expect(tempted.length, level.id).toBeGreaterThan(0)
      for (const state of tempted) {
        const stone = nextStone(state, state.at, back(state.heading as Dir))
        expect(refusalOf(state, stone)?.message).toBe('You cannot go back the way you came.')
      }
    }
  })

  it('reports a dead end only where there is one', () => {
    // Whichever way this board's first step goes, the walk strands itself with
    // a stone still on the ground.
    expect(failure(trap)).toBeNull()
    for (const dir of DIRS) {
      const next = reduce(trap, { type: 'walk', dir })
      if (next === trap) continue
      expect(isSolved(next)).toBe(false)
      expect(stonesLeft(next)).toBe(1)
      expect(failure(next)).toBe(STUCK)
    }
    expect(solve(trap)).toBeNull()

    // The boundary the other way: a board with every stone taken has nowhere
    // to go either, and it is solved rather than stuck.
    const done = reduce(reduce(pair, { type: 'walk', dir: 1 }), { type: 'walk', dir: 2 })
    expect(isSolved(done)).toBe(true)
    expect(stonesLeft(done)).toBe(0)
    expect(DIRS.every((dir) => reduce(done, { type: 'walk', dir }) === done)).toBe(true)
    expect(failure(done)).toBeNull()

    // And no position on the way through a shipped level reports one while it
    // still has somewhere to go.
    for (const level of levels) {
      for (const state of everyPosition(init(level))) {
        const moves = walksOf(state).filter((action) => reduce(state, action) !== state)
        expect(failure(state) === null, keyOf(state)).toBe(moves.length > 0 || isSolved(state))
      }
    }
  })

  it('says which rule a tap broke, and says nothing about a tap that broke none', () => {
    const east = reduce(lines, { type: 'walk', dir: 1 })
    // Standing on the far corner of the top row, going right.
    expect(east.at).toBe(4)
    expect(refusalOf(east, 0)?.message).toBe('You cannot go back the way you came.')
    expect(refusalOf(east, 24)?.message).toBe('There is another stone in the way.')
    expect(refusalOf(east, 20)?.message).toBe('You can only go straight up, down, left or right.')
    // The one stone the rules will take says nothing at all.
    expect(refusalOf(east, 14)).toBeNull()
    // Neither does a square with no stone on it: an empty square is not a
    // control, so there is nothing there to refuse.
    expect(refusalOf(east, 12)).toBeNull()
    expect(refusalOf(east, -1)).toBeNull()
    expect(refusalOf(east, 99)).toBeNull()
    // Nothing pretends to move: the tap names a stone rather than a place to
    // stand, so there is no position to draw and take back.
    expect(refusalOf(east, 0)?.pretend).toBe(east)
    expect(refusalOf(east, 0)?.where).toBe('0')
  })

  it('refuses exactly the taps the rules refuse, everywhere on every board', () => {
    for (const level of levels) {
      for (const state of everyPosition(init(level))) {
        for (let cell = 0; cell < state.n * state.n; cell++) {
          const no = refusalOf(state, cell)
          if (!state.stones[cell]) {
            expect(no, `${keyOf(state)} ${cell}`).toBeNull()
            continue
          }
          const dir = lineTo(state, cell)
          const legal = dir !== -1 && stepTarget(state, dir) === cell
          expect(no === null, `${keyOf(state)} ${cell}`).toBe(legal)
        }
      }
    }
  })

  it('reads a line the same way whichever end it is asked from', () => {
    expect(lineTo(lines, 0)).toBe(3)
    expect(lineTo(lines, 4)).toBe(1)
    expect(lineTo(lines, 22)).toBe(2)
    // Neither the row nor the column, and the square underfoot.
    expect(lineTo(lines, 20)).toBe(-1)
    expect(lineTo(lines, lines.at)).toBe(-1)
    expect(lineTo(lines, -1)).toBe(-1)
    expect(lineTo(lines, 25)).toBe(-1)
    expect(DIR_WORDS[back(0)]).toBe('down')
    expect(DIRS.map((dir) => back(back(dir)))).toEqual(DIRS)
  })

  it('describes a move in the same words the board uses', () => {
    const say = (state: StoneState, dir: Dir) =>
      describeMove(state, reduce(state, { type: 'walk', dir }), { type: 'walk', dir })
    expect(say(lines, 1)).toBe('Went right to the stone on row 1, column 5')
    expect(say(lines, 3)).toBe('Went left to the stone on row 1, column 1')
    const east = reduce(lines, { type: 'walk', dir: 1 })
    expect(say(east, 2)).toBe('Went down to the stone on row 3, column 5')

    // A walk the rules will not take never reaches the tape, and says so anyway.
    expect(describeMove(east, east, { type: 'walk', dir: 3 })).toBe('Nothing moved')
    expect(describeMove(lines, lines, { type: 'never' } as unknown as StoneAction)).toBe(
      'Nothing moved',
    )
    expect(spotOf(5, 0)).toBe('row 1, column 1')
    expect(spotOf(5, 24)).toBe('row 5, column 5')
  })

  it('counts two positions the same when the same moves are left in them', () => {
    // The route drawn on the board is a record of how the walk got here and
    // changes nothing about what it can do next, so it is not part of the key.
    // That is what keeps the search small enough to run in a test.
    const east = reduce(lines, { type: 'walk', dir: 1 })
    const wandered: StoneState = { ...east, trail: [...east.trail, 99, 98] }
    expect(keyOf(wandered)).toBe(keyOf(east))
    expect(keyOf(east)).not.toBe(keyOf(lines))
    // …and the heading is in it, because it is what the next move is measured
    // against.
    expect(keyOf({ ...east, heading: 2 })).not.toBe(keyOf(east))
  })

  it('refuses to read a board it cannot make sense of', () => {
    const broken: [string, string[]][] = [
      ['a board of two squares', ['So', 'oo']],
      ['a picture that is not square', ['S.oo', 'o..o', 'o.o.']],
      ['a line of the wrong length', ['S.o.', 'o..o', 'o.o.', 'o.o']],
      ['no stone to start on', ['..o.', '.o.o', 'o..o', 'o.o.']],
      ['two stones to start on', ['..S.', '.S.o', 'o..o', 'o.o.']],
      ['a character that is neither', ['..S.', '.x.o', 'o..o', 'o.o.']],
      ['a space where a square should be', ['..S.', '. .o', 'o..o', 'o.o.']],
      ['one stone to pick up', ['S..', '...', '..o']],
    ]
    for (const [why, picture] of broken) {
      expect(() => parseBoard(picture), why).toThrow()
    }
    // …and the smallest well-formed board reads fine.
    const smallest = parseBoard(['S.o', '...', '..o'])
    expect(smallest.n).toBe(3)
    expect(smallest.at).toBe(0)
    expect(stonesLeft(smallest)).toBe(2)
  })

  const rowOfCell = (n: number, cell: number) => Math.floor(cell / n)

  it('never lets the route run under a stone', () => {
    // Every square a leg of the route crosses was empty when the walk crossed
    // it, and no stone is ever put back — so the line the board draws is never
    // hidden under anything, on any position of any level.
    for (const level of levels) {
      for (const state of everyPosition(init(level))) {
        for (let i = 1; i < state.trail.length; i++) {
          const from = state.trail[i - 1]
          const to = state.trail[i]
          const step = to > from ? 1 : -1
          const along = rowOfCell(state.n, from) === rowOfCell(state.n, to) ? step : step * state.n
          for (let cell = from; cell !== to; cell += along) {
            expect(state.stones[cell], `${keyOf(state)} at ${cell}`).toBe(false)
          }
        }
      }
    }
  })

  it('keeps the search honest by offering all four ways from every position', () => {
    expect(walksOf(lines)).toEqual(DIRS.map((dir) => ({ type: 'walk', dir })))
    expect(walksOf(lines)).toHaveLength(4)
  })
})

/* ============================================================
   The board. Stones to tap, a route drawn over them, and an
   arrow on the square the walk has reached.
   ============================================================ */

describe('the stone path — board', () => {
  afterEach(cleanup)

  const draw = (state: StoneState, locked = false, settings?: { allowForbiddenMoves: boolean }) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }), {
      wrapper: underSettings(settings),
    })
    return { dispatch, view }
  }

  const start = init(levels[1])
  const note = () => document.querySelector('p[class*="note"]')?.textContent
  const status = () => screen.getByRole('status').textContent
  const stone = (cell: number) =>
    screen.getByRole('button', { name: new RegExp(`^Stone on ${spotOf(5, cell)}\\.`) })

  /** The rules board, one step in: a stone behind, one shadowed, one off the lines. */
  const east = reduce(
    parseBoard(['o.S.o', '.....', '....o', '.....', 'o...o']),
    { type: 'walk', dir: 1 },
  )

  it('draws a pressable stone for every stone left, and nothing else to touch', () => {
    const { view } = draw(start)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(stonesLeft(start))
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
      expect(button.getAttribute('aria-label')).toMatch(/^Stone on row \d, column \d\. Walk to it\.$/)
    }
    // The lattice is drawn but never touched, and so is the route.
    expect(view.container.querySelectorAll('[class*="cell"]')).toHaveLength(25)
  })

  it('takes one tap and sends one walk', () => {
    const { dispatch } = draw(start)
    fireEvent.click(stone(12))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'walk', dir: 2 })
  })

  it('loses a stone from the board with every move', () => {
    const { view } = draw(reduce(start, { type: 'walk', dir: 2 }))
    expect(screen.getAllByRole('button')).toHaveLength(stonesLeft(start) - 1)
    expect(view.container.textContent).toContain('6 stones still to pick up.')
  })

  it('offers the walk back and answers it, rather than going quiet', () => {
    const { dispatch } = draw(east)
    const behind = screen.getByRole('button', { name: /^Stone on row 1, column 1\./ })
    expect(behind).toBeEnabled()
    fireEvent.click(behind)
    expect(dispatch).not.toHaveBeenCalled()
    expect(note()).toContain('You cannot go back the way you came.')
    expect(status()).toContain('You cannot go back the way you came.')
    // Clay round the stone that would not be taken, and the stone itself
    // refusing to move.
    expect(behind.className).toMatch(/flash/)
    expect(behind.querySelector('[class*="shake"]')).not.toBeNull()
  })

  it('answers the other two taps a rule forbids', () => {
    const { dispatch } = draw(east)
    fireEvent.click(screen.getByRole('button', { name: /^Stone on row 5, column 5\./ }))
    expect(note()).toContain('There is another stone in the way.')
    fireEvent.click(screen.getByRole('button', { name: /^Stone on row 5, column 1\./ }))
    expect(note()).toContain('You can only go straight up, down, left or right.')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('says the same thing about every stone while a forbidden walk is offered', () => {
    draw(east)
    const labels = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
    expect(labels.length).toBeGreaterThan(1)
    for (const label of labels) {
      expect(label, label).toMatch(/Walk to it\.$/)
      expect(label, label).not.toMatch(/\b(cannot|blocked|in the way|only)\b/i)
    }
  })

  it('goes back to a dead control where the settings ask for one', () => {
    const { dispatch } = draw(east, false, { allowForbiddenMoves: false })
    const behind = screen.getByRole('button', { name: /You cannot go back the way you came\./ })
    expect(behind).toBeDisabled()
    fireEvent.click(behind)
    expect(dispatch).not.toHaveBeenCalled()
    // The one stone the rules will take is still live, and still says only
    // what a tap on it does.
    expect(screen.getByRole('button', { name: /^Stone on row 3, column 5\. Walk to it\.$/ })).toBeEnabled()
  })

  it('makes the arrow keys the four ways', () => {
    const { dispatch } = draw(start)
    const first = stone(12)
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'walk', dir: 2 })
    // A line with nothing on it is nothing happening: no move, and no sentence.
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(note()).toBe('7 stones still to pick up.')
    fireEvent.keyDown(first, { key: 'Home' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('answers the arrow key that asks for the way back', () => {
    const { dispatch } = draw(east)
    const button = screen.getAllByRole('button')[0]
    button.focus()
    fireEvent.keyDown(button, { key: 'ArrowLeft' })
    expect(dispatch).not.toHaveBeenCalled()
    expect(note()).toContain('You cannot go back the way you came.')
  })

  it('takes the arrows from the stage as well, where the shell parks focus', () => {
    const { dispatch, view } = draw(start)
    const stage = view.container
    stage.tabIndex = -1
    stage.focus()
    fireEvent.keyDown(stage, { key: 'ArrowDown' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'walk', dir: 2 })
  })

  it('leaves the arrows alone everywhere else on the page', () => {
    const { dispatch } = draw(start)
    document.body.focus()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('wears no arrow before the first move, and one after it', () => {
    const { view } = draw(start)
    expect(view.container.querySelector('[class*="way"]')).toBeNull()
    expect(status()).toContain('You are on row 1, column 3.')
    cleanup()

    const moved = draw(reduce(start, { type: 'walk', dir: 2 }))
    const mark = moved.view.container.querySelector('[class*="way"]') as HTMLElement
    expect(mark).not.toBeNull()
    expect(mark.getAttribute('style')).toContain('180deg')
    expect(status()).toContain('You are on row 3, column 3, going down.')
  })

  it('draws the route it has walked, one point a square', () => {
    const walked = replay(start, SOLUTIONS['eight-stones'].slice(0, 3))
    const { view } = draw(walked[walked.length - 1])
    const line = view.container.querySelector('polyline') as SVGPolylineElement
    expect(line).not.toBeNull()
    expect((line.getAttribute('points') ?? '').split(' ')).toHaveLength(4)
    // Nothing to draw before the walk has been anywhere.
    cleanup()
    draw(start)
    expect(document.querySelector('polyline')).toBeNull()
  })

  it('turns the square the walk is standing on moss when the last stone is up', () => {
    const done = replay(start, SOLUTIONS['eight-stones'])
    const { view } = draw(done[done.length - 1], true)
    expect(view.container.querySelector('[data-done="true"]')).not.toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(note()).toBe('')
  })

  it('ignores every input while locked', () => {
    const { dispatch } = draw(east, true)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    fireEvent.keyDown(screen.getAllByRole('button')[0], { key: 'ArrowDown' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('says how far there is still to go, and where the walk is standing', () => {
    draw(start)
    expect(note()).toBe('7 stones still to pick up.')
    cleanup()
    const nearly = replay(start, SOLUTIONS['eight-stones'].slice(0, 6))
    draw(nearly[nearly.length - 1])
    expect(note()).toBe('1 stone still to pick up.')
    expect(status()).toContain('You are on row 3, column 1, going left.')
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = reduce(start, { type: 'walk', dir: 2 })
    const a = draw(state)
    const first = a.view.container.innerHTML
    cleanup()
    const b = draw(state)
    expect(b.view.container.innerHTML).toBe(first)
  })

  it('renders the rule and the stones — the shell owns everything else', () => {
    const { view } = draw(start)
    expect(view.container.querySelectorAll('h1, h2, h3, h4')).toHaveLength(0)
    expect(view.container.textContent).toContain('You can never go back the way you came.')
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(stonePath.title)
    expect(text).not.toContain(stonePath.tagline)
    for (const line of stonePath.instructions) expect(text).not.toContain(line)
    for (const hint of levels[1].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})
