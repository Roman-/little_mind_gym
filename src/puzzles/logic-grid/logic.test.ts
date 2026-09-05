import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AVAILABLE } from '../../components/pictogram-art'
import { makeRng } from '../../lib/rng'
import { shortestSolution } from '../../lib/search'
import { Board } from './Board'
import { logicGrid } from './index'
import type { Clue, GridAction, GridConfig, GridState, Mark, Scenario } from './logic'
import {
  categoryOf,
  categoryPairs,
  cellKey,
  clueText,
  clueTokens,
  describeMove,
  eliminate,
  fewestMarks,
  init,
  isSolved,
  markAt,
  nextMark,
  petsThree,
  reduce,
  solutionsFor,
  solveScenario,
} from './logic'

const bankOf = (levelIndex: number) => (logicGrid.levels[levelIndex].config as GridConfig).bank
const everyScenario: Scenario[] = logicGrid.levels.flatMap(
  (level) => (level.config as GridConfig).bank,
)

const blank = (scenario: Scenario): GridState => ({ scenario, marks: {} })

/** The one true set of pairings, as a canonical string. */
const shape = (rows: string[][]) =>
  rows
    .map((row) => row.slice().sort().join('+'))
    .sort()
    .join(' | ')

/** Every box of every grid, as the pair that names it. */
function everyCell(scenario: Scenario): { a: string; b: string }[] {
  const out: { a: string; b: string }[] = []
  for (const [i, j] of categoryPairs(scenario)) {
    for (const row of scenario.categories[i].items) {
      for (const col of scenario.categories[j].items) out.push({ a: row.id, b: col.id })
    }
  }
  return out
}

/** Ticks every pairing the scenario says is true, one action per tick. */
function filledIn(scenario: Scenario): { state: GridState; moves: number } {
  let state = blank(scenario)
  let moves = 0
  for (const [i, j] of categoryPairs(scenario)) {
    for (const row of scenario.solution) {
      const next = reduce(state, { type: 'mark', pair: { a: row[i], b: row[j] }, value: 'yes' })
      if (next !== state) moves++
      state = next
    }
  }
  return { state, moves }
}

const done = (scenario: Scenario) => filledIn(scenario).state

