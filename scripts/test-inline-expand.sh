#!/usr/bin/env bash
# test-inline-expand.sh
# Validates inline accordion expansion (Enter key) across all lazymem panes.
#
# Usage:
#   bash scripts/test-inline-expand.sh [all|sys|agents|dev|docker]
#   Default: all
#
# Exit codes: 0 = all pass, 1 = one or more failures
# Requires: tmux, bun

set -euo pipefail

TARGETS="${1:-all}"
SESSION="lazymem-test-$$"
TERM_W=200
TERM_H=55
WAIT_KEY=0.5
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0

pass() { echo -e "    ${GREEN}PASS${NC}  $*"; TOTAL_PASS=$((TOTAL_PASS+1)); }
fail() { echo -e "    ${RED}FAIL${NC}  $*"; TOTAL_FAIL=$((TOTAL_FAIL+1)); }
skip() { echo -e "    ${YELLOW}SKIP${NC}  $*"; TOTAL_SKIP=$((TOTAL_SKIP+1)); }
info() { echo -e "    ${BLUE}....${NC}  $*"; }
section() { echo -e "\n  ${YELLOW}$*${NC}"; }

cleanup() { tmux kill-session -t "$SESSION" 2>/dev/null || true; }
trap cleanup EXIT

capture() { tmux capture-pane -t "$SESSION" -p 2>/dev/null | cat; }

send() { tmux send-keys -t "$SESSION" "$1" ""; sleep "$WAIT_KEY"; }
send_enter() { tmux send-keys -t "$SESSION" Enter; sleep "$WAIT_KEY"; }

wait_for() {
  local pattern="$1" timeout="${2:-12}" elapsed=0
  while ! capture | grep -qE "$pattern"; do
    sleep 0.5; elapsed=$((elapsed+1))
    if [ "$elapsed" -ge "$((timeout*2))" ]; then
      echo "    Timeout waiting for: $pattern"; capture | tail -4; return 1
    fi
  done
}

# Count non-blank content lines matching a pattern
content_lines() { echo "$1" | grep -cE "${2:-[a-zA-Z0-9]}" 2>/dev/null || echo 0; }

# ── Launch lazymem ────────────────────────────────────────────────────────────
echo ""
echo "  lazymem inline-expand tests"
echo "  =============================="

tmux kill-session -t "$SESSION" 2>/dev/null || true; sleep 0.2
tmux new-session -d -s "$SESSION" -x "$TERM_W" -y "$TERM_H"
tmux send-keys -t "$SESSION" \
  "cd '$ROOT' && bun --preload=./node_modules/@opentui/solid/scripts/preload.ts src/index.tsx" Enter

info "Waiting for lazymem to render..."
wait_for "\[1\] sys" 15
sleep 1.5
info "Render confirmed."

