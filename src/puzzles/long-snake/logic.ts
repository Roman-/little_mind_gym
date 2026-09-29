import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The long snake.

   A square grid with two squares given, the snake's head and its
   tail, and a number at the end of every row and every column.
   Fill in squares to make one snake from the head to the tail,
   one square wide, that never touches itself side by side, so
   that every number counts the snake squares in its own line —
   the head and the tail included. It is the contest puzzle known
   as Snake, which has also gone by the name Tunnel.

   Everything here is pure and framework-free. Four things are
   worth reading twice.

   `reduce` will not add a square that breaks a rule at the square
   tapped: a line going past its number, the snake touching itself
   side by side, or the snake closing into a ring. `refusalOf` hands
   those back instead, exactly as the tents hand back a tent that
   touches. All four are monotone — adding squares never undoes one
   — and a subset of the answer breaks none of them, which buys
   two things at once. The answer's squares land in any order, so
   par is the snake's length less its two ends. And every position
   a child can reach can still be won: take off the squares the
   answer does not use, which is never refused, and add the rest.
   So there is no `failure` and no `canStillWin`, and
   `logic.test.ts` proves the claim rather than assuming it.

   The published rule has a fifth clause, and the child is not told
   it: the snake may not touch itself at a corner either, except at
   a bend. `isSolved` keeps it and `randomSnake` draws under it, but
   it never decides a dealt board — every one has exactly one answer
   with it switched off, 1000 of 1000 seeds a level — and told it in
   this collection's meaning of touching, which includes a corner,
   a child rules out the far square of every bend. Every dealt
   snake bends at least three times. A child who reads it that way
   solves none of 1000 boards at any level, and is led to a wrong
   square on 38, 323 and 228 of them.

   `solveByLooking` fills a board using only what the board draws —
   the numbers, the snake squares and the dots — and two steps a
   child says out loud. Both only ever add a square that every
   answer uses, so a board it finishes has exactly one answer, with
   or without the corner clause, and `countSolutions` is held
   against it both ways in the tests. `deal` throws away every board
   it cannot finish, every board the numbers alone finish, and every
   board that following the snake alone finishes, so each board a
   child is handed asks for both steps.

   And what this board deliberately does not have: the paper
   game's cross on a square that cannot be snake. Each one would be
   a counted move. The dot a full line leaves on the rest of its
   squares is drawn for free instead, and it is the only dot there
   is — the solver reads the very same `dottedCells`, so what it
   needs and what the board shows cannot drift apart.
   ============================================================ */

/**
 * One level's board, and the one dial that says how hard it is.
 *
 * The dial is a floor and a ceiling on `steps` — the waves that
 * `solveByLooking` takes — and every ceiling stands no higher than the floor
 * of the level above it, which is the tents' ladder rule: a floor on its own
 * only stops a level being the level below with more squares, and it is the
 * ceiling that stops it being the level above. `logic.test.ts` holds all
 * three to it.
 *
 * There is no dial on the zeros in the margin. At eleven long it was measured
 * and bought nothing: split by how many 0s a board prints, a climber that
 * never goes back lands 4.3%, 7.6% and 15.3% of level-one boards (none, one,
 * two) while a careful one lands 63.1%, 56.2% and 29.0% — the two trade off,
 * and the total barely moves. So the pool is the widest eleven long allows.
 */
export interface SnakeConfig {
  /** Rows and columns both come in this many. */
  n: number
  /** Snake squares in the answer, the head and the tail included. Par is this less two. */
  length: number
  /** Waves of `solveByLooking`, at least and at most. */
  minSteps: number
  maxSteps: number
}

export interface SnakeState {
  n: number
  /** The two given squares. They never change. */
  head: number
  tail: number
  /**
   * Snake squares wanted in each row and each column, the head and the tail
   * counted. They never change, and they pass through `reduce` by reference:
   * a new array only when a board is dealt, which is why the board keys its
   * tab stop on `rowClues`.
   */
  rowClues: number[]
  colClues: number[]
  /** Row-major. True on every snake square. The head and the tail are always true. */
  snake: boolean[]
}

