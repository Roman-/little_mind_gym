# Little Mind Gym — design language

A collection of classic reasoning puzzles for an eight-year-old. The whole
point of the visual design is one sentence:

> **This should feel like real thinking work, not like a game that flashes at you.**

Engaging, but quiet. Closer to a well-made wooden puzzle box than to an app
store game. Quiet is not the same as small, grey and cold, though: everything
here is built for an eight-year-old's hand and eye. Big type, big targets, warm
ground, plain words. The restraint is in what we *say*, never in how legible we
make it.

## The rules

**1. Colour means state. Never decoration.**
`--amber` = chosen / in progress / your turn. `--moss` = solved / correct.
`--clay` = rule broken / dead end. If a colour is on the screen and isn't
saying one of those things, it is either a piece colour (`--p-*`) identifying a
*thing*, or it belongs to a pictogram (rule 3), which brings its own. Nothing
is coloured to be pretty. A `--p-*` names something you can see on the board —
a disc, a jug of water, one team of frogs against the other — not a puzzle in a
list. A row in the collection is told apart by its picture, never by a colour
of its own; the moment a puzzle had an identity colour, a moss tile would sit
on the same card as a moss "Solved".

Where a picture already says which thing this is, the plate under it goes
neutral. Identity has been paid for by the picture, so the plate is free to
carry state, and that is the whole reason pictograms are worth their colours.

**2. A hard offset shadow means "you can touch this."**
`u-press` puts a 2px offset shadow under an element and collapses it under the
press, so it physically sinks. Put it on every control and every touchable
piece — and on nothing else. Cards, panels and boards get a hairline border and
no shadow at all. If a kid sees a shadow, they should be able to press it.

The one deliberate exception is the move tape. Its marks are ink on a strip of
tape, not objects on the desk; thirty little shadows in a row would read as
noise. They take a colour change and a lift on hover instead, and the button
around each mark is 28px so a fingertip still has something to land on.

**3. A thing gets a picture. Everything else gets a mark.**
Anything a child could point at and name — a goat, a cabbage, a frog, a lamp,
an apple — is an **OpenMoji pictogram**, drawn with `<Pictogram name="goat" />`
from `src/components/Pictogram.tsx`. We drew these ourselves once and the
result was a cabbage nobody could name. One open set, drawn by one hand, means
a wolf and a goat on the same bank belong to the same world.

Everything else is a **stroke glyph in our own hand**: 1.5px `currentColor`
strokes, round caps, a 24-unit box. Arrows, ticks, crosses, the undo curl, the
rubber, a drop marker. The test is one question: *could a child point at it and
name it?* A goat, yes. A "step back" arrow, no.

Where a shape is abstract by nature — a Hanoi disc, an identical weighing ball,
a water level, a sudoku cell — it stays abstract, in **flat enamel**: a solid
`--p-*` fill, a hairline dark border, and no picture stapled on top. No
gradients, no glow, no drop shadows other than the press shadow.

The pictograms are CC BY-SA 4.0 and the app credits OpenMoji in its footer.
`scripts/fetch-openmoji.mjs` vendors them; nothing is fetched at run time.

**A fourth rule, about size.** Nothing a finger has to hit goes below
`--tap-sm` (40px), and a primary control is `--tap` (48px). Radii come in three
sizes and mean three things: `--r-sm` (4px) for marks and lattice cells,
`--r-md` (8px) for controls and touchable cells, `--r-lg` (12px) for sheets,
stages and the big glyph plates. 8px on a 44px button is a soft rectangle, not
a pill — the ban on rounded-pill buttons stands.

**A fifth rule, about ink.** `--ink-faint` is for marks, dots, hairlines and
disabled controls. It is **not a text colour** — at 3:1 it fails everywhere it
lands. Anything a person reads takes `--ink-muted` on a sheet or a stage, and
`--ink-on-desk` when it sits directly on the desk. `src/styles/contrast.test.ts`
reads `tokens.css` and fails the build if a retune breaks any of this.

## The board is the page

A puzzle page is one line of chrome and then the board. The title and the level
buttons share a single row; "How to play" and the hints live in one drawer
*under* the board, shut by default once a child has played before. The stage
(`.stage` in `src/routes/puzzle.module.css`) claims
`min-height: clamp(20rem, 50vh, 34rem)` and centres whatever the puzzle draws.

