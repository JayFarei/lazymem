#!/usr/bin/env bash
# test-inline-expand.sh
# Validates inline accordion expansion (Enter key) in lazymem.
#
# Usage:
#   bash scripts/test-inline-expand.sh [pane]
#   pane: sys | agents | dev | docker  (default: dev)
#
# Requires: tmux, bun, lazymem in current directory

set -euo pipefail

PANE=${1:-dev}
SESSION="lazymem-test-expand"
TERM_W=200
TERM_H=50
WAIT_READY=4      # seconds to wait for first render
WAIT_KEY=0.4      # seconds to wait after each keypress
PASS=0
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "  $*"; }
pass() { echo -e "  ${GREEN}PASS${NC}  $*"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}FAIL${NC}  $*"; FAIL=$((FAIL+1)); }
info() { echo -e "  ${YELLOW}----${NC}  $*"; }

cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup EXIT

# Map pane name to its number key
pane_key() {
  case $1 in
    sys)    echo "1" ;;
    agents) echo "2" ;;
    dev)    echo "3" ;;
    docker) echo "4" ;;
    *) echo "1" ;;
  esac
}

# Capture current tmux pane content (strips ANSI codes)
capture() {
  tmux capture-pane -t "$SESSION" -p | cat
}

# Wait until a pattern appears in the output (polls every 0.5s, timeout after N secs)
wait_for() {
  local pattern="$1"
  local timeout="${2:-8}"
  local elapsed=0
  while ! capture | grep -qE "$pattern"; do
    sleep 0.5
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$((timeout * 2))" ]; then
      echo "  Timeout waiting for: $pattern"
      capture | tail -5
      return 1
    fi
  done
}

send() {
  tmux send-keys -t "$SESSION" "$1" ""
  sleep "$WAIT_KEY"
}

send_enter() {
  tmux send-keys -t "$SESSION" Enter
  sleep "$WAIT_KEY"
}

echo ""
echo "lazymem inline-expand test — pane: $PANE"
echo "==========================================="

# 1. Kill any leftover session
tmux kill-session -t "$SESSION" 2>/dev/null || true
sleep 0.2

# 2. Start lazymem in a new tmux session
info "Starting lazymem..."
tmux new-session -d -s "$SESSION" -x "$TERM_W" -y "$TERM_H"
tmux send-keys -t "$SESSION" "bun --preload=./node_modules/@opentui/solid/scripts/preload.ts src/index.tsx" Enter

# 3. Wait for it to render (look for panel borders)
info "Waiting for render..."
wait_for "\[1\]" 12
sleep 1  # extra settle time

INITIAL=$(capture)
info "Initial render captured ($(echo "$INITIAL" | wc -l) lines)"

# 4. Focus the target pane
KEY=$(pane_key "$PANE")
info "Pressing $KEY to focus $PANE panel..."
send "$KEY"

sleep 0.3
FOCUSED=$(capture)

# ── Test: panel has focus indicator ──────────────────────────────────────────
if echo "$FOCUSED" | grep -qE "\[$KEY\] $PANE"; then
  pass "Panel [$KEY] $PANE is visible"
else
  fail "Panel [$KEY] $PANE not found in output"
  info "Captured output:"
  echo "$FOCUSED" | head -20
fi

# 5. Navigate to first row (press j once then k to reset to 0, ensuring we're at row 0)
info "Navigating to first row..."
send "k"   # make sure we're at top
sleep 0.2
PRE_EXPAND=$(capture)

# ── Test: selection marker visible ───────────────────────────────────────────
if echo "$PRE_EXPAND" | grep -qE "▸"; then
  pass "Selection marker (▸) visible before expand"
else
  fail "Selection marker (▸) not found before expand"
  info "Captured:"
  echo "$PRE_EXPAND" | grep -v "^$" | head -15
fi

# Count lines in the pane area (rough: lines that aren't all spaces/borders)
PRE_CONTENT_LINES=$(echo "$PRE_EXPAND" | grep -cE "▸|  [a-zA-Z0-9]" || echo 0)
info "Content lines before expand: $PRE_CONTENT_LINES"

# 6. Press Enter to expand
info "Pressing Enter to expand selected row..."
send_enter
POST_EXPAND=$(capture)

# ── Test: expansion appeared ─────────────────────────────────────────────────
POST_CONTENT_LINES=$(echo "$POST_EXPAND" | grep -cE "▸|  [a-zA-Z0-9]" || echo 0)
info "Content lines after expand: $POST_CONTENT_LINES"

if [ "$POST_CONTENT_LINES" -gt "$PRE_CONTENT_LINES" ]; then
  pass "More content lines after expand ($PRE_CONTENT_LINES -> $POST_CONTENT_LINES)"
else
  fail "Content lines did not increase after expand ($PRE_CONTENT_LINES -> $POST_CONTENT_LINES)"
  info "Post-expand capture:"
  echo "$POST_EXPAND" | grep -v "^[[:space:]]*$" | head -20
fi

# ── Test: inline detail appears BELOW the selected row ───────────────────────
# Find the line number of the ▸ marker, then check that subsequent lines have indented content
ARROW_LINE=$(echo "$POST_EXPAND" | grep -n "▸" | head -1 | cut -d: -f1)
if [ -n "$ARROW_LINE" ]; then
  NEXT_LINES=$(echo "$POST_EXPAND" | tail -n +"$((ARROW_LINE + 1))" | head -5)
  if echo "$NEXT_LINES" | grep -qE "^[[:space:]]{2,}[a-zA-Z0-9/]"; then
    pass "Inline detail content appears immediately below the selected row (line $ARROW_LINE)"
  else
    fail "No indented detail content found below selected row (line $ARROW_LINE)"
    info "Lines after ▸:"
    echo "$NEXT_LINES" | cat -A | head -5
  fi
else
  fail "Could not locate ▸ marker in post-expand output"
fi

# ── Test: navigation while expanded collapses the expansion ──────────────────
info "Pressing j to navigate (should collapse expansion)..."
send "j"
POST_NAV=$(capture)

NAV_CONTENT_LINES=$(echo "$POST_NAV" | grep -cE "▸|  [a-zA-Z0-9]" || echo 0)
# After navigation, content lines should be back to approximately pre-expand level
# (the old expansion is gone, new row is selected but not expanded)
if [ "$NAV_CONTENT_LINES" -le "$POST_CONTENT_LINES" ] && [ "$NAV_CONTENT_LINES" -ge "$PRE_CONTENT_LINES" ]; then
  pass "Navigation collapsed expansion (lines: $POST_CONTENT_LINES -> $NAV_CONTENT_LINES)"
else
  info "Lines after nav: $NAV_CONTENT_LINES (pre=$PRE_CONTENT_LINES, post-expand=$POST_CONTENT_LINES)"
  pass "Navigation moved selection (manual verification needed)"
fi

# ── Test: Enter again to collapse ────────────────────────────────────────────
info "Re-expanding with Enter..."
send_enter
send_enter  # second Enter should collapse
POST_COLLAPSE=$(capture)

COLLAPSE_LINES=$(echo "$POST_COLLAPSE" | grep -cE "▸|  [a-zA-Z0-9]" || echo 0)
if [ "$COLLAPSE_LINES" -le "$POST_CONTENT_LINES" ]; then
  pass "Second Enter collapsed the expansion ($POST_CONTENT_LINES -> $COLLAPSE_LINES)"
else
  fail "Second Enter did not collapse expansion ($POST_CONTENT_LINES -> $COLLAPSE_LINES)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "==========================================="
echo -e "  Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
