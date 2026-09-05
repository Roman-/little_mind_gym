import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, useCue } from '../../lib/motion'
import { Pictogram } from '../../components/Pictogram'
import type { BoardProps } from '../../lib/types'
import type { Bank, RiverAction, RiverItem, RiverState } from './logic'
import { canCross, failureOf, nameFor } from './logic'
import { BoatArrow } from './glyphs'
import s from './board.module.css'

/**
 * The two banks lie one above the other and run the full width of the board,
 * so a bank never runs out of room for its passengers. The river is the space
 * between them and the boat is the control: it sits on the water, carries an
 * arrow pointing at the bank it will land on, and rowing is a tap on it.
 * There is no "Row across" button, because there is no need to name a thing
 * the child can already see.
 *
 * Every creature has a place of its own — the same place on either bank, and a
 * seat in the boat — and the place stays where it is while the creature is
 * somewhere else. A bank that closed its ranks would slide the second animal
 * out from under a child who was already reaching for it, so the only thing
 * that rearranges anybody is a crossing.
 */

/** One place in the boat: whoever is sitting in it, or nobody. */
type Seat = number | null

function Piece({
  item,
  aboard,
  onClick,
  label,
  shaking,
}: {
  item: RiverItem
  aboard?: boolean
  onClick?: () => void
  label: string
  /** This piece broke the rule the board has just been stopped by. */
  shaking?: boolean
}) {
  return (
    <button
      type="button"
      className={`${s.piece} ${onClick ? 'u-press' : ''}`}
      data-aboard={aboard ? 'true' : undefined}
      data-idle={onClick ? undefined : 'true'}
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
    >
      {/* The cue goes on the plate rather than the button: a piece in the boat
          is already riding its own arrival animation. */}
      <span className={`${s.plate} ${shaking ? cues.shake : ''}`}>
        <Pictogram name={item.glyph} className={s.art} />
      </span>
      <span className={s.name}>{item.label}</span>
    </button>
  )
}

/** A place with nobody in it. It holds the width its creature comes back to. */
function Empty({ className }: { className: string }) {
  return <span className={className} aria-hidden="true" />
}

/** The row read out for anyone who cannot see the banks. */
function bankSummary(state: RiverState, bank: Bank, label: string): string {
  const here = state.cfg.items.filter((_, i) => state.at[i] === bank)
  if (here.length === 0) return `${label}: empty.`
  return `${label}: ${here.map((it) => nameFor(it)).join(', ')}.`
}

