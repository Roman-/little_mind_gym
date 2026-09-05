import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../lib/settings'
import { underSettings } from '../../test/settings'
import { makeRng, randInt, shuffled } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { BoardProps, PuzzleLevel } from '../../lib/types'
import { balanceScales } from './index'
import { Board } from './Board'
import type { BalanceAction, BalanceConfig, BalanceState, Weighing } from './logic'
import {
  answerSentence,
  candidates,
  canWeigh,
  describeMove,
  failure,
  init,
  isSolved,
  listBalls,
  readWeighing,
  reduce,
  refusalOf,
  tipFor,
  weighingsLeft,
} from './logic'

const levels = balanceScales.levels as PuzzleLevel<BalanceConfig>[]
const levelById = (id: string) => {
  const level = levels.find((l) => l.id === id)
  if (!level) throw new Error(`no level ${id}`)
  return level
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** A state for a named level with the heavy ball pinned, so a test can be exhaustive. */
function withHeavy(level: PuzzleLevel<BalanceConfig>, heavy: number): BalanceState {
  return { ...init(level, makeRng(1)), heavy }
}

/* ==================================================================
   Working out what par really is.

   This puzzle hides information, so "the shortest solution" is not a
   path through a state graph: a lucky first guess is one move. The
   honest measure — and the one par has to be — is the fewest moves in
   which a player can be *certain*: the minimax number of weighings,
   plus the one move that names the ball.

   Two independent derivations below, and they have to agree:

   1. `guaranteedWeighings` — breadth-first search (src/lib/search.ts)
      over knowledge states. A knowledge state is just how many balls
      are still consistent with the answers so far; a move is how many
      of them go on each pan; the successor is the group the balance
      leaves you when it answers as unhelpfully as it can. Its move set
      is a superset of the real weighings (proved below in "the search
      is honest"), so the number it returns is a *lower* bound on the
      real game; the strategy it hands back is then played against the
      real engine for every hidden ball, which makes it an upper bound
      too. Equal bounds, so it is exact.

   2. `exactWeighings` — brute-force minimax over actual sets of
      candidate balls and every legal weighing the engine will accept,
      with no abstraction at all. Only affordable for eight and nine
      balls, so it stands as a check on the first.
   ================================================================== */

interface Knowledge {
  /** How many balls are still consistent with every answer so far. */
  live: number
}
/** How many still-possible balls go on each pan. The rest stay on the bench. */
interface Split {
  a: number
  b: number
}

/**
 * Every split the abstract game allows. Pans must hold the same number of
 * balls, but balls already ruled out can pad the lighter pan, so the two
 * *live* counts need not match — they need only differ by no more than the
 * number of ruled-out balls there are to pad with.
 */
function splits(total: number, live: number): Split[] {
  const spare = total - live
  const out: Split[] = []
  for (let a = 0; a <= live; a++) {
    for (let b = 0; a + b <= live; b++) {
      if (a + b === 0) continue
      if (Math.abs(a - b) > spare) continue
      out.push({ a, b })
    }
  }
  return out
}

/** The balance answers as unhelpfully as it can: the biggest group survives. */
const worstCase = (live: number, { a, b }: Split) => Math.max(a, b, live - a - b)

/** The guaranteed weighings from a position with `live` balls still possible. */
function guaranteedFrom(total: number, live: number): Split[] {
  const path = shortestSolution<Knowledge, Split>({
    start: { live },
    moves: (st) => splits(total, st.live),
    apply: (st, split) => ({ live: worstCase(st.live, split) }),
    key: (st) => String(st.live),
    solved: (st) => st.live === 1,
  })
  if (path === null) throw new Error(`no guaranteed strategy for ${live} of ${total}`)
  return path
}

const guaranteedWeighings = (total: number) => guaranteedFrom(total, total).length

/* --- real weighings, as bitmasks, for the brute-force cross-checks --- */

const popcount = (x: number) => {
  let n = 0
  for (let v = x; v !== 0; v &= v - 1) n++
  return n
}

const masksCache = new Map<number, [number, number][]>()
/** Every weighing the rules allow over `total` balls: equal, non-empty, disjoint pans. */
function legalMasks(total: number): [number, number][] {
  const cached = masksCache.get(total)
  if (cached) return cached
  const out: [number, number][] = []
  for (let code = 0; code < 3 ** total; code++) {
    let rest = code
    let left = 0
    let right = 0
    let nl = 0
    let nr = 0
    for (let i = 0; i < total; i++) {
      const slot = rest % 3
      rest = (rest - slot) / 3
      if (slot === 1) {
        left |= 1 << i
        nl++
      } else if (slot === 2) {
        right |= 1 << i
        nr++
      }
    }
    if (nl !== 0 && nl === nr) out.push([left, right])
  }
  masksCache.set(total, out)
  return out
}

const ballsOf = (mask: number, total: number) => range(total).filter((i) => (mask >> i) & 1)

/** Fewest balls the balance can be forced to leave in play, over every real weighing. */
function fewestSurvivors(total: number, live: number): number {
  let best = popcount(live)
  for (const [l, r] of legalMasks(total)) {
    const worst = Math.max(popcount(live & l), popcount(live & r), popcount(live & ~(l | r)))
    if (worst < best) best = worst
  }
  return best
}

/** Exact minimax over real sets and real weighings. No abstraction. */
function exactWeighings(total: number): number {
  const pairs = legalMasks(total)
  const memo = new Map<number, number>()
  const value = (live: number): number => {
    const n = popcount(live)
    if (n <= 1) return 0
    const seen = memo.get(live)
    if (seen !== undefined) return seen
    memo.set(live, Infinity) // a weighing that learns nothing cannot help
    let best = Infinity
    for (const [l, r] of pairs) {
      const groups = [live & l, live & r, live & ~(l | r)]
      let worst = groups[0]
      for (const g of groups) if (popcount(g) > popcount(worst)) worst = g
      if (popcount(worst) === n) continue
      const v = 1 + value(worst)
      if (v < best) best = v
    }
    memo.set(live, best)
    return best
  }
  return value((1 << total) - 1)
}

/* --- playing the search's own strategy against the real engine ------ */

/** Turns a split of the live balls into a weighing the engine will accept. */
function weighingFor(state: BalanceState, live: number[], { a, b }: Split): BalanceAction {
  const spare = range(state.balls).filter((i) => !live.includes(i))
  const left = live.slice(0, a)
  const right = live.slice(a, a + b)
  // Pad the lighter pan with balls that have already been ruled out.
  if (a > b) right.push(...spare.slice(0, a - b))
  if (b > a) left.push(...spare.slice(0, b - a))
  return { type: 'weigh', left, right }
}

/** Plays the guaranteed strategy through the real reducer, counting dispatches. */
function playStrategy(start: BalanceState) {
  let state = start
  let moves = 0
  let weighings = 0
  while (!isSolved(state)) {
    if (moves > start.allowed + 1) throw new Error('the strategy overran its budget')
    if (failure(state) !== null) throw new Error(`the strategy walked into: ${failure(state)}`)
    const live = candidates(state)
    const action: BalanceAction =
      live.length === 1
        ? { type: 'accuse', index: live[0] }
        : weighingFor(state, live, guaranteedFrom(start.balls, live.length)[0])
    const next = reduce(state, action)
    if (next === state) throw new Error(`the strategy played an illegal ${action.type}`)
    if (action.type === 'weigh') weighings++
    state = next
    moves++
  }
  return { state, moves, weighings }
}

function deepFreeze(state: BalanceState): BalanceState {
  Object.freeze(state.done)
  for (const w of state.done) {
    Object.freeze(w)
    Object.freeze(w.left)
    Object.freeze(w.right)
  }
  return Object.freeze(state)
}

/* ================================================================== */

describe('par is the fewest moves a player can be certain in', () => {
  it('the search is honest: every real weighing is a split the search considered', () => {
    // The search ranges over a superset of the real moves, which is what makes
    // the number it returns a lower bound on the real game.
    for (const level of levels) {
      const total = level.config.balls
      const allowed = new Set(splits(total, total).map(({ a, b }) => `${a}:${b}`))
      for (const [l, r] of legalMasks(total)) {
        expect(allowed.has(`${popcount(l)}:${popcount(r)}`)).toBe(true)
      }
    }
  })

  it('every weighing the search enumerates is one the engine accepts', () => {
    for (const level of levels) {
      const state = init(level, makeRng(7))
      const total = level.config.balls
      let count = 0
      for (const [l, r] of legalMasks(total)) {
        count++
        if (count % 97 !== 0) continue // a thorough sample; the whole set is large
        expect(canWeigh(state, ballsOf(l, total), ballsOf(r, total))).toBe(true)
      }
      expect(count).toBeGreaterThan(0)
    }
  })

  it('the engine narrows exactly the way the search says it does', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const level of levels) {
        let state = init(level, makeRng(seed))
        const rng = makeRng(seed * 7919 + 3)
        while (weighingsLeft(state) > 0) {
          const bag = shuffled(rng, range(state.balls))
          const k = 1 + randInt(rng, Math.floor(state.balls / 2))
          const left = bag.slice(0, k)
          const right = bag.slice(k, 2 * k)
          const before = candidates(state)
          const next = reduce(state, { type: 'weigh', left, right })
          expect(next).not.toBe(state)
          const answer = next.done[next.done.length - 1].tip
          // What survives is precisely the group the balance pointed at …
          expect(candidates(next)).toEqual(before.filter((b) => tipFor(left, right, b) === answer))
          // … and it is never smaller than the worst case the search assumes.
          const split = {
            a: before.filter((b) => left.includes(b)).length,
            b: before.filter((b) => right.includes(b)).length,
          }
          expect(candidates(next).length).toBeLessThanOrEqual(worstCase(before.length, split))
          state = next
        }
      }
    }
  })

  for (const level of levels) {
    const total = level.config.balls

    it(`"${level.label}": par is ${level.par} — ${guaranteedWeighings(total)} weighings and one naming`, () => {
      expect(level.par).toBe(guaranteedWeighings(total) + 1)
      expect(guaranteedWeighings(total)).toBeLessThanOrEqual(level.config.weighings)
    })

    it(`"${level.label}": that many weighings really do find every one of the ${total} balls`, () => {
      // The strategy reads nothing but the record, so running it against every
      // hidden ball runs it against every line the balance could possibly take.
      const runs = range(total).map((heavy) => playStrategy(withHeavy(level, heavy)))
      runs.forEach((played, heavy) => {
        expect(played.state.accused).toBe(heavy)
        expect(isSolved(played.state)).toBe(true)
        expect(failure(played.state)).toBeNull()
        expect(played.weighings).toBeLessThanOrEqual(guaranteedWeighings(total))
        expect(played.state.done.length).toBeLessThanOrEqual(level.config.weighings)
        expect(played.moves).toBeLessThanOrEqual(level.par as number)
      })
      // A kind answer can finish sooner; par is the worst the balance can do.
      expect(Math.max(...runs.map((r) => r.moves))).toBe(level.par)
      expect(Math.max(...runs.map((r) => r.weighings))).toBe(guaranteedWeighings(total))
    })

    it(`"${level.label}": one weighing fewer provably cannot do it`, () => {
      // Concretely, over every legal weighing there is: the balance can always
      // leave this many balls in play.
      const survivors = fewestSurvivors(total, (1 << total) - 1)
      expect(survivors).toBe(Math.ceil(total / 3))
      expect(survivors).toBeGreaterThan(1)
      // And from there it can go on holding out for the rest of the search's count.
      expect(guaranteedFrom(total, survivors).length).toBe(guaranteedWeighings(total) - 1)
    })
  }

  it('brute force over real sets agrees, for the levels small enough to brute force', () => {
    expect(exactWeighings(8)).toBe(guaranteedWeighings(8))
    expect(exactWeighings(9)).toBe(guaranteedWeighings(9))
    expect(exactWeighings(8)).toBe(2)
    expect(exactWeighings(9)).toBe(2)
  })

  it('twelve balls need three weighings: two can always be survived', () => {
    expect(guaranteedWeighings(12)).toBe(3)
    // Whatever the first weighing, four balls can still be in play …
    expect(fewestSurvivors(12, (1 << 12) - 1)).toBe(4)
    // … and from any four, whatever the second weighing, two can still be.
    expect(fewestSurvivors(12, 0b1111)).toBe(2)
    expect(fewestSurvivors(12, 0b111100000000)).toBe(2)
  })
})

