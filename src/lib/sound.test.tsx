import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { underSettings } from '../test/settings'
import { useSettings } from './settings'
import { playSound, prepareSounds, renderCue, setSoundOn, useSoundEffects } from './sound'
import type { SoundCue } from './sound'

const RATE = 48000
const CUES: SoundCue[] = ['tap', 'place', 'wrong', 'solve']

/**
 * jsdom has no Web Audio, so this is the speaker: just enough of a context to
 * see what was rendered up front, what was played, and when.
 */
const audio = {
  ctx: null as FakeContext | null,
  /** Every buffer the engine has ever built. There should only ever be four. */
  rendered: [] as FakeBuffer[],
  /** What has been played since this test started. */
  played: [] as FakeSource[],
}

class FakeBuffer {
  readonly data: Float32Array
  constructor(length: number) {
    this.data = new Float32Array(length)
  }
  copyToChannel(source: Float32Array) {
    this.data.set(source)
  }
}

class FakeSource {
  buffer: FakeBuffer | null = null
  playbackRate = { value: 1 }
  connect() {}
  start() {
    audio.played.push(this)
  }
}

class FakeContext {
  state = 'suspended'
  sampleRate = RATE
  currentTime = 0
  destination = {}
  constructor() {
    audio.ctx = this
  }
  createGain() {
    return { gain: { value: 0 }, connect: () => {} }
  }
  createBuffer(_channels: number, length: number) {
    const clip = new FakeBuffer(length)
    audio.rendered.push(clip)
    return clip
  }
  createBufferSource() {
    return new FakeSource()
  }
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
}

vi.stubGlobal('AudioContext', FakeContext)

const peak = (cue: SoundCue) => {
  let loudest = 0
  for (const sample of renderCue(cue, RATE)) loudest = Math.max(loudest, Math.abs(sample))
  return loudest
}

/** Far enough on that the engine's guard against a double strike is not in the way. */
const later = () => {
  if (audio.ctx !== null) audio.ctx.currentTime += 1
}

beforeEach(() => {
  localStorage.clear()
  // The engine builds its context once and keeps it, so every test plays
  // through the same speaker, wound back to where a page load leaves it.
  prepareSounds()
  audio.played.length = 0
  later()
  if (audio.ctx !== null) audio.ctx.state = 'suspended'
  setSoundOn(true)
})

afterEach(cleanup)

describe('a cue, as sound', () => {
  it('opens and closes in silence, so a buffer never ends on a click', () => {
    for (const cue of CUES) {
      const wave = renderCue(cue, RATE)
      expect(wave[0]).toBe(0)
      expect(Math.abs(wave[wave.length - 1])).toBeLessThan(0.001)
    }
  })

  it('stays inside what a speaker can play, and is never silence', () => {
    for (const cue of CUES) {
      expect(renderCue(cue, RATE).every((s) => Number.isFinite(s) && s >= -1 && s <= 1)).toBe(true)
      expect(peak(cue)).toBeGreaterThan(0.1)
    }
  })

  it('keeps the tap the quietest and the shortest of the four', () => {
    expect(peak('tap')).toBeLessThan(peak('place'))
    expect(renderCue('tap', RATE).length).toBeLessThan(renderCue('place', RATE).length)
    expect(renderCue('solve', RATE).length).toBeGreaterThan(renderCue('wrong', RATE).length)
  })

  it('is the same sound however often it is asked for', () => {
    expect(renderCue('place', RATE)).toEqual(renderCue('place', RATE))
  })

  it('follows the rate it is rendered at', () => {
    expect(renderCue('place', RATE / 2).length).toBe(renderCue('place', RATE).length / 2)
  })
})

