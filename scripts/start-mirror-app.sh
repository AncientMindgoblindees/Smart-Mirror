#!/usr/bin/env sh
set -eu
(set -o pipefail) >/dev/null 2>&1 && set -o pipefail || true

LOCKFILE="/tmp/smart_mirror.lock"
LOCKDIR_FALLBACK="${LOCKFILE}.d"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
PORT="${MIRROR_PORT:-8002}"
URL="http://127.0.0.1:${PORT}/ui"
LOG_DIR="${ROOT_DIR}/data"
BACKEND_INSTANCE_LOCKFILE="/tmp/smart-mirror-backend.lock"
BACKEND_LOG_FILE="${LOG_DIR}/mirror-backend.log"
TUNNEL_LOG_FILE="${LOG_DIR}/mirror-tunnel.log"
PID_FILE="${LOG_DIR}/mirror-backend.pid"
TUNNEL_PID_FILE="${LOG_DIR}/mirror-tunnel.pid"
MIRROR_ENABLE_TUNNEL="${MIRROR_ENABLE_TUNNEL:-1}"
MIRROR_TUNNEL_NAME="${MIRROR_TUNNEL_NAME:-smart-mirror-ui}"
MIRROR_CAMERA_AUTO_STOP_PIPEWIRE="${MIRROR_CAMERA_AUTO_STOP_PIPEWIRE:-1}"
MIRROR_CHROMIUM_PASSWORD_STORE="${MIRROR_CHROMIUM_PASSWORD_STORE:-basic}"
MIRROR_TUNNEL_RESTART_DELAY_SEC="${MIRROR_TUNNEL_RESTART_DELAY_SEC:-5}"

mkdir -p "${LOG_DIR}"

acquire_start_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${LOCKFILE}"
    if ! flock -n 9; then
      echo "Another Smart Mirror start is already in progress; exiting."
      exit 0
    fi
    return 0
  fi

  if ! mkdir "${LOCKDIR_FALLBACK}" 2>/dev/null; then
    echo "Another Smart Mirror start is already in progress; exiting."
    exit 0
  fi

  trap 'rmdir "${LOCKDIR_FALLBACK}" 2>/dev/null || true' EXIT
}

cleanup_stale_pid_file() {
  file="$1"
  if [ ! -f "${file}" ]; then
    return 0
  fi

  pid="$(cat "${file}" 2>/dev/null || true)"
  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi

  rm -f "${file}"
}

port_owner() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "( sport = :${PORT} )" 2>/dev/null | sed -n '2,$p' || true
    return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true
    return 0
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -v -n tcp "${PORT}" 2>/dev/null || true
    return 0
  fi
  return 0
}

backend_lock_holder_pids() {
  if [ ! -f "${BACKEND_INSTANCE_LOCKFILE}" ]; then
    return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -t "${BACKEND_INSTANCE_LOCKFILE}" 2>/dev/null | sort -u || true
    return 0
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "${BACKEND_INSTANCE_LOCKFILE}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u || true
    return 0
  fi
  return 0
}

start_backend_if_needed() {
  cleanup_stale_pid_file "${PID_FILE}"

  if [ -f "${PID_FILE}" ]; then
    old_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [ -n "${old_pid}" ] && kill -0 "${old_pid}" 2>/dev/null; then
      echo "Smart Mirror backend already running (PID ${old_pid})."
      return 0
    fi
  fi

  backend_lock_pids="$(backend_lock_holder_pids)"
  if [ -n "${backend_lock_pids}" ]; then
    echo "Smart Mirror backend lock is already held; not starting another instance."
    printf '%s\n' "${backend_lock_pids}" | sed '/^$/d; s/^/  /'
    echo "Run: sh ${ROOT_DIR}/scripts/stop-mirror-app.sh"
    return 0
  fi

  owner_info="$(port_owner)"
  owner_info_compact="$(printf '%s' "${owner_info}" | tr -d '[:space:]')"
  if [ -n "${owner_info_compact}" ]; then
    echo "Smart Mirror backend already has a listener on port ${PORT}; not starting another instance."
    printf '%s\n' "${owner_info}"
    echo "Run: sh ${ROOT_DIR}/scripts/stop-mirror-app.sh"
    return 0
  fi

  (
    cd "${ROOT_DIR}"
    exec "${PYTHON}" -m uvicorn backend.main:app --host 127.0.0.1 --port "${PORT}"
  ) >>"${BACKEND_LOG_FILE}" 2>&1 &
  echo "$!" >"${PID_FILE}"
}