describe('setup', () => {
  for (const level of levels) {
    it(`"${level.label}" starts clean, unsolved and hiding a real ball — 60 seeds`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const state = init(level, makeRng(seed))
        expect(state.balls).toBe(level.config.balls)
        expect(state.allowed).toBe(level.config.weighings)
        expect(state.done).toEqual([])
        expect(state.accused).toBeNull()
        expect(Number.isInteger(state.heavy)).toBe(true)
        expect(state.heavy).toBeGreaterThanOrEqual(0)
        expect(state.heavy).toBeLessThan(state.balls)
        expect(isSolved(state)).toBe(false)
        expect(failure(state)).toBeNull()
        // Nothing is known yet, so no ball can be named with any certainty:
        // the start is never solved and never one honest move from solved.
        expect(candidates(state)).toEqual(range(state.balls))
        expect(weighingsLeft(state)).toBeGreaterThan(0)
      }
    })

    it(`"${level.label}" is solvable within par from 60 seeds`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const start = init(level, makeRng(seed))
        const played = playStrategy(start)
        expect(isSolved(played.state)).toBe(true)
        expect(played.state.accused).toBe(start.heavy)
        expect(played.moves).toBeLessThanOrEqual(level.par as number)
        expect(played.moves).toBeGreaterThan(1)
      }
    })
  }

  it('hides a different ball for different seeds', () => {
    const level = levelById('twelve-balls')
    const seen = new Set(range(60).map((s) => init(level, makeRng(s + 1)).heavy))
    expect(seen.size).toBeGreaterThan(4)
  })

  it('init reads the level without touching it', () => {
    const level = levelById('nine-balls')
    Object.freeze(level.config)
    Object.freeze(level)
    const before = JSON.stringify(level)
    const state = init(level, makeRng(3))
    expect(JSON.stringify(level)).toBe(before)
    expect(state.balls).toBe(9)
  })

  it('every level has a stable id, three hints and a difficulty ramp', () => {
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length)
    for (const level of levels) {
      expect(level.id).toMatch(/^[a-z][a-z-]*[a-z]$/)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.hints).toHaveLength(3)
      expect(level.par).toBeGreaterThan(0)
      for (const hint of level.hints) expect(hint.length).toBeLessThan(120)
    }
  })

  it('is declared reseedable, and means it', () => {
    expect(balanceScales.reseedable).toBe(true)
    expect(balanceScales.id).toBe('balance-scales')
    expect(balanceScales.engine.Board).toBe(Board)
  })
})

