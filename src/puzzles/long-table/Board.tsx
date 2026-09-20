import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { cues, cx, useCue } from '../../lib/motion'
import type { BoardProps } from '../../lib/types'
import type { Guest, TableAction, TableState } from './logic'
import { everySeam, failureOf, nameFor, swapsLeft } from './logic'
import { NoMark, SwapMark } from './glyphs'
import s from './board.module.css'

/**
 * One long table, the guests along the far side of it, and a swap in every gap
 * between two of them. Tapping a gap swaps the two neighbours either side, so
 * one tap is one move and there is no piece to pick up first.
 *
 * **While a swap is left, the board never marks the quarrels it can see.** Who
 * cannot sit next to whom is on the roster above the table, the same roster
 * from the first tap to the last; which of those pairs are next to each other
 * *now* is for the player to read off the row. Lighting those seams in clay
 * while the level is open was the obvious thing to draw and it would have
 * taken the puzzle apart: with the bad pairs lit, a child is being handed the
 * one reading the whole level is made of, and the board does the looking that
 * the child came to do. (A lit seam would also mislead. Swapping two who
 * quarrel leaves them next to each other — a lit seam is the one gap that
 * tapping cannot fix — and logic.test.ts proves that no run of lit-seam taps
 * ever seats anybody, on any of the three levels.)
 *
 * The dead end holds the same line for as long as the level is open. It says
 * nothing until the swaps are spent, so no tap is ever answered
 * right-or-wrong; the top of logic.ts has what the eager reading gave away and
 * what this one costs instead.
 *
 * **Once the swaps are spent, it points.** The sentence under the board is
 * that two who cannot sit next to each other are still next to each other, and
 * a child who cannot yet find them in a row of seven is being told a fact
 * about a picture they cannot read. So those two wear a clay ring, and the
 * roster's own "not these two" mark stands in the gap between them, in clay
 * rather than ink — a rule on that roster that has actually been broken.
 * `failureOf` in logic.ts says who they are; the board never works it out a
 * second time. Where a row has more than one such pair in it, every one of
 * them is marked: they are separate rules, and parting one pair would leave
 * the other sitting there.
 *
 * This gives nothing away that the level has not already ended on. It is drawn
 * at the same moment as the sentence it belongs to, and by then the looking is
 * over.
 *
 * So while the level is open the board says two things and no more: who cannot
 * sit next to whom, and how many swaps are left. The rest is the row.
 *
 * Nothing here is ever refused, so there is no `useRefusal`. Every gap is a
 * real move while a swap remains — two who quarrel sitting next to each other
 * is a position, not a forbidden move — and the one thing the rules will not
 * do, pay for a swap that cannot be afforded, is the dead end the shell
 * answers with Step back.
 */

/** The row read out for anyone who cannot see the table. */
function rowSummary(state: TableState): string {
  const names = state.seats.map((who) => nameFor(state.cfg.guests[who]))
  return `Along the table: ${names.join(', ')}.`
}

/** How many swaps are left, in the words the counter and the status line share. */
function swapsWord(left: number): string {
  if (left === 0) return 'No swaps left'
  return `${left} swap${left === 1 ? '' : 's'} left`
}

/** One quarrel, in the words everything else here uses. */
function quarrelSentence(a: Guest, b: Guest): string {
  return `The ${a.label.toLowerCase()} cannot sit next to ${nameFor(b)}.`
}

