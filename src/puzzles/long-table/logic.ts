import { randInt } from '../../lib/rng'
import type { PuzzleLevel, Rng } from '../../lib/types'
import type { PictoName } from '../../components/pictogram-art'

/* ============================================================
   The long table.

   Animals sit in a row along one table. Some of them cannot
   sit next to each other, and none of those pairs may end up
   next to each other. One tap on a gap swaps two neighbours,
   and the swaps are counted out: a level hands the player
   exactly as many as the shortest way needs, and not one more.

   Everything here is pure. Four things are worth reading
   twice.

   `distanceTable` is the whole engine. Every seating is a
   permutation of the cast, neighbour swaps join them, and the
   graph is small enough — 120, 720 and 5040 seatings — to walk
   the whole of it once from *every* good seating at the same
   time. What comes back is, for each of the n! seatings, the
   fewest swaps to a seating that works. That one table is what
   says what `par` is, which seatings are worth dealing, and —
   through `luckyLines` — which of the ways of tapping a deal
   out ever come home. It is asked all of that while the level
   is being built and none of it afterwards: play itself needs
   only the count of swaps. The whole build — every seating,
   the walk out, and the gates the deal is chosen against —
   runs in about 30ms for seven guests, and it is built once
   per config and kept. logic.test.ts builds a config the memo
   has never seen and holds that under 300ms, which is where to
   re-measure it.

   `failure` fires when the swaps are spent and two who cannot
   sit next to each other are still next to each other, and it
   says nothing at all before then. `legalMoves` is empty at
   exactly that moment, so this is frog-leap's dead end — a
   position with nothing left to do and the puzzle not done —
   written for a budget rather than for a jammed row.

   It read the other way round first: the level ended the
   instant the row could no longer be fixed inside the swaps
   that remain, which — since the budget is exactly par — is
   the instant a swap leaves a shortest line. That board
   answered "was that the right move?" after every single tap,
   which is the shape docs/DESIGN.md forbids one level up. Tap
   everything, and whatever does not dead-end is on the
   shortest line: the rules never have to be held in a head at
   all. A child who tapped a gap, read the dead end and stepped
   back was walked home in 7.08, 10.46 and 13.94 taps against a
   par of 3, 4 and 5 — a solve for about four, six and nine
   wrong taps and no thought about the row. The same child pays
   34.75, 230.52 and 1410.65 taps under this rule, and a child
   who starts over rather than stepping back pays 144, 866 and
   4054. `lucky` below only becomes a difficulty dial here: a
   child guided tap by tap never has to find a whole line, so
   under the eager rule the gate the three levels ramp on was
   decoration. Tapping the swaps out blind comes home once in
   43 runs, then once in 188, then once in 555.

   The price is real, and it is stated rather than defended. A
   child who leaves the shortest line plays on in a row that
   can no longer be put right — over every way of tapping a
   deal out, 1.57, 2.44 and 3.12 more taps on average, and at
   most 2, 3 and 4 — and then steps back 2.57, 3.44 and 4.12
   times on average to stand where a win is still reachable
   again. Nothing on the board says so while it is happening,
   and nothing should: a mark meaning "this row can
   still be saved" is the same oracle in another coat, and
   docs/DESIGN.md rules out the tell that only good moves get.
   What the board does say is how many swaps are left, which is
   a rule of the level rather than a reading of the row — and
   the clay flash now lands on a counter reading "No swaps
   left" instead of over one still reading "2 swaps left".

   Every number in the two paragraphs above is taken under
   "a child who does not look at the row" at the bottom of
   logic.test.ts, worked out exactly rather than sampled, so
   re-taking them after a change to the deal gives one answer
   and not a different one for every seed.

   `dealsFor` is the deal. It hands back every seating that is
   exactly `swaps` away from a good one, less the ones a
   mindless climber could get home (see `climberGetsHome`) and
   the ones where too many — or too few — of the
   (seats - 1) ^ swaps ways of tapping happen to work (see
   `luckyLines`, `lucky` and `floor`). There is no retry, no
   fallback and no give: the pool is enumerated, and an empty
   one throws rather than dealing a board that breaks the
   promise. logic.test.ts holds every member of all three pools
   to all four conditions.

   And nothing on this board is ever refused, so there is no
   `refusalOf` beside `canSwap`. Every pair of neighbours may
   be swapped — that is the whole move — and a seating that
   puts two who quarrel next to each other is a position, not a
   forbidden move. What the rules will not do is pay for a swap
   that cannot be afforded, and that is `failure`, which the
   shell answers with Step back.
   ============================================================ */