describe('illegal actions return the identical state object', () => {
  const level = levelById('eight-balls')
  const start = withHeavy(level, 3)

  it('rejects an empty pan', () => {
    expect(reduce(start, { type: 'weigh', left: [], right: [] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [0], right: [] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [], right: [0] })).toBe(start)
  })

  it('rejects pans of different sizes', () => {
    expect(reduce(start, { type: 'weigh', left: [0, 1], right: [2] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [0], right: [1, 2] })).toBe(start)
  })

  it('names what is wrong with a load it will not weigh, and moves nothing', () => {
    expect(refusalOf(start, [], [])?.message).toBe('There is nothing on the balance to weigh.')
    expect(refusalOf(start, [0, 1], [2])?.message).toBe(
      'The balance needs the same number of balls on each pan.',
    )
    // The beam gives nothing away: a refusal is a sentence, never a position.
    expect(refusalOf(start, [0, 1], [2])?.pretend).toBe(start)
    // A load the balance will take has nothing to refuse.
    expect(refusalOf(start, [0], [1])).toBeNull()
  })

  it('rejects a ball that is on both pans', () => {
    expect(reduce(start, { type: 'weigh', left: [0, 1], right: [1, 2] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [4], right: [4] })).toBe(start)
  })

  it('rejects a ball that appears twice on one pan', () => {
    expect(reduce(start, { type: 'weigh', left: [0, 0], right: [1, 2] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [1, 2], right: [3, 3] })).toBe(start)
  })

  it('rejects a ball that does not exist, or is not a whole number', () => {
    expect(reduce(start, { type: 'weigh', left: [0], right: [8] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [-1], right: [1] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [1.5], right: [1] })).toBe(start)
    expect(reduce(start, { type: 'weigh', left: [Number.NaN], right: [1] })).toBe(start)
    expect(reduce(start, { type: 'accuse', index: 8 })).toBe(start)
    expect(reduce(start, { type: 'accuse', index: -1 })).toBe(start)
    expect(reduce(start, { type: 'accuse', index: 2.5 })).toBe(start)
    expect(reduce(start, { type: 'accuse', index: Number.NaN })).toBe(start)
  })

  it('rejects an action it has never heard of', () => {
    const nonsense = { type: 'levitate' } as unknown as BalanceAction
    expect(reduce(start, nonsense)).toBe(start)
  })

  it('rejects a weighing once the balance is spent', () => {
    let state = start
    for (let n = 0; n < state.allowed; n++) {
      const next = reduce(state, { type: 'weigh', left: [0], right: [1] })
      expect(next).not.toBe(state)
      state = next
    }
    expect(weighingsLeft(state)).toBe(0)
    expect(reduce(state, { type: 'weigh', left: [2], right: [3] })).toBe(state)
    expect(canWeigh(state, [2], [3])).toBe(false)
  })

  it('rejects everything once a ball has been named', () => {
    for (const index of [0, start.heavy]) {
      const named = reduce(start, { type: 'accuse', index })
      expect(named).not.toBe(start)
      expect(reduce(named, { type: 'accuse', index: 1 })).toBe(named)
      expect(reduce(named, { type: 'accuse', index })).toBe(named)
      expect(reduce(named, { type: 'weigh', left: [1], right: [2] })).toBe(named)
    }
  })

  it('never mutates the state or the action it is given', () => {
    const frozen = deepFreeze(withHeavy(level, 3))
    const left = Object.freeze([3, 4]) as unknown as number[]
    const right = Object.freeze([5, 6]) as unknown as number[]
    const next = reduce(frozen, { type: 'weigh', left, right })
    expect(next).not.toBe(frozen)
    expect(frozen.done).toEqual([])
    expect(left).toEqual([3, 4])
    expect(next.done).toEqual([{ left: [3, 4], right: [5, 6], tip: 'left' }])
    // …and the recorded weighing is the engine's own copy, not the caller's array.
    expect(next.done[0].left).not.toBe(left)
    const after = reduce(deepFreeze(next), { type: 'accuse', index: 3 })
    expect(after.accused).toBe(3)
    expect(next.accused).toBeNull()
  })

  it('sorts what it records, so the same weighing always reads the same way', () => {
    const next = reduce(start, { type: 'weigh', left: [4, 1], right: [6, 2] })
    expect(next.done[0]).toEqual({ left: [1, 4], right: [2, 6], tip: 'even' })
  })
})

