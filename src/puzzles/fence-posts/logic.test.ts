import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng, shuffled } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel, Rng } from '../../lib/types'
import { fencePosts } from './index'
import { Board } from './Board'
import type { Clash, FenceAction, FenceConfig, FenceState } from './logic'
import {
  ATTEMPTS,
  BACK,
  BLANK,
  EMPTY,
  FORWARD,
  aroundPost,
  blankCount,
  blanksJoined,
  carve,
  clashOf,
  colOf,
  conflicts,
  cornersOf,
  countSolutions,
  deal,
  describeClash,
  describeMove,
  endsOf,
  filledCount,
  fits,
  init,
  isSolved,
  joinsOf,
  layFences,
  legalMoves,
  lineBetween,
  numberPosts,
  onRim,
  openingPosts,
  otherFence,
  overfullPosts,
  parseBoard,
  reduce,
  ringSquares,
  rowOf,
  shortPosts,
  solveByLogic,
  spare,
  tally,
  turn,
  valuesOf,
  wantsPhrase,
} from './logic'
import s from './board.module.css'

const levels = fencePosts.levels as PuzzleLevel<FenceConfig>[]
const start = (level: PuzzleLevel<FenceConfig>, seed: number) => init(level, makeRng(seed))

/** Forty seeds, and the same ones every run. */
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37)
/** The oracle recipe, widened: only the level-1 tapper runs over it. */
const WIDE = Array.from({ length: 400 }, (_, k) => 1000 + k * 37)
/** The sweep the generator is measured with. */
const SWEEP = Array.from({ length: 200 }, (_, i) => 1 + i * 2654435761)
/**
 * How long a test that deals the whole sweep is given. Two hundred six-by-six
 * boards take a second or so on a quiet machine, and a machine running other
 * jobs can stretch that past vitest's five-second default while the generator
 * is doing nothing wrong.
 */
const SWEEP_MS = 20000

/**
 * The boards a level deals over SEEDS and over SWEEP, dealt once for the whole
 * file. A state is never changed in place, so every test can share them.
 */
const dealt = new Map<string, FenceState[]>()
const seeded = (level: PuzzleLevel<FenceConfig>): FenceState[] => {
  let boards = dealt.get(level.id)
  if (!boards) {
    boards = SEEDS.map((seed) => start(level, seed))
    dealt.set(level.id, boards)
  }
  return boards
}
const swept = new Map<string, { clues: number[]; givens: number[] }[]>()
const sweepOf = (level: PuzzleLevel<FenceConfig>) => {
  let boards = swept.get(level.id)
  if (!boards) {
    boards = SWEEP.map((seed) => deal(makeRng(seed), level.config))
    swept.set(level.id, boards)
  }
  return boards
}

/** A board by hand: posts and squares written the way the spares are, entries optional. */
const boardOf = (n: number, posts: string, squares: string, entries?: number[]): FenceState => ({
  n,
  ...parseBoard(n, posts, squares),
  entries: entries ?? new Array<number>(n * n).fill(EMPTY),
})

/** The squares a child has to fill, in reading order. */
const blanksOf = (state: FenceState) =>
  state.givens.map((_, i) => i).filter((i) => state.givens[i] === EMPTY)

/** The one answer, as the solver reasons it out with every ring it likes. */
const answerOf = (state: FenceState): number[] => {
  const read = solveByLogic(state.n, state.clues, state.givens, 99)
  expect(read).not.toBeNull()
  return (read as { grid: number[] }).grid
}

/**
 * `deal`, step for step, keeping the field of fences it laid before it rubbed
 * any of them out. The test that uses it holds it to what `init` deals, board
 * by board, so it cannot drift from `deal`.
 */
function dealLaid(rng: Rng, config: FenceConfig): { clues: number[]; givens: number[]; laid: number[] } {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const laid = layFences(rng, config.n)
    const board = carve(rng, config.n, laid, config.blanks, config.ring)
    if (board !== null && fits(config, board.clues, board.givens)) return { ...board, laid }
  }
  throw new Error('no draw fitted, and the spare has no field of its own')
}

/**
 * Every clause of `fits`, one at a time and by name, so a test can say which
 * one a board fails. A board fits exactly when every one of these is true.
 */
function clausesOf(config: FenceConfig, clues: number[], givens: number[]) {
  const { n, blanks, ring, below, minRounds, maxRounds } = config
  const read = solveByLogic(n, clues, givens, ring)
  return {
    par: givens.filter((v) => v === EMPTY).length === blanks,
    reachable: blanksJoined(n, givens),
    reasoned: read !== null,
    window: read !== null && read.rounds >= minRounds && read.rounds <= maxRounds,
    bothSteps: read !== null && read.full > 0 && read.need > 0,
    rim: openingPosts(n, clues, givens).some((p) => onRim(n, p)),
    floor: below < 0 || solveByLogic(n, clues, givens, below) === null,
  }
}

/** Writes the one answer into every empty square, in order. */
const solutionActions = (state: FenceState): FenceAction[] => {
  const answer = answerOf(state)
  return blanksOf(state).map((index) => ({ type: 'set', index, value: answer[index] }))
}

const play = (state: FenceState, actions: FenceAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

/** A seeded wander through the state graph, used to sample real positions. */
function walk(state: FenceState, seed: number, steps: number): FenceState[] {
  const rng = makeRng(seed)
  const out = [state]
  let cur = state
  for (let k = 0; k < steps; k++) {
    const options = legalMoves(cur)
    cur = reduce(cur, options[Math.floor(rng() * options.length)])
    out.push(cur)
  }
  return out
}

/** A whole board turned by one of the eight turns and flips, posts and squares together. */
function turnBoard(state: FenceState, k: number): { clues: number[]; givens: number[] } {
  const m = state.n + 1
  const clues = new Array<number>(m * m).fill(BLANK)
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < m; c++) {
      let rr = r
      let cc = c
      if (k >= 4) cc = m - 1 - cc
      for (let t = 0; t < k % 4; t++) [rr, cc] = [cc, m - 1 - rr]
      clues[rr * m + cc] = state.clues[r * m + c]
    }
  }
  return { clues, givens: turn(state.n, state.givens, k) }
}

/* --- the two players who reason about nothing ------------------ */

/** Whether a fence would go red. */
type Red = (state: FenceState, index: number, value: number) => boolean

/** What the board really says: a ring, or a post with too many. */
const SHIPPED: Red = (state, index, value) => clashOf(state, index, value) !== null

/** Every fence on the board, with this one put down. */
const withFence = (state: FenceState, index: number, value: number) => {
  const values = valuesOf(state)
  values[index] = value
  return values
}

/** The shipped cue, and a post short of its number with every square round it filled. */
const SHORT: Red = (state, index, value) => {
  if (SHIPPED(state, index, value)) return true
  const values = withFence(state, index, value)
  return cornersOf(state.n, index).some((p) => {
    if (state.clues[p] === BLANK) return false
    const { on, open } = tally(state.n, values, p)
    return open === 0 && on < state.clues[p]
  })
}

/** The shipped cue, and a post that can no longer reach its number. */
const DEAD: Red = (state, index, value) => {
  if (SHIPPED(state, index, value)) return true
  const values = withFence(state, index, value)
  return cornersOf(state.n, index).some((p) => {
    if (state.clues[p] === BLANK) return false
    const { on, open } = tally(state.n, values, p)
    return on + open < state.clues[p]
  })
}

/**
 * The tapper: walk the empty squares in a shuffled order, toss a coin for a
 * fence in each, and put the other one whenever the coin's would go red. It
 * never goes back and keeps one fence a square.
 */
function tap(state: FenceState, rng: Rng): { end: FenceState; reds: number } {
  let cur = state
  let reds = 0
  for (const index of shuffled(rng, blanksOf(state))) {
    let value = rng() < 0.5 ? BACK : FORWARD
    if (SHIPPED(cur, index, value)) {
      reds++
      value = otherFence(value)
    }
    cur = reduce(cur, { type: 'set', index, value })
  }
  return { end: cur, reds }
}

/**
 * The prober: sweep every square again and again, in a shuffled order, and
 * keep a fence only when the other one goes red. It stops when a sweep keeps
 * nothing, so it ends solved exactly when the cue alone can finish the board.
 */
function probe(state: FenceState, rng: Rng, red: Red): FenceState {
  let cur = state
  for (;;) {
    let kept = 0
    for (const index of shuffled(rng, cur.givens.map((_, k) => k))) {
      if (cur.givens[index] !== EMPTY || cur.entries[index] !== EMPTY) continue
      if (red(cur, index, BACK)) {
        cur = reduce(cur, { type: 'set', index, value: FORWARD })
        kept++
      } else if (red(cur, index, FORWARD)) {
        cur = reduce(cur, { type: 'set', index, value: BACK })
        kept++
      }
    }
    if (kept === 0) return cur
  }
}

afterEach(cleanup)

