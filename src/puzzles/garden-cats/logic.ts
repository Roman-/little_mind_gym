import { randInt, shuffled } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'

/* ============================================================
   The garden cats.

   A grid is cut into coloured gardens, one garden a cat. Two
   cats never share a row or a column, and no cat will sit next
   to another — not even corner to corner. It is the puzzle sold
   as Meowdoku, and under the cats it is the old star-battle
   board: one star a region, none of them touching.

   Everything here is pure and framework-free. Three things are
   worth reading twice.

   `solveByLogic` fills a board using only the two steps an
   eight-year-old can actually make, and `deal` throws away every
   board it cannot finish. A solver that only ever sits a cat
   where the rules leave one square also proves the board has
   exactly one answer, so uniqueness and "no guessing" are one
   check here rather than two.

   `carve` is why there is anything to find. Gardens grown at
   random almost never leave the cats one way to sit — at six a
   side it happens about once in two hundred and fifty — so the
   board is cut about afterwards: find a second answer, move one
   square out of the garden that answer used, and look again.

   And what this board deliberately does not have: pencil crosses
   on the squares a cat cannot use. The paper game is played with
   them, and here they would cost a move each — the shell counts
   one dispatched action as one move — so a seven-move board would
   report thirty. The board stays a board of cats, and the levels
   are sized so the crossing-off fits in a head.
   ============================================================ */

export interface GardenConfig {
  /** Rows, columns, gardens and cats all come in this many. */
  n: number
  /**
   * How many passes over the rules the board must take, at least and at most.
   * One pass is a giveaway; six is a sit-down. It is the only difficulty knob
   * apart from the size, and it is measured on the solver rather than guessed.
   */
  minRounds: number
  maxRounds: number
}

export interface GardenState {
  n: number
  /** Row-major. Which garden each square belongs to, 0..n-1. Never changes. */
  gardens: number[]
  /** Row-major. True where a cat is sitting. */
  cats: boolean[]
}

/** One tap: a cat sits down on an empty square, or gets up off its own. */
export type GardenAction = { type: 'toggle'; index: number }

/* --- reading the grid ---------------------------------------- */

export const rowOf = (n: number, index: number): number => Math.floor(index / n)
export const colOf = (n: number, index: number): number => index % n

export function rowCells(n: number, r: number): number[] {
  return Array.from({ length: n }, (_, c) => r * n + c)
}

export function colCells(n: number, c: number): number[] {
  return Array.from({ length: n }, (_, r) => r * n + c)
}

export function gardenCells(gardens: number[], g: number): number[] {
  const out: number[] = []
  for (let i = 0; i < gardens.length; i++) if (gardens[i] === g) out.push(i)
  return out
}

/** The squares that share an edge with this one. Gardens grow along these. */
export function orthogonal(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  if (r > 0) out.push(index - n)
  if (r < n - 1) out.push(index + n)
  if (c > 0) out.push(index - 1)
  if (c < n - 1) out.push(index + 1)
  return out
}

/** The eight squares round this one. A cat will not sit on any of them. */
export function touching(n: number, index: number): number[] {
  const r = rowOf(n, index)
  const c = colOf(n, index)
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc)
    }
  }
  return out
}

/** A cat's own square and the eight round it: the space it keeps to itself. */
export function space(n: number, index: number): number[] {
  return [index, ...touching(n, index)]
}

export function catCells(state: GardenState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.cats.length; i++) if (state.cats[i]) out.push(i)
  return out
}

/** Gardens with nothing sitting in them. The one number the board reads out. */
export function emptyGardens(state: GardenState): number {
  const seated = new Set(catCells(state).map((i) => state.gardens[i]))
  return state.n - seated.size
}

/** True when two cats on these squares would break one of the three rules. */
export function clashes(n: number, gardens: number[], a: number, b: number): boolean {
  if (a === b) return false
  const ra = rowOf(n, a)
  const ca = colOf(n, a)
  const rb = rowOf(n, b)
  const cb = colOf(n, b)
  if (ra === rb || ca === cb) return true
  if (gardens[a] === gardens[b]) return true
  return Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<GardenConfig>, rng: Rng): GardenState {
  const { n } = level.config
  return { n, gardens: deal(rng, level.config), cats: new Array<boolean>(n * n).fill(false) }
}

