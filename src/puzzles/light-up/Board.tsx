import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { playSound } from '../../lib/sound'
import type { BoardProps } from '../../lib/types'
import type { Clash, LightUpAction, LightUpState } from './logic'
import {
  PLAIN,
  clashOf,
  colOf,
  conflicts,
  darkSquares,
  describeClash,
  hungryWalls,
  isOpen,
  litCounts,
  rowOf,
} from './logic'
import s from './board.module.css'

/**
 * What is left to do, in the order a child meets it. Every square dark comes
 * first, because that is the goal and the number falls as they work. Once the
 * board is fully lit and a wall is still short, nothing on the screen is red
 * and nothing is counting down — so without this second sentence the board
 * would go quiet at exactly the moment a child thinks they have finished.
 */
function statusLine(dark: number, short: number): string {
  if (dark === 1) return '1 square is still dark.'
  if (dark > 1) return `${dark} squares are still dark.`
  if (short === 1) return 'Every square is lit. 1 wall still wants another candle.'
  if (short > 1) return `Every square is lit. ${short} walls still want more candles.`
  return ''
}

/** A wall says what it is and what it asks for. Nobody can press one. */
function wallLabel(n: number, index: number, value: number): string {
  const where = `Row ${rowOf(n, index) + 1}, column ${colOf(n, index) + 1}`
  if (value === PLAIN) return `${where}, a wall`
  if (value === 0) return `${where}, a wall that wants no candles`
  return `${where}, a wall that wants ${value} ${value === 1 ? 'candle' : 'candles'}`
}

export function Board({ state, dispatch, locked }: BoardProps<LightUpState, LightUpAction>) {
  const { n, walls, candles } = state

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every candle. The walls are the token rather than the
   * whole state for exactly that reason: they are a new array only when a new
   * board is dealt, which is the one moment the tab stop should start again.
   * And the seed is the first *open* square, because square 0 is a wall on a
   * good share of the boards this deals.
   */
  const firstOpen = useMemo(() => Math.max(0, walls.findIndex(isOpen)), [walls])
  const [cursor, setCursor] = useEphemeral(walls, firstOpen)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  const lit = useMemo(() => litCounts(state), [state])
  const wrong = useMemo(() => conflicts(state), [state])
  const broken = wrong.some(Boolean)

  /**
   * The group a candle has just fallen foul of, lit for one run of the cue. A
   * red ring says which candle is wrong but never what it is wrong with, so
   * the run of squares between two candles — or the wall and the squares round
   * it — lights up, and the candles at fault shake at each other. It is
   * decoration over a move the puzzle has already taken: nothing else reads
   * it, and it takes itself off again.
   */
  const [cue, light] = useCue<Clash>('--dur-5')
  const litGroup = useMemo(() => new Set(cue?.cells), [cue])
  const litBlame = useMemo(() => new Set(cue?.blamed), [cue])

  /**
   * The same mistake in words, and deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until no
   * candle on the board is breaking a rule, and it is dropped during render
   * rather than after paint, so a mistake made much later is never announced
   * with the sentence for an older one.
   */
  const [said, setSaid] = useState<string | null>(null)
  if (said !== null && !broken) setSaid(null)

  const tap = (index: number) => {
    if (locked) return
    // Worked out from the state the move is leaving, which is the only one the
    // board has: the shell hands the next one back on the render after this.
    const clash = candles[index] ? null : clashOf(state, index)
    dispatch({ type: 'toggle', index })
    if (clash === null) return
    light(clash)
    // The candle really does go down, so the shell's knock underneath it is
    // true and stays; this is the "no" over the top of it.
    playSound('wrong')
    setSaid(describeClash(clash))
  }

  const focusCell = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  /**
   * The next open square in this direction. A wall is not a control, so the
   * step walks over it and keeps going, and stands still at the edge rather
   * than wrapping round to the far side of the board.
   */
  const stepTo = (from: number, dr: number, dc: number): number | null => {
    let r = rowOf(n, from) + dr
    let c = colOf(n, from) + dc
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const i = r * n + c
      if (isOpen(walls[i])) return i
      r += dr
      c += dc
    }
    return null
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
    const next = stepTo(cursor, step[0], step[1])
    if (next !== null) focusCell(next)
  }

  const tiles = walls.map((value, i) => {
    const r = rowOf(n, i) + 1
    const c = colOf(n, i) + 1

    if (!isOpen(value)) {
      return (
        <div className={s.cell} data-wall="true" key={i}>
          <div
            className={cx(s.wall, litGroup.has(i) && cues.highlight)}
            role="img"
            aria-label={wallLabel(n, i, value)}
          >
            {value >= 0 && (
              <span className={s.num} aria-hidden="true">
                {value}
              </span>
            )}
          </div>
        </div>
      )
    }

    const standing = candles[i]
    const what = standing ? 'a candle' : lit[i] > 0 ? 'a lit square' : 'a dark square'
    const label = `Row ${r}, column ${c}, ${what}${wrong[i] ? ', breaking a rule' : ''}`

    return (
      <div className={s.cell} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', litGroup.has(i) && cues.highlight)}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-lit={lit[i] > 0 ? 'true' : undefined}
          data-candle={standing ? 'true' : undefined}
          data-conflict={wrong[i] ? 'true' : undefined}
          disabled={locked}
          aria-label={label}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          {standing && (
            <Pictogram name="candle" className={cx(s.art, litBlame.has(i) && cues.shake)} />
          )}
        </button>
      </div>
    )
  })

  /* One line, and only ever one: the rule that has just been broken, what red
     means, or how much is left to do. The named mistake outranks the general
     sentence — a child who has just stood a candle in another candle's light
     is owed that, not the rule. */
  const rule = broken ? (said ?? 'Red means a candle is breaking a rule.') : ''
  const note = locked ? '' : rule !== '' ? rule : statusLine(darkSquares(state), hungryWalls(state))

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
          aria-label={`Candles on a ${n} by ${n} board`}
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
