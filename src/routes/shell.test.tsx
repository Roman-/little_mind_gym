import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import { ProgressProvider } from '../lib/progress'
import { SettingsProvider } from '../lib/settings'
import { PUZZLES } from '../puzzles'

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

const click = (name: RegExp | string) =>
  fireEvent.click(screen.getByRole('button', { name }))

/** The seven crossings, as a child would tap them. */
function solveTheRiver() {
  click(/put the goat in the boat/i)
  click(/row across/i)
  click(/row back/i)
  click(/put the wolf in the boat/i)
  click(/row across/i)
  click(/put the goat in the boat/i)
  click(/row back/i)
  click(/put the cabbage in the boat/i)
  click(/row across/i)
  click(/row back/i)
  click(/put the goat in the boat/i)
  click(/row across/i)
}

/** Play the same taps as a reader who has asked the system to keep motion down. */
function withReducedMotion(run: () => void) {
  const real = window.matchMedia
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
  try {
    run()
  } finally {
    window.matchMedia = real
  }
}

const confetti = (view: { container: HTMLElement }) =>
  view.container.querySelector('[class*="confetti"]')

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('the collection page', () => {
  it('lists every puzzle with its status', () => {
    open('/')
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(PUZZLES.length)
    for (const puzzle of PUZZLES) {
      expect(screen.getByText(puzzle.title)).toBeInTheDocument()
    }
    // A row carries a status word only once it has one to carry. Eight rows
    // stamped "Not tried" is eight repetitions of nothing.
    expect(screen.queryByText('Not tried')).not.toBeInTheDocument()
  })

  it('sends an unknown puzzle to the not-found page', () => {
    open('/puzzle/nonsense')
    expect(screen.getByText(/not here/i)).toBeInTheDocument()
    // The header only swaps the wordmark for "All puzzles" on a puzzle that
    // exists, so this page keeps its identity and offers exactly one way out.
    expect(screen.getAllByRole('link', { name: /all puzzles/i })).toHaveLength(1)
    expect(screen.getByText('Little Mind Gym')).toBeInTheDocument()
  })
})

describe('playing a puzzle', () => {
  it('offers the way back to the collection from the header', () => {
    open('/puzzle/river-crossing')
    expect(screen.getByRole('link', { name: /all puzzles/i })).toBeInTheDocument()
    expect(screen.queryByText('Little Mind Gym')).not.toBeInTheDocument()
  })

  it('stamps the level solved and remembers it', () => {
    const view = open('/puzzle/river-crossing')
    solveTheRiver()
    expect(screen.getByText('Solved')).toBeInTheDocument()
    expect(screen.getByText(/^7 moves/)).toBeInTheDocument()
    view.unmount()

    open('/')
    expect(screen.getByText('Solved')).toBeInTheDocument()
  })

  it('shows the dead end and steps back out of it', () => {
    open('/puzzle/river-crossing')
    click(/put the wolf in the boat/i)
    click(/row across/i)
    expect(screen.getByText('The goat ate the cabbage.')).toBeInTheDocument()

    // The notice owns the recovery while it is up, so there is exactly one Step back.
    expect(screen.getAllByRole('button', { name: /^step back$/i })).toHaveLength(1)
    click(/^step back$/i)
    expect(screen.queryByText('The goat ate the cabbage.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /row across/i })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: /^start over$/i })).toHaveLength(1)
  })

  it('never shows the same action twice at once', () => {
    open('/puzzle/river-crossing')
    solveTheRiver()
    expect(screen.getByText('Solved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^start over$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^step back$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('rewinds to any earlier move through the tape', () => {
    open('/puzzle/river-crossing')
    click(/put the goat in the boat/i)
    click(/row across/i)
    click(/row back/i)
    const tape = screen.getByRole('group', { name: /move history/i })
    expect(within(tape).getAllByRole('button')).toHaveLength(3) // start + two moves

    fireEvent.click(within(tape).getByRole('button', { name: /go back to the start/i }))
    expect(within(tape).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^row across\b/i })).toBeInTheDocument()
  })

  it('hands out hints one at a time', () => {
    open('/puzzle/river-crossing')
    click(/give me a nudge/i)
    expect(screen.getByText('Hint 1')).toBeInTheDocument()
    expect(screen.queryByText('Hint 2')).not.toBeInTheDocument()
    click(/one more nudge/i)
    expect(screen.getByText('Hint 2')).toBeInTheDocument()
  })
})

describe('solving a level', () => {
  // jsdom loads no stylesheet, so --dur-5 reads as nothing and the burst is
  // over on the next tick. What matters here is that it ends by itself.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('throws a handful of paper, once', () => {
    const view = open('/puzzle/river-crossing')
    expect(confetti(view)).toBeNull()

    solveTheRiver()
    const paper = confetti(view)
    expect(paper).not.toBeNull()
    // Decoration and nothing else: nothing to read, nothing to tab to, and
    // nothing that could swallow a tap meant for the board.
    expect(paper).toHaveAttribute('aria-hidden', 'true')
    expect(paper?.textContent).toBe('')
    expect(paper?.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)

    // It falls once. A solved level re-renders every time a hint is opened or
    // the tape is drawn, and none of those throw the paper again.
    act(() => vi.advanceTimersByTime(1))
    expect(confetti(view)).toBeNull()
    click(/give me a nudge/i)
    expect(screen.getByText('Hint 1')).toBeInTheDocument()
    expect(confetti(view)).toBeNull()
  })

  it('throws none of it at a reader who has asked for less motion', () => {
    withReducedMotion(() => {
      const view = open('/puzzle/river-crossing')
      solveTheRiver()
      expect(screen.getByText('Solved')).toBeInTheDocument()
      expect(confetti(view)).toBeNull()
    })
  })
})

describe('the random route', () => {
  it('opens a puzzle from the collection', () => {
    open('/random')
    expect(screen.getByText(/picking one for you/i)).toBeInTheDocument()
    click(/take me there now/i)
    const titles = PUZZLES.map((p) => p.title)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(titles).toContain(heading.textContent)
  })

  it('opens one straight away at the unlisted instant route', () => {
    open('/random_instantly')
    expect(screen.queryByText(/picking one for you/i)).not.toBeInTheDocument()
    const titles = PUZZLES.map((p) => p.title)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(titles).toContain(heading.textContent)
  })

  it('keeps the instant route out of the UI', () => {
    open('/')
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
    expect(hrefs.some((h) => h.includes('random_instantly'))).toBe(false)
  })
})

describe('the settings page', () => {
  const checkbox = (name: string) => screen.getByRole('checkbox', { name })

  it('opens from the navbar, with every setting where it starts out', () => {
    open('/')
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(checkbox('Allow moves that break a rule')).toBeChecked()
    expect(checkbox('Show the move count')).not.toBeChecked()
    expect(checkbox('Play sounds')).toBeChecked()
  })

  it('keeps a change after the page has been left and opened again', () => {
    const view = open('/settings')
    fireEvent.click(checkbox('Show the move count'))
    fireEvent.click(checkbox('Play sounds'))
    view.unmount()

    open('/settings')
    expect(checkbox('Show the move count')).toBeChecked()
    expect(checkbox('Play sounds')).not.toBeChecked()
    expect(checkbox('Allow moves that break a rule')).toBeChecked()
  })
})
