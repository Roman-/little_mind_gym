import { useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { HorsesAction, HorsesState, Team } from './logic'
import {
  MIDDLE,
  SQUARES,
  SQUARE_NAMES,
  canJump,
  horseCount,
  horsesHome,
  refusalOf,
  teamWord,
} from './logic'
import { DropMark, JumpMark } from './glyphs'
import s from './board.module.css'

/** The enamel a mat is painted in, one to a team. Ochre reads brown, slate grey. */
const MAT_COLOURS: Record<Team, string> = {
  brown: 'var(--p-ochre)',
  grey: 'var(--p-slate)',
}

/** Which square a horse has been lifted off, and which team it belongs to. */
interface Lift {
  at: number
  team: Team
}

const rowOf = (i: number) => Math.floor(i / 3)
const colOf = (i: number) => i % 3

/** The one number a player reads off the board, and what is left to do about it. */
function statusLine(away: number): string {
  if (away === 0) return ''
  if (away === 1) return '1 horse still has to reach its own mat.'
  return `${away} horses still have to reach their own mats.`
}

export function Board({ state, dispatch, locked }: BoardProps<HorsesState, HorsesAction>) {
  /**
   * With forbidden moves offered, every square takes the horse. A square an L
   * does not reach lets it land, flashes, and hands it back — so which squares
   * are legal is the child's to work out from where the horse stands rather
   * than the board's to say with a dead button.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const [lifted, setLifted] = useEphemeral<Lift | null>(shown, null)

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move: `goal` is the token because `reduce` carries it across by
   * reference and only `init` makes a new one, which is the one moment the tab
   * stop should start again.
   */
  const [cursor, setCursor] = useEphemeral(state.goal, 0)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * A lift only counts while that exact horse is still standing on that square.
   * `useEphemeral` already drops it whenever the position moves — a refusal
   * included — and this guard is belt and braces against a square ever reading
   * as armed with the wrong horse.
   */
  const armed = lifted !== null && shown.squares[lifted.at] === lifted.team ? lifted : null
  const held = armed === null ? null : teamWord(armed.team)

  const canPress = (i: number): boolean => {
    if (locked) return false
    if (armed === null) return shown.squares[i] !== null
    if (i === armed.at || canJump(shown, armed.at, i)) return true
    return refusal.offered
  }

  const tap = (i: number) => {
    if (locked || refusal.busy) return
    if (armed === null) {
      const team = shown.squares[i]
      if (team !== null) setLifted({ at: i, team })
      return
    }
    if (i === armed.at) {
      setLifted(null)
      return
    }
    if (canJump(shown, armed.at, i)) {
      dispatch({ type: 'jump', from: armed.at, to: i })
      return
    }
    if (!refusal.offered) return
    const no = refusalOf(shown, armed.at, i)
    if (no !== null) refusal.refuse({ ...no, where: String(i) })
  }

  const focusSquare = (i: number) => {
    setCursor(i)
    refs.current[i]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Escape puts the horse back down. Deliberately not prevented: Escape is
    // also how a child hands the screen back out of Immerse, and that belongs
    // to the browser rather than to this board.
    if (event.key === 'Escape') {
      if (!locked && !refusal.busy) setLifted(null)
      return
    }
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    const r = rowOf(cursor) + step[0]
    const c = colOf(cursor) + step[1]
    // Stops at the edge rather than wrapping round onto another row.
    if (r < 0 || r > 2 || c < 0 || c > 2) return
    focusSquare(r * 3 + c)
  }

  /** One sentence saying what is on a square. */
  const contentsOf = (i: number): string => {
    const where = `The ${SQUARE_NAMES[i]}`
    if (i === MIDDLE) return `${where} is a hole.`
    const team = shown.squares[i]
    if (team !== null) return `${where} has a ${teamWord(team)} horse on it.`
    const mat = shown.goal[i]
    if (mat !== null) return `${where} is empty, and a ${teamWord(mat)} horse belongs here.`
    return `${where} is empty.`
  }

  const labelFor = (i: number): string => {
    if (locked) return contentsOf(i)
    if (armed === null || held === null) {
      const team = shown.squares[i]
      if (team === null) return contentsOf(i)
      return `Lift the ${teamWord(team)} horse off the ${SQUARE_NAMES[i]}.`
    }
    if (i === armed.at) return `Put the ${held} horse back on the ${SQUARE_NAMES[i]}.`
    // Offering the move means offering it to a listener too: every square says
    // what is standing on it either way, so the rule is worked out from the
    // same facts a child who can see the board works it out from, and no label
    // ever says "blocked".
    const no = refusal.offered ? null : refusalOf(shown, armed.at, i)
    if (no === null) return `Jump the ${held} horse to the ${SQUARE_NAMES[i]}. ${contentsOf(i)}`
    return `${no.message} ${contentsOf(i)}`
  }

  const squares = Array.from({ length: SQUARES }, (_, i) => {
    const team = shown.squares[i]
    const mat = shown.goal[i]
    const isArmed = armed !== null && i === armed.at
    const dead = !locked && !canPress(i)
    // "Let go here", not "this one is allowed": while forbidden moves are
    // offered, every empty square will take the horse.
    const takes =
      armed !== null &&
      !isArmed &&
      team === null &&
      (refusal.offered || canJump(shown, armed.at, i))

    return (
      <div className={s.cell} key={i}>
        <button
          type="button"
          className={cx(s.square, 'u-press', refusal.flash(String(i)))}
          style={mat === null ? undefined : ({ '--mat': MAT_COLOURS[mat] } as CSSProperties)}
          data-middle={i === MIDDLE ? 'true' : undefined}
          data-armed={isArmed ? 'true' : undefined}
          data-dead={dead ? 'true' : undefined}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          aria-pressed={team === null ? undefined : isArmed}
          aria-disabled={dead ? 'true' : undefined}
          disabled={locked}
          aria-label={labelFor(i)}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          {mat !== null && <span className={s.mat} aria-hidden="true" />}
          <span className={s.mark} data-show={takes ? 'true' : undefined} aria-hidden="true">
            <DropMark />
          </span>
          {team !== null && (
            /* The flash is on the square and the shake on the horse inside it:
               one element runs one animation, and the two say different halves
               of the same refusal. */
            <span
              className={cx(s.seat, refusal.shake(String(i)))}
              data-lifted={isArmed ? 'true' : undefined}
            >
              <Pictogram name="horse" className={cx(s.art, team === 'grey' && s.grey)} />
            </span>
          )}
        </button>
      </div>
    )
  })

  /* One line, and only ever one: the rule a tap has just broken, or how much is
     left to do. The named mistake outranks the tally — a child who has just
     dropped a horse somewhere no L reaches is owed the reason, not the count. */
  const said = refusal.say('')
  const note = locked ? '' : said !== '' ? said : statusLine(horseCount(shown) - horsesHome(shown))

  return (
    <div className={s.board}>
      <div className={s.frame}>
        <div
          className={s.grid}
          role="group"
          aria-label="Nine squares, three across and three down"
          onKeyDown={onKeyDown}
        >
          {squares}
        </div>
      </div>

      {/* The rule, drawn and written, and the same at every move of every
          level. A picture of the L is not a legal-move tell: it says nothing
          about where the horses happen to be standing. */}
      <p className={`u-label ${s.legend}`}>
        <span className={s.legendMark} aria-hidden="true">
          <JumpMark />
        </span>
        A horse jumps two squares, then one across.
      </p>

      <p className={`u-label ${s.note}`}>{note}</p>

      {/* Mounted from the first render, so a screen reader is already watching
          it when a refusal arrives. Silent once the level is locked: the
          shell's own status has the news by then. */}
      <p className="u-sr" role="status">
        {locked
          ? ''
          : refusal.say(
              armed === null || held === null
                ? 'You are not holding a horse.'
                : `You are holding the ${held} horse above the ${SQUARE_NAMES[armed.at]}.`,
            )}
      </p>
    </div>
  )
}
