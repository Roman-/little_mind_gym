import { Route, Routes } from 'react-router-dom'
import { useSoundEffects } from './lib/sound'
import { Footer, Header } from './components/Chrome'
import { Home } from './routes/Home'
import { PuzzlePage } from './routes/PuzzlePage'
import { RandomPuzzle } from './routes/RandomPuzzle'
import { SettingsPage } from './routes/Settings'
import { NotFound } from './routes/NotFound'
import s from './components/Chrome.module.css'

export function App() {
  // One place for the whole app's sound: it renders nothing and holds no
  // state, it just keeps the engine in step with the setting and gives every
  // control its click.
  useSoundEffects()

  return (
    <>
      <Header />
      <main className={s.main}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/puzzle/:id" element={<PuzzlePage />} />
          <Route path="/random" element={<RandomPuzzle />} />
          <Route path="/surprise" element={<RandomPuzzle />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Unlisted. Nothing in the UI points here; it is the same pick as
              /random with the reel skipped, for a bookmark or a shortcut. */}
          <Route path="/random_instantly" element={<RandomPuzzle instant />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
