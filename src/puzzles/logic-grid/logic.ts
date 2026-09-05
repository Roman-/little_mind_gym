import { randInt, shuffled } from '../../lib/rng'
import type { PictoName } from '../../components/pictogram-art'
import type { PuzzleLevel, Rng } from '../../lib/types'

export interface GridItem {
  /** Unique across the whole scenario — a cell is named by two item ids. */
  id: string
  /** As it appears in a clue: 'Mira', 'rabbit', 'top hat'. */
  label: string
  /** The OpenMoji picture on this item's plate. */
  art: PictoName
}

export interface GridCategory {
  id: string
  /** Heading for this side of a grid: 'Children', 'Pets'. */
  label: string
  /** Goes in front of an item name: 'the ' or ''. */
  det: string
  /** Third person: 'has', 'likes', 'wears'. */
  verb: string
  /** Bare form, for 'does not ___': 'have', 'like', 'wear'. */
  verbPlain: string
  /** Names a child by one of these items: 'The child ' + connector + ' rabbit'. */
  connector: string
  items: GridItem[]
}

/** Two items belong to the same child ('link') or cannot ('unlink'). */
export interface Clue {
  kind: 'link' | 'unlink'
  a: string
  b: string
}

export interface Scenario {
  id: string
  /** categories[0] is always the children. */
  categories: GridCategory[]
  clues: Clue[]
  /** The truth. One row per child, one item id per category, in category order. */
  solution: string[][]
}

export type Mark = 'yes' | 'no' | null
export type Written = Exclude<Mark, null>

/** One box in one grid, named by the two items it joins. Order does not matter. */
export interface CellPair {
  a: string
  b: string
}

export interface GridState {
  scenario: Scenario
  /** Only 'yes' and 'no' are stored; a blank box has no entry. */
  marks: Record<string, Written>
}

export type GridAction = { type: 'mark'; pair: CellPair; value: Mark }

export interface GridConfig {
  /** init picks one of these. Every entry must be uniquely solvable. */
  bank: Scenario[]
}

/* ============================================================
   Looking things up
   ============================================================ */

export function cellKey(pair: CellPair): string {
  return pair.a < pair.b ? `${pair.a}~${pair.b}` : `${pair.b}~${pair.a}`
}

/** Index of the category holding this item, or -1. */
export function categoryOf(scenario: Scenario, itemId: string): number {
  for (let c = 0; c < scenario.categories.length; c++) {
    if (scenario.categories[c].items.some((i) => i.id === itemId)) return c
  }
  return -1
}

export function itemOf(scenario: Scenario, itemId: string): GridItem {
  for (const cat of scenario.categories) {
    const found = cat.items.find((i) => i.id === itemId)
    if (found) return found
  }
  throw new Error(`logic-grid: no item called "${itemId}"`)
}

export function markAt(state: GridState, a: string, b: string): Mark {
  return state.marks[cellKey({ a, b })] ?? null
}

/** Every grid the board draws: [0,1], [0,2], [1,2] for three categories. */
export function categoryPairs(scenario: Scenario): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < scenario.categories.length; i++) {
    for (let j = i + 1; j < scenario.categories.length; j++) out.push([i, j])
  }
  return out
}

/** True when the two items really do belong to the same child. */
export function belongTogether(scenario: Scenario, a: string, b: string): boolean {
  return scenario.solution.some((row) => row.includes(a) && row.includes(b))
}

/* ============================================================
   The engine
   ============================================================ */

export function init(level: PuzzleLevel<GridConfig>, rng: Rng): GridState {
  const bank = level.config.bank
  const base = bank[randInt(rng, bank.length)]
  // The order of the names down the side and the items across the top is
  // cosmetic, so shuffling it gives a fresh-looking grid without touching
  // the deduction.
  const categories = base.categories.map((cat) => ({ ...cat, items: shuffled(rng, cat.items) }))
  return { scenario: { ...base, categories }, marks: {} }
}

