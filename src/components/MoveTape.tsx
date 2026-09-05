import s from './MoveTape.module.css'

/**
 * The move tape: one mark per move made. Click any mark to step the whole
 * board back to that moment — the puzzles are pure state machines, so
 * rewinding is free and a child can explore without fear of wrecking anything.
 *
 * The rail is the way back rather than a score, so it is always here. The
 * number beside it is not: a count climbing while a child is still thinking
 * reads as a budget, so it waits for the "Show the move count" setting. How
 * many moves it took, and how few it could have taken, belong in the solved
 * notice, after the puzzle is won.
 */
export function MoveTape({
  steps,
  onRewind,
  showCount,
  disabled,
}: {
  /** What each move did, oldest first. */
  steps: string[]
  /** Keep this many moves and drop the rest. 0 goes back to the start. */
  onRewind: (keep: number) => void
  /** Print how many moves have been made beside the rail. Off unless asked for. */
  showCount?: boolean
  disabled?: boolean
}) {
  return (
    <div className={s.wrap}>
      {showCount && (
        <div className={`u-label ${s.head}`}>
          <span>Moves</span>
          <span className={s.count}>{steps.length}</span>
        </div>
      )}
      <div className={`u-sunk ${s.rail}`} role="group" aria-label="Move history">
        <button
          type="button"
          className={s.start}
          onClick={() => onRewind(0)}
          disabled={disabled || steps.length === 0}
          title="Back to the start"
          aria-label="Go back to the start"
        />
        {steps.map((step, i) => (
          <button
            key={i}
            type="button"
            className={s.mark}
            data-now={i === steps.length - 1 ? 'true' : undefined}
            onClick={() => onRewind(i + 1)}
            disabled={disabled || i === steps.length - 1}
            title={`${i + 1}. ${step}`}
            aria-label={`Move ${i + 1}: ${step}. Go back to here.`}
          />
        ))}
      </div>
    </div>
  )
}
