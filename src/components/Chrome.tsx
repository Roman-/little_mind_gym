import { useEffect, useState } from 'react'
import { Link, useMatch } from 'react-router-dom'
import { useProgress } from '../lib/progress'
import { puzzleById } from '../puzzles'
import { useSettings } from '../lib/settings'
import { useImmersion } from '../lib/immersion'
import { useTheme } from '../lib/theme'
import { Button, ButtonLink } from './kit'
import {
  BackIcon,
  BrandMark,
  ContrastIcon,
  ExpandIcon,
  SettingsIcon,
  SoundOffIcon,
  SoundOnIcon,
} from './icons'
import s from './Chrome.module.css'

export function Header() {
  const [theme, toggle] = useTheme()
  // The same switch the settings page draws, not a second one beside it: a
  // child who wants the room quiet should not have to find the page.
  const { settings, set } = useSettings()
  // Only a puzzle that actually exists has a #board to skip to and a collection
  // to go back to. /puzzle/<unknown> renders NotFound, which carries its own way out.
  const onPuzzle = puzzleById(useMatch('/puzzle/:id')?.params.id) !== undefined
  const { immersed, enter, leave } = useImmersion()

  // Immersion belongs to a puzzle. Following "Another puzzle" or "All puzzles"
  // out of one hands the screen back, rather than dropping a child on the
  // collection with no navbar to leave it by.
  useEffect(() => {
    if (immersed && !onPuzzle) leave()
  }, [immersed, onPuzzle, leave])

  // The whole point of the mode: the board keeps the room this row was using.
  if (immersed) return null

  return (
    <header className={s.header}>
      {onPuzzle && (
        <a href="#board" className={s.skip}>
          Skip to the puzzle
        </a>
      )}
      <div className={s.inner}>
        {/* On a puzzle page the way out replaces the wordmark: both pointed
            home, and a child who wants out should not hunt for a small link. */}
        {onPuzzle ? (
          <ButtonLink to="/" size="sm">
            <BackIcon />
            All puzzles
          </ButtonLink>
        ) : (
          <Link to="/" className={s.brand}>
            <BrandMark />
            <span className={s.brandWord}>Little Mind Gym</span>
          </Link>
        )}
        <nav className={s.nav}>
          {onPuzzle && (
            <Button size="sm" onClick={enter}>
              <ExpandIcon />
              <span className={s.navWord}>Immerse</span>
            </Button>
          )}
          <ButtonLink to="/settings" size="sm" className={s.iconBtn} aria-label="Settings">
            <SettingsIcon />
          </ButtonLink>
          <Button
            size="sm"
            className={s.iconBtn}
            onClick={() => set('sound', !settings.sound)}
            aria-label={settings.sound ? 'Turn the sounds off' : 'Turn the sounds on'}
          >
            {settings.sound ? <SoundOnIcon /> : <SoundOffIcon />}
          </Button>
          <Button
            size="sm"
            className={s.iconBtn}
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light colours' : 'Switch to dark colours'}
          >
            <ContrastIcon />
          </Button>
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  const { clearAll, progress } = useProgress()
  const [armed, setArmed] = useState(false)
  const anything = Object.keys(progress).length > 0

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <footer className={s.footer}>
      <div className={s.footInner}>
        {/* The pictures are somebody else's work and the licence asks us to say
            so, so the credit is here on every page rather than buried. */}
        <p className={s.credit}>
          Pictures from{' '}
          <a href="https://openmoji.org" target="_blank" rel="noreferrer noopener">
            OpenMoji
          </a>
          , used under CC BY-SA 4.0.
        </p>
        {anything && (
          <button
            type="button"
            className={s.clear}
            data-armed={armed ? 'true' : undefined}
            onClick={() => {
              if (armed) {
                clearAll()
                setArmed(false)
              } else {
                setArmed(true)
              }
            }}
          >
            {armed ? 'Tap again to clear it' : 'Clear all progress'}
          </button>
        )}
      </div>
    </footer>
  )
}
