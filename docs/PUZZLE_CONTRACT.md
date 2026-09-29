# How to add a puzzle

A puzzle is a **pure state machine plus a presentational board**. The shell
(`src/routes/PuzzlePage.tsx`) owns everything else: history, undo, rewind, the
move tape, hints, level switching, reset, the solved stamp
and progress. You never write any of that.

Read `src/puzzles/river-crossing/` first. It is the reference implementation
and everything below is visible in it.

## Files

```
src/puzzles/<id>/
  logic.ts          state, actions, and the pure functions. No React.
  Board.tsx         renders state, dispatches actions. No game rules.
  board.module.css  styles, tokens only.
  glyphs.tsx        the puzzle's own stroke marks + the picture on its card.
  index.ts          the PuzzleMeta: title, levels, hints, engine.
  logic.test.ts     proves every level is solvable and every `par` is right.
```

`index.ts` must export a single `PuzzleMeta` named in camelCase after the
directory (`src/puzzles/frog-leap/index.ts` → `export const frogLeap`).

Two lines outside the directory finish the job: add the meta to `PUZZLES` in
`src/puzzles/index.ts`, and add a line to `ORIGINS` in
`src/puzzles/origins.ts` saying who invented the puzzle and who publishes it —
"Traditional" and one sentence of where it was first written down, where there
is nobody to name. The credits page prints it, and
`src/routes/credits.test.tsx` fails while a puzzle has no line, so nothing
ships uncredited.

## The contract (`src/lib/types.ts`)

```ts
init(level, rng) => S      // pure. Only touch rng if the level is randomised.
reduce(state, action) => S // pure. See the invariant below.
isSolved(state) => boolean
failure?(state) => string | null   // a dead end the player must step back from
canStillWin?(state) => boolean     // false once the level is past saving
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

Hidden information (the sudoku solution, say) lives in the state too — just
don't render it.

### The way back out

The shell answers a dead end with **Step back**, and that button has to land
somewhere the level can still be won. On most boards that is one move back:
the move that broke the rule is the move that ended it. On some it is not —
a budget runs out, a line jams, a dog closes in — and the move that lost the
level is several moves behind the one the board spoke on. There, one move back
is a button that ends the level again.

So: **if a player can be past saving before your `failure` says so, answer
`canStillWin`.** The shell walks back through the positions the player has
already been in and stops at the last one it says yes to. It is asked only
once a dead end is up, and only about positions in the past — your `Board.tsx`
must never ask it, because a mark meaning "this move still wins" is the whole
puzzle given away. Leave it out where every position a player can still play is
one they can still win: the river crossing, whose every move undoes, and the
alice maze, whose `failure` already fires the moment the ring goes out of
reach. Both prove that in their own `logic.test.ts` rather than assuming it.

The answer can be a table the level already built (`swapsToGo <= swapsLeft` in
the long table) or `shortestSolution` over a small graph (the frogs, the
stones, the hedges). It runs at most once a move in the player's history, and
only at a dead end, so a search over a few hundred positions is nothing.

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
  `src/components/pictogram-art.ts`, then running the script. See docs/DESIGN.md rule 3.

## The picture on the card

`Icon` is what the collection, the random reel and the row above the board all
draw. It is a **small picture of your own board**, built with `Scene` from
`src/components/scene.tsx`:

```tsx
import { Piece, Scene, edge } from '../../components/scene'

export function FrogLeapIcon({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <circle cx={6.5} cy={15.2} r={5.1} fill="var(--p-slate)" {...edge} />
      <Piece name="frog" x={6.5} y={14.4} size={9.4} />
    </Scene>
  )
}
```

Four rules, and `src/components/scene.test.tsx` holds you to the first two.

1. **The box is 32 units.** Our 1.5 stroke is 2 here and our hairline is 1.
2. **Put nothing inheritable on the frame.** A `Piece` is a nested svg, so a
   fill or a stroke on `Scene` would land on artwork that brought its own
   colours. Every shape declares what it is drawn in.
3. **Use the board's own materials.** A thing a child can name is a `Piece`; a
   disc, a water level or a lit cell is flat enamel under `edge`, exactly as
   the board draws it. Nothing appears on the card that is not on the stage
   behind it.
4. **Three or four big shapes.** The plate on the collection card gives the
   scene about 68px and the row above a puzzle gives it 28. It has to read as
   a silhouette at the smaller of those.
- Every touchable thing is a real `<button type="button">` with the `u-press`
  class and a useful `aria-label`. Keyboard and screen readers must work.
- **Motion that answers a move comes from the shared cues.** A shake, a red
  flash, a "no", a group of cells lit for a moment: `src/styles/motion.module.css`
  holds all four, and `useCue()` from `src/lib/motion.ts` puts one on and takes
  it off again. Write no keyframes of your own for these — a mistake should
  look the same in every puzzle, and one mistake may fire two of them at once.
  A cue that points at a piece asks `logic.ts` which piece — `clashOf` in the
  sudoku, `failureOf` in the river crossing — so the board never works a rule
  out a second time. See docs/DESIGN.md, **Motion**.
- **A move your rules forbid is offered, not disabled.** With **Allow moves
  that break a rule** on — the default — a control that would break a rule
  stays live and is answered afterwards. `useRefusal(state)` from
  `src/lib/refusal.ts` is the whole of it: draw `refusal.shown` instead of
  `state`, keep the control live while `refusal.offered`, and on a forbidden
  tap call `refusal.refuse()` with what your own `logic.ts` hands back — a
  `refusalOf` beside your `canMove`, returning the position the tap pretends to
  reach and one sentence saying why it cannot stay. Wear `refusal.flash(id)`
  and `refusal.shake(id)` on the piece it names, and put `refusal.say(...)`
  in your `role="status"`. Never dispatch it: `reduce` still returns the same
  reference, so the history, the move tape and `isSolved` never see a forbidden
  position. A control that is dead because the move would *change nothing* —
  filling a full jug, writing the digit that is already there — stays dead.
  See docs/DESIGN.md, **A forbidden move is offered, not hidden**.
- **You do not have to manage focus.** Boards routinely replace the very button
  that was pressed — a piece moves into the boat, a Fill button greys out —
  which drops focus onto `<body>`. The shell listens for `focusout` on the
  stage and puts focus back on the board, so a child playing by keyboard
  carries on from where they were. Do not disable a control a player has just
  used and leave nothing behind: use `aria-disabled` if the control must stay
  put.
- **You do not have to announce a win or a dead end.** The shell keeps one
  permanently-mounted `role="status"` region for `failure()` and the solved
  message. If your board has news of its own — the row read out, how many lamps
  are still lit — put it in your own `role="status"` element, mounted from the
  first render rather than created along with its text.
- The board renders the pieces and the immediate controls for moving them.
  It does **not** render the title, instructions, hints, move tape, reset,
  level picker or any "you win" message. The shell does all of that.
- The shell already sits your board on a stage. Do not wrap it in another
  `u-sunk` — one recess is the design; a recess inside a recess is a mistake.
- Read `docs/DESIGN.md` before writing a single line of CSS.

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
- `canStillWin`, where you answer it, agrees with an outside opinion — a search
  written in the test over your own rules, not the one `logic.ts` uses — on
  every position a player can reach, and there really are positions it says no
  to that `failure` says nothing about. Where you leave it out, prove *that*:
  every position a player can still play is one they can still win;
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