describe('the balance never lies', () => {
  it('answers every weighing consistently with the ball it is hiding, over many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const level of levels) {
        let state = init(level, makeRng(seed))
        const rng = makeRng(seed * 9973 + 17)
        while (weighingsLeft(state) > 0) {
          const bag = shuffled(rng, range(state.balls))
          const k = 1 + randInt(rng, Math.floor(state.balls / 2))
          const left = bag.slice(0, k)
          const right = bag.slice(k, 2 * k)
          const next = reduce(state, { type: 'weigh', left, right })
          expect(next).not.toBe(state)
          const w = next.done[next.done.length - 1]
          const truth = left.includes(state.heavy)
            ? 'left'
            : right.includes(state.heavy)
              ? 'right'
              : 'even'
          expect(w.tip).toBe(truth)
          // The hidden ball is never contradicted by the answers given about it.
          expect(candidates(next)).toContain(state.heavy)
          state = next
        }
      }
    }
  })

  it('shrinks what is still possible to exactly the group that was pointed at', () => {
    const level = levelById('nine-balls')
    const state = reduce(withHeavy(level, 7), { type: 'weigh', left: [0, 1, 2], right: [3, 4, 5] })
    expect(state.done[0].tip).toBe('even')
    expect(candidates(state)).toEqual([6, 7, 8])
    const then = reduce(state, { type: 'weigh', left: [6], right: [7] })
    expect(then.done[1].tip).toBe('right')
    expect(candidates(then)).toEqual([7])
  })

  it('lets a weighing lean on balls that are already ruled out', () => {
    // Four still in play (0–3), eight known light. Two against one, padded.
    const level = levelById('twelve-balls')
    let state = withHeavy(level, 2)
    state = reduce(state, { type: 'weigh', left: [0, 1, 2, 3], right: [4, 5, 6, 7] })
    expect(candidates(state)).toEqual([0, 1, 2, 3])
    const padded = reduce(state, { type: 'weigh', left: [0, 1], right: [2, 4] })
    expect(padded).not.toBe(state)
    expect(padded.done[1].tip).toBe('right')
    expect(candidates(padded)).toEqual([2])
  })
})

