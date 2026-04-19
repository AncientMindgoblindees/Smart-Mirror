#!/usr/bin/env bash
set -euo pipefail

LOCKFILE="/tmp/smart_mirror.lock"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/data/mirror-backend.pid"
TUNNEL_PID_FILE="${ROOT_DIR}/data/mirror-tunnel.pid"

echo "Stopping Smart Mirror..."

terminate_pid() {
  local pid="$1"
  if [[ -z "${pid}" ]] || ! kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi
  kill "${pid}" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
  done
  kill -9 "${pid}" 2>/dev/null || true
}

if [[ -f "${TUNNEL_PID_FILE}" ]]; then
  TUNNEL_PID="$(cat "${TUNNEL_PID_FILE}" || true)"
  terminate_pid "${TUNNEL_PID}"
fi

if [[ -f "${PID_FILE}" ]]; then
  BACKEND_PID="$(cat "${PID_FILE}" || true)"
  terminate_pid "${BACKEND_PID}"
fi

pkill -f chromium 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
pkill -f "uvicorn backend.main:app" 2>/dev/null || true
pkill -f "python3 main.py" 2>/dev/null || true

rm -f "${LOCKFILE}" "${PID_FILE}" "${TUNNEL_PID_FILE}"

echo "Smart Mirror stopped."