export function reduce(state: GardenState, action: GardenAction): GardenState {
  if (action.type !== 'toggle') return state
  const { index } = action
  if (!Number.isInteger(index) || index < 0 || index >= state.cats.length) return state
  const cats = state.cats.slice()
  cats[index] = !cats[index]
  return { ...state, cats }
}

export function isSolved(state: GardenState): boolean {
  const seated = catCells(state)
  if (seated.length !== state.n) return false
  if (new Set(seated.map((i) => state.gardens[i])).size !== state.n) return false
  for (const a of seated) {
    for (const b of seated) if (a < b && clashes(state.n, state.gardens, a, b)) return false
  }
  return true
}

/** Every cat that breaks a rule with another cat. Drawn in clay, never hidden. */
export function conflicts(state: GardenState): boolean[] {
  const seated = catCells(state)
  return state.cats.map(
    (cat, i) => cat && seated.some((other) => clashes(state.n, state.gardens, i, other)),
  )
}

/** Which rule a cat has broken. */
export type ClashKind = 'row' | 'column' | 'garden' | 'touching'

/** One placement, and the group of squares that will not have it. */
export interface Clash {
  kind: ClashKind
  /** Which row or column, counting from 1. A garden is not numbered out loud. */
  ordinal: number
  /** Every square in the group, so the board can light the whole of it. */
  cells: number[]
  /** The two cats at fault: the one just sat down, and the one it fell foul of. */
  blamed: number[]
}

/**
 * The rule that sitting a cat on `index` breaks, or null if the square takes
 * it.
 *
 * One square can break three rules at once and only the first is reported —
 * three groups lit together say nothing about any of them. The order is the
 * order a child checks by eye: along the row, down the column, round the
 * garden, and last the squares immediately about the cat, which is the only
 * rule left once the other three are clear.
 */
export function clashOf(state: GardenState, index: number): Clash | null {
  const { n, gardens } = state
  const seated = new Set(catCells(state).filter((i) => i !== index))
  /** The cats in this group, and the one about to join them. */
  const blame = (cells: number[]) => {
    const found = cells.filter((i) => seated.has(i))
    return found.length === 0 ? null : [index, ...found]
  }

  const r = rowOf(n, index)
  const inRow = blame(rowCells(n, r))
  if (inRow !== null) {
    return { kind: 'row', ordinal: r + 1, cells: rowCells(n, r), blamed: inRow }
  }

  const c = colOf(n, index)
  const inCol = blame(colCells(n, c))
  if (inCol !== null) {
    return { kind: 'column', ordinal: c + 1, cells: colCells(n, c), blamed: inCol }
  }

  const g = gardens[index]
  const cells = gardenCells(gardens, g)
  const inGarden = blame(cells)
  if (inGarden !== null) {
    return { kind: 'garden', ordinal: g + 1, cells, blamed: inGarden }
  }

  const near = blame(touching(n, index))
  if (near !== null) {
    return { kind: 'touching', ordinal: 0, cells: space(n, index), blamed: near }
  }

  return null
}

/** The broken rule in one sentence. The lit group says where; this says what. */
export function describeClash(clash: Clash): string {
  if (clash.kind === 'row') return `There is already a cat in row ${clash.ordinal}.`
  if (clash.kind === 'column') return `There is already a cat in column ${clash.ordinal}.`
  if (clash.kind === 'garden') return 'This garden already has a cat.'
  return 'These two cats are touching.'
}

export function describeMove(prev: GardenState, _next: GardenState, action: GardenAction): string {
  const where = `row ${rowOf(prev.n, action.index) + 1}, column ${colOf(prev.n, action.index) + 1}`
  return prev.cats[action.index] ? `Picked the cat up from ${where}` : `Sat a cat in ${where}`
}

/** Every action that would change something. Used by the tests to check `par`. */
export function legalMoves(state: GardenState): GardenAction[] {
  return state.cats.map((_, index) => ({ type: 'toggle', index }) as GardenAction)
}

