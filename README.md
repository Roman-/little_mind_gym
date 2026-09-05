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

`/random` leans towards puzzles that have not been played yet, opens the first
level the player has not finished, and never hands back the puzzle they just
came from.

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
  lib/          the contract (types.ts), a seeded rng, and a BFS over state graphs
  components/   the shell's furniture, including the move tape
  routes/       home, one puzzle, the random pick
  puzzles/<id>/ logic.ts · Board.tsx · glyphs.tsx · board.module.css · index.ts · logic.test.ts
  styles/       tokens.css is the single source of every colour, size and duration
```

Because the state is pure and the board is a function of it, the **move tape**
under every board can rewind to any earlier moment with one tap. A child can
explore a wrong idea all the way to its end and walk back out of it.

- Adding a puzzle: **[PUZZLE_CONTRACT.md](PUZZLE_CONTRACT.md)**
- Changing how it looks: **[DESIGN.md](DESIGN.md)**

Progress lives in `localStorage` under `little-mind-gym:progress:v1`. The old
`puzzle-bench:progress:v1` is still read once, so nothing solved before the
app was renamed is lost. There is no
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

## Deploying

**To deploy the site, run `npm run deploy`.** That is the whole answer. The
script builds, uploads and then checks the live URL, and it is the only command
anyone should need for a routine release.

```
npm run deploy                  # test, build, upload, verify
npm run deploy -- --dry-run     # list what would be uploaded, change nothing
npm run deploy -- --skip-tests  # when you have just run them yourself
```

It lives in `scripts/deploy.sh`. It refuses to publish a build whose tests or
types fail, it mirrors `dist/` with `rsync --delete` so a renamed bundle leaves
nothing behind, and it ends by fetching three things from the public URL: the
front page, a client-side route, and the exact bundle `index.html` names. A
deploy is not reported as done until those three answer 200.

### Where it deploys to

Nothing in this repository names a host, a user, a key or a server path. The
script reads four environment variables, and stops with a list of the missing
ones if any is unset:

| Variable | What it holds |
| --- | --- |
| `BESTSITEEVER_HOST` | `user@host` for ssh |
| `BESTSITEEVER_PORT` | ssh port |
| `BESTSITEEVER_KEY` | path to the private key |
| `BESTSITEEVER_PUBLIC_HTML_DIR` | the domain's web root on the server, relative to the home directory: `domains/<domain>/public_html` |

They are exported from `~/.bashrc`, in the block next to the `,bestsiteeva`
alias. A new shell picks them up; an open one needs `source ~/.bashrc` first.

Those four say which server. The folder inside that web root, and the public
URL the checks at the end fetch, are both read out of `base` in
`vite.config.ts` — `/little_mind_gym/` under
`domains/bestsiteever.net/public_html` means `.../public_html/little_mind_gym`,
served at `https://bestsiteever.net/little_mind_gym/`. Nothing else can name
that folder, so
nothing else can disagree with what the build was made for.

Setting a variable on the command line redirects a single deploy, which is how
you push the same build to another domain on the same host:

```
BESTSITEEVER_PUBLIC_HTML_DIR=domains/example.net/public_html npm run deploy
```

### What a host has to give us

The site is static: `npm run build` emits `dist/` and any web server can serve
it. Two things have to be true of wherever it lands.

**It is served from a subfolder, not a domain root.** `base` in
`vite.config.ts` is `/little_mind_gym/`, and the router takes its basename from
that same value, so the two cannot drift apart. Move the site to a different
folder by changing `base`: the deploy script uploads to the folder `base`
names, so the build and its address stay one decision.

**Unmatched paths go to `index.html`.** Routing happens in the browser, so
`/little_mind_gym/puzzle/river-crossing` is not a file on disk. `public/.htaccess`
does this for Apache, which is what the current host runs, and it ships in every
build. On other servers the equivalent is a Netlify `_redirects`, a Vercel
rewrite, or `try_files $uri /index.html` in nginx.
