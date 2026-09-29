import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGION_COLOURS } from '../lib/regions'

/**
 * The palette is read straight out of tokens.css, so this fails the moment a
 * colour is retuned into something a child cannot read. WCAG 2.2: 4.5:1 for
 * text, 3:1 for a graphic that carries meaning. Disabled controls are exempt,
 * which is why --ink-faint is allowed to sit where it does.
 */
const css = readFileSync(resolvePath(process.cwd(), 'src/styles/tokens.css'), 'utf8')

function paletteFor(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`no ${selector} block in tokens.css`)
  const block = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[name] = value.trim()
  return out
}

const base = paletteFor(':root {')
const dark = { ...base, ...paletteFor(":root[data-theme='dark'] {") }

function resolve(palette: Record<string, string>, name: string, depth = 0): string {
  const raw = palette[name]
  if (raw === undefined) throw new Error(`unknown token ${name}`)
  const indirect = raw.match(/^var\((--[\w-]+)\)$/)
  if (indirect) {
    if (depth > 4) throw new Error(`token ${name} loops`)
    return resolve(palette, indirect[1], depth + 1)
  }
  if (!/^#[0-9a-f]{6}$/i.test(raw)) throw new Error(`token ${name} is not a plain hex: ${raw}`)
  return raw
}

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

function contrast(palette: Record<string, string>, fg: string, bg: string): number {
  return ratio(luminance(resolve(palette, fg)), luminance(resolve(palette, bg)))
}

/* --- color-mix(in oklab, …), worked out the way the browser does ---- */

type Triple = [number, number, number]

const linearOf = (hex: string): Triple =>
  [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255)) as Triple

