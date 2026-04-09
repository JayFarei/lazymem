#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="${LAZYMEM_COMPARE_SESSION:-compare}"
WIDTH="${LAZYMEM_COMPARE_WIDTH:-280}"
HEIGHT="${LAZYMEM_COMPARE_HEIGHT:-50}"
LEFT_BIN="${LAZYMEM_COMPARE_LEFT_BIN:-./bin/lazymem}"
RIGHT_BIN="${LAZYMEM_COMPARE_RIGHT_BIN:-./bin/lazymem-rs}"
FIXTURE="${LAZYMEM_FIXTURE:-}"
ATTACH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION="$2"; shift 2 ;;
    --width) WIDTH="$2"; shift 2 ;;
    --height) HEIGHT="$2"; shift 2 ;;
    --left-bin) LEFT_BIN="$2"; shift 2 ;;
    --right-bin) RIGHT_BIN="$2"; shift 2 ;;
    --fixture) FIXTURE="$2"; shift 2 ;;
    --attach) ATTACH=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
fi

# WIDTH refers to the terminal width for each app under test. tmux needs one
# extra cell for the divider between panes.
SESSION_WIDTH=$((WIDTH * 2 + 1))

WINDOW_TARGET="$(tmux new-session -d -P -F '#{session_name}:#{window_index}' -s "$SESSION" -x "$SESSION_WIDTH" -y "$HEIGHT" -c "$REPO_ROOT")"
tmux set-option -t "$WINDOW_TARGET" remain-on-exit on
tmux split-window -h -t "$WINDOW_TARGET" -c "$REPO_ROOT"
PANES=($(tmux list-panes -t "$WINDOW_TARGET" -F '#{pane_id}'))
LEFT_PANE="${PANES[0]}"
RIGHT_PANE="${PANES[1]}"

build_cmd() {
  local bin="$1"
  if [[ -n "$FIXTURE" ]]; then
    printf 'TERM=xterm-256color LAZYMEM_FIXTURE=%q %q' "$FIXTURE" "$bin"
  else
    printf 'TERM=xterm-256color %q' "$bin"
  fi
}

tmux send-keys -t "$LEFT_PANE" "$(build_cmd "$LEFT_BIN")" C-m
tmux send-keys -t "$RIGHT_PANE" "$(build_cmd "$RIGHT_BIN")" C-m

echo "session: $SESSION"
echo "left:    $LEFT_BIN"
echo "right:   $RIGHT_BIN"
if [[ -n "$FIXTURE" ]]; then
echo "fixture: $FIXTURE"
fi
echo "width:   $WIDTH per pane"
echo "height:  $HEIGHT"

if [[ "$ATTACH" -eq 1 ]]; then
  exec tmux attach-session -t "$SESSION"
fi
