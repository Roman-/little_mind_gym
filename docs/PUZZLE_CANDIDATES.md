# Puzzles this app could take next

Ninety-five candidates for a tenth puzzle, each one weighed against [the
contract](PUZZLE_CONTRACT.md) and [the design language](DESIGN.md), and sorted so
that the easiest thing to build well sits at the top.

Simon Tatham's Portable Puzzle Collection is the foundation — all forty of them are
here, and they are the reason the list exists. But forty is not fifty, and the best
candidate turned out not to be one of them. So the collection was used as a floor
rather than a ceiling, and four more seams were dug: the Japanese pencil puzzles
Tatham does not carry, the recreational-maths and folk puzzles the river crossing
and the tower already come from, the logic mazes and one-rule digital puzzles, and
ten puzzles invented against this contract from scratch.

**The sort key is one question: how easily could this be built here, and built
well?** Not how good a puzzle it is. Nonograms are a better puzzle than most things
in the top ten and they sit at 41, because every mark a child makes on a nonogram
would cost a counted move.

Sixty-seven were ranked. The other twenty-eight are listed at the bottom with the
one sentence that settles each of them, and no more work was spent on them than
that.

## The first five

**Hidato, Light Up, Guarini's knight swap, Shikaku, and Theseus and the Minotaur** —
in that order.

The first three need no machinery this repository does not already have.
`mini-sudoku` donates Hidato's whole board and its par model; `garden-cats` donates
Light Up's toggle-and-clash board almost line for line; Guarini needs no generator
at all, because it is hand-authored the way the river crossing and the tower are,
and its entire graph is 280 states. Shikaku and Theseus each carry exactly one
decision to settle before `logic.ts` is opened, and both decisions have a shipped
precedent to copy.

All five clear the constraint that kills most of this list. A child's working has to
live on the board itself: Hidato's chain **is** the annotation, Light Up's lit wash
**is** the dot the paper game spends a right-click on, Shikaku's drawn rectangle
**is** the reasoning, and Guarini and Theseus have nothing a child would want to
write down.

The order is not the score order. Suguru outscores both Shikaku and Theseus on
nearly every mechanical axis and is held at six on purpose: it sits almost exactly
on the union of two boards the app already ships, so a tenth card that thinks like
the sixth and the seventh buys the least of anything in the top ten. Ranks 7 to 13
are six counting puzzles in a row, and taking the top five by score alone would have
put four near-identical grids on the collection page together.

What the five give the collection is five kinds of thinking it has none of: a chain
to follow, a coverage goal, permutation structure with a hidden graph, carving a
region instead of filling one somebody else drew, and a piece that answers your move
by a rule of its own. Three input idioms instead of one. Four different card
silhouettes. And the first board here where something else moves.

## What every candidate was scored on

Eight dimensions, one to five each. The first five are what "easily integrated"
actually means; the last three are gates and tiebreaks.

| Dimension | The question |
| --- | --- |
| Engine fit | Does it fit `init` / `reduce` / `isSolved` with a small pure state, and does `reduce` return the same object reference for every illegal or empty action? |
| Move granularity | Is one tap honestly one move, and does `par` then mean anything? |
| Par verifiability | Can `shortestSolution` certify par under its 200,000-state cap — or is par simply the number of cells to fill? |
| Generator | Can a board with exactly one answer, reachable without guessing, be generated backwards from a solved one? |
| Pencil marks | Is it playable in a head, or does the working need marks that would each cost a counted move? |
| Board fit | Tap-only, 40px targets, flat enamel and pictograms, and does it fill the stage without a drag? |
| Child fit | Can an eight-year-old take the goal from two sentences and reason it out? This one is a gate, not a nicety. |
| Distinctness | Does it ask something the nine do not already ask? |

The tiers say what shape the work is, and they interleave with the rank slightly,
because rank is build cost **plus** what the collection gains.

| Tier | What it means |
| --- | --- |
| **Ready to build** | Open one shipped `logic.ts`, swap a predicate, ship. No solver class the repo lacks, no open decision. |
| **Straightforward** | The same, minus exactly one decision that has to be made before the first line of code. |
| **Real work** | A generator, a solver class or an interaction has to be invented. |
| **Awkward fit** | It can be built, but it fights a house rule it cannot win. |
| **Wrong for this app** | Building it is the wrong call at any price. |

## The list

### Ranks 1 to 18 — the ones worth building

Everything here can be started from the contract. Nothing below rank 18 can.

#### 1. Hidato — the counting path

*Paths · Ready to build · also Hidoku, Number Snake; Numbrix is the orthogonal-only
cousin · Modern newspaper pencil puzzle, syndicated as Hidato and Numbrix*

mini-sudoku donates the entire machine — select-then-write, givens that never
change, a rubber key, `clashOf`/`describeClash`, par as the blank count — and what a
child does inside that board — follow a chain of numbers — exists nowhere in the
nine. It is the only cheap candidate that fills the largest gap in the collection,
paths, on a plain grid with no drag, no clue gutter and nothing a child would want
to write down.

**Watch out.** A legal write that strands a corner of the board breaks no rule, so
the board must stay silent and let the shell's Step back carry it — the first puzzle
here where a legal move quietly ruins the board. Gate the givens on the three-rule
solver's round count so a child who actually reasons never reaches that state.

#### 2. Light Up (Akari) — the candles

*Counting · Ready to build · also Akari · Nikoli (Akari); in Simon Tatham's
collection as Light Up*

It is garden-cats' board almost line for line — the same `{ type: 'toggle', index }`
action, the same clash cue, the same data-size pitch table that already ships a
7-wide grid at 44px — and the lit wash the board has to draw anyway **is** the
annotation the paper game spends a right-click dot on. That makes it the only
counting-clue candidate whose pencil-mark problem dissolves instead of being argued
away, and it brings the app's first coverage goal.

**Watch out.** `bulb` is lights-out's own pictogram and its own card, so retheme to
a candle (one codepoint in `scripts/fetch-openmoji.mjs`) or the collection ships two
bulb cards. The rules are five facts against the contract's 2-4 instruction lines,
so compress the wording before writing a line of `logic.ts`.

#### 3. Guarini's knight swap — the four horses

*Structure · Ready to build · also The four knights, Guarini's problem, the
knight-switching puzzle · Attributed to Paolo Guarini di Forli, 1512 — the oldest
chessboard puzzle in print*

The smallest genuine build in the list: hand-authored like river-crossing,
tower-of-hanoi and frog-leap, no generator at all, tower-of-hanoi's two-tap Lift and
DropMark verbatim, and a 280-state graph that `shortestSolution` and
`reachableCount` both certify in milliseconds. Par can be proved twice — by BFS and
by an independently written necklace model — exactly the discipline
`tower-of-hanoi/logic.test.ts` already demonstrates.

**Watch out.** The graph is small, fully reversible and has no dead ends, so a child
can shuffle horses to the answer without ever seeing that the eight rim squares are
one loop. The three hints are the entire defence and have to walk to that idea
without naming a square.

#### 4. Rectangles (Shikaku) — the chocolate bar

*Area · Straightforward · also Shikaku, Divide by Box · Nikoli (Shikaku); in Simon
Tatham's collection as Rectangles*

The skeptic corrected two of its own blockers upward: generation is genuinely cheap
(one keeper per 24-61 draws at ~15us each, no carve equivalent needed) and a real
BFS walks level 1 in about a thousand states, so shortestSolution is a proof rather
than decoration. garden-cats' grid CSS, seam attributes and `deal`/`fits` discipline
all carry, and it is the one affordable candidate that fills two named holes at once
— carving the structure instead of filling one somebody else drew, and a printed
number that means a quantity.

**Watch out.** The dominant mistake is a rectangle of the right area owned by the
wrong number, and it breaks no rule the child was told. Settle that before writing
`logic.ts`: the honest answer is that the board says nothing (lights-out's
precedent), because a `failure()` that catches it fires on 75-92% of them the
instant they land and turns the app into a per-move answer key.

#### 5. Theseus and the Minotaur — the rabbit and the wolf

*Prediction · Straightforward · also Minotaur maze, Mad Mazes · Robert Abbott, Mad
Mazes (1990)*

The skeptic attacked the engine and could not dent it — the same-reference invariant
is clean, one tap is honestly one turn, and the reachable graph measured 146/272/456
states against a 200,000 cap — and every finding it did land was about the
generator, which four shipped puzzles sidestep entirely by hand-authoring their
levels. What it buys is genuinely absent from the nine: a piece that answers your
move by a rule of its own, a wall, and a move that consists of standing still on
purpose.

**Watch out.** Random hedges pin the greedy wolf (motionless on 63-67% of its
steps), so the three mazes must be drawn by eye for a wolf that stays alive and then
BFS-verified per level — do not try to generate them. `wolf` is river-crossing's own
animal on its own card; use `dog`, which already ships in `PICTO_NAMES`.

#### 6. Suguru (Tectonic / Number Blocks) — the patchwork quilt

*Elimination · Ready to build · also Tectonic, Number Blocks · Japanese
pencil-puzzle tradition, credited to Naoki Inaba; sold as Suguru and Tectonic*

