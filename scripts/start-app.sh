#!/usr/bin/env bash
# App start script — for iOS/Android via Expo Go or dev client
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d node_modules ]; then
  echo "-> installing frontend dependencies..."
  npm install --no-audit --no-fund
fi
echo "-> starting expo (foreground). Scan QR from Expo Go on your iPhone."
exec npx expo start
