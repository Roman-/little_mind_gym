import { useEffect, useMemo } from 'react'
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
 */

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

/** The row read out for anyone who cannot see the banks. */
function bankSummary(state: RiverState, bank: Bank, label: string): string {
  const here = state.cfg.items.filter((_, i) => state.at[i] === bank)
  if (here.length === 0) return `${label}: empty.`
  return `${label}: ${here.map((it) => nameFor(it)).join(', ')}.`
}

export function Board({ state, dispatch, locked }: BoardProps<RiverState, RiverAction>) {
  const { cfg, boat } = state
  const [selected, setSelected] = useEphemeral<number[]>(state, [])

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

  const seats = pilot === null ? cfg.capacity : cfg.capacity - 1
  const passengers = pilot === null ? selected : [pilot, ...selected]
  const ready = !locked && canCross(state, passengers)

  const toggle = (i: number) => {
    if (locked) return
    setSelected((cur) =>
      cur.includes(i)
        ? cur.filter((x) => x !== i)
        : cur.length < seats && state.at[i] === boat
          ? [...cur, i]
          : cur,
    )
  }

  const onBank = (bank: Bank) =>
    cfg.items
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => state.at[i] === bank && i !== pilot && !selected.includes(i))

  const renderBank = (bank: Bank, label: string) => (
    <div className={s.bank} data-side={bank}>
      <div className={s.pieces}>
        {onBank(bank).map(({ item, i }) => {
          const reachable = !locked && bank === boat && selected.length < seats
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
              <div className={s.cargo}>
                {passengers.map((i) => (
                  <Piece
                    key={cfg.items[i].id}
                    item={cfg.items[i]}
                    aboard
                    shaking={shaking.has(cfg.items[i].id)}
                    label={
                      i === pilot
                        ? `${cfg.items[i].label}, rowing the boat`
                        : `Take ${nameFor(cfg.items[i])} out of the boat`
                    }
                    onClick={i === pilot || locked ? undefined : () => toggle(i)}
                  />
                ))}
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