describe('the engine', () => {
  it('renders every cue up front, before a finger has touched anything', () => {
    expect(audio.rendered).toHaveLength(CUES.length)
    expect(audio.played).toHaveLength(0)
    // And what it cached is what the renderer makes, cue for cue.
    for (const [i, cue] of CUES.entries()) {
      expect(audio.rendered[i].data).toEqual(renderCue(cue, RATE))
    }
  })

  it('plays the buffer it already has, and builds nothing new', () => {
    playSound('place')
    expect(audio.played).toHaveLength(1)
    expect(audio.played[0].buffer).toBe(audio.rendered[CUES.indexOf('place')])
    expect(audio.rendered).toHaveLength(CUES.length)
  })

  it('starts the context on the first sound, which is the gesture browsers wait for', () => {
    expect(audio.ctx?.state).toBe('suspended')
    playSound('tap')
    expect(audio.ctx?.state).toBe('running')
  })

  it('says nothing at all while the sound is off', () => {
    setSoundOn(false)
    for (const cue of CUES) playSound(cue)
    expect(audio.played).toHaveLength(0)

    setSoundOn(true)
    playSound('tap')
    expect(audio.played).toHaveLength(1)
  })

  it('will not strike the same cue twice in the same instant', () => {
    playSound('wrong')
    playSound('wrong')
    expect(audio.played).toHaveLength(1)

    // Another cue in that instant is another thing happening, and is played.
    playSound('place')
    expect(audio.played).toHaveLength(2)

    later()
    playSound('wrong')
    expect(audio.played).toHaveLength(3)
  })

  it('detunes each play, so a run of taps is not one tap repeated', () => {
    const rates = new Set<number>()
    for (let i = 0; i < 8; i++) {
      later()
      playSound('tap')
    }
    for (const source of audio.played) {
      expect(source.playbackRate.value).toBeGreaterThan(0.96)
      expect(source.playbackRate.value).toBeLessThan(1.04)
      rates.add(source.playbackRate.value)
    }
    expect(rates.size).toBeGreaterThan(1)
  })
})

/** A page with something to press and the switch that silences it, as the app has. */
function Probe() {
  useSoundEffects()
  const { settings, set } = useSettings()
  return (
    <>
      <button type="button">A piece</button>
      <button type="button" disabled>
        A dead control
      </button>
      <button type="button" onClick={() => set('sound', !settings.sound)}>
        {settings.sound ? 'Turn the sounds off' : 'Turn the sounds on'}
      </button>
    </>
  )
}

const press = (name: string) => fireEvent.pointerDown(screen.getByRole('button', { name }))

describe('the sounds under the app', () => {
  it('clicks under a control, and nowhere else', () => {
    render(<Probe />, { wrapper: underSettings() })
    press('A piece')
    expect(audio.played).toHaveLength(1)

    later()
    fireEvent.pointerDown(document.body)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'A dead control' }))
    expect(audio.played).toHaveLength(1)
  })

  it('counts Enter and Space as a press, and a held key as one press', () => {
    render(<Probe />, { wrapper: underSettings() })
    const piece = screen.getByRole('button', { name: 'A piece' })

    fireEvent.keyDown(piece, { key: 'Tab' })
    expect(audio.played).toHaveLength(0)

    fireEvent.keyDown(piece, { key: 'Enter' })
    expect(audio.played).toHaveLength(1)

    later()
    fireEvent.keyDown(piece, { key: ' ', repeat: true })
    expect(audio.played).toHaveLength(1)
  })

  it('is silent while the setting is off, and answers the switch that turns it back on', () => {
    render(<Probe />, { wrapper: underSettings({ sound: false }) })
    press('A piece')
    expect(audio.played).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Turn the sounds on' }))
    expect(audio.played).toHaveLength(1)

    later()
    press('A piece')
    expect(audio.played).toHaveLength(2)

    // Off again, and it goes quiet without a parting sound of its own.
    later()
    fireEvent.click(screen.getByRole('button', { name: 'Turn the sounds off' }))
    expect(audio.played).toHaveLength(2)
    later()
    press('A piece')
    expect(audio.played).toHaveLength(2)
  })
})