Mechanically the surest thing in the list: redefine `peersOf` as patch-mates plus
the eight surrounding cells and `searchGrid`, `countSolutions`, `solveBySingles`,
`clashOf`, `describeClash`, `blankCount`, `reduce`, `legalMoves` and the whole
mini-sudoku `Board` come across unchanged, while garden-cats'
`growGardens`/`connected`/`deal` supplies the partition. It is also the least
additive puzzle in the top ten — it sits almost exactly on the union of two boards
the app already ships, which is why it is sixth rather than first.

**Watch out.** A cell carries up to five candidates rather than garden-cats' single
bit, so difficulty has to be measured on the solver's round count and capped low at
level 3 or it quietly becomes a pencil-mark board. The 1-5 pad also shows keys that
are wrong for a two-cell patch, which needs a third ClashKind ('oversize') rather
than a greyed-out key.

#### 7. Tents (Tents and Trees) — the tents and trees

*Counting · Ready to build · also Tents and Trees, Camping · Newspaper and
Nikoli-adjacent pencil tradition; in Simon Tatham's collection as Tents*

About two thirds of garden-cats/logic.ts ports with the predicates swapped —
touching() already returns exactly the eight squares Tents forbids and clashes()
already tests the same Chebyshev-1 condition — and both pictograms cost one
codepoint each. The counting clue is the only thing separating it from the cat
board, so it has to be sold on that or the collection carries garden-cats in a new
coat.

**Watch out.** The grass marker has to go, since each shaded square would be a
counted move, and it takes the scan-and-tally the whole puzzle runs on with it —
this is the lowest noPencilMarks score among the contenders. isSolved must also run
a real bipartite matching over trees and tents, or a count-correct board with no
valid pairing wins.

#### 8. Unruly — Suns and moons

*Counting · Ready to build · also Tohu wa Vohu, Binairo, Takuzu, Binary Puzzle,
Binoxxo · Simon Tatham's Portable Puzzle Collection; invented by Adolfo Zanellati as
'Tohu wa Vohu'*

mini-sudoku's reduce guards, par-as-blank-count bargain and clash-lights-a-unit
feedback transfer line for line, the generator was actually measured (200 boards at
each of 6x6 and 8x8, every one with exactly one solution), and 8-wide already fits
garden-cats' shipped --cell-min: 44px scrolling frame. Neither of its rules is
peersOf's shape, so a child meets a familiar board asking an unfamiliar question.

**Watch out.** Run the clue removal to exhaustion and par is 27 blanks at 6x6 and 47
at 8x8, against mini-sudoku's hardest 22 — cap the removal or level three is a rail
of forty-seven marks under the board. It would also be the third fill-a-grid
silhouette on the collection page.

#### 9. Thermometers — the thermometers

*Counting · Straightforward · also Thermometer puzzle, Mercury · European and
international puzzle-contest tradition (Conceptis, Logic Masters, WPC), 1990s
onwards*

The engine is trivial and honest — one tap sets one tube's level, par is the count
of non-empty thermometers with a clean one-line lower bound, and the
bounds-propagation solver doubles as the uniqueness proof exactly as solveByLogic
does in garden-cats. The board is garden-cats' grid with a clue gutter, and the
monotone run (a cell that cannot be filled unless the one before it is) is a shape
nothing in the nine has.

**Watch out.** This is Aquarium's family, and Aquarium was measured to lose to a
mindless greedy climber that reads the over-full cue as an oracle. Before writing
logic.ts, run that same climber against generated thermometer boards; and note that
'par around 5' is not a par — the generator must pin the non-empty count exactly,
the way lights-out's needsExactly pins its press count.

#### 10. Mosaic (Fill-a-Pix) — the counting squares

*Counting · Straightforward · also Fill-a-Pix, Mosaic, Nurie-Puzzle · Conceptis
Puzzles; a modern picture-logic type in the nonogram family*

It is the counting-clue puzzle with no clue gutter at all: every number sits on a
cell, so nothing new has to be laid out, and garden-cats' space(n, index) is
literally the clue's 3x3 block, edge-clipping included. mini-sudoku's
clashOf/describeClash, the palette-then-tap input and the par-is-a-fill-count
bargain carry over, and the generator is the cheapest in this half of the list.

**Watch out.** Par is n*n and the light mark is compulsory purely so that number
exists — the same annotation-counted-as-par the skeptic flagged on nonograms. Decide
it deliberately: either accept 36 taps at level three, or hold level three at 6x6
with a harder clue-sparsity band.

#### 11. Tilepaint — the painted tiles

*Counting · Straightforward · also Tairupeinto, Tile Paint, Crazy Pavement · Nikoli
(Puzzle Communication Nikoli)*

The skeptic confirmed the two things that matter most: the engine really is about
twenty lines, and uniqueness comes free (99-100% of random paintings are already
unique, so no carve equivalent is needed at all). What it left standing are two
design questions rather than two build problems, and both have house answers to
copy.

**Watch out.** The proposed over-count clash is a solver oracle — one sweep of taps
on an empty board exposes 85% of the must-stay-white tiles at 5x5 — so the honest
answer is that a wrong tap says nothing, as lights-out already does. The round-count
difficulty dial also collapses (1-2 passes at every size), so a second dial has to
be found that is not the grid, and growGardens must be replaced (92% of 7x7 draws
leave a one-cell tile).

#### 12. Signpost — the signposts

*Paths · Straightforward · also Pfeilpfad, Arrow Path · Simon Tatham's Portable
Puzzle Collection; a Janko puzzle called Pfeilpfad, contributed by James Harvey*

The drag becomes tap-source-then-tap-target, which Tatham already ships as his own
keyboard mode, so nothing is lost; one dispatch is one link and par is
squares-minus-one. Its second deduction — 'only one arrow can still point at that
square' — is rule two of eliminate() in logic-grid wearing a different coat, and
nothing in the nine draws its answer as a line.

**Watch out.** parVerifiability was scored 5 and should not have been: only the 3x3
level is BFS-able (456 states), while 4x4 passes 600,000 by depth 7. Tatham's
algebraic chain labels also have to be dropped under the no-metadata rule, so a
joined run must be drawn as a line on an SVG overlay — new rendering for this repo.

#### 13. Snake (Snake Pit) — the long snake

*Counting · Straightforward · also Snake Pit, Kringel · European puzzle-magazine
tradition; a staple of the Logic Masters and WPC circuit*

garden-cats donates touching(), orthogonal(), rowCells/colCells, the
boolean-per-cell state, the single toggle action, clashOf/describeClash, the roving
tab stop and the whole deal-fits-solveByLogic loop; a day of the build is already
written. What a child does is new twice over — following a chain round its bends,
and reading a number off the edge of a grid.

**Watch out.** Making grass half the answer dissolves the pencil-mark problem but
pushes par to n squared minus 2, so level three is 47 counted taps against
mini-sudoku's hardest 22 and the last dozen are clerical. Keep global connectivity
out of the solver, or the generator will ship boards whose key deduction is a
hypothesis a child cannot check.

#### 14. Unequal (Futoshiki) — the tall and the short

*Ranking · Straightforward · also Futoshiki, More or Less, Hutoshiki · Tamaki Seto,
Japan (Futoshiki), syndicated in British newspapers from 2006; in Simon Tatham's
collection as*

The skeptic tried to break the same-reference invariant and the move granularity and
could not — mini-sudoku's guards, keypad, roving tab stop and par-as-blank-count all
carry over verbatim — and it then built the carve the assessment had costed as free
and found it works: 27 of 40 boards at 5x5 with two givens, nine arrows and a
genuine chain of three that a deliberately memoryless solver finishes. It is the
only candidate in all 95 that fills the ordering-and-transitivity hole, and the
free-oracle failure that sank Aquarium, Map and the magic square provably does not
reach it, because the eliminations that matter involve empty neighbours and never
flash.

**Watch out.** shortestSolution throws on level 2 — a carved 4x4 with three givens
holds a median 305,760 conflict-free states against the 200,000 cap, because
Futoshiki drops the box rule and an arrow prunes nothing until both its squares are
filled — so decide before writing the test that levels 2 and 3 rest on the counting
argument. Then settle the piece: five bar heights sit about 7px apart in a 44px
cell, and printing the numeral to fix it turns the board back into mini-sudoku's
digits. Gate level 1 on 'not solvable with the arrows covered up' — 59% of boards at
the sketched parameters are.

#### 15. Ricochet Robots — the slippery ice

*Foresight · Straightforward · also Rasende Roboter, Randolph's robot puzzle · Alex
Randolph, published as Rasende Roboter by Hans im Glueck (1999) — mechanic only*

Hand-authored with par capped at 5, the BFS costs under 6,000 states and
garden-cats' board.module.css already carries the pitch table for the sizes wanted,
so the build is small and certain. The genuinely new idea is that a piece can be
sent across the board purely to stand where another one must stop — nothing in the
nine places a piece as a tool for another piece.

**Watch out.** With sixteen sends available every turn and Step back free, a child
can flail a board to a solve; the shell's 'It can be done in 4' line is the only
thing arguing back. Also decide up front what the raw arrow keys do, since every
other board spends them on a roving cursor and here they are the move.

#### 16. Goishi Hiroi — the stone path

*Route · Straightforward · also Hiroimono, Stone Picking, Pick-Up Stones ·
Traditional Japanese go-stone puzzle recorded from the early 1700s; revived in grid
form by Nikoli*

The assessor did the measuring and found the honest answer themselves: the generator
cannot produce bounded-mistake boards above eight stones (0 of 40 runs), so ship
three hand-picked boards as constants and logic.ts drops to about 180 lines with no
generator at all. Nothing in the nine has a route, a direction, a turn, or a board
that empties as it is played.

