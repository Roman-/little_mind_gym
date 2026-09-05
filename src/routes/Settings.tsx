import { usePageTitle } from '../lib/title'
import { useSettings } from '../lib/settings'
import type { SettingKey } from '../lib/settings'
import { Panel } from '../components/kit'
import { TickIcon } from '../components/icons'
import s from './settings.module.css'

/** One line a child can read out, and one sentence saying what it does. */
const OPTIONS: { key: SettingKey; name: string; what: string }[] = [
  {
    key: 'allowForbiddenMoves',
    name: 'Allow moves that break a rule',
    what: 'The board takes the move, shows you it was wrong, and undoes it straight away.',
  },
  {
    key: 'showMoves',
    name: 'Show your moves',
    what: 'A row of marks under the board, one for each move, with the count beside it. Tap a mark to go back to that moment.',
  },
  {
    key: 'sound',
    name: 'Play sounds',
    what: 'Moves and taps make a small sound.',
  },
]

export function SettingsPage() {
  const { settings, set } = useSettings()
  usePageTitle('Settings')

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>Settings</h1>
        <p className={s.lede}>These apply to every puzzle. This browser remembers what you pick.</p>
      </div>
      <Panel className={s.panel}>
        {OPTIONS.map((option) => (
          <label key={option.key} className={s.row}>
            {/* The real checkbox, hidden but not removed: it keeps the
                keyboard and the screen reader, and the box beside it is drawn
                from its :checked state. It is named after the short line
                alone, so a reader hears what the setting is called before the
                sentence explaining it. */}
            <input
              type="checkbox"
              className={`u-sr ${s.input}`}
              checked={settings[option.key]}
              onChange={(e) => set(option.key, e.target.checked)}
              aria-labelledby={`${option.key}-name`}
              aria-describedby={`${option.key}-what`}
            />
            <span className={`${s.box} u-press`}>
              <TickIcon />
            </span>
            <span>
              <span className={s.name} id={`${option.key}-name`}>
                {option.name}
              </span>
              <span className={s.what} id={`${option.key}-what`}>
                {option.what}
              </span>
            </span>
          </label>
        ))}
      </Panel>
    </div>
  )
}
