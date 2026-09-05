import type { BoardProps } from '../../lib/types'
import { Pictogram } from '../../components/Pictogram'
import type { GridAction, GridCategory, GridItem, GridState, Mark } from './logic'
import { categoryPairs, clueTokens, markAt, nextMark } from './logic'
import { Cross, Tick } from './glyphs'
import s from './board.module.css'

/** An item's plate: a neutral tile, and the picture does the naming. */
function Plate({ item, className }: { item: GridItem; className?: string }) {
  return (
    <span className={className ? `${s.plate} ${className}` : s.plate}>
      <Pictogram name={item.art} className={s.art} />
    </span>
  )
}

const named = (cat: GridCategory, item: GridItem) => `${cat.det}${item.label}`

/** 'Children and pets' — a sentence, so only the first word takes a capital. */
const gridName = (row: GridCategory, col: GridCategory) =>
  `${row.label} and ${col.label.toLowerCase()}`

const spoken = (mark: Mark) =>
  mark === 'yes' ? 'ticked' : mark === 'no' ? 'crossed out' : 'empty'

/** What one more tap on this box will write. Keeps the label honest. */
const writes = (mark: Mark) =>
  mark === null ? 'cross it out' : mark === 'no' ? 'tick it' : 'clear it'

/**
 * The grids and the clues, and nothing else. Every box is a button, one tap is
 * one mark, and the board keeps no state of its own — so undo and rewind are
 * simply a different `state` coming in.
 *
 * Three grids are laid out the way a paper puzzle lays them out: children
 * against each list along the top row, the two lists against each other under
 * the right-hand one, and the clues in the corner the grids leave empty.
 */
export function Board({ state, dispatch, locked }: BoardProps<GridState, GridAction>) {
  const { scenario } = state
  const pairs = categoryPairs(scenario)

  return (
    <div className={s.board} data-grids={pairs.length}>
      {pairs.map(([i, j], slot) => {
        const rowCat = scenario.categories[i]
        const colCat = scenario.categories[j]
        return (
          <div className={s.scroller} key={`${i}-${j}`} data-slot={slot}>
            <table className={s.grid}>
              <caption className={`u-label ${s.caption}`}>{gridName(rowCat, colCat)}</caption>
              <thead>
                <tr>
                  <td className={s.corner} />
                  {colCat.items.map((col) => (
                    <th key={col.id} scope="col" className={s.colHead}>
                      <Plate item={col} />
                      <span className={`u-label ${s.headName}`}>{col.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowCat.items.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className={s.rowHead}>
                      <span className={`u-label ${s.headName}`}>{row.label}</span>
                      <Plate item={row} />
                    </th>
                    {colCat.items.map((col) => {
                      const mark = markAt(state, row.id, col.id)
                      const box = `${named(rowCat, row)} and ${named(colCat, col)}`
                      return (
                        <td key={col.id} className={s.slot}>
                          <button
                            type="button"
                            className={`${s.cell} u-press`}
                            data-mark={mark ?? 'blank'}
                            disabled={locked}
                            aria-label={
                              locked
                                ? `${box}: ${spoken(mark)}`
                                : `${box}: ${spoken(mark)}. Tap to ${writes(mark)}.`
                            }
                            onClick={() =>
                              dispatch({
                                type: 'mark',
                                pair: { a: row.id, b: col.id },
                                value: nextMark(mark),
                              })
                            }
                          >
                            {mark === 'yes' ? (
                              <Tick className={s.mark} />
                            ) : mark === 'no' ? (
                              <Cross className={s.mark} />
                            ) : null}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      <div className={s.clues}>
        <p className={`u-label ${s.cluesHead}`} aria-hidden="true">
          Clues
        </p>
        <ol className={s.clueList} aria-label="Clues">
          {scenario.clues.map((clue, i) => (
            <li className={s.clue} key={`${clue.kind}-${clue.a}-${clue.b}`}>
              <span className={`u-mono ${s.clueNo}`} aria-hidden="true">
                {i + 1}
              </span>
              <span className={s.clueBody}>
                {clueTokens(scenario, clue).map((token, k) =>
                  'text' in token ? (
                    <span key={k}>{token.text}</span>
                  ) : (
                    <span key={k} className={s.inline}>
                      <Plate item={token.item} className={s.inlinePlate} />
                      {token.item.label}
                    </span>
                  ),
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
