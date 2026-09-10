import type { PuzzleLevel } from '../../lib/types'
import type { PictoName } from '../../components/pictogram-art'

/**
 * A frozen pond with two or three animals standing on it.
 *
 * Send one of them and it goes until something stops it: a wall, the edge of
 * the ice, or another animal. It cannot stop halfway. The mouse has to come to
 * rest on the ring, and the only way to stop it on a square where nothing
 * stands is to send something else there first — which is the one idea this
 * puzzle brings that no other board here has. A piece is a tool for another
 * piece.
 *
 * Three things are worth reading twice.
 *
 * `slideOf` is the whole rule book. It hands back both the square an animal
 * comes to rest on and what stopped it there, so `reduce`, the move tape and
 * the test all read one walk rather than three that could drift apart.
 *
 * There is no forbidden move here, and so no `refusalOf` beside `slideOf`.
 * Nothing a child can tap breaks a rule: a send either moves an animal or it
 * does not, and a send that moves nobody — an animal already flush against a
 * wall — is the contract's "changes nothing" rather than a rule broken. So
 * `reduce` hands back the same reference and the arrow goes dead, exactly as
 * the Fill button does over a full jug.
 *
 * And there is no dead end, so no `failure`. Every position can be played on
 * from: an animal that has slid into a corner can be sent out of it again, and
 * nothing on the ice is ever used up. `logic.test.ts` proves the stronger
 * thing about the three shipped ponds — from every position a child can reach,
 * the ring is still reachable — so nobody is ever stranded, and Step back is
 * for a wrong idea rather than for a wrecked board.
 */

/** Up, right, down, left — clockwise from the top, and the bit each one owns. */
export type Dir = 0 | 1 | 2 | 3

/** In the order the bits are numbered, so `DIRS[d]` is always direction `d`. */
export const DIRS: Dir[] = [0, 1, 2, 3]

/** One word a direction, for the labels and the move tape. */
export const DIR_WORDS = ['up', 'right', 'down', 'left'] as const

const DR: readonly number[] = [-1, 0, 1, 0]
const DC: readonly number[] = [0, 1, 0, -1]

/** One animal that stands on the ice, and the letter a picture draws it with. */
export interface Animal {
  id: string
  /** The letter this animal takes in a level's picture. */
  mark: string
  /** Sentence case, for a label: "Mouse". */
  label: string
  /** The picture on the piece. One of the names in components/Pictogram. */
  art: PictoName
}

/**
 * Everybody who can be on the ice, in the order a board draws them.
 *
 * The mouse is first because the mouse is always the one that has to reach the
 * ring: the other two are there to be sent, and a puzzle that swapped which
 * animal mattered from level to level would spend a child's attention on
 * bookkeeping rather than on the ice. The three of them are told apart at
 * forty pixels on a phone without being read: a grey mouse, a black and white
 * rabbit, and a green frog.
 */
export const ANIMALS: Animal[] = [
  { id: 'mouse', mark: 'M', label: 'Mouse', art: 'mouse' },
  { id: 'rabbit', mark: 'R', label: 'Rabbit', art: 'rabbit' },
  { id: 'frog', mark: 'F', label: 'Frog', art: 'frog' },
]

/** How an animal is referred to in a sentence: "the mouse". */
export function nameFor(animal: Animal): string {
  return `the ${animal.label.toLowerCase()}`
}

export interface IceConfig {
  /**
   * The pond, drawn the way a maze is drawn on paper: 2n+1 lines of 2n+1
   * characters. '+' at every corner, '-' and '|' where a wall stands, ' '
   * where the ice runs straight on. A square is '.' for open ice, 'o' for the
   * ring, or one of the letters in `ANIMALS` for the animal standing on it.
   */
  picture: string[]
}

export interface IceState {
  /** Squares to a side. 5 or 6. */
  n: number
  /**
   * Row-major, one number a square: bit 0 a wall above it, bit 1 to its right,
   * bit 2 below it, bit 3 to its left. Two squares always agree about the wall
   * between them, and the rim of the pond is not in here — that is the edge of
   * the grid. It never changes, so every state of one level shares this one
   * array.
   */
  walls: number[]
  /** The square the ring is painted on. */
  home: number
  /** The animals on this pond, in the order `ANIMALS` lists them. */
  cast: Animal[]
  /** Which of them has to stop on the ring. Always the mouse. */
  hero: number
  /** Where each animal stands, indexed like `cast`. */
  at: number[]
}

