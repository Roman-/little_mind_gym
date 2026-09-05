import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVAILABLE, PICTO_NAMES } from './pictogram-art'

/**
 * The PictoName union is written by hand and the files are fetched by a
 * script, so this is the one thing that keeps the two honest: a name with no
 * file would draw nothing, and a file with no name is dead weight in the
 * bundle.
 */
describe('the pictogram set', () => {
  const onDisk = readdirSync(resolve(process.cwd(), 'src/assets/openmoji'))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4))
    .sort()

  it('has artwork loaded for every committed file', () => {
    expect(AVAILABLE).toEqual(onDisk)
  })

  it('names exactly the pictures it ships, and ships exactly the ones it names', () => {
    expect([...PICTO_NAMES].sort()).toEqual(onDisk)
  })

  it('strips the ids OpenMoji repeats in every file', async () => {
    const { Pictogram } = await import('./Pictogram')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(Pictogram({ name: 'goat' }) as never)
    expect(html).not.toMatch(/\sid="/)
    expect(html).toMatch(/<path/)
  })
})