/** One animal at the table. */
export interface Guest {
  id: string
  /** Sentence case, for a label: "Wolf". */
  label: string
  /** The picture on the piece. One of the names in components/Pictogram. */
  art: PictoName
}

/** Two who cannot sit next to each other, named by id. Order does not matter. */
export interface Quarrel {
  a: string
  b: string
}

export interface TableConfig {
  /** The cast, in the order the roster reads them out. Never re-ordered by play. */
  guests: Guest[]
  quarrels: Quarrel[]
  /**
   * How many swaps the player is given. It is always the level's `par`: the
   * deal is chosen to be exactly this far from a good seating, so the budget
   * is the whole of the shortest way and there is nothing spare in it. A run
   * that ever leaves a shortest line cannot come home, and `failure` says so
   * when the last swap has been spent.
   */
  swaps: number
  /**
   * True where a deal has to beat the mindless climber — the player who counts
   * the pairs still sitting together and always makes the swap that leaves the
   * fewest. The first level leaves it off on purpose: the obvious idea is
   * meant to work on the level that teaches the puzzle. See `climberGetsHome`.
   */
  climberProof: boolean
  /**
   * The luckiest a deal on this level may be: of the (guests - 1) ^ swaps ways
   * of tapping `swaps` gaps with no thought at all, at most this many end with
   * everybody seated. The board says nothing until the swaps are spent, so
   * that count is the chance a blind run really comes home, and it is the dial
   * the three levels ramp on: 2 of 64, then 6 of 625, then 24 of 7776. See
   * `luckyLines`.
   */
  lucky: number
  /**
   * The unluckiest a deal on this level may be, counted the same way: at least
   * this many of the ways of tapping it out end with everybody seated. 1 of
   * 64, then 2 of 625, then 4 of 7776.
   *
   * A cap on its own cannot make the ramp. It bounds the *easiest* deal on a
   * level, and "every deal here is stiffer than every deal on the level
   * before" needs a bound on the *hardest* deal there as well — which is this.
   * With both, the ramp is arithmetic on the three configs rather than a
   * measurement that happened to land well: 6/625 is under 1/64, and 24/7776
   * is under 2/625. logic.test.ts checks that off the configs, and again off
   * the pools the gates actually build.
   *
   * No floor turns a seating away today, and neither does the first level's
   * cap of 2 — two is already the most any five-seat deal manages. They are
   * gates that state the promise: a retune that broke it would empty a pool
   * and throw rather than quietly deal a level that no longer ramps.
   * logic.test.ts counts what every gate turns away, so the day one of them
   * starts biting is visible.
   */
  floor: number
}

export interface TableState {
  cfg: TableConfig
  /** One entry a seat, left to right: which guest is sitting in it. */
  seats: number[]
  /** Swaps made so far. */
  used: number
}

/**
 * One swap: the two neighbours either side of gap `seam` change places. Seam
 * `i` is the gap between seat `i` and seat `i + 1`, so a row of five seats has
 * four of them. One tap, one swap, one move — there is no selection step.
 */
export type TableAction = { type: 'swap'; seam: number }

/**
 * Shown by the shell when the last swap has been spent and the row is still
 * wrong.
 *
 * Two sentences: what happened, and then what it means. That is the shape of
 * balance-scales' 'You have used every weighing. More than one ball could
 * still be the heavy one.', and it is the order docs/DESIGN.md asks for. The
 * shell adds the way out.
 *
 * Both halves are checkable at the moment it is said, which is the whole
 * reason it may be said at all: the counter beside it reads "No swaps left",
 * and `isSolved` is false exactly when two who cannot sit next to each other
 * are still next to each other. The board is not claiming anything about the
 * swap that was just made — under this rule it does not know which swap was
 * the wrong one, and saying so is what the eager reading of the dead end used
 * to give away.
 *
 * One relation, one name for it: "sit next to", the same words the roster
 * above the table, the instructions, the hints and every quarrel card use.
 */
