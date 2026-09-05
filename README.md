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
| `/random_instantly` | The same pick, opened straight away and already immersed. Unlisted — nothing in the app links to it. |
| `/settings`    | Three settings, kept on this device. Reached from the navbar.        |

The front page opens with a carousel of the eight puzzles — a picture, a name
and a Start. It moves on by itself until a child touches it or steers it with
either arrow, and it holds still for a reader who has asked for less motion.

`/random` leans towards puzzles that have not been played yet, opens the first
level the player has not finished, and never hands back the puzzle they just
came from. It spends about a second on a reel of icons before it lands;
`/random_instantly` makes the same choice, skips that, and lands immersed, for
a bookmark or a launcher shortcut that wants the puzzle and not the ceremony.
A fullscreen request has to be able to point at a tap that asked for it, and
the tap that opened a bookmark does not survive the navigation it started — so
that route arrives with the page already quiet and **Full screen** on the
toolbar, one tap from the screen.

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
hints, the level picker and the progress, so a puzzle only has to describe its
own rules and draw its own pieces.

```
src/
  lib/          the contract (types.ts), a seeded rng, a BFS over state graphs, the motion cues, the sounds, the refusals, the immerse mode
  components/   the shell's furniture: the move tape, the confetti, the hero carousel
  routes/       home, one puzzle, the random pick, the settings
  puzzles/<id>/ logic.ts · Board.tsx · glyphs.tsx · board.module.css · index.ts · logic.test.ts
  styles/       tokens.css: every colour, size and duration. motion.module.css: the cues
```

Because the state is pure and the board is a function of it, the **move tape**
under every board can rewind to any earlier moment with one tap. A child can
explore a wrong idea all the way to its end and walk back out of it. The tape
keeps no score: how many moves have been made is printed only when **Show the
move count** is turned on in the settings, and that setting starts off. What a
finished puzzle took is in the solved notice either way.

**A move that breaks a rule is offered, not hidden.** Tap it and it happens:
the piece goes where you put it, the board flashes red, one sentence says what
was wrong, and the board puts it back — with nothing on the move tape and
nothing in the history, so a forbidden position is drawn and never played from.
A dead button would have said which moves are legal without the child ever
having to work it out. **Allow moves that break a rule** in the settings turns
it off, and the controls go back to refusing up front. It changes the Tower of
Hanoi, leapfrog and the balance scales; the other five disable nothing their
rules forbid.

**Immerse gives the whole window to the board.** The button is in the navbar
on a puzzle page. It asks the browser for the screen and takes away the navbar,
the title-and-levels row and the How to play drawer, leaving the board, the
move tape and the controls a child plays with — and the stage grows into the
room all three gave back. Fullscreen is the source of truth: Escape, F11 and
the browser's own control all bring the page back, because the mode watches
`fullscreenchange` rather than remembering what it asked for. Where a browser
will not give the screen at all, the page goes quiet anyway and **Leave
immerse** under the board is still the way out.

**The app makes a small wooden sound when it is touched.** A click under every
control, a knock when a piece goes down, two lower knocks when a rule says no,
and three notes on a solve. There are no audio files in the repository: all
four are synthesised in `src/lib/sound.ts` and rendered into buffers while the
page loads, so the first one plays without a gap. The speaker in the navbar and
**Play sounds** in the settings are the same switch, and off is silent.

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