**Watch out.** Levels 2 and 3 are backtracking, not deduction: a wrong turn runs a
median of 6 taps at 5x5 and 9 at 6x6 before the board jams, then costs that many
Step backs. The current stone must also wear an arrow for the way it came, or the
never-turn-back rule is unobservable.

#### 17. The long table

*Rearranging · Straightforward · also The seating puzzles of puzzle books; the swap
is bubble sort's neighbour exchange · Invented here, designed backwards from par:
the goal is a condition rather than a picture*

The machine is frog-leap's (a row of pictogram pieces, a permutation of a fixed
cast, par proved by BFS over 120/720/5040 states, the whole graph enumerable while
dealing) and the rule is river-crossing's pairs field restated. What is genuinely
absent from the nine is a goal that is a condition with many satisfying states, so
the child picks a destination and pays for the distance to it.

**Watch out.** isSolved fires on any valid seating, so the 'fewest swaps' half of
the stated rules is not the win condition — and once the feuding seams are marked in
clay the puzzle is close to a hill-climb. Take the swap budget with failure()
(frog-leap's precedent) or the promise in the tagline is not the promise in the
engine.

#### 18. Alice maze — the rabbit's hops

*Route · Straightforward · also Alice mazes, changing-step maze · Robert Abbott,
SuperMazes (Prima, 1997); named for Alice's cake and bottle*

Tapping the destination square rather than the arrow keeps every target at a full
cell, makes counting the hop out part of the thinking, and gives garden-cats' roving
tab stop straight back. The (square, step) graph is at most 180 nodes, so par is
certified instantly, and step-reaching-zero is frog-leap's STUCK almost verbatim.

**Watch out.** 'Par about 6' is not a par — the generator has to accept only deals
whose BFS depth equals the declared number, lights-out's needsExactly discipline.
The cell is also the densest in the app (up to three edge chevrons, an effect
picture and the rabbit inside 44px), while the card cannot show the maze at all.

### Ranks 19 to 45 — real work

A generator, a solver class or an interaction has to be invented first. Several of
these are excellent puzzles; none of them is a weekend.

**19. Slant (Gokigen Naname)** — *The fence posts*, connections · also Gokigen
Naname  
The input is mini-sudoku's exactly — pick a square, tap one of two keys under the
board — and par is w*h with a one-line argument, so the engine half is a copy. What
has to be invented is the solver: uniqueness in Slant leans on the no-ring rule, so
the logic-only solver needs a union-find over vertices, and connected() in
garden-cats is a flood fill in a generator rather than a deduction.  
*Watch out:* The clue circles sit at grid vertices, so no button owns one and a
screen reader only hears a post if each square repeats its own corners in its label
— prose no board in this repo has had to write. There is also no BFS certification
available at any shipping size.

**20. Tatamibari** — *The floor mats*, fitting · also Tatami Bari  
The skeptic reproduced the pipeline and it holds at 4x4 and 5x5 (66%/43% unique, ~24
and ~50 draws a keeper), and it usefully overturned two of the assessment's own
blockers — DESIGN permits the rectangle preview shown for every cell, and the
no-four-corner rule was never load-bearing for uniqueness across 600 boards, so the
clashOf can go entirely. It fills both the carving and the shape holes.  
*Watch out:* 6x6 is where it breaks: shortestSolution exceeds its 200,000 cap on
about a quarter of boards, a keeper costs 1 in 625 draws against deal()'s
ATTEMPTS=400, and garden-cats' reasoned-or-anyBoard fallback is unsound here because
a fallback board can be ambiguous and carry the wrong par. Replace the random
partition with a count-targeted guillotine draw first.

**21. Net (NetWalk, Pipes)** — *The pipes*, connection · also NetWalk, FreeNet,
Pipes, Plumber  
It taps natively with no drag anywhere, the state is 25 small integers, and it would
give the app its first piece with an orientation and its first picture of things
joining up. But the skeptic broke two of the assessment's own proofs: the
per-tile-sum par returned 12 against a BFS 16 on a two-solution board, and 32 of the
192 possible 3x3 boards blow shortestSolution's default cap.  
*Watch out:* Par varies per seed (3x3 ranges 1-23, modal in 13% of deals) and
PuzzlePage prints it as fact, so every level needs lights-out's needsExactly bolted
onto a nested generator whose joint acceptance was measured at 0.15%. Separately,
u-press translates a pressed button 2px, which visibly tears the pipe join with all
four neighbours — the first board whose artwork must line up across button
boundaries.

**22. Battleships (Solitaire Battleships / Bimaru)** — *The hidden boats*, counting
· also Solitaire Battleships, Bimaru, Battleship Solitaire, Yubotu  
It has the most thoroughly de-risked generator in the whole second cohort: a fixed
budget of 2/3/3 printed boat squares yields 60/60, 58/60 and 51/60 boards with a
constant par of 5/7/11, so deal() never falls through garden-cats' 400-attempt loop
and PuzzlePage never prints a par that wobbles. The skeptic also measured the
pencil-mark load the assessment feared most and found a median of zero remembered
crosses — better than garden-cats manages — because the printed counts and the drawn
boats regenerate the water knowledge on every glance.  
*Watch out:* The fleet rule can only live in isSolved, so a child can reach a board
where every edge number is moss, nothing is clay, and it still says they have not
finished — a median of 5 such boards at 5x5 and 32 at 7x7, and no shipped puzzle has
that failure mode. The only cure is a fleet strip that doubles as a complete
are-you-done meter, so settle that fork first; and note garden-cats' touching()
cannot transfer at all, since its eight neighbours include the four that are the
rest of the boat.

**23. Galaxies (Tentai Show)** — *The flower beds*, symmetry · also Tentai Show,
Spiral Galaxies  
Re-expressing the boundary lines as 'pick a flower, tap a square, and the square
opposite comes with it' is the best input translation in the whole list — it makes
the half-turn rule the thing the board does rather than something to check, and it
deletes the stray-line bookkeeping entirely. Par has an airtight closed form and it
fills two untouched holes, carving and symmetry.  
*Watch out:* There is no repair operator: garden-cats' carve moves a square between
given regions, but here the regions are the answer, so a second solution can only be
killed by re-dealing or adding a flower — and the 6x6 hit rate is unmeasured. The
seven-colour ceiling in garden-cats/Board.tsx also caps the bed count at seven.

**24. Mirror routing** — *The mirrors*, routing · also Laser maze, beam bending,
Deflektor-style routing  
garden-cats' carve ports almost directly to carving walls that kill an alternative
route, par is the mirror count, and it fills the biggest named gap — lines and paths
— without the drag problem that stops Loopy and Bridges. It would also bring the app
its first piece with an orientation and its first thing that travels along a line.  
*Watch out:* The assessment's own first blocker is that a live beam lets a child
steer greedily to an answer, and its fix is a greedySteer rejection filter whose
yield was never measured — the same fix that was measured to collapse Aquarium's
generator. There is also no logic-only solver, so uniqueness and 'a child can find
it' stay two separate checks rather than garden-cats' one.

**25. Bridges (Hashiwokakero)** — *The island bridges*, connections · also
Hashiwokakero, Hashi, Chopsticks  
It is the cleanest gap in the collection — no shipped puzzle draws an edge between
two things, uses a printed number as a count, or has a piece spanning more than one
cell — and the tap re-expression (tap island, tap island) is honest. The cost is
that it needs a counting-only solver written from scratch and two feedback paths in
one board, which nothing shipped wires together.  
*Watch out:* It needs both a refusalOf (a crossing cannot be drawn) and a
clash-that-lands (an over-filled number), and hanoi/balance-scales use the first
while garden-cats/mini-sudoku use the second — no board here has both. Level three's
par also cannot be BFS'd, and the numbered islands leave this the first board in the
app with no picture on it anywhere.

**26. Yin-Yang (Shiromaru-Kuromaru)** — *The paving stones*, connection · also
Shiromaru-Kuromaru  
Roughly two thirds of the board, CSS and engine are mini-sudoku's, the
bank-plus-symmetry-group answer to generation is the shape mini-sudoku already
ships, and its sixteen transforms (eight of the square plus the colour swap)
provably preserve the rules and the solution count. It puts connectivity in front of
a child, which currently only exists inside garden-cats' generator.  
*Watch out:* The named unknown is real and could lose a whole sitting: only two
child-level techniques exist (the 2x2 forcing and the sealing-off argument), and if
they are too weak the generator answers by stuffing in givens until 60% of the board
is printed. Also check --p-bone against --surface-sunk before committing to pale
stones — they are almost the same colour.

**27. Tip the tray** — *Tip the tray*, foresight · also ThinkFun's Tilt; the
ice-slide floors of a hundred video  
The mechanical half is flawless — one tip is one dispatched action with no selection
step at all, and the reachable graph peaks at 535 states, three orders under the cap
— and four big buttons is the cleanest keyboard story of any candidate. The design
half has a hole the skeptic proved rather than suspected.  
*Watch out:* The generator filter the whole design leans on mathematically
guarantees that pressing any button which does not visibly drop a mouse always wins:
25,000 greedy playthroughs of filtered boards, zero losses. Unfiltered, 30-38% of
live positions strand the child in silence. Somebody has to invent a third option
before this is worth starting.

**28. Dosun-Fuwari** — *Balloons and stones*, stacking · also Dosun Fuwari, 'thud
and float'  
The generator blocker that held it at raw 33 was largely fiction: forward rejection
sampling finds unique 5x5 and 6x5 boards once in 85 to 298 draws at 350-1,170 boards
a second, 99% of unique boards finish under logic alone, and the repo's own BFS par
test ports with a graph of 600 to 21,964 states. What it cannot do is ramp — more
patches lowers the solver's round count and more size collapses the yield, so
garden-cats' rounds band has no analogue here and a level-3 bank buys squares rather
than thinking, against a hard constraint that levels go 1 to 2 to 3.  
*Watch out:* The support rule constrains only the finished position, so the sketched
six-line reduce is wrong three ways: a balloon placed in mid-air returns a new
object and enters the move tape, and removing a balloon with balloons under it
forces either an ordering rule on undo the shell cannot teach or a cascade that
clears several pieces on one dispatch. Blocked squares also put a stone in the top
row of 43-71% of finished answers, which is the one picture the two-sentence pitch
cannot survive.

**29. Cosmic Express (train routing: pick up and drop off)** — *The two-seat train*,
routing · also Train routing, pick-up and drop-off puzzles  
Head-extension (tap a square touching the end of the line and the track grows into
it) is the honest shape for an ordered thing, makes one tap one countable move, and
lets the shell's Step back be the rubber — which halves the branching and keeps par
equal to the shortest working track. Keeping Go as a dispatched action rather than
simulating live is what stops it becoming greedy trial and error.  
*Watch out:* Track squares are elbows, straights and ends computed from the square
before and after, which is more drawing than any shipped board, and there is no
runtime generator — the three levels must be hand-authored with the BFS in the loop,
since two of three sketched by eye had no solution. An open 6x6 also passes 400,000
states, so levels must stay walled.

**30. Number pyramid** — *The brick wall*, sums · also Zahlenmauer, number wall,
addition pyramid, brick wall sums  
The generator is the one part that survived verification intact — greedy clue
removal landed on exactly `rows` clues in 900/900 deals with zero fallbacks, so par
is a genuine level constant — and it fills the arithmetic hole that water-jugs only
pretends to. Everything downstream of the generator is still an open design problem.  
*Watch out:* The skeptic found no branching decision at any level (find a triple
with two of three filled, do the sum, repeat), four physical taps per counted move,
a 12-13 key pad with two different rub-outs, and a clashOf that cannot avoid blaming
a printed given while the just-written brick is innocent — the one thing
mini-sudoku's clash design refuses to do.

**31. Sokoban** — *The farmer's crates*, space · also Warehouse keeper, crate
pusher, box pushing  
Counting a push rather than a step is the right call and the BFS fear was two orders
too pessimistic (5,985 states for a 6x6 with three crates at par 22), so the engine
is affordable. The problem is that the same measurement shows 83% of that board's
reachable states are already lost and 45% of a 5x5's opening pushes kill it
outright.  
*Watch out:* The promised level one where nothing can be trapped does not exist at
any shippable size (0 of 2,994 layouts), and the design fork has no clean horn: an
exact failure() oracle does the deadlock foresight that is the puzzle, while
refusing pushes onto statically dead squares needs either a legality tell DESIGN
bans or an invisible rule over 14 of 36 cells.

**32. Tracks** — *The little railway*, paths · also Train Tracks, Railroad Tracks  
It fills the two loudest holes at once — a path, and a number at the edge of a grid
— and the skeptic's prototype vindicated the parts that usually kill this family:
the propagation solver's uniqueness is sound (0 mismatches in 180 boards against an
exhaustive counter) and a real BFS certifies par at 5x5 with a sound seam prune.
Everything else has to be bought.  
*Watch out:* Constraint 11 bites harder here than anywhere else in the set: at the
peak the board cannot hold 19 of 25 squares' worth of facts at 5x5 and 34.5 of 49 at
7x7, mask 0 means both 'ruled out' and 'not yet looked at', and the live gutter
tally offered as the fix is inert because a square only counts once its shape is
committed. Cap it at 6x6, hunt par at a 5-10% yield rather than reading it off the
path, and fix isSolved to check the clue counts — as sketched it accepts 600-1,500
squiggles per board.