/** One tap: a square joins the snake, or leaves it. */
export type SnakeAction = { type: 'toggle'; index: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

export function rowCells(n: number, r: number): number[] {
  return Array.from({ length: n }, (_, c) => r * n + c)
}

export function colCells(n: number, c: number): number[] {
  return Array.from({ length: n }, (_, r) => r * n + c)
}

/**
 * The squares that share an edge with this one, listed up, left, right, down.
 *
 * The order is not the tents' (up, down, left, right), and it is not free to
 * change: `randomSnake` shuffles this list at every step of its walk, so the
 * order is part of every board a seed deals. With the tents' order, only 10, 0
 * and 0 of seeds 0 to 999 deal the board they deal with this one, a level, and
 * every seed-pinned figure in `logic.test.ts` would move.
 */
export function orthogonal(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  if (r > 0) out.push(index - n)
  if (c > 0) out.push(index - 1)
  if (c < n - 1) out.push(index + 1)
  if (r < n - 1) out.push(index + n)
  return out
}

/** The up to four squares that meet this one at a corner. */
export function diagonal(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const rr = r + dr
    const cc = c + dc
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc)
  }
  return out
}

/* --- the snake ----------------------------------------------- */

/** The head or the tail: the two squares the board gives, and the two that end the snake. */
export const isEnd = (state: SnakeState, index: number): boolean =>
  index === state.head || index === state.tail

/** How many snake squares this one joins, once the snake is whole: one at an end, two in the body. */
export const wants = (state: SnakeState, index: number): number => (isEnd(state, index) ? 1 : 2)

/** Snake squares among these. */
export function snakeIn(state: SnakeState, cells: number[]): number {
  return cells.filter((i) => state.snake[i]).length
}

export function snakeCount(state: SnakeState): number {
  return state.snake.filter(Boolean).length
}

/** The snake squares the answer has, head and tail counted: what the row numbers add up to. */
export function lengthOf(state: SnakeState): number {
  return state.rowClues.reduce((sum, want) => sum + want, 0)
}

/** The snake squares beside this one, edge to edge. */
export function neighboursOn(state: SnakeState, index: number): number[] {
  return orthogonal(state.n, index).filter((j) => state.snake[j])
}

/** The snake squares joined to this one edge to edge, itself included, ascending. */
export function pieceOf(state: SnakeState, from: number): number[] {
  const seen = new Set([from])
  const stack = [from]
  while (stack.length > 0) {
    const at = stack.pop() as number
    for (const j of orthogonal(state.n, at)) {
      if (state.snake[j] && !seen.has(j)) {
        seen.add(j)
        stack.push(j)
      }
    }
  }
  return [...seen].sort((a, b) => a - b)
}

/* --- the rules ------------------------------------------------ */

/** Which rule adding a square breaks. There is no corner kind: a corner is never refused. */
export type ClashKind = 'row' | 'column' | 'touch' | 'ring'

/** One square, and the group of squares that will not have it. */
export interface Clash {
  kind: ClashKind
  /** Which row or column, counting from 1. Zero for the other two rules. */
  ordinal: number
  /** How many snake squares that row or column wants. Zero for the other two rules. */
  wanted: number
  /** Every square in the group, so the board can light the whole of it. */
  cells: number[]
  /** The squares to point at: the one just tapped, and whatever it fell foul of. */
  blamed: number[]
}

/**
 * The rule that adding `index` to the snake breaks, or null when the square
 * takes it.
 *
 * One square can break several rules at once, and only the first is reported,
 * because three groups lit together say nothing about any of them. The order
 * is the one a child checks by eye: the number at the end of the row, the
 * number at the top of the column, then the snake itself.
 *
 * `touch` is the snake touching itself side by side. It is a square with a
 * third snake square beside it, or one beside a snake square that already has
 * all the neighbours it may have — two for a body square, one for the head or
 * the tail. `ring` is a square whose two snake neighbours are already joined,
 * so the snake would close into a loop; the smallest one is a two by two
 * block. Every refusal the board can make is one of these four.
 *
 * A corner touch is not one of them, on purpose. Two squares that meet at a
 * corner may still become a bend, and nothing at the square tapped says they
 * will not.
 */