export function reduce(state: GridState, action: GridAction): GridState {
  if (action.type !== 'mark') return state
  const { a, b } = action.pair
  const ca = categoryOf(state.scenario, a)
  const cb = categoryOf(state.scenario, b)
  // Not a real box: unknown item, or two items from the same list.
  if (ca < 0 || cb < 0 || ca === cb) return state
  const key = cellKey(action.pair)
  const current = state.marks[key] ?? null
  if (current === action.value) return state
  const marks = { ...state.marks }
  if (action.value === null) delete marks[key]
  else marks[key] = action.value
  return { ...state, marks }
}

/**
 * Every grid finished: one tick in each row and each column, and every tick
 * true. Crosses are the solver's working notes, so they are not checked.
 */
export function isSolved(state: GridState): boolean {
  const { scenario } = state
  for (const [i, j] of categoryPairs(scenario)) {
    const rows = scenario.categories[i].items
    const cols = scenario.categories[j].items
    for (const r of rows) {
      let ticks = 0
      for (const c of cols) {
        if (markAt(state, r.id, c.id) !== 'yes') continue
        ticks++
        if (!belongTogether(scenario, r.id, c.id)) return false
      }
      if (ticks !== 1) return false
    }
    for (const c of cols) {
      let ticks = 0
      for (const r of rows) if (markAt(state, r.id, c.id) === 'yes') ticks++
      if (ticks !== 1) return false
    }
  }
  return true
}

/** What the next tap on a box writes: blank, cross, tick, blank. */
export function nextMark(current: Mark): Mark {
  if (current === null) return 'no'
  if (current === 'no') return 'yes'
  return null
}

export function describeMove(prev: GridState, _next: GridState, action: GridAction): string {
  const { scenario } = prev
  let { a, b } = action.pair
  // Put the child (or the earlier category) first, so the box is named the way
  // a person would read it off the grid.
  if (categoryOf(scenario, b) < categoryOf(scenario, a)) [a, b] = [b, a]
  const first = `${scenario.categories[categoryOf(scenario, a)].det}${itemOf(scenario, a).label}`
  const second = `${scenario.categories[categoryOf(scenario, b)].det}${itemOf(scenario, b).label}`
  const box = `${first} and ${second}`
  if (action.value === 'yes') return `Ticked ${box}`
  if (action.value === 'no') return `Crossed out ${box}`
  return `Cleared ${box}`
}

/**
 * The fewest marks that can ever finish a scenario: one tick per row of every
 * grid, and nothing else. `reduce` writes one box per action, and `isSolved`
 * needs every one of those ticks, so no shorter run of actions exists.
 */
export function fewestMarks(scenario: Scenario): number {
  return scenario.categories[0].items.length * categoryPairs(scenario).length
}

/* ============================================================
   Clues, as words and as glyphs
   ============================================================ */

export type ClueToken = { text: string } | { item: GridItem }

/**
 * A clue broken into words and items, so the board can draw the same glyph
 * inside the sentence that it draws on the edge of the grid.
 */
export function clueTokens(scenario: Scenario, clue: Clue): ClueToken[] {
  let a = clue.a
  let b = clue.b
  let ia = categoryOf(scenario, a)
  let ib = categoryOf(scenario, b)
  if (ib === 0) {
    ;[a, b] = [b, a]
    ;[ia, ib] = [ib, ia]
  }
  const subject = scenario.categories[ia]
  const about = scenario.categories[ib]
  const tail: ClueToken[] =
    clue.kind === 'link'
      ? [{ text: ` ${about.verb} ${about.det}` }, { item: itemOf(scenario, b) }, { text: '.' }]
      : [
          { text: ` does not ${about.verbPlain} ${about.det}` },
          { item: itemOf(scenario, b) },
          { text: '.' },
        ]
  if (ia === 0) return [{ item: itemOf(scenario, a) }, ...tail]
  return [{ text: `The child ${subject.connector} ` }, { item: itemOf(scenario, a) }, ...tail]
}

export function clueText(scenario: Scenario, clue: Clue): string {
  return clueTokens(scenario, clue)
    .map((token) => ('text' in token ? token.text : token.item.label))
    .join('')
}

