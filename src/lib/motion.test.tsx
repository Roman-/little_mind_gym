import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { useCue } from './motion'
import type { CueLength } from './motion'

/**
 * jsdom loads no stylesheet, so the duration tokens are put on the root by
 * hand here. That is the whole point of these tests: a cue lives for exactly
 * as long as its token says, and no number in the hook can disagree.
 */
const DUR_4 = 480
const DUR_5 = 900

function Probe({ length }: { length?: CueLength }) {
  const fired = useRef(0)
  const [cue, fire] = useCue<string>(length)
  return (
    <button type="button" onClick={() => fire(`cue ${(fired.current += 1)}`)}>
      {cue ?? 'idle'}
    </button>
  )
}

const showing = () => screen.getByRole('button').textContent
const fire = () => fireEvent.click(screen.getByRole('button'))
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  document.documentElement.style.setProperty('--dur-4', `${DUR_4}ms`)
  document.documentElement.style.setProperty('--dur-5', `${DUR_5}ms`)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.documentElement.removeAttribute('style')
})

describe('useCue', () => {
  it('holds what was fired for the length of the token, then clears itself', () => {
    render(<Probe />)
    expect(showing()).toBe('idle')

    fire()
    expect(showing()).toBe('cue 1')
    wait(DUR_4 - 1)
    expect(showing()).toBe('cue 1')
    wait(1)
    expect(showing()).toBe('idle')
  })

  it('runs for the token it was handed', () => {
    render(<Probe length="--dur-5" />)
    fire()
    wait(DUR_4)
    expect(showing()).toBe('cue 1')
    wait(DUR_5 - DUR_4)
    expect(showing()).toBe('idle')
  })

  it('drops the cue for one frame so a second one restarts the animation', () => {
    render(<Probe />)
    fire()
    wait(DUR_4 / 2)

    // A CSS animation only starts when it is newly applied, so the gap is what
    // makes a child's second wrong tap in a row look like an answer.
    fire()
    expect(showing()).toBe('idle')
    act(() => vi.advanceTimersToNextFrame())
    expect(showing()).toBe('cue 2')

    // And the second cue gets a full run of its own, not what was left of the first.
    wait(DUR_4 - 1)
    expect(showing()).toBe('cue 2')
    wait(1)
    expect(showing()).toBe('idle')
  })

  it('leaves no timer behind when the board goes away mid-cue', () => {
    const view = render(<Probe />)
    fire()
    view.unmount()
    expect(() => wait(DUR_4 * 2)).not.toThrow()
  })
})