function oklabOf([r, g, b]: Triple): Triple {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function linearFromOklab([L, a, b]: Triple): Triple {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clip = (v: number) => Math.min(1, Math.max(0, v))
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** The luminance of `color-mix(in oklab, <colour> <amount>, <base>)`. */
function mixedLuminance(colour: string, amount: number, base: string): number {
  const a = oklabOf(linearOf(colour))
  const b = oklabOf(linearOf(base))
  const [r, g, bl] = linearFromOklab(a.map((v, i) => v * amount + b[i] * (1 - amount)) as Triple)
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

/** A percentage token, as a fraction. */
function amountOf(palette: Record<string, string>, name: string): number {
  const raw = palette[name]
  if (!/^\d+(\.\d+)?%$/.test(raw ?? '')) throw new Error(`token ${name} is not a percentage: ${raw}`)
  return parseFloat(raw) / 100
}

/** [what it is, foreground token, background token] */
const TEXT: [string, string, string][] = [
  ['a mono label on a sheet', '--ink-muted', '--surface'],
  ['a mono label on a stage', '--ink-muted', '--surface-sunk'],
  ['a mono label on the desk', '--ink-on-desk', '--desk'],
  ['body text on a sheet', '--ink', '--surface'],
  ['body text on the desk', '--ink', '--desk'],
  ['body text on a stage', '--ink', '--surface-sunk'],
  ['the label on a primary button', '--p-on-dark', '--amber'],
  ['an in-progress status', '--amber', '--surface'],
  ['a solved status', '--moss', '--surface'],
  ['the solved notice', '--moss', '--moss-soft'],
  ['the dead-end notice', '--clay', '--clay-soft'],
  ['a dead-end status', '--clay', '--surface'],
  ['the armed clear button', '--clay-on-desk', '--desk'],
]

/** Glyphs on enamel pieces: meaningful graphics, so 3:1. */
const GLYPHS = ['--p-indigo', '--p-moss', '--p-clay', '--p-plum', '--p-teal', '--p-slate']

/**
 * A line that is the answer itself, on every ground it crosses: 3:1, as for a
 * glyph. [what it is, the line's colour, the grounds under it]
 */
const LINES: [string, string, string[]][] = [
  ['a fence on the fence posts', '--p-teal', ['--surface', '--surface-sunk', '--amber-soft', '--clay-soft']],
]

describe.each([
  ['light', base],
  ['dark', dark],
])('%s palette', (_name, palette) => {
  it.each(TEXT)('%s is readable', (_what, fg, bg) => {
    expect(contrast(palette, fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GLYPHS)('a glyph on %s is legible', (piece) => {
    expect(contrast(palette, '--p-on-dark', piece)).toBeGreaterThanOrEqual(3)
  })

  // A fence rail crosses a bone tile, a printed square, a chosen square and a
  // red one, and it is one colour on all four. Measured: 5.80 / 5.16 / 4.83 /
  // 4.69 in light and 4.15 / 4.70 / 3.69 / 4.20 in dark.
  it.each(LINES)('%s stands out on every square it crosses', (_what, line, grounds) => {
    for (const ground of grounds) expect(contrast(palette, line, ground)).toBeGreaterThanOrEqual(3)
  })

  // The three signal colours are deliberately not compared to each other here.
  // Contrast ratio measures luminance, and amber and clay are told apart by hue,
  // not brightness — the number would say nothing useful. What actually protects
  // a colour-blind reader is that no state anywhere here is shown by colour
  // alone: every one carries a word, a stamp or a sentence as well, which
  // src/routes/shell.test.tsx checks on the real pages.

  // A region of a board is washed in its colour, and a number is written on
  // the wash: on the ground where it was printed, and on the raised tile where
  // a child wrote it. Both have to read, in every colour a region can take.
  it.each(REGION_COLOURS.map((c) => c.token))('a number on a %s region is readable', (token) => {
    const ink = luminance(resolve(palette, '--ink'))
    const colour = resolve(palette, token)
    const ground = mixedLuminance(
      colour,
      amountOf(palette, '--wash-ground'),
      resolve(palette, '--surface-sunk'),
    )
    const raised = mixedLuminance(
      colour,
      amountOf(palette, '--wash-raised'),
      resolve(palette, '--surface'),
    )
    expect(ratio(ink, ground)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(ink, raised)).toBeGreaterThanOrEqual(4.5)
  })

  // The two washes are told apart by lightness — the raised tile is the lighter
  // one in both themes, which is what makes it read as standing up — so this
  // one is a luminance question, unlike the signals below.
  it.each(REGION_COLOURS.map((c) => c.token))('a raised tile on a %s region is the lighter', (token) => {
    const colour = resolve(palette, token)
    const ground = mixedLuminance(
      colour,
      amountOf(palette, '--wash-ground'),
      resolve(palette, '--surface-sunk'),
    )
    const raised = mixedLuminance(
      colour,
      amountOf(palette, '--wash-raised'),
      resolve(palette, '--surface'),
    )
    expect(raised).toBeGreaterThan(ground)
  })

  // The painted tiles lay paint on a tile: the tile's colour mixed 40% into
  // --ink, where a plain tile is the raised wash. Painted against plain is the
  // one difference a child counts on that board, and a line can hold any two
  // colours side by side, so every pairing has to stand 3:1 apart. The worst of
  // them comes out at 4.82 in the light theme and 3.20 in the dark. The tile's
  // own enamel, which the paint could have been instead, gives 1.65 and 1.44.
  // The board's stylesheet test holds its CSS to the same 40%.
  //
  // A traced painted tile is ringed in amber behind a gap of --surface, because
  // amber on paint is 1.50 and 1.15. That gap has to stand clear of every paint
  // too, and does at 7.30 and 7.33.
  it('keeps a painted tile 3:1 from every raised tile, whatever their colours', () => {
    const ink = resolve(palette, '--ink')
    const surface = resolve(palette, '--surface')
    const raise = amountOf(palette, '--wash-raised')
    for (const a of REGION_COLOURS) {
      const paint = mixedLuminance(resolve(palette, a.token), 0.4, ink)
      for (const b of REGION_COLOURS) {
        const plain = mixedLuminance(resolve(palette, b.token), raise, surface)
        expect(ratio(paint, plain)).toBeGreaterThanOrEqual(3)
      }
      expect(ratio(paint, luminance(surface))).toBeGreaterThanOrEqual(3)
    }
  })

  it('never lets a signal colour disappear into the sheet it sits on', () => {
    for (const signal of ['--amber', '--moss', '--clay']) {
      expect(contrast(palette, signal, '--surface')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette, signal, '--surface-sunk')).toBeGreaterThanOrEqual(3)
    }
  })
})