/** One send, and one move a player would count. Which animal is chosen lives in the board. */
export type IceAction = { type: 'send'; animal: number; dir: Dir }

export const rowOf = (n: number, cell: number): number => Math.floor(cell / n)
export const colOf = (n: number, cell: number): number => cell % n

/** The square one step that way. Only ever asked for a step that stays on the ice. */
export const stepCell = (n: number, cell: number, dir: Dir): number =>
  cell + DR[dir] * n + DC[dir]

/** True when the square one step that way is still on the ice. */
export function onBoard(n: number, cell: number, dir: Dir): boolean {
  const r = rowOf(n, cell) + DR[dir]
  const c = colOf(n, cell) + DC[dir]
  return r >= 0 && r < n && c >= 0 && c < n
}

/** True when a wall — rather than the rim — stands on that side of a square. */
export function walled(state: IceState, cell: number, dir: Dir): boolean {
  return (state.walls[cell] & (1 << dir)) !== 0
}

/** Who is standing on a square, or -1. */
export function whoIsOn(state: IceState, cell: number): number {
  return state.at.indexOf(cell)
}

/** Where a send ends, and what ended it. */
export interface Slide {
  /** The square the animal comes to rest on. The square it started on, where nothing moves. */
  to: number
  /** Why it stopped there. */
  stop: 'edge' | 'wall' | 'animal'
  /** Who was in the way, where `stop` is 'animal'. -1 otherwise. */
  blocker: number
}

/**
 * One send, walked square by square.
 *
 * The walk always ends for exactly one of three reasons, and it hands all
 * three back: the rim of the pond, a wall, or somebody standing in the next
 * square. That is what the move tape reads out, and it is why a child who
 * sends an animal into a wall and a child who sends one into the rabbit are
 * told two different things about the same landing square.
 */
export function slideOf(state: IceState, animal: number, dir: Dir): Slide {
  let cell = state.at[animal]
  for (;;) {
    if (!onBoard(state.n, cell, dir)) return { to: cell, stop: 'edge', blocker: -1 }
    if (walled(state, cell, dir)) return { to: cell, stop: 'wall', blocker: -1 }
    const next = stepCell(state.n, cell, dir)
    const who = whoIsOn(state, next)
    if (who >= 0) return { to: cell, stop: 'animal', blocker: who }
    cell = next
  }
}

/** True when the send moves the animal at all. A send that moves nobody is not a move. */
export function canSend(state: IceState, animal: number, dir: Dir): boolean {
  if (!Number.isInteger(animal) || animal < 0 || animal >= state.at.length) return false
  if (dir !== 0 && dir !== 1 && dir !== 2 && dir !== 3) return false
  return slideOf(state, animal, dir).to !== state.at[animal]
}

export function init(level: PuzzleLevel<IceConfig>): IceState {
  return parsePond(level.config.picture)
}

/**
 * Three branches hand back the state that came in, and there are no others: an
 * action this puzzle does not have, an animal or a direction that is not one
 * of the ones on the ice, and a send that leaves everybody exactly where they
 * were. The last of those is the contract's "changes nothing" — the arrow that
 * asks for it is dead rather than refused, because no rule has been broken.
 */
export function reduce(state: IceState, action: IceAction): IceState {
  if (action?.type !== 'send') return state
  const { animal, dir } = action
  if (!canSend(state, animal, dir)) return state
  const at = state.at.slice()
  at[animal] = slideOf(state, animal, dir).to
  return { ...state, at }
}

/** The mouse, stopped on the ring. Sliding over it on the way past is not stopping on it. */
export function isSolved(state: IceState): boolean {
  return state.at[state.hero] === state.home
}