start_tunnel_if_needed() {
  if [ "${MIRROR_ENABLE_TUNNEL}" != "1" ] || ! command -v cloudflared >/dev/null 2>&1; then
    return 0
  fi

  cleanup_stale_pid_file "${TUNNEL_PID_FILE}"

  if [ -f "${TUNNEL_PID_FILE}" ]; then
    old_tunnel_pid="$(cat "${TUNNEL_PID_FILE}" 2>/dev/null || true)"
    if [ -n "${old_tunnel_pid}" ] && kill -0 "${old_tunnel_pid}" 2>/dev/null; then
      echo "Cloudflare tunnel already running (PID ${old_tunnel_pid})."
      return 0
    fi
  fi

  (
    child_pid=""
    trap 'if [ -n "${child_pid}" ]; then kill "${child_pid}" 2>/dev/null || true; fi; exit 0' TERM INT
    while :; do
      timestamp="$(date -Iseconds 2>/dev/null || date)"
      echo "${timestamp} starting cloudflared tunnel run ${MIRROR_TUNNEL_NAME}" >>"${TUNNEL_LOG_FILE}"
      cloudflared tunnel run "${MIRROR_TUNNEL_NAME}" >>"${TUNNEL_LOG_FILE}" 2>&1 &
      child_pid="$!"
      wait "${child_pid}" || true
      child_pid=""
      timestamp="$(date -Iseconds 2>/dev/null || date)"
      echo "${timestamp} cloudflared exited; retry in ${MIRROR_TUNNEL_RESTART_DELAY_SEC}s" >>"${TUNNEL_LOG_FILE}"
      sleep "${MIRROR_TUNNEL_RESTART_DELAY_SEC}"
    done
  ) &
  echo "$!" >"${TUNNEL_PID_FILE}"
}

acquire_start_lock

echo "Starting Smart Mirror..."

if [ "${MIRROR_CAMERA_AUTO_STOP_PIPEWIRE}" = "1" ] && command -v systemctl >/dev/null 2>&1; then
  systemctl --user stop pipewire pipewire-pulse wireplumber >/dev/null 2>&1 || true
fi

if [ -x "${ROOT_DIR}/venv/bin/python" ]; then
  PYTHON="${ROOT_DIR}/venv/bin/python"
elif [ -n "${MIRROR_PYTHON:-}" ]; then
  PYTHON="${MIRROR_PYTHON}"
else
  PYTHON="python3"
fi

if ! "${PYTHON}" -c "import uvicorn" 2>/dev/null; then
  if [ -f "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh" ]; then
    sh "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh" "${ROOT_DIR}"
    PYTHON="${ROOT_DIR}/venv/bin/python"
  fi
fi

if ! "${PYTHON}" -c "import uvicorn" 2>/dev/null; then
  echo "Smart Mirror: uvicorn is not installed for ${PYTHON}."
  echo "Run: sh ${ROOT_DIR}/scripts/ensure-mirror-python-env.sh ${ROOT_DIR}"
  exit 1
fi

start_backend_if_needed
start_tunnel_if_needed

i=0
while [ "${i}" -lt 50 ]; do
  if curl -fsS "${URL}" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 0.2
done

if ! curl -fsS "${URL}" >/dev/null 2>&1; then
  echo "Backend failed to start. See ${BACKEND_LOG_FILE}"
  exit 1
fi

detect_browser() {
  # Linux Chromium
  if command -v chromium-browser >/dev/null 2>&1; then
    echo "chromium-browser"
    return
  fi

  if command -v chromium >/dev/null 2>&1; then
    echo "chromium"
    return
  fi

  # WSL Windows Chrome (your actual case)
  if [ -f "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
    echo "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
    return
  fi

  if [ -f "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" ]; then
    echo "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
    return
  fi

  echo ""
}

BROWSER_CMD="$(detect_browser)"

if [ -z "${BROWSER_CMD}" ]; then
  echo "No supported browser found (Chromium or Chrome)."
  exit 1
fi

CHROMIUM_WINDOW_FLAG="--start-fullscreen"
if [ "${MIRROR_FULLSCREEN:-1}" != "1" ]; then
  CHROMIUM_WINDOW_FLAG="--start-maximized"
fi

"${BROWSER_CMD}" \
  "${CHROMIUM_WINDOW_FLAG}" \
  --password-store="${MIRROR_CHROMIUM_PASSWORD_STORE}" \
  --no-first-run \
  --no-default-browser-check \
  "${URL}" &

echo "Smart Mirror started."
