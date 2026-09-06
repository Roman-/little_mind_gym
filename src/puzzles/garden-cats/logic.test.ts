import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cues } from '../../lib/motion'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import type { PuzzleLevel } from '../../lib/types'
import { gardenCats } from './index'
import { Board } from './Board'
import type { Clash, GardenAction, GardenConfig, GardenState } from './logic'
import {
  catCells,
  clashOf,
  clashes,
  colOf,
  conflicts,
  connected,
  countSolutions,
  deal,
  describeClash,
  describeMove,
  emptyGardens,
  fits,
  gardenCells,
  gardenSizes,
  growGardens,
  init,
  isSolved,
  legalMoves,
  orthogonal,
  randomSeats,
  reduce,
  rowOf,
  solutions,
  solveByLogic,
  space,
  touching,
} from './logic'

const levels = gardenCats.levels as PuzzleLevel<GardenConfig>[]
const start = (level: PuzzleLevel<GardenConfig>, seed: number) => init(level, makeRng(seed))
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 37)

/** The one way the cats can sit, as one square a garden. */
const answerFor = (state: GardenState) =>
  (solveByLogic(state.n, state.gardens) as { seats: number[] }).seats

/** Sits every cat down, in garden order. Each one is exactly one move. */
const solutionActions = (state: GardenState): GardenAction[] =>
  answerFor(state).map((index) => ({ type: 'toggle', index }))

const play = (state: GardenState, actions: GardenAction[]) =>
  actions.reduce((cur, action) => reduce(cur, action), state)

afterEach(cleanup)

