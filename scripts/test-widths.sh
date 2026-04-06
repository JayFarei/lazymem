#!/usr/bin/env bash
# Test lazymem rendering across different terminal widths.
# Creates one tmux session per width, starts the TUI, waits for data,
# captures the pane, then tears down.

set -euo pipefail

WIDTHS=(70 90 110 130 160)
HEIGHT=40
PREFIX="lm-test"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUN="$(which bun)"
CMD="${BUN} --preload=./node_modules/@opentui/solid/scripts/preload.ts src/index.tsx"
WAIT_SECS=12

# ── Cleanup ────────────────────────────────────────────────────────────────
cleanup() {
  for w in "${WIDTHS[@]}"; do
    tmux kill-session -t "${PREFIX}-${w}" 2>/dev/null || true
  done
}
trap cleanup EXIT

# Kill any stale sessions from a previous run
cleanup

# ── Launch ─────────────────────────────────────────────────────────────────
echo "Starting TUI at widths: ${WIDTHS[*]} (height ${HEIGHT})"
for w in "${WIDTHS[@]}"; do
  # Inherit SSH_AUTH_SOCK so agent-forwarded keys work without a passphrase prompt.
  # Use bash --norc so shell startup scripts don't block the pane.
  tmux new-session -d -s "${PREFIX}-${w}" -x "$w" -y "$HEIGHT" \
    -e "SSH_AUTH_SOCK=${SSH_AUTH_SOCK:-}" \
    -e "HOME=${HOME}" \
    -e "PATH=${PATH}" \
    bash
  tmux send-keys -t "${PREFIX}-${w}" "cd '${ROOT}' && ${CMD}" Enter
done

echo "Waiting ${WAIT_SECS}s for data to load..."
sleep "$WAIT_SECS"

# ── Capture ────────────────────────────────────────────────────────────────
OUTDIR="${ROOT}/scripts/captures"
mkdir -p "$OUTDIR"

for w in "${WIDTHS[@]}"; do
  OUTFILE="${OUTDIR}/width-${w}.txt"
  printf '%0.s─' $(seq 1 "$w") > "$OUTFILE"
  echo "" >> "$OUTFILE"
  printf " WIDTH %-3s" "$w" >> "$OUTFILE"
  echo "" >> "$OUTFILE"
  printf '%0.s─' $(seq 1 "$w") >> "$OUTFILE"
  echo "" >> "$OUTFILE"
  tmux capture-pane -p -t "${PREFIX}-${w}" >> "$OUTFILE" 2>&1 || echo "(capture failed)" >> "$OUTFILE"
  echo "" >> "$OUTFILE"
done

# ── Print ──────────────────────────────────────────────────────────────────
for w in "${WIDTHS[@]}"; do
  cat "${OUTDIR}/width-${w}.txt"
done

echo ""
echo "Captures saved to ${OUTDIR}/"
