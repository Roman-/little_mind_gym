import { Link } from 'react-router-dom'
import { PUZZLES } from '../puzzles'
import { ORIGINS } from '../puzzles/origins'
import { usePageTitle } from '../lib/title'
import { Panel } from '../components/kit'
import s from './credits.module.css'

/** A link that leaves the site. They all carry the same two attributes. */
function Out({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  )
}

export function CreditsPage() {
  usePageTitle('Credits')

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>Credits</h1>
        <p className={s.lede}>
          Little Mind Gym is made out of other people’s work. This page says whose.
        </p>
      </div>

      <section className={s.block}>
        <h2 className={s.sectionTitle}>The puzzles</h2>
        <p className={s.note}>
          Every puzzle here but one was invented by somebody else. What this app made is the
          board that you play it on. Several of them were found in{' '}
          <Out href="https://www.chiark.greenend.org.uk/~sgtatham/puzzles/">
            Simon Tatham’s Portable Puzzle Collection
          </Out>{' '}
          or among the pencil puzzles of <Out href="https://www.nikoli.co.jp/en/">Nikoli</Out>,
          and where one of those carries a puzzle under a different name, the line below says so.
        </p>
        <Panel className={s.panel}>
          <ul className={s.list}>
            {PUZZLES.map((meta) => (
              <li key={meta.id} className={s.item}>
                <Link to={`/puzzle/${meta.id}`} className={s.itemName}>
                  {meta.title}
                </Link>
                <p className={s.itemLine}>{ORIGINS[meta.id]}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className={s.block}>
        <h2 className={s.sectionTitle}>The pictures</h2>
        <Panel className={s.panel}>
          <p className={s.para}>
            The animals, the fruit, the hats and everything else that a child can point at and name
            are{' '}
            <Out href="https://openmoji.org">OpenMoji</Out> artwork, used under{' '}
            <Out href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Out>. Every
            file is unmodified, and the licence is share-alike: a changed copy of one of them
            carries the same licence.
          </p>
          <p className={s.para}>
            The pictures on the cards, and the arrows, ticks and crosses on the boards, are drawn
            here.
          </p>
        </Panel>
      </section>

      <section className={s.block}>
        <h2 className={s.sectionTitle}>The type</h2>
        <Panel className={s.panel}>
          <p className={s.para}>
            Headings are{' '}
            <Out href="https://fonts.google.com/specimen/Bricolage+Grotesque">
              Bricolage Grotesque
            </Out>
            , by Mathieu Triay. Everything else is{' '}
            <Out href="https://www.ibm.com/plex/">IBM Plex Sans and IBM Plex Mono</Out>, by Mike
            Abbink and Bold Monday for IBM. All three are under the{' '}
            <Out href="https://openfontlicense.org">SIL Open Font License</Out> and are served by
            Google Fonts.
          </p>
        </Panel>
      </section>

      <section className={s.block}>
        <h2 className={s.sectionTitle}>The machinery</h2>
        <Panel className={s.panel}>
          <p className={s.para}>
            The app is built with <Out href="https://react.dev">React</Out> and{' '}
            <Out href="https://reactrouter.com">React Router</Out>, written in{' '}
            <Out href="https://www.typescriptlang.org">TypeScript</Out>, bundled by{' '}
            <Out href="https://vite.dev">Vite</Out>, and tested with{' '}
            <Out href="https://vitest.dev">Vitest</Out>. All five are open source, and are free to
            use because somebody chose to give them away.
          </p>
          <p className={s.para}>
            The sounds are not recordings. Every click, knock and chime is synthesised in the
            browser as the page loads, so there is no audio in the repository to credit.
          </p>
        </Panel>
      </section>

      <p className={s.foot}>
        Nothing else is borrowed. There is no account and no analytics here, and what you have
        solved stays in this browser.
      </p>
    </div>
  )
}