describe('the board it deals', () => {
  for (const level of levels) {
    const { n } = level.config

    it(`"${level.label}" cuts ${n} joined-up gardens over the whole grid, every seed`, () => {
      for (const seed of SEEDS) {
        const { gardens } = start(level, seed)
        expect(gardens).toHaveLength(n * n)
        expect(new Set(gardens).size).toBe(n)
        for (let g = 0; g < n; g++) {
          const cells = gardenCells(gardens, g)
          expect(connected(n, cells)).toBe(true)
          // Never one square — that hands a cat over before the puzzle starts —
          // and never a third of the board, which is a picture of nothing.
          expect(cells.length).toBeGreaterThanOrEqual(2)
          expect(cells.length).toBeLessThanOrEqual(2 * n)
        }
      }
    })

    it(`"${level.label}" has exactly one answer, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        expect(countSolutions(n, state.gardens, 3)).toBe(1)
      }
    })

    it(`"${level.label}" can be reasoned out without a guess, every seed`, () => {
      for (const seed of SEEDS) {
        const state = start(level, seed)
        // The fallbacks in `deal` are for a run of luck the tests have never
        // seen: every seed lands on a board that suits the level.
        expect(fits(level.config, state.gardens)).toBe(true)
        const reasoned = solveByLogic(n, state.gardens)
        expect(reasoned).not.toBeNull()
        expect((reasoned as { rounds: number }).rounds).toBeGreaterThanOrEqual(
          level.config.minRounds,
        )
        expect((reasoned as { rounds: number }).rounds).toBeLessThanOrEqual(level.config.maxRounds)
      }
    })

    it(`"${level.label}" starts with no cat on it, and is not already solved`, () => {
      const state = start(level, 5)
      expect(catCells(state)).toHaveLength(0)
      expect(emptyGardens(state)).toBe(n)
      expect(isSolved(state)).toBe(false)
      expect(conflicts(state).some(Boolean)).toBe(false)
    })

    it(`"${level.label}" deals the same board twice for the same seed, and another for another`, () => {
      expect(start(level, 12).gardens).toEqual(start(level, 12).gardens)
      expect(start(level, 12).gardens).not.toEqual(start(level, 13).gardens)
    })
  }

  it('says nothing in the colours about where the cats are', () => {
    // A garden's number is its colour, and the gardens are grown in the order
    // of the rows their cats sit in, so `deal` renames them. Without that, the
    // first colour would hold the top cat on every board ever dealt.
    const firstRow = SEEDS.map((seed) => {
      const state = start(levels[0], seed)
      const top = answerFor(state).find((cell) => rowOf(state.n, cell) === 0) as number
      return state.gardens[top]
    })
    expect(new Set(firstRow).size).toBeGreaterThan(1)
  })
})

describe('the rules', () => {
  const plain = Array.from({ length: 25 }, (_, i) => Math.floor(i / 5))
  const at = (r: number, c: number) => r * 5 + c

  it('will not have two cats in one row, one column or one garden', () => {
    expect(clashes(5, plain, at(2, 1), at(2, 4))).toBe(true)
    expect(clashes(5, plain, at(0, 3), at(4, 3))).toBe(true)
    // Row-shaped gardens, so this pair is in one garden as well as one row.
    expect(clashes(5, plain, at(3, 0), at(3, 2))).toBe(true)
  })

  it('will not have two cats side by side or corner to corner', () => {
    expect(clashes(5, plain, at(1, 1), at(2, 2))).toBe(true)
    expect(clashes(5, plain, at(1, 1), at(0, 0))).toBe(true)
    // Two apart in both directions, and in different gardens: no rule broken.
    const wide = Array.from({ length: 25 }, (_, i) => (i % 5) % 5)
    expect(clashes(5, wide, at(0, 0), at(2, 3))).toBe(false)
  })

  it('counts a square against itself as nothing', () => {
    expect(clashes(5, plain, at(2, 2), at(2, 2))).toBe(false)
  })

  it('holds the eight squares round a cat, and the nine with it', () => {
    expect(touching(5, at(0, 0)).sort((a, b) => a - b)).toEqual([at(0, 1), at(1, 0), at(1, 1)])
    expect(touching(5, at(2, 2))).toHaveLength(8)
    expect(space(5, at(2, 2))).toHaveLength(9)
    expect(space(5, at(2, 2))[0]).toBe(at(2, 2))
    expect(orthogonal(5, at(0, 0)).sort((a, b) => a - b)).toEqual([at(0, 1), at(1, 0)])
  })
})

describe('reduce', () => {
  const state = start(levels[0], 4)

  it('sits a cat down and picks it up again', () => {
    const down = reduce(state, { type: 'toggle', index: 7 })
    expect(down.cats[7]).toBe(true)
    expect(down.gardens).toBe(state.gardens)
    const up = reduce(down, { type: 'toggle', index: 7 })
    expect(up.cats[7]).toBe(false)
    expect(up.cats).toEqual(state.cats)
  })

  it('hands back the very same state for an action that is not one', () => {
    expect(reduce(state, { type: 'toggle', index: -1 })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: state.cats.length })).toBe(state)
    expect(reduce(state, { type: 'toggle', index: 1.5 })).toBe(state)
    expect(reduce(state, { type: 'nudge' } as unknown as GardenAction)).toBe(state)
  })

  it('lets a cat sit somewhere the rules forbid, and says so afterwards', () => {
    const answer = answerFor(state)
    const first = reduce(state, { type: 'toggle', index: answer[0] })
    const beside = touching(state.n, answer[0])[0]
    const broken = reduce(first, { type: 'toggle', index: beside })
    // The move happened: the board draws it, the shell records it, and the
    // clash is what the board says over the top.
    expect(broken).not.toBe(first)
    expect(broken.cats[beside]).toBe(true)
    expect(conflicts(broken)[beside]).toBe(true)
    expect(conflicts(broken)[answer[0]]).toBe(true)
    expect(isSolved(broken)).toBe(false)
  })
})

describe('isSolved and conflicts', () => {
  for (const level of levels) {
    it(`"${level.label}" comes out in exactly ${level.par} moves, and is solved when it does`, () => {
      for (const seed of SEEDS.slice(0, 20)) {
        const first = start(level, seed)
        const actions = solutionActions(first)
        expect(actions).toHaveLength(level.par as number)
        const done = play(first, actions)
        expect(isSolved(done)).toBe(true)
        expect(conflicts(done).some(Boolean)).toBe(false)
        expect(emptyGardens(done)).toBe(0)
      }
    })
  }

  it('will not call a board solved while a garden is still empty', () => {
    const first = start(levels[0], 21)
    const short = play(first, solutionActions(first).slice(0, -1))
    expect(conflicts(short).some(Boolean)).toBe(false)
    expect(emptyGardens(short)).toBe(1)
    expect(isSolved(short)).toBe(false)
  })

  it('will not call a full board solved when two cats break a rule', () => {
    const first = start(levels[0], 21)
    const answer = answerFor(first)
    // Every cat but one where it belongs, and the last one somewhere else in
    // its own garden: five cats, five gardens, and still not an answer.
    const moved = gardenCells(first.gardens, first.gardens[answer[0]]).find(
      (i) => i !== answer[0],
    ) as number
    const wrong = play(first, [
      { type: 'toggle', index: moved },
      ...answer.slice(1).map((index) => ({ type: 'toggle', index }) as GardenAction),
    ])
    expect(catCells(wrong)).toHaveLength(5)
    expect(emptyGardens(wrong)).toBe(0)
    expect(isSolved(wrong)).toBe(false)
    expect(conflicts(wrong).some(Boolean)).toBe(true)
  })

  it('flags both cats of a pair, and no cat that is behaving', () => {
    const state = start(levels[0], 33)
    const answer = answerFor(state)
    const beside = touching(state.n, answer[0])[0]
    // A third cat, somewhere the first two leave alone, to show that a board
    // with a mistake on it does not paint every cat red.
    const clear = answer.find(
      (cell) => cell !== answer[0] && !clashes(state.n, state.gardens, cell, beside),
    ) as number
    const board = play(state, [
      { type: 'toggle', index: answer[0] },
      { type: 'toggle', index: beside },
      { type: 'toggle', index: clear },
    ])
    const flagged = conflicts(board)
    expect(flagged[answer[0]]).toBe(true)
    expect(flagged[beside]).toBe(true)
    expect(flagged.filter(Boolean)).toHaveLength(2)
  })
})

describe('the clash a cat makes', () => {
  /** Hand-built, so the test says which rule breaks rather than hunting for one. */
  const gardens = [
    0, 0, 1, 1, 1,
    0, 0, 1, 2, 2,
    3, 0, 1, 2, 2,
    3, 3, 4, 4, 2,
    3, 3, 4, 4, 4,
  ]
  const board = (cats: number[]): GardenState => ({
    n: 5,
    gardens,
    cats: Array.from({ length: 25 }, (_, i) => cats.includes(i)),
  })
  /** One cat, in the top-left corner. */
  const corner = board([0])

  it('says nothing when the square takes the cat cleanly', () => {
    expect(clashOf(corner, 12)).toBeNull()
    expect(clashOf(board([]), 7)).toBeNull()
  })

  it('names the row, and holds the whole of it', () => {
    expect(clashOf(corner, 3)).toEqual({
      kind: 'row',
      ordinal: 1,
      cells: [0, 1, 2, 3, 4],
      blamed: [3, 0],
    })
  })

  it('falls to the column when the row is clean', () => {
    expect(clashOf(corner, 15)).toMatchObject({
      kind: 'column',
      ordinal: 1,
      cells: [0, 5, 10, 15, 20],
      blamed: [15, 0],
    })
  })

  it('falls to the garden when the row and the column are both clean', () => {
    expect(clashOf(corner, 11)).toMatchObject({
      kind: 'garden',
      cells: [0, 1, 5, 6, 11],
      blamed: [11, 0],
    })
  })

  it('falls last to the squares round the cat, and lights the nine of them', () => {
    // Row 2, column 3: a different row, column and garden — and touching.
    const clash = clashOf(board([7]), 13) as Clash
    expect(clash.kind).toBe('touching')
    expect(clash.blamed).toEqual([13, 7])
    expect(clash.cells).toEqual(space(5, 13))
  })

  it('blames every cat in the group, not only the first', () => {
    expect(clashOf(board([0, 2]), 4)?.blamed).toEqual([4, 0, 2])
  })

  it('fires exactly when the move would turn the square red', () => {
    for (const level of levels) {
      const state = start(level, 12)
      const answer = answerFor(state)
      const half = play(
        state,
        answer.slice(0, 2).map((index) => ({ type: 'toggle', index }) as GardenAction),
      )
      for (let index = 0; index < half.cats.length; index++) {
        if (half.cats[index]) continue
        const clash = clashOf(half, index)
        expect(clash !== null).toBe(conflicts(reduce(half, { type: 'toggle', index }))[index])
        if (clash === null) continue
        expect(clash.cells).toContain(index)
        expect(clash.blamed[0]).toBe(index)
        expect(clash.blamed.length).toBeGreaterThan(1)
        for (const i of clash.blamed) expect(clash.cells).toContain(i)
      }
    }
  })

  it('puts the broken rule in one sentence', () => {
    expect(describeClash(clashOf(corner, 3) as Clash)).toBe('There is already a cat in row 1.')
    expect(describeClash(clashOf(corner, 15) as Clash)).toBe(
      'There is already a cat in column 1.',
    )
    // A garden has no number a child could count to, so the lit squares say
    // which one, and so does the colour under them.
    expect(describeClash(clashOf(corner, 11) as Clash)).toBe('This garden already has a cat.')
    expect(describeClash(clashOf(board([7]), 13) as Clash)).toBe('These two cats are touching.')
  })
})

describe('describe', () => {
  it('names the square, in the past tense, both ways round', () => {
    const state = start(levels[0], 3)
    const down = reduce(state, { type: 'toggle', index: 7 })
    expect(describeMove(state, down, { type: 'toggle', index: 7 })).toBe(
      'Sat a cat in row 2, column 3',
    )
    expect(describeMove(down, state, { type: 'toggle', index: 7 })).toBe(
      'Picked the cat up from row 2, column 3',
    )
  })

  it('names the square the move actually changed, for every square', () => {
    const state = start(levels[1], 44)
    for (const action of legalMoves(state)) {
      const next = reduce(state, action)
      const changed = next.cats.findIndex((cat, i) => cat !== state.cats[i])
      const line = describeMove(state, next, action)
      expect(line).toContain(
        `row ${rowOf(state.n, changed) + 1}, column ${colOf(state.n, changed) + 1}`,
      )
    }
  })
})

describe('par', () => {
  it('is one move a cat, and one cat a garden', () => {
    for (const level of levels) {
      expect(level.par).toBe(level.config.n)
    }
  })

  it('has no shorter path than par under breadth-first search', () => {
    const level = levels[0]
    for (const seed of [5, 61]) {
      const path = shortestSolution<GardenState, GardenAction>({
        start: start(level, seed),
        moves: legalMoves,
        apply: reduce,
        key: (s) => s.cats.map((cat) => (cat ? '1' : '0')).join(''),
        solved: isSolved,
        // A cat that breaks a rule is never on a shortest path: it has to be
        // picked up again, which costs two more moves than not sitting it
        // down. Pruning those keeps the graph walkable.
        invalid: (s) => conflicts(s).some(Boolean),
        maxStates: 100_000,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(level.par as number)
    }
  })
})

describe('the solver', () => {
  it('agrees with a plain exhaustive count', () => {
    // `solutions` branches on the smallest garden first and stops at a cap.
    // This is the stupidest possible counter, so the two agreeing means the
    // clever one is not lying.
    const dumbCount = (n: number, gardens: number[]) => {
      const cells: number[] = []
      let found = 0
      const walk = (i: number): void => {
        if (i === n * n) {
          if (cells.length === n) found++
          return
        }
        walk(i + 1)
        if (cells.every((other) => !clashes(n, gardens, i, other))) {
          cells.push(i)
          if (cells.length <= n) walk(i + 1)
          cells.pop()
        }
      }
      walk(0)
      return found
    }
    for (const level of levels.slice(0, 2)) {
      for (const seed of SEEDS.slice(0, 4)) {
        const { n, gardens } = start(level, seed)
        expect(dumbCount(n, gardens)).toBe(1)
      }
    }
  })

  it('finds the answer the board was built round', () => {
    for (const level of levels) {
      for (const seed of SEEDS.slice(0, 20)) {
        const state = start(level, seed)
        const reasoned = solveByLogic(state.n, state.gardens) as { seats: number[] }
        const only = solutions(state.n, state.gardens, 2)
        expect(only).toHaveLength(1)
        expect([...reasoned.seats].sort((a, b) => a - b)).toEqual(
          [...only[0]].sort((a, b) => a - b),
        )
      }
    }
  })

  /**
   * The claim the whole generator rests on: a board it can finish is a board
   * with one answer. Raw grown gardens are mostly not like that, which is what
   * makes them worth testing against.
   */
  it('never finishes a board that has two answers', () => {
    const rng = makeRng(2024)
    let loose = 0
    for (let k = 0; k < 200; k++) {
      const seats = randomSeats(rng, 5) as number[]
      const gardens = growGardens(rng, 5, seats)
      const count = countSolutions(5, gardens, 2)
      if (count > 1) {
        loose++
        expect(solveByLogic(5, gardens)).toBeNull()
      } else if (solveByLogic(5, gardens) !== null) {
        expect(count).toBe(1)
      }
    }
    expect(loose).toBeGreaterThan(20)
  })

  it('gives up rather than guessing', () => {
    // Five gardens in five stripes: every column is an answer, so there is
    // nothing to work out and nothing to sit a cat on with certainty.
    const stripes = Array.from({ length: 25 }, (_, i) => colOf(5, i))
    expect(countSolutions(5, stripes, 2)).toBeGreaterThan(1)
    expect(solveByLogic(5, stripes)).toBeNull()
  })
})

describe('growing and cutting', () => {
  it('seats one cat a row and one a column, never two of them touching', () => {
    const rng = makeRng(77)
    for (const n of [5, 6, 7]) {
      for (let k = 0; k < 40; k++) {
        const seats = randomSeats(rng, n) as number[]
        expect(seats).toHaveLength(n)
        expect(new Set(seats.map((i) => rowOf(n, i))).size).toBe(n)
        expect(new Set(seats.map((i) => colOf(n, i))).size).toBe(n)
        // One garden a seat, which is where every board here starts.
        const gardens = new Array<number>(n * n).fill(-1)
        seats.forEach((cell, g) => {
          gardens[cell] = g
        })
        for (const a of seats) {
          for (const b of seats) if (a < b) expect(clashes(n, gardens, a, b)).toBe(false)
        }
      }
    }
  })

  it('grows a garden round every seat and leaves no square out', () => {
    const rng = makeRng(78)
    for (let k = 0; k < 40; k++) {
      const seats = randomSeats(rng, 6) as number[]
      const gardens = growGardens(rng, 6, seats)
      expect(gardens.every((g) => g >= 0)).toBe(true)
      expect(gardenSizes(6, gardens).reduce((a, b) => a + b, 0)).toBe(36)
      seats.forEach((cell, g) => expect(gardens[cell]).toBe(g))
      for (let g = 0; g < 6; g++) expect(connected(6, gardenCells(gardens, g))).toBe(true)
    }
  })

  it('knows a garden that hangs together from one that does not', () => {
    expect(connected(5, [0, 1, 2])).toBe(true)
    expect(connected(5, [0, 1, 6, 11])).toBe(true)
    // Corner to corner is touching, but it is not joined up.
    expect(connected(5, [0, 6])).toBe(false)
    expect(connected(5, [])).toBe(false)
  })
})

describe('the board', () => {
  const setup = (level: PuzzleLevel<GardenConfig>, seed: number, locked = false) => {
    const state = start(level, seed)
    const dispatch = vi.fn()
    const view = render(createElement(Board, { state, dispatch, locked }))
    return { state, dispatch, view }
  }

  const tileAt = (state: GardenState, index: number) =>
    document.querySelector(
      `[aria-label^="Row ${rowOf(state.n, index) + 1}, column ${colOf(state.n, index) + 1},"]`,
    ) as HTMLButtonElement

  /** The board with a real state behind it, so a cue can be watched from the tap that fires it. */
  const Play = ({ from }: { from: GardenState }) => {
    const [state, setState] = useState(from)
    return createElement(Board, {
      state,
      dispatch: (action: GardenAction) => setState((cur) => reduce(cur, action)),
      locked: false,
    })
  }

  const wearing = (cue: string) =>
    [...document.querySelectorAll('[class]')].filter((el) => el.classList.contains(cue))

  it('draws a pressable square for every square on the grid', () => {
    const { state } = setup(levels[0], 2)
    const tiles = screen.getAllByRole('button')
    expect(tiles).toHaveLength(state.n * state.n)
    for (const tile of tiles) {
      expect(tile.className).toContain('u-press')
      expect(tile.getAttribute('aria-label')).toMatch(
        /^Row \d+, column \d+, (yellow|blue|green|purple|red|teal|grey) garden, (cat|empty)/,
      )
    }
  })

  it('leaves the shell’s furniture to the shell', () => {
    const { view } = setup(levels[0], 2)
    expect(view.container.querySelector('h1, h2, h3')).toBeNull()
    expect(view.container.textContent ?? '').not.toMatch(/undo|reset|hint|move|solved|par/i)
  })

  it('sends exactly one action for one tap', () => {
    const { state, dispatch } = setup(levels[0], 2)
    fireEvent.click(tileAt(state, 7))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggle', index: 7 })
  })

  it('walks the arrow keys from square to square, and keeps one tab stop', () => {
    const { state } = setup(levels[0], 2)
    const cell = tileAt(state, 0)
    cell.focus()
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    const moved = document.activeElement as HTMLElement
    expect(moved).toBe(tileAt(state, 1))
    const stops = [...document.querySelectorAll('[aria-label^="Row "]')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    )
    expect(stops).toEqual([moved])

    // And it stops at the edge rather than wrapping round to the next row.
    fireEvent.keyDown(moved, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(moved)
  })

  it('counts the gardens that still need a cat', () => {
    const state = start(levels[0], 2)
    render(createElement(Play, { from: state }))
    expect(screen.getByText('5 gardens still need a cat.')).toBeInTheDocument()
    fireEvent.click(tileAt(state, answerFor(state)[0]))
    expect(screen.getByText('4 gardens still need a cat.')).toBeInTheDocument()
  })

  it('says so, in words and out loud, when a cat breaks a rule', () => {
    const state = start(levels[0], 2)
    const answer = answerFor(state)
    const beside = touching(state.n, answer[0])[0]
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, answer[0]))
    fireEvent.click(tileAt(state, beside))

    const said = describeClash(
      clashOf(reduce(state, { type: 'toggle', index: answer[0] }), beside) as Clash,
    )
    expect(screen.getByRole('status')).toHaveTextContent(said)
    // Both lines say it: the one a child reads and the one a screen reader speaks.
    expect(screen.getAllByText(said)).toHaveLength(2)
    expect(tileAt(state, beside)).toHaveAttribute('data-conflict', 'true')
    expect(tileAt(state, beside).getAttribute('aria-label')).toMatch(/, breaking a rule$/)

    // Pick it up again and there is nothing left to say.
    fireEvent.click(tileAt(state, beside))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('lights the whole group and shakes the two cats at fault', () => {
    const state = start(levels[0], 2)
    const answer = answerFor(state)
    // A cat in the same row as the first, and far enough off not to touch it.
    const sameRow = state.gardens
      .map((_, i) => i)
      .find(
        (i) =>
          rowOf(state.n, i) === rowOf(state.n, answer[0]) &&
          Math.abs(colOf(state.n, i) - colOf(state.n, answer[0])) > 1,
      ) as number
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, answer[0]))
    fireEvent.click(tileAt(state, sameRow))

    const lit = wearing(cues.highlight)
    expect(lit).toHaveLength(state.n)
    for (const square of lit) {
      expect(square.getAttribute('aria-label')).toMatch(
        new RegExp(`^Row ${rowOf(state.n, answer[0]) + 1}, `),
      )
    }
    const shaking = wearing(cues.shake).map((mark) => mark.closest('[aria-label]'))
    expect(shaking).toHaveLength(2)
    expect(shaking).toContain(tileAt(state, answer[0]))
    expect(shaking).toContain(tileAt(state, sameRow))
  })

  it('lights nothing when the cat fits', () => {
    const state = start(levels[0], 2)
    render(createElement(Play, { from: state }))
    fireEvent.click(tileAt(state, answerFor(state)[0]))
    expect(wearing(cues.highlight)).toHaveLength(0)
    expect(wearing(cues.shake)).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('takes the light off again, and leaves the sentence and the red ring standing', () => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--dur-5', '900ms')
    try {
      const state = start(levels[0], 2)
      const answer = answerFor(state)
      const beside = touching(state.n, answer[0])[0]
      render(createElement(Play, { from: state }))
      fireEvent.click(tileAt(state, answer[0]))
      fireEvent.click(tileAt(state, beside))
      expect(wearing(cues.highlight).length).toBeGreaterThan(0)

      act(() => vi.advanceTimersByTime(900))
      expect(wearing(cues.highlight)).toHaveLength(0)
      expect(wearing(cues.shake)).toHaveLength(0)
      // The louder layer has gone; the marking underneath it has not.
      expect(tileAt(state, beside)).toHaveAttribute('data-conflict', 'true')
      expect(screen.getByRole('status').textContent).not.toBe('')
    } finally {
      vi.useRealTimers()
      document.documentElement.removeAttribute('style')
    }
  })

  it('ignores every input while it is locked', () => {
    const { state, dispatch } = setup(levels[0], 2, true)
    const cell = tileAt(state, 0)
    expect(cell).toBeDisabled()
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    expect(dispatch).not.toHaveBeenCalled()
    for (const tile of screen.getAllByRole('button')) expect(tile).toBeDisabled()
  })

  it('draws a solved board without a word of celebration', () => {
    const first = start(levels[0], 21)
    const done = play(first, solutionActions(first))
    render(createElement(Board, { state: done, dispatch: vi.fn(), locked: true }))
    expect(screen.queryByText(/well done|great|you win|solved/i)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('the meta', () => {
  it('is wired up the way the shell expects', () => {
    expect(gardenCats.id).toBe('garden-cats')
    expect(gardenCats.reseedable).toBe(true)
    // A cat in the wrong place is not a dead end here — it is picked up, not
    // stepped back from — so there is deliberately no failure().
    expect(gardenCats.engine.failure).toBeUndefined()
    expect(levels).toHaveLength(3)
    expect(levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    expect(new Set(levels.map((l) => l.id)).size).toBe(3)
    expect(gardenCats.instructions.length).toBeGreaterThanOrEqual(2)
    expect(gardenCats.instructions.length).toBeLessThanOrEqual(4)
    for (const line of gardenCats.instructions) expect(line.length).toBeLessThanOrEqual(80)
    for (const level of levels) {
      expect(level.hints).toHaveLength(3)
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      for (const hint of level.hints) expect(hint.length).toBeLessThanOrEqual(140)
    }
  })

  it('never names a square that would give the answer away', () => {
    for (const level of levels) {
      for (const hint of level.hints) expect(hint).not.toMatch(/row \d|column \d/i)
    }
  })

  it('ramps by size, and asks for more thinking as it goes', () => {
    expect(levels.map((l) => l.config.n)).toEqual([5, 6, 7])
    const floors = levels.map((l) => l.config.minRounds)
    expect(floors[0]).toBeLessThan(floors[1])
    expect(floors[1]).toBeLessThan(floors[2])
    // Seven gardens is as many as there are colours to tell them apart with.
    for (const level of levels) expect(level.config.n).toBeLessThanOrEqual(7)
  })

  it('deals a board for every level inside a blink', () => {
    for (const level of levels) {
      const at = performance.now()
      deal(makeRng(4242), level.config)
      expect(performance.now() - at).toBeLessThan(400)
    }
  })
})
