import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shortestSolution } from '../../lib/search'
import { cues } from '../../lib/motion'
import { riverCrossing } from './index'
import { Board } from './Board'
import type { Bank, RiverAction, RiverState } from './logic'
import { failure, failureOf, init, isSolved, legalMoves, reduce } from './logic'
import s from './board.module.css'

const solve = (state: RiverState) =>
  shortestSolution<RiverState, RiverAction>({
    start: state,
    moves: (s) => legalMoves(s).map((passengers) => ({ type: 'cross', passengers })),
    apply: reduce,
    key: (s) => `${s.at.join('')}|${s.boat}`,
    solved: isSolved,
    invalid: (s) => failure(s) !== null,
  })

describe('river crossing', () => {
  for (const level of riverCrossing.levels) {
    it(`"${level.label}" is solvable in exactly par (${level.par}) crossings`, () => {
      const path = solve(init(level))
      expect(path).not.toBeNull()
      expect(path?.length).toBe(level.par)
    })

    it(`"${level.label}" starts safe and unsolved`, () => {
      const state = init(level)
      expect(failure(state)).toBeNull()
      expect(isSolved(state)).toBe(false)
      expect(state.at.every((b) => b === 'near')).toBe(true)
    })

    it(`"${level.label}" rejects impossible crossings without changing state`, () => {
      const state = init(level)
      expect(reduce(state, { type: 'cross', passengers: [] })).toBe(state)
      expect(reduce(state, { type: 'cross', passengers: [0, 0] })).toBe(state)
      const tooMany = state.cfg.items.map((_, i) => i)
      if (tooMany.length > state.cfg.capacity) {
        expect(reduce(state, { type: 'cross', passengers: tooMany })).toBe(state)
      }
    })
  }

  it('lets the goat eat the cabbage when it is left to', () => {
    const level = riverCrossing.levels[0]
    const start = init(level)
    // items: 0 you, 1 wolf, 2 goat, 3 cabbage. Take the wolf and leave goat + cabbage.
    const after = reduce(start, { type: 'cross', passengers: [0, 1] })
    expect(after).not.toBe(start)
    expect(failure(after)).toBe('The goat ate the cabbage.')
  })

  it('keeps the peace while the guardian is on the bank', () => {
    const level = riverCrossing.levels[0]
    expect(failure(init(level))).toBeNull()
    expect(failureOf(init(level))).toBeNull()
  })

  it('names the pieces its sentence is about, so nobody has to read the sentence', () => {
    const level = riverCrossing.levels[0]
    const after = reduce(init(level), { type: 'cross', passengers: [0, 1] })
    expect(failureOf(after)).toEqual({
      message: 'The goat ate the cabbage.',
      blamed: ['goat', 'cabbage'],
    })
    // The shell is handed the sentence and nothing else, as it always was.
    expect(failure(after)).toBe('The goat ate the cabbage.')
  })

  it('scatters the mice when cats outnumber them', () => {
    const level = riverCrossing.levels[2]
    const start = init(level)
    // items: 0..2 mice, 3..5 cats. Send two mice across, leaving 1 mouse with 3 cats.
    const after = reduce(start, { type: 'cross', passengers: [0, 1] })
    expect(failure(after)).toMatch(/more cats than mice/)
    // Everyone the sentence counts stands on the bank that broke the count.
    // The two mice that got away are not blamed for it.
    expect(failureOf(after)?.blamed).toEqual(['cat-0', 'cat-1', 'cat-2', 'mouse-2'])
  })

  it('never counts a no-op as a move', () => {
    const state = init(riverCrossing.levels[0])
    expect(reduce(state, { type: 'cross', passengers: [1] })).toBe(state) // wolf cannot row
  })
})

/* ============================================================
   The board. Two banks one above the other, and the boat
   itself as the control that crosses between them.
   ============================================================ */

const paint = (state: RiverState, locked = false) => {
  const dispatch = vi.fn()
  render(createElement(Board, { state, dispatch, locked }))
  return {
    dispatch,
    buttons: () => screen.getAllByRole('button') as HTMLButtonElement[],
    by: (name: RegExp) => screen.getByRole('button', { name }),
  }
}