export const OUT_OF_SWAPS =
  'You have used every swap. ' +
  'Two animals who cannot sit next to each other are still next to each other.'

/** How a guest is referred to in a sentence: "the wolf". */
export function nameFor(guest: Guest): string {
  return `the ${guest.label.toLowerCase()}`
}

/* --- reading a seating --------------------------------------- */

/**
 * One string a seating. A cast never runs past ten, so a digit a seat is a
 * key, and a key is what the distance table is indexed by.
 */
export function seatKey(seats: readonly number[]): string {
  return seats.join('')
}

/** The same seating with the two guests either side of `seam` changed over. */
export function swapSeats(seats: readonly number[], seam: number): number[] {
  const out = seats.slice()
  out[seam] = seats[seam + 1]
  out[seam + 1] = seats[seam]
  return out
}

const grids = new WeakMap<TableConfig, boolean[][]>()

/** `quarrelGrid(cfg)[a][b]`: these two cannot sit next to each other. */
export function quarrelGrid(cfg: TableConfig): boolean[][] {
  const hit = grids.get(cfg)
  if (hit) return hit
  const n = cfg.guests.length
  const grid = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const where = new Map(cfg.guests.map((g, i) => [g.id, i]))
  for (const { a, b } of cfg.quarrels) {
    const x = where.get(a)
    const y = where.get(b)
    if (x === undefined || y === undefined) throw new Error(`${a} and ${b} are not both at this table`)
    if (x === y) throw new Error(`${a} cannot quarrel with itself`)
    grid[x][y] = true
    grid[y][x] = true
  }
  grids.set(cfg, grid)
  return grid
}

/** Every gap where the two neighbours cannot sit next to each other, left to right. */
export function quarrelSeams(cfg: TableConfig, seats: readonly number[]): number[] {
  const grid = quarrelGrid(cfg)
  const out: number[] = []
  for (let i = 0; i + 1 < seats.length; i++) if (grid[seats[i]][seats[i + 1]]) out.push(i)
  return out
}

/** Nobody is sitting next to somebody they cannot sit next to. */
export function isGoodSeating(cfg: TableConfig, seats: readonly number[]): boolean {
  const grid = quarrelGrid(cfg)
  for (let i = 0; i + 1 < seats.length; i++) if (grid[seats[i]][seats[i + 1]]) return false
  return true
}

/** Every seating of `n` guests, in one fixed order. 5040 of them at seven. */
export function everySeating(n: number): number[][] {
  const out: number[][] = []
  const seats: number[] = []
  const seated = new Array<boolean>(n).fill(false)
  const walk = () => {
    if (seats.length === n) {
      out.push(seats.slice())
      return
    }
    for (let g = 0; g < n; g++) {
      if (seated[g]) continue
      seated[g] = true
      seats.push(g)
      walk()
      seats.pop()
      seated[g] = false
    }
  }
  walk()
  return out
}

const tables = new WeakMap<TableConfig, Map<string, number>>()

/**
 * For every seating of the cast, the fewest neighbour swaps that reach a
 * seating where nobody quarrels — one breadth-first walk outwards from all of
 * the good seatings at once.
 *
 * Neighbour swaps join every seating to every other, so the walk reaches all
 * n! of them and nothing is left undefined. It is kept against the config
 * because dealing asks it about every seating of the cast, twice — once for
 * the distance and again inside `luckyLines`.
 */
export function distanceTable(cfg: TableConfig): Map<string, number> {
  const hit = tables.get(cfg)
  if (hit) return hit
  const n = cfg.guests.length
  const dist = new Map<string, number>()
  let frontier: number[][] = []
  for (const seats of everySeating(n)) {
    if (!isGoodSeating(cfg, seats)) continue
    dist.set(seatKey(seats), 0)
    frontier.push(seats)
  }
  if (frontier.length === 0) throw new Error('nobody can be seated at this table at all')
  for (let step = 1; frontier.length > 0; step++) {
    const next: number[][] = []
    for (const seats of frontier) {
      for (let seam = 0; seam + 1 < n; seam++) {
        const child = swapSeats(seats, seam)
        const key = seatKey(child)
        if (dist.has(key)) continue
        dist.set(key, step)
        next.push(child)
      }
    }
    frontier = next
  }
  tables.set(cfg, dist)
  return dist
}