**33. The traffic jam (Rush Hour / Tokyo Parking)** — *The car park*, unblocking ·
also Rush Hour, Tokyo Parking  
The state is a list of lane offsets, reduce is one guard, and enumeration confirms
BFS certifies par at the shipping sizes — mechanically it is as clean as claimed.
Three costs the assessment scored away are real and structural, and it would be the
fourth counted-move planning puzzle out of ten while the paths, counting, arithmetic
and carving holes stay empty.  
*Watch out:* This is the collection's first divisible move: 43% of optimal slides
are longer than one square, so a child with a perfect plan who pushes one square at
a time is told by the shell that it could have been done in far fewer. There is also
no handle for a car — eleven pieces against eight --p-* colours, two of them the
clay and moss the refusal and solve already own.

**34. Rolling block maze** — *The tipping block*, space · also Tipping block maze,
block-tipping maze, Bloxorz-style maze  
The engine is instantly certifiable (40-96 reachable states) and it is the only
candidate that gives a piece an orientation for almost no code. But the level ladder
does not exist as written — the skeptic measured the three described floors at
roughly par 4/6/7 rather than 6/14/22, because a solid rectangle caps at 7-8 at
every size and a one-tile corridor disconnects the maze rather than deepening it.  
*Watch out:* Making the grid scenery leaves the floor plan unreadable to a screen
reader, which no shipped board does, and a tip is illegible without the app's first
rotation animation — between renders the footprint simply jumps two cells. Boards
that genuinely reach par 22 exist but look like static, and there is no quality
measure to search for a legible one.

**35. Dominosa** — *The domino set*, pairing · also Domino puzzle, Domino Solitaire,
Adler's puzzle  
The arithmetic reproduced exactly (partial-matching counts, hit rates within a
point, zero non-unique boards in 1,200) and the generator and engine really are
house-shaped, with a real BFS certifying the first two levels. What fails is the
playability argument the whole case rested on.  
*Watch out:* Zero boards at any of the three sizes are solvable by the local rule
alone — every one needs the global 'this domino type has only one home left' scan,
8.9 times per board at level three across 49 adjacencies. The roster answers which
tiles remain, not where they can go, so it is not the answer to pencil marks the
assessment claims.

**36. Filling (Fillomino)** — *The patchwork*, counting · also Fillomino, Allied
Occupation  
Carving while a restricted solver still finishes — garden-cats' own method — gave
160 of 160 boards that were both logic-solvable and provably unique, so the headline
generator blocker is softer than the assessment claimed and mini-sudoku's chassis
really does carry. The numbers underneath it do not: realistic 6x6 par is about 20
rather than the stated 23 and 24, twelve givens never occurred in 40 boards, and
pinning par to a printed number forces givens up, which flattens the level 2-to-3
ramp the whole sketch is built on.  
*Watch out:* shortestSolution blew past 200,000 states on three of four level-one
boards and on every 6x6, so this would be the first fill-in here with no BFS proof
at any level. And 18% of forced writes at 5x5 and 28% at 6x6 need a
how-far-could-this-patch-still-reach flood rather than a sentence a child says, so
the restricted solver certifies uniqueness honestly and child-solvability
dishonestly — and the same slip inside clashOf refuses legal moves and ships boards
with zero or two answers.

**37. Matchstick puzzles** — *The little sticks*, shape · also Match puzzles, moving
matches, toothpick puzzles  
Measuring displacement rather than physical moves is a genuinely good idea — it
removes the counter from the state, lets a child shuffle freely, makes BFS depth
equal par exactly, and hands constraint 9 the only rule there is to break (one stick
too many). It fills the shape hole, which nothing else affordable does.  
*Watch out:* Diagonals are impossible — a cell's two diagonals share one midpoint,
so the two slots are untellable apart — which deletes the fish, the cow and the
glass, the charming half of the tradition. Edge buttons also need about an 80px
cell, the arrow keys must walk a half-grid lattice nothing here has, and every
figure needs an offline brute-force pass.

**38. Numberlink** — *Join the pairs*, routes · also Nanbarinku, Arukone, Flow,
Number Link  
Growing a path square by square is the paths family's cleanest port, childFit is the
highest in the second cohort, and every pictogram it needs already ships. But
uniqueness is not deducibility here — child-sized edge propagation finished only 12
of 25 unique 5x5 boards and 14 of 25 at 6x6 — so the proposed test, which only
proves one solution, would put a coin-flip chance of a search-only board in front of
a child, and this repo has never accepted that substitution.  
*Watch out:* The technique that closes the remaining boards is one-ply proof by
contradiction over seams, and a path that grows from one fixed end can record none
of it — constraint 11 biting harder than in garden-cats, where the unwritable facts
were an optimisation rather than the method itself. Correct par first: the tap that
arrives at the twin costs a move, so par is n*n minus the pair count (21/31/42), not
17/26/35. And the board is modal in a way useEphemeral is built to prevent, with at
most 4 of 49 squares live at any moment on level 3.

