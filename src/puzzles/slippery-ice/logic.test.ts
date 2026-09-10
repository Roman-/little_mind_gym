import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeRng } from '../../lib/rng'
import { reachableCount, shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { slipperyIce } from './index'
import type { Dir, IceAction, IceConfig, IceState } from './logic'
import {
  ANIMALS,
  DIRS,
  DIR_WORDS,
  canSend,
  describeMove,
  init,
  isSolved,
  keyOf,
  nameFor,
  onBoard,
  parsePond,
  reduce,
  sendsOf,
  slideOf,
  stepCell,
  walled,
} from './logic'

const levels = slipperyIce.levels as PuzzleLevel<IceConfig>[]

/**
 * The sends each level ships, written the way the board says them and replayed
 * one at a time below. They are never used to derive `par` — the search does
 * that on its own, over every send from every position — but a level whose
 * shipped plan came apart would be a level nobody had played.
 */
const SOLUTIONS: Record<string, string[]> = {
  'two-on-the-ice': ['mouse right', 'mouse up', 'mouse left'],
  'three-on-the-ice': ['mouse up', 'mouse left', 'frog up', 'mouse right'],
  'the-big-pond': ['mouse up', 'mouse left', 'rabbit left', 'rabbit up', 'mouse up'],
}

/** "rabbit down" → the action a tap on the rabbit and then on the down arrow makes. */
function asAction(state: IceState, plan: string): IceAction {
  const [who, way] = plan.split(' ')
  const animal = state.cast.findIndex((one) => one.id === who)
  expect(animal, `${who} is not on this pond`).toBeGreaterThanOrEqual(0)
  const dir = DIR_WORDS.indexOf(way as (typeof DIR_WORDS)[number])
  expect(dir, `${way} is not a direction`).toBeGreaterThanOrEqual(0)
  return { type: 'send', animal, dir: dir as Dir }
}

/**
 * The shortest run of sends that gets the mouse onto the ring, searched over
 * every animal and every direction rather than over a list of legal ones, so a
 * bug shared between a move list and the rule cannot make the search agree
 * with itself.
 *
 * `only` cuts the move set down to one animal. Handing it the mouse is how the
 * blocker levels are proved: with the other animals nailed to the ice, the
 * board has no answer at all.
 */
const solve = (state: IceState, only?: number) =>
  shortestSolution<IceState, IceAction>({
    start: state,
    moves: (s) => sendsOf(s).filter((a) => only === undefined || a.animal === only),
    apply: reduce,
    key: keyOf,
    solved: isSolved,
  })

/** Every position reachable from the start, with the positions each one leads to. */
function graphOf(start: IceState) {
  const states = new Map<string, IceState>([[keyOf(start), start]])
  const edges = new Map<string, string[]>()
  const stack: IceState[] = [start]
  while (stack.length > 0) {
    const state = stack.pop() as IceState
    const outs: string[] = []
    for (const action of sendsOf(state)) {
      const next = reduce(state, action)
      if (next === state) continue
      const k = keyOf(next)
      outs.push(k)
      if (states.has(k)) continue
      states.set(k, next)
      // A solved board is locked, so nothing is ever played on from one.
      if (!isSolved(next)) stack.push(next)
    }
    edges.set(keyOf(state), outs)
  }
  return { states, edges }
}

/**
 * Every position from which the ring can still be reached, worked backwards
 * from the solved ones. This is what stands in for a `failure`: if it comes
 * back holding every position a child can reach, then no send anywhere on the
 * board can strand anybody, and there is no dead end for the engine to report.
 */
function canStillGetHome(start: IceState): { good: number; all: number } {
  const { states, edges } = graphOf(start)
  const back = new Map<string, string[]>()
  for (const [from, outs] of edges) {
    for (const to of outs) back.set(to, [...(back.get(to) ?? []), from])
  }
  const good = new Set<string>()
  const queue: string[] = []
  for (const [k, state] of states) {
    if (!isSolved(state)) continue
    good.add(k)
    queue.push(k)
  }
  for (let i = 0; i < queue.length; i++) {
    for (const from of back.get(queue[i]) ?? []) {
      if (good.has(from)) continue
      good.add(from)
      queue.push(from)
    }
  }
  return { good: good.size, all: states.size }
}

/** Walk a written plan, one send at a time, checking each one really moved somebody. */
function replay(start: IceState, plan: string[]): IceState[] {
  const seen: IceState[] = [start]
  let current = start
  for (const step of plan) {
    const next = reduce(current, asAction(current, step))
    expect(next, `"${step}" moved nobody`).not.toBe(current)
    seen.push(next)
    current = next
  }
  return seen
}

describe('the slippery ice — the three ponds', () => {
  for (const level of levels) {
    const picture = level.config.picture

    it(`"${level.label}" is a pond that can be read off its own picture`, () => {
      const state = parsePond(picture)
      const { n } = state
      expect(picture).toHaveLength(2 * n + 1)
      expect([5, 6]).toContain(n)

      for (const line of picture) {
        expect(line).toHaveLength(2 * n + 1)
        expect(line).toBe(line.trim())
      }

      // Exactly one ring, and the rim solid all the way round.
      expect([...picture.join('')].filter((ch) => ch === 'o')).toHaveLength(1)
      expect(picture[0]).toBe('+-'.repeat(n) + '+')
      expect(picture[2 * n]).toBe(picture[0])
      for (let r = 1; r < 2 * n; r += 2) {
        expect(picture[r].charAt(0)).toBe('|')
        expect(picture[r].charAt(2 * n)).toBe('|')
      }

      // The mask is symmetric, and no wall points off the ice.
      for (let cell = 0; cell < n * n; cell++) {
        for (const dir of DIRS) {
          if (!walled(state, cell, dir)) continue
          expect(onBoard(n, cell, dir), `${cell} has a wall off the ice`).toBe(true)
          const other = stepCell(n, cell, dir)
          expect(walled(state, other, ((dir + 2) % 4) as Dir)).toBe(true)
        }
      }

      // Everybody stands on a square of their own, and the level is not over
      // before it starts.
      expect(new Set(state.at).size).toBe(state.at.length)
      expect(state.cast[state.hero].id).toBe('mouse')
      expect(isSolved(state)).toBe(false)
    })

    it(`"${level.label}" is solvable in exactly par (${level.par}) sends`, () => {
      const path = solve(init(level))
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
      const walked = (path as IceAction[]).reduce((state, action) => {
        const next = reduce(state, action)
        expect(next).not.toBe(state)
        return next
      }, init(level))
      expect(isSolved(walked)).toBe(true)
    })

    it(`"${level.label}" plays out exactly as the sends it ships`, () => {
      const plan = SOLUTIONS[level.id]
      expect(plan).toHaveLength(level.par as number)
      const seen = replay(init(level), plan)
      expect(isSolved(seen[seen.length - 1])).toBe(true)
      // Every position but the last is a real, unfinished one.
      for (const state of seen.slice(0, -1)) expect(isSolved(state)).toBe(false)
    })

    it(`"${level.label}" keeps its whole graph far inside the search cap`, () => {
      const reached = reachableCount<IceState, IceAction>({
        start: init(level),
        moves: sendsOf,
        apply: reduce,
        key: keyOf,
      })
      expect(reached).toBeGreaterThan(20)
      expect(reached).toBeLessThan(6000)
    })

    it(`"${level.label}" can never be played into a corner it cannot get out of`, () => {
      // Why this puzzle ships no `failure`. Every position a child can reach
      // still has a way to the ring, so there is no dead end to step back from
      // — only a longer way round, which the move tape already offers a way
      // out of.
      const { good, all } = canStillGetHome(init(level))
      expect(good).toBe(all)
    })
  }

  it('needs another animal sent as a blocker, and says which levels', () => {
    const needs = levels.filter((level) => {
      const start = init(level)
      const alone = solve(start, start.hero)
      return alone === null || alone.length > (level.par as number)
    })
    expect(needs.map((level) => level.id)).toEqual(['three-on-the-ice', 'the-big-pond'])
  })

  for (const level of levels.slice(1)) {
    it(`"${level.label}" cannot be solved in par by sending the mouse alone`, () => {
      // The move set with every blocker send taken out of it. The mouse can
      // still be sent anywhere it likes, as often as it likes, and the ring
      // stays out of reach: the only way to stop it where it has to stop is to
      // send somebody else there first.
      const start = init(level)
      const alone = solve(start, start.hero)
      expect(alone === null || alone.length > (level.par as number)).toBe(true)
      // …and the plan the level ships really does send somebody else.
      const others = SOLUTIONS[level.id].filter((step) => !step.startsWith('mouse'))
      expect(others.length).toBeGreaterThan(0)
    })
  }

  it('lets the mouse do the first level on its own, so the idea arrives second', () => {
    const start = init(levels[0])
    expect(solve(start, start.hero)?.length).toBe(levels[0].par)
    // And it is still a level about being stopped: the mouse comes to rest
    // against the rabbit somewhere along the way.
    const seen = replay(start, SOLUTIONS[levels[0].id])
    const stopped = SOLUTIONS[levels[0].id].map((step, i) => {
      const action = asAction(seen[i], step)
      return slideOf(seen[i], action.animal, action.dir).stop
    })
    expect(stopped).toContain('animal')
  })

  it('ramps 1 → 2 → 3 with three hints and a stable id each', () => {
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['two-on-the-ice', 'three-on-the-ice', 'the-big-pond'])
    expect(levels.map((l) => l.label)).toEqual(['Two on the ice', 'Three on the ice', 'The big pond'])
    expect(levels.map((l) => l.par)).toEqual([3, 4, 5])
    // The big pond is bigger and longer, and hands a child one helper rather
    // than two: fewer animals is not less to think about here.
    expect(levels.map((l) => init(l).cast.length)).toEqual([2, 3, 2])
    expect(levels.map((l) => init(l).n)).toEqual([5, 5, 6])
    for (const level of levels) expect(level.hints).toHaveLength(3)
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    const lines = [...slipperyIce.instructions, ...levels.flatMap((l) => l.hints)]
    expect(slipperyIce.instructions.length).toBeGreaterThanOrEqual(2)
    expect(slipperyIce.instructions.length).toBeLessThanOrEqual(4)
    expect(slipperyIce.instructions[0]).toMatch(/ring/)
    for (const line of lines) {
      expect(line, line).toMatch(/^[A-Z]/)
      expect(line, line).toMatch(/\.$/)
      expect(line.length, line).toBeLessThanOrEqual(140)
      expect(line, line).not.toMatch(/[!]/)
      expect(line, line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}]/u)
    }
  })

  it('nudges in the hints instead of handing over the sends', () => {
    for (const level of levels) {
      const opening = SOLUTIONS[level.id].slice(0, 2).join(' ')
      for (const hint of level.hints) {
        // Never an instruction to make a particular send…
        expect(hint, hint).not.toMatch(/\bsend\b[^.]*\b(up|right|down|left)\b/i)
        // …and never any run of the answer read out.
        expect(hint.toLowerCase(), hint).not.toContain(opening)
        expect(hint, hint).not.toMatch(/(up|right|down|left),\s*(up|right|down|left)/i)
      }
    }
  })

  it('describes itself for the index row without hype', () => {
    expect(slipperyIce.id).toBe('slippery-ice')
    expect(slipperyIce.title).toBe('The slippery ice')
    expect(slipperyIce.tagline).toMatch(/\.$/)
    expect(slipperyIce.reseedable).toBe(false)
  })
})