describe('failure', () => {
  const level = levelById('nine-balls')

  it('is null on every starting state of every level', () => {
    for (const l of levels) {
      for (let seed = 1; seed <= 20; seed++) expect(failure(init(l, makeRng(seed)))).toBeNull()
    }
  })

  it('stays null while there are weighings left, however badly they are spent', () => {
    let state = withHeavy(level, 4)
    expect(failure(state)).toBeNull()
    state = reduce(state, { type: 'weigh', left: [0], right: [1] })
    expect(candidates(state).length).toBeGreaterThan(1)
    expect(failure(state)).toBeNull()
  })

  it('names a wrong accusation for what it is, once the record has narrowed', () => {
    // Narrow to a single candidate first, so the answer is the thing being judged.
    let state = reduce(withHeavy(level, 4), { type: 'weigh', left: [4], right: [7] })
    expect(candidates(state)).toEqual([4])
    state = reduce(state, { type: 'accuse', index: 0 })
    expect(failure(state)).toBe('That ball is not the heavy one.')
    expect(isSolved(state)).toBe(false)
  })

  it('stays null for a right accusation the record has earned', () => {
    let state = reduce(withHeavy(level, 4), { type: 'weigh', left: [4], right: [7] })
    state = reduce(state, { type: 'accuse', index: 4 })
    expect(failure(state)).toBeNull()
    expect(isSolved(state)).toBe(true)
  })

  it('refuses to call a lucky guess a win', () => {
    // Naming the right ball with nothing on the record is a dead end, not a
    // solve — otherwise guess, step back, guess would beat the puzzle.
    const state = reduce(withHeavy(level, 4), { type: 'accuse', index: 4 })
    expect(isSolved(state)).toBe(false)
    expect(failure(state)).toBe('More than one ball could still be the heavy one.')
  })

  it('says the same thing whether the blind guess was right or wrong', () => {
    // The message must not leak the answer to a player who guessed.
    const right = reduce(withHeavy(level, 4), { type: 'accuse', index: 4 })
    const wrong = reduce(withHeavy(level, 4), { type: 'accuse', index: 0 })
    expect(failure(right)).toBe(failure(wrong))
  })

  it('fires when the last weighing is gone and more than one ball is still possible', () => {
    let state = withHeavy(level, 8)
    state = reduce(state, { type: 'weigh', left: [0], right: [1] })
    state = reduce(state, { type: 'weigh', left: [0], right: [1] })
    expect(weighingsLeft(state)).toBe(0)
    expect(candidates(state)).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(failure(state)).toBe(
      'You have used every weighing. More than one ball could still be the heavy one.',
    )
  })

  it('stays null when the balance is spent but exactly one ball is still possible', () => {
    // This is the winning line for nine balls: spend both, then name the ball.
    let state = withHeavy(level, 4)
    state = reduce(state, { type: 'weigh', left: [0, 1, 2], right: [3, 4, 5] })
    state = reduce(state, { type: 'weigh', left: [3], right: [4] })
    expect(weighingsLeft(state)).toBe(0)
    expect(candidates(state)).toEqual([4])
    expect(failure(state)).toBeNull()
    expect(isSolved(reduce(state, { type: 'accuse', index: 4 }))).toBe(true)
  })

  it('fires on exactly the states where the player can no longer know', () => {
    // Sweep: every state reachable by spending the balance at random.
    for (let seed = 1; seed <= 30; seed++) {
      for (const l of levels) {
        let state = init(l, makeRng(seed))
        const rng = makeRng(seed * 31 + 5)
        while (weighingsLeft(state) > 0) {
          const bag = shuffled(rng, range(state.balls))
          const k = 1 + randInt(rng, Math.floor(state.balls / 2))
          state = reduce(state, { type: 'weigh', left: bag.slice(0, k), right: bag.slice(k, 2 * k) })
          const stuck = weighingsLeft(state) === 0 && candidates(state).length > 1
          expect(failure(state) !== null).toBe(stuck)
        }
      }
    }
  })

  it('is never both solved and failed', () => {
    const level3 = levelById('twelve-balls')
    for (let heavy = 0; heavy < 12; heavy++) {
      // One weighing of the heavy ball against any other narrows the record to
      // it alone, which is what makes the accusation admissible.
      const narrowed = reduce(withHeavy(level3, heavy), {
        type: 'weigh',
        left: [heavy],
        right: [(heavy + 1) % 12],
      })
      expect(candidates(narrowed)).toEqual([heavy])
      for (const index of range(12)) {
        const state = reduce(narrowed, { type: 'accuse', index })
        expect(isSolved(state) && failure(state) !== null).toBe(false)
        expect(isSolved(state)).toBe(index === heavy)
      }
    }
  })
})

describe('describe', () => {
  const level = levelById('eight-balls')

  it('names the balls that were weighed, not just how many', () => {
    const start = withHeavy(level, 0)
    const action: BalanceAction = { type: 'weigh', left: [0, 1], right: [2, 3] }
    expect(describeMove(start, reduce(start, action), action)).toBe(
      'Weighed 1 and 2 against 3 and 4 — the left pan went down',
    )
    // Two different weighings of the same size must not read the same.
    const other: BalanceAction = { type: 'weigh', left: [4, 5], right: [6, 7] }
    expect(describeMove(start, reduce(start, other), other)).toBe(
      'Weighed 5 and 6 against 7 and 8 — the pans stayed level',
    )
  })

  it('reports the third answer too', () => {
    const start = withHeavy(level, 6)
    const action: BalanceAction = { type: 'weigh', left: [0], right: [6] }
    expect(describeMove(start, reduce(start, action), action)).toBe(
      'Weighed 1 against 7 — the right pan went down',
    )
  })

  it('reports an accusation in ball numbers a player can see', () => {
    const start = withHeavy(level, 5)
    const action: BalanceAction = { type: 'accuse', index: 5 }
    expect(describeMove(start, reduce(start, action), action)).toBe(
      'Named ball 6 as the heavy one',
    )
  })

  it('lists ball numbers the way a person says them', () => {
    expect(listBalls([0])).toBe('1')
    expect(listBalls([0, 1])).toBe('1 and 2')
    expect(listBalls([0, 1, 2])).toBe('1, 2 and 3')
    expect(readWeighing({ left: [0], right: [1], tip: 'even' }, 2)).toBe(
      'Weighing 2: 1 against 2 — the pans stayed level.',
    )
    expect(answerSentence('left')).toBe('The left pan went down.')
    expect(answerSentence('even')).toBe('The pans stayed level.')
  })
})

