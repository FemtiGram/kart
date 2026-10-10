#!/bin/zsh
# Monthly analytics report for datakart.no, run on this Mac.
#
#   scripts/monthly-report.sh              report for last month (skips if it exists)
#   scripts/monthly-report.sh 2026-09      report for a given month
#   scripts/monthly-report.sh --force      regenerate last month's report
#   scripts/monthly-report.sh --install    run automatically on the 4th of each month (launchd)
#   scripts/monthly-report.sh --uninstall  stop the automatic run
#
# 1. scripts/analytics-report.mjs collects GA4 + Search Console numbers.
# 2. Headless Claude Code reads that Markdown on stdin and writes findings.
#    It runs with no tools at all (--tools "", no MCP servers), so it can
#    only read the numbers it is given.
# 3. Saves ~/Documents/Datakart-rapporter/YYYY-MM.md and shows a notification.
#
# The report stays on this Mac: the repo is public, so it must never be
# committed or posted to GitHub.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin"

REPO="${0:A:h:h}"
OUT_DIR="$HOME/Documents/Datakart-rapporter"
LABEL="no.datakart.monthly-report"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/datakart-monthly-report.log"

notify() { osascript -e "display notification \"$1\" with title \"Datakart\"" >/dev/null 2>&1 || true; }

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "${PLIST:h}"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$REPO/scripts/monthly-report.sh</string></array>
  <!-- The 4th: Search Console needs ~3 days to finalise the previous month.
       If the Mac is asleep at 09:00, launchd runs the job when it wakes. -->
  <key>StartCalendarInterval</key>
  <dict><key>Day</key><integer>4</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "Installed: runs on the 4th of each month at 09:00. Reports → $OUT_DIR, log → $LOG"
  exit 0
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled."
  exit 0
fi

FORCE=0
MONTH=""
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]) MONTH="$a" ;;
    *) echo "Unknown argument: $a" >&2; exit 2 ;;
  esac
done
[[ -z "$MONTH" ]] && MONTH="$(date -v-1m +%Y-%m)"

OUT="$OUT_DIR/$MONTH.md"
if [[ -f "$OUT" && $FORCE == 0 ]]; then
  echo "$(date '+%F %T') $OUT already exists — skipping (use --force)."
  exit 0
fi

mkdir -p "$OUT_DIR"
cd "$REPO"
echo "$(date '+%F %T') Building report for $MONTH"

DATA="$(mktemp)"
trap 'rm -f "$DATA"' EXIT
if ! node scripts/analytics-report.mjs --month "$MONTH" > "$DATA"; then
  notify "Månedsrapporten for $MONTH feilet — se $LOG"
  exit 1
fi

PROMPT="You are reviewing the monthly analytics report for datakart.no, a Norwegian site with free interactive maps of open public data (elevation /map, elections /valg, property boundaries /eiendom, energy /energikart, reservoirs /magasin, and 357 kommune profile pages /kommune/<slug>). Its owner is one developer who wants more search traffic and a better experience for visitors.

The report follows on stdin. Write a section in English with 5–8 short bullet points:
- what changed this month and the most likely reason,
- how the tracked changes are doing (say plainly if it is too early to tell),
- the 2–3 most valuable things to do next, each tied to a specific number in the report,
- any data-quality problem you notice (e.g. duplicate apex/www URLs, URLs with query strings in Google).
Use only numbers that appear in the report; never invent figures or causes you cannot support. Be direct and concrete. Output only the bullet points, no heading."

FINDINGS=""
if ! FINDINGS="$(claude -p --tools "" --strict-mcp-config --no-session-persistence "$PROMPT" < "$DATA" 2>>"$LOG")" || [[ -z "$FINDINGS" ]]; then
  FINDINGS="_Claude's findings could not be generated this month (see $LOG). The numbers below are complete._"
fi

{
  sed -n '1,2p' "$DATA"
  echo
  echo "## Findings"
  echo
  echo "$FINDINGS"
  echo
  sed -n '3,$p' "$DATA"
} > "$OUT"

echo "$(date '+%F %T') Wrote $OUT"
notify "Månedsrapport for $MONTH er klar: ~/Documents/Datakart-rapporter/$MONTH.md"
