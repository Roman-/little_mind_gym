import { useEffect, useRef } from 'react'
import { useSettings } from './settings'

/**
 * The four sounds this app makes, and the whole list. A cue is a fact about
 * what just happened — a finger landed, a piece went down, a rule said no, a
 * level is finished — and never decoration, exactly as a colour is a state and
 * never a mood.
 */
export type SoundCue = 'tap' | 'place' | 'wrong' | 'solve'

/** One knock of wood: when it is struck, what it rings at, how hard, and how long it rings. */
interface Strike {
  /** Seconds into the cue that it is struck. */
  at: number
  /** What it rings at, in hertz. */
  hz: number
  /** Seconds until it is gone. */
  decay: number
  /** How hard it is struck, 0 to 1. */
  gain: number
  /** How far the pitch falls over the note, as a fraction of `hz`. */
  bend?: number
}

/**
 * A struck wooden bar rings at these ratios, not at the whole-number harmonics
 * a string gives. That stretched second partial is the whole difference
 * between a woodblock and a beep, and the upper two dying away first is what
 * makes the note read as hit rather than as sung.
 */
const PARTIALS = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2.76, gain: 0.28, decay: 0.45 },
  { ratio: 5.4, gain: 0.08, decay: 0.22 },
]

/**
 * The whole vocabulary, as arithmetic rather than as files. Synthesising it
 * leaves nothing to fetch and nothing to decode, no second licence to carry
 * beside OpenMoji's, and a table anybody can retune in place of a folder of
 * samples nobody can. It is also what makes "cached in advance" true by
 * construction: a cue is a few thousand multiplications, done once at
 * start-up and read back for every play after that.
 */
const VOICES: Record<SoundCue, Strike[]> = {
  /** A fingertip on wood. Too short to have a pitch, quiet enough to hear a thousand times. */
  tap: [{ at: 0, hz: 1150, decay: 0.03, gain: 0.2 }],
  /** The piece going down: lower and rounder than the finger that carried it. */
  place: [{ at: 0, hz: 330, decay: 0.18, gain: 0.5 }],
  /** Two knocks, the second lower — a head shaken, in the length of one `.shake`. */
  wrong: [
    { at: 0, hz: 262, decay: 0.22, gain: 0.45, bend: 0.04 },
    { at: 0.11, hz: 220, decay: 0.34, gain: 0.5, bend: 0.06 },
  ],
  /** Three notes up an open chord, done inside the confetti. Pleased, not triumphant. */
  solve: [
    { at: 0, hz: 523.25, decay: 0.4, gain: 0.32 },
    { at: 0.1, hz: 784, decay: 0.45, gain: 0.3 },
    { at: 0.2, hz: 1046.5, decay: 0.7, gain: 0.3 },
  ],
}

/** Long enough that a buffer never opens on a step, short enough to still be a knock. */
const ATTACK = 0.002
/** The last of the buffer, taken down to nothing so it ends in silence. */
const RELEASE = 0.005
/** e^-6 is a quarter of a percent of the strike, so `decay` means "gone by". */
const SILENCE = 6

/** Everything this app is allowed to be, at once. Quiet is the point. */
const MASTER = 0.5

/** How close together one cue may be struck twice, in seconds. */
const RETRIGGER = 0.04

/** How far each play is detuned. A wooden box never makes the same knock twice. */
const WOBBLE = 0.06

/**
 * One cue, as sound. Pure: the same numbers out for the same numbers in, which
 * is what lets a test read the waveform without a browser anywhere near it.
 */
export function renderCue(cue: SoundCue, rate: number): Float32Array<ArrayBuffer> {
  const strikes = VOICES[cue]
  const seconds = Math.max(...strikes.map((strike) => strike.at + strike.decay))
  const samples = new Float32Array(Math.ceil(seconds * rate))

  for (const strike of strikes) {
    const from = Math.round(strike.at * rate)
    for (const partial of PARTIALS) {
      // Stepped rather than worked out from the sample number, so a falling
      // pitch stays continuous instead of folding back on itself.
      let phase = 0
      for (let i = from; i < samples.length; i++) {
        const t = (i - from) / rate
        const fallen = 1 - (strike.bend ?? 0) * Math.min(t / strike.decay, 1)
        phase += (2 * Math.PI * strike.hz * partial.ratio * fallen) / rate
        const level =
          Math.exp((-t * SILENCE) / (strike.decay * partial.decay)) * Math.min(1, t / ATTACK)
        samples[i] += Math.sin(phase) * level * partial.gain * strike.gain
      }
    }
  }

  const release = RELEASE * rate
  for (let i = 0; i < samples.length; i++) {
    const level = samples[i] * Math.min(1, (samples.length - i) / release)
    samples[i] = Math.max(-1, Math.min(1, level))
  }
  return samples
}