describe('the rules', () => {
  it('joins the two posts at the ends of each fence', () => {
    // Four squares a side, so five posts a row. The corner square and the
    // square diagonally in from it.
    expect(endsOf(4, 0, BACK)).toEqual([0, 6])
    expect(endsOf(4, 0, FORWARD)).toEqual([1, 5])
    expect(endsOf(4, 5, BACK)).toEqual([6, 12])
    expect(endsOf(4, 5, FORWARD)).toEqual([7, 11])
    // And both fences touch the four corners between them, once each.
    for (const square of [0, 5, 15]) {
      const touched = [...endsOf(4, square, BACK), ...endsOf(4, square, FORWARD)].sort((a, b) => a - b)
      expect(touched).toEqual(cornersOf(4, square).slice().sort((a, b) => a - b))
    }
  })

  it('lists the squares round a post with the fence that touches it: one at a corner, two on an edge, four inside', () => {
    expect(aroundPost(4, 0)).toEqual([{ square: 0, touch: BACK }])
    expect(aroundPost(4, 2)).toEqual([
      { square: 1, touch: FORWARD },
      { square: 2, touch: BACK },
    ])
    expect(aroundPost(4, 6)).toEqual([
      { square: 0, touch: BACK },
      { square: 1, touch: FORWARD },
      { square: 4, touch: FORWARD },
      { square: 5, touch: BACK },
    ])
    // Every post of a board, and every square round it: the fence named is the
    // one that touches the post, and the other one does not.
    for (let post = 0; post < 25; post++) {
      const round = aroundPost(4, post)
      expect(round).toHaveLength(onRim(4, post) ? ([0, 4, 20, 24].includes(post) ? 1 : 2) : 4)
      for (const { square, touch } of round) {
        expect(endsOf(4, square, touch)).toContain(post)
        expect(endsOf(4, square, otherFence(touch))).not.toContain(post)
      }
    }
  })

  it('counts the fences touching a post, and the squares round it still empty', () => {
    // Round the post in the middle of a two by two: one fence touches it, one
    // misses it, and two squares are still empty.
    const grid = [BACK, BACK, EMPTY, EMPTY]
    expect(tally(2, grid, 4)).toEqual({ on: 1, open: 2 })
    expect(tally(2, grid, 1)).toEqual({ on: 1, open: 0 })
    expect(tally(2, grid, 8)).toEqual({ on: 0, open: 1 })
  })

  it('finds a closed ring, and the line of fences that would close one', () => {
    // The diamond round the post at row 1, column 1 of a four by four: every
    // fence round it misses it, so they join up with each other instead.
    const diamond = new Array<number>(16).fill(EMPTY)
    diamond[0] = FORWARD
    diamond[1] = BACK
    diamond[4] = BACK
    diamond[5] = FORWARD
    expect(joinsOf(4, diamond)).toBeNull()
    expect([...ringSquares(4, diamond)].sort((a, b) => a - b)).toEqual([0, 1, 4, 5])

    // Three of them down, and the fourth square's '/' would run from post 7 to
    // post 11, which the other three already join.
    const three = diamond.slice()
    three[5] = EMPTY
    expect(joinsOf(4, three)).not.toBeNull()
    expect(ringSquares(4, three).size).toBe(0)
    expect(endsOf(4, 5, FORWARD)).toEqual([7, 11])
    expect(lineBetween(4, three, 7, 11)).toEqual([1, 0, 4])
    expect(lineBetween(4, three, 7, 24)).toBeNull()
  })

  it('never numbers an inside post 0, because four fences missing one post make a ring', () => {
    let inside = 0
    for (const n of [4, 5, 6]) {
      const rng = makeRng(n * 101)
      for (let k = 0; k < 500; k++) {
        const clues = numberPosts(n, layFences(rng, n))
        clues.forEach((value, post) => {
          if (onRim(n, post)) return
          inside++
          expect(value).toBeGreaterThan(0)
        })
      }
    }
    expect(inside).toBe(500 * (9 + 16 + 25))
  })

  it('names what a number asks for one way', () => {
    expect(wantsPhrase(0)).toBe('no fences')
    expect(wantsPhrase(1)).toBe('1 fence')
    expect(wantsPhrase(3)).toBe('3 fences')
  })
})

describe('the boards a child is dealt', () => {
  for (const level of levels) {
    const { n, blanks } = level.config

    it(`"${level.label}" deals 200 boards, every one with exactly one answer`, () => {
      for (const { clues, givens } of sweepOf(level)) {
        expect(countSolutions(n, clues, givens, 2)).toBe(1)
      }
    }, SWEEP_MS)

    it(`"${level.label}" deals boards its own solver finishes, inside its own window`, () => {
      // The whole sweep rather than the short list of seeds, because this is
      // also the check on `deal`'s last resort: a board that `fits` is one of
      // exactly the right size, finished by this level's solver and not the
      // level below's, with every step its hints name and a way in at the rim.
      for (const { clues, givens } of sweepOf(level)) {
        expect(fits(level.config, clues, givens)).toBe(true)
      }
    }, SWEEP_MS)

    it(`"${level.label}" leaves exactly par (${level.par}) squares empty, and every one of them in reach of the keyboard`, () => {
      for (const { givens } of sweepOf(level)) {
        expect(givens.filter((v) => v === EMPTY)).toHaveLength(blanks)
        expect(blanksJoined(n, givens)).toBe(true)
      }
    }, SWEEP_MS)

    it(`"${level.label}" prints only the fences and the numbers of the field it laid, and that field is the one answer`, () => {
      // Checked against the field `deal` laid before it rubbed anything out,
      // not against the solver's answer: the solver starts from the printed
      // fences, so its answer agrees with them whatever they are.
      SEEDS.forEach((seed, k) => {
        const { clues, givens, laid } = dealLaid(makeRng(seed), level.config)
        expect({ clues, givens }).toEqual({ clues: seeded(level)[k].clues, givens: seeded(level)[k].givens })
        const numbers = numberPosts(n, laid)
        givens.forEach((given, i) => {
          if (given !== EMPTY) expect(given).toBe(laid[i])
        })
        clues.forEach((clue, p) => {
          if (clue !== BLANK) expect(clue).toBe(numbers[p])
        })
        expect(solveByLogic(n, clues, givens, 99)?.grid).toEqual(laid)
      })
    })
  }

  it('deals a board for every level inside a blink', () => {
    // The last level asks the most — seven passes, and a ring round more than
    // one post — and it takes about four draws to find one. Measured at 0.5,
    // 1.1 and 2.9ms for this seed.
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })

  it('lays whole fields of fences with no ring in them, half of each kind', () => {
    // Laid in reading order, '\' can never close a ring, so the walk is total;
    // and the turn afterwards takes back the lean that gives it towards '\'.
    for (const n of [4, 5, 6]) {
      const rng = makeRng(n * 7)
      let back = 0
      for (let k = 0; k < 300; k++) {
        const field = layFences(rng, n)
        expect(field.every((v) => v === BACK || v === FORWARD)).toBe(true)
        expect(joinsOf(n, field)).not.toBeNull()
        back += field.filter((v) => v === BACK).length
      }
      const share = back / (300 * n * n)
      expect(share).toBeGreaterThan(0.46)
      expect(share).toBeLessThan(0.54)
    }
  })

  it('turns and flips a field into another field with no ring', () => {
    const rng = makeRng(33)
    for (const n of [4, 5, 6]) {
      for (let k = 0; k < 20; k++) {
        const field = layFences(rng, n)
        expect(turn(n, field, 0)).toEqual(field)
        // Four quarter turns go all the way round, and a flip done twice is none.
        let round = field
        for (let t = 0; t < 4; t++) round = turn(n, round, 1)
        expect(round).toEqual(field)
        expect(turn(n, turn(n, field, 4), 4)).toEqual(field)
        for (let t = 0; t < 8; t++) {
          const turned = turn(n, field, t)
          expect(turned.every((v) => v === BACK || v === FORWARD)).toBe(true)
          expect(joinsOf(n, turned)).not.toBeNull()
        }
      }
    }
  })

  it('keeps a spare for every level that fits the level, with one answer and exactly par squares empty', () => {
    for (const level of levels) {
      const { n } = level.config
      const { clues, givens } = spare(level.config)
      expect(fits(level.config, clues, givens)).toBe(true)
      expect(countSolutions(n, clues, givens, 2)).toBe(1)
      // Said outright as well as through `fits`: par's floor stands on it.
      expect(givens.filter((v) => v === EMPTY)).toHaveLength(level.par as number)
    }
  })

  it('turns away a board that fails any one of its clauses', () => {
    // Three four-by-four boards, each good in every way but one. The first is
    // the spare with one more of its answer's fences printed, so it leaves 9
    // squares for a par of 10. The second was laid and carved on the stream
    // makeRng(1000 + 348 * 37), and every post that opens it is inside: the
    // first hint would send a child to the edge for nothing. The third is the
    // board init dealt for makeRng(456 * 7919 + 13) before the keyboard
    // clause: the empty square in row 2, column 2 is the only one in its row
    // and in its column, and no arrow key can reach it.
    const four = levels[0].config
    const every = { par: true, reachable: true, reasoned: true, window: true, bothSteps: true, rim: true, floor: true }
    const boards: [keyof typeof every, { clues: number[]; givens: number[] }][] = [
      ['par', parseBoard(4, '..... ..1.. 2...1 ..41. .1..1', String.raw`//\\ //.. ../. ....`)],
      ['rim', parseBoard(4, '..... 1.1.. .1.2. .1.2. .....', String.raw`../\ .\/\ /... ....`)],
      ['reachable', parseBoard(4, '..0.0 .2... .2.3. 1..11 .....', String.raw`.\.. \.// ./.. ./..`)],
    ]
    for (const [clause, { clues, givens }] of boards) {
      expect(clausesOf(four, clues, givens), clause).toEqual({ ...every, [clause]: false })
      expect(countSolutions(4, clues, givens, 2), clause).toBe(1)
      expect(fits(four, clues, givens), clause).toBe(false)
    }
    // And a board that `fits` passes every clause, so the list is the whole of it.
    for (const level of levels) {
      const { clues, givens } = spare(level.config)
      expect(Object.values(clausesOf(level.config, clues, givens)).every(Boolean)).toBe(true)
    }
  })

  it('joins the empty squares through the rows and the columns they share', () => {
    // Two empty squares in one row are joined, whatever is printed between
    // them; so are two in one column; and a square alone in both is not.
    // Which fence is printed does not matter here, only where.
    const joined = (squares: string) => blanksJoined(3, parseBoard(3, '.... .... .... ....', squares).givens)
    expect(joined('./. /// ///')).toBe(true)
    expect(joined('.// /// .//')).toBe(true)
    expect(joined('.// /// //.')).toBe(false)
    // Joined through a third square that shares a row with one and a column
    // with the other.
    expect(joined('./. /// //.')).toBe(true)
  })

  it('hands over the spare when no draw fits', () => {
    // No board is ever 99 passes long, so all four hundred draws miss.
    const four = levels[0].config
    expect(deal(makeRng(1), { ...four, minRounds: 99, maxRounds: 99 })).toEqual(spare(four))
  })
})

