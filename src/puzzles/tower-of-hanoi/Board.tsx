import { useEphemeral } from '../../lib/ephemeral'
import type { CSSProperties } from 'react'
import type { BoardProps } from '../../lib/types'
import type { HanoiAction, HanoiState } from './logic'
import { GOAL_PEG, PEG_COUNT, PEG_LETTERS, canMove, describeDisc, topOf } from './logic'
import { DropMark, GoalFlag } from './glyphs'
import s from './board.module.css'

/** Enamel by size: the bigger the disc, the deeper the colour. */
const DISC_COLORS = [
  'var(--p-ochre)',
  'var(--p-clay)',
  'var(--p-moss)',
  'var(--p-plum)',
  'var(--p-indigo)',
]

/** Width as a share of the peg column, spread evenly from smallest to biggest. */
function widthOf(size: number, total: number): string {
  if (total <= 1) return '96%'
  return `${40 + ((size - 1) / (total - 1)) * 56}%`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Which peg a disc has been lifted off, and which disc it is. Selection only. */
interface Lift {
  peg: number
  size: number
}

export function Board({ state, dispatch, locked }: BoardProps<HanoiState, HanoiAction>) {
  const [lifted, setLifted] = useEphemeral<Lift | null>(state, null)

  /**
   * A lift only counts while that exact disc is still on top of that peg.
   * useEphemeral already clears it whenever the puzzle state moves; this guard
   * is belt and braces against a peg ever reading as armed with the wrong disc.
   */
  const armed = lifted !== null && topOf(state, lifted.peg) === lifted.size ? lifted : null
  const armedPeg = armed === null ? null : armed.peg
  const held = armed === null ? null : describeDisc(armed.size, state.discs)

  const canPress = (peg: number): boolean => {
    if (locked) return false
    if (armedPeg === null) return topOf(state, peg) !== null
    return peg === armedPeg || canMove(state, armedPeg, peg)
  }

  const tap = (peg: number) => {
    if (locked) return
    if (armedPeg === null) {
      const size = topOf(state, peg)
      if (size !== null) setLifted({ peg, size })
    } else if (peg === armedPeg) {
      setLifted(null)
    } else if (canMove(state, armedPeg, peg)) {
      dispatch({ type: 'move', from: armedPeg, to: peg })
    }
  }

  /** One sentence saying what is on a peg. */
  const contentsOf = (peg: number): string => {
    const letter = PEG_LETTERS[peg]
    const stack = state.pegs[peg]
    if (stack.length === 0) return `Peg ${letter} is empty.`
    const count = `${stack.length} disc${stack.length === 1 ? '' : 's'}`
    const top = describeDisc(stack[stack.length - 1], state.discs)
    return `Peg ${letter} has ${count}, and ${top} is on top.`
  }

  const labelFor = (peg: number): string => {
    const letter = PEG_LETTERS[peg]
    if (locked) return contentsOf(peg)
    if (armedPeg === null || held === null) {
      const top = topOf(state, peg)
      if (top === null) return contentsOf(peg)
      return `Lift ${describeDisc(top, state.discs)} off peg ${letter}.`
    }
    if (peg === armedPeg) return `Put ${held} back on peg ${letter}.`
    if (canMove(state, armedPeg, peg)) return `Drop ${held} on peg ${letter}. ${contentsOf(peg)}`
    return `${capitalise(held)} is too big for peg ${letter}. ${contentsOf(peg)}`
  }

  return (
    <div className={s.board} style={{ '--discs': state.discs } as CSSProperties}>
      <p className={s.goal}>Get the whole tower onto peg {PEG_LETTERS[GOAL_PEG]}.</p>
      <div className={s.bench}>
        <div className={s.row}>
          {Array.from({ length: PEG_COUNT }, (_, peg) => {
            const stack = state.pegs[peg]
            const isArmed = peg === armedPeg
            const takes = armedPeg !== null && !isArmed && canMove(state, armedPeg, peg)
            return (
              <button
                key={peg}
                type="button"
                className={`${s.peg} u-press`}
                data-armed={isArmed ? 'true' : undefined}
                aria-pressed={isArmed}
                aria-label={labelFor(peg)}
                disabled={!canPress(peg)}
                onClick={() => tap(peg)}
              >
                <span className={s.lane}>
                  <span className={s.mark} data-show={takes ? 'true' : undefined} aria-hidden="true">
                    <DropMark />
                  </span>
                  <span className={s.post} aria-hidden="true" />
                  {peg === GOAL_PEG && (
                    <span className={s.flag} aria-hidden="true">
                      <GoalFlag />
                    </span>
                  )}
                  <span className={s.stack}>
                    {stack.map((size, i) => (
                      <span
                        key={size}
                        className={s.disc}
                        data-lifted={isArmed && i === stack.length - 1 ? 'true' : undefined}
                        style={
                          {
                            '--disc-w': widthOf(size, state.discs),
                            '--disc-color': DISC_COLORS[(size - 1) % DISC_COLORS.length],
                          } as CSSProperties
                        }
                      />
                    ))}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {/* The base plank the three pegs stand on, with their letters on it. */}
        <div className={s.plank} aria-hidden="true">
          {PEG_LETTERS.map((letter) => (
            <span key={letter} className={`u-mono ${s.letter}`}>
              {letter}
            </span>
          ))}
        </div>
      </div>
      <p className="u-sr" role="status">
        {armed === null || held === null
          ? 'You are not holding a disc.'
          : `You are holding ${held} above peg ${PEG_LETTERS[armed.peg]}.`}
      </p>
    </div>
  )
}