/* ============================================================
   Brute force, for the tests
   ============================================================ */

function permutations(n: number): number[][] {
  const out: number[][] = []
  const walk = (chosen: number[], left: number[]) => {
    if (left.length === 0) {
      out.push(chosen.slice())
      return
    }
    for (let i = 0; i < left.length; i++) {
      chosen.push(left[i])
      walk(
        chosen,
        left.filter((_, j) => j !== i),
      )
      chosen.pop()
    }
  }
  walk(
    [],
    Array.from({ length: n }, (_, i) => i),
  )
  return out
}

const holdsFor = (rows: string[][], clue: Clue): boolean => {
  const together = rows.some((row) => row.includes(clue.a) && row.includes(clue.b))
  return clue.kind === 'link' ? together : !together
}

/**
 * Every way of handing out the items that fits all the clues. Exhaustive:
 * one permutation of each category after the first.
 */
export function solutionsFor(categories: GridCategory[], clues: Clue[]): string[][][] {
  const n = categories[0].items.length
  const perms = permutations(n)
  const out: string[][][] = []
  const walk = (cat: number, chosen: number[][]) => {
    if (cat === categories.length) {
      const rows: string[][] = []
      for (let r = 0; r < n; r++) {
        const row = [categories[0].items[r].id]
        for (let c = 1; c < categories.length; c++) row.push(categories[c].items[chosen[c - 1][r]].id)
        rows.push(row)
      }
      if (clues.every((clue) => holdsFor(rows, clue))) out.push(rows)
      return
    }
    for (const perm of perms) {
      chosen.push(perm)
      walk(cat + 1, chosen)
      chosen.pop()
    }
  }
  walk(1, [])
  return out
}

export const solveScenario = (scenario: Scenario): string[][][] =>
  solutionsFor(scenario.categories, scenario.clues)

/* ============================================================
   Elimination, for the tests: can a child finish this by
   crossing out, with no guessing?
   ============================================================ */

export type Elimination = 'solved' | 'stuck' | 'contradiction'

interface Working {
  size: number
  count: number
  /** grid['i-j'][x][y], i < j. */
  grid: Record<string, Mark[][]>
}

function emptyWorking(categories: GridCategory[]): Working {
  const size = categories[0].items.length
  const grid: Record<string, Mark[][]> = {}
  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      grid[`${i}-${j}`] = Array.from({ length: size }, () => new Array<Mark>(size).fill(null))
    }
  }
  return { size, count: categories.length, grid }
}

const read = (b: Working, i: number, x: number, j: number, y: number): Mark =>
  i < j ? b.grid[`${i}-${j}`][x][y] : b.grid[`${j}-${i}`][y][x]

/** -1 contradiction, 0 already known, 1 written. Writing a tick writes its crosses. */
function write(b: Working, i: number, x: number, j: number, y: number, value: Written): number {
  const current = read(b, i, x, j, y)
  if (current === value) return 0
  if (current !== null) return -1
  if (i < j) b.grid[`${i}-${j}`][x][y] = value
  else b.grid[`${j}-${i}`][y][x] = value
  if (value === 'yes') {
    for (let y2 = 0; y2 < b.size; y2++) {
      if (y2 !== y && write(b, i, x, j, y2, 'no') < 0) return -1
    }
    for (let x2 = 0; x2 < b.size; x2++) {
      if (x2 !== x && write(b, i, x2, j, y, 'no') < 0) return -1
    }
  }
  return 1
}

/**
 * Applies the three moves an eight-year-old actually makes, over and over:
 *   1. a tick crosses out the rest of its row and column;
 *   2. a row (or column) with one box left standing gets the tick;
 *   3. a tick joins two rows of the puzzle, so anything known about one of
 *      them is known about the other.
 * No guessing, no case analysis. 'solved' means the clues alone are enough.
 */
