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
list. A card in the collection is told apart by its picture, never by a colour
of its own; the moment a puzzle had an identity colour, a moss tile would sit
on the same card as a moss "Solved".

The confetti on a solve is the one exception. It is paper, so it takes the
enamel palette — the one set of colours here that is not a signal — and it
falls for `--dur-6` and is gone. It is also the one thing in the app that has
to be asked for: **Throw confetti** under Settings ships off, because the
stamp, the move count and the three notes already say the level came out, and
paper that nobody chose is a screen celebrating itself.

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

**Immerse is the same rule taken to the end of the page.** The navbar, the
title-and-levels row, the drawer and the footer under it all go, the browser is
asked for the screen, and the stage takes what the four of them were using.
What stays is the board, the move tape and the controls under it — everything a
child touches while playing, and nothing else. The credit comes back with the
footer the moment the page does. The screen itself
is the source of truth, so Escape, F11 and the browser's own control all put
the page back without the app being told; where a browser will not give the
screen, the page goes quiet anyway and the toolbar carries both the way in and
the way out. The button belongs on a puzzle page: there is nothing to immerse
on the collection or the settings.

**A place stays a place.** When a piece leaves its row — into the boat, onto a
pan — the row does not close up behind it. The place stays where it was, drawn
as an empty outline, and every other piece keeps its position. A row that
closes up slides the piece that a child was already reaching for out from under
their finger, so the second of two taps lands on the wrong animal. Both banks
of the river crossing and the bench in the balance scales are laid out this
way: only a move rearranges anybody.

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
Things slide and settle; nothing spins or wobbles to fill a wait.

**A piece keeps its node.** When a board draws its pieces as a list, that list
takes an order that the puzzle's own state cannot change. The leapfrog board
draws every green frog and then every blue one, and not in row order: a jump
crosses two frogs, so row order is the one thing a move is certain to change.
React answers a reordered list by lifting the node that moved out of the
document and putting it straight back. A node that has left the document has
no transform to travel from, so the piece a child has just tapped lands on its
square instantly while the rest of the board slides. Key by the piece, and
order by the piece too.

Two longer rungs are for motion that has to be *noticed* rather than only
seen: `--dur-4` for a one-shot cue, `--dur-5` for a cue the eye has to follow
or read. They are rationed to two moments — a mistake the board has to point
at, and a level solved — and each one is a named cue in
`src/styles/motion.module.css`: `.shake`, `.flash` (a red outline), `.no` (one
shrink and back), and `.highlight` (a group of cells lit long enough to be
read). A board writes no keyframes of its own; it fires one of these with
`useCue()`.

```tsx
import { cues, useCue } from '../../lib/motion'

const [wrong, sayNo] = useCue<string>()
...
sayNo(item.id)
<span className={wrong === item.id ? cues.shake : undefined} />
```

A cue clears itself when its run is over: nobody has to remember to take the
class off, and the element is left exactly as it was.

One mistake can take two cues at once. When a repeated fruit breaks a row, the
small square lights every square in that row with `.highlight` and shakes the
two fruits at fault with `.shake`: the light says where the rule broke, the
shake says which two squares broke it. Only one group is ever lit — a
placement can break a row, a column and a box together, and three lit groups
say nothing about any of them — and which group it is comes from the puzzle's
own rules in `logic.ts`, never from the board working the rule out a second
time.

A dead end is pointed at the same way. `failureOf` in the river crossing's
`logic.ts` returns the pieces its sentence names alongside the sentence, so the
board shakes the wolf and the goat without reading the English back out of the
message.

Reduced motion is already handled — the duration tokens collapse to 1ms — so
just use the tokens and never hard-code a duration. That collapse is also why
a cue is never the only thing that says what happened: the sentence under the
board says it too, and the confetti — where it was asked for at all — is
skipped outright, on `usePrefersReducedMotion`. A sentence that answers a cue is never put on the
cue's timer, either — it stands until the mistake it names is off the board.

**Nothing moves until somebody asks it to.** The front page carried a
carousel of the puzzles for a while, and it was the one thing here that moved
on its own: a picture and a name at a time, for a child who cannot yet read a
list. It was paying for its movement with a card that could slide out from
under a finger already reaching for Start, and it was paying for a picture the
collection under it was already showing — every puzzle at once, and each one
big enough to name across a table. A page that shows
everything it has does not need to take turns. Motion a child did not ask for
has to beat that, and only two things ever have: a mistake the board points
at, and a level solved.

There is no animation library, and that is a decision rather than an omission.
All of the above is four sets of keyframes and one small hook, and what a
library is good at — interruptible physics, gestures, layout transitions — is
work this app does not have. Add one when that stops being true, and not to
save writing `@keyframes`.

## Sound

