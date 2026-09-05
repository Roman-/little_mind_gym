import s from './Stamp.module.css'

/** The reward: a rubber stamp pressing into the page. No confetti. */
export function Stamp({ children, tone }: { children: string; tone?: 'moss' | 'clay' }) {
  return (
    <span className={s.stamp} data-tone={tone}>
      {children}
    </span>
  )
}