describe('river crossing board', () => {
  afterEach(cleanup)
  const classic = riverCrossing.levels[0]
  const catsAndMice = riverCrossing.levels[1]

  /** Who is standing in each place, in the order the board lays the places out. */
  const placesIn = (el: Element | null) =>
    [...(el?.children ?? [])].map((place) => place.textContent || '—')

  const bank = (side: Bank) =>
    placesIn(document.querySelector(`.${s.bank}[data-side="${side}"] .${s.pieces}`))

  const inTheBoat = () => placesIn(document.querySelector(`.${s.cargo}`))

  it('stands everyone on the near bank, with the rower already aboard', () => {
    const { by } = paint(init(classic))
    expect(by(/put the wolf in the boat/i)).toBeEnabled()
    expect(by(/put the goat in the boat/i)).toBeEnabled()
    expect(by(/put the cabbage in the boat/i)).toBeEnabled()
    // The only piece that can row never leaves the boat, so it is not a control.
    expect(by(/you, rowing the boat/i)).toBeDisabled()
  })

  it('keeps a creature’s place while the creature is in the boat', () => {
    const { by } = paint(init(catsAndMice))
    expect(bank('near')).toEqual(['Pip', 'Nib', 'Tom', 'Kit'])
    expect(bank('far')).toEqual(['—', '—', '—', '—'])

    // The whole point of the places: the first tap must not move what the
    // second tap is already aimed at.
    fireEvent.click(by(/put pip in the boat/i))
    expect(bank('near')).toEqual(['—', 'Nib', 'Tom', 'Kit'])
    fireEvent.click(by(/put kit in the boat/i))
    expect(bank('near')).toEqual(['—', 'Nib', 'Tom', '—'])
  })

  it('stands a creature in the same place on either bank', () => {
    // Pip and Kit have crossed. Nib and Tom have not moved an inch.
    paint(reduce(init(catsAndMice), { type: 'cross', passengers: [0, 3] }))
    expect(bank('far')).toEqual(['Pip', '—', '—', 'Kit'])
    expect(bank('near')).toEqual(['—', 'Nib', 'Tom', '—'])
  })

  it('keeps a seat in the boat, so taking one passenger out leaves the other', () => {
    const { by } = paint(init(catsAndMice))
    fireEvent.click(by(/put pip in the boat/i))
    fireEvent.click(by(/put kit in the boat/i))
    expect(inTheBoat()).toEqual(['Pip', 'Kit'])
    fireEvent.click(by(/take pip out of the boat/i))
    expect(inTheBoat()).toEqual(['—', 'Kit'])
  })

  it('holds no place ashore for a pilot who never leaves the boat', () => {
    paint(init(classic))
    expect(bank('near')).toEqual(['Wolf', 'Goat', 'Cabbage'])
    expect(inTheBoat()).toEqual(['You', '—'])
  })

  it('loading the boat is not a move', () => {
    const { dispatch, by } = paint(init(classic))
    fireEvent.click(by(/put the goat in the boat/i))
    expect(dispatch).not.toHaveBeenCalled()
    expect(by(/take the goat out of the boat/i)).toBeInTheDocument()
  })

  it('crosses on one tap of the boat, carrying whatever is in it', () => {
    const { dispatch, by } = paint(init(classic))
    fireEvent.click(by(/put the goat in the boat/i))
    fireEvent.click(by(/^row across to the far side$/i))
    expect(dispatch).toHaveBeenCalledTimes(1)
    // 0 is you, 2 is the goat.
    expect(dispatch).toHaveBeenCalledWith({ type: 'cross', passengers: [0, 2] })
  })

  it('will not row a boat that nobody in it can row', () => {
    // Cats and mice have no fixed pilot, so an empty boat is going nowhere.
    const { by } = paint(init(riverCrossing.levels[1]))
    expect(by(/^row across to the far side$/i)).toBeDisabled()
  })

  it('ignores every input while locked', () => {
    const { dispatch, buttons } = paint(init(classic), true)
    for (const b of buttons()) {
      expect(b).toBeDisabled()
      fireEvent.click(b)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  const shaking = () =>
    [...document.querySelectorAll('[class]')]
      .filter((el) => el.classList.contains(cues.shake))
      .map((el) => el.closest('button')?.getAttribute('aria-label'))

  it('shakes the two animals the dead end names, and nobody else', () => {
    // The wolf goes across, and the goat is left standing with the cabbage.
    const dead = reduce(init(classic), { type: 'cross', passengers: [0, 1] })
    paint(dead, true)
    expect(shaking()).toEqual(['Goat, this side', 'Cabbage, this side'])
  })

  it('shakes every cat and mouse on the bank that broke the count', () => {
    const level = riverCrossing.levels[2]
    const dead = reduce(init(level), { type: 'cross', passengers: [0, 1] })
    paint(dead, true)
    expect(shaking().sort()).toEqual([
      'Bo, this side',
      'Kit, this side',
      'Tom, this side',
      'Tuck, this side',
    ])
  })

  it('shakes nothing while both banks are safe', () => {
    paint(reduce(init(classic), { type: 'cross', passengers: [0, 2] }))
    expect(shaking()).toEqual([])
  })

  it('leaves the title, hints, move count and win message to the shell', () => {
    paint(init(classic))
    const text = document.body.textContent ?? ''
    expect(text).not.toContain(riverCrossing.title)
    expect(text).not.toContain(riverCrossing.tagline)
    for (const line of riverCrossing.instructions) expect(text).not.toContain(line)
    for (const hint of classic.hints) expect(text).not.toContain(hint)
    expect(text).not.toMatch(/\b(par|undo|reset|solved|well done)\b/i)
  })
})
