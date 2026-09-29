/* ============================================================
   A colour for every region of a grid.

   Some boards here are cut into regions, and the region is the
   whole rule: a garden holds one cat, a patch holds 1 up to its
   size, a box holds every fruit once. A region is a thing a child
   can see on the board, so it takes a piece colour, the way a disc
   or a jug of water does — see rule 1 of docs/DESIGN.md.

   The seven enamel colours are the whole palette, and a board can
   have more regions than that: a seven-wide quilt is cut into as
   many as twenty-four patches. So the colours are handed out the
   way a map is coloured. Two regions that touch never share one,
   even corner to corner, because two patches of one colour that
   meet at a corner read as one patch with a waist. Where there are
   colours enough, no two regions share one at all.

   Everything here is pure, and a board is coloured once: the answer
   is kept against the array it was worked out from, which a board
   deals once and never changes. A patch keeps its colour for the
   whole of a game, so the quilt never re-tints under a child.
   ============================================================ */

/**
 * The colours a region can take, most distinct first: a board of five regions
 * takes yellow, blue, green, purple and red, and only a board of six or more
 * reaches for teal, which is the nearest thing here to a second green.
 *
 * The word beside each is what a screen reader reads out, where a board names
 * its regions by colour. The heavy line round a region is the handle for
 * anyone who cannot tell two of the colours apart.
 */
export const REGION_COLOURS = [
  { token: '--p-ochre', word: 'yellow' },
  { token: '--p-indigo', word: 'blue' },
  { token: '--p-moss', word: 'green' },
  { token: '--p-plum', word: 'purple' },
  { token: '--p-clay', word: 'red' },
  { token: '--p-teal', word: 'teal' },
  { token: '--p-slate', word: 'grey' },
] as const

/** The CSS value for one of those colours, ready to hand to a custom property. */
export const regionPaint = (colour: number): string =>
  `var(${REGION_COLOURS[colour % REGION_COLOURS.length].token})`

/**
 * Which regions touch which. `corners` counts two regions that meet only at a
 * corner as touching, which is what the eye does.
 */
export function regionNeighbours(n: number, regions: number[], corners: boolean): Set<number>[] {
  const count = regions.reduce((most, r) => Math.max(most, r), -1) + 1
  const near = Array.from({ length: count }, () => new Set<number>())
  const steps = corners
    ? [[0, 1], [1, -1], [1, 0], [1, 1]]
    : [[0, 1], [1, 0]]
  for (let i = 0; i < regions.length; i++) {
    const r = Math.floor(i / n)
    const c = i % n
    for (const [dr, dc] of steps) {
      const rr = r + dr
      const cc = c + dc
      if (rr >= n || cc < 0 || cc >= n) continue
      const a = regions[i]
      const b = regions[rr * n + cc]
      if (a === b) continue
      near[a].add(b)
      near[b].add(a)
    }
  }
  return near
}

/**
 * How many tries the colouring gets before it gives up on corners. A quilt this
 * app deals comes out on the first path it takes; the cap is only there so that
 * a map nobody could colour cannot hang the page while it proves it.
 */
const TRIES = 20_000

/**
 * One colour to each region, from `palette` colours, where no two regions that
 * touch share one. Null when that cannot be done inside `TRIES`.
 *
 * Regions are coloured in reading order — the one holding the top left square
 * first — so the same map always comes out in the same colours. Each region
 * takes the first colour its neighbours have not taken, in this order of
 * preference: one that no region in the ring beyond its neighbours has either,
 * so a colour does not turn up again two patches away; then the colour used
 * least so far, so the palette is spent evenly; then the palette's own order.
 * An unused colour always wins the first two, which is why a board with no more
 * regions than colours never repeats one.
 */
function colourWith(near: Set<number>[], order: number[], palette: number): number[] | null {
  const colour = new Array<number>(near.length).fill(-1)
  const used = new Array<number>(palette).fill(0)
  let tries = 0

  const place = (k: number): boolean => {
    if (k === order.length) return true
    if (++tries > TRIES) return false
    const region = order[k]
    const taken = new Set<number>()
    const beyond = new Set<number>()
    for (const m of near[region]) {
      if (colour[m] !== -1) taken.add(colour[m])
      for (const q of near[m]) if (q !== region && colour[q] !== -1) beyond.add(colour[q])
    }
    const choices = Array.from({ length: palette }, (_, c) => c)
      .filter((c) => !taken.has(c))
      .sort(
        (a, b) =>
          Number(beyond.has(a)) - Number(beyond.has(b)) || used[a] - used[b] || a - b,
      )
    for (const c of choices) {
      colour[region] = c
      used[c]++
      if (place(k + 1)) return true
      used[c]--
      colour[region] = -1
      if (tries > TRIES) return false
    }
    return false
  }

  return place(0) ? colour : null
}

const cache = new WeakMap<number[], number[]>()

/**
 * A colour for every region of an `n` by `n` grid, as an index into
 * `REGION_COLOURS`, indexed by region number. `regions` is row-major, one
 * region number a square, numbered from 0 with none skipped.
 *
 * No two regions that touch, even at a corner, share a colour. On a map too
 * crowded for that — not one the boards here deal — only regions that share an
 * edge are kept apart, which any flat map can manage in four colours.
 */
export function colourRegions(n: number, regions: number[]): number[] {
  const hit = cache.get(regions)
  if (hit) return hit
  const count = regions.reduce((most, r) => Math.max(most, r), -1) + 1
  const first = new Array<number>(count).fill(Infinity)
  regions.forEach((r, i) => {
    if (i < first[r]) first[r] = i
  })
  const order = Array.from({ length: count }, (_, r) => r).sort((a, b) => first[a] - first[b])
  const palette = REGION_COLOURS.length
  const colours =
    colourWith(regionNeighbours(n, regions, true), order, palette) ??
    colourWith(regionNeighbours(n, regions, false), order, palette) ??
    Array.from({ length: count }, (_, r) => r % palette)
  cache.set(regions, colours)
  return colours
}
