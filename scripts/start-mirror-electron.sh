#!/usr/bin/env bash
set -euo pipefail

LOCKFILE="/tmp/smart_mirror_electron.lock"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE="${ROOT_DIR}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

PORT="${MIRROR_PORT:-8002}"
URL="http://127.0.0.1:${PORT}/ui"
LOG_DIR="${ROOT_DIR}/data"
BACKEND_LOG_FILE="${LOG_DIR}/mirror-backend-electron.log"
TUNNEL_LOG_FILE="${LOG_DIR}/mirror-tunnel-electron.log"
ELECTRON_LOG_FILE="${LOG_DIR}/mirror-electron.log"
PID_FILE="${LOG_DIR}/mirror-backend-electron.pid"
TUNNEL_PID_FILE="${LOG_DIR}/mirror-tunnel-electron.pid"
ELECTRON_PID_FILE="${LOG_DIR}/mirror-electron.pid"
MIRROR_ENABLE_TUNNEL="${MIRROR_ENABLE_TUNNEL:-1}"
MIRROR_TUNNEL_NAME="${MIRROR_TUNNEL_NAME:-smart-mirror-ui}"
MIRROR_TUNNEL_RESTART_DELAY_SEC="${MIRROR_TUNNEL_RESTART_DELAY_SEC:-5}"

mkdir -p "${LOG_DIR}"

if [[ -f "${LOCKFILE}" ]]; then
  echo "Smart Mirror (Electron) already running. Exiting."
  exit 1
fi
trap 'rm -f "${LOCKFILE}"' EXIT
touch "${LOCKFILE}"

echo "Starting Smart Mirror (Electron)..."

pkill -f "electron/main.cjs" 2>/dev/null || true
pkill -f "uvicorn backend.main:app" 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true

port_owner() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "( sport = :${PORT} )" 2>/dev/null | sed -n '2,$p' || true
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  echo ""
}

if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  PYTHON="${ROOT_DIR}/.venv/bin/python"
elif [[ -n "${MIRROR_PYTHON:-}" ]]; then
  PYTHON="${MIRROR_PYTHON}"
else
  PYTHON="python3"
fi

if ! "${PYTHON}" -c "import uvicorn" 2>/dev/null; then
  if [[ -f "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh" ]]; then
    bash "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh" "${ROOT_DIR}"
    PYTHON="${ROOT_DIR}/.venv/bin/python"
  fi
fi

if ! "${PYTHON}" -c "import uvicorn" 2>/dev/null; then
  echo "Smart Mirror: uvicorn is not installed for ${PYTHON}."
  echo "Run: bash ${ROOT_DIR}/scripts/ensure-mirror-python-env.sh ${ROOT_DIR}"
  exit 1
fi

OWNER_INFO="$(port_owner)"
if [[ -n "${OWNER_INFO// /}" ]]; then
  echo "Port ${PORT} is already in use; not starting backend."
  echo "${OWNER_INFO}"
  echo "Run: bash ${ROOT_DIR}/scripts/stop-mirror-electron.sh"
  exit 1
fi

(
  cd "${ROOT_DIR}"
  exec "${PYTHON}" -m uvicorn backend.main:app --host 127.0.0.1 --port "${PORT}"
) >>"${BACKEND_LOG_FILE}" 2>&1 &
echo "$!" >"${PID_FILE}"

if [[ "${MIRROR_ENABLE_TUNNEL}" == "1" ]] && command -v cloudflared >/dev/null 2>&1; then
  (
    CHILD=""
    trap '[[ -n "${CHILD}" ]] && kill "${CHILD}" 2>/dev/null; exit 0' TERM INT
    while true; do
      echo "$(date -Iseconds 2>/dev/null || date) starting cloudflared tunnel run ${MIRROR_TUNNEL_NAME}" >>"${TUNNEL_LOG_FILE}"
      cloudflared tunnel run "${MIRROR_TUNNEL_NAME}" >>"${TUNNEL_LOG_FILE}" 2>&1 &
      CHILD="$!"
      wait "${CHILD}" || true
      CHILD=""
      echo "$(date -Iseconds 2>/dev/null || date) cloudflared exited; retry in ${MIRROR_TUNNEL_RESTART_DELAY_SEC}s" >>"${TUNNEL_LOG_FILE}"
      sleep "${MIRROR_TUNNEL_RESTART_DELAY_SEC}"
    done
  ) &
  echo "$!" >"${TUNNEL_PID_FILE}"
fi

for _ in {1..50}; do
  if curl -fsS "${URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
if ! curl -fsS "${URL}" >/dev/null 2>&1; then
  echo "Backend failed to start. See ${BACKEND_LOG_FILE}"
  exit 1
fi

(
  cd "${ROOT_DIR}/ui"
  SMART_MIRROR_UI_URL="${URL}" exec npm exec electron ./electron/main.cjs
) >>"${ELECTRON_LOG_FILE}" 2>&1 &
echo "$!" >"${ELECTRON_PID_FILE}"

echo "Smart Mirror (Electron) started."
echo "Backend: ${BACKEND_LOG_FILE}"
echo "Electron: ${ELECTRON_LOG_FILE}"