export function clashOf(state: SnakeState, index: number): Clash | null {
  const { n, snake, rowClues, colClues } = state
  if (!Number.isInteger(index) || index < 0 || index >= snake.length) return null
  // The head and the tail are always snake, so this covers them too.
  if (snake[index]) return null

  const r = rowOf(n, index)
  const row = rowCells(n, r)
  if (snakeIn(state, row) >= rowClues[r]) {
    return {
      kind: 'row',
      ordinal: r + 1,
      wanted: rowClues[r],
      cells: row,
      blamed: [index, ...row.filter((i) => snake[i])],
    }
  }

  const c = colOf(n, index)
  const col = colCells(n, c)
  if (snakeIn(state, col) >= colClues[c]) {
    return {
      kind: 'column',
      ordinal: c + 1,
      wanted: colClues[c],
      cells: col,
      blamed: [index, ...col.filter((i) => snake[i])],
    }
  }

  const near = neighboursOn(state, index)
  const full = near.filter((j) => neighboursOn(state, j).length >= wants(state, j))
  if (near.length > 2 || full.length > 0) {
    const blamed = [index, ...(near.length > 2 ? near : full)]
    return { kind: 'touch', ordinal: 0, wanted: 0, cells: blamed, blamed }
  }

  if (near.length === 2) {
    const piece = pieceOf(state, near[0])
    if (piece.includes(near[1])) {
      return { kind: 'ring', ordinal: 0, wanted: 0, cells: [index, ...piece], blamed: [index, ...near] }
    }
  }

  return null
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash): string {
  if (clash.kind === 'touch') return 'The snake would touch itself side by side here.'
  if (clash.kind === 'ring') return 'The snake would join up into a ring.'
  const line = clash.kind === 'row' ? 'Row' : 'Column'
  if (clash.wanted === 0) return `${line} ${clash.ordinal} wants no snake squares at all.`
  const squares = clash.wanted === 1 ? '1 snake square' : `${clash.wanted} snake squares`
  return `${line} ${clash.ordinal} already has its ${squares}.`
}

/** True when this square may join the snake. */
export function canAdd(state: SnakeState, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= state.snake.length) return false
  if (isEnd(state, index) || state.snake[index]) return false
  return clashOf(state, index) === null
}

/**
 * A forbidden square, added anyway: it joins the snake where the child put it,
 * and one sentence says why it cannot stay. Null where the square takes it,
 * for taking a square off (which breaks no rule), for the head and the tail,
 * and for a square that is not on the board.
 */
export function refusalOf(
  state: SnakeState,
  index: number,
): { pretend: SnakeState; message: string; clash: Clash } | null {
  const clash = clashOf(state, index)
  if (clash === null) return null
  const snake = state.snake.slice()
  snake[index] = true
  return { pretend: { ...state, snake }, message: describeClash(clash), clash }
}

/* --- the engine ---------------------------------------------- */

/** The board a deal describes, with only the head and the tail on it. */
export function startOf(n: number, board: Omit<Deal, 'answer'>): SnakeState {
  const snake = new Array<boolean>(n * n).fill(false)
  snake[board.head] = true
  snake[board.tail] = true
  return { n, head: board.head, tail: board.tail, rowClues: board.rowClues, colClues: board.colClues, snake }
}

export function init(level: PuzzleLevel<SnakeConfig>, rng: Rng): SnakeState {
  return startOf(level.config.n, deal(rng, level.config))
}

/**
 * A square that breaks a rule never lands, and taking a square off always
 * does. Apart from the head, the tail and actions that are not actions, no tap
 * changes nothing.
 */
export function reduce(state: SnakeState, action: SnakeAction): SnakeState {
  if (action?.type !== 'toggle') return state
  const { index } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.snake.length) return state
  // The head and the tail are given.
  if (isEnd(state, index)) return state
  if (!state.snake[index] && !canAdd(state, index)) return state
  const snake = state.snake.slice()
  snake[index] = !snake[index]
  return { ...state, snake }
}

/**
 * The snake in order, from the head: at every square, on to the snake square
 * it did not come from. Null unless that walk reaches the tail having visited
 * every snake square on the board, which rules out a stray piece and a
 * separate ring as well as a snake that stops short.
 */
export function walkFromHead(state: SnakeState): number[] | null {
  const { n, snake, head, tail } = state
  const count = snakeCount(state)
  const order = [head]
  let prev = -1
  let at = head
  while (at !== tail) {
    const next = orthogonal(n, at).find((j) => snake[j] && j !== prev)
    if (next === undefined || order.length >= count) return null
    prev = at
    at = next
    order.push(at)
  }
  return order.length === count ? order : null
}

/**
 * The whole structure, never just the counts. Every number is met, every snake
 * square has exactly the neighbours it wants, and the walk from the head takes
 * in every snake square on its way to the tail. Then the published corner
 * clause: two snake squares that meet at a corner are exactly two apart along
 * the snake, which is to say a bend.
 *
 * Nothing here reads the generator, so a board rewound through the move tape
 * is judged exactly as a board played forward is.
 */