Four sounds, and that is the whole list: a **tap** under every control, a
**place** when a piece goes down, a **wrong** when a rule says no, and a
**solve**. Each one is a fact about what has just happened, the way a colour is
a state. There is no sound for arriving on a page, none for a hover, none to
fill a wait, and no music under any of it.

They are wooden and they are quiet. `src/lib/sound.ts` synthesises all four out
of a struck bar's partials rather than shipping samples: nothing to fetch,
nothing to decode, no second licence to carry beside OpenMoji's, and the whole
vocabulary is one small table of frequencies that anybody can retune. Every cue
is rendered into a buffer as the page loads, so the first knock a child hears
costs exactly what the thousandth does. A browser will not start audio before
somebody asks for it, so the context comes up suspended and the first tap
starts it.

Four rules keep it bearable in the tenth hour.

- **One sound a move.** A move that ends the level says what it ended it as,
  and the knock of the piece landing underneath is not played as well.
- **A sound is never the only thing that says something**, exactly as a cue
  never is. Turning it off loses nothing: the flash, the shake, the sentence
  under the board and the notice all still say it.
- **Nothing repeats.** One cue struck twice inside 40ms is one strike, and
  every play is detuned a little, because a box that answers a hundred taps
  with the identical click stops sounding like a box.
- **Quiet.** Everything goes out through one gain at half, and the tap — the
  sound a child hears most — is the quietest of the four.

The speaker in the navbar and **Play sounds** under Settings are one setting
and not two controls with their own ideas about it.

## A forbidden move is offered, not hidden

A control that goes dead the moment a move would break a rule does the thinking
for the child. Tap everything, and whatever lights up is legal; the rules never
have to be held in a head at all. So a move a rule forbids stays live and is
answered instead. The tap lands, the piece goes where the child put it, `.flash`
puts `--clay` round the thing that would not take it, one plain sentence says
what happened, and the board goes back to where it was. Nothing reaches the
shell, so nothing reaches the history, the move tape or the solved check — and
a position that breaks a rule is drawn but never played from.

Two things follow. **A tell that only legal moves get goes with it**: an amber
drop mark over exactly the pegs that will take the disc, or a sentence counting
the pans before Weigh is pressed, is the same dead button in another coat. A
drop mark now means "let go here", and it is on every peg. And **a screen
reader hears what a looker sees**: every peg still says what is standing on it,
and no label says "blocked".

The line is a rule *broken*, not a move that changes nothing. Filling a jug
that is already full breaks no rule — it is nothing happening, and a dead Fill
button says so honestly. `reduce` returns the same reference either way, so the
puzzle's own `logic.ts` draws the line, in a `refusalOf` beside its `canMove`,
which hands back both the position to draw and the sentence to say.

Where a piece cannot honestly pretend to move, nothing moves and it takes
`.shake` as well: a frog jumping its own colour would swap two frogs of one
colour past each other, and a balance tipping for a load it refused would say
which side the heavy ball is on.

One hook holds all of it — `useRefusal(state)` in `src/lib/refusal.ts`: the
setting, the pretend position, the two cues and the sentence. **Allow moves
that break a rule** under Settings is on by default; turned off, the dead
control comes back.

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

Do not add: gradients, glassmorphism, neon, drop shadows with blur,
rounded-pill buttons, more than one accent colour on a screen, or a second
display typeface. Nothing bounces, pulses or sparkles to fill a wait, to pull
the eye towards a control, or to dress up a screen that was doing fine without
it. The two exceptions are named under **Motion** above and are the whole
list: a cue on a mistake the board has to point at, and the confetti on a
solve — and the second of those only where a child has turned it on.

Do not put an emoji in a *sentence*: a picture is a pictogram on a plate,
never a character in running text a screen reader has to read out. Do not
hard-code a colour, radius, duration, or font family anywhere — use the tokens
in `src/styles/tokens.css` so dark mode keeps working.

**And do not print metadata a child cannot act on.** No time estimates, no
skill taxonomies, no par counting down while the puzzle is still open, and no
unlabelled row of pips standing in for a fact that a word beside it already
states. If a mark cannot be decoded from the page it is on, it is decoration
wearing the clothes of information — which is worse than an ornament, because
it takes up the place where something useful could have gone.

The move tape is the most recent thing this rule took. Nothing counts the
moves while the puzzle is open: a tally climbing under a child who is still
thinking reads as a budget, and a rail of marks beside it is that same tally
drawn a second time. Both are off until someone turns on **Show your moves**
under Settings, and then they arrive together — the count is what the rail
already says, so showing one without the other only makes the rail a row of
pips. How many moves it took belongs in the solved notice, once there is a
result to report; Step back and Start over stay in the toolbar throughout, so
the way out of a wrong idea is never behind a setting.