**39. Drawing it in one stroke (Euler paths / Haus vom Nikolaus)** — *One long
line*, paths · also Haus vom Nikolaus, unicursal figures  
The engine, the refusal and the no-annotation claim are all genuinely excellent —
one tap is one line inked, three refusal sentences cover every rule, and the inked
lines are the working. But the skeptic enumerated ~10,400 Eulerian lattice figures
and found trap-free ones only at 6-11 lines, none at 12-16, and the trap-free ones
that exist have no decisions left after the opening tap.  
*Watch out:* Guess-free and worth-a-sit-down are mutually exclusive here, so it
ships as two levels of 8-10 lines against the contract's three. Par can also never
be exceeded (there is no un-draw), which makes the shell's 'It can be done in N'
branch dead code, and the lattice does not restore arrow keys.

**40. The magic square (Lo Shu)** — *The nine tiles*, arithmetic · also Lo Shu
square, the magic square of three  
The engine is mini-sudoku with one predicate changed and both of the costs this
cohort usually pays are genuinely nil — 13,327 BFS states at par 6, par exactly the
blank count — so levels 1 and 2 would ship in a sitting. Level 3 is where it dies:
only two rank patterns exist in the entire child-sized number family, so the
'different nine numbers' meant to stop memorisation are rank-identical to 1-9, the
puzzle has two answers ever, and the promised four-pass board does not exist (three
is the ceiling).  
*Watch out:* The clash sentence performs the child's addition out loud and rewind
erases the cost, so a tapper who does no arithmetic at all finishes level 1 in a
median of 7 placements against par 4 and level 3 in 18 against par 6, with the
counter still reading par. Also settle where a diagonal's running total lives — it
is the only constraint on the board with no drawn region and nothing for the cue to
light; and 16 of the 80 unique three-clue masks have no forced chain, so uniqueness
and no-guessing are two checks here, not one.

**41. Pattern (Nonograms / Picross)** — *The hidden picture*, counting · also
Nonogram, Picross, Griddler, Paint by Numbers  
Generation is easier than the assessment feared (68-75% of random fillings uniquely
line-solvable at these sizes, nine of twelve freehand silhouettes worked first try)
and par is provable structurally the way mini-sudoku's 6x6 already is. Everything
downstream of the board is what fails.  
*Watch out:* The proposed refusal is a zero-cost complete answer key — probing both
marks on each square is the line solver, and refusals are never dispatched, so a
child reading the clay flashes solves a 5x5 in 50 free probes and lands on exactly
par. The honest design is that a nonogram has no illegal move at all, which then
leaves 50 taps for one repeated deduction at level one.

**42. Norinori** — *The paper strips*, pairing · also Nori Nori (from nori, the
seaweed sheet)  
reduce is clean, par is exactly the patch count, BFS with garden-cats' own prune
sees only 251 states at 4x4 and 1,874 at 5x5 so the par proof is real at every
level, and random legal play solves a board 0-3% of the time. What does not exist is
level 3: 6x6 with six patches produced zero unique boards across four generators and
thousands of trials, and the only builder that reaches 6x6 at all is structurally
incapable of a strip that straddles a patch — over 80 shipped boards the
forced-partner and patch-full rules never fired once.  
*Watch out:* Take straddles back and the ladder caps at 5x5, where the
forced-partner deduction fires 1.3 to 4.5 times a board — a lone shaded square whose
partner is unknown, which the strip-is-one-move design makes physically
unrecordable. Generation also costs 6.84s per shippable 6x6 board against
garden-cats' measured 11.6ms at 7x7, so reseedable is off the table, and 'no two
strips touch' is edge-only here while garden-cats' identical words include the
corners.

**43. Solitaire Chess** — *The last one left*, foresight · also Capture-only chess
puzzle, one-piece-left chess  
The engine survived attack completely — sixteen slots, a one-line reduce guard, and
a whole reachable graph of 17 to 1,376 states — and the board shrinking as it is
played is an absence the docs name outright. The generator is where it dies.  
*Watch out:* Unique-solution rates are 4.3% / 1.07% / 0.07% / 0.00% at 4 / 5 / 6 / 7
pieces, so garden-cats' 400-attempt budget finds a unique level-3 board on 10 of 60
seeds — and at that size 90-95% of legal first moves win, the opposite of the
claimed one line through. It ships only as hand-authored boards found offline, plus
a legend for four move shapes that no pictogram can carry.

**44. Sokobond** — *Holding hands*, space · also Atom bonding puzzle, molecule
building puzzle  
The machine claims hold: par is a real BFS number over graphs of at most 641 states,
one press is one move, and reduce returns the same reference for a blocked press
without special pleading. The child-facing half does not.  
*Watch out:* Across 7,572 dead states, 100% still had somebody with a free hand and
a legal press, so the proposed failure sentence is false everywhere and the only
honest one is a verdict from a search that then locks the board — with 65-83% of the
reachable graph dead by levels 2 and 3. There is also no rule a child can break, and
the level-3 board as specified does not exist.

**45. Inertia** — *The sliding mouse*, route · also Inertia  
The state machine is clean (49 x 2^8 = 12,544 states, so par is cheaply
BFS-provable) and 7x7 at 44px already ships in garden-cats, so the engine half
survives. The input and the play do not, and the fix has no obvious shape.  
*Watch out:* The eight neighbouring cells cannot be direction buttons — in all nine
shipped boards a tap means 'put it here', and here it means 'shoot past here' —
there is no eight-way keyboard scheme in the repo or on a laptop, and the roving
cursor is stranded after every slide. Worst, Step back is one primary tap, so
probing a fatal slide costs two taps and the puzzle degrades into roll-and-undo.

### Ranks 46 to 63 — awkward fit

Each of these has a working engine and fights a house rule anyway: a par the shell
prints and the puzzle structurally cannot hit, a refusal that hands the answer over
free, or a level ladder whose middle rungs measurement says do not exist.

**46. Towers (Skyscrapers)** — *How many you can see*, counting · also Skyscrapers,
Wolkenkratzer, Hochhauser, Buildings  
The engine half is free — mini-sudoku's guards, keypad and par convention all
transfer — but two of the three sketched levels produce no dealable boards at all:
level 2 yielded 237 unique boards in 40,000 deals and zero of them solvable without
candidate sets, and level 3 is 6.2% unique of which 4% are child-solvable. All 4n
edge clues is the maximum information Towers has and it is already ambiguous 40% of
the time at 4x4, so there is no garden-cats-style carve to reach for; the
generator's starting board fails outright.  
*Watch out:* Par is 16/16/23, not the stated 12/15/21, because the clues sit in the
gutter and levels 1 and 2 start with every square empty — double the app's highest
difficulty-1 par, identical across two levels, and unprovable by shortestSolution
(over 5,000,000 conflict-free positions on a 4x4). A full-line count check plus free
undo also turns every row into a 24-way question the board marks for the player, and
the card is undrawable as anything but mini-sudoku's grid inside a numbered frame.

**47. The coin triangle** — *The coin triangle*, shape · also The ten-coin triangle,
the bowling pins puzzle  
It is the best-measured candidate in the whole set — every state count reproduces
exactly (244/par 2, 19,111/par 3, 146,371 at fifteen coins) and engineFit and
one-tap-one-move are honestly earned — but the touch-two rule that keeps par
BFS-provable also prints the destinations: only 9 of 42 empty holes are ever a legal
landing place at ten coins, all three answer holes among them, and probing a refusal
costs nothing. Relaxing the rule is not available, since depth 3 is then 1,416,766
states.  
*Watch out:* There is no level 3 left. level.par is a static field PuzzlePage reads
directly, so a seeded par is impossible, and the natural invented target is par 4
only if pinned to exact holes and par 2 as a shape — while level 1 already forces
isSolved to be shape-invariant. That leaves two fixed boards, no rng, about two
minutes of content, a card of ten identical small discs against Scene rule 4, and a
countdown that is literally par counting down, which DESIGN bans by name.

**48. Aquarium** — *The fish tanks*, counting · also Water Fun, Aquarium puzzle  
It has the cleanest engine of any candidate — a five-line reduce, levels.join(',')
as the key, par by a one-line counting argument — and it fills the second-loudest
gap. It is ranked here because the skeptic replicated every number and then showed
the puzzle is caught in a squeeze the design cannot escape.  
*Watch out:* The two blockers are the same blocker: pinning par by requiring every
tank to hold water hands the mindless greedy climber the same rule, lifting its win
rate from 59/25/10% to 84/74/38%, and filtering against a two-retry climber leaves
0.01% of 5x5 draws. Level one cannot be generated guess-free at all; what remains
buildable is 7x7 with no over-full cue, which is a different puzzle.

**49. Palisade (Five Cells)** — *The five-square pens*, dividing · also Five Cells,
FiveCells  
The machinery was built rather than estimated and it is genuinely fine —
501/4,006/27,950 divisions at the three sizes, 75-86% pinned by their full clue
grid, clue-dropping landing right on the sketched 5-10 clues, a guess-free solver in
about sixty lines — and the connectivity refusal is honest, catching 6,383 of 6,384
bad full paintings on the fifth square. Par is what fails, and it fails structurally
rather than by tuning.  
*Watch out:* Pen colours are interchangeable, so a correctly reasoned solve repaints
— measured par+0.9 at 4x5 and par+1.9 at 5x6 for a perfect reasoner — and the shell
answers nearly every honest solve with a number no test here can check (5^20 states
at level 1). The same interchangeability breaks hard constraint 1 with no repair:
renaming a pen returns a new object, records a move and adds a tape entry for a
position that did not change, and canonicalising inside reduce would make the
child's colours jump under their finger. Level-1 par 20 is also 2.5x the app's
largest difficulty-1 par.