/* ============================================================
   Reasoning a board out

   Nothing is printed on this board: it starts empty, and the
   first cat has to be argued for. Two steps do all of it.

   One: a garden, a row or a column that still owes a cat and has
   one square left has to use that square.

   Two: if every square a garden could still use would rule some
   other square out, that square is out — whichever square the
   cat turns out to sit on. Most of the time this is the sentence
   a child says out loud: "the whole green garden is in row 4, so
   row 4 is the green cat's". The rest of the time it is the same
   argument about two squares in a corner, ruling out the square
   they both touch. Rows and columns argue the same way.
   ============================================================ */

/** What a board asked to be reasoned through gives back. */
export interface Deduction {
  /** Where each garden's cat has to go, indexed by garden. */
  seats: number[]
  /** Passes over the two steps it took. This is the level's difficulty. */
  rounds: number
}

/**
 * Fill the board the way a child would, and stop the moment it would have to
 * guess.
 *
 * Because it only ever sits a cat where the rules leave one square, a board it
 * finishes has exactly one answer — so uniqueness and "no guessing" are one
 * check rather than two. `countSolutions` below is held against it in the
 * tests to keep that claim honest.
 */
export function solveByLogic(n: number, gardens: number[]): Deduction | null {
  const size = n * n
  const open = new Array<boolean>(size).fill(true)
  const seats = new Array<number>(n).fill(-1)
  const rowDone = new Array<boolean>(n).fill(false)
  const colDone = new Array<boolean>(n).fill(false)
  let rounds = 0

  const sit = (cell: number) => {
    const g = gardens[cell]
    const r = rowOf(n, cell)
    const c = colOf(n, cell)
    seats[g] = cell
    rowDone[r] = true
    colDone[c] = true
    for (let i = 0; i < size; i++) {
      if (gardens[i] === g || rowOf(n, i) === r || colOf(n, i) === c) open[i] = false
    }
    for (const nb of touching(n, cell)) open[nb] = false
  }

  /** Every group that still owes a cat. Asked for again after every placement. */
  const owing = (): number[][] => {
    const out: number[][] = []
    for (let g = 0; g < n; g++) if (seats[g] === -1) out.push(gardenCells(gardens, g))
    for (let r = 0; r < n; r++) if (!rowDone[r]) out.push(rowCells(n, r))
    for (let c = 0; c < n; c++) if (!colDone[c]) out.push(colCells(n, c))
    return out
  }

  for (;;) {
    let moved = false
    let broken = false

    /**
     * Step one, over one group. The three loops below ask whether the group
     * still owes a cat at the moment they reach it rather than working from a
     * list made at the top of the pass: a cat sat down two groups ago may have
     * settled this one, and a group that has just been settled has no free
     * square left at all, which would read as a board with no answer.
     */
    const settle = (cells: number[]) => {
      const free = cells.filter((i) => open[i])
      if (free.length === 0) broken = true
      else if (free.length === 1) {
        sit(free[0])
        moved = true
      }
    }

    for (let g = 0; g < n; g++) if (seats[g] === -1) settle(gardenCells(gardens, g))
    for (let r = 0; r < n; r++) if (!rowDone[r]) settle(rowCells(n, r))
    for (let c = 0; c < n; c++) if (!colDone[c]) settle(colCells(n, c))
    if (broken) return null

    // Step two, and only once step one has run out — so `rounds` counts what a
    // child would really have had to do. Nothing is placed here, so the list
    // of groups is safe to take once.
    if (!moved) {
      for (const cells of owing()) {
        const free = cells.filter((i) => open[i])
        if (free.length < 2) continue
        for (let x = 0; x < size; x++) {
          if (!open[x]) continue
          if (free.every((cand) => clashes(n, gardens, cand, x))) {
            open[x] = false
            moved = true
          }
        }
      }
    }

    if (!moved) break
    rounds++
  }

  return seats.some((cell) => cell === -1) ? null : { seats, rounds }
}

/**
 * Every way the cats can sit, up to `cap` of them, each as one square a
 * garden. Branching on the smallest garden first is a plain speed-up.
 */