export function eliminate(categories: GridCategory[], clues: Clue[]): Elimination {
  const scenario: Scenario = { id: 'probe', categories, clues, solution: [] }
  const b = emptyWorking(categories)
  for (const clue of clues) {
    const i = categoryOf(scenario, clue.a)
    const j = categoryOf(scenario, clue.b)
    const x = categories[i].items.findIndex((it) => it.id === clue.a)
    const y = categories[j].items.findIndex((it) => it.id === clue.b)
    if (write(b, i, x, j, y, clue.kind === 'link' ? 'yes' : 'no') < 0) return 'contradiction'
  }

  let changed = true
  while (changed) {
    changed = false
    // 2. last box standing, in both directions of every grid
    for (let i = 0; i < b.count; i++) {
      for (let j = 0; j < b.count; j++) {
        if (i === j) continue
        for (let x = 0; x < b.size; x++) {
          let open = -1
          let opens = 0
          let ticked = false
          for (let y = 0; y < b.size; y++) {
            const v = read(b, i, x, j, y)
            if (v === 'yes') ticked = true
            if (v === null) {
              opens++
              open = y
            }
          }
          if (!ticked && opens === 0) return 'contradiction'
          if (!ticked && opens === 1) {
            const r = write(b, i, x, j, open, 'yes')
            if (r < 0) return 'contradiction'
            if (r > 0) changed = true
          }
        }
      }
    }
    // 3. a tick merges two rows: copy everything known across
    for (let i = 0; i < b.count; i++) {
      for (let j = 0; j < b.count; j++) {
        if (i === j) continue
        for (let x = 0; x < b.size; x++) {
          for (let y = 0; y < b.size; y++) {
            if (read(b, i, x, j, y) !== 'yes') continue
            for (let k = 0; k < b.count; k++) {
              if (k === i || k === j) continue
              for (let z = 0; z < b.size; z++) {
                const here = read(b, i, x, k, z)
                const there = read(b, j, y, k, z)
                if (here !== null && there === null) {
                  if (write(b, j, y, k, z, here) < 0) return 'contradiction'
                  changed = true
                } else if (there !== null && here === null) {
                  if (write(b, i, x, k, z, there) < 0) return 'contradiction'
                  changed = true
                } else if (here !== null && there !== null && here !== there) {
                  return 'contradiction'
                }
              }
            }
          }
        }
      }
    }
  }

  for (const key of Object.keys(b.grid)) {
    for (const row of b.grid[key]) {
      for (const v of row) if (v === null) return 'stuck'
    }
  }
  return 'solved'
}

/* ============================================================
   The world: four small lists of things
   ============================================================ */

type CatMeta = Omit<GridCategory, 'items'>

const CHILDREN: CatMeta = {
  id: 'child',
  label: 'Children',
  det: '',
  // A child is never the far side of a clue, and no clue names one the long
  // way round, so these three are never spoken.
  verb: 'is',
  verbPlain: 'be',
  connector: 'who is called',
}
const PETS: CatMeta = {
  id: 'pet',
  label: 'Pets',
  det: 'the ',
  verb: 'has',
  verbPlain: 'have',
  connector: 'who has the',
}
const SNACKS: CatMeta = {
  id: 'snack',
  label: 'Snacks',
  det: '',
  verb: 'likes',
  verbPlain: 'like',
  connector: 'who likes',
}
const HATS: CatMeta = {
  id: 'hat',
  label: 'Hats',
  det: 'the ',
  verb: 'wears',
  verbPlain: 'wear',
  connector: 'who wears the',
}

/**
 * One picture per name, so the Mira of one puzzle is the Mira of the next.
 * Every scenario gets four different faces; logic.test.ts checks that.
 */
const CHILD_ART: Record<string, PictoName> = {
  Mira: 'child-girl',
  Ada: 'child-girl',
  Ned: 'child-boy',
  Finn: 'child-boy',
  Ben: 'child-boy',
  Ola: 'child-red',
  Zoe: 'child-red',
  Kai: 'child-red',
  Sam: 'child-curly',
  Ivy: 'child-curly',
}