export function isSolved(state: SnakeState): boolean {
  const { n, snake, head, tail, rowClues, colClues } = state
  if (head === tail || !snake[head] || !snake[tail]) return false
  for (let r = 0; r < n; r++) if (snakeIn(state, rowCells(n, r)) !== rowClues[r]) return false
  for (let c = 0; c < n; c++) if (snakeIn(state, colCells(n, c)) !== colClues[c]) return false
  const cells: number[] = []
  for (let i = 0; i < snake.length; i++) if (snake[i]) cells.push(i)
  for (const i of cells) if (neighboursOn(state, i).length !== wants(state, i)) return false
  const order = walkFromHead(state)
  if (order === null) return false
  const along = new Map(order.map((cell, k) => [cell, k]))
  for (const i of cells) {
    for (const d of diagonal(n, i)) {
      if (snake[d] && Math.abs((along.get(i) as number) - (along.get(d) as number)) !== 2) return false
    }
  }
  return true
}

export function describeMove(prev: SnakeState, _next: SnakeState, action: SnakeAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  return prev.snake[action.index] ? `Took ${where} off the snake` : `Added ${where} to the snake`
}

/** Every action worth trying: every square but the two ends. Used by the tests to check `par`. */
export function legalMoves(state: SnakeState): SnakeAction[] {
  const out: SnakeAction[] = []
  for (let index = 0; index < state.snake.length; index++) {
    if (!isEnd(state, index)) out.push({ type: 'toggle', index })
  }
  return out
}

/* ============================================================
   par

   A level's par is its snake's length less the head and the
   tail, and both halves of the claim are proved in logic.test.ts
   rather than asserted.

   The floor. A board starts with the head and the tail on it and
   nothing else, `isSolved` wants the one answer, which has
   `length` snake squares, and `reduce` changes exactly one square
   a move. So `length - 2` moves is the fewest there can be.

   The ceiling. The answer's squares can be added in any order at
   all: no line of the answer runs past its number, no square of
   it has more neighbours than it wants, and no part of it is a
   ring — so every rule `reduce` holds to is already kept at every
   step along the way. That is `length - 2` moves, and it ends on a
   solved board.
   ============================================================ */

/* --- what the board says without being asked ------------------ */

/**
 * The squares a full line rules out: not snake, in a row or a column that
 * already has all the snake squares its number wants.
 *
 * This is the only dot there is. It is worked out from the numbers and the
 * snake squares alone and never from the snake's shape, so a square the touch
 * rule would refuse is not dotted — whether a square can still join the snake
 * there is the part the child came here to work out. And it is the very
 * predicate `solveByLooking` reads, so the steps a board is dealt for are
 * steps a child can take off what the board draws.
 */
export function dottedCells(state: SnakeState): boolean[] {
  const { n, snake, rowClues, colClues } = state
  const rowFull = rowClues.map((want, r) => snakeIn(state, rowCells(n, r)) >= want)
  const colFull = colClues.map((want, c) => snakeIn(state, colCells(n, c)) >= want)
  return snake.map((on, i) => !on && (rowFull[rowOf(n, i)] || colFull[colOf(n, i)]))
}

/** How many squares beside this one have room: neither snake nor dotted. */
export function roomBeside(state: SnakeState, index: number, dots = dottedCells(state)): number {
  return orthogonal(state.n, index).filter((j) => !state.snake[j] && !dots[j]).length
}

/** How many of these squares have room: neither snake nor dotted. */
export function roomIn(state: SnakeState, cells: number[], dots = dottedCells(state)): number {
  return cells.filter((i) => !state.snake[i] && !dots[i]).length
}

/** How a row or a column stands: still open, all its snake squares in, or short of room. */
export type LineMark = 'open' | 'done' | 'stuck'

/**
 * `done` is the count met: crossed off, and by its own rule nothing more may
 * join the line. `stuck` is a line that still wants `k` snake squares and has
 * fewer than `k` squares with room — a wrong turn rather than a broken rule,
 * because nothing on the board breaks one, and a thing a child can check by
 * counting the dots under the number.
 *
 * Fewer, and not none. That is where this parts from the tents, which box a
 * number only once no square under it has room at all. So a stuck line here
 * usually still has room — of the 1,664 times the walk in `logic.test.ts`
 * hears a line's sentence, 1,381 are said of a line with a square left that
 * has room — and nothing said about it may claim that it has none. Its
 * sentence and its number's label say how much room it has instead.
 *
 * A count can never run over, because `reduce` will not add the square that
 * would do it. So a line that is not `done` still wants squares, and these
 * three words are the whole of what a number has to say.
 */