/* ================================================================== */

describe('the board', () => {
  afterEach(cleanup)

  const level = levelById('eight-balls')
  const mount = (state: BalanceState, locked = false, settings?: Partial<Settings>) => {
    const sent: BalanceAction[] = []
    const view = render(
      createElement(Board, { state, dispatch: (a: BalanceAction) => sent.push(a), locked }),
      { wrapper: underSettings(settings) },
    )
    return { sent, view }
  }

  /** The shell always draws a board inside the settings; a bare render has to too. */
  const drawn = (props: BoardProps<BalanceState, BalanceAction>) =>
    render(createElement(Board, props), { wrapper: underSettings() })

  const weighed = (heavy: number, w: Weighing['left'], r: Weighing['right']) =>
    reduce(withHeavy(level, heavy), { type: 'weigh', left: w, right: r })

  const button = (name: string) => screen.getByRole('button', { name })
  const maybeButton = (name: string) => screen.queryByRole('button', { name })
  const liftOf = (view: { container: HTMLElement }, side: string) =>
    (view.container.querySelector(`[data-side="${side}"]`) as HTMLElement).style.getPropertyValue(
      '--lift',
    )

  it('puts one ball on the bench for each ball in the state', () => {
    mount(withHeavy(level, 2))
    for (let i = 1; i <= 8; i++) expect(button(`Put ball ${i} on a pan`)).toBeInTheDocument()
    expect(screen.getByText('3 weighings left')).toBeInTheDocument()
    expect(screen.getByText('Nothing weighed yet')).toBeInTheDocument()
  })

  it('loads the pans a ball at a time and dispatches one action for one weighing', () => {
    // With forbidden moves off, Weigh only lights up for a load the balance
    // will take. The describe at the foot of this file plays it the other way.
    const { sent } = mount(withHeavy(level, 2), false, { allowForbiddenMoves: false })
    expect(button('Weigh')).toBeDisabled()

    fireEvent.click(button('Put ball 1 on a pan'))
    expect(button('Take ball 1 off the left pan')).toBeInTheDocument()
    expect(maybeButton('Put ball 1 on a pan')).toBeNull()
    expect(button('Weigh')).toBeDisabled() // one pan is empty

    fireEvent.click(button('Put ball 2 on a pan'))
    expect(button('Take ball 2 off the right pan')).toBeInTheDocument()
    expect(button('Weigh')).toBeEnabled()

    fireEvent.click(button('Weigh'))
    expect(sent).toEqual([{ type: 'weigh', left: [0], right: [1] }])
  })

  it('will not offer a weighing with the pans unequal, once forbidden moves are off', () => {
    mount(withHeavy(level, 2), false, { allowForbiddenMoves: false })
    for (const n of [1, 2, 3]) fireEvent.click(button(`Put ball ${n} on a pan`))
    expect(button('Weigh')).toBeDisabled()
    expect(screen.getByText('Each pan needs the same number of balls.')).toBeInTheDocument()
    fireEvent.click(button('Put ball 4 on a pan'))
    expect(button('Weigh')).toBeEnabled()
  })

  it('sends a ball back to the bench when it is tapped in a pan', () => {
    const { sent } = mount(withHeavy(level, 2))
    fireEvent.click(button('Put ball 1 on a pan'))
    fireEvent.click(button('Take ball 1 off the left pan'))
    expect(button('Put ball 1 on a pan')).toBeInTheDocument()
    expect(sent).toEqual([])
  })

  const pan = (view: { container: HTMLElement }, side: string) =>
    view.container.querySelector(`[data-side="${side}"]`) as HTMLElement

  it('drops a dragged ball into the pan it was aimed at', () => {
    // Tapping fills the emptier pan. Dragging is how a player says which pan.
    const { sent, view } = mount(withHeavy(level, 2))
    fireEvent.dragStart(button('Put ball 1 on a pan'))
    fireEvent.drop(pan(view, 'right'))
    expect(button('Take ball 1 off the right pan')).toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('drags a ball from one pan to the other', () => {
    const { sent, view } = mount(withHeavy(level, 2))
    fireEvent.click(button('Put ball 1 on a pan'))
    fireEvent.click(button('Put ball 2 on a pan'))
    fireEvent.dragStart(button('Take ball 2 off the right pan'))
    fireEvent.drop(pan(view, 'left'))
    expect(button('Take ball 2 off the left pan')).toBeInTheDocument()
    expect(maybeButton('Take ball 2 off the right pan')).toBeNull()
    expect(sent).toEqual([])
  })

  it('leaves the weighed balls sitting in the pans, with the beam tipped', () => {
    const state = weighed(2, [0, 1], [2, 3])
    const { view } = mount(state)
    expect(state.done[0].tip).toBe('right') // ball 3 is heavy, on the right pan
    expect(button('Take ball 3 off the right pan')).toBeInTheDocument()
    expect(maybeButton('Put ball 3 on a pan')).toBeNull()
    expect(Number(liftOf(view, 'right'))).toBeGreaterThan(0) // the heavy pan sank
    expect(Number(liftOf(view, 'left'))).toBeLessThan(0)
  })

  it('says what the balance did in words as well as in the beam', () => {
    // The tilt is the answer, but a level beam is an answer too, and that one
    // has no movement to show for itself.
    mount(weighed(2, [0, 1], [2, 3]))
    expect(
      screen.getByText('The right pan went down. Take the balls off to weigh again.'),
    ).toBeInTheDocument()
    cleanup()
    mount(weighed(7, [0, 1], [2, 3]))
    expect(
      screen.getByText('The pans stayed level. Take the balls off to weigh again.'),
    ).toBeInTheDocument()
  })

  it('holds the beam level until there is an answer, and after a level answer', () => {
    const fresh = mount(withHeavy(level, 2))
    expect(Number(liftOf(fresh.view, 'left'))).toBe(0)
    cleanup()
    const even = mount(weighed(7, [0, 1], [2, 3]))
    expect(even.view.container).toBeTruthy()
    expect(Number(liftOf(even.view, 'left'))).toBe(0)
    expect(Number(liftOf(even.view, 'right'))).toBe(0)
  })

  it('takes the balls off when asked, and levels the beam', () => {
    const { sent, view } = mount(weighed(2, [0, 1], [2, 3]))
    fireEvent.click(button('Take the balls off'))
    for (let i = 1; i <= 4; i++) expect(button(`Put ball ${i} on a pan`)).toBeInTheDocument()
    expect(Number(liftOf(view, 'left'))).toBe(0)
    expect(sent).toEqual([])
  })

  it('starts a fresh load when a bench ball is tapped with the last weighing still on', () => {
    const { sent } = mount(weighed(2, [0, 1], [2, 3]))
    fireEvent.click(button('Put ball 5 on a pan'))
    expect(button('Take ball 5 off the left pan')).toBeInTheDocument()
    // The previous load went back to the bench rather than being weighed again.
    expect(button('Put ball 1 on a pan')).toBeInTheDocument()
    expect(maybeButton('Take ball 1 off the left pan')).toBeNull()
    expect(sent).toEqual([])
  })

  it('offers nothing to take off before anything is loaded', () => {
    mount(withHeavy(level, 2))
    expect(maybeButton('Take the balls off')).toBeNull()
  })

  it('will not load a pan once the balance is spent', () => {
    let state = withHeavy(level, 2)
    for (let n = 0; n < 3; n++) {
      state = reduce(state, { type: 'weigh', left: [0], right: [1] })
    }
    const { sent } = mount(state)
    expect(screen.getByText('No weighings left')).toBeInTheDocument()
    fireEvent.click(button('Take the balls off'))
    // A ball that cannot be loaded stops telling the reader to load it.
    expect(maybeButton('Put ball 5 on a pan')).toBeNull()
    const ball = button('Ball 5')
    expect(ball).toBeDisabled()
    fireEvent.click(ball)
    expect(sent).toEqual([])
  })

  it('turns the bench into targets when naming, and dispatches one accusation', () => {
    const { sent } = mount(withHeavy(level, 2))
    fireEvent.click(button('Put ball 1 on a pan'))
    const toggle = button('Name the heavy one')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(button('Name the heavy one')).toHaveAttribute('aria-pressed', 'true')
    // The pans are cleared, so every ball can be named.
    for (let i = 1; i <= 8; i++) expect(button(`Name ball ${i} as the heavy one`)).toBeInTheDocument()
    fireEvent.click(button('Name ball 6 as the heavy one'))
    expect(sent).toEqual([{ type: 'accuse', index: 5 }])
  })

  it('lets a player change their mind about naming', () => {
    const { sent } = mount(withHeavy(level, 2))
    fireEvent.click(button('Name the heavy one'))
    fireEvent.click(button('Name the heavy one'))
    expect(button('Put ball 3 on a pan')).toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('shows which ball was named once one has been', () => {
    const state = reduce(withHeavy(level, 2), { type: 'accuse', index: 5 })
    const { view } = mount(state, true)
    expect(button('Ball 6, the one you named')).toBeInTheDocument()
    expect(view.container.querySelectorAll('[data-named="true"]')).toHaveLength(1)
  })

  it('ignores every input while locked', () => {
    const { sent } = mount(weighed(2, [0, 1], [2, 3]), true)
    for (const el of Array.from(document.querySelectorAll('button'))) {
      expect(el).toBeDisabled()
      fireEvent.click(el)
    }
    expect(sent).toEqual([])
  })

  it('clears the pans when the state changes underneath it', () => {
    const start = withHeavy(level, 2)
    const { view } = mount(start)
    fireEvent.click(button('Put ball 1 on a pan'))
    expect(button('Take ball 1 off the left pan')).toBeInTheDocument()
    // A rewind hands the board a different state object …
    const rewound = { ...start }
    view.rerender(createElement(Board, { state: rewound, dispatch: () => {}, locked: false }))
    expect(button('Put ball 1 on a pan')).toBeInTheDocument()
    expect(maybeButton('Take ball 1 off the left pan')).toBeNull()
  })

  it('draws the same board for a state however it was arrived at', () => {
    const state = weighed(2, [0, 1], [2, 3])
    const fresh = drawn({ state, dispatch: () => {}, locked: false }).container.innerHTML
    cleanup()
    const view = drawn({ state: withHeavy(level, 2), dispatch: () => {}, locked: false })
    view.rerender(createElement(Board, { state, dispatch: () => {}, locked: false }))
    expect(view.container.innerHTML).toBe(fresh)
  })

  it('keeps a readable record of every weighing', () => {
    let state = withHeavy(level, 6)
    state = reduce(state, { type: 'weigh', left: [0, 1, 2], right: [3, 4, 5] })
    state = reduce(state, { type: 'weigh', left: [6], right: [7] })
    mount(state)
    expect(
      screen.getByText('Weighing 1: 1, 2 and 3 against 4, 5 and 6 — the pans stayed level.'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText('Weighing 2: 7 against 8 — the left pan went down.').length,
    ).toBeGreaterThan(0)
  })

  it('renders nothing whatever that depends on which ball is hidden', () => {
    // Every public position below is consistent with several hidden balls. The
    // board must draw them identically, or it is leaking the answer.
    const records: Weighing[][] = [
      [],
      [{ left: [0, 1, 2], right: [3, 4, 5], tip: 'even' }],
      [{ left: [0, 1, 2], right: [3, 4, 5], tip: 'left' }],
      [
        { left: [0, 1, 2], right: [3, 4, 5], tip: 'right' },
        { left: [0], right: [1], tip: 'even' },
      ],
    ]
    for (const done of records) {
      for (const accused of [null, 0, 5]) {
        const consistent = range(8).filter((b) =>
          done.every((w) => tipFor(w.left, w.right, b) === w.tip),
        )
        expect(consistent.length).toBeGreaterThan(1)
        const drawings = consistent.map((heavy) => {
          const view = drawn({
            state: { ...withHeavy(level, heavy), done, accused },
            dispatch: () => {},
            locked: false,
          })
          const html = view.container.innerHTML
          cleanup()
          return html
        })
        expect(new Set(drawings).size).toBe(1)
      }
    }
  })

  it('never dispatches a move the engine will not take, however it is prodded', () => {
    // Wire the board to the real engine and mash buttons. Every dispatched
    // action must be a real move: the board is never allowed to burn a turn.
    for (const level of levels) {
      for (let seed = 1; seed <= 6; seed++) {
        cleanup()
        let state = init(level, makeRng(seed))
        let dispatched = 0
        const draw = () =>
          view.rerender(
            createElement(Board, {
              state,
              dispatch,
              locked: isSolved(state) || failure(state) !== null,
            }),
          )
        const dispatch = (action: BalanceAction) => {
          expect(isSolved(state)).toBe(false)
          expect(failure(state)).toBeNull()
          const next = reduce(state, action)
          expect(next).not.toBe(state) // the board offered an illegal move
          state = next
          dispatched++
          draw()
        }
        const view = drawn({ state, dispatch, locked: false })
        const rng = makeRng(seed * 613 + 11)
        for (let tap = 0; tap < 80; tap++) {
          const live = Array.from(document.querySelectorAll('button')).filter((b) => !b.disabled)
          if (live.length === 0) break
          fireEvent.click(live[randInt(rng, live.length)])
        }
        expect(dispatched).toBeLessThanOrEqual(level.config.weighings + 1)
        expect(dispatched).toBeGreaterThan(0)
      }
    }
  })

  /* ----------------------------------------------------------
     A press the balance will not take, with the setting that
     offers it on — which is how the collection ships.

     jsdom loads no stylesheet, so --dur-4 is put on the root by
     hand: the cue lives for exactly as long as its token says.
     ---------------------------------------------------------- */
  describe('a weighing the balance will not make', () => {
    const DUR_4 = 480
    const runCue = () => act(() => vi.advanceTimersByTime(DUR_4))
    const said = () => document.querySelector('[role="status"]')?.textContent

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

    it('leaves Weigh live whatever is on the pans', () => {
      mount(withHeavy(level, 2))
      for (const n of [1, 2, 3]) fireEvent.click(button(`Put ball ${n} on a pan`))
      expect(button('Weigh')).toBeEnabled()
      // Nor is the rule stated up front: counting the two pans is the puzzle.
      expect(screen.queryByText('Each pan needs the same number of balls.')).toBeNull()
    })

    it('refuses the press, says why, and burns no weighing', () => {
      const { sent, view } = mount(withHeavy(level, 2))
      for (const n of [1, 2, 3]) fireEvent.click(button(`Put ball ${n} on a pan`))
      fireEvent.click(button('Weigh'))

      expect(sent).toEqual([])
      expect(button('Weigh').className).toContain('flash')
      // The beam itself shakes, and it never tips: a pretend answer would say
      // which side the heavy ball is on.
      expect(view.container.querySelector('[class*="shake"]')).toBe(
        view.container.querySelector('[style*="--rig-ratio"]'),
      )
      expect(said()).toBe('The balance needs the same number of balls on each pan.')
      expect(screen.getByText('3 weighings left')).toBeInTheDocument()

      runCue()
      expect(button('Weigh').className).not.toContain('flash')

      // …and the weighing the child works out for themselves still goes.
      fireEvent.click(button('Put ball 4 on a pan'))
      fireEvent.click(button('Weigh'))
      expect(sent).toEqual([{ type: 'weigh', left: [0, 2], right: [1, 3] }])
    })

    it('says the pans are bare when they are', () => {
      const { sent } = mount(withHeavy(level, 2))
      fireEvent.click(button('Weigh'))
      expect(sent).toEqual([])
      expect(said()).toBe('There is nothing on the balance to weigh.')
    })
  })

  it('gives every control a real name and a real button', () => {
    const state = weighed(2, [0, 1], [2, 3])
    mount(state)
    const buttons = Array.from(document.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(5)
    for (const el of buttons) {
      expect(el.getAttribute('type')).toBe('button')
      const name = el.getAttribute('aria-label') ?? el.textContent ?? ''
      expect(name.trim().length).toBeGreaterThan(0)
      expect(el.className).toContain('press')
    }
  })
})