const THINGS: Record<string, { label: string; art: PictoName }> = {
  rabbit: { label: 'rabbit', art: 'rabbit' },
  cat: { label: 'cat', art: 'cat' },
  fish: { label: 'fish', art: 'fish' },
  dog: { label: 'dog', art: 'dog' },
  apples: { label: 'apples', art: 'apple' },
  bananas: { label: 'bananas', art: 'banana' },
  grapes: { label: 'grapes', art: 'grapes' },
  cookies: { label: 'cookies', art: 'cookie' },
  'sun-hat': { label: 'sun hat', art: 'sun-hat' },
  cap: { label: 'cap', art: 'cap' },
  'top-hat': { label: 'top hat', art: 'top-hat' },
  crown: { label: 'crown', art: 'crown' },
}

function children(names: string[]): GridCategory {
  return {
    ...CHILDREN,
    items: names.map((name) => ({
      id: name.toLowerCase(),
      label: name,
      art: CHILD_ART[name],
    })),
  }
}

function things(meta: CatMeta, ids: string[]): GridCategory {
  return {
    ...meta,
    items: ids.map((id) => ({ id, label: THINGS[id].label, art: THINGS[id].art })),
  }
}

/* ============================================================
   The scenarios. Every one of them is checked in logic.test.ts:
   exactly one answer, no clue that could be dropped, and
   reachable by crossing out alone.
   ============================================================ */

export const petsThree: Scenario = {
  id: 'pets-three',
  categories: [children(['Mira', 'Ned', 'Ola']), things(PETS, ['rabbit', 'cat', 'fish'])],
  solution: [
    ['mira', 'cat'],
    ['ned', 'rabbit'],
    ['ola', 'fish'],
  ],
  clues: [
    { kind: 'unlink', a: 'mira', b: 'rabbit' },
    { kind: 'unlink', a: 'mira', b: 'fish' },
    { kind: 'unlink', a: 'ola', b: 'rabbit' },
  ],
}

export const hatsThree: Scenario = {
  id: 'hats-three',
  categories: [children(['Ada', 'Finn', 'Zoe']), things(HATS, ['sun-hat', 'cap', 'top-hat'])],
  solution: [
    ['ada', 'top-hat'],
    ['finn', 'cap'],
    ['zoe', 'sun-hat'],
  ],
  clues: [
    { kind: 'unlink', a: 'ada', b: 'cap' },
    { kind: 'unlink', a: 'ada', b: 'sun-hat' },
    { kind: 'unlink', a: 'zoe', b: 'cap' },
  ],
}

export const snacksThree: Scenario = {
  id: 'snacks-three',
  categories: [children(['Ben', 'Ivy', 'Kai']), things(SNACKS, ['apples', 'bananas', 'cookies'])],
  solution: [
    ['ben', 'apples'],
    ['ivy', 'bananas'],
    ['kai', 'cookies'],
  ],
  clues: [
    { kind: 'unlink', a: 'ivy', b: 'apples' },
    { kind: 'unlink', a: 'ivy', b: 'cookies' },
    { kind: 'unlink', a: 'kai', b: 'apples' },
  ],
}

export const petsAndSnacks: Scenario = {
  id: 'pets-and-snacks',
  categories: [
    children(['Mira', 'Ned', 'Ola']),
    things(PETS, ['rabbit', 'cat', 'fish']),
    things(SNACKS, ['apples', 'bananas', 'cookies']),
  ],
  solution: [
    ['mira', 'cat', 'bananas'],
    ['ned', 'rabbit', 'apples'],
    ['ola', 'fish', 'cookies'],
  ],
  clues: [
    { kind: 'unlink', a: 'mira', b: 'fish' },
    { kind: 'unlink', a: 'ned', b: 'cat' },
    { kind: 'unlink', a: 'mira', b: 'apples' },
    { kind: 'unlink', a: 'ola', b: 'apples' },
    { kind: 'unlink', a: 'cat', b: 'cookies' },
    { kind: 'unlink', a: 'rabbit', b: 'cookies' },
  ],
}

