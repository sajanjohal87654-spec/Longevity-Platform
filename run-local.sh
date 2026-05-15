#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting standalone local backend on http://localhost:8000"
(cd "$ROOT/backend" && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
API_PID=$!

echo "Starting standalone local frontend on http://localhost:3001"
(cd "$ROOT/frontend" && npm run dev) &
WEB_PID=$!

trap 'kill "$API_PID" "$WEB_PID" 2>/dev/null || true' INT TERM EXIT
wait
