#!/usr/bin/env bash
# schedule-tests.sh
# Install or remove a cron job that runs the inline-expand tests hourly.
#
# Usage:
#   bash scripts/schedule-tests.sh install    # add cron entry
#   bash scripts/schedule-tests.sh remove     # remove cron entry
#   bash scripts/schedule-tests.sh status     # show if installed
#   bash scripts/schedule-tests.sh run        # run once now (foreground)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/test-inline-expand.sh"
LOG="$ROOT/scripts/test-results.log"
CRON_TAG="# lazymem-inline-expand-test"
CRON_JOB="0 * * * * cd '$ROOT' && bash '$SCRIPT' all >> '$LOG' 2>&1 $CRON_TAG"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

CMD="${1:-status}"

case "$CMD" in
  install)
    if crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
      echo -e "  ${YELLOW}Already installed.${NC} Use 'remove' first to replace."
    else
      (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
      echo -e "  ${GREEN}Installed.${NC} Runs every hour on the hour."
      echo "  Log: $LOG"
    fi
    ;;

  remove)
    if crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
      crontab -l 2>/dev/null | grep -vF "$CRON_TAG" | crontab -
      echo -e "  ${GREEN}Removed.${NC}"
    else
      echo -e "  ${YELLOW}Not installed.${NC}"
    fi
    ;;

  status)
    if crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
      echo -e "  ${GREEN}Installed${NC} — runs every hour."
      echo "  Log: $LOG"
      if [ -f "$LOG" ]; then
        echo ""
        echo "  Last 5 log entries:"
        grep -E "PASS|FAIL|SKIP|====|Results" "$LOG" 2>/dev/null | tail -20 | sed 's/^/    /'
      fi
    else
      echo -e "  ${YELLOW}Not installed.${NC}"
      echo "  Run: bash scripts/schedule-tests.sh install"
    fi
    ;;

  run)
    echo "  Running tests now (logging to $LOG)..."
    bash "$SCRIPT" all 2>&1 | tee -a "$LOG"
    ;;

  *)
    echo "Usage: $0 [install|remove|status|run]"
    exit 1
    ;;
esac
