import { useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Pictogram } from '../../components/Pictogram'
import { useEphemeral } from '../../lib/ephemeral'
import { cues, cx, useCue } from '../../lib/motion'
import { useRefusal } from '../../lib/refusal'
import type { Clash, ClashKind, LineMark, TentsAction, TentsState } from './logic'
import type { BoardProps } from '../../lib/types'
import {
  blockedCells,
  clashOf,
  colCells,
  colMarks,
  colOf,
  describeClash,
  lonelyTrees,
  refusalOf,
  rowCells,
  rowMarks,
  rowOf,
  strandedTrees,
  tentCells,
  tentsIn,
  treeCells,
} from './logic'
import s from './board.module.css'

/**
 * The board is a plan of the camp: a field of squares with a number at the end
 * of every row and every column, standing outside the field's rim in a margin
 * of its own.
 *
 * Nothing on this board ever breaks a rule. A tent that would touch another
 * tent, or take a line past its number, or stand where no tree could own it,
 * goes up for the length of one cue and is handed back by `refusalOf` — so the
 * position a child is looking at always keeps the three rules a glance can
 * check, and a number can never run over. That is what lets the margin talk: a
 * number is crossed off the moment its line is full, and boxed in clay when
 * its line can no longer be filled. A tree is boxed the same way once the four
 * squares round it are all spoken for, which is the same fact about a tree.
 */

/** One number in the margin, said out loud for anyone who cannot see it. */
function clueLabel(word: string, ordinal: number, want: number, has: number, mark: LineMark) {
  if (want === 0) return `${word} ${ordinal} wants no tents at all`
  const tents = want === 1 ? '1 tent' : `${want} tents`
  if (mark === 'done') return `${word} ${ordinal} has its ${tents}`
  if (mark === 'stuck') {
    return `${word} ${ordinal} wants ${tents}, has ${has}, and has no room for another`
  }
  return `${word} ${ordinal} wants ${tents} and has ${has}`
}