export function lineMark(
  state: SnakeState,
  cells: number[],
  clue: number,
  dots = dottedCells(state),
): LineMark {
  const on = snakeIn(state, cells)
  if (on === clue) return 'done'
  return on + roomIn(state, cells, dots) < clue ? 'stuck' : 'open'
}

export function rowMarks(state: SnakeState, dots = dottedCells(state)): LineMark[] {
  return state.rowClues.map((clue, r) => lineMark(state, rowCells(state.n, r), clue, dots))
}

export function colMarks(state: SnakeState, dots = dottedCells(state)): LineMark[] {
  return state.colClues.map((clue, c) => lineMark(state, colCells(state.n, c), clue, dots))
}

/**
 * The snake squares that can no longer be given the neighbours they want: the
 * head, the tail or a placed square with `k` still to find and fewer than `k`
 * squares with room beside it. Ascending.
 *
 * Every one is a wrong turn a child can see, because every square round it is
 * snake or dotted, and none of them can be put right by adding a square. This
 * is the tents' walled-in tree, said about the snake.
 */
export function strandedEnds(state: SnakeState, dots = dottedCells(state)): number[] {
  const out: number[] = []
  for (let i = 0; i < state.snake.length; i++) {
    if (!state.snake[i]) continue
    const left = wants(state, i) - neighboursOn(state, i).length
    if (left > 0 && roomBeside(state, i, dots) < left) out.push(i)
  }
  return out
}

/**
 * What a stranded square is said to be stuck with, in the board's sentence and
 * in its label both.
 *
 * With no room beside it at all, it has nowhere left to go. Otherwise it is a
 * lone square in the body — it wants two neighbours and has room on one side
 * only — and it has no way through. The two are worded apart on purpose: the
 * hints use "room on one side only" for an end of the snake, where it means
 * the snake goes there, and a lone square in the middle needs a way in and a
 * way out, so there the same fact is a wrong turn.
 */
export function strandedAs(state: SnakeState, index: number, dots = dottedCells(state)): 'nowhere' | 'through' {
  return roomBeside(state, index, dots) === 0 ? 'nowhere' : 'through'
}

export type TroubleKind = 'soon' | 'row' | 'column' | 'pieces' | 'stranded' | 'corner'

export interface Trouble {
  kind: TroubleKind
  /** The one sentence the board says under itself. */
  message: string
  /** The squares the sentence is about. */
  cells: number[]
}

/**
 * The one wrong turn the board says in words, or null. The first that applies
 * wins, and the order is the tents': a sentence about the whole board outranks
 * one about a single square.
 *
 * Every one of these is worked out from the numbers, the snake squares and the
 * dots, and none of them consults the answer. Walked over all 16,389 positions
 * reachable on six level-one boards, and 32,000 random-play positions at the
 * two levels above, no sentence was ever untrue of the square it names.
 *
 * The last one, two parts of the snake touching at a corner, is the published
 * clause the child is not told. No dealt board reaches it: every one has one
 * answer with that clause switched off, so a board with every number met, in
 * one piece, with every square given its neighbours, is solved. It is kept so
 * that this answers every position there is, and a hand-built board reaches
 * it.
 */
export function troubleOf(state: SnakeState): Trouble | null {
  const { n, head, tail } = state
  const total = lengthOf(state)
  const count = snakeCount(state)
  const fromHead = pieceOf(state, head)
  if (fromHead.includes(tail) && fromHead.length < total) {
    return { kind: 'soon', message: 'The snake reaches its tail too soon.', cells: fromHead }
  }

  // A stuck line is short of room, and usually not out of it (see `lineMark`),
  // so the sentence says what is true of every one: a child who counts the
  // squares with room under the number finds too few, and may well find some.
  const dots = dottedCells(state)
  const r = rowMarks(state, dots).indexOf('stuck')
  if (r >= 0) {
    return {
      kind: 'row',
      message: `Row ${r + 1} does not have room for all its snake squares.`,
      cells: rowCells(n, r),
    }
  }
  const c = colMarks(state, dots).indexOf('stuck')
  if (c >= 0) {
    return {
      kind: 'column',
      message: `Column ${c + 1} does not have room for all its snake squares.`,
      cells: colCells(n, c),
    }
  }

  if (count === total && !fromHead.includes(tail)) {
    return { kind: 'pieces', message: 'Every number is right. The snake is in more than one piece.', cells: [] }
  }

  const stranded = strandedEnds(state, dots)
  if (stranded.length > 0) {
    // The head first, then the tail, then the first square in reading order.
    const named = stranded.includes(head) ? head : stranded.includes(tail) ? tail : stranded[0]
    const who =
      named === head
        ? "The snake's head"
        : named === tail
          ? "The snake's tail"
          : `The snake square in row ${rowOf(n, named) + 1}, column ${colOf(n, named) + 1}`
    const what = strandedAs(state, named, dots) === 'nowhere' ? 'has nowhere left to go.' : 'has no way through.'
    return { kind: 'stranded', message: `${who} ${what}`, cells: [named] }
  }

  if (count === total && !isSolved(state)) {
    return { kind: 'corner', message: 'Two parts of the snake touch at a corner.', cells: [] }
  }
  return null
}

