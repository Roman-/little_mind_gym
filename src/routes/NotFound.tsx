import { ButtonLink, Panel } from '../components/kit'
import { BackIcon } from '../components/icons'
import s from './notfound.module.css'

export function NotFound() {
  return (
    <Panel className={s.wrap}>
      <h1 className={s.title}>That puzzle is not here.</h1>
      <ButtonLink to="/" variant="primary">
        <BackIcon />
        All puzzles
      </ButtonLink>
    </Panel>
  )
}
