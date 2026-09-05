# How to add a puzzle

A puzzle is a **pure state machine plus a presentational board**. The shell
(`src/routes/PuzzlePage.tsx`) owns everything else: history, undo, rewind, the
move tape, the move counter, hints, level switching, reset, the solved stamp
and progress. You never write any of that.

Read `src/puzzles/river-crossing/` first. It is the reference implementation
and everything below is visible in it.

## Files

```
src/puzzles/<id>/
  logic.ts          state, actions, and the pure functions. No React.
  Board.tsx         renders state, dispatches actions. No game rules.
  board.module.css  styles, tokens only.
  glyphs.tsx        the puzzle's own stroke marks + the index-row Icon.
  index.ts          the PuzzleMeta: title, levels, hints, engine.
  logic.test.ts     proves every level is solvable and every `par` is right.
```

`index.ts` must export a single `PuzzleMeta` named in camelCase after the
directory (`src/puzzles/frog-leap/index.ts` → `export const frogLeap`).

## The contract (`src/lib/types.ts`)

```ts
init(level, rng) => S      // pure. Only touch rng if the level is randomised.
reduce(state, action) => S // pure. See the invariant below.
isSolved(state) => boolean
failure?(state) => string | null   // a dead end the player must step back from
describe?(prev, next, action) => string   // "Took the goat across"
Board: ComponentType<BoardProps<S, A>>
```

### Three invariants, all load-bearing

1. **`reduce` returns the *same object reference* for an illegal or empty
   action.** That is the only signal the shell has that nothing happened, and
   it is what keeps rejected taps out of the move history.
2. **One dispatched action = one move a player would count.** If your board
   needs a selection step first (which pieces go in the boat, which cell is
   active), keep that selection in local React state inside `Board.tsx` and
   dispatch one action when the move is actually made. `par` counts dispatched
   actions.
3. **`state` is the whole truth.** The board is a pure function of it, so
   rewinding through the move tape just works. Hold board-local selection with
   `useEphemeral(state, blank)` from `src/lib/ephemeral.ts`, which clears it
   during render. An effect would clear it *after* paint, so every move would
   show one frame of the old selection over the new position.

Hidden information (which ball is heavy, the sudoku solution) lives in the
state too — just don't render it.

## Board rules

- Props are `{ state, dispatch, locked }`. **When `locked` is true, ignore all
  input** — the level is solved, or the player is in a dead end.
- **The board fills the stage.** The shell gives you
  `min-height: clamp(20rem, 50vh, 34rem)`, centred. Size your pieces in
  `clamp()` off the viewport, with a floor of `--tap-sm` on anything touchable
  and a ceiling that keeps a big monitor sane. A small huddle of pieces in the
  middle of an empty panel is the bug this contract exists to prevent.
- **Draw a thing with a picture, a control with a mark.** Anything a child
  could point at and name is `<Pictogram name="goat" />` from
  `src/components/Pictogram.tsx`; arrows, ticks and drop markers stay stroke
  glyphs in `glyphs.tsx`. Adding a picture means adding it to
  `scripts/fetch-openmoji.mjs` and to the `PictoName` union in
  `src/components/pictogram-art.ts`, then running the script. See DESIGN.md rule 3.
- Every touchable thing is a real `<button type="button">` with the `u-press`
  class and a useful `aria-label`. Keyboard and screen readers must work.
- **Motion that answers a move comes from the shared cues.** A shake, a red
  flash, a "no", a group of cells lit for a moment: `src/styles/motion.module.css`
  holds all four, and `useCue()` from `src/lib/motion.ts` puts one on and takes
  it off again. Write no keyframes of your own for these — a mistake should
  look the same in every puzzle, and one mistake may fire two of them at once.
  A cue that points at a piece asks `logic.ts` which piece — `clashOf` in the
  sudoku, `failureOf` in the river crossing — so the board never works a rule
  out a second time. See DESIGN.md, **Motion**.
- **You do not have to manage focus.** Boards routinely replace the very button
  that was pressed — a piece moves into the boat, a ball moves onto a pan, a
  Fill button greys out — which drops focus onto `<body>`. The shell listens
  for `focusout` on the stage and puts focus back on the board, so a child
  playing by keyboard carries on from where they were. Do not disable a control
  a player has just used and leave nothing behind: use `aria-disabled` if the
  control must stay put.
- **You do not have to announce a win or a dead end.** The shell keeps one
  permanently-mounted `role="status"` region for `failure()` and the solved
  message. If your board has news of its own — the row read out, how many lamps
  are still lit — put it in your own `role="status"` element, mounted from the
  first render rather than created along with its text.
- The board renders the pieces and the immediate controls for moving them.
  It does **not** render the title, instructions, hints, move count, reset,
  level picker or any "you win" message. The shell does all of that.
- The shell already sits your board on a stage. Do not wrap it in another
  `u-sunk` — one recess is the design; a recess inside a recess is a mistake.
- Read `DESIGN.md` before writing a single line of CSS.

## Levels

Three levels, difficulty 1 → 2 → 3, ramping from "an eight-year-old gets it in
two minutes" to "worth a real sit-down". Give each a stable `id` (progress is
stored against it — never renumber), a short sentence-case `label`, a `par`,
and three `hints` that nudge in increasing order without ever giving the
answer.

Set `reseedable: true` on the meta only if `init` genuinely uses the `rng`.
A reseedable puzzle must be **solvable for every seed** — generate by walking
backwards from a solved state, or verify and retry.

## Tests

`src/lib/search.ts` gives you a breadth-first `shortestSolution` over any state
graph. Use it. Every puzzle's test file must prove:

- every level is solvable, and its `par` is exactly the shortest solution;
- illegal actions return the identical state object;
- `failure` fires when it should and stays null when it should not;
- for a reseedable puzzle: at least 30 different seeds all produce a solvable
  start.

## Checking your work

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep 'src/puzzles/<id>'
npx vitest run src/puzzles/<id>
```

TypeScript is `strict` with `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax` (so `import type { ... }` for types) and
`erasableSyntaxOnly` (so no `enum`, no constructor parameter properties).