export const hatsAndSnacks: Scenario = {
  id: 'hats-and-snacks',
  categories: [
    children(['Ada', 'Finn', 'Zoe']),
    things(HATS, ['sun-hat', 'cap', 'top-hat']),
    things(SNACKS, ['apples', 'grapes', 'cookies']),
  ],
  solution: [
    ['ada', 'cap', 'grapes'],
    ['finn', 'top-hat', 'apples'],
    ['zoe', 'sun-hat', 'cookies'],
  ],
  clues: [
    { kind: 'unlink', a: 'finn', b: 'cookies' },
    { kind: 'unlink', a: 'finn', b: 'grapes' },
    { kind: 'unlink', a: 'ada', b: 'sun-hat' },
    { kind: 'unlink', a: 'ada', b: 'top-hat' },
    { kind: 'unlink', a: 'cap', b: 'cookies' },
    { kind: 'unlink', a: 'sun-hat', b: 'apples' },
  ],
}

export const petsAndHats: Scenario = {
  id: 'pets-and-hats',
  categories: [
    children(['Ben', 'Ivy', 'Kai']),
    things(PETS, ['dog', 'cat', 'fish']),
    things(HATS, ['sun-hat', 'cap', 'top-hat']),
  ],
  solution: [
    ['ben', 'fish', 'sun-hat'],
    ['ivy', 'dog', 'top-hat'],
    ['kai', 'cat', 'cap'],
  ],
  clues: [
    { kind: 'unlink', a: 'ivy', b: 'cat' },
    { kind: 'unlink', a: 'ivy', b: 'fish' },
    { kind: 'unlink', a: 'kai', b: 'sun-hat' },
    { kind: 'unlink', a: 'kai', b: 'top-hat' },
    { kind: 'unlink', a: 'fish', b: 'cap' },
    { kind: 'unlink', a: 'dog', b: 'sun-hat' },
  ],
}

export const fourWithPets: Scenario = {
  id: 'four-with-pets',
  categories: [
    children(['Mira', 'Ned', 'Ola', 'Sam']),
    things(PETS, ['rabbit', 'cat', 'fish', 'dog']),
    things(SNACKS, ['apples', 'bananas', 'cookies', 'grapes']),
  ],
  solution: [
    ['mira', 'fish', 'cookies'],
    ['ned', 'dog', 'apples'],
    ['ola', 'rabbit', 'grapes'],
    ['sam', 'cat', 'bananas'],
  ],
  clues: [
    { kind: 'link', a: 'mira', b: 'cookies' },
    { kind: 'unlink', a: 'mira', b: 'dog' },
    { kind: 'unlink', a: 'ola', b: 'dog' },
    { kind: 'unlink', a: 'ola', b: 'bananas' },
    { kind: 'unlink', a: 'ned', b: 'bananas' },
    { kind: 'link', a: 'rabbit', b: 'grapes' },
    { kind: 'unlink', a: 'cat', b: 'apples' },
    { kind: 'unlink', a: 'cat', b: 'cookies' },
  ],
}

export const fourWithHats: Scenario = {
  id: 'four-with-hats',
  categories: [
    children(['Ada', 'Ben', 'Ivy', 'Zoe']),
    things(HATS, ['cap', 'sun-hat', 'crown', 'top-hat']),
    things(SNACKS, ['bananas', 'grapes', 'apples', 'cookies']),
  ],
  solution: [
    ['ada', 'crown', 'grapes'],
    ['ben', 'cap', 'cookies'],
    ['ivy', 'top-hat', 'bananas'],
    ['zoe', 'sun-hat', 'apples'],
  ],
  clues: [
    { kind: 'link', a: 'ada', b: 'grapes' },
    { kind: 'link', a: 'ivy', b: 'top-hat' },
    { kind: 'unlink', a: 'ben', b: 'sun-hat' },
    { kind: 'unlink', a: 'ben', b: 'bananas' },
    { kind: 'unlink', a: 'zoe', b: 'bananas' },
    { kind: 'unlink', a: 'cap', b: 'apples' },
    { kind: 'unlink', a: 'crown', b: 'apples' },
    { kind: 'unlink', a: 'crown', b: 'cookies' },
  ],
}