export function Board({ state, dispatch, locked }: BoardProps<TentsState, TentsAction>) {
  /**
   * With forbidden moves offered, no rule on this board takes a square away. A
   * tent that cannot stay is pitched where the child put it, answered, and
   * handed back. Only where a player has asked for those to be refused up
   * front does a square go dead, and then it says why.
   */
  const refusal = useRefusal(state)
  const shown = refusal.shown
  const { n, trees, rowClues, colClues } = shown

  /**
   * What the board really holds, as against what it is drawing. `shown` carries
   * a refused tent for the length of one cue and that tent is on its way
   * straight back off, so the squares are drawn from `shown` and every question
   * about the position — which squares have no room, which numbers are done,
   * how much is left — is asked of `state`. Asked of `shown`, the margin would
   * cross a number off for a tent that never landed.
   */
  const blocked = useMemo(() => blockedCells(state), [state])
  const rows = useMemo(() => rowMarks(state), [state])
  const cols = useMemo(() => colMarks(state), [state])
  /** The trees the tents already pitched have walled in. Ascending, so the first is the top one. */
  const walled = useMemo(() => strandedTrees(state), [state])

  /**
   * Which square owns the tab stop. Focus position, not a game choice, so it
   * survives a move — a child playing by keyboard would otherwise be sent back
   * to the corner after every tent. The trees are the token rather than the
   * whole state for exactly that reason: they are a new array only when a board
   * is dealt, which is the one moment the tab stop should start again. And the
   * seed is the first square with no tree on it, because the top left corner is
   * a tree on a good share of the boards this deals.
   *
   * Every square with no tree on it takes focus, whether or not it will take a
   * tent: a square that refuses the tap up front is `aria-disabled` and never
   * `disabled`, because a disabled button cannot be focused and the stop would
   * go off the board in silence — on half the boards this deals, before a child
   * had touched anything.
   */
  const firstOpen = useMemo(() => Math.max(0, trees.indexOf(false)), [trees])
  const [cursor, setCursor] = useEphemeral(trees, firstOpen)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  /**
   * The group a refused tent fell foul of, lit for one run of the cue: the row
   * or the column whose number is already met, the nine squares round a tent
   * that will not have a neighbour, or the four squares a child looked at for a
   * tree and did not find one. The red ring the refusal puts round the square
   * says which tent; this says what it is wrong with. --dur-5, the rung for a
   * group the eye has to read, and the rung `.highlight` is animated over: the
   * ring goes with the tent it was about, and the light stays a moment longer
   * to be counted.
   */
  const [cue, light] = useCue<{ from: TentsState; clash: Clash }>('--dur-5')
  /**
   * And the light dies with the position that it was about, exactly as the
   * refused tent does in `useRefusal`. The ring runs for --dur-4 and the light
   * for --dur-5, so the board is live again while the light is still on: the
   * next tent can go up, or the shell can rewind the move tape, under a group
   * lit for a tap that no longer means anything. Blaming squares on this
   * position for a tent pitched on another one would be a lie of the same kind.
   */
  const lit = cue !== null && cue.from === state ? cue.clash : null
  const litGroup = useMemo(() => new Set(lit?.cells), [lit])

  const tap = (index: number) => {
    if (locked || refusal.busy) return
    // Taking a tent down breaks no rule, so only a tent going up is weighed —
    // and which tents those are is `logic.ts`'s to say, not the board's.
    if (!state.tents[index]) {
      const no = refusalOf(state, index)
      if (no !== null) {
        if (refusal.offered) {
          refusal.refuse({ pretend: no.pretend, message: no.message, where: String(index) })
          light({ from: state, clash: no.clash })
        }
        return
      }
    }
    dispatch({ type: 'toggle', index })
  }

  const focusCell = (index: number) => {
    setCursor(index)
    refs.current[index]?.focus()
  }

  /**
   * The next square in this direction with no tree on it. A tree is not a
   * control, so the step walks over it and keeps going, and stands still at the
   * edge rather than wrapping round to the far side of the board.
   */
  const stepTo = (from: number, dr: number, dc: number): number | null => {
    let r = rowOf(n, from) + dr
    let c = colOf(n, from) + dc
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const i = r * n + c
      if (!trees[i]) return i
      r += dr
      c += dc
    }
    return null
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked || refusal.busy) return
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = stepTo(cursor, step[0], step[1])
    if (next !== null) focusCell(next)
  }

  const squares = trees.map((tree, i) => {
    const where = `Row ${rowOf(n, i) + 1}, column ${colOf(n, i) + 1}`

    if (tree) {
      // Boxed in clay when the four squares round it are all spoken for: the
      // same mark, for the same reason, as the number at the end of a line
      // that can no longer be filled.
      const stranded = walled.includes(i)
      return (
        <div className={s.cell} data-tree="true" key={i}>
          <div
            className={cx(s.tree, litGroup.has(i) && cues.highlight)}
            data-mark={stranded ? 'stuck' : undefined}
            role="img"
            aria-label={`${where}, a tree${stranded ? ' with no room left for its tent' : ''}`}
          >
            <Pictogram name="tree" className={s.art} />
          </div>
        </div>
      )
    }

    const tent = shown.tents[i]
    // A refused tent is drawn here for one cue and handed straight back, so for
    // that cue the square says nothing about the room it has: the tent a child
    // is looking at is not one the board holds.
    const bounced = refusal.flash(String(i))
    const room = !tent && bounced === undefined && blocked[i]
    // Offering a forbidden move means offering it to a listener too, so a live
    // square says what is on it and nothing else. It is only the dead square —
    // the player having asked for these to be refused up front — that says why
    // it will not take the tap. Dead is `aria-disabled` and never `disabled`:
    // it drops the press shadow and answers nothing, and it keeps its place in
    // the arrow keys' walk, so a child can still read the board it is on.
    const stopped = !tent && !refusal.offered ? clashOf(state, i) : null
    const label = `${where}, ${tent ? 'a tent' : room ? 'empty, no room for a tent' : 'empty'}`

    return (
      <div className={s.cell} key={i}>
        <button
          type="button"
          className={cx(s.tile, 'u-press', bounced ?? (litGroup.has(i) && cues.highlight))}
          ref={(el) => {
            refs.current[i] = el
          }}
          tabIndex={i === cursor ? 0 : -1}
          data-room={room ? 'none' : undefined}
          disabled={locked}
          aria-disabled={stopped === null ? undefined : true}
          aria-label={stopped === null ? label : `${describeClash(stopped)} ${label}`}
          onFocus={() => setCursor(i)}
          onClick={() => tap(i)}
        >
          {tent && <Pictogram name="tent" className={s.art} />}
        </button>
      </div>
    )
  })

  const clue = (kind: ClashKind, k: number, cells: number[], want: number, mark: LineMark) => {
    const word = kind === 'row' ? 'Row' : 'Column'
    return (
      <div
        key={`${kind}${k}`}
        className={cx(
          s.clue,
          lit !== null && lit.kind === kind && lit.ordinal === k + 1 && cues.highlight,
        )}
        data-mark={mark}
        role="img"
        aria-label={clueLabel(word, k + 1, want, tentsIn(state, cells), mark)}
      >
        {want}
      </div>
    )
  }

  /* One wrong turn, and only ever one said. A line that can no longer be
     filled outranks the rest. Then the pairing, which is the last thing a full
     board can get wrong and which counts every tree left out at once. Then a
     tree with no room left beside it for the tent it is owed, which is the
     same fact about one tree that a boxed number is about one line — and which
     only ever reaches this line while tents are still to pitch, because a
     walled-in tree on a full board is a tree the pairing has already counted.
     Then how many tents are left.

     Every one of these is drawn as well as said: the number boxed in clay, the
     tree boxed in clay. And they are the wrong turns the board can already
     see, not every wrong turn there is — a position can be spoilt several
     moves before any line or any tree runs out of room, and nothing here goes
     looking for that. It breaks no rule, working it out is the puzzle, and
     Step back is in the toolbar throughout. */
  const stuckRow = rows.indexOf('stuck')
  const stuckCol = cols.indexOf('stuck')
  const left = treeCells(state).length - tentCells(state).length
  const lonely = left === 0 ? lonelyTrees(state) : 0

  let trouble = ''
  if (stuckRow >= 0) trouble = `Row ${stuckRow + 1} has no room left for another tent.`
  else if (stuckCol >= 0) trouble = `Column ${stuckCol + 1} has no room left for another tent.`
  else if (lonely === 1) trouble = 'Every number is right. 1 tree has no tent of its own.'
  else if (lonely > 1) trouble = `Every number is right. ${lonely} trees have no tent of their own.`
  else if (walled.length > 0) {
    const place = `row ${rowOf(n, walled[0]) + 1}, column ${colOf(n, walled[0]) + 1}`
    trouble = `The tree in ${place} has no room left for its tent.`
  }

  const tally =
    left === 0 ? '' : left === 1 ? '1 tent still to pitch.' : `${left} tents still to pitch.`
  const note = locked ? '' : trouble !== '' ? trouble : tally

  return (
    <div className={s.wrap}>
      {/* The shell already sits the board on a stage; this only centres the
          plan, and lets a seven-wide one scroll rather than shrink under a
          fingertip. */}
      <div className={s.frame}>
        <div className={s.plan} data-size={String(n)} style={{ '--n': String(n) } as CSSProperties}>
          <div aria-hidden="true" />
          <div className={s.top}>
            {colClues.map((want, c) => clue('column', c, colCells(n, c), want, cols[c]))}
          </div>
          <div className={s.left}>
            {rowClues.map((want, r) => clue('row', r, rowCells(n, r), want, rows[r]))}
          </div>
          <div
            className={s.field}
            role="group"
            aria-label={`Tents and trees on a ${n} by ${n} board`}
            onKeyDown={onKeyDown}
          >
            {squares}
          </div>
        </div>
      </div>

      <p className={`u-label ${s.note}`}>{locked ? '' : refusal.say(note)}</p>
      {/* Mounted from the first render, so a screen reader is already watching
          it when a refusal arrives. Only a wrong turn is announced: the tally
          climbs on every move, and every move is not news. */}
      <p className="u-sr" role="status">
        {locked ? '' : refusal.say(trouble)}
      </p>
    </div>
  )
}
