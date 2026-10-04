import { Link } from 'react-router-dom'
import { PUZZLES } from '../puzzles'
import { STATUS_LABEL, statusOf, useProgress } from '../lib/progress'
import { usePageTitle } from '../lib/title'
import type { Status } from '../lib/progress'
import type { PuzzleMeta } from '../lib/types'
import { ButtonLink } from '../components/kit'
import { ShuffleIcon } from '../components/icons'
import s from './home.module.css'

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
  usePageTitle(null)

  const cards = PUZZLES.map((meta) => {
    const record = get(meta.id)
    return { meta, status: statusOf(record, meta) }
  })

  return (
    <>
      {/* One line and one button: the display headline above them said what
          the line under it already said, and the cards are what the page is
          for. The words sit on the desk rather than on a sheet of their own,
          so the only things standing on it are the puzzles. */}
      <div className={s.masthead}>
        <div>
          {/* The wordmark in the navbar names the page for anyone looking at
              it. This is the same name for anyone who is not. */}
          <h1 className="u-sr">Little Mind Gym</h1>
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
        {/* Nothing over the cards: a heading named what a page of puzzles
            already is, and a row of filters only stood between the line above
            and the pictures. Ordered, because the collection runs roughly from
            the puzzle a newcomer gets a foothold in soonest to the one that
            takes longest. */}
        <ol className={s.grid} role="list">
          {cards.map(({ meta, status }) => (
            <PuzzleCard key={meta.id} meta={meta} status={status} />
          ))}
        </ol>
      </section>
    </>
  )
}
