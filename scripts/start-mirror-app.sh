#!/usr/bin/env bash
set -euo pipefail

LOCKFILE="/tmp/smart_mirror.lock"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MIRROR_PORT:-8002}"
URL="http://127.0.0.1:${PORT}/ui"
LOG_DIR="${ROOT_DIR}/data"
BACKEND_LOG_FILE="${LOG_DIR}/mirror-backend.log"
TUNNEL_LOG_FILE="${LOG_DIR}/mirror-tunnel.log"
PID_FILE="${LOG_DIR}/mirror-backend.pid"
TUNNEL_PID_FILE="${LOG_DIR}/mirror-tunnel.pid"
MIRROR_ENABLE_TUNNEL="${MIRROR_ENABLE_TUNNEL:-1}"
MIRROR_TUNNEL_NAME="${MIRROR_TUNNEL_NAME:-smart-mirror-ui}"
MIRROR_CAMERA_AUTO_STOP_PIPEWIRE="${MIRROR_CAMERA_AUTO_STOP_PIPEWIRE:-1}"
MIRROR_CHROMIUM_PASSWORD_STORE="${MIRROR_CHROMIUM_PASSWORD_STORE:-basic}"
MIRROR_CHROMIUM_DISABLE_INFOBARS="${MIRROR_CHROMIUM_DISABLE_INFOBARS:-0}"
MIRROR_CHROMIUM_OZONE_PLATFORM="${MIRROR_CHROMIUM_OZONE_PLATFORM:-}"
MIRROR_CHROMIUM_USE_OZONE_PLATFORM="${MIRROR_CHROMIUM_USE_OZONE_PLATFORM:-0}"
MIRROR_CHROMIUM_EXTRA_ARGS="${MIRROR_CHROMIUM_EXTRA_ARGS:-}"
MIRROR_KIOSK="${MIRROR_KIOSK:-0}"
MIRROR_TUNNEL_RESTART_DELAY_SEC="${MIRROR_TUNNEL_RESTART_DELAY_SEC:-5}"

mkdir -p "${LOG_DIR}"

# Prevent duplicate runs.
if [[ -f "${LOCKFILE}" ]]; then
  echo "Smart Mirror already running. Exiting."
  exit 1
fi
trap 'rm -f "${LOCKFILE}"' EXIT
touch "${LOCKFILE}"

echo "Starting Smart Mirror..."

# Kill leftover processes (prevents port/tunnel/browser conflicts).
pkill -f cloudflared 2>/dev/null || true
pkill -f chromium 2>/dev/null || true
pkill -f "uvicorn backend.main:app" 2>/dev/null || true

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

if [[ "${MIRROR_CAMERA_AUTO_STOP_PIPEWIRE}" == "1" ]] && command -v systemctl >/dev/null 2>&1; then
  systemctl --user stop pipewire pipewire-pulse wireplumber >/dev/null 2>&1 || true
fi

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
  echo "Run: bash ${ROOT_DIR}/scripts/stop-mirror-app.sh"
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

# Wait for backend readiness.
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

if command -v chromium-browser >/dev/null 2>&1; then
  BROWSER_CMD="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  BROWSER_CMD="chromium"
else
  echo "Chromium not found. Install chromium-browser."
  exit 1
fi

CHROMIUM_ARGS=(
  --password-store="${MIRROR_CHROMIUM_PASSWORD_STORE}"
  --no-first-run
  --no-default-browser-check
)

if [[ "${MIRROR_CHROMIUM_DISABLE_INFOBARS}" == "1" ]]; then
  CHROMIUM_ARGS+=(--disable-infobars)
fi

if [[ "${MIRROR_KIOSK}" == "1" ]]; then
  CHROMIUM_ARGS+=(--kiosk)
else
  CHROMIUM_WINDOW_FLAG="--start-fullscreen"
  if [[ "${MIRROR_FULLSCREEN:-1}" != "1" ]]; then
    CHROMIUM_WINDOW_FLAG="--start-maximized"
  fi
  CHROMIUM_ARGS+=("${CHROMIUM_WINDOW_FLAG}")
fi

if [[ "${MIRROR_CHROMIUM_USE_OZONE_PLATFORM}" == "1" ]]; then
  CHROMIUM_ARGS+=(--enable-features=UseOzonePlatform)
fi

if [[ -n "${MIRROR_CHROMIUM_OZONE_PLATFORM}" ]]; then
  CHROMIUM_ARGS+=(--ozone-platform="${MIRROR_CHROMIUM_OZONE_PLATFORM}")
fi

if [[ -n "${MIRROR_CHROMIUM_EXTRA_ARGS}" ]]; then
  if ! mapfile -d '' -t CHROMIUM_EXTRA_ARGS < <(
    MIRROR_CHROMIUM_EXTRA_ARGS="${MIRROR_CHROMIUM_EXTRA_ARGS}" "${PYTHON}" -c 'import os, shlex, sys; args = shlex.split(os.environ["MIRROR_CHROMIUM_EXTRA_ARGS"]); sys.stdout.buffer.write(b"\0".join(arg.encode("utf-8") for arg in args)); sys.stdout.buffer.write(b"\0" if args else b"")'
  ); then
    echo "Invalid MIRROR_CHROMIUM_EXTRA_ARGS. Use shell-style quoting."
    exit 1
  fi
  CHROMIUM_ARGS+=("${CHROMIUM_EXTRA_ARGS[@]}")
fi

CHROMIUM_ARGS+=("${URL}")

"${BROWSER_CMD}" "${CHROMIUM_ARGS[@]}" &

echo "Smart Mirror started."
