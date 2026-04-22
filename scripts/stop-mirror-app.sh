#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

LOCKFILE="/tmp/smart_mirror.lock"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MIRROR_PORT:-8002}"
BACKEND_INSTANCE_LOCKFILE="/tmp/smart-mirror-backend.lock"
PID_FILE="${ROOT_DIR}/data/mirror-backend.pid"
TUNNEL_PID_FILE="${ROOT_DIR}/data/mirror-tunnel.pid"
MIRROR_TUNNEL_NAME="${MIRROR_TUNNEL_NAME:-smart-mirror-ui}"

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

backend_listener_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -t -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | sort -u || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "( sport = :${PORT} )" 2>/dev/null \
      | grep -oE 'pid=[0-9]+' \
      | cut -d= -f2 \
      | sort -u || true
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "${PORT}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u || true
    return
  fi
}

backend_lock_holder_pids() {
  if [[ ! -f "${BACKEND_INSTANCE_LOCKFILE}" ]]; then
    return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -t "${BACKEND_INSTANCE_LOCKFILE}" 2>/dev/null | sort -u || true
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "${BACKEND_INSTANCE_LOCKFILE}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u || true
    return
  fi
}

terminate_backend_lock_holders() {
  local pid
  mapfile -t BACKEND_LOCK_PIDS < <(backend_lock_holder_pids)
  for pid in "${BACKEND_LOCK_PIDS[@]}"; do
    terminate_pid "${pid}"
  done
}

terminate_backend_listeners() {
  local pid
  local found=0
  local pass
  for pass in {1..3}; do
    mapfile -t LISTENER_PIDS < <(backend_listener_pids)
    if [[ "${#LISTENER_PIDS[@]}" -eq 0 ]]; then
      return 0
    fi
    found=1
    for pid in "${LISTENER_PIDS[@]}"; do
      terminate_pid "${pid}"
    done
  done

  if [[ "${found}" -eq 1 ]]; then
    mapfile -t LISTENER_PIDS < <(backend_listener_pids)
    if [[ "${#LISTENER_PIDS[@]}" -gt 0 ]]; then
      echo "Port ${PORT} still has listeners after stop attempt:"
      printf '  %s\n' "${LISTENER_PIDS[@]}"
      return 1
    fi
  fi

  return 0
}

if [[ -f "${TUNNEL_PID_FILE}" ]]; then
  TUNNEL_PID="$(cat "${TUNNEL_PID_FILE}" || true)"
  terminate_pid "${TUNNEL_PID}"
fi

if [[ -f "${PID_FILE}" ]]; then
  BACKEND_PID="$(cat "${PID_FILE}" || true)"
  terminate_pid "${BACKEND_PID}"
fi

terminate_backend_lock_holders
terminate_backend_listeners

pkill -f "127.0.0.1:${PORT}/ui" 2>/dev/null || true
rm -rf ~/.cache/chromium/*
pkill -f "cloudflared tunnel run ${MIRROR_TUNNEL_NAME}" 2>/dev/null || true

rm -f "${LOCKFILE}" "${PID_FILE}" "${TUNNEL_PID_FILE}"

echo "Smart Mirror stopped."
