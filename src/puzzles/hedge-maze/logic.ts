import type { PuzzleLevel } from '../../lib/types'

/**
 * A hedge maze with a dog in it.
 *
 * The rabbit takes one turn: it steps into the next square, or stands still on
 * purpose. Then the dog takes two steps by a rule of its own — sideways towards
 * the rabbit first, then up or down, and a hedge stops it exactly as it stops
 * the rabbit. Both steps happen inside one `reduce`, so one dispatched action
 * is one turn a player would count.
 *
 * The maze itself never changes, and the dog's reply is a pure function of
 * (rabbit, dog), so the whole state is that pair. That is what makes `par` a
 * measured number rather than an estimate: the graph is a few hundred
 * positions and the breadth-first search in `src/lib/search.ts` walks all of
 * it.
 */

/** Up, right, down, left — clockwise from the top, and the bit each one owns. */
export type Dir = 0 | 1 | 2 | 3

/** In the order the bits are numbered, so `DIRS[d]` is always direction `d`. */
export const DIRS: Dir[] = [0, 1, 2, 3]

/** One word a direction, for the labels and the move tape. */
export const DIR_WORDS = ['up', 'right', 'down', 'left'] as const

export interface MazeConfig {
  /**
   * The board, drawn the way a maze is drawn on paper: 2n+1 lines of 2n+1
   * characters. '+' at every corner, '-' and '|' where a hedge stands, ' '
   * where the path runs through. 'R' is the rabbit's square, 'D' is the dog's,
   * '.' is an empty one, and 'o' is the gap in the outer frame.
   *
   * The gap is written 'o' rather than left blank, so no line of a picture
   * starts or ends with a space and no formatter can quietly eat a door.
   */
  picture: string[]
}

export interface MazeState {
  /** Squares to a side. 6, 7 or 8. */
  n: number
  /**
   * Row-major, one number a square: bit 0 a hedge above it, bit 1 to its
   * right, bit 2 below it, bit 3 to its left. Two squares always agree about
   * the hedge between them, and the outer frame is not in here — that is the
   * edge of the grid. It never changes, so every state of one level shares
   * this one array.
   */
  hedges: number[]
  /** The square beside the gap in the frame. */
  door: number
  /** The way out of that square. */
  doorDir: Dir
  /** Where the rabbit stands, or -1 once it is out through the gap. */
  hero: number
  /** Where the dog stands. */
  dog: number
}

/** One turn: the rabbit steps into the next square, or stands still. */
export type MazeAction = { type: 'step'; dir: Dir } | { type: 'hold' }

/**
 * Every action worth trying. The test's search walks all five and lets
 * `reduce` filter, so a bug shared between a move list and the rule cannot
 * make the search agree with itself.
 */
export const ACTIONS: MazeAction[] = [
  { type: 'step', dir: 0 },
  { type: 'step', dir: 1 },
  { type: 'step', dir: 2 },
  { type: 'step', dir: 3 },
  { type: 'hold' },
]

const DR: readonly number[] = [-1, 0, 1, 0]
const DC: readonly number[] = [0, 1, 0, -1]

export const rowOf = (n: number, cell: number): number => Math.floor(cell / n)
export const colOf = (n: number, cell: number): number => cell % n

/** The square one step that way. Only ever asked for a step that stays on the board. */
export const stepCell = (n: number, cell: number, dir: Dir): number =>
  cell + DR[dir] * n + DC[dir]

/** True when the square one step that way is still on the board. */
export function onBoard(n: number, cell: number, dir: Dir): boolean {
  const r = rowOf(n, cell) + DR[dir]
  const c = colOf(n, cell) + DC[dir]
  return r >= 0 && r < n && c >= 0 && c < n
}

/** True when a square opens onto the next one that way: on the board, and no hedge. */
export function canStep(state: MazeState, cell: number, dir: Dir): boolean {
  if ((state.hedges[cell] & (1 << dir)) !== 0) return false
  return onBoard(state.n, cell, dir)
}

/** True when a hedge — rather than the frame — is what stops that step. */
export function hedged(state: MazeState, cell: number, dir: Dir): boolean {
  return (state.hedges[cell] & (1 << dir)) !== 0
}

