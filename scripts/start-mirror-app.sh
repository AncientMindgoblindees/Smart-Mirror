#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MIRROR_PORT:-8002}"
URL="http://127.0.0.1:${PORT}/ui/"
PID_FILE="${ROOT_DIR}/data/mirror-backend.pid"
LOG_FILE="${ROOT_DIR}/data/mirror-backend.log"

mkdir -p "${ROOT_DIR}/data"

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "Smart Mirror backend already running (PID ${OLD_PID})."
  else
    rm -f "${PID_FILE}"
  fi
fi

if [[ ! -f "${PID_FILE}" ]]; then
  (
    cd "${ROOT_DIR}"
    python3 -m uvicorn backend.main:app --host 127.0.0.1 --port "${PORT}"
  ) >>"${LOG_FILE}" 2>&1 &
  echo "$!" >"${PID_FILE}"
fi

echo "Waiting for backend: ${URL}"
for _ in {1..50}; do
  if curl -fsS "${URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

if ! curl -fsS "${URL}" >/dev/null 2>&1; then
  echo "Backend failed to start. See ${LOG_FILE}"
  exit 1
fi

if command -v chromium-browser >/dev/null 2>&1; then
  BROWSER_CMD="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  BROWSER_CMD="chromium"
else
  echo "Chromium not found. Install chromium-browser."
  exit 1
fi

# Default: maximized resizable app window. Set MIRROR_FULLSCREEN=1 for kiosk-style fullscreen.
CHROMIUM_WINDOW_FLAGS=(--start-maximized)
if [[ "${MIRROR_FULLSCREEN:-}" == "1" ]]; then
  CHROMIUM_WINDOW_FLAGS=(--start-fullscreen)
fi

exec "${BROWSER_CMD}" \
  --app="${URL}" \
  "${CHROMIUM_WINDOW_FLAGS[@]}" \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --check-for-update-interval=31536000
