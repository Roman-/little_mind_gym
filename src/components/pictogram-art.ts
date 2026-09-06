/**
 * The pictures the boards are drawn with, loaded and cleaned.
 *
 * A goat has to look like a goat. Drawing one ourselves gave us a shape a
 * child had to be told the name of, so the animals, the food and the hats are
 * OpenMoji artwork instead — one open set, drawn by one hand, so a wolf and a
 * goat standing on the same bank belong to the same world.
 *
 * The files are committed under src/assets/openmoji and nothing is fetched at
 * run time. `scripts/fetch-openmoji.mjs` puts them there and holds the code
 * point for each name; `pictogram.test.ts` fails if a name here has no file.
 *
 * Pictograms name a *thing*. They never carry state: amber, moss and clay stay
 * on the plate under the picture, exactly as docs/DESIGN.md says.
 */

/**
 * Every picture the app can draw. Add one to `scripts/fetch-openmoji.mjs` first.
 *
 * A list rather than a bare union, so `pictogram.test.ts` can hold it against
 * the files on disk: a name with no file draws nothing, and a file with no name
 * is dead weight in the bundle.
 */
export const PICTO_NAMES = [
  'wolf',
  'goat',
  'cabbage',
  'farmer',
  'cat',
  'mouse',
  'boat',
  'frog',
  'bulb',
  'candle',
  'apple',
  'banana',
  'grapes',
  'pear',
  'rabbit',
  'dog',
  'fish',
  'cookie',
  'sun-hat',
  'cap',
  'top-hat',
  'crown',
  'child-girl',
  'child-boy',
  'child-red',
  'child-curly',
] as const

export type PictoName = (typeof PICTO_NAMES)[number]

export interface Art {
  viewBox: string
  body: string
}

const raw = import.meta.glob('../assets/openmoji/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * OpenMoji ships every file with the same handful of element ids (`emoji`,
 * `color`, `line`), so thirty of them inlined on one page would put thirty
 * duplicate ids in the document. Nothing references them, so they are cut
 * rather than renamed.
 */
function clean(svg: string): Art {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 72 72'
  const open = svg.indexOf('>', svg.indexOf('<svg'))
  const close = svg.lastIndexOf('</svg>')
  const body = svg
    .slice(open + 1, close === -1 ? undefined : close)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/\s(id|stroke-miterlimit)="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .trim()
  return { viewBox, body }
}

export const ART: Record<string, Art> = {}
for (const [path, svg] of Object.entries(raw)) {
  const name = path.slice(path.lastIndexOf('/') + 1, -4)
  ART[name] = clean(svg)
}

/** The names this build actually has artwork for. Read by the test. */
export const AVAILABLE = Object.keys(ART).sort()
