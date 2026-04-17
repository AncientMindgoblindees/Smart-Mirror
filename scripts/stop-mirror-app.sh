#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/data/mirror-backend.pid"
TUNNEL_PID_FILE="${ROOT_DIR}/data/mirror-tunnel.pid"
PORT="${MIRROR_PORT:-8002}"
MIRROR_STOP_EXTRA_BACKENDS="${MIRROR_STOP_EXTRA_BACKENDS:-1}"

terminate_pid() {
  local pid="$1"
  local label="$2"
  if [[ -z "${pid}" ]] || ! kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi
  kill "${pid}" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "Stopped ${label} PID ${pid}"
      return 0
    fi
    sleep 0.1
  done
  kill -9 "${pid}" 2>/dev/null || true
  echo "Force-stopped ${label} PID ${pid}"
}

if [[ ! -f "${PID_FILE}" ]]; then
  echo "No backend pid file found."
  exit 0
fi

PID="$(cat "${PID_FILE}" || true)"
if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
  terminate_pid "${PID}" "backend"
else
  echo "Backend process not running."
fi

rm -f "${PID_FILE}"

if [[ -f "${TUNNEL_PID_FILE}" ]]; then
  TUNNEL_PID="$(cat "${TUNNEL_PID_FILE}" || true)"
  if [[ -n "${TUNNEL_PID}" ]] && kill -0 "${TUNNEL_PID}" 2>/dev/null; then
    terminate_pid "${TUNNEL_PID}" "tunnel"
  else
    echo "Tunnel process not running."
  fi
  rm -f "${TUNNEL_PID_FILE}"
fi

if [[ "${MIRROR_STOP_EXTRA_BACKENDS}" == "1" ]]; then
  mapfile -t EXTRA_PIDS < <(ps -eo pid,args | awk -v p="--port ${PORT}" '/uvicorn backend.main:app/ && index($0, p) {print $1}')
  for EXTRA in "${EXTRA_PIDS[@]}"; do
    if [[ -n "${PID}" ]] && [[ "${EXTRA}" == "${PID}" ]]; then
      continue
    fi
    terminate_pid "${EXTRA}" "extra backend"
  done
elif command -v ss >/dev/null 2>&1; then
  LISTEN_INFO="$(ss -ltnp "( sport = :${PORT} )" 2>/dev/null | sed -n '2,$p' || true)"
  if [[ -n "${LISTEN_INFO// /}" ]]; then
    echo "Port ${PORT} still has listeners. To stop extra backend instances:"
    echo "  MIRROR_STOP_EXTRA_BACKENDS=1 bash scripts/stop-mirror-app.sh"
    echo "${LISTEN_INFO}"
  fi
fi
