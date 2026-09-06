#!/usr/bin/env node
/**
 * Vendors the OpenMoji artwork the puzzles draw with into src/assets/openmoji/.
 *
 * The pictures a child has to recognise — a goat, a cabbage, a frog — are not
 * ours to draw. OpenMoji already draws them, a whole set at a time, so a goat
 * and a wolf on the same bank look like they came from the same hand.
 *
 * Run it when MANIFEST changes:  node scripts/fetch-openmoji.mjs
 * Nothing at run time fetches anything: the SVGs are committed.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../src/assets/openmoji')
const BASE = 'https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/color/svg'

/** file name in src/assets/openmoji  →  OpenMoji code point. */
const MANIFEST = {
  // the river crossing
  wolf: '1F43A',
  goat: '1F410',
  cabbage: '1F96C',
  farmer: '1F9D1-200D-1F33E',
  cat: '1F431',
  mouse: '1F42D',
  boat: '1F6F6',
  // leapfrog
  frog: '1F438',
  // lights out
  bulb: '1F4A1',
  // the candles
  candle: '1F56F',
  // the small square
  apple: '1F34E',
  banana: '1F34C',
  grapes: '1F347',
  pear: '1F350',
  // who has what
  rabbit: '1F430',
  dog: '1F436',
  fish: '1F420',
  cookie: '1F36A',
  'sun-hat': '1F452',
  cap: '1F9E2',
  'top-hat': '1F3A9',
  crown: '1F451',
  'child-girl': '1F467',
  'child-boy': '1F466',
  'child-red': '1F9D1-200D-1F9B0',
  'child-curly': '1F9D1-200D-1F9B1',
  // the four horses
  horse: '1F40E',
}

mkdirSync(OUT, { recursive: true })
let failed = 0
for (const [name, code] of Object.entries(MANIFEST)) {
  const url = `${BASE}/${code}.svg`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`MISSING ${name} (${code}): ${res.status}`)
    failed++
    continue
  }
  const svg = await res.text()
  writeFileSync(resolve(OUT, `${name}.svg`), svg)
  console.log(`${name.padEnd(14)} ${code.padEnd(18)} ${svg.length} bytes`)
}
process.exit(failed ? 1 : 0)