describe('the solver', () => {
  it('agrees with a plain exhaustive count', () => {
    // Three by three, nothing printed, and each number kept on a coin: every
    // one of the 512 fillings is tried, and the ones with no ring that match
    // every number left are counted.
    let unique = 0
    let loose = 0
    for (let k = 0; k < 200; k++) {
      const rng = makeRng(77 + k)
      const full = numberPosts(3, layFences(rng, 3))
      const clues = full.map((v) => (rng() < 0.5 ? v : BLANK))
      const empty = new Array<number>(9).fill(EMPTY)
      let brute = 0
      for (let mask = 0; mask < 1 << 9; mask++) {
        const grid = Array.from({ length: 9 }, (_, i) => ((mask >> i) & 1 ? FORWARD : BACK))
        if (joinsOf(3, grid) === null) continue
        const numbers = numberPosts(3, grid)
        if (clues.every((c, p) => c === BLANK || c === numbers[p])) brute++
      }
      expect(countSolutions(3, clues, empty, 1 << 20)).toBe(brute)
      if (solveByLogic(3, clues, empty, 99) !== null) {
        expect(brute).toBe(1)
        unique++
      }
      if (brute > 1) loose++
    }
    // Both kinds of board were really met, so neither half of this is vacuous.
    expect(unique).toBeGreaterThan(0)
    expect(loose).toBeGreaterThan(0)
  })

  it('finds the answer the board was built round', () => {
    const rng = makeRng(2024)
    let found = 0
    for (const level of levels) {
      const { n, blanks, ring } = level.config
      for (let k = 0; k < 20; k++) {
        const answer = layFences(rng, n)
        const board = carve(rng, n, answer, blanks, ring)
        if (board === null) continue
        found++
        expect(solveByLogic(n, board.clues, board.givens, ring)?.grid).toEqual(answer)
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('never finishes a board that has no answer', () => {
    // A two by two whose numbers cannot all be met. Every other board this
    // file hands the solver was built round an answer, so only a board like
    // this one needs its check for a post that can no longer reach its
    // number. Without that check the solver fills this board in and calls it
    // done, and "a board it finishes has exactly one answer" stops being true.
    const none = boardOf(2, '.2. 221 ...', '....')
    expect(countSolutions(2, none.clues, none.givens, 5)).toBe(0)
    for (const maxRing of [0, 4, 99]) expect(solveByLogic(2, none.clues, none.givens, maxRing)).toBeNull()
  })

  it('gives up rather than guessing', () => {
    // A two by two with nothing on it: sixteen fillings, and only the diamond
    // round the middle post is a ring, so there are fifteen answers and not
    // one fence that can be argued for.
    const clues = new Array<number>(9).fill(BLANK)
    const givens = new Array<number>(4).fill(EMPTY)
    expect(solveByLogic(2, clues, givens, 99)).toBeNull()
    expect(countSolutions(2, clues, givens, 1 << 20)).toBe(15)
  })

  it('turns rings down that are bigger than it is allowed to see', () => {
    for (const state of seeded(levels[2]).slice(0, 10)) {
      expect(solveByLogic(state.n, state.clues, state.givens, 4)).toBeNull()
      expect(solveByLogic(state.n, state.clues, state.givens, 8)).not.toBeNull()
    }
  })

  it('reads every pass off the board as it stood, so a turned board reads the same', () => {
    // Twenty boards a level, turned and flipped all eight ways. A pass that
    // read the fences it had just written would give different counts for a
    // board and its mirror image, and `fits` would depend on the order the
    // posts happen to be numbered in.
    let same = 0
    for (const level of levels) {
      const { n, ring } = level.config
      for (let k = 0; k < 20; k++) {
        const state = start(level, 500 + k)
        const base = solveByLogic(n, state.clues, state.givens, ring)
        expect(base).not.toBeNull()
        if (base === null) continue
        for (let t = 0; t < 8; t++) {
          const { clues, givens } = turnBoard(state, t)
          const read = solveByLogic(n, clues, givens, ring)
          expect(read).not.toBeNull()
          if (read === null) continue
          expect([read.rounds, read.full, read.need, read.ring]).toEqual([
            base.rounds,
            base.full,
            base.need,
            base.ring,
          ])
          expect(read.ringSizes.slice().sort()).toEqual(base.ringSizes.slice().sort())
          expect(read.grid).toEqual(turn(n, base.grid, t))
          same++
        }
      }
    }
    expect(same).toBe(480)
  })
})

describe('init', () => {
  for (const level of levels) {
    it(`"${level.label}" starts with exactly par (${level.par}) squares to fill, on every seed`, () => {
      for (const state of seeded(level)) {
        expect(state.n).toBe(level.config.n)
        expect(state.entries.every((v) => v === EMPTY)).toBe(true)
        expect(blankCount(state)).toBe(level.par)
        expect(filledCount(state)).toBe(level.config.n ** 2 - (level.par as number))
        expect(isSolved(state)).toBe(false)
      }
    })

    it(`"${level.label}" gives the same seed the same board, and different seeds different ones`, () => {
      const again = start(level, 77)
      expect(start(level, 77)).toEqual(again)
      const keys = new Set(seeded(level).map((state) => `${state.clues.join()}|${state.givens.join()}`))
      expect(keys.size).toBeGreaterThanOrEqual(SEEDS.length * 0.9)
    })
  }
})

describe('reduce', () => {
  for (const level of levels) {
    it(`"${level.label}" returns the identical state for every action that changes nothing`, () => {
      const state = start(level, 99)
      const given = state.givens.findIndex((v) => v !== EMPTY)
      const blank = state.givens.indexOf(EMPTY)
      const last = state.n * state.n - 1

      const noOps: [string, FenceAction][] = [
        ['another action type', { type: 'toggle' } as unknown as FenceAction],
        ['null', null as unknown as FenceAction],
        ['no action at all', undefined as unknown as FenceAction],
        ['a fence over a printed one', { type: 'set', index: given, value: otherFence(state.givens[given]) }],
        ['the printed fence again', { type: 'set', index: given, value: state.givens[given] }],
        ['rubbing out a printed fence', { type: 'set', index: given, value: EMPTY }],
        ['rubbing out a square that is already empty', { type: 'set', index: blank, value: EMPTY }],
        ['an index before the grid', { type: 'set', index: -1, value: BACK }],
        ['an index past the grid', { type: 'set', index: last + 1, value: BACK }],
        ['a fractional index', { type: 'set', index: 1.5, value: BACK }],
        ['an index that is NaN', { type: 'set', index: NaN, value: BACK }],
        ['a value that is not a fence', { type: 'set', index: blank, value: 3 }],
        ['a negative value', { type: 'set', index: blank, value: -1 }],
        ['a fractional value', { type: 'set', index: blank, value: 1.5 }],
      ]
      for (const [what, action] of noOps) {
        // toBe, not toEqual: a fresh but equal object would pollute the move tape.
        expect(reduce(state, action), what).toBe(state)
      }

      const written = reduce(state, { type: 'set', index: blank, value: FORWARD })
      expect(written).not.toBe(state)
      expect(reduce(written, { type: 'set', index: blank, value: FORWARD }), 'the same fence again').toBe(
        written,
      )
    })

    it(`"${level.label}" leaves the state it was handed exactly as it found it`, () => {
      const state = start(level, 12)
      const entriesBefore = state.entries.slice()
      const givensBefore = state.givens.slice()
      const blank = state.givens.indexOf(EMPTY)
      const next = reduce(state, { type: 'set', index: blank, value: BACK })
      expect(state.entries).toEqual(entriesBefore)
      expect(state.givens).toEqual(givensBefore)
      // A fresh entries array, so the previous state in the move tape is safe;
      // and the parts that never change are passed along as they are.
      expect(next.entries).not.toBe(state.entries)
      expect(next.givens).toBe(state.givens)
      expect(next.clues).toBe(state.clues)
      expect(next.entries[blank]).toBe(BACK)
      expect(reduce(next, { type: 'set', index: blank, value: EMPTY }).entries[blank]).toBe(EMPTY)
    })

    it(`"${level.label}" changes exactly one square, and never a printed one`, () => {
      // The whole floor under par rests on this, so check it over every action
      // from every state on a real wander, not just from the start.
      for (const state of walk(start(level, 5), 5, 30)) {
        for (const action of legalMoves(state)) {
          const next = reduce(state, action)
          expect(next).not.toBe(state)
          expect(next.givens).toBe(state.givens)
          const moved = next.entries
            .map((v, i) => (v === state.entries[i] ? -1 : i))
            .filter((i) => i >= 0)
          expect(moved).toEqual([action.index])
          expect(state.givens[action.index]).toBe(EMPTY)
          expect(filledCount(next) - filledCount(state)).toBeLessThanOrEqual(1)
        }
      }
    })

    it(`"${level.label}" has legalMoves that are exactly the actions that change something`, () => {
      // If legalMoves hid a move, the search that proves par would be wrong.
      for (const state of walk(start(level, 17), 17, 12)) {
        const listed = new Set(legalMoves(state).map((a) => `${a.index}:${a.value}`))
        for (let index = 0; index < state.n * state.n; index++) {
          for (const value of [EMPTY, BACK, FORWARD]) {
            const changes = reduce(state, { type: 'set', index, value }) !== state
            expect(listed.has(`${index}:${value}`), `${index}:${value}`).toBe(changes)
          }
        }
      }
    })

    it(`"${level.label}" lets a fence go down where it breaks a rule, and flags it afterwards`, () => {
      // A wrong fence is a wrong answer, not a forbidden move: it lands, and
      // the board says so over the top of it.
      const state = start(level, 8)
      const answer = answerOf(state)
      const index = blanksOf(state).find((i) => clashOf(state, i, otherFence(answer[i])) !== null)
      expect(index).toBeDefined()
      const at = index as number
      const next = reduce(state, { type: 'set', index: at, value: otherFence(answer[at]) })
      expect(next).not.toBe(state)
      expect(conflicts(next).squares[at]).toBe(true)
      expect(isSolved(next)).toBe(false)
    })
  }
})

describe('par', () => {
  /*
   * Par is the count of empty squares, and the tests below are the whole
   * proof of it.
   *
   * The floor: `isSolved` wants every square filled; the start has exactly
   * par of them empty — `carve` rubs out exactly that many, `fits` checks it,
   * and the spare is held to it; and "changes exactly one square" above shows
   * that one move fills at most one of them. So no run of fewer than par moves
   * can finish a board, whatever order the moves come in and whichever fences
   * they put down.
   *
   * The ceiling: writing the one answer — the solver finds it and there is
   * only one — into each empty square once is par moves long and ends solved.
   *
   * Four by four is small enough to check the argument itself by breadth-first
   * search, with nothing pruned. Ten empty squares with three values each is
   * 3^10 = 59,049 positions, every one of them reachable, and all of them fit
   * under the search's own cap of 200,000 on every seed. The search leans on
   * no argument about which positions a shortest path avoids. Five by five
   * does not fit: it passes 200,000 distinct positions on seeds 5, 61 and 907,
   * so the top two levels rest on the argument above, as suns and moons'
   * bigger boards do.
   */
  for (const level of levels) {
    it(`"${level.label}" cannot be finished in fewer than par (${level.par}) moves`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        expect(blankCount(first)).toBe(level.par)
        expect(isSolved(first)).toBe(false)
        for (const state of walk(first, seed, 24)) {
          if (blankCount(state) > 0) expect(isSolved(state)).toBe(false)
        }
      }
    })

    it(`"${level.label}" is finished in exactly par (${level.par}) moves, and not before`, () => {
      for (const seed of [5, 61, 907]) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        let state = first
        for (const action of actions) {
          expect(isSolved(state)).toBe(false)
          const next = reduce(state, action)
          expect(next).not.toBe(state)
          state = next
        }
        expect(isSolved(state)).toBe(true)
        const { squares, posts } = conflicts(state)
        expect(squares.some(Boolean)).toBe(false)
        expect(posts.some(Boolean)).toBe(false)
      }
    })
  }

  it('"Four by four" has no shorter path than par, over every position the level has', () => {
    // Measured at 58,967 and 58,917 distinct positions before the first
    // finished board turns up, out of the 59,049 there are: the search walks
    // nearly all of them, the ones that break a rule included.
    const seen: number[] = []
    for (const seed of [61, 907]) {
      const keys = new Set<string>()
      const path = shortestSolution<FenceState, FenceAction>({
        start: start(levels[0], seed),
        moves: legalMoves,
        apply: reduce,
        key: (state) => {
          const key = state.entries.join('')
          keys.add(key)
          return key
        },
        solved: isSolved,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(levels[0].par as number)
      seen.push(keys.size)
    }
    expect(seen).toEqual([58967, 58917])
  }, 30000)
})

describe('isSolved and conflicts', () => {
  /**
   * A two by two with every post numbered: the answer is '\' '\' over '/' '\',
   * which joins posts 0-4, 1-5, 4-6 and 4-8 and closes nothing.
   */
  const answer = [BACK, BACK, FORWARD, BACK]
  const numbered = boardOf(2, '110 031 101', '....')

  it('wants every square filled, no ring, and every number right', () => {
    expect(numberPosts(2, answer)).toEqual(numbered.clues)
    expect(isSolved({ ...numbered, entries: answer })).toBe(true)
    // One square empty, and everything else right: still not solved.
    expect(isSolved({ ...numbered, entries: [BACK, BACK, FORWARD, EMPTY] })).toBe(false)
    // Every square filled, and the middle post has one fence too many.
    expect(isSolved({ ...numbered, entries: [BACK, FORWARD, FORWARD, BACK] })).toBe(false)
  })

  it('calls a full board unsolved when a post is short, and flags nothing', () => {
    // Four '/' fences, and the corner post that wants one has none.
    const short = boardOf(2, '1.. ... ...', '....', [FORWARD, FORWARD, FORWARD, FORWARD])
    expect(blankCount(short)).toBe(0)
    expect(isSolved(short)).toBe(false)
    expect(shortPosts(short)).toBe(1)
    const { squares, posts } = conflicts(short)
    expect(squares.some(Boolean)).toBe(false)
    expect(posts.some(Boolean)).toBe(false)
  })

  it('calls a full board unsolved when every number is right but the fences make a ring, and flags only the player’s fences on it', () => {
    // A real five-by-five board, and every one of the 2^16 ways to fill it.
    // Exactly one of them puts every number right and still holds a ring —
    // the answer with one fence turned — so a solved check that forgot the
    // ring would call it finished. Deleting the ring check from isSolved fails
    // this test.
    const state = start(levels[1], 5)
    const blanks = blanksOf(state)
    const truth = answerOf(state)
    const decoys: number[][] = []
    for (let mask = 0; mask < 1 << blanks.length; mask++) {
      const entries = new Array<number>(25).fill(EMPTY)
      blanks.forEach((square, k) => {
        entries[square] = (mask >> k) & 1 ? FORWARD : BACK
      })
      const fill = { ...state, entries }
      if (shortPosts(fill) !== 0 || overfullPosts(fill).some(Boolean)) continue
      if (joinsOf(5, valuesOf(fill)) !== null) continue
      decoys.push(entries)
    }
    expect(decoys).toHaveLength(1)
    const expected = new Array<number>(25).fill(EMPTY)
    for (const square of blanks) expected[square] = truth[square]
    expected[7] = BACK
    expect(truth[7]).toBe(FORWARD)
    expect(decoys[0]).toEqual(expected)

    const decoy = { ...state, entries: decoys[0] }
    expect(isSolved(decoy)).toBe(false)
    const ring = [...ringSquares(5, valuesOf(decoy))].sort((a, b) => a - b)
    expect(ring).toEqual([6, 7, 11, 12])
    expect(ring.filter((i) => state.givens[i] !== EMPTY)).toEqual([6, 11])
    const { squares, posts, ring: onRing } = conflicts(decoy)
    expect(squares.map((flag, i) => (flag ? i : -1)).filter((i) => i >= 0)).toEqual([7, 12])
    expect(posts.some(Boolean)).toBe(false)
    // Where the rule is broken is the whole ring, the printed 6 and 11 too.
    expect(onRing.map((flag, i) => (flag ? i : -1)).filter((i) => i >= 0)).toEqual([6, 7, 11, 12])
  })

  it('flags a post with too many fences, and the player’s fences touching it', () => {
    // The post at the top wants 1 and has the printed '/' and a '\'; the post
    // at bottom left wants none and has a '/'.
    const state = boardOf(2, '.1. ..2 0..', '/. ..', [EMPTY, BACK, FORWARD, EMPTY])
    const { squares, posts } = conflicts(state)
    expect(squares).toEqual([false, true, true, false])
    expect(posts.map((flag, p) => (flag ? p : -1)).filter((p) => p >= 0)).toEqual([1, 6])
    // The printed fence touches the post that has too many, and it is still
    // never flagged: it is right by construction.
    expect(endsOf(2, 0, FORWARD)).toContain(1)
    expect(squares[0]).toBe(false)
  })

  it('never flags a short post, even with every square round it filled', () => {
    const state = boardOf(2, '1.. ... ...', '....', [FORWARD, EMPTY, EMPTY, EMPTY])
    expect(tally(2, valuesOf(state), 0)).toEqual({ on: 0, open: 0 })
    const { squares, posts } = conflicts(state)
    expect(squares.some(Boolean)).toBe(false)
    expect(posts.some(Boolean)).toBe(false)
    expect(shortPosts(state)).toBe(1)
  })

  it('stops blaming anything the moment the fence comes out', () => {
    const state = boardOf(2, '.1. ..2 0..', '/. ..', [EMPTY, BACK, EMPTY, EMPTY])
    expect(conflicts(state).squares[1]).toBe(true)
    const rubbed = reduce(state, { type: 'set', index: 1, value: EMPTY })
    expect(conflicts(rubbed).squares.some(Boolean)).toBe(false)
    expect(conflicts(rubbed).posts.some(Boolean)).toBe(false)
  })

  it('says a full board that breaks no rule and is not solved always has a short post', () => {
    // The board's own line leans on this: with every square filled and
    // nothing red, it counts the short posts, and it must never count none.
    let checked = 0
    for (const level of levels) {
      for (const seed of [3, 4, 5]) {
        const rng = makeRng(seed * 13)
        for (const state of walk(start(level, seed), seed, 30)) {
          const entries = state.entries.map((v, i) =>
            state.givens[i] !== EMPTY || v !== EMPTY ? v : rng() < 0.5 ? BACK : FORWARD,
          )
          const full = { ...state, entries }
          expect(blankCount(full)).toBe(0)
          const { squares, posts } = conflicts(full)
          if (squares.some(Boolean) || posts.some(Boolean) || isSolved(full)) continue
          expect(shortPosts(full)).toBeGreaterThanOrEqual(1)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('the clash a fence makes', () => {
  it('says the fences make a closed ring, lights the whole ring and shakes every fence on it', () => {
    // Three sides of the diamond round the middle post of a two by two, and
    // the fourth closes it.
    const state = boardOf(2, '... ... ...', '....', [FORWARD, BACK, BACK, EMPTY])
    const clash = clashOf(state, 3, FORWARD) as Clash
    expect(clash.kind).toBe('ring')
    expect(clash.squares).toEqual([0, 1, 2, 3])
    expect(clash.blamed).toEqual([0, 1, 2, 3])
    expect(clash.post).toBe(-1)
    expect(describeClash(clash)).toBe('These fences make a closed ring.')
    // The other fence goes into the post instead, and closes nothing.
    expect(clashOf(state, 3, BACK)).toBeNull()
  })

  it('blames the whole ring when a right fence closes a ring that a wrong one began', () => {
    // The answer everywhere, except that square 7 holds '\' where the answer
    // has '/', and square 12 is still empty. Nothing is red yet. Then the
    // answer's own '/' goes into square 12, and closes a ring the wrong fence
    // began: the fence just put down is the right one, and it is the whole
    // ring that is blamed — the wrong 7 in it, and the printed 6 and 11.
    const first = start(levels[1], 5)
    const truth = answerOf(first)
    const entries = new Array<number>(25).fill(EMPTY)
    for (const square of blanksOf(first)) entries[square] = truth[square]
    entries[7] = BACK
    entries[12] = EMPTY
    const state = { ...first, entries }
    expect(truth[7]).toBe(FORWARD)
    expect(truth[12]).toBe(FORWARD)
    expect(conflicts(state).squares.some(Boolean)).toBe(false)

    const clash = clashOf(state, 12, FORWARD) as Clash
    expect(clash.kind).toBe('ring')
    expect(clash.squares).toEqual([6, 7, 11, 12])
    expect(clash.blamed).toEqual([6, 7, 11, 12])
    expect([6, 11].every((i) => first.givens[i] !== EMPTY)).toBe(true)

    const after = conflicts(reduce(state, { type: 'set', index: 12, value: FORWARD }))
    expect(after.squares.map((flag, i) => (flag ? i : -1)).filter((i) => i >= 0)).toEqual([7, 12])
  })

  it('says a post has too many, lights the squares round it and shakes every fence touching it, printed ones too', () => {
    const state = boardOf(2, '.1. ..2 0..', '/. ..')
    expect(clashOf(state, 1, BACK)).toEqual({
      kind: 'over',
      squares: [0, 1],
      blamed: [0, 1],
      post: 1,
      wanted: 1,
      got: 2,
    })
    expect(describeClash(clashOf(state, 1, BACK) as Clash)).toBe('This post wants 1 fence and now has 2.')
  })

  it('reports the ring first when a fence breaks both rules at once', () => {
    // The fourth side of the diamond also puts a second fence on a post that
    // wants one. Two lit groups at once would say nothing about either.
    const state = boardOf(2, '.1. ... ...', '....', [FORWARD, EMPTY, BACK, FORWARD])
    const clash = clashOf(state, 1, BACK) as Clash
    expect(overfullPosts(reduce(state, { type: 'set', index: 1, value: BACK }))[1]).toBe(true)
    expect(clash.kind).toBe('ring')
    expect(clash.squares).toEqual([0, 1, 2, 3])
  })

  it('puts the broken rule in one sentence, with the grammar to match', () => {
    const over = (wanted: number, got: number): Clash => ({
      kind: 'over',
      squares: [],
      blamed: [],
      post: 0,
      wanted,
      got,
    })
    expect(describeClash(over(0, 1))).toBe('This post wants no fences and now has 1.')
    expect(describeClash(over(1, 2))).toBe('This post wants 1 fence and now has 2.')
    expect(describeClash(over(2, 3))).toBe('This post wants 2 fences and now has 3.')
  })

  it('is null for a square that takes the fence, and for a printed square', () => {
    const state = boardOf(2, '.1. ..2 0..', '/. ..')
    expect(clashOf(state, 1, FORWARD)).toBeNull()
    expect(clashOf(state, 2, BACK)).toBeNull()
    expect(clashOf(state, 2, FORWARD)).not.toBeNull()
    expect(clashOf(state, 0, BACK)).toBeNull()
    expect(clashOf(state, 1, EMPTY)).toBeNull()
  })

  it('fires exactly when the fence it puts down is flagged afterwards, and blames a group that holds a wrong fence', () => {
    // Every fence that could go down, from sixty positions walked on each of
    // three five-by-five boards. The answer has no ring and fills every post
    // exactly, and a printed fence is the answer's own, so a lit ring or a
    // post with too many always holds a fence of the child's that is wrong —
    // though not always the one just put down.
    let moves = 0
    let red = 0
    for (const seed of [1, 2, 3]) {
      const first = start(levels[1], seed)
      const truth = answerOf(first)
      for (const state of walk(first, seed * 9, 59)) {
        for (const action of legalMoves(state)) {
          if (action.value === EMPTY) continue
          moves++
          const clash = clashOf(state, action.index, action.value)
          const next = reduce(state, action)
          const flagged = conflicts(next).squares[action.index]
          expect(clash !== null).toBe(flagged)
          if (clash === null) continue
          red++
          const values = valuesOf(next)
          if (clash.kind === 'ring') {
            expect(clash.blamed).toEqual(clash.squares)
            expect(clash.blamed).toContain(action.index)
            const onRing = ringSquares(5, values)
            for (const square of clash.blamed) expect(onRing.has(square)).toBe(true)
          } else {
            const touching = aroundPost(5, clash.post)
              .filter(({ square, touch }) => values[square] === touch)
              .map(({ square }) => square)
            expect(clash.blamed.slice().sort((a, b) => a - b)).toEqual(touching.sort((a, b) => a - b))
            expect(clash.got).toBe(touching.length)
            expect(clash.got).toBeGreaterThan(clash.wanted)
          }
          expect(clash.blamed.some((i) => first.givens[i] === EMPTY && values[i] !== truth[i])).toBe(true)
        }
      }
    }
    expect([moves, red]).toEqual([4389, 961])
  })

  it('hands out arrays of its own', () => {
    const ring = clashOf(boardOf(2, '... ... ...', '....', [FORWARD, BACK, BACK, EMPTY]), 3, FORWARD) as Clash
    const over = clashOf(boardOf(2, '.1. ..2 0..', '/. ..'), 1, BACK) as Clash
    for (const clash of [ring, over]) {
      expect(clash.blamed).not.toBe(clash.squares)
      const squares = clash.squares.slice()
      clash.blamed.sort((a, b) => b - a)
      expect(clash.squares).toEqual(squares)
    }
  })
})

describe('a dead end', () => {
  it('is not a thing this puzzle has, and that is on purpose', () => {
    // A wrong fence is changed or rubbed out, never stepped back from, exactly
    // as in the small square and suns and moons. So there is no failure(), the
    // shell only locks on a solved board, and there is no position for
    // canStillWin to say no to.
    expect(fencePosts.engine.failure).toBeUndefined()
    expect(fencePosts.engine.canStillWin).toBeUndefined()
  })

  it('never leaves a board the player cannot put right', () => {
    // Every square that is not printed takes any of the three values from any
    // position, so writing the answer into every square that disagrees with
    // it finishes the board — from anywhere a child can get to.
    for (const level of levels) {
      const first = start(level, 41)
      const truth = answerOf(first)
      for (const state of walk(first, 41, 39)) {
        const fixes = blanksOf(state)
          .filter((i) => state.entries[i] !== truth[i])
          .map((index): FenceAction => ({ type: 'set', index, value: truth[index] }))
        expect(isSolved(play(state, fixes))).toBe(true)
      }
    }
  })
})

describe('the clay ring', () => {
  /*
   * The oracle, measured and pinned. Two players who reason about nothing: the
   * tapper and the prober above. Boards are dealt in seed order; the tapper
   * runs on its own makeRng(77) a level and the prober on its own makeRng(78)
   * a level, so each number reproduces with that climber run alone. The wide
   * recipe is SEEDS widened to WIDE, 400 boards a level:
   *
   *   What goes red                          tapper solves    prober solves
   *   nothing                                0 / 0 / 0        0 / 0 / 0
   *   a post with too many                   16 / 0 / 0       0 / 0 / 0
   *   + a ring (what ships)                  21 / 1 / 0       5 / 0 / 0
   *   + a short post with every square full  79 / 10 / 2      99 / 47 / 16
   *   + a post that can no longer reach it   154 / 35 / 5     400 / 400 / 400
   *
   * Board.tsx quotes this under its note on the clay ring.
   */
  it('gives a player who reasons about nothing few boards, and each one at par only because a red fence costs nothing once stepped back', () => {
    const rng = makeRng(77)
    let solves = 0
    for (const seed of WIDE) {
      const { end, reds } = tap(start(levels[0], seed), rng)
      if (!isSolved(end)) continue
      solves++
      // The tapper keeps one fence a square and nothing else, so its history
      // holds exactly par moves — whether a red fence was refused, or landed
      // and was stepped back from. What is measured here is that every one of
      // them met red on the way, so a tapper that wrote over a red fence
      // instead of stepping back would be over par.
      expect(reds).toBeGreaterThanOrEqual(1)
    }
    expect(solves).toBeGreaterThan(0)
    expect(solves).toBe(21)

    // And on the two bigger levels, over the forty seeds, it finishes none.
    const higher = levels.slice(1).map((level) => {
      const own = makeRng(77)
      return seeded(level).filter((state) => isSolved(tap(state, own).end)).length
    })
    expect(higher).toEqual([0, 0])
  })

  it('leaves a short post silent, because flagging it would finish boards for a prober', () => {
    // Over the wide recipe: 5, 0 and 0 with what ships; 99, 47 and 16 with a
    // short post flagged once every square round it is filled; 400, 400 and
    // 400 — every board, at every level — with a post flagged the moment it
    // can no longer reach its number. The forty seeds here are the front of
    // that run.
    const solves = (red: Red) =>
      levels.map((level) => {
        const rng = makeRng(78)
        return seeded(level).filter((state) => isSolved(probe(state, rng, red))).length
      })
    expect(solves(SHIPPED)).toEqual([0, 0, 0])
    expect(solves(SHORT)).toEqual([11, 5, 3])
    expect(solves(DEAD)).toEqual([40, 40, 40])
  })
})

describe('describe', () => {
  it('says which fence went down and where, in the past tense', () => {
    const state = boardOf(4, '..... ..... ..... ..... .....', '.... .... .... ....')
    const back = reduce(state, { type: 'set', index: 6, value: BACK })
    expect(describeMove(state, back, { type: 'set', index: 6, value: BACK })).toBe(
      'Put a fence from top left to bottom right in row 2, column 3',
    )
    const forward = reduce(state, { type: 'set', index: 6, value: FORWARD })
    expect(describeMove(state, forward, { type: 'set', index: 6, value: FORWARD })).toBe(
      'Put a fence from bottom left to top right in row 2, column 3',
    )
    expect(describeMove(back, state, { type: 'set', index: 6, value: EMPTY })).toBe(
      'Took the fence out of row 2, column 3',
    )
  })

  it('names every square on the board, and never twice the same way', () => {
    const state = start(levels[2], 8)
    const moves = legalMoves(state).filter((a) => a.value !== EMPTY)
    const notes = new Set(moves.map((action) => describeMove(state, reduce(state, action), action)))
    expect(notes.size).toBe(moves.length)
    expect(notes.size).toBe(48)
    for (const note of notes) {
      expect(note).toMatch(
        /^Put a fence from (top left to bottom right|bottom left to top right) in row \d, column \d$/,
      )
    }
  })
})

describe('the board', () => {
  const BACK_KEY = 'Put a fence from top left to bottom right in the square'
  const FORWARD_KEY = 'Put a fence from bottom left to top right in the square'
  const RUBBER = 'Rub out the square'

  const setup = (state: FenceState, locked = false) => {
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }))
    return { dispatch, view }
  }

  const squareAt = (n: number, index: number) =>
    document.querySelector(
      `[aria-label^="Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1},"]`,
    ) as HTMLElement

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  /** The square a shaking rail is laid over: the rail is the square's sibling, not its child. */
  const squareUnder = (rail: Element) => rail.parentElement?.querySelector('[aria-label]')

  /** The post at a row and a column of corners. */
  const postAt = (r: number, c: number) =>
    [...document.querySelectorAll(`.${s.post}`)].find(
      (el) =>
        (el as HTMLElement).style.getPropertyValue('--r') === String(r) &&
        (el as HTMLElement).style.getPropertyValue('--c') === String(c),
    ) as HTMLElement

  /** The board with a real state behind it, so a cue can be watched from the tap that fires it. */
  const Play = ({ from }: { from: FenceState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: FenceAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  /**
   * The board under the shell's Step back, which truncates the history and
   * hands the same Board an earlier state. Anything the board is holding about
   * the move that has just been taken back has to go with it.
   */
  const Tape = ({ from }: { from: FenceState }) => {
    const [tape, setTape] = useState([from])
    return createElement(
      'div',
      null,
      createElement(Board, {
        state: tape[tape.length - 1],
        dispatch: (action: FenceAction) => setTape((cur) => [...cur, reduce(cur[cur.length - 1], action)]),
        locked: false,
      }),
      createElement('button', { type: 'button', onClick: () => setTape((cur) => cur.slice(0, -1)) }, 'Step back'),
    )
  }

  /** Two taps, one move: the square, then the key. */
  const put = (n: number, index: number, key: string) => {
    fireEvent.click(squareAt(n, index))
    fireEvent.click(screen.getByRole('button', { name: key }))
  }

  it('draws a pressable square for every empty one and a printed fence for the rest', () => {
    const state = start(levels[1], 2)
    setup(state)
    const printed = state.givens.filter((v) => v !== EMPTY).length
    expect(screen.getAllByRole('img')).toHaveLength(printed)
    const tiles = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-label')?.startsWith('Row '))
    expect(tiles).toHaveLength(state.n * state.n - printed)
    for (const tile of tiles) {
      expect(tile.getAttribute('type')).toBe('button')
      expect(tile.className).toContain('u-press')
    }
  })

  it('gives a printed fence no button and no press shadow', () => {
    setup(start(levels[0], 2))
    for (const fence of screen.getAllByRole('img')) {
      expect(fence.tagName).not.toBe('BUTTON')
      expect(fence.className).not.toContain('u-press')
      expect(fence.getAttribute('aria-label')).toMatch(
        /^Row \d, column \d, a fence from (top left to bottom right|bottom left to top right), printed\./,
      )
    }
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = setup(start(levels[0], 2))
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|move|solved|par/i)
  })

  it('names the numbered posts at a square’s corners, in order, and nothing else', () => {
    const hand = boardOf(2, '.1. ..2 0..', '/. ..')
    setup(hand)
    expect(squareAt(2, 0).getAttribute('aria-label')).toBe(
      'Row 1, column 1, a fence from bottom left to top right, printed. The post at top right wants 1 fence.',
    )
    expect(squareAt(2, 1).getAttribute('aria-label')).toBe(
      'Row 1, column 2, empty. The post at top left wants 1 fence. The post at bottom right wants 2 fences.',
    )
    expect(squareAt(2, 2).getAttribute('aria-label')).toBe(
      'Row 2, column 1, empty. The post at bottom left wants no fences.',
    )
    expect(squareAt(2, 3).getAttribute('aria-label')).toBe(
      'Row 2, column 2, empty. The post at top right wants 2 fences.',
    )
    cleanup()

    // Two '\' fences go down, and the post at the top has one too many.
    setup({ ...hand, entries: [EMPTY, BACK, EMPTY, BACK] })
    expect(squareAt(2, 1).getAttribute('aria-label')).toBe(
      'Row 1, column 2, a fence from top left to bottom right, breaking a rule. The post at top left wants 1 fence and has too many. The post at bottom right wants 2 fences.',
    )
    expect(squareAt(2, 0).getAttribute('aria-label')).toBe(
      'Row 1, column 1, a fence from bottom left to top right, printed. The post at top right wants 1 fence and has too many.',
    )
  })

  it('names the group for what it holds', () => {
    setup(start(levels[0], 2))
    expect(screen.getByRole('group', { name: 'Fences on a 4 by 4 grid' })).toBeInTheDocument()
  })

  it('hides the posts themselves from a screen reader', () => {
    const state = start(levels[1], 2)
    const { view } = setup(state)
    const layer = view.container.querySelector(`.${s.posts}`) as HTMLElement
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    const numbered = state.clues.filter((c) => c !== BLANK).length
    expect(layer.querySelectorAll(`.${s.post}`)).toHaveLength(numbered)
    expect(layer.querySelectorAll(`.${s.dot}`)).toHaveLength(state.clues.length - numbered)
    expect(layer.querySelector('[role]')).toBeNull()
    // The numbers are printed on the posts all the same.
    expect(
      [...layer.querySelectorAll(`.${s.post}`)].map((post) => Number(post.textContent)),
    ).toEqual(state.clues.filter((c) => c !== BLANK))
  })

  it('draws a rail in every filled square, the same colour printed or not', () => {
    const first = start(levels[0], 2)
    const blank = first.givens.indexOf(EMPTY)
    const state = reduce(first, { type: 'set', index: blank, value: FORWARD })
    const { view } = setup(state)
    const values = valuesOf(state)
    const rails = [...view.container.querySelectorAll(`.${s.fence}`)]
    expect(rails).toHaveLength(filledCount(state))
    for (let i = 0; i < values.length; i++) {
      const rail = squareAt(state.n, i).parentElement?.querySelector(`.${s.fence}`)
      if (values[i] === EMPTY) {
        expect(rail).toBeNull()
        continue
      }
      // One class for every rail on the board: the rail is a thing, and its
      // colour never says whether it was printed or whether it is right.
      expect(rail?.getAttribute('class')).toBe(s.fence)
      const lines = [...(rail as Element).querySelectorAll('line')]
      expect(lines.map((line) => line.getAttribute('class'))).toEqual([s.railEdge, s.rail])
      // '\' runs down from the top left corner, '/' up from the bottom left.
      expect(lines[1].getAttribute('y1')).toBe(values[i] === BACK ? '0' : '1')
    }
  })

  it('sends exactly one action when you tap a square and then a fence', () => {
    const state = start(levels[0], 2)
    const { dispatch } = setup(state)
    const blank = state.givens.indexOf(EMPTY)
    // Before a square is chosen the keys are dead.
    expect(screen.getByRole('button', { name: BACK_KEY })).toBeDisabled()
    fireEvent.click(squareAt(state.n, blank))
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: BACK_KEY }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value: BACK })
  })

  it('sends the other fence from the other key, and rubs a square out from the rubber', () => {
    const first = start(levels[0], 2)
    const blank = first.givens.indexOf(EMPTY)
    const state = reduce(first, { type: 'set', index: blank, value: BACK })
    const { dispatch } = setup(state)
    fireEvent.click(squareAt(state.n, blank))
    fireEvent.click(screen.getByRole('button', { name: FORWARD_KEY }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set', index: blank, value: FORWARD })
    fireEvent.click(screen.getByRole('button', { name: RUBBER }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set', index: blank, value: EMPTY })
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('will not offer the fence the square already holds, or the rubber for an empty square', () => {
    const first = start(levels[0], 2)
    const [blank, other] = blanksOf(first)
    const state = reduce(first, { type: 'set', index: blank, value: BACK })
    setup(state)
    fireEvent.click(squareAt(state.n, blank))
    expect(screen.getByRole('button', { name: BACK_KEY })).toBeDisabled()
    expect(screen.getByRole('button', { name: FORWARD_KEY })).toBeEnabled()
    expect(screen.getByRole('button', { name: RUBBER })).toBeEnabled()
    fireEvent.click(squareAt(state.n, other))
    expect(screen.getByRole('button', { name: BACK_KEY })).toBeEnabled()
    expect(screen.getByRole('button', { name: RUBBER })).toBeDisabled()
  })

  it('types fences from the keyboard: 1 and 2, \\ and /, and Backspace, Delete or 0 to rub out', () => {
    const first = start(levels[0], 2)
    const [blank, filled] = blanksOf(first)
    const state = reduce(first, { type: 'set', index: filled, value: BACK })
    const { dispatch } = setup(state)

    const empty = squareAt(state.n, blank)
    fireEvent.click(empty)
    for (const [key, value] of [
      ['1', BACK],
      ['\\', BACK],
      ['2', FORWARD],
      ['/', FORWARD],
    ] as const) {
      dispatch.mockClear()
      // fireEvent hands back false when the handler called preventDefault:
      // the board took the key, and the browser does not get it as well.
      expect(fireEvent.keyDown(empty, { key })).toBe(false)
      expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value })
    }
    // Nothing to rub out in an empty square, so nothing is sent.
    dispatch.mockClear()
    fireEvent.keyDown(empty, { key: 'Backspace' })
    expect(dispatch).not.toHaveBeenCalled()

    const holding = squareAt(state.n, filled)
    fireEvent.click(holding)
    for (const key of ['Backspace', 'Delete', '0']) {
      dispatch.mockClear()
      fireEvent.keyDown(holding, { key })
      expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: filled, value: EMPTY })
    }
    // The fence it already holds is not a move.
    dispatch.mockClear()
    fireEvent.keyDown(holding, { key: '1' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('leaves a chord to the browser', () => {
    const state = start(levels[0], 2)
    const blank = state.givens.indexOf(EMPTY)
    const { dispatch } = setup(state)
    const cell = squareAt(state.n, blank)
    fireEvent.click(cell)
    // Ctrl+/, Cmd+1, and '\' as an AltGr layout sends it: with Ctrl and Alt
    // held. The board takes none of them, and leaves the browser its answer.
    expect(fireEvent.keyDown(cell, { key: '/', ctrlKey: true })).toBe(true)
    expect(fireEvent.keyDown(cell, { key: '1', metaKey: true })).toBe(true)
    expect(fireEvent.keyDown(cell, { key: '\\', ctrlKey: true, altKey: true })).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
    // The bare key is still the board's.
    expect(fireEvent.keyDown(cell, { key: '/' })).toBe(false)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value: FORWARD })
  })

  it('walks the arrow keys from square to square, never onto a printed one, and keeps one tab stop', () => {
    const state = boardOf(3, '.... .... .... ....', String.raw`.\. ... ...`)
    setup(state)
    const from = squareAt(3, 0)
    act(() => from.focus())
    fireEvent.keyDown(from, { key: 'ArrowRight' })
    // Straight over the printed fence in row 1, column 2.
    const moved = document.activeElement as HTMLElement
    expect(moved).toBe(squareAt(3, 2))
    expect(moved).toHaveAttribute('aria-pressed', 'true')
    const stops = [...document.querySelectorAll('[aria-label^="Row "]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toEqual([moved])
    // And it stands still at the edge rather than wrapping round.
    fireEvent.keyDown(moved, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(moved)
    fireEvent.keyDown(moved, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(moved)
    fireEvent.keyDown(moved, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(squareAt(3, 5))
  })

  /** Every square the arrow keys reach from the tab stop, by index: each arrow tried from each square reached. */
  const arrowReach = (n: number): number[] => {
    const indexOf = (el: Element) => {
      const [, r, c] = (el.getAttribute('aria-label') ?? '').match(/^Row (\d+), column (\d+),/) ?? []
      return (Number(r) - 1) * n + (Number(c) - 1)
    }
    const first = document.querySelector('[aria-label^="Row "][tabindex="0"]') as HTMLElement
    const seen = new Set([indexOf(first)])
    const queue = [first]
    for (let k = 0; k < queue.length; k++) {
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        act(() => queue[k].focus())
        fireEvent.keyDown(queue[k], { key })
        const at = document.activeElement as HTMLElement
        if (seen.has(indexOf(at))) continue
        seen.add(indexOf(at))
        queue.push(at)
      }
    }
    return [...seen].sort((a, b) => a - b)
  }

  it('reaches every square a child has to fill with the arrow keys alone, exactly when blanksJoined says so', () => {
    // The board `fits` turns away for the keyboard: row 2, column 2 is empty,
    // and nothing else in its row or its column is, so no arrow lands on it.
    const island = boardOf(4, '..0.0 .2... .2.3. 1..11 .....', String.raw`.\.. \.// ./.. ./..`)
    setup(island)
    expect(blanksJoined(4, island.givens)).toBe(false)
    expect(arrowReach(4)).toEqual(blanksOf(island).filter((i) => i !== 5))
    cleanup()
    // And a board as it is dealt: every empty square is reached. The sweep
    // above holds every dealt board of every level to blanksJoined, so one
    // board here is enough to tie the arrow keys to it both ways round.
    const dealt = start(levels[0], 2)
    setup(dealt)
    expect(blanksJoined(4, dealt.givens)).toBe(true)
    expect(arrowReach(4)).toEqual(blanksOf(dealt))
  })

  it('lets Escape put the choice down, and a fence typed after it goes into the square the focus is on', () => {
    const state = start(levels[0], 2)
    const blank = state.givens.indexOf(EMPTY)
    const { dispatch } = setup(state)
    const cell = squareAt(state.n, blank)
    fireEvent.click(cell)
    expect(cell).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(cell, { key: 'Escape' })
    expect(cell).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: BACK_KEY })).toBeDisabled()
    expect(screen.getByText('Tap a square, then tap a fence.')).toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
    // The square a fence goes into is always the one with the amber ring, so
    // it takes the ring back before the fence goes down.
    fireEvent.keyDown(cell, { key: '1' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set', index: blank, value: BACK })
    expect(cell).toHaveAttribute('aria-pressed', 'true')
    expect(cell).toHaveAttribute('data-selected', 'true')
  })

  it('lights the whole ring and shakes every fence on it, printed ones too', () => {
    // The printed '/' in the corner and two of the child's fences make three
    // sides of the diamond; a '/' in the last square closes it.
    const state = boardOf(2, '... ... ...', '/... ', [EMPTY, BACK, BACK, EMPTY])
    render(createElement(Play, { from: state }))
    put(2, 3, FORWARD_KEY)

    const lit = wearing(cues.highlight).map((el) => el.getAttribute('aria-label')?.slice(0, 16))
    expect(lit).toEqual(['Row 1, column 1,', 'Row 1, column 2,', 'Row 2, column 1,', 'Row 2, column 2,'])
    const shaking = wearing(cues.shake).map(squareUnder)
    expect(shaking).toEqual([0, 1, 2, 3].map((i) => squareAt(2, i)))
    // Every fence of the child's on the ring is red; the printed one never is.
    for (const i of [1, 2, 3]) expect(squareAt(2, i)).toHaveAttribute('data-conflict', 'true')
    expect(squareAt(2, 0).getAttribute('data-conflict')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('These fences make a closed ring.')
  })

  it('lights the squares round a post with too many, and rings the post in clay', () => {
    const state = boardOf(2, '.1. ..2 0..', '/. ..')
    render(createElement(Play, { from: state }))
    expect(postAt(0, 1).getAttribute('data-over')).toBeNull()
    put(2, 1, BACK_KEY)

    expect(wearing(cues.highlight)).toEqual([squareAt(2, 0), squareAt(2, 1)])
    // The printed fence touches the post too, so it shakes with the child's.
    expect(wearing(cues.shake).map(squareUnder)).toEqual([squareAt(2, 0), squareAt(2, 1)])
    expect(postAt(0, 1)).toHaveAttribute('data-over', 'true')
    expect(postAt(1, 2).getAttribute('data-over')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('This post wants 1 fence and now has 2.')
  })

  it('says the broken rule in words, under the board and out loud', () => {
    const state = boardOf(2, '.1. ..2 0..', '/. ..')
    render(createElement(Play, { from: state }))
    put(2, 2, FORWARD_KEY)

    const said = 'This post wants no fences and now has 1.'
    expect(screen.getByRole('status')).toHaveTextContent(said)
    // Both lines say it: the one a child reads and the one a screen reader speaks.
    expect(screen.getAllByText(said)).toHaveLength(2)
    expect(squareAt(2, 2)).toHaveAttribute('data-conflict', 'true')
    expect(squareAt(2, 2).getAttribute('aria-label')).toMatch(/, breaking a rule\./)

    // Rub it out and there is nothing left to say.
    put(2, 2, RUBBER)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.queryByText(said)).toBeNull()
  })

  it('takes the light off with the mistake, and never announces one that a step back has removed', () => {
    // A three by three: the top left corner post wants no fences, and three
    // sides of the diamond round the post in the middle of the bottom right
    // four squares are already down.
    const posts = '0... .... .... ....'
    const state = boardOf(3, posts, '... ... ...', [
      EMPTY, EMPTY, EMPTY,
      EMPTY, FORWARD, BACK,
      EMPTY, BACK, EMPTY,
    ])
    render(createElement(Tape, { from: state }))

    // A ring, and then rubbed out inside the cue's own run: a group still lit
    // over a board with nothing wrong on it would say a mistake is there.
    put(3, 8, FORWARD_KEY)
    expect(wearing(cues.highlight)).toHaveLength(4)
    put(3, 8, RUBBER)
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')

    // Two mistakes, one after the other: the corner post, then the ring.
    put(3, 0, BACK_KEY)
    expect(screen.getByRole('status')).toHaveTextContent('This post wants no fences and now has 1.')
    put(3, 8, FORWARD_KEY)
    const ring = 'These fences make a closed ring.'
    expect(screen.getByRole('status')).toHaveTextContent(ring)

    // One step back. The ring is off the board, so its sentence goes with it,
    // even though the fence at the corner post is still there and still red.
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }))
    expect(squareAt(3, 8).getAttribute('aria-label')).toBe('Row 3, column 3, empty.')
    expect(screen.queryByText(ring)).toBeNull()
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('A red square breaks a rule.')
    expect(squareAt(3, 0)).toHaveAttribute('data-conflict', 'true')
  })

  it('takes the light off when the cue ends, and leaves the sentence and the clay rings standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      render(createElement(Play, { from: boardOf(2, '.1. ..2 0..', '/. ..') }))
      put(2, 1, BACK_KEY)
      expect(wearing(cues.highlight)).toHaveLength(2)

      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(wearing(cues.shake)).toHaveLength(0)
      // The louder layer has gone; the marking underneath it has not.
      expect(squareAt(2, 1)).toHaveAttribute('data-conflict', 'true')
      expect(postAt(0, 1)).toHaveAttribute('data-over', 'true')
      expect(screen.getByRole('status')).toHaveTextContent('This post wants 1 fence and now has 2.')
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('keeps a closed ring marked, printed fences and all, after the cue has run and until it is broken', () => {
    // A three by three. The printed '/' in the middle and the child's '\' in
    // row 2, column 3 and row 3, column 2 are three sides of the diamond round
    // the post in the middle of the bottom right four squares; a '/' in the
    // corner closes it. The top left square is on no ring.
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const state = boardOf(3, '.... .... .... ....', String.raw`... ./. ...`, [
        EMPTY, EMPTY, EMPTY,
        EMPTY, EMPTY, BACK,
        EMPTY, BACK, EMPTY,
      ])
      render(createElement(Play, { from: state }))
      const ringed = () =>
        [...document.querySelectorAll('[data-ring="true"]')].map((el) => el.getAttribute('aria-label')?.slice(0, 16))
      expect(ringed()).toEqual([])
      put(3, 8, FORWARD_KEY)
      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)

      // The cue has gone, and the whole ring is still there to be followed.
      expect(ringed()).toEqual(['Row 2, column 2,', 'Row 2, column 3,', 'Row 3, column 2,', 'Row 3, column 3,'])
      expect(squareAt(3, 0).getAttribute('data-ring')).toBeNull()
      // The printed fence on it is not the wrong one, so only the child's are red,
      expect(squareAt(3, 4).getAttribute('data-conflict')).toBeNull()
      for (const i of [5, 7, 8]) expect(squareAt(3, i)).toHaveAttribute('data-conflict', 'true')
      // and a screen reader hears where the ring runs as well as the sentence.
      expect(squareAt(3, 4).getAttribute('aria-label')).toBe(
        'Row 2, column 2, a fence from bottom left to top right, printed, on a closed ring.',
      )
      expect(screen.getByRole('status')).toHaveTextContent('These fences make a closed ring.')

      // Break the ring anywhere and every mark of it goes.
      put(3, 5, RUBBER)
      expect(ringed()).toEqual([])
      expect(squareAt(3, 4).getAttribute('aria-label')).toBe(
        'Row 2, column 2, a fence from bottom left to top right, printed.',
      )
      expect(screen.getByRole('status').textContent).toBe('')
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('tells a child what to tap next', () => {
    const state = start(levels[0], 2)
    setup(state)
    expect(screen.getByText('Tap a square, then tap a fence.')).toBeInTheDocument()
    const blank = state.givens.indexOf(EMPTY)
    fireEvent.click(squareAt(state.n, blank))
    expect(
      screen.getByText(`Now tap a fence for row ${rowOf(4, blank) + 1}, column ${colOf(4, blank) + 1}.`),
    ).toBeInTheDocument()
    // What to tap next is not news, so it is not announced.
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('says how many posts still want fences once every square has one, in the singular too', () => {
    const all = [FORWARD, FORWARD, FORWARD, FORWARD]
    const one = boardOf(2, '1.. ... ...', '....', all)
    expect(conflicts(one).squares.some(Boolean)).toBe(false)
    setup(one)
    const single = 'Every square has a fence. 1 post still wants another fence.'
    // Under the board and out loud: this is the moment a child thinks they
    // have finished, and nothing on the board is red.
    expect(screen.getAllByText(single)).toHaveLength(2)
    cleanup()

    setup(boardOf(2, '1.. ... ..1', '....', all))
    expect(screen.getAllByText('Every square has a fence. 2 posts still want more fences.')).toHaveLength(2)
  })

  it('falls back on "A red square breaks a rule." for a red square it did not see go down', () => {
    // A rewind through the move tape lands on a red square with no tap to name it.
    setup(boardOf(2, '.1. ..2 0..', '/. ..', [EMPTY, BACK, EMPTY, EMPTY]))
    expect(screen.getByRole('status')).toHaveTextContent('A red square breaks a rule.')
    expect(screen.getAllByText('A red square breaks a rule.')).toHaveLength(2)
  })

  it('ignores every input while it is locked', () => {
    const state = start(levels[0], 2)
    const { dispatch } = setup(state, true)
    const cell = squareAt(state.n, state.givens.indexOf(EMPTY))
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    for (const key of ['1', '2', '\\', '/', '0', 'Backspace', 'Delete', 'ArrowRight', 'Escape']) {
      fireEvent.keyDown(cell, { key })
    }
    expect(dispatch).not.toHaveBeenCalled()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('draws a solved board without a word of celebration', () => {
    const first = start(levels[0], 21)
    const done = play(first, solutionActions(first))
    expect(isSolved(done)).toBe(true)
    const { view } = setup(done, true)
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
    expect(view.container.querySelector(`.${s.note}`)?.textContent).toBe('')
    // And it is drawn exactly as played: a rail in every square.
    expect(view.container.querySelectorAll(`.${s.fence}`)).toHaveLength(16)
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(fencePosts.id).toBe('fence-posts')
    expect(fencePosts.title).toBe('The fence posts')
    expect(fencePosts.reseedable).toBe(true)
    expect(fencePosts.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(levels.map((l) => l.id)).toEqual(['four-by-four', 'five-by-five', 'six-by-six'])
    expect(fencePosts.instructions.length).toBeGreaterThanOrEqual(2)
    expect(fencePosts.instructions.length).toBeLessThanOrEqual(4)
    for (const line of fencePosts.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(120)
    }
    // The collection's taglines run 62 to 98 characters.
    expect(fencePosts.tagline.length).toBeLessThanOrEqual(98)
    expect(fencePosts.tagline).toMatch(/\.$/)
  })

  it('ramps the board, the squares to fill and the rings together', () => {
    expect(levels.map((l) => l.config.n)).toEqual([4, 5, 6])
    expect(levels.map((l) => l.par)).toEqual([10, 16, 24])
    expect(levels.map((l) => l.config.ring)).toEqual([0, 4, 8])
    for (const [k, level] of levels.entries()) {
      expect(level.par).toBe(level.config.blanks)
      // The cap every fill puzzle's last level is held to.
      expect(level.par as number).toBeLessThanOrEqual(24)
      expect(level.config.below).toBe(k === 0 ? -1 : levels[k - 1].config.ring)
      expect(level.config.minRounds).toBeLessThanOrEqual(level.config.maxRounds)
      // The windows rise and never overlap.
      if (k > 0) expect(level.config.minRounds).toBeGreaterThan(levels[k - 1].config.maxRounds)
    }
  })

  it('writes hints and instructions as plain, finished sentences', () => {
    const lines = [fencePosts.tagline, ...fencePosts.instructions, ...levels.flatMap((l) => l.hints)]
    for (const line of lines) {
      expect(line).not.toMatch(/!/)
      expect(line).toMatch(/\.$/)
      expect(line[0]).toBe(line[0].toUpperCase())
      expect(line).not.toMatch(/row \d|column \d/i)
      // A dropped "that" — docs/DESIGN.md, Words, rule 5.
      expect(line).not.toMatch(/\ball the \w+ its\b/)
    }
  })

  /**
   * `PuzzlePage` puts the picture inside the puzzle's `<h1>`, so a real
   * `<text>` in the scene would become part of the heading's plain text, and
   * the title would read "1The fence posts". The 1 is drawn as a stroke.
   */
  it('draws its clue number rather than typing it, so the title stays the title', () => {
    const { container } = render(createElement(fencePosts.Icon))
    expect(container.textContent).toBe('')
    expect(container.querySelector('text')).toBeNull()
    expect(container.querySelectorAll('path[stroke="var(--p-on-dark)"]')).toHaveLength(1)
    // Four rails and one post: no dots on the rim, so every shape is big.
    expect(container.querySelectorAll('line[stroke="var(--p-teal)"]')).toHaveLength(4)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('draws a position the board really takes, and a finished one', () => {
    // Read off the card itself: each teal rail's square is the quarter of the
    // two by two it lies in, and it is '\' when it runs down to the right.
    const { container } = render(createElement(fencePosts.Icon))
    const entries = new Array<number>(4).fill(EMPTY)
    for (const line of container.querySelectorAll('line[stroke="var(--p-teal)"]')) {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(line.getAttribute(a)))
      const square = (Math.min(y1, y2) >= 16 ? 2 : 0) + (Math.min(x1, x2) >= 16 ? 1 : 0)
      expect(entries[square]).toBe(EMPTY)
      entries[square] = (x2 - x1) * (y2 - y1) > 0 ? BACK : FORWARD
    }
    // '\' '\' over '\' '/', with the middle post saying 1: one fence touches
    // it, and the three round it close no ring.
    expect(entries).toEqual([BACK, BACK, BACK, FORWARD])
    const card = boardOf(2, '... .1. ...', '....', entries)
    expect(isSolved(card)).toBe(true)
    expect(tally(2, card.entries, 4).on).toBe(1)
  })
})

/**
 * A hint that points at a step the puzzle never rewards is worse than no hint
 * at all, so every claim the hints make is checked against the boards a child
 * is really dealt.
 */
describe('the hints tell the truth', () => {
  it('"Four by four" opens at a numbered post on the edge, every seed, and a rim post often decides a square', () => {
    expect(levels[0].hints[0]).toMatch(/edge/)
    let rim = 0
    let rimOpens = 0
    let inside = 0
    let insideOpens = 0
    for (const { n, clues, givens } of seeded(levels[0])) {
      const opening = new Set(openingPosts(n, clues, givens))
      expect([...opening].some((p) => onRim(n, p))).toBe(true)
      clues.forEach((clue, p) => {
        if (clue === BLANK) return
        if (onRim(n, p)) {
          rim++
          if (opening.has(p)) rimOpens++
        } else {
          inside++
          if (opening.has(p)) insideOpens++
        }
      })
    }
    // "Often": 81.6% of the numbered rim posts decide a square before a single
    // fence goes down, against 41.7% of the inside ones. Over the wide recipe
    // it is 79.6% against 41.2%.
    expect([rimOpens, rim]).toEqual([133, 163])
    expect([insideOpens, inside]).toEqual([53, 127])
  })

  it('every level uses both ways that a post decides a square', () => {
    // Level one's second and third hints name them: a post that already has
    // all its fences, and a post that needs every square it has left.
    expect(levels[0].hints[1]).toMatch(/has all the fences/)
    expect(levels[0].hints[2]).toMatch(/needs that many more/)
    for (const level of levels) {
      for (const { n, clues, givens } of seeded(level)) {
        const read = solveByLogic(n, clues, givens, level.config.ring)
        expect(read?.full).toBeGreaterThanOrEqual(1)
        expect(read?.need).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('"Four by four" is decided by counting alone, which is all its hints talk about', () => {
    expect(levels[0].config.ring).toBe(0)
    for (const hint of levels[0].hints) expect(hint).not.toMatch(/ring/)
    for (const { n, clues, givens } of seeded(levels[0])) {
      expect(solveByLogic(n, clues, givens, 0)?.ring).toBe(0)
    }
  })

  it('"Five by five" really needs a ring round one post', () => {
    expect(levels[1].hints[1]).toMatch(/one post/)
    for (const { n, clues, givens } of seeded(levels[1])) {
      expect(solveByLogic(n, clues, givens, 0)).toBeNull()
      const read = solveByLogic(n, clues, givens, 4)
      expect(read).not.toBeNull()
      expect(read?.ringSizes.length).toBeGreaterThan(0)
      for (const size of read?.ringSizes ?? []) expect(size).toBe(4)
    }
  })

  it('"Six by six" really needs a ring round more than one post', () => {
    expect(levels[2].hints[1]).toMatch(/more than one post/)
    for (const { n, clues, givens } of seeded(levels[2])) {
      expect(solveByLogic(n, clues, givens, 4)).toBeNull()
      const read = solveByLogic(n, clues, givens, 8)
      expect(read).not.toBeNull()
      expect(Math.max(...(read?.ringSizes ?? [0]))).toBeGreaterThanOrEqual(6)
    }
  })

  it('asks each level for more passes than the level before it', () => {
    const passes = levels.map((level) => {
      const rounds = seeded(level).map(
        ({ n, clues, givens }) => solveByLogic(n, clues, givens, level.config.ring)?.rounds ?? 0,
      )
      return rounds.reduce((a, b) => a + b, 0) / rounds.length
    })
    expect(passes[1]).toBeGreaterThan(passes[0])
    expect(passes[2]).toBeGreaterThan(passes[1])
    expect(passes.map((mean) => mean.toFixed(2))).toEqual(['2.52', '4.85', '8.45'])
  })
})
