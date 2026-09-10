import type { PuzzleLevel } from '../../lib/types'

/* ============================================================
   The signposts.

   Every square carries an arrow, and somewhere along that
   arrow — one step away, or five — stands the square that comes
   after it. Join the squares up until they count 1, 2, 3 all
   the way to the last one. It is Simon Tatham's Signpost, and
   the Janko puzzle Pfeilpfad before that.

   Everything here is pure and framework-free. Three things are
   worth reading twice.

   `numbersOf` is what lets the board be played without the
   algebra the paper version leans on. Tatham labels a run that
   has not caught hold of a printed number "a", "a+1", "a+2";
   this app prints nothing a child can act on, and "a+3" is not
   something an eight-year-old can act on. So a run with no
   printed number anywhere in it shows no numbers at all, and is
   drawn as a line instead. A run that has caught hold of one
   counts out from it, and every square in it says what it is.

   `faultOf` is the whole rule book, and each of its six answers
   is a rule a child carries in their head rather than a move
   the board quietly declines to offer. That is why they are
   refusals and not dead buttons: a board that only let go of
   the squares along the arrow would be reading the arrow for
   them, and reading the arrow is the puzzle.

   And there is no dead end here, on purpose. A run can be built
   into a corner it cannot get out of, but a square that is
   joined to something can always be unjoined, and a board with
   nothing joined always has the first link of the answer open
   to it. Nobody is ever stuck, so nothing needs `failure`.
   ============================================================ */

/** Up, then clockwise. `DR` and `DC` are indexed by this. */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

/** The one square with no arrow on it at all: the end of the chain. */
export const END = -1

/** What a square carries: one of the eight arrows, or nothing. */
export type Arrow = Dir | typeof END

const DR: readonly number[] = [-1, -1, 0, 1, 1, 1, 0, -1]
const DC: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1]

/** The eight arrows as a level's picture draws them. */
export const ARROW_CHARS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'] as const

/** One phrase a direction, for the labels a screen reader reads out. */
export const ARROW_WORDS = [
  'up',
  'up and right',
  'right',
  'down and right',
  'down',
  'down and left',
  'left',
  'up and left',
] as const

export interface SignConfig {
  /**
   * The board, drawn the way it is played: one line a row, four characters a
   * square. First the arrow — one of the eight above, or '.' for the single
   * square that has none — then a space, then the printed number in two
   * characters, right-aligned, or ' .' where nothing is printed.
   *
   * The 1 and the last number are always printed, and the square with no
   * arrow is the one the last number stands on.
   */
  picture: string[]
}

/** A board as its picture describes it, before anybody has joined anything. */
export interface SignBoard {
  /** Rows and columns. The chain counts 1 to n*n. */
  n: number
  /** Row-major. Which way each square points. */
  arrows: Arrow[]
  /** Row-major. The number printed on a square, 0 where none is. */
  clues: number[]
}

export interface SignState extends SignBoard {
  /**
   * Row-major. The square each one has been joined to, or -1. Every state of
   * one level shares its `arrows` and its `clues` — those never change — so
   * this array is the whole of what a move does.
   */
  next: number[]
}

/**
 * One tap, and one move a player would count. Choosing which square to join
 * *from* is selection: it lives in Board.tsx and is never dispatched.
 */
export type SignAction =
  | { type: 'join'; from: number; to: number }
  | { type: 'unjoin'; from: number }

/** A move the rules will not keep, and the sentence that says why. */
export interface SignRefusal {
  /** The board with the line drawn where the child put it. Drawn, never played. */
  pretend: SignState
  message: string
  /** The square the cue points at, as its index. */
  where: string
}

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, cell: number): number => Math.floor(cell / n)
export const colOf = (n: number, cell: number): number => cell % n

/**
 * Every square along a square's arrow, nearest first. The chain may reach any
 * one of them: distance is not part of the rule, which is the whole difference
 * between this board and the counting path's.
 */
export function rayOf(n: number, arrows: Arrow[], cell: number): number[] {
  const dir = arrows[cell]
  if (dir === END) return []
  const out: number[] = []
  let r = rowOf(n, cell) + DR[dir]
  let c = colOf(n, cell) + DC[dir]
  while (r >= 0 && r < n && c >= 0 && c < n) {
    out.push(r * n + c)
    r += DR[dir]
    c += DC[dir]
  }
  return out
}

/** Which square is joined to each one, or -1. The other way round from `next`. */
export function prevOf(state: SignState): number[] {
  const back = new Array<number>(state.n * state.n).fill(-1)
  for (let cell = 0; cell < state.next.length; cell++) {
    const to = state.next[cell]
    if (to >= 0) back[to] = cell
  }
  return back
}

