#!/usr/bin/env bash
# keep-alive.sh — prevent screen sleep by touching a file every 9 minutes
# Runs silently in background. Launch with: bash scripts/keep-alive.sh &
# Stop with: kill $(cat /tmp/k0-keepalive.pid)

NOTEPADPP="C:/tools/Notepad++/notepad++.exe"
TMP_FILE="C:/Windows/Temp/k0_keepalive.txt"
INTERVAL=540  # 9 minutes

echo $$ > /tmp/k0-keepalive.pid
echo "keep-alive started (pid=$$, interval=${INTERVAL}s)"

while true; do
  # Write current timestamp to tmp file
  date '+%Y-%m-%d %H:%M:%S keep-alive' > "$TMP_FILE"

  # Open in Notepad++ briefly then close
  if [ -f "$NOTEPADPP" ]; then
    "$NOTEPADPP" "$TMP_FILE" &
    NP_PID=$!
    sleep 3
    taskkill //F //PID $NP_PID > /dev/null 2>&1 || true
  else
    # Fallback: just touch the file (already done above)
    :
  fi

  sleep $INTERVAL
done