**50. Alcuin's jars** — *The three baskets*, sharing · also The twenty-one barrels,
the thirty flasks  
The combinatorics are exactly right (1 answer at 9 jars, 1 at 15, 2 at 21) and the
engine is trivial, but the skeptic showed the puzzle has no content: because the
shelf divides exactly and the refusal enforces the per-basket caps, every complete
placement that was never refused is a solution — 216/216, 54,000/54,000,
20,991,600/20,991,600.  
*Watch out:* The refusal does the child's thinking and the two totals are
decorative, so the only skill left is dodging dead ends — which 62-68% of legal
positions already are, with nothing on screen saying so and no failure() in the
sketch. Somebody has to decide what the broken rule actually is before a line is
written.

**51. Nurikabe** — *The little islands*, counting · also Islands in the Stream, Cell
Structure  
The machinery survives — reduce is a clean same-reference five-liner, par is n
squared minus the clue count without needing BFS at all, one tap is honestly one
move, and refusal-probing hands nothing over (0 of 343 boards fall to it). The child
does not: of 43,195 unique guess-free 5x5 boards swept exhaustively, 14 can be
solved by 'count the island out, wall it in, keep the numbers apart', and in the
sketched configuration 343 of 343 need reachability under a size budget, 341 need
the no-2x2 rule and 328 need a seventh technique the assessment never names.  
*Watch out:* The gentle first level is not mistuned — it does not exist at 5x5 in
any configuration, and the level 2 and 3 techniques are already load-bearing at
level 1, so the ramp collapses and levels 2 and 3 stay unmeasured (0 of 775 clue
placements finishable). Land and unknown are also the same colour, --p-bone on
--surface-sunk being a 4% luminance difference, and the offered fix is a pencil mark
drawn on a material.

**52. The bridge and the torch** — *The one torch*, scheduling · also The night
crossing, the flashlight problem  
The engine is river-crossing's { type: 'cross', passengers } machine plus one
integer, which is also the objection: as a tenth card it is a re-skin of the third,
and the honest cheap version is a fourth river-crossing level. It fills the
costs-and-scheduling hole, but only by adding a number to a board the app already
draws.  
*Watch out:* The dead-end story has no good horn. Level 2 has 194 reachable
under-budget states of which 7 are winnable, so 186 dead ends are silent and the
bust lands three or four crossings after the losing move — at which point the
shell's hard-coded 'Go back one move and try another way' is false advice. An exact
unwinnability check turns failure() into a one-bit oracle that solves the puzzle
without arithmetic.

**53. Map** — *The four paints*, adjacency · also Four-colouring puzzle  
The skeptic rebuilt the generator, reproduced the round counts almost exactly and
confirmed the BFS is cheap and the puzzle honestly markless — and then measured the
play. It is mini-sudoku's reasoning with one deduction technique removed, drawn on
garden-cats' card, and distinctness of 2 is the honest score.  
*Watch out:* The same mindless tapper that beats garden-cats level 1 only 4.9% of
the time beats this level 1 46.1% of the time, because the constraint graph is local
and sparse — so the app's own red flash becomes a complete oracle. A blank country
also has no handle at all before it is painted: no colour, no aria-label, and
describe() has no honest sentence for the move tape.

**54. Keen (KenKen / Calcudoku)** — *The little sums*, calculation · also KenKen,
Calcudoku, Mathdoku, Inky, Kashikoku Naru  
reduce is clean, one digit key is one move, the board fits and generator yield is
fine (82% unique at 4x4) — and none of that helps, because par is provable at no
level (a real 4x4 board holds 557,000 to 4,400,000 BFS states against the 200,000
cap, and garden-cats and logic-grid were mis-cited as cell-count precedents) and the
solver-round band the level ladder rests on never once reached 5 in about 5,000
generated boards, so levels 2 and 3 would differ only in size.  
*Watch out:* The cage cue performs the child's addition and grades it, which with
free undo turns the app's one arithmetic puzzle into a trial puzzle; and at 4x4 a
two-cell sum names its pair outright for four targets in five, so the arithmetic
content is one clue in five. Level 1 as written is also a parity impossibility —
sixteen cells cannot be one single-square cage plus dominoes — and a head-only
solver finished 0 of 35 boards at the sketched level 3.

**55. Nim (the game of 21, the subtraction game)** — *The last counter*, strategy ·
also The subtraction game, the game of 21, Bouton's game  
This is the same puzzle as The last biscuit, which was attacked and lost seven
points; it went unchallenged and kept 36, which is the single largest inconsistency
in the set. Its level ramp is genuinely better — moving the bad numbers from
multiples of four to five, then the two-row equalise-and-copy invariant — so it sits
a rank above its twin and nowhere near its raw score.  
*Watch out:* Every defence this app is built on comes up empty: the only refusal is
a move that changes nothing (so the control should be dead), free rewind exhausts an
8-state tree in about twenty taps, there is no analogue of balance-scales'
candidates().length === 1 to refuse a brute-forced win, and the shell's 'go back one
move' advice is false 100% of the time because the mistake is always two or three
turns behind the loss.

**56. The knight's tour** — *The horse's walk*, routes · also The horse's walk,
turagapadabandha, the knight's circuit  
Its own assessment enumerated the graphs and found 99.8% of unguided play dead-ends
at 4x5 and worse at 5x5, with no local certificate that a move is right —
Warnsdorff's rule is a heuristic a hint can teach, not a deduction a child can
check. That is a constraint-10 failure, and generator 2 is the lowest score in the
contender set; 35 was far too generous.  
*Watch out:* A guess-free version needs a holed board plus a forcing solver over
Hamiltonian paths — a second sitting at minimum, and a solver class nothing in this
repo has. Par is also squares minus one by a one-line invariant, so it can never
separate a good solve from a lucky one, and BFS blows the cap from a 5x5 corner
(508,461 states).

**57. Choco Banana** — *The chocolate bars*, shape · also Chocolate Banana  
Generation is easier than the assessment feared — 63-74% packing yield, every
fully-clued board unique, about 30ms a board, and the exact counter is 60 lines of
ordinary backtracking rather than a frontier search — but at 5x5 to 7x7 both halves
of the advertised rule are nearly inert: 80% of the dark shapes are single squares,
dominoes or trominoes, and the pale side is one blob, 1.1 regions to a board.  
*Watch out:* What is left is counting, and the clues average 9.9/15.8/21.6, top out
at 37 and are two digits more than half the time, on squares a child has no way to
mark; clamping them to countable numbers leaves 4 of 40 boards unique at 6x6, so
that repair is closed. Par is the dark count and swings 6-13 by seed while
PuzzlePage prints it as a fact, and with only two cell states valid and solved are
the same predicate, so no consistent refusal policy exists at all.

**58. The gatekeeper (Zendo / Eleusis, probe-and-name)** — *The gatekeeper*,
experiment · also Zendo, Eleusis, the scientific-method games  
Generation is free (3,432 of 3,432 level-3 walls pairwise separable) and par is
trivially provable at about 6,144 BFS edges — but the skill the level sketch sells
is measured to be free too: 96.7% of all trays are an optimal first ring at level 2,
every splitting tray is optimal at levels 1 and 2, and minimax depth is exactly
ceil(log2 k) for every wall, so fits rejects nothing and levels 2 and 3 share par 4.  
*Watch out:* Seven tappable rule cards are 336px on their own against a 333px phone
stage, before the larder, the tray, the bell and the record rail — about 596px of
board in 333px. The state sketch also drops balance-scales' allowed budget, the only
thing stopping a child ringing every tray, and the offered fix — a strike refused
with 'you have not shown the gatekeeper anything that rules this one out' — costs no
move and so simply prints candidates() on request.

**59. Pancake sorting** — *The pancakes*, sorting · also The burnt pancake problem,
prefix reversal  
Every mechanical claim checks out — one tap is one flip with no selection step,
distinct sizes make the same-reference guard exact, 5,040 states at n=7 — which is
precisely the point: a puzzle can meet every hard constraint and still ship empty.
Nothing is forbidden, nothing is a dead end, nothing is deduced, and no answer is
unique.  
*Watch out:* The only strategy the hints can teach lands on par for 54% of level-1
deals, 27% of level-2 and 15% of level-3, so the solved notice praises the easiest
level for nothing and scolds the hardest for doing it right. The card is also
HanoiIcon's silhouette — a column of size-graded bars, biggest at the bottom.

**60. The last biscuit (Nim / subtraction games)** — *The last biscuit*, strategy ·
also The game of 21, subtraction games, misere Nim  
The build cost is genuinely low and the two-agent hole is genuinely open, but the
pitch was never checked: misere on thirteen with takes 1-3 is a loss for the child,
and the alternative 'takes 1 to 4 on fifteen' is a loss too. Two of the three
shipped configurations are unwinnable as written.  
*Watch out:* What survives renumbering is worse — the level-2 tree is 8 states and
21 edges, so the shell's free rewind exhausts the entire level in about twenty taps,
and unlike balance-scales there is no clause isSolved can carry to refuse a
brute-forced win. Hint three at par 2 can only be the answer.

