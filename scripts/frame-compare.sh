#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="${LAZYMEM_COMPARE_SESSION:-compare}"
STEP=""
KEY=""
SLEEP_MS="${LAZYMEM_COMPARE_SLEEP_MS:-200}"
COMPARE_MODE="${LAZYMEM_COMPARE_MODE:-full}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION="$2"; shift 2 ;;
    --step) STEP="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --sleep-ms) SLEEP_MS="$2"; shift 2 ;;
    --chars-only) COMPARE_MODE="chars"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$STEP" ]]; then
  echo "--step is required" >&2
  exit 1
fi

TMP_DIR="${TMPDIR:-/tmp}/lazymem-compare"
mkdir -p "$TMP_DIR"
LEFT_RAW="$TMP_DIR/ts-${STEP}.ansi"
RIGHT_RAW="$TMP_DIR/rs-${STEP}.ansi"
WINDOW_INDEX="$(tmux list-windows -t "$SESSION" -F '#I' | head -n1)"
PANES=($(tmux list-panes -t "$SESSION:$WINDOW_INDEX" -F '#{pane_id}'))
LEFT_TARGET="${PANES[0]}"
RIGHT_TARGET="${PANES[1]}"

if [[ -n "$KEY" ]]; then
  tmux send-keys -t "$LEFT_TARGET" "$KEY"
  tmux send-keys -t "$RIGHT_TARGET" "$KEY"
fi

python3 - <<PY
import time
time.sleep(${SLEEP_MS} / 1000)
PY

if [[ "$COMPARE_MODE" == "chars" ]]; then
  tmux capture-pane -p -t "$LEFT_TARGET" > "$LEFT_RAW"
  tmux capture-pane -p -t "$RIGHT_TARGET" > "$RIGHT_RAW"
  python3 "$REPO_ROOT/scripts/ansi_to_grid.py" --chars-only "$LEFT_RAW" "$RIGHT_RAW"
else
  tmux capture-pane -p -e -t "$LEFT_TARGET" > "$LEFT_RAW"
  tmux capture-pane -p -e -t "$RIGHT_TARGET" > "$RIGHT_RAW"
  python3 "$REPO_ROOT/scripts/ansi_to_grid.py" "$LEFT_RAW" "$RIGHT_RAW"
fi