describe('who has what — the scenarios', () => {
  for (const scenario of everyScenario) {
    it(`"${scenario.id}" has exactly one answer, and it is the one recorded`, () => {
      const answers = solveScenario(scenario)
      expect(answers).toHaveLength(1)
      expect(shape(answers[0])).toBe(shape(scenario.solution))
    })

    it(`"${scenario.id}" has no clue that could be dropped`, () => {
      expect(scenario.clues.length).toBeGreaterThan(0)
      scenario.clues.forEach((clue, i) => {
        const without = scenario.clues.filter((_, k) => k !== i)
        const answers = solutionsFor(scenario.categories, without)
        expect(
          answers.length,
          `clue ${i + 1} ("${clueText(scenario, clue)}") is redundant`,
        ).toBeGreaterThan(1)
      })
    })

    it(`"${scenario.id}" can be finished by crossing out, with no guessing`, () => {
      expect(eliminate(scenario.categories, scenario.clues)).toBe('solved')
    })

    it(`"${scenario.id}" is built from distinct items in matching rows`, () => {
      const ids = scenario.categories.flatMap((cat) => cat.items.map((item) => item.id))
      expect(new Set(ids).size).toBe(ids.length)
      const size = scenario.categories[0].items.length
      for (const cat of scenario.categories) expect(cat.items).toHaveLength(size)
      expect(scenario.solution).toHaveLength(size)
      scenario.categories.forEach((cat, c) => {
        const used = scenario.solution.map((row) => row[c])
        expect(used.slice().sort()).toEqual(cat.items.map((i) => i.id).sort())
      })
    })

    it(`"${scenario.id}" draws every item, and never two children alike`, () => {
      for (const cat of scenario.categories) {
        for (const item of cat.items) expect(AVAILABLE).toContain(item.art)
      }
      // Four names, four faces: a child tells Mira from Ned by her picture.
      const faces = scenario.categories[0].items.map((item) => item.art)
      expect(new Set(faces).size).toBe(faces.length)
    })

    it(`"${scenario.id}" states every clue in words an eight-year-old can read`, () => {
      for (const clue of scenario.clues) {
        const tokens = clueTokens(scenario, clue)
        // A clue names two things and no more.
        expect(tokens.filter((t) => !('text' in t))).toHaveLength(2)
        const text = clueText(scenario, clue)
        expect(text.split(' ').length).toBeLessThanOrEqual(12)
        // One negative at most: never "does not ... no ...".
        expect(text.match(/\bnot\b|n't/g) ?? []).toHaveLength(clue.kind === 'unlink' ? 1 : 0)
        expect(text.endsWith('.')).toBe(true)
        expect(text[0]).toBe(text[0].toUpperCase())
      }
    })
  }

  /**
   * The checker the scenarios are judged by, judged itself. Over every subset
   * of every scenario's clues, "solved" has to mean exactly one arrangement
   * fits and "contradiction" exactly none — otherwise "no guessing needed" is
   * a claim about a broken solver.
   */
  it('only says "solved" when brute force agrees there is one answer', () => {
    let solved = 0
    for (const scenario of everyScenario) {
      const n = scenario.clues.length
      for (let mask = 0; mask < 1 << n; mask++) {
        const subset: Clue[] = scenario.clues.filter((_, i) => (mask >> i) & 1)
        const verdict = eliminate(scenario.categories, subset)
        const count = solutionsFor(scenario.categories, subset).length
        const where = `${scenario.id}, clues ${mask.toString(2)}`
        if (verdict === 'solved') {
          solved++
          expect(count, where).toBe(1)
        } else if (verdict === 'contradiction') {
          expect(count, where).toBe(0)
        } else {
          expect(count, where).toBeGreaterThanOrEqual(1)
        }
      }
    }
    // The full clue set of all eight scenarios, and nothing less, gets there.
    expect(solved).toBe(everyScenario.length)
  })

  it('says the clues the way they were meant to sound', () => {
    expect(clueText(petsThree, { kind: 'unlink', a: 'mira', b: 'rabbit' })).toBe(
      'Mira does not have the rabbit.',
    )
    expect(clueText(petsThree, { kind: 'link', a: 'ola', b: 'fish' })).toBe('Ola has the fish.')
    const withSnacks = bankOf(1)[0]
    expect(clueText(withSnacks, { kind: 'unlink', a: 'cat', b: 'cookies' })).toBe(
      'The child who has the cat does not like cookies.',
    )
    expect(clueText(withSnacks, { kind: 'link', a: 'cookies', b: 'fish' })).toBe(
      'The child who likes cookies has the fish.',
    )
    // Naming a clue the other way round says the same thing.
    expect(clueText(withSnacks, { kind: 'unlink', a: 'rabbit', b: 'mira' })).toBe(
      'Mira does not have the rabbit.',
    )
  })
})

describe('who has what — the levels', () => {
  it('has three levels that climb, with stable ids and three hints each', () => {
    expect(logicGrid.levels.map((l) => l.id)).toEqual(['one-grid', 'two-grids', 'four-children'])
    expect(logicGrid.levels.map((l) => l.difficulty)).toEqual([1, 2, 3])
    for (const level of logicGrid.levels) {
      expect(level.label[0]).toBe(level.label[0].toUpperCase())
      expect(level.label.slice(1)).toBe(level.label.slice(1).toLowerCase())
      expect(level.hints).toHaveLength(3)
      for (const hint of level.hints) {
        expect(hint.length).toBeGreaterThan(20)
        expect(hint.endsWith('.')).toBe(true)
        expect(hint).not.toMatch(/!/)
      }
      expect((level.config as GridConfig).bank.length).toBeGreaterThanOrEqual(2)
    }
  })

  /**
   * No `par`. The fewest possible marks is well defined — see "the shortest way
   * through" below — but it is not a target: it is reached only by ticking the
   * answer straight out, and the method the hints teach (cross out first, then
   * tick what is left) costs at least twice as much. A par here would score a
   * child down for solving it properly, so the level offers none.
   */
  it('offers no par, on purpose', () => {
    for (const level of logicGrid.levels) expect(level.par).toBeUndefined()
  })

  it('gives each level the grids it promises', () => {
    const sizes = [
      { level: 0, grids: 1, size: 3, clues: 3 },
      { level: 1, grids: 3, size: 3, clues: 6 },
      { level: 2, grids: 3, size: 4, clues: 8 },
    ]
    for (const { level, grids, size, clues } of sizes) {
      for (const scenario of bankOf(level)) {
        expect(categoryPairs(scenario)).toHaveLength(grids)
        expect(scenario.categories[0].items).toHaveLength(size)
        expect(scenario.clues).toHaveLength(clues)
      }
    }
  })

  it('keeps the hints honest about what the clues look like', () => {
    const links = (scenario: Scenario) => scenario.clues.filter((c) => c.kind === 'link').length
    // "Every clue here says 'does not' ... put all three in first."
    for (const scenario of bankOf(0)) {
      expect(links(scenario)).toBe(0)
      expect(scenario.clues).toHaveLength(3)
    }
    // "A clue with no name in it..." — every three-grid scenario has one.
    for (const scenario of [...bankOf(1), ...bankOf(2)]) {
      const nameless = scenario.clues.filter(
        (c) => categoryOf(scenario, c.a) !== 0 && categoryOf(scenario, c.b) !== 0,
      )
      expect(nameless.length).toBeGreaterThan(0)
    }
    // "Two of the clues tell you something for certain."
    for (const scenario of bankOf(2)) expect(links(scenario)).toBe(2)
  })

  it('never names the same child twice inside one scenario', () => {
    for (const scenario of everyScenario) {
      const names = scenario.categories[0].items.map((i) => i.label)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('says what it asks for', () => {
    expect(logicGrid.id).toBe('logic-grid')
    expect(logicGrid.reseedable).toBe(true)
    expect(logicGrid.instructions.length).toBeGreaterThanOrEqual(2)
    expect(logicGrid.instructions.length).toBeLessThanOrEqual(4)
    expect(logicGrid.engine.failure).toBeUndefined()
  })
})

describe('who has what — marking', () => {
  const state = blank(petsThree)

  it('cycles blank, cross, tick, blank', () => {
    expect(nextMark(null)).toBe('no')
    expect(nextMark('no')).toBe('yes')
    expect(nextMark('yes')).toBeNull()
  })

  it('writes one box and leaves the rest of the grid alone', () => {
    const after = reduce(state, { type: 'mark', pair: { a: 'mira', b: 'cat' }, value: 'yes' })
    expect(after).not.toBe(state)
    expect(markAt(after, 'mira', 'cat')).toBe('yes')
    // A tick must NOT fill in the row and column — that is the solver's job.
    expect(markAt(after, 'mira', 'fish')).toBeNull()
    expect(markAt(after, 'ned', 'cat')).toBeNull()
    expect(Object.keys(after.marks)).toHaveLength(1)
    expect(after.scenario).toBe(state.scenario)
  })

  it('reads a box the same whichever way round it is named', () => {
    const after = reduce(state, { type: 'mark', pair: { a: 'cat', b: 'mira' }, value: 'no' })
    expect(markAt(after, 'mira', 'cat')).toBe('no')
    expect(cellKey({ a: 'mira', b: 'cat' })).toBe(cellKey({ a: 'cat', b: 'mira' }))
  })

  /**
   * The identity invariant. A rejected tap must come back as the *same object*
   * or the shell records a move that never happened.
   */
  it('returns the identical state for every action that changes nothing', () => {
    // A busy board, so an identical return cannot be an accident of emptiness.
    const busy = [
      { pair: { a: 'mira', b: 'cat' }, value: 'yes' as Mark },
      { pair: { a: 'ned', b: 'rabbit' }, value: 'no' as Mark },
    ].reduce((acc, m) => reduce(acc, { type: 'mark', ...m }), state)
    expect(Object.keys(busy.marks)).toHaveLength(2)

    // Writing what the box already holds — blank, cross and tick alike.
    const already: GridAction[] = [
      { type: 'mark', pair: { a: 'mira', b: 'cat' }, value: 'yes' },
      { type: 'mark', pair: { a: 'cat', b: 'mira' }, value: 'yes' },
      { type: 'mark', pair: { a: 'ned', b: 'rabbit' }, value: 'no' },
      { type: 'mark', pair: { a: 'mira', b: 'fish' }, value: null },
    ]
    for (const action of already) {
      expect(reduce(busy, action), JSON.stringify(action)).toBe(busy)
    }
    // Clearing a box that is already blank, on an empty board and a busy one.
    expect(reduce(state, { type: 'mark', pair: { a: 'ola', b: 'fish' }, value: null })).toBe(state)

    // Never a box on any grid, whatever the board already holds.
    const noop: GridAction[] = [
      // Two items from the same list.
      { type: 'mark', pair: { a: 'mira', b: 'ned' }, value: 'no' },
      { type: 'mark', pair: { a: 'cat', b: 'fish' }, value: 'yes' },
      // The same item twice.
      { type: 'mark', pair: { a: 'mira', b: 'mira' }, value: 'yes' },
      // Nothing called that — on either side, or on both.
      { type: 'mark', pair: { a: 'mira', b: 'llama' }, value: 'no' },
      { type: 'mark', pair: { a: 'llama', b: 'cat' }, value: 'no' },
      { type: 'mark', pair: { a: 'llama', b: 'walrus' }, value: 'yes' },
      { type: 'mark', pair: { a: '', b: '' }, value: 'no' },
      // An item from a different scenario altogether.
      { type: 'mark', pair: { a: 'mira', b: 'crown' }, value: 'no' },
    ]
    for (const action of noop) {
      expect(reduce(busy, action), JSON.stringify(action)).toBe(busy)
      expect(reduce(state, action), JSON.stringify(action)).toBe(state)
    }
    // An action this puzzle does not have at all.
    expect(reduce(busy, { type: 'wiggle' } as unknown as GridAction)).toBe(busy)
  })

  it('never touches the state it was handed', () => {
    const frozen: GridState = Object.freeze({
      scenario: petsThree,
      marks: Object.freeze({ [cellKey({ a: 'mira', b: 'cat' })]: 'no' as const }),
    })
    const after = reduce(frozen, { type: 'mark', pair: { a: 'mira', b: 'cat' }, value: 'yes' })
    expect(after).not.toBe(frozen)
    expect(markAt(frozen, 'mira', 'cat')).toBe('no')
    expect(markAt(after, 'mira', 'cat')).toBe('yes')
    const cleared = reduce(after, { type: 'mark', pair: { a: 'mira', b: 'cat' }, value: null })
    expect(cleared.marks).toEqual({})
    expect(markAt(after, 'mira', 'cat')).toBe('yes')
  })

  /** What the shell rewinds through has to still say what it said at the time. */
  it('leaves every earlier state untouched, so the move tape stays true', () => {
    const scenario = bankOf(2)[0]
    const cells = everyCell(scenario)
    const values: Mark[] = [null, 'no', 'yes']
    const rng = makeRng(11)
    const tape: GridState[] = [blank(scenario)]
    const written: string[] = [JSON.stringify(tape[0].marks)]
    for (let i = 0; i < 300; i++) {
      const here = tape[tape.length - 1]
      const pair = cells[Math.floor(rng() * cells.length)]
      const next = reduce(here, {
        type: 'mark',
        pair,
        value: values[Math.floor(rng() * values.length)],
      })
      if (next === here) continue
      tape.push(next)
      written.push(JSON.stringify(next.marks))
    }
    expect(tape.length).toBeGreaterThan(50)
    // No step reached back and changed one that came before it.
    tape.forEach((step, i) => expect(JSON.stringify(step.marks)).toBe(written[i]))
    // And every recorded move really is a new state.
    expect(new Set(tape).size).toBe(tape.length)
  })

  it('clears a box back to blank and drops the entry', () => {
    const crossed = reduce(state, { type: 'mark', pair: { a: 'mira', b: 'cat' }, value: 'no' })
    const cleared = reduce(crossed, { type: 'mark', pair: { a: 'mira', b: 'cat' }, value: null })
    expect(cleared).not.toBe(crossed)
    expect(cleared.marks).toEqual({})
  })

  it('describes a mark the way the move tape should read it', () => {
    const cross: GridAction = { type: 'mark', pair: { a: 'mira', b: 'rabbit' }, value: 'no' }
    expect(describeMove(state, reduce(state, cross), cross)).toBe('Crossed out Mira and the rabbit')
    const tick: GridAction = { type: 'mark', pair: { a: 'rabbit', b: 'mira' }, value: 'yes' }
    expect(describeMove(state, reduce(state, tick), tick)).toBe('Ticked Mira and the rabbit')
    const clear: GridAction = { type: 'mark', pair: { a: 'mira', b: 'rabbit' }, value: null }
    expect(describeMove(state, state, clear)).toBe('Cleared Mira and the rabbit')
    // Two things, with no child named: the box is still named by both of them,
    // in the order the grids put them in.
    const across = blank(bankOf(1)[0])
    const pair: GridAction = { type: 'mark', pair: { a: 'cat', b: 'bananas' }, value: 'yes' }
    expect(describeMove(across, across, pair)).toBe('Ticked the cat and bananas')
    const apart: GridAction = { type: 'mark', pair: { a: 'bananas', b: 'cat' }, value: 'no' }
    expect(describeMove(across, across, apart)).toBe('Crossed out the cat and bananas')
  })

  it('describes every mark a player can make, in past tense and plain words', () => {
    for (const scenario of everyScenario) {
      const start = blank(scenario)
      for (const pair of everyCell(scenario)) {
        for (const value of ['no', 'yes', null] as Mark[]) {
          const action: GridAction = { type: 'mark', pair, value }
          const line = describeMove(start, reduce(start, action), action)
          expect(line.length).toBeGreaterThan(8)
          expect(line).not.toMatch(/undefined|\[object|!/)
          expect(line[0]).toBe(line[0].toUpperCase())
        }
      }
    }
  })
})

describe('who has what — knowing when it is done', () => {
  for (const scenario of everyScenario) {
    it(`"${scenario.id}" is unsolved empty and solved once every true pair is ticked`, () => {
      expect(isSolved(blank(scenario))).toBe(false)
      expect(isSolved(done(scenario))).toBe(true)
    })

    it(`"${scenario.id}" is not done while any tick is missing`, () => {
      const full = done(scenario)
      for (const key of Object.keys(full.marks)) {
        const short: GridState = { ...full, marks: { ...full.marks } }
        delete short.marks[key]
        expect(isSolved(short)).toBe(false)
      }
    })

    it(`"${scenario.id}" is not done while a whole grid is untouched`, () => {
      const full = done(scenario)
      for (const [i, j] of categoryPairs(scenario)) {
        const marks = { ...full.marks }
        for (const row of scenario.categories[i].items) {
          for (const col of scenario.categories[j].items) delete marks[cellKey({ a: row.id, b: col.id })]
        }
        expect(isSolved({ ...full, marks })).toBe(false)
      }
    })

    it(`"${scenario.id}" treats crosses as working notes, not as answers`, () => {
      // Cross every box that is not a true pairing: still solved.
      let state = done(scenario)
      for (const pair of everyCell(scenario)) {
        if (markAt(state, pair.a, pair.b) === null) {
          state = reduce(state, { type: 'mark', pair, value: 'no' })
        }
      }
      expect(isSolved(state)).toBe(true)
      // And a grid of nothing but crosses is not an answer.
      const crossesOnly: GridState = {
        scenario,
        marks: Object.fromEntries(Object.keys(state.marks).map((k) => [k, 'no' as const])),
      }
      expect(isSolved(crossesOnly)).toBe(false)
    })

    it(`"${scenario.id}" refuses every wrong tick, one box at a time`, () => {
      const full = done(scenario)
      for (const pair of everyCell(scenario)) {
        if (markAt(full, pair.a, pair.b) === 'yes') continue
        // A ninth tick anywhere else breaks a row and a column.
        const extra = reduce(full, { type: 'mark', pair, value: 'yes' })
        expect(extra).not.toBe(full)
        expect(isSolved(extra), `${pair.a} + ${pair.b}`).toBe(false)
      }
    })
  }

  it('refuses a set of ticks that is tidy but untrue', () => {
    const swapped: GridState = {
      scenario: petsThree,
      marks: {
        [cellKey({ a: 'mira', b: 'rabbit' })]: 'yes',
        [cellKey({ a: 'ned', b: 'cat' })]: 'yes',
        [cellKey({ a: 'ola', b: 'fish' })]: 'yes',
      },
    }
    // One tick per row and per column, and two of them are lies.
    expect(isSolved(swapped)).toBe(false)
  })
})

describe('who has what — the shortest way through', () => {
  // Every box of a 3x3 grid, at all three values: 3^9 states, well inside BFS.
  for (const scenario of bankOf(0)) {
    it(`"${scenario.id}" cannot be finished in fewer than ${fewestMarks(scenario)} marks`, () => {
      const cells = everyCell(scenario)
      const path = shortestSolution<GridState, GridAction>({
        start: blank(scenario),
        moves: () =>
          cells.flatMap((pair) =>
            (['no', 'yes', null] as const).map((value) => ({ type: 'mark' as const, pair, value })),
          ),
        apply: reduce,
        key: (s) =>
          Object.keys(s.marks)
            .sort()
            .map((k) => `${k}=${s.marks[k]}`)
            .join(','),
        solved: isSolved,
      })
      expect(path).not.toBeNull()
      expect(path).toHaveLength(fewestMarks(scenario))
      expect(fewestMarks(scenario)).toBe(3)
      // Every one of those marks is a tick, and each one is a true pairing.
      for (const action of path ?? []) expect(action.value).toBe('yes')
    })
  }

  /**
   * The bigger levels are 3^27 and 3^48 states, far past BFS, so the bound is
   * argued instead: one action writes one box, and a solved board needs one
   * tick in every row of every grid. Both halves are checked here.
   */
  for (const scenario of everyScenario) {
    it(`"${scenario.id}" needs exactly ${fewestMarks(scenario)} ticks, no more and no fewer`, () => {
      const { state, moves } = filledIn(scenario)
      expect(moves).toBe(fewestMarks(scenario))
      expect(isSolved(state)).toBe(true)
      const ticks = Object.values(state.marks).filter((m) => m === 'yes')
      expect(ticks).toHaveLength(fewestMarks(scenario))
      // No solved board can hold fewer ticks than that, however it was reached.
      let crossed = state
      for (const pair of everyCell(scenario)) {
        if (markAt(crossed, pair.a, pair.b) === null) {
          crossed = reduce(crossed, { type: 'mark', pair, value: 'no' })
        }
      }
      expect(Object.values(crossed.marks).filter((m) => m === 'yes')).toHaveLength(
        fewestMarks(scenario),
      )
    })
  }
})

describe('who has what — reseeding', () => {
  it('gives a fair, solvable puzzle for every seed', () => {
    const seen = new Map<string, Set<string>>()
    for (const level of logicGrid.levels) {
      const ids = new Set<string>()
      const bank = (level.config as GridConfig).bank
      for (let seed = 1; seed <= 60; seed++) {
        const state = init(level, makeRng(seed * 7919 + 3))
        const scenario = state.scenario
        ids.add(scenario.id)
        const source = bank.find((s) => s.id === scenario.id)
        expect(source, `seed ${seed} produced an unknown scenario`).toBeDefined()
        // Shuffling the rows and columns must not disturb the deduction.
        expect(solveScenario(scenario)).toHaveLength(1)
        expect(eliminate(scenario.categories, scenario.clues)).toBe('solved')
        expect(shape(scenario.solution)).toBe(shape(source?.solution ?? []))
        scenario.categories.forEach((cat, c) => {
          expect(cat.items.map((i) => i.id).sort()).toEqual(
            (source?.categories[c].items ?? []).map((i) => i.id).sort(),
          )
        })
        // A fresh start: nothing written, nothing solved, and a real puzzle
        // still to do — never one mark from the end.
        expect(state.marks).toEqual({})
        expect(isSolved(state)).toBe(false)
        expect(fewestMarks(scenario)).toBeGreaterThanOrEqual(3)
        expect(isSolved(done(scenario))).toBe(true)
      }
      seen.set(level.id, ids)
    }
    // Reseeding is worth offering: every level really does reach its whole bank.
    for (const level of logicGrid.levels) {
      const bank = (level.config as GridConfig).bank
      expect(seen.get(level.id)?.size).toBe(bank.length)
    }
  })

  it('leaves the bank exactly as it found it', () => {
    const before = JSON.stringify(everyScenario)
    for (let seed = 0; seed < 60; seed++) {
      for (const level of logicGrid.levels) {
        const state = init(level, makeRng(seed))
        for (const pair of everyCell(state.scenario)) {
          reduce(state, { type: 'mark', pair, value: 'yes' })
        }
      }
    }
    expect(JSON.stringify(everyScenario)).toBe(before)
  })

  it('builds the same puzzle again from the same seed, and a different one from another', () => {
    const level = logicGrid.levels[2]
    expect(JSON.stringify(init(level, makeRng(7)))).toBe(JSON.stringify(init(level, makeRng(7))))
    const many = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(init(level, makeRng(i + 1)))),
    )
    expect(many.size).toBeGreaterThan(1)
  })
})

describe('who has what — the elimination checker itself', () => {
  it('says "stuck" when the clues leave a real choice', () => {
    const thin: Clue[] = [{ kind: 'unlink', a: 'mira', b: 'rabbit' }]
    expect(eliminate(petsThree.categories, thin)).toBe('stuck')
    expect(solutionsFor(petsThree.categories, thin).length).toBeGreaterThan(1)
  })

  it('says "contradiction" when two clues fight', () => {
    const clash: Clue[] = [
      { kind: 'link', a: 'mira', b: 'rabbit' },
      { kind: 'unlink', a: 'mira', b: 'rabbit' },
    ]
    expect(eliminate(petsThree.categories, clash)).toBe('contradiction')
    expect(solutionsFor(petsThree.categories, clash)).toHaveLength(0)
  })
})

describe('who has what — the board', () => {
  afterEach(cleanup)

  const scenario = bankOf(1)[0]
  const draw = (state: GridState, locked = false) => {
    const sent: GridAction[] = []
    render(
      createElement(Board, { state, locked, dispatch: (action: GridAction) => sent.push(action) }),
    )
    return sent
  }

  const boxes = () => screen.getAllByRole('button', { name: /^.+ and .+: (empty|crossed out|ticked)/ })

  it('draws a box for every pairing and a line for every clue', () => {
    draw(blank(scenario))
    expect(boxes()).toHaveLength(27)
    expect(screen.getAllByRole('listitem')).toHaveLength(scenario.clues.length)
    expect(screen.getByRole('list', { name: 'Clues' })).toBeTruthy()
  })

  it('turns one tap into exactly one mark', () => {
    const sent = draw(blank(scenario))
    fireEvent.click(
      screen.getByRole('button', { name: 'Mira and the rabbit: empty. Tap to cross it out.' }),
    )
    expect(sent).toEqual([{ type: 'mark', pair: { a: 'mira', b: 'rabbit' }, value: 'no' }])
  })

  it('offers the next mark in the cycle for whatever the box already holds', () => {
    const crossed = reduce(blank(scenario), {
      type: 'mark',
      pair: { a: 'mira', b: 'rabbit' },
      value: 'no',
    })
    const sent = draw(crossed)
    fireEvent.click(
      screen.getByRole('button', { name: 'Mira and the rabbit: crossed out. Tap to tick it.' }),
    )
    expect(sent).toEqual([{ type: 'mark', pair: { a: 'mira', b: 'rabbit' }, value: 'yes' }])
    cleanup()
    const ticked = reduce(crossed, {
      type: 'mark',
      pair: { a: 'mira', b: 'rabbit' },
      value: 'yes',
    })
    const again = draw(ticked)
    fireEvent.click(
      screen.getByRole('button', { name: 'Mira and the rabbit: ticked. Tap to clear it.' }),
    )
    expect(again).toEqual([{ type: 'mark', pair: { a: 'mira', b: 'rabbit' }, value: null }])
  })

  /** No local state at all: the same state must always draw the same board. */
  it('is a pure picture of the state it is given', () => {
    const ticked = reduce(blank(scenario), {
      type: 'mark',
      pair: { a: 'cat', b: 'bananas' },
      value: 'yes',
    })
    draw(ticked)
    const first = document.body.innerHTML
    // Tap every box, then draw the very same state again.
    for (const box of boxes()) fireEvent.click(box)
    cleanup()
    draw(ticked)
    expect(document.body.innerHTML).toBe(first)
  })

  it('ignores every input while locked', () => {
    const sent = draw(blank(scenario), true)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(27)
    for (const button of buttons) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(sent).toEqual([])
  })

  it('makes a real button of every box, and of nothing else', () => {
    draw(blank(scenario))
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(27)
    for (const button of buttons) {
      expect(button.getAttribute('type')).toBe('button')
      expect(button.className).toContain('u-press')
      const label = button.getAttribute('aria-label') ?? ''
      expect(label).toMatch(/^.+ and .+: (empty|crossed out|ticked)\. Tap to .+\.$/)
    }
    // "A shadow means you can press it" — so nothing else may wear one.
    for (const pressable of document.querySelectorAll('.u-press')) {
      expect(pressable.tagName).toBe('BUTTON')
    }
  })

  it('names every box after the two things it joins', () => {
    draw(blank(scenario))
    for (const [i, j] of categoryPairs(scenario)) {
      for (const row of scenario.categories[i].items) {
        for (const col of scenario.categories[j].items) {
          const a = `${scenario.categories[i].det}${row.label}`
          const b = `${scenario.categories[j].det}${col.label}`
          expect(
            screen.getByRole('button', { name: `${a} and ${b}: empty. Tap to cross it out.` }),
          ).toBeTruthy()
        }
      }
    }
  })

  it('spells out every clue, as words and not only as pictures', () => {
    draw(blank(scenario))
    const items = screen.getAllByRole('listitem')
    scenario.clues.forEach((clue, i) => {
      const said = (items[i].textContent ?? '').replace(/^\d+/, '').trim()
      expect(said).toBe(clueText(scenario, clue))
    })
  })

  it('leaves the shell to draw the title, the count and the win', () => {
    draw(done(scenario), true)
    expect(document.querySelector('h1, h2, h3')).toBeNull()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\bmoves?\b|\breset\b|\bundo\b|\bhints?\b|\bsolved\b|\bpar\b/i)
  })

  it('draws every grid a scenario has, whatever the level', () => {
    for (const level of logicGrid.levels) {
      for (const s of (level.config as GridConfig).bank) {
        cleanup()
        draw(blank(s))
        expect(screen.getAllByRole('table')).toHaveLength(categoryPairs(s).length)
        expect(boxes()).toHaveLength(
          categoryPairs(s).length * s.categories[0].items.length ** 2,
        )
      }
    }
  })
})

describe('who has what — the stylesheet', () => {
  // jsdom's URL is not node's, so take the directory off the module url by hand.
  const here = import.meta.url.replace(/^file:\/\//, '').replace(/[^/]+$/, '')
  const css = readFileSync(`${here}board.module.css`, 'utf8')

  it('reaches for a token every time and never for a raw value', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3}/)
    expect(css).not.toMatch(/\b\d+(\.\d+)?m?s\b/)
    // The module declares layout; every voice on this board comes from a utility.
    expect(css.match(/font-family:[^;]+/g) ?? []).toEqual([])
    // No emoji, and no second display face.
    expect(css).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })

  it('keeps a box big enough for an eight-year-old to hit', () => {
    const floor = css.match(/--cell: clamp\((\d+(?:\.\d+)?)rem/)
    expect(floor).not.toBeNull()
    expect(Number(floor?.[1]) * 16).toBeGreaterThanOrEqual(44)
  })
})