export function solutions(n: number, gardens: number[], cap: number): number[][] {
  const byGarden = Array.from({ length: n }, (_, g) => gardenCells(gardens, g))
  const order = Array.from({ length: n }, (_, g) => g).sort(
    (a, b) => byGarden[a].length - byGarden[b].length,
  )
  const seated: number[] = []
  const found: number[][] = []

  const walk = (k: number): void => {
    if (k === order.length) {
      const answer = new Array<number>(n)
      order.forEach((g, at) => {
        answer[g] = seated[at]
      })
      found.push(answer)
      return
    }
    for (const cell of byGarden[order[k]]) {
      if (seated.some((other) => clashes(n, gardens, cell, other))) continue
      seated.push(cell)
      walk(k + 1)
      seated.pop()
      if (found.length >= cap) return
    }
  }

  walk(0)
  return found
}

/** How many ways the cats can sit, counted no further than `cap`. */
export function countSolutions(n: number, gardens: number[], cap = 2): number {
  return solutions(n, gardens, cap).length
}

/* ============================================================
   Making a board

   Backwards, from a finished one: sit the cats down first, grow
   a garden round each, and then cut the gardens about until the
   cats have only one way to sit. Nothing here can produce a
   board with no answer, because the answer was drawn first.
   ============================================================ */

/**
 * Where the cats end up: one a row, one a column, and never two in
 * neighbouring rows within a column of each other. Backtracking over shuffled
 * columns, so every arrangement a board could have is reachable from some seed.
 */
export function randomSeats(rng: Rng, n: number): number[] | null {
  const columns = Array.from({ length: n }, (_, c) => c)
  const taken = new Array<boolean>(n).fill(false)
  const cols: number[] = []

  const walk = (r: number): boolean => {
    if (r === n) return true
    for (const c of shuffled(rng, columns)) {
      if (taken[c]) continue
      // Cats in neighbouring rows have to be two columns apart, or they would
      // be sitting corner to corner.
      if (r > 0 && Math.abs(c - cols[r - 1]) < 2) continue
      taken[c] = true
      cols.push(c)
      if (walk(r + 1)) return true
      cols.pop()
      taken[c] = false
    }
    return false
  }

  return walk(0) ? cols.map((c, r) => r * n + c) : null
}

/**
 * Grow a garden out of every seat until the grid is used up: pick a garden
 * that can still grow, then one square it could take. Picking the garden
 * first and the square second is what keeps the gardens roughly the same
 * size — picking a square first would let a garden with a long edge run away
 * with the board.
 */
export function growGardens(rng: Rng, n: number, seats: number[]): number[] {
  const gardens = new Array<number>(n * n).fill(-1)
  seats.forEach((cell, g) => {
    gardens[cell] = g
  })

  for (let left = n * n - seats.length; left > 0; left--) {
    const frontiers: number[][] = seats.map(() => [])
    for (let i = 0; i < gardens.length; i++) {
      if (gardens[i] !== -1) continue
      for (const nb of orthogonal(n, i)) {
        const g = gardens[nb]
        if (g !== -1 && !frontiers[g].includes(i)) frontiers[g].push(i)
      }
    }
    const growable = frontiers.map((f, g) => (f.length > 0 ? g : -1)).filter((g) => g !== -1)
    // The grid is joined up, so while a square is free some garden reaches it.
    if (growable.length === 0) break
    const g = growable[randInt(rng, growable.length)]
    gardens[frontiers[g][randInt(rng, frontiers[g].length)]] = g
  }
  return gardens
}

/** True when these squares hang together edge to edge. A garden must. */
export function connected(n: number, cells: number[]): boolean {
  if (cells.length === 0) return false
  const inside = new Set(cells)
  const seen = new Set([cells[0]])
  const stack = [cells[0]]
  while (stack.length > 0) {
    for (const nb of orthogonal(n, stack.pop() as number)) {
      if (inside.has(nb) && !seen.has(nb)) {
        seen.add(nb)
        stack.push(nb)
      }
    }
  }
  return seen.size === cells.length
}

/** How big each garden came out. */
export function gardenSizes(n: number, gardens: number[]): number[] {
  const sizes = new Array<number>(n).fill(0)
  for (const g of gardens) sizes[g]++
  return sizes
}

