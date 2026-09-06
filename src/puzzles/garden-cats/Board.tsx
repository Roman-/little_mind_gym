import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Clash, GardenAction, GardenState } from './logic'
import { clashOf, colOf, conflicts, describeClash, emptyGardens, rowOf } from './logic'
import s from './board.module.css'

/**
 * One colour a garden, most distinct first: a five-garden board takes yellow,
 * blue, green, purple and red, and only a seven-garden board has to reach for
 * teal, which is the nearest thing here to a second green. Seven is as many
 * gardens as there are colours, and the levels are held to that.
 *
 * The word beside each is what a screen reader reads out — the only handle on
 * a garden for anyone who cannot see the colours. The thick lines round a
 * garden are the handle for anyone who cannot tell two of them apart.
 */
const PATCHES = [
  { token: '--p-ochre', word: 'yellow' },
  { token: '--p-indigo', word: 'blue' },
  { token: '--p-moss', word: 'green' },
  { token: '--p-plum', word: 'purple' },
  { token: '--p-clay', word: 'red' },
  { token: '--p-teal', word: 'teal' },
  { token: '--p-slate', word: 'grey' },
] as const

/** The one number a player reads off the board, and what to do about it. */
function statusLine(empty: number): string {
  if (empty === 0) return ''
  if (empty === 1) return '1 garden still needs a cat.'
  return `${empty} gardens still need a cat.`
}

export function Board({ state, dispatch, locked }: BoardProps<GardenState, GardenAction>) {
  const { n, gardens, cats } = state

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every cat. The gardens are the token rather than the
   * whole state for exactly that reason: they are a new array only when a new
   * board is dealt, which is the one moment the tab stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(gardens, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  const wrong = useMemo(() => conflicts(state), [state])
  const broken = wrong.some(Boolean)

  /**
   * The group a cat has just fallen foul of, lit for one run of the cue. A red
   * ring says which cat is wrong but never what it is wrong with, so the whole
   * row, column, garden or huddle of squares lights up and the two cats at
   * fault shake at each other. It is decoration over a move the puzzle has
   * already taken: nothing else reads it, and it takes itself off again.
   */
  const [lit, light] = useCue<Clash>('--dur-5')
  const litGroup = useMemo(() => new Set(lit?.cells), [lit])
  const litPair = useMemo(() => new Set(lit?.blamed), [lit])

  /**
   * The same mistake in words, and deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until no
   * cat on the board is breaking a rule, and it is dropped during render
   * rather than after paint, so a mistake made much later is never announced
   * with the sentence for an older one.
   */
  const [said, setSaid] = useState<string | null>(null)
  if (said !== null && !broken) setSaid(null)

  const tap = (index: number) => {
    if (locked) return
    // Worked out from the state the move is leaving, which is the only one the
    // board has: the shell hands the next one back on the render after this.
    const clash = cats[index] ? null : clashOf(state, index)
    dispatch({ type: 'toggle', index })
    if (clash === null) return
    light(clash)
    // The cat really does sit down, so the shell's knock underneath is true
    // and stays; this is the "no" over the top of it.
    playSound('wrong')
    setSaid(describeClash(clash))
  }

  const focusCell = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    const r = rowOf(n, cursor) + step[0]
    const c = colOf(n, cursor) + step[1]
    if (r < 0 || r >= n || c < 0 || c >= n) return
    focusCell(r * n + c)
  }

  const tiles = cats.map((cat, i) => {
    const g = gardens[i]
    const r = rowOf(n, i)
    const c = colOf(n, i)
    // A hairline inside a garden, a heavy rule where one garden meets the
    // next. The colour says which garden a square is in; the line says it
    // again for a child who cannot tell two of the colours apart.
    const top = r === 0 ? undefined : gardens[i - n] === g ? 'hair' : 'edge'
    const left = c === 0 ? undefined : gardens[i - 1] === g ? 'hair' : 'edge'
    const label = `Row ${r + 1}, column ${c + 1}, ${PATCHES[g].word} garden, ${cat ? 'cat' : 'empty'}${
      wrong[i] ? ', breaking a rule' : ''
    }`

    return (
      <div className={s.cell} data-top={top} data-left={left} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', litGroup.has(i) && cues.highlight)}
          style={{ '--patch': `var(${PATCHES[g].token})` } as CSSProperties}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-conflict={wrong[i] ? 'true' : undefined}
          disabled={locked}
          aria-label={label}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          {cat && (
            <Pictogram
              name="cat"
              className={cx(s.art, litPair.has(i) && cues.shake)}
            />
          )}
        </button>
      </div>
    )
  })

  /* One line, and only ever one: the rule that has just been broken, what red
     means, or how much is left to do. The named mistake outranks the general
     sentence — a child who has just sat two cats in one row is owed the row,
     not the rule. */
  const rule = broken ? (said ?? 'Red means a cat is breaking a rule.') : ''
  const note = locked ? '' : rule !== '' ? rule : statusLine(emptyGardens(state))

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres it,
          and lets a seven-wide grid scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={String(n)}
          style={{ '--n': String(n) } as CSSProperties}
          role="group"
          aria-label={`${n} gardens on a ${n} by ${n} grid`}
          onKeyDown={onKeyDown}
        >
          {tiles}
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{note}</p>
      {/* Only the broken rule is announced. Every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : rule}
      </p>
    </div>
  )
}