/** One stretch of joined squares, in the order the chain walks them. */
export interface Run {
  cells: number[]
  /**
   * True when the run bites its own tail. Only a refused move ever draws one,
   * and it is here so that everything downstream — the lines, the numbers —
   * can be told about it rather than having to spin round it.
   */
  ring: boolean
}

/**
 * Every run on the board. A square with nothing joined to it either side is a
 * run of one, so every square lies in exactly one run and the board can draw
 * the whole grid from this list alone.
 */
export function runsOf(state: SignState): Run[] {
  const size = state.n * state.n
  const back = prevOf(state)
  const seen = new Array<boolean>(size).fill(false)
  const runs: Run[] = []
  const walk = (head: number, ring: boolean) => {
    const cells: number[] = []
    let cell = head
    while (cell >= 0 && !seen[cell]) {
      seen[cell] = true
      cells.push(cell)
      cell = state.next[cell]
    }
    runs.push({ cells, ring })
  }
  for (let cell = 0; cell < size; cell++) if (back[cell] === -1) walk(cell, false)
  // Anything left is in a ring: it has a square before it, but no run from any
  // head ever reached it.
  for (let cell = 0; cell < size; cell++) if (!seen[cell]) walk(cell, true)
  return runs
}

/**
 * The number shown on every square, 0 where none is: the printed one where
 * there is one, and the one its run counts out where there is not.
 *
 * A printed number always wins, so a refused move that puts a 9 straight after
 * a 5 draws exactly that — the 5, the line, and the 9 — rather than quietly
 * renumbering one of them. A run with nothing printed anywhere in it shows no
 * numbers at all, and a ring shows none either.
 */
export function numbersOf(state: SignState): number[] {
  const size = state.n * state.n
  const out = state.clues.slice()
  for (const run of runsOf(state)) {
    if (run.ring) continue
    let base: number | null = null
    for (let k = 0; k < run.cells.length; k++) {
      const clue = state.clues[run.cells[k]]
      if (clue !== 0) {
        base = clue - k
        break
      }
    }
    if (base === null) continue
    for (let k = 0; k < run.cells.length; k++) {
      const value = base + k
      if (out[run.cells[k]] === 0 && value >= 1 && value <= size) out[run.cells[k]] = value
    }
  }
  return out
}

/** Squares still waiting to be joined to whatever comes after them. */
export function joinsLeft(state: SignState): number {
  let joined = 0
  for (const to of state.next) if (to >= 0) joined++
  return state.n * state.n - 1 - joined
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<SignConfig>): SignState {
  const board = parseBoard(level.config.picture)
  return { ...board, next: new Array<number>(board.n * board.n).fill(-1) }
}

/**
 * True when a join is even worth an answer: two different squares on the
 * board, and nothing joined to the first one yet. Anything else is nothing
 * happening rather than a rule broken, so `reduce` hands back the same
 * reference and `refusalOf` has nothing to say about it.
 */
function askable(state: SignState, from: number, to: number): boolean {
  const size = state.n * state.n
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false
  if (from < 0 || from >= size || to < 0 || to >= size) return false
  if (from === to) return false
  return state.next[from] === -1
}

/** A join the rules will not keep, and the square the cue should point at. */
function faultOf(
  state: SignState,
  from: number,
  to: number,
): { message: string; where: number } | null {
  const { n, arrows, clues } = state
  const size = n * n

  if (arrows[from] === END) {
    return { message: 'This square is the end of the chain. Nothing comes after it.', where: from }
  }
  if (!rayOf(n, arrows, from).includes(to)) {
    return { message: 'The next square has to be along the arrow.', where: to }
  }
  if (prevOf(state)[to] !== -1) {
    return { message: 'Another square already points there.', where: to }
  }

  // Walking on from `to` must not come back round to `from`. No legal state
  // holds a ring, so this walk always ends; the count is a belt on the braces.
  for (let cell = to, step = 0; cell >= 0 && step <= size; cell = state.next[cell], step++) {
    if (cell === from) {
      return { message: 'That would take the chain round in a circle.', where: to }
    }
  }

  // The two runs the join would make one of: the one ending at `from`, and the
  // one starting at `to`. Each already counts out properly on its own, so all
  // that is left to check is what happens where they meet.
  const runs = runsOf(state)
  const head = runs.find((run) => run.cells.includes(from)) as Run
  const tail = runs.find((run) => run.cells.includes(to)) as Run
  const merged = [...head.cells, ...tail.cells]
  let base: number | null = null
  let clash = false
  for (let k = 0; k < merged.length; k++) {
    const clue = clues[merged[k]]
    if (clue === 0) continue
    if (base === null) base = clue - k
    else if (base !== clue - k) clash = true
  }
  if (clash) {
    const numbers = numbersOf(state)
    return { message: `${numbers[to]} cannot come straight after ${numbers[from]}.`, where: to }
  }
  if (base !== null) {
    if (base < 1) return { message: 'The chain would count back past 1.', where: to }
    if (base + merged.length - 1 > size) {
      return { message: `The chain would count past ${size}.`, where: to }
    }
  }

  // One last thing the numbers can do: land a run on a number some other run
  // is already using. Nothing legal here ever holds two of the same number, so
  // whatever this finds was put there by the join.
  const after = numbersOf({ ...state, next: joined(state, from, to) })
  const seen = new Set<number>()
  for (const value of after) {
    if (value === 0) continue
    if (seen.has(value)) return { message: `There is already a ${value} on the board.`, where: to }
    seen.add(value)
  }
  return null
}