/**
 * One name for the hedge between two squares, whichever side you meet it from.
 * The board draws its bars under these names and `Board.tsx` points a refusal
 * at one of them, so the drawing and the rule cannot drift apart.
 */
export function seamId(n: number, cell: number, dir: Dir): string {
  const lo = Math.min(cell, stepCell(n, cell, dir))
  return `${lo}${dir === 0 || dir === 2 ? 'h' : 'v'}`
}

/* ------------------------------------------------------------------
   Reading a maze off its picture
   ------------------------------------------------------------------ */

/**
 * Turn a drawn maze into a state. Pure, and it throws on anything it cannot
 * read rather than quietly building half a board: a frame with no gap in it,
 * two gaps, a square with no rabbit, a line of the wrong length. `init` calls
 * it on every level, and `logic.test.ts` parses all three shipped pictures, so
 * the only mazes that reach a player are ones that have already been read.
 */
export function parseMaze(picture: string[]): MazeState {
  const height = picture.length
  if (height < 5 || height % 2 === 0) throw new Error('a maze is 2n+1 lines tall')
  const n = (height - 1) / 2
  const width = 2 * n + 1
  for (const line of picture) {
    if (line.length !== width) throw new Error('every line of a maze is 2n+1 characters')
    if (line !== line.trim()) throw new Error('no line of a maze starts or ends with a space')
  }

  const hedges = new Array<number>(n * n).fill(0)
  let hero = -1
  let dog = -1
  let door = -1
  let doorDir: Dir = 0
  let doors = 0
  let rabbits = 0
  let dogs = 0

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ch = picture[r].charAt(c)
      const evenRow = r % 2 === 0
      const evenCol = c % 2 === 0

      if (evenRow && evenCol) {
        if (ch !== '+') throw new Error('every corner of a maze is a plus sign')
        continue
      }

      if (!evenRow && !evenCol) {
        const cell = ((r - 1) / 2) * n + (c - 1) / 2
        if (ch === 'R') {
          hero = cell
          rabbits++
        } else if (ch === 'D') {
          dog = cell
          dogs++
        } else if (ch !== '.') {
          throw new Error('every square of a maze is a dot, an R or a D')
        }
        continue
      }

      const bar = evenRow ? '-' : '|'
      const onFrame = evenRow ? r === 0 || r === height - 1 : c === 0 || c === width - 1
      if (onFrame) {
        if (ch === 'o') {
          doors++
          if (evenRow) {
            doorDir = r === 0 ? 0 : 2
            door = (r === 0 ? 0 : n - 1) * n + (c - 1) / 2
          } else {
            doorDir = c === 0 ? 3 : 1
            door = ((r - 1) / 2) * n + (c === 0 ? 0 : n - 1)
          }
        } else if (ch !== bar) {
          throw new Error('the frame of a maze is solid hedge, apart from one gap')
        }
        continue
      }

      if (ch === bar) {
        // Both squares are told about the hedge at once, so the mask is
        // symmetric by construction and no later check can find it otherwise.
        if (evenRow) {
          const above = (r / 2 - 1) * n + (c - 1) / 2
          hedges[above] |= 1 << 2
          hedges[above + n] |= 1 << 0
        } else {
          const left = ((r - 1) / 2) * n + (c / 2 - 1)
          hedges[left] |= 1 << 1
          hedges[left + 1] |= 1 << 3
        }
      } else if (ch !== ' ') {
        throw new Error('a seam of a maze is a hedge or a space')
      }
    }
  }

  if (doors !== 1) throw new Error('a maze has exactly one gap in its frame')
  if (rabbits !== 1) throw new Error('a maze has exactly one rabbit')
  if (dogs !== 1) throw new Error('a maze has exactly one dog')
  if (hero === dog) throw new Error('the rabbit and the dog start on different squares')

  return { n, hedges, door, doorDir, hero, dog }
}

export function init(level: PuzzleLevel<MazeConfig>): MazeState {
  return parseMaze(level.config.picture)
}

/* ------------------------------------------------------------------
   The dog
   ------------------------------------------------------------------ */

/**
 * One step of the dog's rule: sideways towards the rabbit first, then up or
 * down, and it stands where a hedge leaves it nothing. Two of these make the
 * dog's turn.
 */
