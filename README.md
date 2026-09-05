# Little Mind Gym

Eight classic reasoning puzzles for an eight-year-old, in one small React app.
No timers, no luck, no twitch — every puzzle can be reasoned all the way to the
answer, and every one takes a few minutes.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # the puzzle logic, proved with breadth-first search
npm run typecheck
npm run build
```

## Routes

| Route          | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| `/`            | The collection, with what has been tried and what has been solved.   |
| `/puzzle/:id`  | One puzzle. `?level=<level-id>` opens a particular level.            |
| `/random`      | **Picks a puzzle at random and opens it.** `/surprise` does the same. |
| `/random_instantly` | The same pick, opened straight away. Unlisted — nothing in the app links to it. |
| `/settings`    | Three settings, kept on this device. Reached from the navbar.        |

`/random` leans towards puzzles that have not been played yet, opens the first
level the player has not finished, and never hands back the puzzle they just
came from. It spends about a second on a reel of icons before it lands;
`/random_instantly` makes the same choice and skips that, for a bookmark or a
launcher shortcut that wants the puzzle and not the ceremony.

## The collection

| Puzzle              | The thinking it asks for |
| ------------------- | ------------------------ |
| The river crossing  | Planning                 |
| Tower of Hanoi      | Order                    |
| Lights out          | Patterns                 |
| Leapfrog            | Sequence                 |
| The water jugs      | Arithmetic               |
| The small square    | Logic                    |
| The heavier one     | Evidence                 |
| Who has what        | Deduction                |

Each has three levels, three hints that nudge rather than tell, and — where the
question has an answer — the fewest moves it can possibly be done in.

## How it is put together

Every puzzle is a **pure state machine plus a presentational board**. The shell
in `src/routes/PuzzlePage.tsx` owns the history, the undo, the move tape, the
counter, the hints, the level picker and the progress, so a puzzle only has to
describe its own rules and draw its own pieces.

```
src/
  lib/          the contract (types.ts), a seeded rng, a BFS over state graphs, the motion cues
  components/   the shell's furniture, including the move tape and the confetti
  routes/       home, one puzzle, the random pick, the settings
  puzzles/<id>/ logic.ts · Board.tsx · glyphs.tsx · board.module.css · index.ts · logic.test.ts
  styles/       tokens.css: every colour, size and duration. motion.module.css: the cues
```

Because the state is pure and the board is a function of it, the **move tape**
under every board can rewind to any earlier moment with one tap. A child can
explore a wrong idea all the way to its end and walk back out of it.

- Adding a puzzle: **[PUZZLE_CONTRACT.md](PUZZLE_CONTRACT.md)**
- Changing how it looks: **[DESIGN.md](DESIGN.md)**
- Publishing it: **[AGENTS.md](AGENTS.md)**

Progress lives in `localStorage` under `little-mind-gym:progress:v1`. The old
`puzzle-bench:progress:v1` is still read once, so nothing solved before the
app was renamed is lost. The settings sit beside it under
`little-mind-gym:settings:v1`, and a stored value that is missing, damaged or
from another version falls back to the default rather than to off. There is no
account, no network call and no analytics.

## Pictures

The animals, food, hats and lamps are [OpenMoji](https://openmoji.org) artwork,
used under **CC BY-SA 4.0** and credited in the app's footer. The SVGs are
committed under `src/assets/openmoji/` — nothing is fetched at run time — and
`node scripts/fetch-openmoji.mjs` puts them there. That script holds the code
point behind every name; add a picture by adding it there, adding the name to
the `PictoName` union in `src/components/pictogram-art.ts`, and running it.

Our own drawings are still in each puzzle's `glyphs.tsx`, and they are marks
rather than pictures: arrows, ticks, crosses, a rubber, a drop marker. The line
between the two is one question — could a child point at it and name it?
