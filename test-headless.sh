#!/usr/bin/env bash
# Headless smoke test for STARWING.
#
# Runs the game in headless Chrome (autostart) for a fixed REAL-TIME
# duration, then inspects the console log for uncaught errors.
#
# Why it looks the way it does (all three are real, verified issues):
#
#  1. --virtual-time-budget does NOT work for this game. The game loop is
#     rAF-driven with a fixed-timestep accumulator (5 steps/frame cap).
#     Under virtual time, rAF timestamps stop tracking performance.now()
#     and rAF stops firing after the first few frames, so the simulation
#     freezes after ~0.1s of game time while the budget fast-forwards.
#     We therefore run in real time and kill the browser afterwards.
#     (At SwiftShader ~9fps the sim advances at ~0.7x real time, so the
#     default 30s of wall time yields ~20s of game time.)
#
#  2. Chrome 151's new headless mode creates its default profile under
#     ~/Library/Application Support/Google/Chrome-headless when no
#     --user-data-dir is given. Under the DSH file sandbox (workspace
#     writes only) that fails with:
#       "Failed to create a unique user data directory for headless."
#     Hence the explicit --user-data-dir in a writable location.
#
#  3. The browser does not reliably exit on its own: its shutdown stalls
#     waiting on background network activity (GCM/QUIC handshakes to
#     Google that loop in this environment). Console output is streamed
#     to the log as it happens, so SIGTERM-then-SIGKILL after the run
#     loses nothing.
#
# Usage:
#   ./test-headless.sh
#   DURATION=60 ./test-headless.sh          # longer run
#   URL="http://localhost:8123/index.html?autostart=1&level=2" ./test-headless.sh
#
# Requires the static server on :8123 (e.g. `python3 -m http.server 8123`
# from this directory) and Google Chrome.
#
# Optional deep-dive: open http://localhost:8123/.probe-rt.html in the
# same Chrome invocation (URL=...) to log state/game-time/fps every second.

set -u
cd "$(dirname "$0")"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${URL:-http://localhost:8123/index.html?autostart=1}"
DURATION="${DURATION:-30}"
LOG="${LOG:-/tmp/starwing-headless.log}"
UDD="${UDD:-/tmp/starwing-chrome-udd}"

if ! curl -sf -o /dev/null --max-time 3 "$URL"; then
  echo "ERROR: cannot reach $URL — is the server running on :8123?" >&2
  exit 2
fi

rm -rf "$UDD"
"$CHROME" --headless=new --disable-gpu --no-sandbox --enable-unsafe-swiftshader \
  --enable-logging=stderr --v=0 \
  --user-data-dir="$UDD" \
  "$URL" >"$LOG" 2>&1 &
CPID=$!
trap 'kill -9 "$CPID" 2>/dev/null' EXIT INT TERM

sleep "$DURATION"
kill -TERM "$CPID" 2>/dev/null
for _ in $(seq 1 10); do
  kill -0 "$CPID" 2>/dev/null || break
  sleep 0.5
done
kill -9 "$CPID" 2>/dev/null
wait "$CPID" 2>/dev/null
trap - EXIT INT TERM

echo "=== UNCAUGHT_ERR (log: $LOG) ==="
grep -A5 "UNCAUGHT_ERR" "$LOG" | head -30
echo "=== other console ==="
grep "CONSOLE" "$LOG" | grep -viE "GL Driver|ReadPixels|AudioContext|UNCAUGHT" | head
echo "=== health ==="
if grep -q "AudioContext" "$LOG"; then
  echo "game started: yes (audio.init ran)"
else
  echo "game started: NO (audio.init never ran)"
fi

if grep -q "UNCAUGHT_ERR" "$LOG"; then
  echo "RESULT: FAIL (uncaught errors)"
  exit 1
fi
if ! grep -q "AudioContext" "$LOG"; then
  echo "RESULT: FAIL (game did not start)"
  exit 1
fi
echo "RESULT: PASS"
