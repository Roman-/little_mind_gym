import { Route, Routes } from 'react-router-dom'
import { Footer, Header } from './components/Chrome'
import { Home } from './routes/Home'
import { PuzzlePage } from './routes/PuzzlePage'
import { RandomPuzzle } from './routes/RandomPuzzle'
import { NotFound } from './routes/NotFound'
import s from './components/Chrome.module.css'

export function App() {
  return (
    <>
      <Header />
      <main className={s.main}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/puzzle/:id" element={<PuzzlePage />} />
          <Route path="/random" element={<RandomPuzzle />} />
          <Route path="/surprise" element={<RandomPuzzle />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