/** The fewest swaps from here to a seating that works. */
export function swapsToGo(cfg: TableConfig, seats: readonly number[]): number {
  const found = distanceTable(cfg).get(seatKey(seats))
  if (found === undefined) throw new Error('that is not a seating of this table')
  return found
}

/** Swaps still in hand. */
export function swapsLeft(state: TableState): number {
  return state.cfg.swaps - state.used
}

/* --- the engine ---------------------------------------------- */

export function init(level: PuzzleLevel<TableConfig>, rng: Rng): TableState {
  const cfg = level.config
  const deals = dealsFor(cfg)
  // A copy, never the pool's own array. The pool is built once and kept for
  // the life of the page, and every deal, every cross-check and every test
  // reads out of it; handing a player the very array they are about to be
  // seated in would put one stray in-place write between this level and every
  // game after it. `everySeating` pushes copies for the same reason.
  return { cfg, seats: deals[randInt(rng, deals.length)].slice(), used: 0 }
}

/**
 * True when the swap can be made. Two things stop it, and neither is a rule
 * about who may sit by whom: a gap that is not a gap in this row, and a swap
 * there is nothing left to pay for it with. Sitting two who quarrel side by
 * side is a position a player may take, so no tap on a real gap is ever
 * refused while a swap remains.
 */
export function canSwap(state: TableState, seam: number): boolean {
  if (!Number.isInteger(seam) || seam < 0 || seam + 1 >= state.seats.length) return false
  return swapsLeft(state) > 0
}

export function reduce(state: TableState, action: TableAction): TableState {
  if (action?.type !== 'swap') return state
  if (!canSwap(state, action.seam)) return state
  return { ...state, seats: swapSeats(state.seats, action.seam), used: state.used + 1 }
}

export function isSolved(state: TableState): boolean {
  return isGoodSeating(state.cfg, state.seats)
}

/**
 * The dead end: every swap has been spent and the row is still wrong.
 *
 * `legalMoves` is empty at exactly that moment, so this is frog-leap's `STUCK`
 * — nothing left to do and the puzzle not done — written for a budget instead
 * of a jammed row. It is deliberately the *late* reading and not the strong
 * one, which would fire the moment `swapsToGo` overran `swapsLeft`; the top of
 * this file has what that cost and what it gave away.
 *
 * Nothing is said about the swap that lost the level, because by the time this
 * fires the board no longer knows which one it was — and a board that did know
 * would be answering "was that the right move?" after every tap.
 */
export function failure(state: TableState): string | null {
  if (isSolved(state)) return null
  return swapsLeft(state) <= 0 ? OUT_OF_SWAPS : null
}

export function describeMove(prev: TableState, _next: TableState, action: TableAction): string {
  const { guests } = prev.cfg
  const a = guests[prev.seats[action.seam]]
  const b = guests[prev.seats[action.seam + 1]]
  if (a === undefined || b === undefined) return 'Swapped nobody'
  return `Swapped ${nameFor(a)} and ${nameFor(b)}`
}

/** Every gap in the row. Used by the board and by the tests. */
export function everySeam(seats: readonly number[]): number[] {
  return Array.from({ length: Math.max(0, seats.length - 1) }, (_, i) => i)
}

/** Every swap that would change something. Used by the tests to check `par`. */
export function legalMoves(state: TableState): TableAction[] {
  if (swapsLeft(state) <= 0) return []
  return everySeam(state.seats).map((seam) => ({ type: 'swap', seam }))
}

/* ============================================================
   Dealing

   Four conditions, and a pool rather than a retry. Every
   seating of the cast is looked at once; the ones that pass
   are the deals, and one of them is picked. If none passed,
   `dealsFor` throws — a level that cannot keep its promise is
   a bug to be seen, not a board to be dealt.
   ============================================================ */

