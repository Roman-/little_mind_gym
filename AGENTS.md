# AGENTS.md

Notes for whoever — person or agent — is working on this repository rather than
playing the puzzles. The README is the tour of the app; everything here is
about getting a change out of the working tree and onto the web.

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

**In a non-interactive shell they will not be there, and `source ~/.bashrc`
will not put them there either.** `~/.bashrc` opens with the stock Debian
guard:

```bash
# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac
```

Sourcing it from a script or an agent's shell hits that `return` on line 8 and
comes back having set nothing, so `npm run deploy` stops on all four variables
being unset — which looks exactly like never having configured them. Load just
the block instead:

```bash
set -a; eval "$(grep -E '^export BESTSITEEVER_' ~/.bashrc)"; set +a
npm run deploy
```

That picks up the same `BESTSITEEVER_` exports an interactive shell would and
leaves the rest of `~/.bashrc` alone. Anything else that has to deploy without a terminal — CI,
a cron job — should carry the four in its own environment rather than reaching
into `~/.bashrc` at all.

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