**61. The thin ice** — *The thin ice*, route · also The collapsing-bridge and
melting-floor puzzles of platform  
The machinery is all fives and the fetch-and-return repair was the right instinct,
but the repair does not survive measurement: a round trip's solution set is closed
under reversal on 164 of 164 boards, so a board with exactly one answer is always
the straight there-and-back the design says to reject, and par came out at exactly
twice the Manhattan distance on every board generated — a number readable off the
grid without solving anything.  
*Watch out:* The one thing it would have added, counting as a clue, provably cannot
be built: a shortest grid round trip is monotone, so no square is ever stood on
three times (124 candidate boards found, 0 unique). shortestSolution also throws on
28% of 5x5 and 72% of 6x6 boards, and failure() is a choice between letting a child
walk a dead board for an average of 12.5 more moves or a per-render 25k-200k-state
search that hands over the answer.

**62. Klotski** — *The big block*, space · also Huarong Pass, L'Ane Rouge, Dad's
Puzzler, the Pennant Puzzle  
The skeptic corrected three blockers upward — the BFS is 92ms not 4 seconds, the
shape key lives only in the test so it forces nothing on the materials, and the
keyboard needs no mode — and then confirmed the objection the assessor named and
scored past: Klotski has no deduction, no rule to refuse, and therefore no hints
that can meet garden-cats' bar. It fills none of the ten named gaps.  
*Watch out:* The level table does not survive: of the 421 states at graph distance
40 from a solved 4x5 packing, 147 are already solved and the median true par is 5,
because distance-to-one-arrangement is not distance-to-the-goal-condition. A genuine
par-40 path is also 300-500 taps for a child.

**63. Fifteen** — *The sliding tiles*, space · also 15-puzzle, Gem Puzzle, Boss
Puzzle, Mystic Square  
Distinctness 2, no dead end, no wrong answer, and no deduction — pushing tiles at
random always finishes, so the only thing at stake is a count. It would be the
fourth counted-move permutation puzzle in a collection of nine and it fills none of
the gaps named above.  
*Watch out:* PuzzlePage prints 'It can be done in {par}. Want another go?' whenever
moves exceed par, and no eight-year-old solves a par-16 sliding board in 16 — so
above a short scramble that line fires on every single solve and names a number the
child cannot act on. BFS also caps the board at 3x3 for good (3x4 is 239 million
states).

### Ranks 64 to 67 — wrong for this app

Four where building is the wrong call at any price. Two because a child provably
cannot reason to the answer; two because the result is a puzzle already on the shelf
with one noun changed.

**64. The roundabouts** — *The turning tray*, sequence · also The quarter-turn
family the Rubik's cube's small relatives  
On the 2x3 tray the group generated by the two posts contains no 3-cycle and no
transposition at all, so no sequence of any length can disturb fewer than four
squares; on the 3x3 the cheapest 3-cycle costs 8 turns against a level par of 6.
'Place an animal and leave it there' is provably impossible at every size the
200,000-state cap allows, which means there is no method to teach and no honest
third hint to write — against a contract that requires three.  
*Watch out:* A machine-perfect three-turn lookahead on the board's own status signal
solves 2% of level 3 and about half of levels 1 and 2, so the honest verdict is not
that a child would brute-force it but that a child would not finish it. Level 1 also
has fourteen distinct boards ever, against lights-out's own test standard of at
least twenty in fifty seeds, and the turn's directedness means the proposed
backwards generator prints a false par on 57% of them.

**65. Nondango** — *The dark stones*, avoidance · also Non-dango  
A generator-independent bound caps a 7x7 board at about thirteen stones — total
stones is at most the patch count plus the number of three-cell windows holding two
dark stones, measured at 4.2 to 5.7 — so most patches structurally cannot be given a
choice at all. Across four builders, 70-77% of dealt boards end with zero patches
offering any decision, and 2,400 randomised searches that refused to strip a patch
below two stones produced 0 unique boards at every size.  
*Watch out:* What would ship is 'find the patch with one circle', repeated par
times, on garden-cats' board with garden-cats' generator and one rule swapped — and
the difficulty ramp runs backwards, the share of patches handed over free rising
from 78% at 5x5 to 81% at 7x7. The engine, move granularity and par really are
fives; there is simply nothing behind them, and --p-slate is both the seventh patch
colour and the proposed stone.

**66. The Chinese rings (Baguenaudier)** — *The linked rings*, sequence · also
Baguenaudier, Cardan's rings, the Nine Linked Rings  
The reachable set is a path of 2^n states — degree distribution {1:2, 2:2^n-2} for
every n from 2 to 9 — so exactly two taps are legal everywhere and one of them is an
undo. Because a refusal never dispatches and never reaches history or the move
count, 'tap rings until one takes, never the one you just tapped' is a complete
no-thought solution that returns exactly 10, 21 and 42 moves: par at all three
proposed levels.  
*Watch out:* There is nothing to fix. The three required hints are unwritable
because the one honest hint is the whole algorithm, reseedable is mathematically
impossible (a path has one state at each distance, so a declared par pins the start
to a single board), and it overlaps tower-of-hanoi, frog-leap and lights-out at once
— a row of toggling enamel discs whose goal is 'get them all off'.

**67. Foxes and chickens (missionaries and cannibals)** — *The cats and the mice*,
planning · also Missionaries and cannibals, jealous husbands  
It is not adjacent to a shipped puzzle, it is one:
src/puzzles/river-crossing/index.ts exports catsAndMice(pairs) with rule 'Never
leave more cats than mice on one side.' and ships it as levels 2 and 3, with the
counting rule as a first-class RiverConfig field (outnumber) enforced in failureOf.
Distinctness 1 is the gate, and its own assessment says plainly: do not build it.  
*Watch out:* The only honest unshipped rung is a fourth river-crossing level — four
pairs with a three-seat boat, par 9 — which is a config literal and a hint triad in
the existing file, since RiverConfig.capacity and the board's --seats already take
3. A tenth card here would put two identical crossing silhouettes on the collection
page.

## Assessed and not ranked

Twenty-eight more were sourced and scored on the same eight dimensions, and then
deliberately left unranked — the effort belongs at the top of a list, where the
building happens. Each carries the one sentence its assessor wrote to settle it.

| Puzzle | Would ship as | The sentence that settles it |
| --- | --- | --- |
| Cube (rolling cube puzzle) | The rolling box | The engine is fifteen lines, but five of the box's six faces are hidden, so it only ships if a drawn net makes them visible. |
| Solo | The bigger square | The app already ships it: mini-sudoku's six-by-six level is Solo with 2x3 blocks — same rule, same solver, same board. |
| Twiddle | The turning tiles | Every rotation is legal and none of them is reasoned: a 3x3 Twiddle is solved by commutators or by fiddling, and a child does neither. |
| Flood (Flood-It, Flood Fill) | The spreading patch | Every board floods eventually, so the whole puzzle is hitting the solver's number, and no rule a child can be taught gets there. |
| Magnets | The magnets | Brings the edge-count clue the collection is missing, but every half is a three-way elimination that Tatham itself ships two annotation modes for. |
| Pegs (peg solitaire / Hi-Q / Brainvita) | The last marble | Builds in an afternoon, but it is trial and error: the best rule a hint could state solves 11-37% of boards, so a child backs up blind. |
| Same Game (SameGame / Chain Shot! / Clickomania) | The falling fruit | The engine is trivial and par is BFS-provable, but only 11-40% of losing moves show a tell one step ahead — the rest is tap-and-undo. |
| Untangle (Planarity) | The tangled ropes | The tap version works, but par is only BFS-provable if the plane collapses to a ring of seats, and that is no longer Untangle. |
| Chomp | The burnt corner | A two-player game: the perfect opponent it needs means the app either grades every bite for you or never says which bite lost it. |
| Small cryptarithm (verbal arithmetic / alphametic) | The hidden digits | The small sums a child can hold in a head have no unique answer at all, and the guess-free ones that do exist are all the same two-step trick. |
| Pearl (Masyu) | The bead path | Fills the app's biggest gap, and joining two squares taps cleanly — but a bead's rule is about the loop's next squares, not the grid's. |
| Range (Kurodoko / Kuromasu) | The tall trees | The clue is a sum over four unknown sight-lines, and the dot marks that reasoning is built on would each cost a counted move. |
| Singles (Hitori) | The stepping stones | Everything is deduced from squares you have proved stay, and the app has nowhere to write that down that does not cost a move. |
| Sixteen | The sliding shelves | Every part of it ports cleanly except the thinking: a 3x3 is only eight moves deep with no gradient to follow, so a child fiddles. |
| Tangram | The seven shapes | Perfect for the age, but the input is a drag: tapping a piece, an angle and an anchor cell is a worse puzzle than turning it in a hand. |
| The lantern room | The three mirrors | The light path is real new thinking a child can trace, but par stops being a BFS and becomes balance-scales-grade minimax code. |
| Undead (Haunted Mirror Maze) | The hall of mirrors | Fits the grid engine exactly, but its rules take eight sentences to state and its deduction runs on the pencil marks this app refuses to count. |
| Shakashaka | The quilt corners | The whole puzzle turns on a tilted rectangle still being a rectangle — the shape rule eight-year-olds are documented to get wrong. |
| Pentominoes | The shape tray | Fills the app's biggest named gap, but a child fits shapes by trying them, and every try and take-back is two counted moves. |
| Loopy (Slitherlink) | The one fence | Slitherlink runs on crosses marking the edges you have ruled out, and here every cross would cost a counted move. |
| Netslide | The sliding pipes | A slide puzzle wearing a network: every move wrecks finished work, there is no deduction path, and par is unprovable past five moves. |
| Flip | The tangled lamps | Lights out already ships and already traces a press's flip set; Flip only randomises that set per square, which deletes the method. |
| Statue Park | The flower beds | The pieces are lovely to place, but the real solving is elimination over dozens of possible fits — no eight-year-old head holds that without pencil marks. |
| Rule-tile rewriting (Baba Is You mechanic) | The rule blocks | Four loose word blocks in an open 5x5 already reach 1.27M states, so a room big enough to hold two sentences can never have a proved par. |
| Guess (Mastermind / Bulls and Cows) | The hidden row | The evidence is whatever the child tries, so no generator can keep a 50/50 off the board, and the candidate list lives on paper. |
| Mines (Minesweeper) | The buried acorns | Uncovering a mine is undone by the shell's Step back, so undo hands over the answer; only a static flag-the-mines version survives. |
| Black Box | The marble box | An eight-year-old cannot run the deflection rule backwards in their head, and the crosses that would make it possible each cost a move. |
| Dots and boxes | The little boxes | It is a two-player game, so there is no answer to reason to, and the winning idea — chain parity — is past an eight-year-old. |