/**
 * There is one pair of speakers, so there is one engine, and it lives in the
 * module rather than in a context. Nothing renders from it and nothing waits
 * on it: a sound is something the app does, not something it is.
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
const clips = new Map<SoundCue, AudioBuffer>()
const struck = new Map<SoundCue, number>()
let on = true

/**
 * Build the context and render every cue into it. This is the "cached in
 * advance" the collection asks for: by the time a child touches anything, all
 * four buffers are sitting in memory, so the first sound costs exactly what
 * the thousandth does. It is a few thousand multiplications, so it runs at
 * start-up rather than being worked up to.
 */
export function prepareSounds(): void {
  if (ctx !== null || typeof AudioContext === 'undefined') return
  ctx = new AudioContext()
  master = ctx.createGain()
  master.gain.value = MASTER
  master.connect(ctx.destination)
  for (const cue of Object.keys(VOICES) as SoundCue[]) {
    const samples = renderCue(cue, ctx.sampleRate)
    const clip = ctx.createBuffer(1, samples.length, ctx.sampleRate)
    clip.copyToChannel(samples, 0)
    clips.set(cue, clip)
  }
}

/** Silence, or not. The setting is the only thing that decides this. */
export function setSoundOn(value: boolean): void {
  on = value
}

export function playSound(cue: SoundCue): void {
  if (!on) return
  prepareSounds()
  const clip = clips.get(cue)
  if (ctx === null || master === null || clip === undefined) return

  /**
   * A browser will not let a page make a noise nobody asked for, so a context
   * built while the page was loading comes up suspended and stays silent
   * however often it is played. The first tap is the gesture that lets it
   * start, and every cue we have is fired from a tap or from the move a tap
   * made, so asking here is asking inside the gesture.
   */
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      /* a browser that still will not start it leaves us silent, not broken */
    })
  }

  // A finger held on a lamp, or a tap that both lands a piece and breaks a
  // rule, would otherwise strike the same knock twice in a millisecond.
  const now = ctx.currentTime
  const last = struck.get(cue)
  if (last !== undefined && now - last < RETRIGGER) return
  struck.set(cue, now)

  const source = ctx.createBufferSource()
  source.buffer = clip
  source.playbackRate.value = 1 + (Math.random() - 0.5) * WOBBLE
  source.connect(master)
  source.start()
}

/**
 * Everything in the app a finger can land on. All of them are real buttons,
 * links, drawers and labels, so one listener at the root gives every one of
 * them its click and no board has to remember to make a sound.
 */
const CONTROLS = 'button:not(:disabled), a[href], summary, label'

/**
 * Wire the sounds to the app: the click under every control, and the setting
 * that silences the lot. Called once, from `App`.
 */
export function useSoundEffects(): void {
  const { settings } = useSettings()
  const was = useRef(settings.sound)

  useEffect(() => {
    setSoundOn(settings.sound)
    // Turning them back on answers with the sound it has just switched on, so
    // the switch says what it did rather than only what it is now. The first
    // run is the page opening, which is nobody's choice.
    if (settings.sound && !was.current) playSound('tap')
    was.current = settings.sound
  }, [settings.sound])

  useEffect(() => {
    prepareSounds()
    const pressed = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest(CONTROLS) !== null) playSound('tap')
    }
    // Enter and Space are how a control is pressed without a finger, and a
    // held key is one press rather than forty.
    const typed = (event: KeyboardEvent) => {
      if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) pressed(event)
    }
    window.addEventListener('pointerdown', pressed, true)
    window.addEventListener('keydown', typed, true)
    return () => {
      window.removeEventListener('pointerdown', pressed, true)
      window.removeEventListener('keydown', typed, true)
    }
  }, [])
}