/**
 * The mindless climber: a player who counts the pairs still sitting together
 * and always makes the swap that leaves the fewest of them, taking any of the
 * ties. True when *some* run of that gets everybody seated inside `swaps`.
 *
 * Lighting up the seams where two neighbours quarrel would hand a player this
 * and nothing more, and that is why this board does not light them (see
 * Board.tsx). With the dead end held back to the end of the budget, this is
 * the largest tell the board is in a position to give — so it is the one a
 * board can refuse, and levels two and three are dealt only from seatings
 * where every one of those runs falls short.
 *
 * Note what the *naive* reading of a lit seam does, which is nothing at all:
 * swapping two who quarrel leaves them next to each other, so a player who
 * taps lit seams and only lit seams can never seat anybody. logic.test.ts
 * proves that over the whole graph of all three levels.
 */
export function climberGetsHome(
  cfg: TableConfig,
  seats: readonly number[],
  swaps: number,
): boolean {
  const seen = new Map<string, boolean>()
  const walk = (row: readonly number[], left: number): boolean => {
    if (isGoodSeating(cfg, row)) return true
    if (left === 0) return false
    // A plain memo, and it needs no guard against a row the walk is already
    // inside: `left` falls by one at every step, so a key can only be reached
    // again once its own walk has finished and written the answer.
    const key = `${seatKey(row)}:${left}`
    const known = seen.get(key)
    if (known !== undefined) return known
    const tried = everySeam(row).map((seam) => swapSeats(row, seam))
    const fewest = Math.min(...tried.map((row2) => quarrelSeams(cfg, row2).length))
    let home = false
    for (const row2 of tried) {
      if (quarrelSeams(cfg, row2).length !== fewest) continue
      if (!walk(row2, left - 1)) continue
      home = true
      break
    }
    seen.set(key, home)
    return home
  }
  return walk(seats, swaps)
}

const lines = new WeakMap<TableConfig, Map<string, number>>()

/**
 * How many of the (guests - 1) ^ swaps ways of tapping `swaps` gaps at random
 * end with everybody seated.
 *
 * A level gives out exactly par, so a run that ever leaves a shortest line can
 * no longer come home: the runs that win are exactly the runs that are
 * shortest all the way through, and this counts them. Nothing is said until
 * the swaps are spent, so it is also the chance a child who taps without
 * looking wins one run — the puzzle's difficulty dial, and the one number that
 * says a longer row is not automatically a harder one. At most 2 of the 64
 * ways of tapping three swaps on the five-seat level, 6 of 625 on the six and
 * 24 of 7776 on the seven; at least 1, 2 and 4 (see `lucky` and `floor`).
 */
export function luckyLines(cfg: TableConfig, seats: readonly number[], swaps: number): number {
  const dist = distanceTable(cfg)
  let memo = lines.get(cfg)
  if (memo === undefined) {
    memo = new Map<string, number>()
    lines.set(cfg, memo)
  }
  const kept = memo
  const walk = (row: readonly number[], left: number): number => {
    if (left === 0) return isGoodSeating(cfg, row) ? 1 : 0
    const key = `${seatKey(row)}:${left}`
    const known = kept.get(key)
    if (known !== undefined) return known
    let count = 0
    for (const seam of everySeam(row)) {
      const child = swapSeats(row, seam)
      if (dist.get(seatKey(child)) !== left - 1) continue
      count += walk(child, left - 1)
    }
    kept.set(key, count)
    return count
  }
  return walk(seats, swaps)
}

const pools = new WeakMap<TableConfig, number[][]>()

/**
 * Every seating this level may open on: exactly `swaps` away from a good
 * seating, out of the climber's reach where the level asks for that, and with
 * the ways of tapping it out by luck between `floor` and `lucky`. The two ends
 * are what make the ramp a property of the deal — see `floor`.
 */
export function dealsFor(cfg: TableConfig): number[][] {
  const hit = pools.get(cfg)
  if (hit) return hit
  const dist = distanceTable(cfg)
  const pool: number[][] = []
  for (const seats of everySeating(cfg.guests.length)) {
    if (dist.get(seatKey(seats)) !== cfg.swaps) continue
    if (cfg.climberProof && climberGetsHome(cfg, seats, cfg.swaps)) continue
    const lucky = luckyLines(cfg, seats, cfg.swaps)
    if (lucky > cfg.lucky || lucky < cfg.floor) continue
    pool.push(seats)
  }
  if (pool.length === 0) throw new Error('no seating at this table can be dealt on these terms')
  pools.set(cfg, pool)
  return pool
}