describe('the slippery ice — rules', () => {
  const level = levels[0]
  const start = init(level)

  /**
   * A pond built for the rules rather than for a child: the mouse in the
   * top-left corner, the rabbit in the top-right, and one wall across the top
   * row between them. Between them those three hold every way a send can end.
   */
  const walls = parsePond([
    '+-+-+-+-+-+',
    '|M . .|. R|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . o . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+-+-+-+',
  ])

  it('never touches the rng, so every seed gives the same pond', () => {
    let calls = 0
    for (let seed = 1; seed <= 40; seed++) {
      const inner = makeRng(seed)
      const rng = () => {
        calls += 1
        return inner()
      }
      for (const one of levels) {
        expect(keyOf(slipperyIce.engine.init(one, rng))).toBe(keyOf(init(one)))
      }
    }
    expect(calls).toBe(0)
    // Two starts never share the arrays a state is allowed to hold.
    expect(init(level).walls).not.toBe(init(level).walls)
    expect(init(level).at).not.toBe(init(level).at)
  })

  it('returns the identical state object for every send that moves nobody', () => {
    // In the corner of a pond, two of the four sends move nobody at all.
    const dead = DIRS.filter((dir) => !canSend(walls, 0, dir))
    expect(dead).toEqual([0, 3])
    for (const dir of dead) {
      expect(reduce(walls, { type: 'send', animal: 0, dir })).toBe(walls)
    }

    const rejected = [
      { type: 'send', animal: 0, dir: 4 },
      { type: 'send', animal: 0, dir: -1 },
      { type: 'send', animal: 0, dir: 1.5 },
      { type: 'send', animal: 0, dir: Number.NaN },
      { type: 'send', animal: -1, dir: 0 },
      { type: 'send', animal: 9, dir: 0 },
      { type: 'send', animal: 0.5, dir: 0 },
      { type: 'send', animal: 0 },
      { type: 'send' },
      { type: 'never' },
      {},
    ]
    for (const action of rejected) {
      expect(reduce(start, action as unknown as IceAction), JSON.stringify(action)).toBe(start)
    }
    expect(reduce(start, undefined as unknown as IceAction)).toBe(start)

    // …and every send that does move somebody must NOT return the same object.
    for (const dir of DIRS) {
      if (!canSend(start, start.hero, dir)) continue
      expect(reduce(start, { type: 'send', animal: start.hero, dir })).not.toBe(start)
    }
  })

  it('slides an animal to the edge of the ice and no further', () => {
    // A pond with nothing on it but the two animals, far apart.
    const clear = parsePond([
      '+-+-+-+-+-+',
      '|M . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . o . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . R|',
      '+-+-+-+-+-+',
    ])
    expect(slideOf(clear, 0, 1)).toEqual({ to: 4, stop: 'edge', blocker: -1 })
    expect(slideOf(clear, 0, 2)).toEqual({ to: 20, stop: 'edge', blocker: -1 })
    // Already against the rim: nothing moves, and nothing is recorded.
    expect(slideOf(clear, 0, 0)).toEqual({ to: 0, stop: 'edge', blocker: -1 })
    expect(reduce(clear, { type: 'send', animal: 0, dir: 0 })).toBe(clear)
    expect(reduce(clear, { type: 'send', animal: 0, dir: 3 })).toBe(clear)
  })

  it('stops an animal at a wall, on the near side of it', () => {
    const fenced = parsePond([
      '+-+-+-+-+-+',
      '|M . .|. .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . o . .|',
      '+-+ + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|R . . . .|',
      '+-+-+-+-+-+',
    ])
    // Right: the wall stands between columns 3 and 4, so it stops in column 3.
    expect(slideOf(fenced, 0, 1)).toEqual({ to: 2, stop: 'wall', blocker: -1 })
    // Down: the wall under row 3, column 1 stops it two rows short of the rim.
    expect(slideOf(fenced, 0, 2)).toEqual({ to: 10, stop: 'wall', blocker: -1 })
    const moved = reduce(fenced, { type: 'send', animal: 0, dir: 2 })
    expect(moved.at[0]).toBe(10)
    // And from there it will not go on: the wall is the wall from either side.
    expect(reduce(moved, { type: 'send', animal: 0, dir: 2 })).toBe(moved)
  })

  it('stops an animal against another animal, and never on top of one', () => {
    const pair = parsePond([
      '+-+-+-+-+-+',
      '|M . . R .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . o . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+-+-+-+-+-+',
    ])
    expect(slideOf(pair, 0, 1)).toEqual({ to: 2, stop: 'animal', blocker: 1 })
    const met = reduce(pair, { type: 'send', animal: 0, dir: 1 })
    expect(met.at).toEqual([2, 3])

    // Two animals already standing next to each other: sending one into the
    // other moves nobody, so the same object comes back and no move is
    // recorded. This is the "changes nothing" of the contract, not a rule
    // broken — which is why the arrow that asks for it goes dead rather than
    // being refused.
    expect(slideOf(met, 0, 1)).toEqual({ to: 2, stop: 'animal', blocker: 1 })
    expect(reduce(met, { type: 'send', animal: 0, dir: 1 })).toBe(met)
    expect(canSend(met, 0, 1)).toBe(false)
    // The one behind is free to go the other way, and to be gone from.
    expect(reduce(met, { type: 'send', animal: 1, dir: 1 })).not.toBe(met)
  })

  it('counts the ring only where the mouse comes to rest on it', () => {
    // The mouse slides straight over the ring and out to the rim: passing over
    // the spot is not stopping on it.
    const past = parsePond([
      '+-+-+-+-+-+',
      '|M . o . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . R|',
      '+-+-+-+-+-+',
    ])
    const gone = reduce(past, { type: 'send', animal: 0, dir: 1 })
    expect(gone.at[0]).toBe(4)
    expect(isSolved(gone)).toBe(false)

    // And the rabbit stopping on the ring is not the mouse stopping on it.
    const rabbitHome = reduce(past, { type: 'send', animal: 1, dir: 0 })
    expect(rabbitHome.at[1]).toBe(4)
    expect(isSolved(rabbitHome)).toBe(false)
  })

  it('reports no dead end at all, because there is none to report', () => {
    expect(slipperyIce.engine.failure).toBeUndefined()
  })

  /**
   * The whole graph of every level, walked twice and written out to a string on
   * both passes: the most expensive test in this file by a distance, and on a
   * loaded machine it has come within a few hundred milliseconds of vitest's
   * 5000ms default and failed while doing nothing wrong. The budget is sized
   * for the busy machine rather than the quiet one.
   */
  it('changes somebody on every state it hands back, and nobody on the rest', () => {
    for (const one of levels) {
      const { states } = graphOf(init(one))
      const before = [...states.values()].map((state) => JSON.stringify(state))
      for (const state of states.values()) {
        for (const action of sendsOf(state)) {
          const next = reduce(state, action)
          if (next === state) continue
          expect(next.at[action.animal]).not.toBe(state.at[action.animal])
          expect(next.at.filter((_, i) => i !== action.animal)).toEqual(
            state.at.filter((_, i) => i !== action.animal),
          )
          // The pond is one array, allocated by init and shared through every
          // spread: only where everybody stands ever changes.
          expect(next.walls).toBe(state.walls)
          expect(next.cast).toBe(state.cast)
          expect(next.home).toBe(state.home)
          expect(next.n).toBe(state.n)
        }
      }
      expect([...states.values()].map((state) => JSON.stringify(state))).toEqual(before)
    }
  }, 20_000)

  it('never lets two animals stand on one square', () => {
    for (const one of levels) {
      const { states } = graphOf(init(one))
      for (const state of states.values()) {
        expect(new Set(state.at).size, keyOf(state)).toBe(state.at.length)
      }
    }
  })

  it('describes a send in the same words the board uses', () => {
    const say = (pond: IceState, animal: number, dir: Dir) =>
      describeMove(pond, reduce(pond, { type: 'send', animal, dir }), { type: 'send', animal, dir })

    // The three things that can stop an animal, each said its own way.
    expect(say(walls, 0, 1)).toBe('Sent the mouse right to the wall')
    expect(say(walls, 0, 2)).toBe('Sent the mouse down to the edge')
    expect(say(walls, 1, 3)).toBe('Sent the rabbit left to the wall')
    expect(say(walls, 1, 2)).toBe('Sent the rabbit down to the edge')

    const apart = reduce(reduce(walls, { type: 'send', animal: 1, dir: 2 }), {
      type: 'send',
      animal: 0,
      dir: 2,
    })
    expect(say(apart, 0, 1)).toBe('Sent the mouse right against the rabbit')

    // A send that moves nobody never reaches the tape, and says so anyway.
    expect(describeMove(walls, walls, { type: 'send', animal: 0, dir: 3 })).toBe('Nothing moved')
    expect(describeMove(walls, walls, { type: 'never' } as unknown as IceAction)).toBe(
      'Nothing moved',
    )
  })

  it('names every animal it can draw, and refers to it the same way twice', () => {
    expect(ANIMALS.map((one) => one.id)).toEqual(['mouse', 'rabbit', 'frog'])
    expect(ANIMALS.map((one) => one.mark)).toEqual(['M', 'R', 'F'])
    expect(new Set(ANIMALS.map((one) => one.mark)).size).toBe(ANIMALS.length)
    expect(nameFor(ANIMALS[0])).toBe('the mouse')
    for (const one of ANIMALS) expect(one.label).toBe(one.label.trim())
  })

  it('refuses to read a pond it cannot make sense of', () => {
    const broken: [string, string[]][] = [
      ['an even number of lines', ['+-+-+', '|M o|']],
      ['a pond of four squares', ['+-+-+', '|M .|', '+ + +', '|. o|', '+-+-+']],
      ['a short line', ['+-+-+-+', '|M . o|', '+ + + +', '|. . .', '+ + + +', '|. . R|', '+-+-+-+']],
      ['a gap in the rim', ['+-+-+-+', '|M . o|', '+ + + +', 'o. . .|', '+ + + +', '|. . R|', '+-+-+-+']],
      ['no ring', ['+-+-+-+', '|M . .|', '+ + + +', '|. . .|', '+ + + +', '|. . R|', '+-+-+-+']],
      ['two rings', ['+-+-+-+', '|M o o|', '+ + + +', '|. . .|', '+ + + +', '|. . R|', '+-+-+-+']],
      ['no mouse', ['+-+-+-+', '|. . o|', '+ + + +', '|. . .|', '+ + + +', '|. F R|', '+-+-+-+']],
      ['one animal', ['+-+-+-+', '|M . o|', '+ + + +', '|. . .|', '+ + + +', '|. . .|', '+-+-+-+']],
      ['two mice', ['+-+-+-+', '|M . o|', '+ + + +', '|. . .|', '+ + + +', '|. . M|', '+-+-+-+']],
      ['a corner that is not a corner', ['+-+-+-+', '|M . o|', '- + + +', '|. . .|', '+ + + +', '|. . R|', '+-+-+-+']],
      ['a square that is not a square', ['+-+-+-+', '|M x o|', '+ + + +', '|. . .|', '+ + + +', '|. . R|', '+-+-+-+']],
      ['a seam that is neither wall nor space', ['+-+-+-+', '|M . o|', '+ x + +', '|. . .|', '+ + + +', '|. . R|', '+-+-+-+']],
      ['a line with a space at the end', ['+-+-+-+', '|M . o|', '+ + + +', '|. . . ', '+ + + +', '|. . R|', '+-+-+-+']],
    ]
    for (const [why, picture] of broken) {
      expect(() => parsePond(picture), why).toThrow()
    }
    // …and the smallest well-formed pond reads fine.
    const smallest = parsePond(['+-+-+-+', '|M . o|', '+ + + +', '|. . .|', '+ + + +', '|. . R|', '+-+-+-+'])
    expect(smallest.n).toBe(3)
    expect(smallest.at).toEqual([0, 8])
    expect(smallest.home).toBe(2)
  })
})

