import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { CSSProperties } from 'react'
import type { BoardProps } from '../../lib/types'
import type { HanoiAction, HanoiState } from './logic'
import { GOAL_PEG, PEG_COUNT, PEG_LETTERS, canMove, describeDisc, refusalOf, topOf } from './logic'
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

/** Which peg a disc has been lifted off, and which disc it is. Selection only. */
interface Lift {
  peg: number
  size: number
}

export function Board({ state, dispatch, locked }: BoardProps<HanoiState, HanoiAction>) {
  /**
   * With forbidden moves offered, every peg takes the disc. A peg that will not
   * keep it lets it land, flashes, and hands it back — so which pegs are legal
   * is the child's to work out from the discs rather than the board's to say
   * with a dead button.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const [lifted, setLifted] = useEphemeral<Lift | null>(shown, null)

  /**
   * A lift only counts while that exact disc is still on top of that peg.
   * useEphemeral already clears it whenever the position moves — a refusal
   * included, since the disc has left the child's hand by then — and this
   * guard is belt and braces against a peg ever reading as armed with the
   * wrong disc.
   */
  const armed = lifted !== null && topOf(shown, lifted.peg) === lifted.size ? lifted : null
  const armedPeg = armed === null ? null : armed.peg
  const held = armed === null ? null : describeDisc(armed.size, shown.discs)

  const canPress = (peg: number): boolean => {
    if (locked) return false
    if (armedPeg === null) return topOf(shown, peg) !== null
    if (peg === armedPeg || canMove(shown, armedPeg, peg)) return true
    return refusal.offered
  }

  const tap = (peg: number) => {
    if (locked || refusal.busy) return
    if (armedPeg === null) {
      const size = topOf(shown, peg)
      if (size !== null) setLifted({ peg, size })
    } else if (peg === armedPeg) {
      setLifted(null)
    } else if (canMove(shown, armedPeg, peg)) {
      dispatch({ type: 'move', from: armedPeg, to: peg })
    } else if (refusal.offered) {
      const no = refusalOf(shown, armedPeg, peg)
      if (no !== null) refusal.refuse({ ...no, where: PEG_LETTERS[peg] })
    }
  }

  /** One sentence saying what is on a peg. */
  const contentsOf = (peg: number): string => {
    const letter = PEG_LETTERS[peg]
    const stack = shown.pegs[peg]
    if (stack.length === 0) return `Peg ${letter} is empty.`
    const count = `${stack.length} disc${stack.length === 1 ? '' : 's'}`
    const top = describeDisc(stack[stack.length - 1], shown.discs)
    return `Peg ${letter} has ${count}, and ${top} is on top.`
  }

  const labelFor = (peg: number): string => {
    const letter = PEG_LETTERS[peg]
    if (locked) return contentsOf(peg)
    if (armedPeg === null || held === null) {
      const top = topOf(shown, peg)
      if (top === null) return contentsOf(peg)
      return `Lift ${describeDisc(top, shown.discs)} off peg ${letter}.`
    }
    if (peg === armedPeg) return `Put ${held} back on peg ${letter}.`
    // Offering the move means offering it to a listener too: the peg says what
    // is standing on it either way, so the rule is worked out from the same
    // facts a child who can see the discs works it out from.
    const no = refusal.offered ? null : refusalOf(shown, armedPeg, peg)
    if (no === null) return `Drop ${held} on peg ${letter}. ${contentsOf(peg)}`
    return `${no.message} ${contentsOf(peg)}`
  }

  return (
    <div className={s.board} style={{ '--discs': shown.discs } as CSSProperties}>
      <p className={s.goal}>Get the whole tower onto peg {PEG_LETTERS[GOAL_PEG]}.</p>
      <div className={s.bench}>
        <div className={s.row}>
          {Array.from({ length: PEG_COUNT }, (_, peg) => {
            const stack = shown.pegs[peg]
            const isArmed = peg === armedPeg
            // The mark says "let go here", not "this one is allowed": while
            // forbidden moves are offered, every other peg will take the disc.
            const takes =
              armedPeg !== null && !isArmed && (refusal.offered || canMove(shown, armedPeg, peg))
            return (
              <button
                key={peg}
                type="button"
                className={cx(s.peg, 'u-press', refusal.flash(PEG_LETTERS[peg]))}
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
                            '--disc-w': widthOf(size, shown.discs),
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
        {refusal.say(
          armed === null || held === null
            ? 'You are not holding a disc.'
            : `You are holding ${held} above peg ${PEG_LETTERS[armed.peg]}.`,
        )}
      </p>
    </div>
  )
}
