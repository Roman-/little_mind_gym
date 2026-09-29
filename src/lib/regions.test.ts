import { describe, expect, it } from 'vitest'
import { cutQuilt } from '../puzzles/suguru/logic'
import { makeRng } from './rng'
import { REGION_COLOURS, colourRegions, regionNeighbours, regionPaint } from './regions'

/** No two regions that touch, corner to corner included, share a colour. */
function clashes(n: number, regions: number[], colours: number[]): [number, number][] {
  const out: [number, number][] = []
  regionNeighbours(n, regions, true).forEach((near, a) => {
    for (const b of near) if (a < b && colours[a] === colours[b]) out.push([a, b])
  })
  return out
}

describe('colouring the regions of a grid', () => {
  it('counts two regions that meet only at a corner as touching', () => {
    // A B
    // B A — region 0 is two squares that only meet at a corner, and so is 1.
    // Nothing else here touches corner to corner, so the corner is the test.
    const regions = [0, 1, 2, 0]
    expect([...regionNeighbours(2, regions, false)[2]].sort()).toEqual([0])
    expect([...regionNeighbours(2, regions, true)[2]].sort()).toEqual([0, 1])
    expect([...regionNeighbours(2, regions, true)[1]].sort()).toEqual([0, 2])
  })

  it('gives every region its own colour while there are colours enough', () => {
    // Seven stripes down a seven-wide board: seven regions, seven colours.
    const n = 7
    const stripes = Array.from({ length: n * n }, (_, i) => i % n)
    const colours = colourRegions(n, stripes)
    expect(new Set(colours).size).toBe(REGION_COLOURS.length)
  })

  it('starts in the top left corner, with the first colour', () => {
    // The regions are numbered back to front, so the first region in reading
    // order is the last one by number, and it is the one that takes yellow.
    const regions = [3, 3, 2, 1, 1, 2, 0, 0, 0]
    const colours = colourRegions(3, regions)
    expect(colours[3]).toBe(0)
    expect(REGION_COLOURS[colours[3]].word).toBe('yellow')
    expect(regionPaint(colours[3])).toBe('var(--p-ochre)')
  })

  it('comes out the same for the same map, and is worked out once', () => {
    const regions = [0, 0, 1, 2, 3, 1, 2, 3, 3]
    const first = colourRegions(3, regions)
    expect(colourRegions(3, regions)).toBe(first)
    expect(colourRegions(3, regions.slice())).toEqual(first)
  })

  it('colours a crowded map with no two touching regions alike', () => {
    // Every square its own region: each square touches up to eight others, and
    // a two by two block holds four regions that all touch each other.
    const n = 6
    const singles = Array.from({ length: n * n }, (_, i) => i)
    const colours = colourRegions(n, singles)
    expect(clashes(n, singles, colours)).toEqual([])
  })

  it('colours every quilt the patchwork puzzle cuts, corners included', () => {
    // The fallback that lets two corner-touching patches match is there for a
    // map nobody could colour, and it is never reached by a quilt this app
    // cuts. Two hundred quilts a size is ten times what the tests deal, and
    // cutting them is most of the 2.5s this takes on a quiet machine — so it
    // says how long it needs, the way the other slow tests do.
    for (const n of [5, 6, 7]) {
      const rng = makeRng(4100 + n)
      for (let k = 0; k < 200; k++) {
        const { patches } = cutQuilt(rng, n)
        const colours = colourRegions(n, patches)
        expect(clashes(n, patches, colours)).toEqual([])
        expect(colours.every((c) => c >= 0 && c < REGION_COLOURS.length)).toBe(true)
      }
    }
  }, 20_000)

  it('spends the palette evenly, so a big quilt is not mostly one colour', () => {
    const n = 7
    const rng = makeRng(77)
    for (let k = 0; k < 50; k++) {
      const { patches } = cutQuilt(rng, n)
      const colours = colourRegions(n, patches)
      const counts = REGION_COLOURS.map((_, c) => colours.filter((x) => x === c).length)
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
    }
  })
})
