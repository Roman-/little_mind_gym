import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { DEFAULTS, SettingsProvider, settingsFrom, useSettings } from './settings'

const stored = (settings: unknown, version: unknown = 1) =>
  JSON.stringify({ version, settings })

const open = () => renderHook(() => useSettings(), { wrapper: SettingsProvider })

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('the stored settings', () => {
  it('starts every setting where the collection wants it', () => {
    expect(DEFAULTS).toEqual({
      allowForbiddenMoves: true,
      showMoves: false,
      sound: true,
    })
  })

  it('falls back to the defaults when there is nothing to read', () => {
    expect(settingsFrom(null)).toEqual(DEFAULTS)
    expect(settingsFrom('')).toEqual(DEFAULTS)
  })

  it('falls back to the defaults on a value it cannot use', () => {
    expect(settingsFrom('{ half a fi')).toEqual(DEFAULTS)
    expect(settingsFrom('null')).toEqual(DEFAULTS)
    expect(settingsFrom('"a string"')).toEqual(DEFAULTS)
    expect(settingsFrom(stored({ sound: false }, 2))).toEqual(DEFAULTS)
    expect(settingsFrom(stored(null))).toEqual(DEFAULTS)
  })

  it('reads back the settings it was given', () => {
    expect(settingsFrom(stored({ allowForbiddenMoves: false, showMoves: true, sound: false })))
      .toEqual({ allowForbiddenMoves: false, showMoves: true, sound: false })
  })

  it('defaults a setting that is missing or is not a true or false', () => {
    // A key an older build never wrote, and one somebody edited by hand. Both
    // have to land on the default: reading them as false turns a setting off.
    expect(settingsFrom(stored({ showMoves: true }))).toEqual({
      ...DEFAULTS,
      showMoves: true,
    })
    expect(settingsFrom(stored({ sound: 'yes', showMoves: 1 }))).toEqual(DEFAULTS)
  })

  it('ignores a key it does not know about', () => {
    expect(settingsFrom(stored({ sound: false, hovercraft: true }))).toEqual({
      ...DEFAULTS,
      sound: false,
    })
  })
})

describe('the settings store', () => {
  it('hands out the defaults on a first visit', () => {
    expect(open().result.current.settings).toEqual(DEFAULTS)
  })

  it('remembers a change for the next visit', () => {
    const first = open()
    act(() => first.result.current.set('showMoves', true))
    expect(first.result.current.settings.showMoves).toBe(true)
    first.unmount()

    expect(open().result.current.settings).toEqual({ ...DEFAULTS, showMoves: true })
  })

  it('opens on the defaults when the stored value is corrupt', () => {
    localStorage.setItem('little-mind-gym:settings:v1', 'not json at all')
    expect(open().result.current.settings).toEqual(DEFAULTS)
  })

  it('hands back the same settings when a set changes nothing', () => {
    const { result } = open()
    const before = result.current.settings
    act(() => result.current.set('sound', true))
    expect(result.current.settings).toBe(before)
  })
})
