#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/data/mirror-backend.pid"
TUNNEL_PID_FILE="${ROOT_DIR}/data/mirror-tunnel.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "No backend pid file found."
  exit 0
fi

PID="$(cat "${PID_FILE}" || true)"
if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}" || true
  echo "Stopped backend PID ${PID}"
else
  echo "Backend process not running."
fi

rm -f "${PID_FILE}"

if [[ -f "${TUNNEL_PID_FILE}" ]]; then
  TUNNEL_PID="$(cat "${TUNNEL_PID_FILE}" || true)"
  if [[ -n "${TUNNEL_PID}" ]] && kill -0 "${TUNNEL_PID}" 2>/dev/null; then
    kill "${TUNNEL_PID}" || true
    echo "Stopped tunnel PID ${TUNNEL_PID}"
  else
    echo "Tunnel process not running."
  fi
  rm -f "${TUNNEL_PID_FILE}"
fi