### Why they fail, and what that says about this app

They fail in six recognisable ways, and the pattern is worth more than any single
line.

**Pencil marks, and this is the largest group by far.** Loopy runs on crosses
marking ruled-out edges, Hitori on squares you have proved will stay, and Undead,
Range, Statue Park, Black Box and Magnets all on candidate sets no eight-year-old
holds in a head. Every one needs annotation kept outside the counted move stream,
which nothing here has and which would be new shell work rather than a new puzzle.

**No method, so a child fiddles instead of reasoning.** Sixteen is eight moves deep
with no gradient to follow, Twiddle is solved by commutators or by luck, Flood is
hitting the solver's number, and the best teachable rule for Pegs solves between 11
and 37 per cent of boards.

**Drag-native, and the re-expression is worse than the original.** Tangram becomes
tapping a piece, then an angle, then an anchor cell, which is a worse puzzle than
turning a shape in a hand. Pentominoes charges two counted moves for every try and
take-back.

**Adult abstraction, or luck.** Cryptarithms small enough to hold in a head have no
unique answer. Shakashaka turns on a tilted-rectangle rule eight-year-olds are
documented to get wrong. Mines is undone by the shell's own Step back.

**Already shipped.** Solo is mini-sudoku at 6x6 with 2x3 blocks. Flip is lights-out
with the flip set randomised per square, which deletes the method rather than adding
one.

**Two players.** Chomp and dots-and-boxes have no answer to reason to, and their
winning ideas are parity arguments well past this age.

What the whole pattern says is that the real filter here is not the state machine,
which almost everything passes. It is whether the puzzle's working can live on the
board itself. The candidates that survive are the ones where the mark a child would
write down is either the answer — Hidato's numbers, Shikaku's rectangles — or
something the board was already drawing, like Light Up's lit squares.

## What the nine do not cover

The holes, roughly in the order of how big they are. This is what the distinctness
score was measured against.

**Lines, paths and connectivity.** Nothing asks a child to join things up, draw a
route, or reason about whether a shape hangs together. It is the largest family in
Tatham's collection — Loopy, Bridges, Pearl, Net, Tracks, Untangle, Signpost — and
the app has none of it. `connected()` exists in `garden-cats/logic.ts`, but only
inside the generator, where no child ever meets it.

**Counting as a clue.** No number at the edge of a grid, no number that says how
many. The only numerals a child meets are the sudoku symbols, which are pure tokens
with no numeric meaning at all, and the jug capacities.

**Arithmetic.** The water jugs is the one number puzzle here, and it is about which
amounts are reachable rather than about calculating. Nothing asks for a sum, a
difference or a total that has to come out right.

**Dividing rather than filling.** Every puzzle places pieces into a structure
somebody else drew. The garden cats is handed its gardens; carving them is the
generator's job, and carving is the interesting half.

**Shape, symmetry and orientation.** The collection reasons about relations between
things and never about the things' shapes. No rotation, no reflection, no fitting
pieces together, and not one piece anywhere in the app has an orientation.

**Ordering and transitivity.** The logic grid's clues are only "is" and "is not".
Nothing says "taller than", "before" or "two to the left of". Chaining *A is taller
than B, B is taller than C* is a foundational move for this age and the app never
asks for it.

**Finding the rule rather than applying it.** Every puzzle states its rules up
front. Nothing asks what the pattern is. The balance scales is the only puzzle with
an unknown, and the unknown is a value, not a rule.

**Proving something cannot be done.** Lights out and the tower both have invariant
structure in them, and no level ever asks a child to notice it.

**Costs and scheduling.** Every move in the river crossing costs exactly one.
Nothing weighs one move against another.

**Two agents.** No adversarial thinking. That one may be a boundary rather than a
hole, since a second player needs an opponent the shell has nowhere to put.

Two structural absences alongside those. Every board is a grid or a short row of
tappable things — nothing has a piece that travels along a line, or a board whose
shape changes as it is played. And no puzzle asks a child to build something; all
nine either fill in a structure or move pieces within one.

## What already ships

Eight of Tatham's forty are wholly or largely in the app already, which is why
several famous names sit low in the list or do not appear in it at all.

| Tatham's puzzle | Ships here as | How close | Why |
| --- | --- | --- | --- |
| Flip | `lights-out` | Identical | A grid of lights where a tap toggles a set of cells and the goal is all off. In its crosses mode the toggle set is exactly lights-out's. |
| Solo | `mini-sudoku` | Identical | Sudoku with rectangular blocks. The shipped 6x6 with 2x3 boxes is literally a Solo configuration. |
| Black Box | `balance-scales` | Strong | Both hold the hidden truth in the state and never draw it, and both answer a probe rather than a move. |
| Keen | `mini-sudoku` | Strong | A Latin square with arithmetic cages in place of boxes. The row and column half is mini-sudoku exactly. |
| Pegs | `frog-leap` | Strong | Jump a piece over its neighbour into the one hole. `hopTarget()` in frog-leap is that move in one dimension. |
| Tents | `garden-cats` | Strong | One tent to a tree and no two tents touching, even at a corner — the same eight-neighbour exclusion, with a counting clue added. |
| Towers | `mini-sudoku` | Strong | A Latin square at this app's own 4x4 and 5x5 sizes, with visibility counts round the edge. |
| Unequal | `mini-sudoku` | Strong | The Latin-square core with the boxes swapped for inequality signs between neighbours. |

Nine more share a mechanic more loosely: Mosaic, Tents, Singles, Unruly, Magnets,
Dominosa, Signpost, Guess and Mines all lean on something one of the nine already
does.

## How the list was made

Six agents sourced the pool. The Tatham foundation was verified rather than recalled
— the collection's home page and all forty manual chapters were downloaded and read,
and the seed list of forty names came back with no corrections at all. The four
other seams were sourced the same way, against a standing instruction to reject
anything that was a Tatham puzzle under a different name, so that Slitherlink could
not enter twice as Loopy.

Every candidate was then assessed by its own agent, working blind to all the others,
which read the contract and the design language and at least two shipped puzzles
before scoring. Many went further than reading: the strongest findings in the whole
exercise came from agents who downloaded Tatham's C source, wrote a generator
prototype and measured the yield, or ran a breadth-first search to see where the
200,000-state cap actually falls. An assessment that estimated where a rival
measured lost, and deserved to.

Blind assessors drift, so the leaders were then attacked by skeptics — a second
agent per puzzle, told to refute the assessment and given ten specific weapons, from
the same-reference invariant to the state-space arithmetic to whether the board's
own error cue quietly hands the answer over. Skeptics corrected in both directions:
Shikaku and Light Up were both promoted by the agents sent to break them.

**One thing went wrong, and it is worth recording.** The pool was split on raw score
before any skeptic ran, and only the top half was challenged. Every challenged
puzzle lost between four and seven points and no unchallenged one lost anything, so
the cut fell straight through a tie — ten candidates at raw 34 were ranked and
nineteen more at 34 and 33 were not, on nothing but list order. The first calibrator
caught this and filed it as a complaint against its own input, naming four puzzles
it believed the cut was hiding.

So those nineteen were challenged on identical terms and everything was ranked
again. The result is worth stating plainly, because it means the build order can be
trusted rather than argued about: **exactly one of the nineteen reached the top
twenty.** Futoshiki entered at 14, and Net moved down one place to make room. Of the
four the first calibrator named, one was right and three were wrong — Numberlink,
Norinori and Skyscrapers landed at 38, 42 and 46, each for a reason its skeptic
measured rather than guessed. The method was unsound and the outcome was very nearly
correct, and the top thirteen has now been tested twice from opposite directions
without moving.

**What was deliberately not done.** Twenty-eight candidates were assessed and never
challenged or ranked. Ranks 19 to 67 rest on one skeptic each rather than a panel.
An implementation blueprint was drawn for each of the top eight — a state type, a
generator plan and the state-space arithmetic per level — and it is one agent's work
apiece; those go to whoever builds the puzzle rather than into this document. None of
that is hidden in the numbers above, and any of it would be the place to spend the
next hour.
