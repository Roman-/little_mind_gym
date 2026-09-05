import type { CSSProperties } from 'react'
import { useEphemeral } from '../../lib/ephemeral'
import { cx } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { BoardProps } from '../../lib/types'
import type { BalanceAction, BalanceState } from './logic'
import { answerSentence, canWeigh, readWeighing, refusalOf, weighingsLeft } from './logic'
import { TickMark, TipMark } from './glyphs'
import s from './board.module.css'

type Side = 'left' | 'right'
type Load = Record<Side, number[]>

const EMPTY: Load = { left: [], right: [] }
/** The one thing a refusal here points at: the press, and the instrument under it. */
const WEIGH = 'weigh'
const sides: Side[] = ['left', 'right']

/* --- The instrument, in viewBox units. ----------------------------------
   The drawing and the html pans both come out of these numbers and are handed
   to the CSS as custom properties, so they can never drift apart: the balls
   ride the beam at every width the board is drawn at. */
const W = 460
const H = 312
const PIVOT_X = 230
const BEAM_Y = 52
/** Half the beam. The two hang points sit at PIVOT_X ± ARM. */
const ARM = 121
/** How far the beam swings once it has an answer to give. */
const TILT = 13
/** Half a pan. Three balls fit across, so a full pan of six sits three and three. */
const RIM = 106
/** Where the cords meet the rim, with the beam level. */
const RIM_Y = 212
/** Room above a rim for two rows of balls. */
const SLOT_H = 136
const CHIP = 66
const CHIP_GAP = 4
const BOWL_DEPTH = 26
const STEM_END = 288
const FOOT_Y = 302
const FOOT_HALF = 54
const FOOT_SPREAD = 38

const rad = (deg: number) => (deg * Math.PI) / 180
/** How far a hang point falls at full tilt, and how far it slides inwards. */
const DROP = ARM * Math.sin(rad(TILT))
const PULL = ARM * (1 - Math.cos(rad(TILT)))

const hangX: Record<Side, number> = { left: PIVOT_X - ARM, right: PIVOT_X + ARM }
/** viewBox units → container query width units, so one number drives both. */
const cq = (px: number) => Number(((px / W) * 100).toFixed(3))

const rigStyle = {
  '--rig-ratio': `${W} / ${H}`,
  '--pan-w': cq(RIM * 2),
  '--pan-h': cq(SLOT_H),
  '--pan-bottom': cq(H - RIM_Y),
  '--pan-x-left': cq(hangX.left - RIM),
  '--pan-x-right': cq(hangX.right - RIM),
  '--chip': cq(CHIP),
  '--chip-gap': cq(CHIP_GAP),
} as CSSProperties

/** As the beam turns, both hang points swing a little towards the middle. */
const pullOf = (side: Side, tilt: number) =>
  tilt === 0 ? 0 : (side === 'left' ? 1 : -1) * cq(PULL)

const dropOf = (side: Side, tilt: number) =>
  tilt === 0 ? 0 : (side === 'left' ? -1 : 1) * (tilt / TILT) * cq(DROP)

/** Take a ball out of both pans, wherever it was sitting. */
const without = (load: Load, i: number): Load => ({
  left: load.left.filter((x) => x !== i),
  right: load.right.filter((x) => x !== i),
})

