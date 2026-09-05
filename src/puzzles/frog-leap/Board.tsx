import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Pictogram } from '../../components/Pictogram'
import type { BoardProps } from '../../lib/types'
import type { FrogAction, FrogState, Seat } from './logic'
import { colourOf, hopTarget } from './logic'
import { EndArrow } from './glyphs'
import s from './board.module.css'

interface Frog {
  /** Stable while the row is this length, so the hop can be animated. */
  key: string
  pos: number
  dir: 1 | -1
}

/**
 * A frog only ever passes a frog of the other colour, so the frogs of one
 * colour keep their left-to-right order for the whole puzzle. Numbering each
 * colour from the left therefore gives every frog an identity that is a pure
 * function of the state — which is what lets one hop animate as one frog
 * travelling, and a rewind play it backwards.
 *
 * They come back in that identity order — every green, then every blue — and
 * not in row order, which a jump changes by definition. React answers a
 * reordered list by lifting the node that moved out of the document and
 * putting it straight back, and a node that has left the document has no
 * transform to travel from. The frog is standing on its landing stone before
 * the arc over the frog it cleared has begun, and the browser has dropped the
 * focus that node was holding. Identity order cannot change, so no node is
 * ever lifted.
 *
 * The cost is that Tab visits the greens and then the blues rather than
 * crossing the row from left to right. Every frog says which stone it is
 * standing on, and it keeps its place in that order for the whole level.
 */
function frogsByColour(seats: Seat[]): Frog[] {
  const teams = { green: [] as Frog[], blue: [] as Frog[] }
  seats.forEach((seat, pos) => {
    if (seat === 0) return
    const colour = colourOf(seat)
    const team = teams[colour]
    team.push({ key: `${seats.length}-${colour}-${team.length}`, pos, dir: seat })
  })
  return [...teams.green, ...teams.blue]
}

/**
 * How long a hop lasts, read from the same token the sideways travel uses. A
 * child with "reduce motion" set gets --dur-3 collapsed to 1ms, and the guard
 * below turns the leap off rather than flickering it.
 */
function hopMillis(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-3').trim()
  const ms = raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000
  return Number.isFinite(ms) ? ms : 0
}

/**
 * The leap itself. The sideways half is a CSS transition on the slot; this is
 * the vertical half, and the two together are what makes a jump look like a
 * jump instead of a slide.
 *
 * Height follows 4·t·(1−t), the parabola a thrown thing actually traces, so
 * the frog is highest exactly over the frog it is clearing. A jump goes
 * roughly twice as high as a step, because it covers twice the ground.
 */
function leap(slot: HTMLElement, art: HTMLElement, stones: number, ms: number) {
  if (typeof art.animate !== 'function') return
  const peak = stones > 1 ? 78 : 34
  const frames = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1].map((t) => {
    const h = 4 * t * (1 - t)
    return {
      offset: t,
      transform: `translateY(${-(peak * h).toFixed(2)}%) scale(${(1 + 0.07 * h).toFixed(3)})`,
    }
  })
  // Over the top of the frog being cleared, not through it.
  slot.style.zIndex = '3'
  const run = art.animate(frames, { duration: ms, easing: 'linear' })
  run.finished.then(
    () => {
      slot.style.zIndex = ''
    },
    () => {
      slot.style.zIndex = ''
    },
  )
}

function moveLabel(state: FrogState, frog: Frog): string {
  const colour = colourOf(frog.dir)
  const here = `${colour === 'green' ? 'Green' : 'Blue'} frog on stone ${frog.pos + 1}`
  const to = hopTarget(state, frog.pos)
  if (to < 0) return `${here}, blocked`
  if (Math.abs(to - frog.pos) === 1) return `${here}, step it to stone ${to + 1}`
  const cleared = state.seats[frog.pos + frog.dir]
  return `${here}, jump it over the ${colourOf(cleared === 1 ? 1 : -1)} frog to stone ${to + 1}`
}

/** The row read out loud, for anyone who cannot see where the frogs are. */
function rowSummary(seats: Seat[]): string {
  const words = seats.map((seat) => (seat === 0 ? 'the free stone' : `a ${colourOf(seat)} frog`))
  return `Left to right: ${words.join(', ')}.`
}

export function Board({ state, dispatch, locked }: BoardProps<FrogState, FrogAction>) {
  const { seats } = state
  const frogs = frogsByColour(seats)

  const slots = useRef(new Map<string, HTMLDivElement>())
  const wasAt = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const ms = hopMillis()
    const live = new Set<string>()
    for (const frog of frogs) {
      live.add(frog.key)
      const before = wasAt.current.get(frog.key)
      wasAt.current.set(frog.key, frog.pos)
      if (before === undefined || before === frog.pos || ms < 20) continue
      const slot = slots.current.get(frog.key)
      const art = slot?.querySelector<HTMLElement>('[data-hop]')
      if (slot && art) leap(slot, art, Math.abs(frog.pos - before), ms)
    }
    // A new level swaps the whole row; forget the frogs that are gone.
    for (const key of [...wasAt.current.keys()]) if (!live.has(key)) wasAt.current.delete(key)
  })

  return (
    <div className={s.stage} style={{ '--seats': seats.length } as CSSProperties}>
      <p className="u-sr" role="status">
        {rowSummary(seats)}
      </p>

      <div className={s.stream}>
        <div className={s.row}>
          <div className={s.ledge} aria-hidden="true" />
          <div className={s.stones} aria-hidden="true">
            {seats.map((seat, i) => (
              <span key={i} className={s.stone} data-free={seat === 0 ? 'true' : undefined} />
            ))}
          </div>
          <div className={s.frogs}>
            {frogs.map((frog) => {
              const canHop = !locked && hopTarget(state, frog.pos) >= 0
              const colour = colourOf(frog.dir)
              return (
                <div
                  key={frog.key}
                  className={s.slot}
                  style={{ '--pos': frog.pos } as CSSProperties}
                  ref={(el) => {
                    if (el) slots.current.set(frog.key, el)
                    else slots.current.delete(frog.key)
                  }}
                >
                  <button
                    type="button"
                    className={`${s.frog} u-press`}
                    data-colour={colour}
                    disabled={!canHop}
                    aria-label={moveLabel(state, frog)}
                    onClick={() => {
                      if (locked) return
                      dispatch({ type: 'hop', from: frog.pos })
                    }}
                  >
                    <span className={s.hop} data-hop="">
                      <Pictogram name="frog" className={s.art} />
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className={s.ends}>
        <span className={`u-label ${s.end}`}>
          <EndArrow />
          <Pictogram name="frog" className={`${s.endFrog} ${s.endBlue}`} />
          Blue frogs end up here
        </span>
        <span className={`u-label ${s.end}`}>
          Green frogs end up here
          <Pictogram name="frog" className={s.endFrog} />
          <EndArrow className={s.flip} />
        </span>
      </div>
    </div>
  )
}
