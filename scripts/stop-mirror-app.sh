#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/data/mirror-backend.pid"

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
