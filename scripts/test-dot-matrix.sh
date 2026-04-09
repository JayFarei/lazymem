#!/usr/bin/env bash
# Test dot-matrix RAM display rendering across different terminal widths.
# Launches tmux sessions, captures pane output, validates the 5-row dot grid.

set -euo pipefail

WIDTHS=(70 90 110 130 160)
HEIGHT=40
PREFIX="lm-dot"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUN="$(which bun)"
CMD="${BUN} --preload=./node_modules/@opentui/solid/scripts/preload.ts src/index.tsx"
WAIT_SECS=12

PASS=0; FAIL=0; SKIP=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Cleanup ────────────────────────────────────────────────────────────────
cleanup() {
  for w in "${WIDTHS[@]}"; do
    tmux kill-session -t "${PREFIX}-${w}" 2>/dev/null || true
  done
}
trap cleanup EXIT
cleanup

# ── Launch ─────────────────────────────────────────────────────────────────
echo "Starting TUI at widths: ${WIDTHS[*]} (height ${HEIGHT})"
for w in "${WIDTHS[@]}"; do
  tmux new-session -d -s "${PREFIX}-${w}" -x "$w" -y "$HEIGHT" \
    -e "SSH_AUTH_SOCK=${SSH_AUTH_SOCK:-}" \
    -e "HOME=${HOME}" \
    -e "PATH=${PATH}" \
    bash
  tmux send-keys -t "${PREFIX}-${w}" "cd '${ROOT}' && ${CMD}" Enter
done

echo "Waiting ${WAIT_SECS}s for data to load..."
sleep "$WAIT_SECS"

# ── Capture & Validate ────────────────────────────────────────────────────
OUTDIR="${ROOT}/scripts/captures"
mkdir -p "$OUTDIR"

for w in "${WIDTHS[@]}"; do
  echo ""
  echo "=== Width ${w} ==="

  OUTFILE="${OUTDIR}/dot-matrix-${w}.txt"
  printf '%0.s─' $(seq 1 "$w") > "$OUTFILE"
  echo "" >> "$OUTFILE"
  printf " DOT-MATRIX WIDTH %-3s" "$w" >> "$OUTFILE"
  echo "" >> "$OUTFILE"
  printf '%0.s─' $(seq 1 "$w") >> "$OUTFILE"
  echo "" >> "$OUTFILE"
  tmux capture-pane -p -t "${PREFIX}-${w}" >> "$OUTFILE" 2>&1 || echo "(capture failed)" >> "$OUTFILE"
  echo "" >> "$OUTFILE"

  CAPTURED=$(cat "$OUTFILE")

  # Test 1: Find 5 consecutive lines containing ▪ after the RAM label area
  # The RAM section should have a block of 5 rows with ▪ characters
  DOT_LINES=$(echo "$CAPTURED" | grep -c '▪' || true)
  if [ "$DOT_LINES" -ge 5 ]; then
    pass "dot grid present (${DOT_LINES} lines with ▪)"
  else
    fail "expected >=5 lines with ▪, found ${DOT_LINES}"
  fi

  # Test 2: No bare percentage text in the RAM row area
  # The old "XX%" text should be gone, replaced by the dot matrix
  # Look for the pattern: RAM followed by a percentage like "80%"
  if echo "$CAPTURED" | grep -qE 'RAM.{0,10}[0-9]+%'; then
    fail "found old-style percentage text next to RAM label"
  else
    pass "no bare percentage text in RAM row"
  fi

  # Test 3: RAM label still present
  if echo "$CAPTURED" | grep -q 'RAM'; then
    pass "RAM label present"
  else
    fail "RAM label missing"
  fi

  # Test 4: Memory value still present (e.g., "12.4G/16.0G")
  if echo "$CAPTURED" | grep -qE '[0-9]+(\.[0-9])?[GM]/[0-9]+(\.[0-9])?[GM]'; then
    pass "memory value string present"
  else
    fail "memory value string missing"
  fi

  echo "  Capture saved to: ${OUTFILE}"
done

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════"
echo "  PASS: ${PASS}  FAIL: ${FAIL}  SKIP: ${SKIP}"
echo "════════════════════════════════"
echo "Captures saved to ${OUTDIR}/"

[ "$FAIL" -eq 0 ] || exit 1
