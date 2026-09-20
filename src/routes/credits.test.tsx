import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import { ProgressProvider } from '../lib/progress'
import { SettingsProvider } from '../lib/settings'
import { PUZZLES } from '../puzzles'
import { ORIGINS } from '../puzzles/origins'

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProgressProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </ProgressProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('the credits page', () => {
  it('credits every puzzle in the collection, and nothing that has left it', () => {
    // The licence on the pictures asks for a credit by name, and the puzzles
    // are somebody else's work whether or not a licence says so. A puzzle
    // added without a line here would ship uncredited, and a line left behind
    // by a puzzle that has gone would credit something nobody can play.
    expect(Object.keys(ORIGINS).sort()).toEqual(PUZZLES.map((p) => p.id).sort())
    for (const line of Object.values(ORIGINS)) {
      expect(line.trim().length).toBeGreaterThan(20)
    }
  })

  it('names each puzzle, and links the name back to the puzzle', () => {
    open('/credits')
    expect(screen.getByRole('heading', { level: 1, name: 'Credits' })).toBeInTheDocument()
    for (const puzzle of PUZZLES) {
      expect(screen.getByRole('link', { name: puzzle.title })).toHaveAttribute(
        'href',
        `/puzzle/${puzzle.id}`,
      )
      expect(screen.getByText(ORIGINS[puzzle.id])).toBeInTheDocument()
    }
  })

  it('says who the pictures, the type and the tools belong to', () => {
    open('/credits')
    const link = (name: RegExp) => screen.getByRole('link', { name })
    expect(link(/^OpenMoji$/)).toHaveAttribute('href', 'https://openmoji.org')
    expect(link(/CC BY-SA 4.0/)).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    )
    expect(screen.getByText(/Mathieu Triay/)).toBeInTheDocument()
    expect(screen.getByText(/Bold Monday/)).toBeInTheDocument()
    expect(link(/^React$/)).toBeInTheDocument()
    // Every outward link opens away from the puzzle a child may have open.
    for (const out of screen.getAllByRole('link')) {
      const href = out.getAttribute('href') ?? ''
      if (!href.startsWith('http')) continue
      expect(out).toHaveAttribute('target', '_blank')
      expect(out).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })
})

describe('the footer', () => {
  const footer = () => screen.getByRole('contentinfo')

  it('says where the site lives and points at the credits', () => {
    open('/')
    expect(within(footer()).getByRole('link', { name: 'bestsiteever.net' })).toHaveAttribute(
      'href',
      'https://bestsiteever.net',
    )
    expect(within(footer()).getByRole('link', { name: 'Credits' })).toHaveAttribute(
      'href',
      '/credits',
    )
  })

  it('leaves the licence wording to the page that has room for it', () => {
    open('/')
    // The footer used to carry the OpenMoji credit itself, on every page.
    expect(within(footer()).queryByText(/openmoji/i)).not.toBeInTheDocument()
    expect(within(footer()).queryByText(/CC BY-SA/i)).not.toBeInTheDocument()
  })
})

describe('the front page', () => {
  it('says the one thing it has to say, once', () => {
    open('/')
    // Two headings said the same thing as the line under them: the display
    // headline, and a heading over a page of puzzles that named what it was.
    expect(screen.queryByText('Puzzles you can work out.')).not.toBeInTheDocument()
    expect(screen.queryByText('Pick a puzzle')).not.toBeInTheDocument()
    expect(
      screen.getByText('You can work every one out by thinking. None of them need quick fingers.'),
    ).toBeInTheDocument()
    // The page keeps a heading for a reader who never sees the wordmark.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Little Mind Gym')
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })
})