/* ============================================================
   Reading a board out by looking

   Two steps, and they are the two a child says out loud.

   A tight line: a row or a column that still wants `k` snake
   squares and has exactly `k` squares with room. All of them are
   snake.

   Only way on: a snake square — the head, the tail, or one already
   added — that still wants `k` neighbours and has exactly `k`
   squares with room beside it. All of them are snake. On a dealt
   board this only ever fires at an end that wants one more.

   It works in waves. Each wave reads the board as it stands at the
   start of the wave, collects every square either step forces, and
   adds them all together; `steps` counts the waves. Global
   connectivity is nowhere in it, and neither step remembers
   anything the board is not drawing.

   Three more were measured and left out, because the data said so:
   a dead end (a square with fewer than two live squares beside it),
   the corner bridges, and "this would close a ring or join the tail
   too soon". On 400 boards a size, the dead end finished no board
   that these two had not, and the other two together 0 to 2%. Dots
   from the touch and ring refusals were measured too, and the dots
   the numbers draw do the work.
   ============================================================ */

/** What a board read out by looking gives back. */
export interface Deduction {
  /** Every square of the one answer, ascending, the head and the tail included. */
  snake: number[]
  /** Waves it took. The level's dial. */
  steps: number
  /** Squares settled by a tight line. */
  tight: number
  /** Squares settled by an only way on. */
  onlyWay: number
}

export function solveByLooking(
  n: number,
  head: number,
  tail: number,
  rowClues: number[],
  colClues: number[],
  use: { tight?: boolean; ends?: boolean } = {},
): Deduction | null {
  const useTight = use.tight ?? true
  const useEnds = use.ends ?? true
  let state = startOf(n, { head, tail, rowClues, colClues })
  let steps = 0
  let tight = 0
  let onlyWay = 0

  for (;;) {
    const dots = dottedCells(state)
    const open = (i: number) => !state.snake[i] && !dots[i]
    const put = new Set<number>()

    for (let k = 0; k < 2 * n; k++) {
      const cells = k < n ? rowCells(n, k) : colCells(n, k - n)
      const left = (k < n ? rowClues[k] : colClues[k - n]) - snakeIn(state, cells)
      const room = cells.filter(open)
      // A line past its number, or with less room than it wants: not a board.
      if (left < 0 || room.length < left) return null
      if (useTight && left > 0 && room.length === left) {
        for (const i of room) {
          if (put.has(i)) continue
          put.add(i)
          tight++
        }
      }
    }

    for (let i = 0; i < n * n; i++) {
      if (!state.snake[i]) continue
      const left = wants(state, i) - neighboursOn(state, i).length
      const room = orthogonal(n, i).filter(open)
      if (left < 0 || room.length < left) return null
      if (useEnds && left > 0 && room.length === left) {
        for (const j of room) {
          if (put.has(j)) continue
          put.add(j)
          onlyWay++
        }
      }
    }

    if (put.size === 0) break
    const snake = state.snake.slice()
    for (const i of put) snake[i] = true
    state = { ...state, snake }
    steps++
  }

  if (!isSolved(state)) return null
  const out: number[] = []
  state.snake.forEach((on, i) => {
    if (on) out.push(i)
  })
  return { snake: out, steps, tight, onlyWay }
}

/* ============================================================
   Counting the answers

   The independent check on the solver's claim: a depth-first walk
   from the head, one square at a time, that never lets a line run
   past its number and only counts a walk that reaches the tail
   with every number met. `corner` switches the published corner
   clause on and off, so the tests can show that no dealt board
   needs it.
   ============================================================ */

/**
 * True when the snake drawn so far may go on to `cell`: it is free, nothing on
 * the snake but the last square is beside it, and — with the corner clause on —
 * nothing on the snake but the square before the last meets it at a corner.
 */
