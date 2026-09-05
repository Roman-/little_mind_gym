import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PUZZLES } from '../puzzles'
import { STATUS_LABEL, statusOf, useProgress } from '../lib/progress'
import { usePageTitle } from '../lib/title'
import type { Status } from '../lib/progress'
import type { PuzzleMeta } from '../lib/types'
import { ButtonLink, Panel } from '../components/kit'
import { ShuffleIcon } from '../components/icons'
import s from './home.module.css'

type Filter = 'all' | 'unsolved' | 'new'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All of them' },
  { id: 'unsolved', label: 'Still going' },
  { id: 'new', label: 'Not started' },
]

function keep(filter: Filter, status: Status): boolean {
  if (filter === 'all') return true
  if (filter === 'new') return status === 'new'
  return status !== 'complete'
}

/**
 * One puzzle, as a card standing on the desk.
 *
 * The picture holds the same corner of every card, so the cards make two
 * columns of pictures a child can read down before they can read a name.
 */
function PuzzleCard({ meta, status }: { meta: PuzzleMeta; status: Status }) {
  const { Icon } = meta
  return (
    <li>
      <Link to={`/puzzle/${meta.id}`} className={`${s.card} u-press`}>
        <span className={s.plate}>
          <Icon />
        </span>
        {/* A wall of cards each stamped "Not tried" is a repetition of nothing.
            A card says something about itself only once there is something to say. */}
        {status !== 'new' && (
          <span className={`u-label ${s.status}`} data-state={status}>
            {STATUS_LABEL[status]}
          </span>
        )}
        <span className={s.text}>
          <span className={s.cardTitle}>{meta.title}</span>
          <span className={s.tagline}>{meta.tagline}</span>
        </span>
      </Link>
    </li>
  )
}

export function Home() {
  const { get } = useProgress()
  const [filter, setFilter] = useState<Filter>('all')
  usePageTitle(null)

  const cards = PUZZLES.map((meta) => {
    const record = get(meta.id)
    return { meta, status: statusOf(record, meta) }
  })
  const shown = cards.filter((c) => keep(filter, c.status))

  return (
    <>
      {/* A title page: the words sit on the desk rather than on a sheet of
          their own, so the only things standing on it are the puzzles. */}
      <div className={s.masthead}>
        <div>
          <h1 className={s.headline}>Puzzles you can work out.</h1>
          <p className={s.lede}>
            You can work every one out by thinking. None of them need quick fingers.
          </p>
        </div>
        <ButtonLink to="/random" variant="primary">
          <ShuffleIcon />
          Surprise me
        </ButtonLink>
      </div>

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
          /* Ordered, because the collection runs roughly from the puzzle a
             newcomer gets a foothold in soonest to the one that takes longest. */
          <ol className={s.grid} role="list">
            {shown.map(({ meta, status }) => (
              <PuzzleCard key={meta.id} meta={meta} status={status} />
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