/* ============================================================
   The board. Two or three animals on the ice, four arrows
   under it, and one send for every two taps.
   ============================================================ */

describe('the slippery ice — board', () => {
  afterEach(cleanup)

  const show = (state: IceState, locked = false) => {
    const dispatch = vi.fn()
    const view = render(createElement(slipperyIce.engine.Board, { state, dispatch, locked }))
    return { dispatch, view }
  }

  const start = init(levels[0])
  const status = (view: { container: HTMLElement }) =>
    view.container.querySelector('[role="status"]')?.textContent

  /** The mouse in a corner, where two of the four arrows have nothing to do. */
  const cornered = parsePond([
    '+-+-+-+-+-+',
    '|M . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . o . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . R|',
    '+-+-+-+-+-+',
  ])

  it('stands every animal on the ice as a control, and offers four sends', () => {
    show(start)
    expect(screen.getByRole('button', { name: /^Mouse, row/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Rabbit, row/ })).toBeEnabled()
    for (const word of DIR_WORDS) {
      expect(screen.getByRole('button', { name: new RegExp(`^Send ${word}\\.`) })).toBeEnabled()
    }
    expect(screen.getAllByRole('button')).toHaveLength(start.cast.length + 4)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button.className).toContain('u-press')
    }
  })

  it('sends nobody until an animal has been chosen', () => {
    const { dispatch } = show(start)
    const up = screen.getByRole('button', { name: /^Send up\./ })
    expect(up).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(up)
    // …and the arrow keys are the page's until there is something to send.
    up.focus()
    const arrow = fireEvent.keyDown(up, { key: 'ArrowUp', cancelable: true })
    expect(arrow).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('takes two taps and sends one action', () => {
    const { dispatch } = show(start)
    fireEvent.click(screen.getByRole('button', { name: /^Mouse, row/ }))
    // Choosing is the board's own business: nothing has reached the shell yet.
    expect(dispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^Mouse, row.*Let it go\.$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send the mouse right.' }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'send', animal: 0, dir: 1 })
  })

  it('lets a chosen animal go again', () => {
    const { dispatch } = show(start)
    const mouse = screen.getByRole('button', { name: /^Mouse, row/ })
    fireEvent.click(mouse)
    fireEvent.click(screen.getByRole('button', { name: /^Mouse, row.*Let it go\.$/ }))
    expect(screen.getByRole('button', { name: /^Mouse, row.*Choose it\.$/ })).toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('makes the arrow keys the four sends', () => {
    const { dispatch } = show(start)
    const mouse = screen.getByRole('button', { name: /^Mouse, row/ })
    fireEvent.click(mouse)
    mouse.focus()
    fireEvent.keyDown(mouse, { key: 'ArrowRight' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'send', animal: 0, dir: 1 })
    fireEvent.keyDown(mouse, { key: 'Home' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('takes the arrows from the stage as well, where the shell parks focus', () => {
    const { dispatch, view } = show(start)
    fireEvent.click(screen.getByRole('button', { name: /^Mouse, row/ }))
    const stage = view.container
    stage.tabIndex = -1
    stage.focus()
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'send', animal: 0, dir: 1 })
  })

  it('leaves the arrows alone everywhere else on the page', () => {
    const { dispatch } = show(start)
    fireEvent.click(screen.getByRole('button', { name: /^Mouse, row/ }))
    document.body.focus()
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('puts a chosen animal down again on Escape', () => {
    const { view } = show(start)
    const mouse = screen.getByRole('button', { name: /^Mouse, row/ })
    fireEvent.click(mouse)
    mouse.focus()
    fireEvent.keyDown(mouse, { key: 'Escape' })
    expect(screen.getByRole('button', { name: /^Mouse, row.*Choose it\.$/ })).toBeInTheDocument()
    expect(view.container.textContent).toContain('Choose an animal to send.')
  })

  it('kills the arrow that would move nobody, and says so', () => {
    const { dispatch } = show(cornered)
    fireEvent.click(screen.getByRole('button', { name: /^Mouse, row/ }))
    const dead = DIRS.filter((dir) => !canSend(cornered, 0, dir))
    expect(dead).toEqual([0, 3])
    for (const dir of dead) {
      const key = screen.getByRole('button', { name: `The mouse cannot go ${DIR_WORDS[dir]}.` })
      expect(key).toHaveAttribute('aria-disabled', 'true')
      // aria-disabled, never disabled: the tab stop stays where a child left it.
      expect(key).toBeEnabled()
      fireEvent.click(key)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('says nothing about where an animal would stop', () => {
    const { view } = show(start)
    fireEvent.click(screen.getByRole('button', { name: /^Mouse, row/ }))
    const labels = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
    for (const label of labels) {
      expect(label, label).not.toMatch(/\b(stop|wall|edge|against|reach)\b/i)
    }
    expect(view.container.textContent).not.toMatch(/would|will stop/i)
  })

  it('ignores every input while locked', () => {
    const { dispatch } = show(start, true)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('reads out where everybody stands, and where the ring is', () => {
    const { view } = show(start)
    const said = status(view) ?? ''
    for (const animal of start.cast) {
      expect(said).toContain(`The ${animal.label.toLowerCase()} is on row`)
    }
    expect(said).toMatch(/The ring is on row \d, column \d\./)
  })

  it('reads out the walls, which a looker can see and a listener cannot', () => {
    const { view } = show(start)
    const bars = view.container.querySelectorAll('[class*="wall"][data-lie]')
    const said = (view.container.textContent ?? '').match(/There is a wall between/g) ?? []
    expect(bars.length).toBeGreaterThan(0)
    expect(said).toHaveLength(bars.length)
  })

  it('marks the ring square, and turns it moss when the mouse is standing on it', () => {
    const { view } = show(start)
    // One square carries the ring, and it is the one the state says it is.
    const marked = view.container.querySelectorAll('[data-home="true"]')
    expect(marked).toHaveLength(1)
    expect(view.container.querySelectorAll('[data-won="true"]')).toHaveLength(0)
    // A piece covers the whole ring, so the square under it says it too.
    const home: IceState = {
      ...start,
      at: start.at.map((cell, i) => (i === start.hero ? start.home : cell)),
    }
    cleanup()
    const won = show(home)
    expect(won.view.container.querySelectorAll('[data-won="true"]')).toHaveLength(1)
  })

  it('draws one bar a wall, and one picture an animal', () => {
    const { view } = show(start)
    let seams = 0
    for (let cell = 0; cell < start.n * start.n; cell++) {
      for (const dir of [1, 2] as Dir[]) if (walled(start, cell, dir)) seams++
    }
    expect(view.container.querySelectorAll('[class*="wall"][data-lie]')).toHaveLength(seams)
    const pieces = view.container.querySelector('[class*="pieces"]') as HTMLElement
    expect(pieces.children).toHaveLength(start.cast.length)
  })

  it('is a pure function of state — the same state always draws the same board', () => {
    const state = reduce(start, { type: 'send', animal: 0, dir: 1 })
    const a = show(state)
    const first = a.view.container.innerHTML
    cleanup()
    const b = show(state)
    expect(b.view.container.innerHTML).toBe(first)
  })

  it('renders the rule and the pieces — the shell owns everything else', () => {
    const { view } = show(start)
    expect(view.container.querySelectorAll('h1, h2, h3, h4')).toHaveLength(0)
    expect(view.container.textContent).toContain('Nobody can stop in the middle of the ice.')
    const text = view.container.textContent ?? ''
    expect(text).not.toContain(slipperyIce.title)
    expect(text).not.toContain(slipperyIce.tagline)
    for (const line of slipperyIce.instructions) expect(text).not.toContain(line)
    for (const hint of levels[0].hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})

/* One number the design rests on: how far a child who taps at random gets.
   The board argues against thrashing with two taps a send, a short par and a
   move tape that reads as wandering — and this is what those are up against. */
describe('the slippery ice — how much a flail costs', () => {
  it('takes far more sends at random than it takes with a plan', () => {
    for (const level of levels) {
      const start = init(level)
      let total = 0
      const runs = 120
      for (let run = 0; run < runs; run++) {
        const rng = makeRng(run + 1)
        let state = start
        let moves = 0
        while (!isSolved(state) && moves < 400) {
          const live = sendsOf(state).filter((action) => reduce(state, action) !== state)
          state = reduce(state, live[Math.floor(rng() * live.length)])
          moves++
        }
        total += moves
      }
      // Ten times par is not a level anybody stumbles into by accident.
      expect(total / runs, level.id).toBeGreaterThan(10 * (level.par as number))
    }
  })
})
