#!/usr/bin/env bash
# Backend start script — Sprint 1 canonical start-backend
# Verifies deps → starts service → confirms /health returns 200 within 15s
set -euo pipefail

cd "$(dirname "$0")/../backend"

# 1. Verify deps
if [ ! -d node_modules ]; then
  echo "-> installing dependencies..."
  npm install --no-audit --no-fund
fi

# 2. Verify env
if [ ! -f .env ]; then
  echo "!!  backend/.env missing. Copy backend/../.env.example → backend/.env and fill values."
  echo "!!  For local dev without DB, minimally set: NODE_ENV=development PORT=3002 AUTH_ENABLED=false"
fi

# 3. Start (in background if BACKGROUND=1, else foreground)
if [ "${BACKGROUND:-0}" = "1" ]; then
  echo "-> starting backend in background..."
  nohup node src/index.js > /tmp/k0-backend.log 2>&1 &
  BACKEND_PID=$!
  echo "$BACKEND_PID" > /tmp/k0-backend.pid
  # 4. Wait for health
  for i in $(seq 1 15); do
    sleep 1
    if curl -sf http://localhost:3002/health > /dev/null 2>&1; then
      echo "OK  backend up (pid=$BACKEND_PID), /health responding"
      curl -s http://localhost:3002/health
      echo
      exit 0
    fi
  done
  echo "!!  backend did not respond to /health within 15s. Check /tmp/k0-backend.log"
  tail -30 /tmp/k0-backend.log
  exit 1
else
  echo "-> starting backend (foreground). Ctrl+C to stop."
  exec node src/index.js
fi