/**
 * Cut the board about until the cats have one way to sit, or give up.
 *
 * Every pass looks for a second answer and takes one square away from a garden
 * that answer needed, handing it to a garden next door. The square is never a
 * square the true answer sits on, so the board a child is given always still
 * works; and the garden it leaves has to stay joined up and keep two squares,
 * so no garden ever shrinks onto its own cat.
 */
export function carve(rng: Rng, n: number, seats: number[], start: number[], cuts: number): number[] | null {
  const gardens = start.slice()
  const seated = new Set(seats)

  for (let cut = 0; cut < cuts; cut++) {
    const answers = solutions(n, gardens, 2)
    if (answers.length === 0) return null
    if (answers.length === 1) return gardens
    const other = answers.find((answer) => answer.some((cell, g) => cell !== seats[g]))
    if (other === undefined) return null

    // The gardens that answer puts its cat somewhere else in, in a shuffled
    // order so the same board is not always cut in the same corner.
    const loose = shuffled(
      rng,
      other.map((cell, g) => (cell === seats[g] ? -1 : g)).filter((g) => g !== -1),
    )
    const moved = loose.some((g) => {
      const cell = other[g]
      if (seated.has(cell)) return false
      const rest = gardenCells(gardens, g).filter((i) => i !== cell)
      if (rest.length < 2 || !connected(n, rest)) return false
      const neighbours = [...new Set(orthogonal(n, cell).map((i) => gardens[i]))].filter(
        (o) => o !== g,
      )
      if (neighbours.length === 0) return false
      // To the smallest neighbour. Cutting always takes from the garden the
      // extra answer used, so without this the squares drift the same way
      // every time and one garden ends up owning half the board.
      const sizes = gardenSizes(n, gardens)
      const smallest = Math.min(...neighbours.map((o) => sizes[o]))
      const takers = neighbours.filter((o) => sizes[o] === smallest)
      gardens[cell] = takers[randInt(rng, takers.length)]
      return true
    })
    if (!moved) return null
  }
  return null
}

/**
 * A garden's number decides its colour, and the gardens are grown in the order
 * of the rows their cats sit in — so without this the first colour would
 * always hold the top cat. Renaming them at random costs nothing and says
 * nothing.
 */
export function shuffleNames(rng: Rng, n: number, gardens: number[]): number[] {
  const names = shuffled(
    rng,
    Array.from({ length: n }, (_, g) => g),
  )
  return gardens.map((g) => names[g])
}

/** True when this board is the board the level asked for. */
export function fits(config: GardenConfig, gardens: number[]): boolean {
  const { n, minRounds, maxRounds } = config
  // A garden of one square hands its cat over before the puzzle starts, and a
  // garden with a third of the board in it is a picture of nothing.
  const sizes = gardenSizes(n, gardens)
  if (sizes.some((size) => size < 2 || size > 2 * n)) return false
  const reasoned = solveByLogic(n, gardens)
  if (reasoned === null) return false
  return reasoned.rounds >= minRounds && reasoned.rounds <= maxRounds
}

/** How many boards `deal` looks at, and how many cuts each one gets. */
const ATTEMPTS = 400
const CUTS = 60

/**
 * A board for this level.
 *
 * Every board here has an answer by construction, so the loop is only ever
 * choosing between boards that work: the first one that suits the level wins.
 * The two fallbacks are for a run of luck bad enough that the tests have never
 * seen it — sixty seeds a level all land on the first line.
 */
export function deal(rng: Rng, config: GardenConfig): number[] {
  const { n } = config
  let reasoned: number[] | null = null
  let anyBoard: number[] | null = null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const seats = randomSeats(rng, n)
    if (seats === null) continue
    const grown = growGardens(rng, n, seats)
    anyBoard ??= shuffleNames(rng, n, grown)
    const carved = carve(rng, n, seats, grown, CUTS)
    if (carved === null) continue
    // Named before it is weighed, not after: a garden's number is the order the
    // solver reads the gardens in, so renaming a board can move its round count
    // by one, and the board handed over has to be the board that was measured.
    const board = shuffleNames(rng, n, carved)
    if (fits(config, board)) return board
    if (reasoned === null && solveByLogic(n, board) !== null) reasoned = board
  }

  return reasoned ?? (anyBoard as number[])
}