That number is the design. Before it, the puzzle was reliably the smallest
thing on its own page: a display-sized title, a tagline, three level buttons
and two explaining cards all took more room than the pieces. **A board is built
to fill the stage, not to fit around the furniture.** Size pieces in `clamp()`
against the viewport, with a floor no smaller than a fingertip (`--tap-sm`) and
a ceiling that keeps a 27" monitor sane.

## Materials

- **Desk** (`--desk`) — the warm oat work surface the page sits on.
- **Sheet** (`--surface`) — bone. Every card and panel.
- **Stage** (`--surface-sunk`, or the `u-sunk` class) — the recessed area a
  puzzle is actually played on. The shell already puts every board on one, so
  a board does not add a second: one recess, not a recess inside a recess.

## Type

Three faces, and only three. The body face does two jobs.

- `--font-display` **Bricolage Grotesque** — page and puzzle titles only. Used
  sparingly; it is loud enough that it does not need help.
- `--font-body` **IBM Plex Sans** — everything a person reads in sentences.
- `--font-mono` **IBM Plex Mono**, via the `u-mono` class — uppercase,
  letterspaced, small. This is the instrument voice, and it is rationed to
  **values**: a move count, a peg letter, a jug capacity, a clue number, a
  coordinate. Nothing else.
- `u-label` — IBM Plex Sans, sentence case, `--t-sm`, semibold, no
  letterspacing. Every *word the app says to a child*: card titles, statuses,
  captions, bank labels, the sentence stating a level's goal.

  The test is simple: **if you would read it aloud as a sentence, it is not
  mono.** Uppercase letterspaced running text is the hardest thing you can hand
  an early reader, and it is what "PLANNING · 4–8 MIN" was made of.

## Motion

Fast and certain: `--dur-1` for presses, `--dur-2` for state changes,
`--dur-3` for a piece travelling across the board. Always `var(--ease)`.
Things slide and settle; nothing bounces, spins, sparkles or wobbles.
Reduced motion is already handled — the duration tokens collapse to 1ms —
so just use the tokens and never hard-code a duration.

## Words

Plain, direct, second person, sentence case. No exclamation marks, no "Oops!",
no "Great job!!". Say what happened and what to do:

> The goat ate the cabbage. Step back and send them in a different order.

A failure message is one short sentence of fact. The shell adds the "step back"
control, so the message does not have to.

Write to the child, not to whoever is paying. "You have solved 3 of 8", not
"3 OF 8 SOLVED"; "Pick a puzzle", not "The collection".

**Six rules, in this order.** They came out of a real sentence that failed:
*"A frog only gets past the other colour by jumping it."*

1. **One idea per sentence.** Two clauses is usually two sentences.
2. **Concrete nouns, plain verbs.** "gets past" → "goes past". "quarrels with"
   → "cannot be left with".
3. **Never let a colour or a category stand in for a thing.** "the other
   colour" means *a frog of the other colour*, and then "it" could be either
   the colour or the frog. Write: *"To get past a frog of the other colour,
   jump over it."*
4. **Say the subject.** Active voice; second person for an instruction.
5. **Restore the dropped "that".** Never write a reduced relative clause —
   "the state this step asks for", "the corpus this page was built on". Write
   the relativizer, or turn the clause round ("this step's target state"). It
   is the most expensive thing you can do to a reader and the repair is one
   word.
6. **Never leave the sentence worse.** Count the facts before and after. An
   edit that drops a fact, or renames a thing the code calls something else, is
   worse than the sentence it replaced — and it looks like work was done, so
   nobody reads that sentence closely again.

The longer catalogue these came from is
`~/radix-software/docs/knowledge/prose_anti_patterns.md`.

## What not to do

Do not add: gradients, glassmorphism, neon, confetti, drop shadows with blur,
rounded-pill buttons, more than one accent colour on a screen, bouncing or
pulsing animations, or a second display typeface. Do not put an emoji in a
*sentence*: a picture is a pictogram on a plate, never a character in running
text a screen reader has to read out. Do not hard-code a colour,
radius, duration, or font family anywhere — use the tokens in
`src/styles/tokens.css` so dark mode keeps working.

**And do not print metadata a child cannot act on.** No time estimates, no
skill taxonomies, no par counting down while the puzzle is still open, and no
unlabelled row of pips standing in for a fact that a word beside it already
states. If a mark cannot be decoded from the page it is on, it is decoration
wearing the clothes of information — which is worse than an ornament, because
it takes up the place where something useful could have gone.
