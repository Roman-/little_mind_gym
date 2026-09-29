/**
 * Where each puzzle came from, by its id.
 *
 * Almost nothing in the collection was invented here. These are classics, and
 * the people and the publishers who made them are named — one line each, and
 * the name a puzzle is sold under where that is not the name on its card. The
 * credits page is what prints them.
 *
 * `src/routes/credits.test.tsx` holds this list to `PUZZLES`: every puzzle has
 * a line, and no line outlives the puzzle it credits.
 */
export const ORIGINS: Record<string, string> = {
  'river-crossing':
    'Traditional, and the oldest thing here. The wolf, the goat and the cabbage is written down around the year 800, in Propositiones ad Acuendos Juvenes — a book of problems attributed to Alcuin of York.',
  'tower-of-hanoi':
    'Invented by Édouard Lucas in 1883. He sold it as a toy under the name N. Claus de Siam, an anagram of Lucas d’Amiens.',
  'lights-out':
    'The toggle grid that Tiger Electronics sold as Lights Out in 1995, after Parker Brothers’ Merlin of 1978. Simon Tatham’s collection calls it Flip.',
  'frog-leap':
    'Traditional. The hop-over puzzle of nineteenth-century puzzle books, where the frogs and the toads have to change places. It is peg solitaire in one line.',
  'long-table':
    'Made here. It was designed backwards from its own par, and the goal is a condition — nobody sitting beside somebody they quarrel with — rather than a picture.',
  pipes:
    'FreeNet, a Flash game by Pavils Jurjans. Simon Tatham’s collection calls it Net, and other versions go by the name NetWalk.',
  'slippery-ice':
    'The sliding move comes from Ricochet Robots, Alex Randolph’s board game, published as Rasende Roboter by Hans im Glück in 1999. The ponds are ours.',
  'stone-path':
    'Goishi Hiroi, a traditional Japanese go-stone puzzle recorded from the early 1700s, and revived in grid form by Nikoli.',
  'alice-maze':
    'Robert Abbott’s Alice maze, from SuperMazes (Prima, 1997) — a maze where the length of your step changes as you walk it. It is named for Alice’s cake and bottle.',
  'water-jugs':
    'Traditional. Pouring puzzles of this kind were being set in the Middle Ages, and Claude Gaspard Bachet de Méziriac collected them in 1612.',
  'counting-squares':
    'Fill-a-Pix, published by Conceptis Puzzles, and sold elsewhere as Mosaic and Nurie-Puzzle. Simon Tatham’s collection calls it Mosaic.',
  'mini-sudoku':
    'Sudoku. Howard Garns made it for Dell Magazines in 1979 as Number Place, and Nikoli named it and made it famous from 1984.',
  'suns-and-moons':
    'Binairo, invented by Adolfo Zanellati as Tohu wa Vohu, and sold as Takuzu and Binary Puzzle. Simon Tatham’s collection calls it Unruly.',
  suguru:
    'Suguru, credited to the Japanese puzzle designer Naoki Inaba, and sold as Tectonic and Number Blocks.',
  'tall-and-short':
    'Futoshiki, by Tamaki Seto. British newspapers have carried it since 2006, and Simon Tatham’s collection calls it Unequal.',
  shikaku: 'Shikaku, published by Nikoli. Simon Tatham’s collection calls it Rectangles.',
  'floor-mats':
    'Tatamibari, from Nikoli, who first printed it in Puzzle Communication Nikoli in 2004 and named it after tatami mats. The house version leaves out its rule that four mats may never meet at one corner.',
  'painted-tiles':
    'Tilepaint, or Tairupeinto, sent in by a reader and first published by Nikoli in Puzzle Communication Nikoli, issue 53, in 1995.',
  'garden-cats':
    'The star-battle board of the puzzle-contest world — one star to a region, and no two of them touching — which is sold with cats on it as Meowdoku.',
  'tents-and-trees':
    'Tents and Trees, a newspaper pencil puzzle in the Nikoli tradition. Simon Tatham’s collection calls it Tents.',
  thermometers:
    'Thermometers, also sold as Mercury. It comes out of the puzzle-contest world — Conceptis, Logic Masters, the World Puzzle Championship — from the 1990s on.',
  'logic-grid':
    'Traditional. The newspaper logic-grid puzzle, descended from the zebra puzzle printed in Life International in 1962.',
  'hidden-boats':
    'Solitaire Battleships, first printed in 1982 in Humor & Juegos, the Argentine magazine that Jaime Poniachik founded. Poniachik made it with three of its editors, Eduardo Abel Gimenez, Jorge Varlotta and Daniel Samoilovich. It is also sold as Bimaru and Yubotu.',
  'counting-path':
    'Numbrix, Marilyn vos Savant’s newspaper puzzle, which is the orthogonal cousin of Gyora Benedek’s Hidato.',
  'long-snake':
    'Snake, a pencil puzzle from the puzzle-contest world, where it is set at the World Puzzle Championship. It has also gone by the name Tunnel.',
  signposts:
    'Signpost, contributed to Simon Tatham’s collection by James Harvey, and the Janko puzzle Pfeilpfad before that.',
  'light-up': 'Akari, published by Nikoli. Simon Tatham’s collection calls it Light Up.',
  'fence-posts': 'Gokigen Naname, published by Nikoli. Simon Tatham’s collection calls it Slant.',
  'knight-swap':
    'Guarini’s problem, attributed to Paolo Guarini di Forlì in 1512, and the oldest chessboard puzzle in print.',
  'hedge-maze':
    'Theseus and the Minotaur, invented by Robert Abbott for Mad Mazes (1990), with a rabbit and a dog in place of the Greeks.',
}