/** `state.next` with one more line drawn on it. */
function joined(state: SignState, from: number, to: number): number[] {
  const next = state.next.slice()
  next[from] = to
  return next
}

/** True when the board will keep this join. */
export function canJoin(state: SignState, from: number, to: number): boolean {
  return askable(state, from, to) && faultOf(state, from, to) === null
}

/**
 * The rule that joining `from` to `to` breaks, or null where the board takes
 * it. The refused position is a real one — the line is drawn where the child
 * put it — because a move that cannot pretend to happen cannot be offered.
 */
export function refusalOf(state: SignState, from: number, to: number): SignRefusal | null {
  if (!askable(state, from, to)) return null
  const fault = faultOf(state, from, to)
  if (fault === null) return null
  return {
    pretend: { ...state, next: joined(state, from, to) },
    message: fault.message,
    where: String(fault.where),
  }
}

/**
 * Both branches hand back the identical object where nothing happens, which is
 * the only signal the shell has that there is no move to record.
 */
export function reduce(state: SignState, action: SignAction): SignState {
  if (action.type === 'join') {
    if (!canJoin(state, action.from, action.to)) return state
    return { ...state, next: joined(state, action.from, action.to) }
  }

  if (action.type === 'unjoin') {
    const { from } = action
    if (!Number.isInteger(from) || from < 0 || from >= state.n * state.n) return state
    if (state.next[from] === -1) return state
    const next = state.next.slice()
    next[from] = -1
    return { ...state, next }
  }

  return state
}

/**
 * One chain over every square, counting 1 to n*n, each square pointing along
 * its own arrow at the next.
 *
 * The last of those is already guaranteed by `reduce`, and so is the first —
 * but both are written out again here, because the win condition should be the
 * printed rule rather than a claim about the reducer.
 */
export function isSolved(state: SignState): boolean {
  const { n, arrows, clues } = state
  const size = n * n
  let cell = clues.indexOf(1)
  if (cell < 0) return false
  const seen = new Array<boolean>(size).fill(false)
  for (let v = 1; v <= size; v++) {
    if (cell < 0 || seen[cell]) return false
    seen[cell] = true
    if (clues[cell] !== 0 && clues[cell] !== v) return false
    if (v === size) return state.next[cell] === -1
    const to = state.next[cell]
    if (to < 0 || !rayOf(n, arrows, cell).includes(to)) return false
    cell = to
  }
  return false
}