export function Board({ state, dispatch, locked }: BoardProps<BalanceState, BalanceAction>) {
  /**
   * With forbidden moves offered, Weigh takes the press whatever is on the
   * pans. Counting the balls onto two matching pans is most of the skill here,
   * and a button that lights up the moment they match does that counting for
   * the child.
   */
  const refusal = useRefusal(state)
  /** null while the pans still hold the weighing that was just made. */
  const [draft, setDraft] = useEphemeral<Load | null>(state, null)
  const [naming, setNaming] = useEphemeral(state, false)
  /** The ball being dragged, so both pans can show they will take it. */
  const [held, setHeld] = useEphemeral<number | null>(state, null)

  const last = state.done.length > 0 ? state.done[state.done.length - 1] : null
  /** The balls stay where they were weighed until the player disturbs them. */
  const resting = draft === null && last !== null && state.accused === null
  const load: Load = draft ?? (resting && last ? { left: last.left, right: last.right } : EMPTY)
  const loaded = load.left.length + load.right.length
  const onPan = (i: number) => load.left.includes(i) || load.right.includes(i)

  const spare = weighingsLeft(state)
  const tilt = resting && last && last.tip !== 'even' ? (last.tip === 'left' ? -TILT : TILT) : 0

  /** The balance is free, and what is on it has not been weighed already. */
  const fresh = !locked && !naming && spare > 0 && !resting
  // Whether this load is a weighing is the engine's rule, not the board's.
  const ready = fresh && (refusal.offered || canWeigh(state, load.left, load.right))

  const weigh = () => {
    if (canWeigh(state, load.left, load.right)) {
      dispatch({ type: 'weigh', left: load.left, right: load.right })
      return
    }
    if (!refusal.offered) return
    const no = refusalOf(state, load.left, load.right)
    if (no !== null) refusal.refuse({ ...no, where: WEIGH })
  }

  /** What a ball taken off the bench starts from: a resting weighing is over. */
  const from = (d: Load | null, i: number) => d ?? (onPan(i) ? load : EMPTY)

  const place = (i: number) => {
    if (locked) return
    if (naming) {
      dispatch({ type: 'accuse', index: i })
      return
    }
    if (spare <= 0) return
    setDraft((d) => {
      const base = d ?? EMPTY
      return base.left.length <= base.right.length
        ? { left: [...base.left, i], right: base.right }
        : { left: base.left, right: [...base.right, i] }
    })
  }

  const takeOff = (i: number) => {
    if (locked || naming) return
    setDraft((d) => without(from(d, i), i))
  }

  /** Dropping a dragged ball into the pan the player aimed at. */
  const dropOn = (side: Side) => {
    const i = held
    setHeld(null)
    if (locked || naming || i === null || spare <= 0) return
    setDraft((d) => {
      const kept = without(from(d, i), i)
      return side === 'left'
        ? { left: [...kept.left, i], right: kept.right }
        : { left: kept.left, right: [...kept.right, i] }
    })
  }

  const clearPans = () => {
    if (locked) return
    setDraft(EMPTY)
  }

  const toggleNaming = () => {
    if (locked) return
    setDraft(EMPTY)
    setNaming((v) => !v)
  }

  const note = locked
    ? ''
    : naming
      ? 'Tap the ball that you think is the heavy one.'
      : resting && last
        ? `${answerSentence(last.tip)} ${
            spare > 0 ? 'Take the balls off to weigh again.' : 'Now press Name the heavy one.'
          }`
        : spare <= 0
          ? 'No weighings left. Press Name the heavy one.'
          : loaded === 0
            ? 'Tap a ball to put it on a pan.'
            : // The rule is stated up front only while the button is enforcing
              // it. Offered, the counting is the child's to do.
              !refusal.offered && load.left.length !== load.right.length
              ? 'Each pan needs the same number of balls.'
              : 'Press Weigh to see which pan goes down.'

  /** Eight balls sit as four and four, nine as five and four, twelve as six and six. */
  const cols = state.balls > 10 ? 6 : state.balls > 8 ? 5 : 4

  return (
    <div className={s.board}>
      <p className="u-sr" role="status">
        {refusal.say(last ? readWeighing(last, state.done.length) : '')}
      </p>

      <div className={s.rail}>
        <p className={`u-label ${s.count}`}>
          {spare === 0 ? 'No weighings left' : `${spare} weighing${spare === 1 ? '' : 's'} left`}
        </p>
        {state.done.length === 0 ? (
          <p className={`u-label ${s.empty}`}>Nothing weighed yet</p>
        ) : (
          <ol className={s.record} aria-label="What the balance has said">
            {state.done.map((w, n) => (
              <li key={n} className={s.mark}>
                <span className="u-sr">{readWeighing(w, n + 1)}</span>
                <span className={s.markInner} aria-hidden="true">
                  <span className={`u-mono ${s.group}`} data-down={w.tip === 'left' || undefined}>
                    {w.left.map((i) => i + 1).join(' ')}
                  </span>
                  <TipMark tip={w.tip} className={s.tipMark} />
                  <span className={`u-mono ${s.group}`} data-down={w.tip === 'right' || undefined}>
                    {w.right.map((i) => i + 1).join(' ')}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className={s.rigWrap}>
        <div
          className={cx(s.rig, refusal.shake(WEIGH))}
          style={rigStyle}
          data-open={held !== null || undefined}
        >
          <svg
            className={s.scale}
            viewBox={`0 0 ${W} ${H}`}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path className={s.post} d={`M${PIVOT_X} ${BEAM_Y}V${STEM_END}`} />
            <path
              className={s.post}
              d={
                `M${PIVOT_X - FOOT_HALF} ${FOOT_Y}h${FOOT_HALF * 2}` +
                `M${PIVOT_X} ${STEM_END}l-${FOOT_SPREAD} ${FOOT_Y - STEM_END}` +
                `M${PIVOT_X} ${STEM_END}l${FOOT_SPREAD} ${FOOT_Y - STEM_END}`
              }
            />
            <g
              className={s.beam}
              style={
                {
                  '--tilt': `${tilt}deg`,
                  transformOrigin: `${PIVOT_X}px ${BEAM_Y}px`,
                } as CSSProperties
              }
            >
              <path className={s.bar} d={`M${hangX.left} ${BEAM_Y}h${ARM * 2}`} />
              <circle className={s.pivot} cx={PIVOT_X} cy={BEAM_Y} r="8" />
              {sides.map((side) => {
                const x = hangX[side]
                return (
                  <g key={side} className={s.hang} style={{ transformOrigin: `${x}px ${BEAM_Y}px` }}>
                    <path
                      className={s.cord}
                      d={`M${x} ${BEAM_Y}L${x - RIM} ${RIM_Y}M${x} ${BEAM_Y}L${x + RIM} ${RIM_Y}`}
                    />
                    <path
                      className={s.bowl}
                      d={`M${x - RIM} ${RIM_Y}Q${x} ${RIM_Y + BOWL_DEPTH} ${x + RIM} ${RIM_Y}`}
                    />
                    <path className={s.rim} d={`M${x - RIM} ${RIM_Y}h${RIM * 2}`} />
                  </g>
                )
              })}
            </g>
          </svg>

          {sides.map((side) => (
            <div
              key={side}
              className={s.slot}
              data-side={side}
              style={
                {
                  '--lift': dropOf(side, tilt),
                  '--pull': pullOf(side, tilt),
                } as CSSProperties
              }
              onDragOver={(e) => {
                if (held !== null) e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                dropOn(side)
              }}
            >
              {load[side].map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`${s.chip} u-press`}
                  data-spent={resting ? 'true' : undefined}
                  disabled={locked || naming}
                  draggable={!locked && !naming}
                  onDragStart={() => setHeld(i)}
                  onDragEnd={() => setHeld(null)}
                  aria-label={`Take ball ${i + 1} off the ${side} pan`}
                  onClick={() => takeOff(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={s.bench} style={{ '--cols': cols } as CSSProperties}>
        {Array.from({ length: state.balls }, (_, i) =>
          onPan(i) ? (
            <span key={i} className={s.hole} aria-hidden="true" />
          ) : (
            <button
              key={i}
              type="button"
              className={`${s.ball} u-press`}
              data-naming={naming ? 'true' : undefined}
              data-named={state.accused === i ? 'true' : undefined}
              disabled={locked || (!naming && spare <= 0)}
              draggable={!locked && !naming && spare > 0}
              onDragStart={() => setHeld(i)}
              onDragEnd={() => setHeld(null)}
              aria-label={
                state.accused === i
                  ? `Ball ${i + 1}, the one you named`
                  : naming
                    ? `Name ball ${i + 1} as the heavy one`
                    : locked || spare <= 0
                      ? `Ball ${i + 1}`
                      : `Put ball ${i + 1} on a pan`
              }
              onClick={() => place(i)}
            >
              {i + 1}
            </button>
          ),
        )}
      </div>

      <div className={s.controls}>
        <span className={s.clearCell}>
          {loaded > 0 && !naming && (
            <button
              type="button"
              className={`${s.clear} u-press`}
              disabled={locked}
              onClick={clearPans}
            >
              Take the balls off
            </button>
          )}
        </span>
        <button
          type="button"
          className={cx(s.weigh, 'u-press', refusal.flash(WEIGH))}
          disabled={!ready}
          onClick={weigh}
        >
          Weigh
        </button>
        <button
          type="button"
          className={`${s.name} u-press`}
          aria-pressed={naming}
          disabled={locked}
          onClick={toggleNaming}
        >
          <span className={s.box} aria-hidden="true">
            {naming && <TickMark className={s.tick} />}
          </span>
          Name the heavy one
        </button>
      </div>

      <p className={s.note}>{note}</p>
    </div>
  )
}