export function Board({ state, dispatch, locked }: BoardProps<RiverState, RiverAction>) {
  const { cfg, boat } = state

  /**
   * The pieces a dead end names, shaken once as the board locks. Which pieces
   * those are comes back from the rule that broke, alongside the sentence, so
   * the board never reads the sentence to find out. The shake is decoration
   * over a dead end the shell has already settled: under reduced motion it is
   * gone in a millisecond, and the notice under the board still says what
   * happened.
   */
  const [blamed, blame] = useCue<string[]>()
  useEffect(() => {
    const dead = failureOf(state)
    if (dead !== null) blame(dead.blamed)
  }, [state, blame])
  const shaking = useMemo(() => new Set(blamed), [blamed])

  /** When only one piece can row, it never leaves the boat — nobody wants to tap it 14 times. */
  const pilot = useMemo(() => {
    const rowers = cfg.items.map((it, i) => (it.rower ? i : -1)).filter((i) => i >= 0)
    return rowers.length === 1 ? rowers[0] : null
  }, [cfg])

  /** An empty boat: every seat in it, less the one a pilot never gives up. */
  const emptyBoat = useMemo<Seat[]>(
    () => Array.from({ length: pilot === null ? cfg.capacity : cfg.capacity - 1 }, () => null),
    [cfg, pilot],
  )
  const [seats, setSeats] = useEphemeral<Seat[]>(state, emptyBoat)

  const riders = seats.filter((i): i is number => i !== null)
  const passengers = pilot === null ? riders : [pilot, ...riders]
  const ready = !locked && canCross(state, passengers)
  const roomAboard = seats.includes(null)

  /** A tap on a creature: into the first free seat, or out of the boat and home. */
  const toggle = (i: number) => {
    if (locked) return
    setSeats((cur) => {
      if (cur.includes(i)) return cur.map((who) => (who === i ? null : who))
      const seat = cur.indexOf(null)
      if (seat < 0 || state.at[i] !== boat) return cur
      return cur.map((who, k) => (k === seat ? i : who))
    })
  }

  /**
   * Every creature that stands on a bank, in one order both banks keep. A
   * pilot is not among them: they are in the boat from the first tap to the
   * last, so a place ashore would only ever be an empty one.
   */
  const places = useMemo(
    () => cfg.items.map((item, i) => ({ item, i })).filter(({ i }) => i !== pilot),
    [cfg, pilot],
  )

  const renderBank = (bank: Bank, label: string) => (
    <div className={s.bank} data-side={bank}>
      <div className={s.pieces}>
        {places.map(({ item, i }) => {
          const ashore = state.at[i] === bank && !seats.includes(i)
          if (!ashore) return <Empty key={item.id} className={s.hole} />
          const reachable = !locked && bank === boat && roomAboard
          return (
            <Piece
              key={item.id}
              item={item}
              shaking={shaking.has(item.id)}
              label={
                reachable
                  ? `Put ${nameFor(item)} in the boat`
                  : `${item.label}, ${label.toLowerCase()}`
              }
              onClick={reachable ? () => toggle(i) : undefined}
            />
          )
        })}
      </div>
      <div className={`u-label ${s.bankLabel}`}>{label}</div>
    </div>
  )

  const rowLabel =
    boat === 'near'
      ? `Row across to the ${cfg.farLabel.toLowerCase()}`
      : `Row back to ${cfg.nearLabel.toLowerCase()}`

  const note = locked || ready ? '' : 'The boat is empty. Tap a piece to put it in.'

  return (
    <div className={s.board}>
      <p className={s.rule}>{cfg.rule}</p>

      <p className="u-sr" role="status">
        {bankSummary(state, 'far', cfg.farLabel)} {bankSummary(state, 'near', cfg.nearLabel)}
      </p>

      <div className={s.scene}>
        {renderBank('far', cfg.farLabel)}

        <div className={s.river}>
          <div className={s.track}>
            <div className={s.boat} data-bank={boat}>
              <div className={s.cargo} style={{ '--seats': cfg.capacity } as CSSProperties}>
                {pilot !== null && (
                  <Piece
                    item={cfg.items[pilot]}
                    aboard
                    shaking={shaking.has(cfg.items[pilot].id)}
                    label={`${cfg.items[pilot].label}, rowing the boat`}
                  />
                )}
                {seats.map((i, seat) =>
                  i === null ? (
                    <Empty key={seat} className={s.seat} />
                  ) : (
                    <Piece
                      key={seat}
                      item={cfg.items[i]}
                      aboard
                      shaking={shaking.has(cfg.items[i].id)}
                      label={`Take ${nameFor(cfg.items[i])} out of the boat`}
                      onClick={locked ? undefined : () => toggle(i)}
                    />
                  ),
                )}
              </div>

              {/* The hull is the control. Amber means "your turn": it lights up
                  the moment the load can float. */}
              <button
                type="button"
                className={`${s.hull} u-press`}
                data-dir={boat === 'near' ? 'up' : 'down'}
                disabled={!ready}
                aria-label={rowLabel}
                onClick={() => dispatch({ type: 'cross', passengers })}
              >
                <span className={s.hullBody} aria-hidden="true" />
                <BoatArrow className={s.arrow} />
              </button>
            </div>
          </div>
        </div>

        {renderBank('near', cfg.nearLabel)}
      </div>

      <p className={s.note}>{note}</p>
    </div>
  )
}