export function describeMove(prev: SignState, _next: SignState, action: SignAction): string {
  const numbers = numbersOf(prev)
  const name = (cell: number) =>
    numbers[cell] !== 0
      ? `${numbers[cell]}`
      : `row ${rowOf(prev.n, cell) + 1}, column ${colOf(prev.n, cell) + 1}`
  if (action.type === 'unjoin') return `Unjoined ${name(action.from)} from ${name(prev.next[action.from])}`
  return `Joined ${name(action.from)} to ${name(action.to)}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: SignState): SignAction[] {
  const size = state.n * state.n
  const out: SignAction[] = []
  for (let from = 0; from < size; from++) {
    if (state.next[from] !== -1) {
      out.push({ type: 'unjoin', from })
      continue
    }
    for (const to of rayOf(state.n, state.arrows, from)) {
      if (canJoin(state, from, to)) out.push({ type: 'join', from, to })
    }
  }
  return out
}

/** Two states with the same lines drawn on them are the same position. */
export const keyOf = (state: SignState): string => state.next.join(',')

/* ============================================================
   Reading a board off its picture

   Pure, and it throws on anything it cannot read rather than
   quietly building half a board: a line of the wrong length, an
   arrow nobody drew, a number printed twice, two squares with
   no arrow, an arrow that leaves the board at once. `init`
   calls it on every level and `logic.test.ts` parses all three
   shipped pictures, so the only boards a player ever meets are
   ones that have already been read.
   ============================================================ */

export function parseBoard(picture: string[]): SignBoard {
  const n = picture.length
  if (n < 3) throw new Error('a signpost board is at least three squares to a side')
  const size = n * n
  const width = n * 4
  const arrows: Arrow[] = []
  const clues: number[] = []

  for (const line of picture) {
    if (line.length !== width) throw new Error('every line of a board is four characters a square')
    if (line !== line.trim()) throw new Error('no line of a board starts or ends with a space')
    for (let c = 0; c < n; c++) {
      const mark = line[c * 4]
      if (line[c * 4 + 1] !== ' ') {
        throw new Error('a square is an arrow, a space, then two characters of number')
      }
      const dir = (ARROW_CHARS as readonly string[]).indexOf(mark)
      if (mark !== '.' && dir < 0) throw new Error(`${mark} is not one of the eight arrows`)
      arrows.push(mark === '.' ? END : (dir as Dir))

      const field = line.slice(c * 4 + 2, c * 4 + 4)
      if (field === ' .') {
        clues.push(0)
        continue
      }
      if (!/^(?: \d|\d\d)$/.test(field)) throw new Error(`"${field}" is not a printed number`)
      const value = Number(field.trim())
      if (value < 1 || value > size) throw new Error(`${value} is not a number on this board`)
      clues.push(value)
    }
  }

  if (arrows.filter((a) => a === END).length !== 1) {
    throw new Error('exactly one square has no arrow: the end of the chain')
  }
  const printed = new Set<number>()
  for (const value of clues) {
    if (value === 0) continue
    if (printed.has(value)) throw new Error(`${value} is printed twice`)
    printed.add(value)
  }
  if (!printed.has(1)) throw new Error('the 1 is always printed')
  if (!printed.has(size)) throw new Error(`the ${size} is always printed`)
  if (clues[arrows.indexOf(END)] !== size) {
    throw new Error('the square with no arrow is the one the last number stands on')
  }
  for (let cell = 0; cell < size; cell++) {
    if (arrows[cell] !== END && rayOf(n, arrows, cell).length === 0) {
      throw new Error('an arrow that leaves the board at once points at nothing')
    }
  }
  return { n, arrows, clues }
}

/* ============================================================
   Reasoning a board out

   Two steps, and between them they are everything a child says
   out loud at this board.

   One: which squares could the 6 still be in? Only the ones
   some possible 5 points at, and only the ones that point at
   some possible 7. Cross off the rest. That is the arrow read
   forwards and backwards, and it is where most of a board falls
   out.

   Two: a square that only one number can go in takes that
   number — and a number with only one square left takes that
   square, which locks every other number out of it. This is
   rule two of the logic grid's `eliminate` in another coat:
   only one arrow can still reach that square, so the square it
   comes from is settled.

   Every clause is *sound* — it never crosses off a square that
   a real answer uses — so a board this reasons all the way
   through has exactly one answer. `countSolutions` below is an
   independent walk of the same board, and the tests hold the
   two against each other.
   ============================================================ */

/** What a board asked to be reasoned through gives back. */
export interface Deduction {
  /** `order[v - 1]` is the square holding the number v. */
  order: number[]
  /** Passes over the two steps it took. This is the level's difficulty. */
  rounds: number
}

/** The only square left in a candidate list, or -1 while there is a choice. */
function only(list: boolean[]): number {
  let found = -1
  for (let cell = 0; cell < list.length; cell++) {
    if (!list[cell]) continue
    if (found >= 0) return -1
    found = cell
  }
  return found
}

export function solveByLogic(n: number, arrows: Arrow[], clues: number[]): Deduction | null {
  const size = n * n
  if (arrows.length !== size || clues.length !== size) return null
  const rays = Array.from({ length: size }, (_, cell) => rayOf(n, arrows, cell))
  /** Every square whose arrow reaches this one. The ray read backwards. */
  const reach = Array.from({ length: size }, () => [] as number[])
  rays.forEach((ray, cell) => {
    for (const to of ray) reach[to].push(cell)
  })

  /** `can[v][cell]`: the number v could still stand on that square. */
  const can = Array.from({ length: size + 1 }, () => new Array<boolean>(size).fill(true))
  for (let cell = 0; cell < size; cell++) {
    const value = clues[cell]
    if (value === 0) continue
    if (value < 1 || value > size) return null
    for (let v = 1; v <= size; v++) can[v][cell] = v === value
    for (let other = 0; other < size; other++) if (other !== cell) can[value][other] = false
  }

  let rounds = 0
  for (;;) {
    let moved = false

    // Step one: the arrow, read forwards and backwards.
    for (let v = 1; v <= size; v++) {
      for (let cell = 0; cell < size; cell++) {
        if (!can[v][cell]) continue
        const ahead = v === size || rays[cell].some((to) => can[v + 1][to])
        const behind = v === 1 || reach[cell].some((b) => can[v - 1][b])
        if (!ahead || !behind) {
          can[v][cell] = false
          moved = true
        }
      }
    }

    // Step two: a number with one square left keeps every other number out of
    // it, and a square with one number left keeps that number off every other
    // square.
    for (let v = 1; v <= size; v++) {
      const home = only(can[v])
      if (home < 0) continue
      for (let w = 1; w <= size; w++) {
        if (w !== v && can[w][home]) {
          can[w][home] = false
          moved = true
        }
      }
    }
    for (let cell = 0; cell < size; cell++) {
      let value = -1
      let seen = 0
      for (let v = 1; v <= size; v++) {
        if (!can[v][cell]) continue
        value = v
        seen++
        if (seen > 1) break
      }
      if (seen === 0) return null
      if (seen === 1) {
        for (let other = 0; other < size; other++) {
          if (other !== cell && can[value][other]) {
            can[value][other] = false
            moved = true
          }
        }
      }
    }
    for (let v = 1; v <= size; v++) if (!can[v].some(Boolean)) return null

    if (!moved) break
    rounds++
  }

  const order = new Array<number>(size).fill(-1)
  for (let v = 1; v <= size; v++) {
    const home = only(can[v])
    if (home < 0) return null
    order[v - 1] = home
  }
  // Sound reasoning about a board with no answer says nothing at all, so the
  // finished chain is read back against the rule before it is handed over.
  if (new Set(order).size !== size) return null
  for (let v = 1; v < size; v++) if (!rays[order[v - 1]].includes(order[v])) return null
  for (let cell = 0; cell < size; cell++) {
    if (clues[cell] !== 0 && order[clues[cell] - 1] !== cell) return null
  }
  return { order, rounds }
}

/**
 * Every way the chain can be built, up to `cap` of them, each as one square a
 * number: `order[v - 1]` holds v.
 *
 * A depth-first walk from the 1 upwards, one square at a time. It never asks
 * whether a step is *forced*, only whether it is possible, so it knows nothing
 * about `solveByLogic` — which is what makes it worth holding the solver
 * against in the tests. The one thing it does prune is a square nothing can
 * reach any more, because without that a board of twenty-five squares takes
 * longer than a test run is worth.
 */
export function solutions(n: number, arrows: Arrow[], clues: number[], cap = 2): number[][] {
  const size = n * n
  const rays = Array.from({ length: size }, (_, cell) => rayOf(n, arrows, cell))
  const home = new Array<number>(size + 1).fill(-1)
  clues.forEach((value, cell) => {
    if (value > 0 && value <= size) home[value] = cell
  })
  const start = home[1]
  if (start < 0) return []

  const used = new Array<boolean>(size).fill(false)
  const order = new Array<number>(size).fill(-1)
  const found: number[][] = []

  /** Every square whose arrow reaches this one. The ray read backwards. */
  const reach = Array.from({ length: size }, () => [] as number[])
  rays.forEach((ray, cell) => {
    for (const to of ray) reach[to].push(cell)
  })

  /**
   * Every square still to be filled needs something that can still point at
   * it: the square just placed, or one of the squares nobody has taken yet.
   */
  const openAhead = (here: number): boolean => {
    for (let cell = 0; cell < size; cell++) {
      if (used[cell]) continue
      if (reach[cell].some((b) => b === here || !used[b])) continue
      return false
    }
    return true
  }

  const walk = (v: number, here: number): void => {
    if (found.length >= cap) return
    if (v > size) {
      found.push(order.slice())
      return
    }
    if (!openAhead(here)) return
    for (const to of rays[here]) {
      if (used[to]) continue
      if (clues[to] !== 0 && clues[to] !== v) continue
      if (home[v] >= 0 && home[v] !== to) continue
      used[to] = true
      order[v - 1] = to
      walk(v + 1, to)
      used[to] = false
      order[v - 1] = -1
      if (found.length >= cap) return
    }
  }

  used[start] = true
  order[0] = start
  walk(2, start)
  return found
}

/** How many ways the chain can be built, counted no further than `cap`. */
export function countSolutions(n: number, arrows: Arrow[], clues: number[], cap = 2): number {
  return solutions(n, arrows, clues, cap).length
}
