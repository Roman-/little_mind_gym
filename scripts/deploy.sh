#!/usr/bin/env bash
#
# Build the site and mirror it into the folder it is served from.
#
# The site is static, so a deploy is just "make dist/ and copy it". The value
# in this script is the checks either side of the copy. Two ways a deploy of
# this app goes wrong while still looking like it worked:
#
#   1. The site lands in a folder that is not the one `base` in vite.config.ts
#      was built for. Every asset URL then points somewhere real but empty, and
#      the site is a white page with a 404 in the console. Ruled out below by
#      taking the folder from `base` rather than from anywhere else.
#   2. The copy half-lands. index.html is there, so / answers 200 and looks
#      fine to anything that only checks the front page, but the bundle it
#      names is missing. Checked after the copy, against the live URL.
#
# Usage:
#   npm run deploy              build, test, upload, verify
#   npm run deploy -- --dry-run show what would be uploaded, change nothing
#   npm run deploy -- --skip-tests
#
# Where it goes is not in this repo. Four coordinates come from the
# environment, so nothing here names a host, a user, a key or a server path:
#
#   BESTSITEEVER_HOST             user@host for ssh
#   BESTSITEEVER_PORT             ssh port
#   BESTSITEEVER_KEY              path to the private key
#   BESTSITEEVER_PUBLIC_HTML_DIR  the domain's web root on the server, relative
#                                 to the home dir: domains/<domain>/public_html
#
# Those four say which server. Which folder inside that web root, and which
# public URL the checks at the end fetch, are read out of `base` in
# vite.config.ts, so they cannot disagree with the build. Moving the site is
# one edit to `base`, and this script follows it.
#
# The four are exported from ~/.bashrc. Setting one on the command line sends a
# single deploy to another server or another domain:
#
#   BESTSITEEVER_PUBLIC_HTML_DIR=domains/example.net/public_html npm run deploy

set -euo pipefail

SSH_HOST="${BESTSITEEVER_HOST:-}"
SSH_PORT="${BESTSITEEVER_PORT:-}"
SSH_KEY="${BESTSITEEVER_KEY:-}"
PUBLIC_HTML_DIR="${BESTSITEEVER_PUBLIC_HTML_DIR:-}"

DRY_RUN=""
SKIP_TESTS=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN="yes" ;;
    --skip-tests) SKIP_TESTS="yes" ;;
    -h|--help)    sed -n '3,40p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'; exit 0 ;;
    *) echo "deploy: unknown option $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31mdeploy: %s\033[0m\n' "$*" >&2; exit 1; }


# --- 0. we cannot deploy to coordinates we do not have -------------------------
MISSING=""
for var in BESTSITEEVER_HOST BESTSITEEVER_PORT BESTSITEEVER_KEY BESTSITEEVER_PUBLIC_HTML_DIR; do
  [ -n "${!var:-}" ] || MISSING="$MISSING  $var\n"
done
if [ -n "$MISSING" ]; then
  printf '\ndeploy: these are not set:\n%b\n' "$MISSING" >&2
  printf 'They belong in ~/.bashrc — see the Deploying section of AGENTS.md.\n' >&2
  printf 'If you just added them, open a new shell or run: source ~/.bashrc\n\n' >&2
  exit 1
fi
[ -r "$SSH_KEY" ] || die "the key at \$BESTSITEEVER_KEY ($SSH_KEY) is not readable"

# --- 1. where this build has to land, taken from the build itself --------------
# `base` is the one place that says which folder these asset URLs assume, so it
# is the one place the server folder and the public URL are allowed to come
# from. Anything else could drift away from it and produce a white page.
say "Working out where this goes"
BASE=$(grep -oP "base:\s*'\K[^']+" vite.config.ts || true)
[ -n "$BASE" ] || die "no base found in vite.config.ts"
case "$BASE" in
  /*/) ;;
  *) die "base in vite.config.ts is '$BASE'. It has to name one folder, written /like-this/." ;;
esac
FOLDER="${BASE#/}"; FOLDER="${FOLDER%/}"
case "$FOLDER" in
  */*|'') die "base in vite.config.ts is '$BASE'. It has to be a single folder, not a path." ;;
esac

case "$PUBLIC_HTML_DIR" in
  domains/*/public_html|domains/*/public_html/)
    DOMAIN="${PUBLIC_HTML_DIR#domains/}"; DOMAIN="${DOMAIN%%/*}" ;;
  *) die "\$BESTSITEEVER_PUBLIC_HTML_DIR is '$PUBLIC_HTML_DIR'.
  The public URL is read out of it, so it has to be domains/<domain>/public_html." ;;
esac

REMOTE_DIR="${PUBLIC_HTML_DIR%/}/$FOLDER"
PUBLIC_URL="https://$DOMAIN$BASE"
echo "  base '$BASE' puts it in $REMOTE_DIR"
echo "  and serves it at $PUBLIC_URL"

# --- 2. do not publish a build whose tests fail --------------------------------
if [ -z "$SKIP_TESTS" ]; then
  say "Running tests"
  npm test --silent
fi

# --- 3. build (tsc -b runs here too, so a type error stops the deploy) ---------
say "Building"
npm run build --silent

for required in dist/index.html dist/.htaccess; do
  [ -f "$required" ] || die "$required is missing from the build.
  .htaccess comes from public/ and is what makes deep links work; without it
  every route but the front page 404s."
done

# --- 4. copy -------------------------------------------------------------------
# --delete keeps the folder an exact mirror, so a renamed bundle does not leave
# its predecessor behind for ever. It is scoped to REMOTE_DIR and touches
# nothing beside it.
say "Uploading to $SSH_HOST:$REMOTE_DIR"
rsync -av ${DRY_RUN:+--dry-run} --delete \
  -e "ssh -i $SSH_KEY -p $SSH_PORT -o BatchMode=yes -o ConnectTimeout=15" \
  dist/ "$SSH_HOST:$REMOTE_DIR/"

if [ -n "$DRY_RUN" ]; then
  say "Dry run — nothing was uploaded."
  exit 0
fi

# --- 5. prove it actually serves ------------------------------------------------
# Not "did rsync exit 0" but "does the public URL answer with the thing we just
# built": the front page, a route only the rewrite can answer, and the exact
# bundle this index.html names.
say "Verifying $PUBLIC_URL"
check() {
  local url="$1" want="$2" label="$3" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 -L "$url" || echo "000")
  printf '  %-34s %s' "$label" "$code"
  if [ "$code" = "$want" ]; then printf '  ok\n'; else printf '  EXPECTED %s\n' "$want"; return 1; fi
}

FAILED=""
check "$PUBLIC_URL" 200 "front page" || FAILED="yes"
check "${PUBLIC_URL}random" 200 "a client-side route" || FAILED="yes"

# The path in index.html is already absolute from the domain root
# ("/little_mind_gym/assets/index-abc123.js"), so it only needs the origin.
ORIGIN="https://$DOMAIN"
ASSET=$(grep -oE '/[^"]*/assets/[^"]+\.js' dist/index.html | head -1)
if [ -n "$ASSET" ]; then
  check "$ORIGIN$ASSET" 200 "the bundle index.html names" || FAILED="yes"
fi

[ -z "$FAILED" ] || die "uploaded, but the site is not serving correctly. See above."

say "Deployed: $PUBLIC_URL"
