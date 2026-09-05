import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The cue sheet is the one stylesheet no component owns, so nothing else would
 * notice if a cue lost its keyframes or picked up a hard-coded duration. Both
 * fail the same silent way: the class goes on and nothing moves.
 */
const css = readFileSync(resolvePath(process.cwd(), 'src/styles/motion.module.css'), 'utf8')

/** [the cue, the keyframes it runs, the rest of its animation shorthand] */
const cues = [...css.matchAll(/\.([\w-]+)\s*\{[^}]*?animation:\s*([\w-]+)\s+([^;]+);/g)].map(
  ([, cue, frames, rest]) => ({ cue, frames, rest }),
)

describe('the shared cues', () => {
  it('are the four a board can reach for', () => {
    expect(cues.map((c) => c.cue)).toEqual(['shake', 'flash', 'no', 'highlight'])
  })

  it.each(cues)('$cue runs keyframes that exist', ({ frames }) => {
    expect(css).toContain(`@keyframes ${frames} {`)
  })

  it.each(cues)('$cue takes its length from a token, not a number', ({ rest }) => {
    expect(rest).toMatch(/var\(--dur-\d\)/)
  })
})