function canAppend(n: number, on: Uint8Array, path: number[], cell: number, corner: boolean): boolean {
  if (on[cell]) return false
  const last = path[path.length - 1]
  const before = path.length >= 2 ? path[path.length - 2] : -1
  for (const j of orthogonal(n, cell)) if (on[j] && j !== last) return false
  if (corner) for (const d of diagonal(n, cell)) if (on[d] && d !== before) return false
  return true
}

/** How many snakes fit the numbers from this head to this tail, counted no further than `cap`. */
export function countSolutions(
  n: number,
  head: number,
  tail: number,
  rowClues: number[],
  colClues: number[],
  cap = 2,
  corner = true,
): number {
  const total = rowClues.reduce((sum, want) => sum + want, 0)
  const on = new Uint8Array(n * n)
  const rowHas = new Array<number>(n).fill(0)
  const colHas = new Array<number>(n).fill(0)
  const path: number[] = []
  const tailRow = rowOf(n, tail)
  const tailCol = colOf(n, tail)
  let found = 0

  const add = (cell: number) => {
    on[cell] = 1
    rowHas[rowOf(n, cell)]++
    colHas[colOf(n, cell)]++
    path.push(cell)
  }
  const drop = (cell: number) => {
    on[cell] = 0
    rowHas[rowOf(n, cell)]--
    colHas[colOf(n, cell)]--
    path.pop()
  }

  const walk = (): void => {
    if (found >= cap) return
    const last = path[path.length - 1]
    if (last === tail) {
      for (let k = 0; k < n; k++) {
        if (rowHas[k] !== rowClues[k] || colHas[k] !== colClues[k]) return
      }
      found++
      return
    }
    // The tail has to be reachable in exactly the squares that are left.
    const left = total - path.length
    const far = Math.abs(rowOf(n, last) - tailRow) + Math.abs(colOf(n, last) - tailCol)
    if (far > left || (left - far) % 2 !== 0) return
    for (const cell of orthogonal(n, last)) {
      if (cell === tail && path.length + 1 !== total) continue
      if (!canAppend(n, on, path, cell, corner)) continue
      if (rowHas[rowOf(n, cell)] >= rowClues[rowOf(n, cell)]) continue
      if (colHas[colOf(n, cell)] >= colClues[colOf(n, cell)]) continue
      add(cell)
      walk()
      drop(cell)
      if (found >= cap) return
    }
  }

  add(head)
  walk()
  return found
}

/* ============================================================
   Making a board

   Backwards, from a finished one: draw a snake, read the numbers
   off it, and keep only its two ends. Nothing here can produce a
   board with no answer, because the answer is drawn first — and
   every board is then held against `solveByLooking`, so it has
   exactly one.
   ============================================================ */

/**
 * A snake of `length` squares, drawn as a depth-first walk from a random
 * square: at each step it tries the squares beside the last in a shuffled
 * order and takes the first that `canAppend` allows, with the corner clause
 * on, so every snake drawn keeps every published rule. It backs up at a dead
 * end and gives up after `budget` calls, which it never does at these sizes: 0
 * failures in 2,000 draws a level from `makeRng(12345)`.
 *
 * The rng is spent in exactly this order — one `randInt` for the start, then
 * one shuffle of `orthogonal` per step tried — and every board a seed deals
 * rests on that.
 */
export function randomSnake(rng: Rng, n: number, length: number, budget = 4000): number[] | null {
  const on = new Uint8Array(n * n)
  const path: number[] = []
  let tries = 0
  const walk = (): boolean => {
    if (path.length === length) return true
    if (++tries > budget) return false
    for (const cell of shuffled(rng, orthogonal(n, path[path.length - 1]))) {
      if (!canAppend(n, on, path, cell, true)) continue
      on[cell] = 1
      path.push(cell)
      if (walk()) return true
      path.pop()
      on[cell] = 0
      if (tries > budget) return false
    }
    return false
  }
  const start = randInt(rng, n * n)
  on[start] = 1
  path.push(start)
  return walk() ? path : null
}

export interface Deal {
  head: number
  tail: number
  rowClues: number[]
  colClues: number[]
  /** The snake that was drawn, head first. The tests lay it; the board never sees it. */
  answer: number[]
}

/** A snake, and the board it makes: its two ends and the numbers read off it. */
export function draw(rng: Rng, n: number, length: number): Deal | null {
  const path = randomSnake(rng, n, length)
  if (path === null) return null
  const rowClues = new Array<number>(n).fill(0)
  const colClues = new Array<number>(n).fill(0)
  for (const cell of path) {
    rowClues[rowOf(n, cell)]++
    colClues[colOf(n, cell)]++
  }
  return { head: path[0], tail: path[length - 1], rowClues, colClues, answer: path }
}