export function dogStep(state: MazeState, dog: number, hero: number): number {
  const { n } = state
  if (colOf(n, hero) !== colOf(n, dog)) {
    const dir: Dir = colOf(n, hero) > colOf(n, dog) ? 1 : 3
    if (canStep(state, dog, dir)) return stepCell(n, dog, dir)
  }
  if (rowOf(n, hero) !== rowOf(n, dog)) {
    const dir: Dir = rowOf(n, hero) > rowOf(n, dog) ? 2 : 0
    if (canStep(state, dog, dir)) return stepCell(n, dog, dir)
  }
  return dog
}

/**
 * The dog's whole turn, and the square it passes through on the way. The board
 * asks for this rather than working the rule out a second time, so the two
 * travels it draws are the two steps the puzzle really took.
 */
export function dogPath(state: MazeState, hero: number): { via: number; to: number } {
  const via = dogStep(state, state.dog, hero)
  return { via, to: dogStep(state, via, hero) }
}

/* ------------------------------------------------------------------
   The turn
   ------------------------------------------------------------------ */

/**
 * One turn. Five branches hand back the state that came in, and there are no
 * others: the rabbit is already out; a hold on a turn the dog cannot answer;
 * an action this puzzle does not have; a direction that is not one of the
 * four; and a step into a hedge or off the frame where there is no gap.
 *
 * The second of those is the contract's "changes nothing" rather than a rule
 * broken — which is why the Stand still control is dead on those turns instead
 * of refusing. It can never go dead on a turn where standing still would have
 * helped, because a hold that helps is a hold that moves the dog.
 */
export function reduce(state: MazeState, action: MazeAction): MazeState {
  if (state.hero === -1) return state

  if (action?.type === 'hold') {
    const dog = dogPath(state, state.hero).to
    if (dog === state.dog) return state
    return { ...state, dog }
  }

  if (action?.type !== 'step') return state
  const { dir } = action
  if (dir !== 0 && dir !== 1 && dir !== 2 && dir !== 3) return state

  if (state.hero === state.door && dir === state.doorDir) {
    // Out through the gap. The rabbit is gone, so the dog gets no turn.
    return { ...state, hero: -1 }
  }
  if (!canStep(state, state.hero, dir)) return state

  const hero = stepCell(state.n, state.hero, dir)
  return { ...state, hero, dog: dogPath(state, hero).to }
}

/** Out through the gap, and nothing else. */
export function isSolved(state: MazeState): boolean {
  return state.hero === -1
}

/** The square both animals are standing on, or null. The board shakes it. */
export function caughtAt(state: MazeState): number | null {
  return state.hero !== -1 && state.hero === state.dog ? state.hero : null
}

/** What the shell is handed: the sentence on its own. */
export function failure(state: MazeState): string | null {
  return caughtAt(state) === null ? null : 'The dog caught you.'
}

/** Two states with the same key are the same position. The maze never changes. */
export const stateKey = (state: MazeState): string => `${state.hero},${state.dog}`

/**
 * A step a hedge will not take, drawn anyway. The frame is not a refusal —
 * there is no button pointing off the board — and stepping onto the dog breaks
 * no rule, so neither of those is refused here.
 *
 * A rabbit cannot honestly pretend to move: it would be drawn standing inside
 * a hedge. So this takes leapfrog's shape rather than the tower's — nothing
 * moves, the rabbit shakes where it stands, and the hedge flashes.
 */
export function refusalOf(
  state: MazeState,
  dir: Dir,
): { pretend: MazeState; message: string } | null {
  if (state.hero === -1) return null
  if (state.hero === state.door && dir === state.doorDir) return null
  if (canStep(state, state.hero, dir)) return null
  if (!hedged(state, state.hero, dir)) return null
  return { pretend: state, message: 'A hedge is in the way.' }
}

/** What the move tape and a screen reader hear about the turn just taken. */
export function describeMove(prev: MazeState, next: MazeState, action: MazeAction): string {
  if (action?.type === 'hold') return 'Stood still'
  if (action?.type !== 'step') return 'Nothing moved'
  if (next.hero === -1) return 'Went out through the gap'
  if (next.hero === prev.hero) return 'Nothing moved'
  return `Stepped ${DIR_WORDS[action.dir]}`
}
