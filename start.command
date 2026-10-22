#!/bin/bash
# MoE Registration Portal PoC – one-click start (double-click in Finder, or run ./start.command).
#   ./start.command          start the portal (installs, creates data and builds only when needed)
#   ./start.command --reset  reset the database to the starting test data first
# Stop it with Ctrl+C or by closing this window.

cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3000}"
URL="http://localhost:$PORT"

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✘ %s\033[0m\n' "$1"; read -r -p "Press Enter to close…" _; exit 1; }

# Node.js 22.13+ is needed for the built-in SQLite driver
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js 22.13 or later from https://nodejs.org and try again."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || fail "Node.js $(node -v) is too old. Install Node.js 22.13 or later from https://nodejs.org."

# Already running? Then just open it.
if curl -fs "$URL/api/lookups" >/dev/null 2>&1; then
  say "The portal is already running – opening $URL"
  open "$URL"
  exit 0
fi
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  fail "Port $PORT is used by another program. Close it, or start on another port: PORT=3001 ./start.command"
fi

if [ ! -d node_modules ]; then
  say "Installing dependencies (first run only)…"
  npm install || fail "npm install failed."
fi

if [ "$1" = "--reset" ] || [ ! -f server/data/moe.db ]; then
  say "Creating the synthetic test data…"
  npm run seed --silent || fail "Creating the test data failed."
fi

# Rebuild the web app when it is missing or older than its source
if [ ! -f client/dist/index.html ] || [ -n "$(find client/src client/index.html -newer client/dist/index.html 2>/dev/null | head -1)" ]; then
  say "Building the web app…"
  npm run build --silent || fail "Building the web app failed."
fi

say "Starting the portal on $URL  (Ctrl+C to stop)"
# open the browser as soon as the server answers
( for _ in $(seq 1 60); do
    if curl -fs "$URL/api/lookups" >/dev/null 2>&1; then open "$URL"; exit 0; fi
    sleep 0.5
  done ) &
PORT="$PORT" exec node --no-warnings server/index.js
