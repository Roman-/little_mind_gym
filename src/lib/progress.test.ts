import { describe, expect, it } from 'vitest'
import { STATUS_LABEL, statusOf } from './progress'
import type { PuzzleRecord } from './progress'
import type { PuzzleMeta } from './types'

const meta = {
  levels: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
} as PuzzleMeta

const record = (over: Partial<PuzzleRecord> = {}): PuzzleRecord => ({
  tried: false,
  solved: [],
  best: {},
  lastPlayedAt: null,
  ...over,
})

describe('progress status', () => {
  it('is new when the puzzle has never been opened', () => {
    expect(statusOf(undefined, meta)).toBe('new')
    expect(statusOf(record(), meta)).toBe('new')
  })

  it('is tried once a move has been made but nothing finished', () => {
    expect(statusOf(record({ tried: true }), meta)).toBe('tried')
  })

  it('is solved with at least one level done, and complete with all of them', () => {
    expect(statusOf(record({ tried: true, solved: ['a'] }), meta)).toBe('solved')
    expect(statusOf(record({ tried: true, solved: ['a', 'b'] }), meta)).toBe('solved')
    expect(statusOf(record({ tried: true, solved: ['a', 'b', 'c'] }), meta)).toBe('complete')
  })

  it('counts a solved level even if the tried flag never got written', () => {
    expect(statusOf(record({ solved: ['a'] }), meta)).toBe('solved')
  })

  it('has a label for every status', () => {
    expect(Object.keys(STATUS_LABEL)).toEqual(['new', 'tried', 'solved', 'complete'])
  })
})
