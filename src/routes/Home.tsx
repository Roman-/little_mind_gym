import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PUZZLES } from '../puzzles'
import { STATUS_LABEL, statusOf, useProgress } from '../lib/progress'
import { usePageTitle } from '../lib/title'
import type { Status } from '../lib/progress'
import type { PuzzleMeta } from '../lib/types'
import { ButtonLink, Panel } from '../components/kit'
import { ShuffleIcon } from '../components/icons'
import { StateDiagram } from '../components/StateDiagram'
import s from './home.module.css'

type Filter = 'all' | 'unsolved' | 'new'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All eight' },
  { id: 'unsolved', label: 'Still going' },
  { id: 'new', label: 'Not started' },
]

function keep(filter: Filter, status: Status): boolean {
  if (filter === 'all') return true
  if (filter === 'new') return status === 'new'
  return status !== 'complete'
}

function PuzzleRow({ meta, status }: { meta: PuzzleMeta; status: Status }) {
  const { Icon } = meta
  return (
    <li>
      <Link to={`/puzzle/${meta.id}`} className={`${s.row} u-press`}>
        <span className={s.glyph}>
          <Icon />
        </span>
        <span>
          <span className={s.rowTitle}>{meta.title}</span>
          <span className={s.rowTagline}>{meta.tagline}</span>
        </span>
        {/* Eight rows each stamped "Not tried" is eight repetitions of nothing.
            A row says something about itself only once there is something to say. */}
        {status !== 'new' && (
          <span className={`u-label ${s.status}`} data-state={status}>
            {STATUS_LABEL[status]}
          </span>
        )}
      </Link>
    </li>
  )
}

export function Home() {
  const { get } = useProgress()
  const [filter, setFilter] = useState<Filter>('all')
  usePageTitle(null)

  const rows = PUZZLES.map((meta) => {
    const record = get(meta.id)
    return { meta, record, status: statusOf(record, meta) }
  })
  const shown = rows.filter((r) => keep(filter, r.status))
  const solvedCount = rows.filter((r) => r.status === 'solved' || r.status === 'complete').length

  return (
    <>
      <Panel className={s.hero}>
        <div className={s.heroText}>
          <h1 className={s.headline}>Eight puzzles you can work out.</h1>
          <p className={s.lede}>
            You can work every one out by thinking. None of them need quick fingers.
          </p>
          <div className={s.actions}>
            <ButtonLink to="/random" variant="primary">
              <ShuffleIcon />
              Surprise me
            </ButtonLink>
            <a className={s.jump} href="#index">
              or pick one below
            </a>
          </div>
          <div className={s.summary}>
            <p className="u-label u-label-desk">
              {solvedCount === 0
                ? 'No puzzles solved yet'
                : `You have solved ${solvedCount} of ${PUZZLES.length}`}
            </p>
          </div>
        </div>
        <StateDiagram />
      </Panel>

      <section id="index">
        <div className={s.indexHead}>
          <h2 className={s.sectionTitle}>Pick a puzzle</h2>
          <div className={s.filters} role="group" aria-label="Filter the collection">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`${s.chip} u-press`}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <Panel className={s.empty}>
            <p>
              {filter === 'new'
                ? 'You have opened every puzzle here at least once.'
                : 'You have solved every level of every puzzle.'}
            </p>
          </Panel>
        ) : (
          <ol className={s.list} role="list">
            {shown.map(({ meta, status }) => (
              <PuzzleRow key={meta.id} meta={meta} status={status} />
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
