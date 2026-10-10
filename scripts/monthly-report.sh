#!/bin/zsh
# Monthly analytics report for datakart.no, run on this Mac.
#
#   scripts/monthly-report.sh              report for last month (skips if it exists)
#   scripts/monthly-report.sh 2026-09      report for a given month
#   scripts/monthly-report.sh --force      regenerate last month's report
#   scripts/monthly-report.sh --install    run automatically on the 4th of each month (launchd)
#   scripts/monthly-report.sh --uninstall  stop the automatic run
#
# 1. scripts/analytics-report.mjs collects GA4 + Search Console numbers
#    (Markdown for the archive and for Claude, JSON for the visual page).
# 2. Headless Claude Code reads the Markdown on stdin and writes plain-
#    language findings in Norwegian as JSON. It runs with no tools at all
#    (--tools "", no MCP servers), so it can only read the numbers it is given.
# 3. scripts/render-report-html.mjs builds a visual, offline HTML page.
# 4. Saves ~/Documents/Datakart-rapporter/YYYY-MM.html (+ .md, and the
#    .data.json / .findings.json inputs), opens the page and notifies.
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
HTML="$OUT_DIR/$MONTH.html"
if [[ -f "$HTML" && $FORCE == 0 ]]; then
  echo "$(date '+%F %T') $OUT already exists — skipping (use --force)."
  exit 0
fi

mkdir -p "$OUT_DIR"
cd "$REPO"
echo "$(date '+%F %T') Building report for $MONTH"

DATA="$(mktemp)"
JSON="$(mktemp)"
FIND="$(mktemp)"
trap 'rm -f "$DATA" "$JSON" "$FIND"' EXIT
if ! node scripts/analytics-report.mjs --month "$MONTH" > "$DATA" || ! node scripts/analytics-report.mjs --month "$MONTH" --json > "$JSON"; then
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

# Plain-language findings for the visual page. The owner is not an SEO or
# analytics specialist: no jargon, everyday Norwegian.
PROMPT_NB="Du leser månedsrapporten for datakart.no (gratis kart med åpne data: Høydekart /map, Valgkart /valg, Tomtegrenser /eiendom, Energikart /energikart, Magasinkart /magasin og en side per kommune /kommune/...). Eieren er én utvikler som vil ha flere besøkende, men er IKKE ekspert på SEO eller analyse.

Rapporten kommer på stdin. Svar KUN med gyldig JSON, uten kodeblokk eller annen tekst, med denne formen:
{\"kortFortalt\": \"1–2 setninger om det viktigste som skjedde denne måneden\",
 \"godeNyheter\": [{\"tittel\": \"kort\", \"tekst\": \"1–2 setninger\"}],
 \"gjoreNa\": [{\"tittel\": \"konkret handling\", \"tekst\": \"hvorfor, i 1–2 setninger\"}]}
Regler: 2–3 gode nyheter og nøyaktig 3 ting å gjøre, viktigste først. Skriv enkel, hverdagslig norsk bokmål. Ingen fagord: si «ganger vist i Google» (ikke impressions), «andel som klikket» (ikke CTR), «plass i Google» (ikke posisjon/rank), «adressen uten www» (ikke apex). Bruk sidenavn (Høydekart, Valgkart, Tomtegrenser), ikke URL-er. Bruk bare tall som står i rapporten, avrundet, og aldri årsaker du ikke kan begrunne. Er en endring for ny til å vurdere, si det rett ut."

if CLAUDE_JSON="$(claude -p --tools "" --strict-mcp-config --no-session-persistence "$PROMPT_NB" < "$DATA" 2>>"$LOG")"; then
  # Keep only the JSON object, in case the model wrapped it in anything.
  print -r -- "$CLAUDE_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const a=s.indexOf("{"),b=s.lastIndexOf("}");try{process.stdout.write(JSON.stringify(JSON.parse(s.slice(a,b+1))))}catch{process.exit(1)}})' > "$FIND" || : > "$FIND"
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

# Keep the inputs so the page can be re-rendered without new API or Claude
# calls: node scripts/render-report-html.mjs YYYY-MM.data.json YYYY-MM.findings.json
cp "$JSON" "$OUT_DIR/$MONTH.data.json"
[[ -s "$FIND" ]] && cp "$FIND" "$OUT_DIR/$MONTH.findings.json"
node scripts/render-report-html.mjs "$JSON" "$FIND" > "$HTML"

echo "$(date '+%F %T') Wrote $HTML and $OUT"
open "$HTML" || true
notify "Månedsrapporten for $MONTH er klar"
