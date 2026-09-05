import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cues, useCue } from '../../lib/motion'
import type { BoardProps } from '../../lib/types'
import type { Clash, SudokuAction, SudokuState, SymbolSet } from './logic'
import { FRUIT_NAMES, clashOf, conflicts, describeClash, symbolName } from './logic'
import { ClearGlyph, FruitGlyph } from './glyphs'
import s from './board.module.css'

const noun = (symbols: SymbolSet) => (symbols === 'fruit' ? 'fruit' : 'number')

/** A cue class comes and goes, so every className on the grid is joined the same way. */
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

/** What a symbol key says to a screen reader, and what a keypress writes. */
const keyLabel = (symbols: SymbolSet, value: number) =>
  symbols === 'fruit'
    ? `Put the ${FRUIT_NAMES[value - 1]} in the square`
    : `Put ${value} in the square`

function Mark({ value, symbols, cue }: { value: number; symbols: SymbolSet; cue?: string }) {
  if (value === 0) return null
  if (symbols === 'fruit') return <FruitGlyph value={value} className={cx(s.art, cue)} />
  return <span className={cx(s.digit, cue)}>{value}</span>
}

const firstBlank = (givens: number[]) => Math.max(0, givens.indexOf(0))

export function Board({ state, dispatch, locked }: BoardProps<SudokuState, SudokuAction>) {
  const { n, boxH, boxW, symbols, givens, entries } = state

  /** The square with the amber ring. */
  const [selected, setSelected] = useState<number | null>(null)
  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — otherwise the keyboard would lose its place after every
   * answer. It resets when a different puzzle is dealt.
   */
  const [cursor, setCursor] = useState(() => firstBlank(givens))
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * A choice does not survive a move: after a rewind the ring would sit on a
   * square the player never picked. The one square that keeps it is the one
   * the browser still has focus on, and that is read from the DOM rather than
   * from stale React state. Without the exception the keyboard goes on
   * writing into a square the board has stopped drawing as chosen.
   */
  // Before paint, not after: an effect would show one frame of the amber ring
  // still sitting on the square the player has just moved away from.
  useLayoutEffect(() => {
    setSelected((cur) => (cur !== null && refs.current[cur] === document.activeElement ? cur : null))
  }, [state])

  useEffect(() => setCursor(firstBlank(givens)), [givens])

  const wrong = useMemo(() => conflicts(state), [state])
  const repeats = wrong.reduce((count, w) => count + (w ? 1 : 0), 0)
  const values = useMemo(() => Array.from({ length: n }, (_, i) => i + 1), [n])

  /**
   * The unit a repeat has just broken, lit for one run of the cue. A red ring
   * says which square is wrong but never what it is wrong with, so the whole
   * row, column or box lights up and the two squares that hold the symbol
   * shake at each other. It is decoration over a move the puzzle has already
   * taken: nothing else reads it, and it takes itself off again.
   */
  const [lit, light] = useCue<Clash>('--dur-5')
  const litUnit = useMemo(() => new Set(lit?.cells), [lit])
  const litPair = useMemo(() => new Set(lit?.blamed), [lit])

  /**
   * The same mistake in words. It is deliberately not on the cue's timer:
   * reduced motion collapses that to a millisecond, and this sentence is all
   * that is left of the cue for anyone who cannot watch it. It stands until
   * the board has no repeat left on it, and it is dropped during render rather
   * than after paint so that a repeat made much later is never announced with
   * the sentence for an older one.
   */
  const [said, setSaid] = useState<string | null>(null)
  if (said !== null && repeats === 0) setSaid(null)

  const write = (index: number, value: number) => {
    // The board never sends a move it already knows is a no-op.
    if (locked || givens[index] !== 0 || entries[index] === value) return
    // Worked out from the state the move is leaving, which is the only one the
    // board has: the shell hands the next one back on the render after this.
    const clash = clashOf(state, index, value)
    dispatch({ type: 'set', index, value })
    if (clash === null) return
    light(clash)
    setSaid(describeClash(state, clash))
  }

  /** Both pieces of local state follow the focus, so they can never disagree. */
  const markCell = (index: number) => {
    setCursor(index)
    setSelected(index)
  }

  const focusCell = (index: number) => {
    markCell(index)
    refs.current[index]?.focus()
  }

  const stepFrom = (index: number, dr: number, dc: number) => {
    let r = Math.floor(index / n) + dr
    let c = (index % n) + dc
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const at = r * n + c
      if (givens[at] === 0) return at
      r += dr
      c += dc
    }
    return null
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (locked) return
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = steps[event.key]
    if (step) {
      const next = stepFrom(cursor, step[0], step[1])
      event.preventDefault()
      if (next !== null) focusCell(next)
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
      event.preventDefault()
      write(cursor, 0)
      return
    }
    if (event.key.length === 1 && event.key >= '1' && event.key <= '9') {
      const value = Number(event.key)
      if (value <= n) {
        event.preventDefault()
        write(cursor, value)
      }
      return
    }
    if (event.key === 'Escape') setSelected(null)
  }

  const cells = givens.map((given, i) => {
    const row = Math.floor(i / n)
    const col = i % n
    const top = row === 0 ? undefined : row % boxH === 0 ? 'thick' : 'hair'
    const left = col === 0 ? undefined : col % boxW === 0 ? 'thick' : 'hair'
    const where = `Row ${row + 1}, column ${col + 1}`

    if (given !== 0) {
      return (
        <div className={s.cell} data-top={top} data-left={left} key={i}>
          <div
            className={cx(s.given, litUnit.has(i) && cues.highlight)}
            role="img"
            aria-label={`${where}, ${symbolName(symbols, given)}, printed`}
          >
            <Mark value={given} symbols={symbols} cue={litPair.has(i) ? cues.shake : undefined} />
          </div>
        </div>
      )
    }

    const value = entries[i]
    const label = `${where}, ${symbolName(symbols, value)}${wrong[i] ? ', repeated' : ''}`
    return (
      <div className={s.cell} data-top={top} data-left={left} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', litUnit.has(i) && cues.highlight)}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-selected={selected === i ? 'true' : undefined}
          data-conflict={wrong[i] ? 'true' : undefined}
          disabled={locked}
          aria-label={label}
          aria-pressed={selected === i}
          onFocus={() => markCell(i)}
          onClick={() => focusCell(i)}
        >
          <Mark value={value} symbols={symbols} cue={litPair.has(i) ? cues.shake : undefined} />
        </button>
      </div>
    )
  })

  /* One line, and only ever one: the repeat that has just been made, what red
     means, or what to tap next. The named repeat outranks the general
     sentence — a child who has just put a second banana in a row is owed the
     banana, not the rule. */
  const repeated = `Red means you have the same ${noun(symbols)} twice in a row, column or box.`
  const brokenRule = repeats === 0 ? '' : (said ?? repeated)

  const note = locked
    ? ''
    : brokenRule !== ''
      ? brokenRule
      : selected === null
        ? `Tap a square, then tap a ${noun(symbols)}.`
        : `Now tap a ${noun(symbols)} for row ${Math.floor(selected / n) + 1}, column ${(selected % n) + 1}.`

  return (
    <div>
      {/* The shell already sits the board on a stage; this only centres it,
          and lets a six-wide grid scroll rather than shrink under a fingertip. */}
      <div className={s.frame}>
        <div
          className={s.grid}
          data-size={n === 6 ? 'six' : 'four'}
          style={{ '--n': String(n) } as React.CSSProperties}
          role="group"
          aria-label={`${n} by ${n} grid`}
          onKeyDown={onKeyDown}
        >
          {cells}
        </div>
      </div>

      <div className={s.palette} data-size={n === 6 ? 'six' : 'four'}>
        {values.map((v) => (
          <button
            key={v}
            type="button"
            className={`${s.key} u-press`}
            disabled={locked || selected === null || entries[selected] === v}
            aria-label={keyLabel(symbols, v)}
            onClick={() => selected !== null && write(selected, v)}
          >
            {symbols === 'fruit' ? (
              <>
                <FruitGlyph value={v} className={s.keyArt} />
                {/* Which key on the keyboard writes it. A digit is its own note. */}
                <span className={s.keyCap}>{v}</span>
              </>
            ) : (
              <span className={s.keyDigit}>{v}</span>
            )}
          </button>
        ))}
        <button
          type="button"
          className={`${s.key} ${s.eraser} u-press`}
          disabled={locked || selected === null || entries[selected] === 0}
          aria-label="Rub out the square"
          onClick={() => selected !== null && write(selected, 0)}
        >
          <ClearGlyph className={s.keyGlyph} />
          <span className={s.keyWord}>Rub out</span>
        </button>
      </div>

      <p className={s.note}>{note}</p>
      {/* Only the broken rule is announced. Every arrow key would be noise. */}
      <p className="u-sr" role="status">
        {locked ? '' : brokenRule}
      </p>
    </div>
  )
}
