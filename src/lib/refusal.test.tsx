import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRefusal } from './refusal'
import { underSettings } from '../test/settings'
import type { Settings } from './settings'

/**
 * jsdom loads no stylesheet, so the duration token is put on the root by hand.
 * A refusal lives for exactly one run of the cue, and no number in the hook is
 * allowed to disagree with the token.
 */
const DUR_4 = 480

/** A board of one word, refusing to become "no" and going back to what it was. */
function Probe({ word }: { word: string }) {
  const refusal = useRefusal(word)
  return (
    <div>
      <button
        type="button"
        className={[refusal.flash('it'), refusal.shake('it')].filter(Boolean).join(' ')}
        onClick={() =>
          refusal.refuse({
            pretend: refusal.offered ? 'no' : word,
            message: 'That is not a word.',
            where: 'it',
          })
        }
      >
        {refusal.shown}
      </button>
      <p role="status">{refusal.say('It is your turn.')}</p>
      <p data-busy={refusal.busy ? 'true' : 'false'} data-offered={String(refusal.offered)} />
    </div>
  )
}

const paint = (word: string, settings?: Partial<Settings>) =>
  render(<Probe word={word} />, { wrapper: underSettings(settings) })

const shown = () => screen.getByRole('button').textContent
const said = () => screen.getByRole('status').textContent
const flag = (name: string) =>
  document.querySelector(`[data-${name}]`)?.getAttribute(`data-${name}`)
const refuse = () => fireEvent.click(screen.getByRole('button'))
const runCue = () => act(() => vi.advanceTimersByTime(DUR_4))

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  document.documentElement.style.setProperty('--dur-4', `${DUR_4}ms`)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.documentElement.removeAttribute('style')
})

describe('useRefusal', () => {
  it('draws the refused position for one cue and then puts the board back', () => {
    paint('yes')
    expect(shown()).toBe('yes')

    refuse()
    expect(shown()).toBe('no')
    expect(flag('busy')).toBe('true')
    expect(screen.getByRole('button').className).toContain('flash')

    runCue()
    expect(shown()).toBe('yes')
    expect(flag('busy')).toBe('false')
    expect(screen.getByRole('button').className).not.toContain('flash')
  })

  it('leaves the sentence standing after the cue, and drops it on the next move', () => {
    const view = paint('yes')
    refuse()
    expect(said()).toBe('That is not a word. It is your turn.')
    // Reduced motion collapses the cue to a millisecond, so the sentence is
    // all that is left of it. It stands until the board is handed a new state.
    runCue()
    expect(said()).toBe('That is not a word. It is your turn.')

    view.rerender(<Probe word="maybe" />)
    expect(said()).toBe('It is your turn.')
  })

  it('drops a refusal the moment the board is rewound out from under it', () => {
    const view = paint('yes')
    refuse()
    expect(shown()).toBe('no')
    // The move tape can be tapped mid-cue. A pretend position drawn over some
    // other state would be a lie, so it goes with the state it belonged to.
    view.rerender(<Probe word="maybe" />)
    expect(shown()).toBe('maybe')
    expect(flag('busy')).toBe('false')
  })

  it('shakes only what could not even pretend to move', () => {
    paint('yes')
    refuse()
    const cues = screen.getByRole('button').className
    expect(cues).toContain('flash')
    expect(cues).not.toContain('shake')
    cleanup()

    // The same refusal, with the position unchanged: now it shakes as well.
    paint('yes', { allowForbiddenMoves: false })
    refuse()
    expect(screen.getByRole('button').className).toContain('shake')
  })

  it('reads the setting, so a board can refuse the move up front instead', () => {
    paint('yes')
    expect(flag('offered')).toBe('true')
    cleanup()
    paint('yes', { allowForbiddenMoves: false })
    expect(flag('offered')).toBe('false')
  })
})