# ─────────────────────────────────────────────────────────────────────────────
# Generic test runner for a single pane
# Args: $1=key(1-4)  $2=panelName  $3=expectedDetailPattern  $4=skipIfMissing
# ─────────────────────────────────────────────────────────────────────────────
test_pane() {
  local KEY="$1" PNAME="$2" DETAIL_PAT="$3" SKIP_PAT="${4:-}"

  section "[$KEY] $PNAME"

  # Focus the pane
  send "$KEY"; sleep 0.3
  local FOCUSED; FOCUSED=$(capture)

  # Check the pane is actually visible
  if ! echo "$FOCUSED" | grep -qE "\[$KEY\] $PNAME"; then
    skip "[$KEY] $PNAME not in output (panel may be hidden at current terminal size)"
    return
  fi
  pass "Panel [$KEY] $PNAME visible and focused"

  # Optional: skip if panel has no data rows to select
  if [ -n "$SKIP_PAT" ] && ! echo "$FOCUSED" | grep -qE "$SKIP_PAT"; then
    skip "No rows to select in [$KEY] $PNAME (pattern not found: $SKIP_PAT)"
    return
  fi

  # Navigate to row 0 (k resets to top)
  send "k"; sleep 0.2
  local PRE; PRE=$(capture)

  # ── Marker visible ───────────────────────────────────────────────────────
  if echo "$PRE" | grep -qE "▸"; then
    pass "Selection marker (▸) visible on row 0"
  else
    fail "Selection marker (▸) missing before expand in $PNAME"
    info "Captured (first 15 non-blank lines):"
    echo "$PRE" | grep -v "^[[:space:]]*$" | head -15 | sed 's/^/      /'
    # Can't continue meaningful tests without marker
    return
  fi

  local PRE_LINES; PRE_LINES=$(content_lines "$PRE" "▸|  [a-zA-Z0-9]")

  # ── Press Enter — expand ─────────────────────────────────────────────────
  send_enter
  local POST; POST=$(capture)
  local POST_LINES; POST_LINES=$(content_lines "$POST" "▸|  [a-zA-Z0-9]")

  if [ "$POST_LINES" -gt "$PRE_LINES" ]; then
    pass "Line count increased after expand ($PRE_LINES -> $POST_LINES)"
  else
    fail "Line count did not increase after expand ($PRE_LINES -> $POST_LINES) in $PNAME"
    info "Post-expand (first 20 non-blank lines):"
    echo "$POST" | grep -v "^[[:space:]]*$" | head -20 | sed 's/^/      /'
  fi

  # ── Detail appears below ▸ ───────────────────────────────────────────────
  local ARROW_LINE; ARROW_LINE=$(echo "$POST" | grep -n "▸" | head -1 | cut -d: -f1)
  if [ -z "$ARROW_LINE" ]; then
    fail "▸ marker missing after expand in $PNAME"
  else
    local BELOW; BELOW=$(echo "$POST" | tail -n +"$((ARROW_LINE+1))" | head -6)
    if echo "$BELOW" | grep -qE "^[[:space:]]{2,}[a-zA-Z0-9/]"; then
      pass "Indented detail content appears below ▸ (line $ARROW_LINE)"
    else
      fail "No indented detail below ▸ in $PNAME (line $ARROW_LINE)"
      info "Lines after ▸:"; echo "$BELOW" | sed 's/^/      /'
    fi
    # Check panel-specific detail content
    if echo "$BELOW" | grep -qE "$DETAIL_PAT"; then
      pass "Expected detail pattern found: '$DETAIL_PAT'"
    else
      fail "Expected detail pattern NOT found: '$DETAIL_PAT'"
      info "Lines after ▸:"; echo "$BELOW" | sed 's/^/      /'
    fi
  fi

  # ── Navigate away — expansion collapses ─────────────────────────────────
  send "j"; sleep 0.2
  local POST_NAV; POST_NAV=$(capture)
  local NAV_LINES; NAV_LINES=$(content_lines "$POST_NAV" "▸|  [a-zA-Z0-9]")

  if [ "$NAV_LINES" -le "$POST_LINES" ]; then
    pass "j collapses expansion ($POST_LINES -> $NAV_LINES lines)"
  else
    fail "j did not collapse expansion in $PNAME ($POST_LINES -> $NAV_LINES)"
  fi

  # ── Enter twice — expand then collapse ──────────────────────────────────
  send_enter        # expand row 1
  local EXP2; EXP2=$(capture)
  local EXP2_LINES; EXP2_LINES=$(content_lines "$EXP2" "▸|  [a-zA-Z0-9]")
  send_enter        # same Enter collapses
  local COLL; COLL=$(capture)
  local COLL_LINES; COLL_LINES=$(content_lines "$COLL" "▸|  [a-zA-Z0-9]")

  if [ "$COLL_LINES" -lt "$EXP2_LINES" ]; then
    pass "Second Enter collapses expansion ($EXP2_LINES -> $COLL_LINES lines)"
  else
    fail "Second Enter did not collapse in $PNAME ($EXP2_LINES -> $COLL_LINES)"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Run panes
# Args: key, panel name, detail pattern (grep -E against lines below ▸), skip-if-missing pattern
# ─────────────────────────────────────────────────────────────────────────────

run_all=false
[[ "$TARGETS" == "all" ]] && run_all=true

if $run_all || [[ "$TARGETS" == "sys" ]]; then
  # sys: detail shows "pid" and "raw" labels; skip-if: at least one proc row
  test_pane "1" "sys" "pid|raw" "[0-9]"
fi

if $run_all || [[ "$TARGETS" == "agents" ]]; then
  # agents: detail shows "session", "project", "claude"; skip-if: sessions listed
  test_pane "2" "agents" "session|project|claude" "▸"
fi

if $run_all || [[ "$TARGETS" == "dev" ]]; then
  # dev: child rows indented with 2+ spaces; skip-if: at least one service group
  test_pane "3" "dev" "^  [[:space:]][a-zA-Z0-9/]" "▸"
fi

if $run_all || [[ "$TARGETS" == "docker" ]]; then
  # docker: detail shows "name" and ("image" or "cpu"); skip-if: container rows
  test_pane "4" "docker" "name|image|cpu" "▸"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Fullscreen overlap test
# Verifies that pressing g renders ONLY the focused pane — dashboard panels
# must not bleed through (the old absolute-overlay bug).
# ─────────────────────────────────────────────────────────────────────────────
if $run_all || [[ "$TARGETS" == "fullscreen" ]]; then
  section "fullscreen no-overlap"

  # Focus sys (pane 1) and open fullscreen
  send "1"; sleep 0.3
  local BEFORE; BEFORE=$(capture)
  # Count how many panel title markers [N] are visible in normal mode
  local NORMAL_PANELS; NORMAL_PANELS=$(echo "$BEFORE" | grep -oE "\[[1-4]\] (sys|agents|dev|docker)" | wc -l | tr -d ' ')

  send "g"; sleep 0.5
  local FS; FS=$(capture)

  # In fullscreen only ONE panel title should be visible
  local FS_PANELS; FS_PANELS=$(echo "$FS" | grep -oE "\[[1-4]\] (sys|agents|dev|docker)" | wc -l | tr -d ' ')

  if [ "$FS_PANELS" -eq 1 ]; then
    pass "Fullscreen shows exactly 1 panel title (was $NORMAL_PANELS in dashboard)"
  else
    fail "Fullscreen shows $FS_PANELS panel titles — dashboard is bleeding through"
    info "Fullscreen output (first 20 non-blank lines):"
    echo "$FS" | grep -v "^[[:space:]]*$" | head -20 | sed 's/^/      /'
  fi

  # Dashboard panel borders (╭ from other panels) must not appear alongside fullscreen content
  local FS_BORDERS; FS_BORDERS=$(echo "$FS" | grep -c "╭" || echo 0)
  if [ "$FS_BORDERS" -le 1 ]; then
    pass "At most 1 rounded-border corner in fullscreen (no dashboard bleed, got $FS_BORDERS)"
  else
    fail "Multiple panel borders visible in fullscreen ($FS_BORDERS) — content overlapping"
  fi

  # The hint bar (g or Esc) must be visible at the bottom
  if echo "$FS" | grep -qE "exit fullscreen"; then
    pass "Fullscreen hint bar visible"
  else
    fail "Fullscreen hint bar missing"
  fi

  # Exit fullscreen
  send "g"; sleep 0.3
  local AFTER; AFTER=$(capture)
  local AFTER_PANELS; AFTER_PANELS=$(echo "$AFTER" | grep -oE "\[[1-4]\] (sys|agents|dev|docker)" | wc -l | tr -d ' ')
  if [ "$AFTER_PANELS" -gt 1 ]; then
    pass "Dashboard restored after exiting fullscreen ($AFTER_PANELS panels)"
  else
    fail "Dashboard not restored after exiting fullscreen (only $AFTER_PANELS panels visible)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "  =============================="
echo -e "  ${GREEN}${TOTAL_PASS} passed${NC}  ${RED}${TOTAL_FAIL} failed${NC}  ${YELLOW}${TOTAL_SKIP} skipped${NC}"
echo ""

[ "$TOTAL_FAIL" -eq 0 ]