/** What the move tape and a screen reader hear about the send just made. */
export function describeMove(prev: IceState, _next: IceState, action: IceAction): string {
  if (action?.type !== 'send') return 'Nothing moved'
  const { animal, dir } = action
  if (!canSend(prev, animal, dir)) return 'Nothing moved'
  const slide = slideOf(prev, animal, dir)
  const against =
    slide.stop === 'animal'
      ? `against ${nameFor(prev.cast[slide.blocker])}`
      : slide.stop === 'wall'
        ? 'to the wall'
        : 'to the edge'
  return `Sent ${nameFor(prev.cast[animal])} ${DIR_WORDS[dir]} ${against}`
}

/**
 * Every send worth trying, whether or not it moves anybody. The test's search
 * walks all of them and lets `reduce` filter, so a bug shared between a move
 * list and the rule cannot make the search agree with itself.
 */
export function sendsOf(state: IceState): IceAction[] {
  const out: IceAction[] = []
  for (let animal = 0; animal < state.at.length; animal++) {
    for (const dir of DIRS) out.push({ type: 'send', animal, dir })
  }
  return out
}

/** Two states with everybody standing in the same places are the same position. */
export const keyOf = (state: IceState): string => state.at.join(',')

/* ------------------------------------------------------------------
   Reading a pond off its picture

   Pure, and it throws on anything it cannot read rather than
   quietly building half a pond: a line of the wrong length, a gap
   in the rim, no ring, two rings, no mouse, or the same animal
   drawn twice. `init` calls it on every level, and
   `logic.test.ts` parses all three shipped pictures, so the only
   ponds that reach a player are ones that have already been read.
   ------------------------------------------------------------------ */

export function parsePond(picture: string[]): IceState {
  const height = picture.length
  if (height < 7 || height % 2 === 0) {
    throw new Error('a pond is 2n+1 lines tall, and at least three squares to a side')
  }
  const n = (height - 1) / 2
  const width = 2 * n + 1
  for (const line of picture) {
    if (line.length !== width) throw new Error('every line of a pond is 2n+1 characters')
    if (line !== line.trim()) throw new Error('no line of a pond starts or ends with a space')
  }

  const walls = new Array<number>(n * n).fill(0)
  const at = new Map<string, number>()
  let home = -1
  let rings = 0

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ch = picture[r].charAt(c)
      const evenRow = r % 2 === 0
      const evenCol = c % 2 === 0

      if (evenRow && evenCol) {
        if (ch !== '+') throw new Error('every corner of a pond is a plus sign')
        continue
      }

      if (!evenRow && !evenCol) {
        const cell = ((r - 1) / 2) * n + (c - 1) / 2
        if (ch === 'o') {
          home = cell
          rings++
          continue
        }
        if (ch === '.') continue
        const animal = ANIMALS.find((one) => one.mark === ch)
        if (animal === undefined) throw new Error(`${ch} is not an animal, a ring or open ice`)
        if (at.has(animal.id)) throw new Error(`there are two of ${nameFor(animal)}`)
        at.set(animal.id, cell)
        continue
      }

      const bar = evenRow ? '-' : '|'
      const onRim = evenRow ? r === 0 || r === height - 1 : c === 0 || c === width - 1
      if (onRim) {
        if (ch !== bar) throw new Error('the rim of a pond is solid all the way round')
        continue
      }

      if (ch === bar) {
        // Both squares are told about the wall at once, so the mask is
        // symmetric by construction and no later check can find it otherwise.
        if (evenRow) {
          const above = (r / 2 - 1) * n + (c - 1) / 2
          walls[above] |= 1 << 2
          walls[above + n] |= 1 << 0
        } else {
          const left = ((r - 1) / 2) * n + (c / 2 - 1)
          walls[left] |= 1 << 1
          walls[left + 1] |= 1 << 3
        }
      } else if (ch !== ' ') {
        throw new Error('a seam of a pond is a wall or a space')
      }
    }
  }

  if (rings !== 1) throw new Error('a pond has exactly one ring')
  const cast = ANIMALS.filter((animal) => at.has(animal.id))
  if (cast.length < 2) throw new Error('a pond holds at least two animals')
  const hero = cast.findIndex((animal) => animal.id === ANIMALS[0].id)
  if (hero < 0) throw new Error('the mouse is on every pond: it is the one that has to get home')
  // Nobody can start on the ring: a square holds one character, and the ring's
  // own is one of them.
  return { n, walls, home, cast, hero, at: cast.map((animal) => at.get(animal.id) as number) }
}