export function Board({ state, dispatch, locked }: BoardProps<TableState, TableAction>) {
  const { cfg, seats, used } = state
  const left = swapsLeft(state)

  /**
   * Null for the whole of the level, and the two the sentence is about once
   * the swaps have gone. Everything the board draws in clay hangs off this one
   * question, asked of logic.ts rather than answered here.
   */
  const dead = useMemo(() => failureOf(state), [state])

  /**
   * Which seat each guest is sitting in — the other way round from `seats`,
   * because the guests are drawn in the cast's own order and *placed* by a
   * transform rather than listed in row order. A swap changes the row order by
   * definition, and React answers a re-ordered list by lifting the node that
   * moved out of the document and putting it straight back: the animal a child
   * has just tapped would land on its new place with no travel and no focus.
   * Ordering by the guest instead means no node is ever lifted, and the swap
   * is two animals sliding past each other.
   */
  const placeOf = useMemo(() => {
    const out = new Array<number>(cfg.guests.length).fill(0)
    seats.forEach((who, seat) => {
      out[who] = seat
    })
    return out
  }, [cfg, seats])

  const byId = useMemo(() => new Map(cfg.guests.map((g) => [g.id, g])), [cfg])

  /**
   * The swaps that are left, flashed clay as the level dead-ends. The counter
   * is exactly what the sentence under the board is about — every swap has
   * been used — so the counter is what wears the cue, and it reads "No swaps
   * left" at the moment it goes clay. The cue is guarded on the state it was
   * fired from: the move tape can rewind while it is still running, and a mark
   * left over a position the board has since left would be a lie.
   */
  const [spent, blame] = useCue<TableState>()
  useEffect(() => {
    if (dead !== null) blame(state)
  }, [dead, state, blame])

  const seams = everySeam(seats)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * The one line under the board, and only while the position calls for it:
   * how a swap is made, until a swap has been made. Standing there for the
   * whole level it would be a second copy of the how-to-play drawer, and it is
   * the line a child needs least once they have tapped a gap once. What the
   * row says about itself is deliberately not here — which of the pairs are
   * next to each other is the reading the level is made of, and it stays the
   * child's.
   */
  const note =
    locked || used > 0 ? '' : 'Nobody has moved yet. Tap an arrow between two animals to swap them.'

  /**
   * Left and right walk the gaps, so a child playing by keyboard crosses the
   * table the way their eye does. Every chord is left alone — ctrl, meta and
   * alt all belong to the browser — and so is a key some other handler has
   * already answered.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    const from = Number((event.target as HTMLElement).dataset.seam)
    if (!Number.isInteger(from)) return
    const next = refs.current[from + step]
    if (!next) return
    event.preventDefault()
    next.focus()
  }

  return (
    <div className={s.board} style={{ '--seats': String(seats.length) } as CSSProperties}>
      {/* A screen reader hears what a looker sees: where the ring and the mark
          name a pair, the sentence names it too. */}
      <p className="u-sr" role="status">
        {rowSummary(state)} {swapsWord(left)}.{' '}
        {(dead?.seams ?? [])
          .map((seam) => quarrelSentence(cfg.guests[seats[seam]], cfg.guests[seats[seam + 1]]))
          .join(' ')}
      </p>

      <div className={s.roster}>
        <p className={`u-label ${s.rosterTitle}`}>These cannot sit next to each other</p>
        <ul className={s.pairs}>
          {cfg.quarrels.map(({ a, b }) => {
            const one = byId.get(a)
            const two = byId.get(b)
            if (one === undefined || two === undefined) return null
            return (
              /* The card is the picture, so the card is what carries the
                 sentence: an item of a list with its role taken away is an
                 item the list can no longer count. */
              <li key={`${a}:${b}`}>
                <span className={s.pair} role="img" aria-label={quarrelSentence(one, two)}>
                  <Pictogram name={one.art} className={s.pairArt} />
                  <NoMark className={s.noMark} />
                  <Pictogram name={two.art} className={s.pairArt} />
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className={s.room}>
        <div className={s.table}>
          <div className={s.guests}>
            {cfg.guests.map((guest, who) => (
              <div
                key={guest.id}
                className={s.guest}
                style={{ '--place': String(placeOf[who]) } as CSSProperties}
              >
                <Pictogram
                  name={guest.art}
                  className={cx(s.art, dead?.blamed.includes(guest.id) && s.blamed)}
                />
              </div>
            ))}
          </div>

          <div className={s.top}>
            {/* A place stays a place: one setting a seat, in the same spot all
                the way through, so only the animals ever move. */}
            <div className={s.plates} aria-hidden="true">
              {seats.map((_, seat) => (
                <span className={s.plate} key={seat} />
              ))}
            </div>

            <div className={s.gaps} onKeyDown={onKeyDown}>
              {seams.map((seam) => {
                const one = cfg.guests[seats[seam]]
                const two = cfg.guests[seats[seam + 1]]
                // The gap between two who are still sitting together says which
                // rule it is, in the words and the mark the roster uses.
                const wrong = dead?.seams.includes(seam) === true
                return (
                  <span
                    className={s.gap}
                    key={seam}
                    style={{ '--gap': String(seam + 1) } as CSSProperties}
                  >
                    <button
                      type="button"
                      className={cx(s.seam, wrong && s.stuckSeam, 'u-press')}
                      data-seam={seam}
                      ref={(el) => {
                        refs.current[seam] = el
                      }}
                      /* Never `disabled`. The gaps are the only way to read the
                         row by keyboard — each one names both of its
                         neighbours — and a finished level is exactly when a
                         child wants to go back over it. */
                      aria-disabled={locked ? 'true' : undefined}
                      aria-label={
                        wrong
                          ? quarrelSentence(one, two)
                          : `Swap ${nameFor(one)} and ${nameFor(two)}`
                      }
                      onClick={() => {
                        if (locked) return
                        dispatch({ type: 'swap', seam })
                      }}
                    >
                      {wrong ? (
                        <NoMark className={s.swapMark} />
                      ) : (
                        <SwapMark className={s.swapMark} />
                      )}
                    </button>
                  </span>
                )
              })}
            </div>
          </div>

          <div className={s.legs} aria-hidden="true">
            <span />
            <span />
          </div>
        </div>
      </div>

      <p className={cx('u-label', s.counter, spent === state && cues.flash)}>{swapsWord(left)}</p>
      <p className={s.note}>{note}</p>
    </div>
  )
}
