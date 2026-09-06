import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PUZZLES } from '../puzzles'

/**
 * The card pictures are nine separate drawings, and the only thing holding
 * them to one hand is `Scene`. These are the parts of that frame a puzzle can
 * quietly step outside of without anything looking broken until it is on the
 * page next to the other eight.
 */
describe('the picture on a puzzle card', () => {
  afterEach(cleanup)

  const scenes = PUZZLES.map((meta) => {
    const { container } = render(createElement(meta.Icon))
    const svg = container.querySelector('svg')!
    cleanup()
    return { id: meta.id, svg }
  })

  it('is drawn in the same 32-unit box for every puzzle', () => {
    for (const { id, svg } of scenes) {
      expect(`${id}: ${svg.getAttribute('viewBox')}`).toBe(`${id}: 0 0 32 32`)
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
    }
  })

  /**
   * A scene places its pictograms as nested svgs, and CSS and presentation
   * attributes both run downhill. Ink put on the frame would land on artwork
   * that arrived with its own colours.
   */
  it('sets nothing on the frame that would run into the artwork inside it', () => {
    for (const { id, svg } of scenes) {
      for (const attr of ['fill', 'stroke', 'stroke-width', 'color', 'opacity']) {
        expect(`${id}: ${attr}=${svg.getAttribute(attr)}`).toBe(`${id}: ${attr}=null`)
      }
    }
  })

  it('places every picture it uses, and keeps it inside the box', () => {
    for (const { id, svg } of scenes) {
      for (const art of svg.querySelectorAll('svg')) {
        const box = ['x', 'y', 'width', 'height'].map((a) => Number(art.getAttribute(a)))
        expect(`${id}: ${box.join()}`).not.toMatch(/NaN/)
        const [x, y, w, h] = box
        expect(`${id}: ${x},${y}`).toBe(`${id}: ${Math.max(x, 0)},${Math.max(y, 0)}`)
        expect(`${id}: ${x + w},${y + h}`).toBe(`${id}: ${Math.min(x + w, 32)},${Math.min(y + h, 32)}`)
      }
    }
  })
})
