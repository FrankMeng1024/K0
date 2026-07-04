#!/usr/bin/env bash
# Web start script — starts Expo web version on port 8081 for Playwright QA
set -euo pipefail
cd "$(dirname "$0")/.."

# Install deps if node_modules missing
if [ ! -d node_modules ]; then
  echo "-> installing frontend dependencies (first run, may take a while)..."
  npm install --no-audit --no-fund
fi

# Start expo --web in foreground unless BACKGROUND=1
if [ "${BACKGROUND:-0}" = "1" ]; then
  echo "-> starting expo --web in background..."
  nohup npx expo start --web --port 8081 > /tmp/k0-web.log 2>&1 &
  echo $! > /tmp/k0-web.pid
  # Wait up to 60s for web bundle
  for i in $(seq 1 60); do
    sleep 1
    if curl -sf http://localhost:8081 > /dev/null 2>&1; then
      echo "OK  expo web up on http://localhost:8081"
      exit 0
    fi
  done
  echo "!!  expo web did not respond within 60s. Check /tmp/k0-web.log"
  tail -30 /tmp/k0-web.log
  exit 1
else
  echo "-> starting expo --web (foreground) on http://localhost:8081"
  exec npx expo start --web --port 8081
fi
