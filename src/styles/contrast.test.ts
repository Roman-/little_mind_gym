import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'

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

function contrast(palette: Record<string, string>, fg: string, bg: string): number {
  const a = luminance(resolve(palette, fg))
  const b = luminance(resolve(palette, bg))
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
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

  // The three signal colours are deliberately not compared to each other here.
  // Contrast ratio measures luminance, and amber and clay are told apart by hue,
  // not brightness — the number would say nothing useful. What actually protects
  // a colour-blind reader is that no state anywhere here is shown by colour
  // alone: every one carries a word, a stamp or a sentence as well, which
  // src/routes/shell.test.tsx checks on the real pages.

  it('never lets a signal colour disappear into the sheet it sits on', () => {
    for (const signal of ['--amber', '--moss', '--clay']) {
      expect(contrast(palette, signal, '--surface')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette, signal, '--surface-sunk')).toBeGreaterThanOrEqual(3)
    }
  })
})
