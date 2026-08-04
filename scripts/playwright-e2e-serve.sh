#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
export DOCUMENT_STORE_ROOT="${DOCUMENT_STORE_ROOT:-$ROOT/backend/.e2e-document-store}"
mkdir -p "$DOCUMENT_STORE_ROOT"
E2E_BACKEND_PORT="${E2E_BACKEND_PORT:-8001}"
export E2E_BACKEND_PORT
cd "$ROOT/backend"
python3 -m uvicorn app.main:app --host 127.0.0.1 --port "$E2E_BACKEND_PORT" &
UVICORN_PID=$!
cleanup() {
  kill "$UVICORN_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
for _ in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:${E2E_BACKEND_PORT}/health" >/dev/null; then
    break
  fi
  sleep 0.25
done
curl -sf "http://127.0.0.1:${E2E_BACKEND_PORT}/health" >/dev/null
cd "$ROOT/frontend"
E2E_VITE_PORT="${E2E_VITE_PORT:-5174}"
export E2E_VITE_PORT
export VITE_API_PROXY_TARGET="http://127.0.0.1:${E2E_BACKEND_PORT}"
npm run dev -- --host 127.0.0.1 --strictPort --port "$E2E_VITE_PORT"