/**
 * The board as looking finishes it, or null when the board will not do at all.
 *
 * The three promises that every board here makes, whatever level dealt it.
 * It comes out by looking, and what comes out is the snake that was drawn. The
 * numbers alone do not finish it, so the snake has to be followed. And
 * following alone does not finish it either, so the numbers have to be
 * counted — with the dots still drawn, because a full line's dots are the
 * board's, not the child's. So every hint that teaches a step teaches one the
 * board asks for.
 *
 * Measured on 20,000 raw draws a level from `makeRng(424242)` that come out by
 * looking and sit in their band, the last two promises throw away 62.1% of
 * level one (the numbers alone finish 3,127 of 12,471, and following alone
 * 5,242), 23.9% of level two (all of it following alone), and nothing at level
 * three, where they are guarantees that happen to cost nothing.
 */
export function reasonedOut(n: number, board: Deal): Deduction | null {
  const { head, tail, rowClues, colClues, answer } = board
  const found = solveByLooking(n, head, tail, rowClues, colClues)
  if (found === null) return null
  if (found.snake.join() !== [...answer].sort((a, b) => a - b).join()) return null
  if (solveByLooking(n, head, tail, rowClues, colClues, { ends: false }) !== null) return null
  if (solveByLooking(n, head, tail, rowClues, colClues, { tight: false }) !== null) return null
  return found
}

/** Inside the level's own band of waves. */
export function inBand(config: SnakeConfig, reasoned: Deduction): boolean {
  return reasoned.steps >= config.minSteps && reasoned.steps <= config.maxSteps
}

/**
 * True when this board is the board the level asked for: the three promises,
 * and then the level's band of waves, whose ceiling is no higher than the
 * floor of the level above (see `SnakeConfig`).
 */
export function fits(config: SnakeConfig, board: Deal): boolean {
  const reasoned = reasonedOut(config.n, board)
  return reasoned !== null && inBand(config, reasoned)
}

/** How many snakes `deal` draws before it settles for less. */
const ATTEMPTS = 2000

/**
 * A board for this level.
 *
 * Every snake is drawn finished, so the loop is only ever choosing between
 * boards that have an answer, and the first one inside the level's band wins.
 * That band is the only thing a bad run can cost: what comes back when no
 * snake suits the level still keeps all three promises, because `reasonedOut`
 * is the only thing this ever keeps. A board that cannot promise them is not
 * handed out at all — there is no honest board left to hand out, so this says
 * so instead.
 *
 * Neither is anywhere near the road a player travels. About one draw in four
 * keeps the promises at the worst of the three levels — 25.8%, 43.2% and 23.8%
 * of 20,000 draws from `makeRng(424242)` — so ATTEMPTS of them all missing is
 * a chance of 0.762 to the 2000th, about 10 to the -236. And every one of
 * seeds 0 to 999 lands inside its band on every level, at a mean of 4.3, 2.9
 * and 11.4 draws and a worst of 28, 20 and 79.
 */
export function deal(rng: Rng, config: SnakeConfig): Deal {
  const { n, length } = config
  let sound: Deal | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const board = draw(rng, n, length)
    if (board === null) continue
    const reasoned = reasonedOut(n, board)
    if (reasoned === null) continue
    if (inBand(config, reasoned)) return board
    sound ??= board
  }

  if (sound !== null) return sound
  throw new Error(`No ${n} by ${n} snake of ${length} came out by looking in ${ATTEMPTS} tries.`)
}

/* ============================================================
   The board on the card

   The picture in the collection is a real three-across board of
   this puzzle's own, so it lives here in the puzzle's own terms
   rather than as a drawing that happens to look like one:
   `glyphs.tsx` draws exactly this, and `logic.test.ts` holds it
   together. The numerals round the edge really are the numbers
   this snake makes, and this snake is the one answer they have,
   with the corner clause and without it.

   Down from the head, across the middle row, down to the tail: an
   S, whose two bends are the only corners that meet, and which
   stays off the rim — drawn along the rim as a C, the snake read
   at 28px as a frame round the field.
   ============================================================ */
export const CARD = {
  n: 3,
  head: 0,
  tail: 8,
  /** The answer, head first. */
  snake: [0, 3, 4, 5, 8],
  /** Read off that answer: rows down the side, columns along the top. */
  rowClues: [1, 3, 1],
  colClues: [2, 1, 2],
}
