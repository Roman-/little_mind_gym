# Little Mind Gym

Classic reasoning puzzles for an eight-year-old, in one small React app.
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
| `/settings`    | Four settings, kept on this device. Reached from the navbar.         |

The front page is a title page and then the collection: two columns of cards,
each with the puzzle's picture, its name, one line about it, and — once there
is something to say — how far the player has got with it. The picture is a
small drawing of that puzzle's own board, so a child who cannot read the names
yet still knows which card is the tower and which is the river. The choice is
made by looking rather than by scrolling. Nothing on the page moves.

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
| The chocolate bar   | Area                     |
| The garden cats     | Elimination              |
| The heavier one     | Evidence                 |
| Who has what        | Deduction                |
| The counting path   | Paths                    |
| The candles         | Counting                 |
| The four horses     | Structure                |

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
  components/   the shell's furniture: the move tape, the confetti, the pictograms, the frame a card's picture is drawn in
  routes/       home, one puzzle, the random pick, the settings
  puzzles/<id>/ logic.ts · Board.tsx · glyphs.tsx · board.module.css · index.ts · logic.test.ts
  styles/       tokens.css: every colour, size and duration. motion.module.css: the cues
```

Because the state is pure and the board is a function of it, rewinding is
free: a child can explore a wrong idea all the way to its end and walk back
out of it. **Step back** and **Start over** sit under every board. The
**move tape** — a mark per move, the count beside it, any mark a tap back to
that moment — is the long way back, and it is off until **Show your moves**
is turned on in the settings: a tally climbing while the puzzle is still open
reads as a budget. What a finished puzzle took is in the solved notice either
way.

**A move that breaks a rule is offered, not hidden.** Tap it and it happens:
the piece goes where you put it, the board flashes red, one sentence says what
was wrong, and the board puts it back — with nothing on the move tape and
nothing in the history, so a forbidden position is drawn and never played from.
A dead button would have said which moves are legal without the child ever
having to work it out. **Allow moves that break a rule** in the settings turns
it off, and the controls go back to refusing up front. It changes the Tower of
Hanoi, leapfrog and the balance scales; the other six disable nothing their
rules forbid.

**Immerse gives the whole window to the board.** The button is in the navbar
on a puzzle page. It asks the browser for the screen and takes away the navbar,
the title-and-levels row, the How to play drawer and the footer under it,
leaving the board, the move tape and the controls a child plays with — and the
stage grows into the room all four gave back. Fullscreen is the source of
truth: Escape, F11 and the browser's own control all bring the page back,
because the mode watches `fullscreenchange` rather than remembering what it
asked for. Where a browser will not give the screen at all, the page goes quiet
anyway and **Leave immerse** under the board is still the way out.

**Paper falls on a solve, if it was asked for.** **Throw confetti** in the
settings is the one choice that ships off: a level coming out is already said
by the stamp, the move count and the three notes, so the paper is a thing to
turn on rather than a thing to turn off. Turned on, a level solved gets
`--dur-6` of it — four cuts of paper in the six enamel colours, each piece
falling, swinging and turning at a rate of its own. It is fixed over the page,
takes no taps and holds nothing focusable, and a reader who has asked for less
motion gets none of it.

**The app makes a small wooden sound when it is touched.** A click under every
control, a knock when a piece goes down, two lower knocks when a rule says no,
and three notes on a solve. There are no audio files in the repository: all
four are synthesised in `src/lib/sound.ts` and rendered into buffers while the
page loads, so the first one plays without a gap. The speaker in the navbar and
**Play sounds** in the settings are the same switch, and off is silent.

- Adding a puzzle: **[PUZZLE_CONTRACT.md](docs/PUZZLE_CONTRACT.md)**
- Choosing what to add next: **[PUZZLE_CANDIDATES.md](docs/PUZZLE_CANDIDATES.md)**
- Changing how it looks: **[DESIGN.md](docs/DESIGN.md)**
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

**A puzzle fails that question, so its card is not an emoji.** Nothing in the
set means "Tower of Hanoi": an abacus was the closest thing and a child still
had to be told what it stood for. Each puzzle draws a **scene** instead — a
small picture of its own board, three or four shapes big enough to read across
a table, made of the same materials the board is. Three discs on the first of
three pegs. A boat out on the water with the goat still waiting on the bank.
Two jugs of different heights, one of them part full. A balance holding two
against two and still not level. `Scene` in `src/components/scene.tsx` is the
frame all eleven are drawn in, and each puzzle's is at the bottom of its
`glyphs.tsx`.
