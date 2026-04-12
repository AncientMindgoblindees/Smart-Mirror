#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MIRROR_PORT:-8002}"
URL="http://127.0.0.1:${PORT}/ui/"
PID_FILE="${ROOT_DIR}/data/mirror-backend.pid"
LOG_FILE="${ROOT_DIR}/data/mirror-backend.log"
TUNNEL_PID_FILE="${ROOT_DIR}/data/mirror-tunnel.pid"
TUNNEL_LOG_FILE="${ROOT_DIR}/data/mirror-tunnel.log"
MIRROR_ENABLE_TUNNEL="${MIRROR_ENABLE_TUNNEL:-1}"
MIRROR_TUNNEL_NAME="${MIRROR_TUNNEL_NAME:-smart-mirror-ui}"
MIRROR_TUNNEL_RESTART_DELAY_SEC="${MIRROR_TUNNEL_RESTART_DELAY_SEC:-5}"

mkdir -p "${ROOT_DIR}/data"

if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  PYTHON="${ROOT_DIR}/.venv/bin/python"
elif [[ -n "${MIRROR_PYTHON:-}" ]]; then
  PYTHON="${MIRROR_PYTHON}"
else
  PYTHON="python3"
fi

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "Smart Mirror backend already running (PID ${OLD_PID})."
  else
    rm -f "${PID_FILE}"
  fi
fi

if [[ ! -f "${PID_FILE}" ]]; then
  if ! "${PYTHON}" -c "import uvicorn" 2>/dev/null; then
    if [[ -z "${MIRROR_PYTHON:-}" && -f "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh" ]]; then
      bash "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh" "${ROOT_DIR}"
      PYTHON="${ROOT_DIR}/.venv/bin/python"
    fi
  fi
  if ! "${PYTHON}" -c "import uvicorn" 2>/dev/null; then
    echo "Smart Mirror: uvicorn is not installed for: ${PYTHON}" >&2
    echo "Run the Pi installer (sets up venv + deps):" >&2
    echo "  bash ${ROOT_DIR}/deploy/raspberry-pi/install-pi-launcher.sh" >&2
    echo "Or manually:" >&2
    echo "  bash ${ROOT_DIR}/scripts/ensure-mirror-python-env.sh ${ROOT_DIR}" >&2
    exit 1
  fi
  (
    cd "${ROOT_DIR}"
    exec "${PYTHON}" -m uvicorn backend.main:app --host 127.0.0.1 --port "${PORT}"
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

if [[ "${MIRROR_ENABLE_TUNNEL}" == "1" ]]; then
  if command -v cloudflared >/dev/null 2>&1 && [[ -f "${HOME}/.cloudflared/config.yml" ]]; then
    if [[ -f "${TUNNEL_PID_FILE}" ]]; then
      OLD_TUNNEL_PID="$(cat "${TUNNEL_PID_FILE}" || true)"
      if [[ -n "${OLD_TUNNEL_PID}" ]] && kill -0 "${OLD_TUNNEL_PID}" 2>/dev/null; then
        echo "Cloudflare tunnel already running (PID ${OLD_TUNNEL_PID})."
      else
        rm -f "${TUNNEL_PID_FILE}"
      fi
    fi

    if [[ ! -f "${TUNNEL_PID_FILE}" ]]; then
      echo "Starting Cloudflare tunnel: ${MIRROR_TUNNEL_NAME}"
      (
        cd "${ROOT_DIR}"
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
  else
    echo "Cloudflare tunnel not started (missing cloudflared or ~/.cloudflared/config.yml)."
    echo "Setup command:"
    echo "  bash ${ROOT_DIR}/scripts/setup-cloudflare-tunnel.sh --hostname mirror.smart-mirror.tech --service-url http://127.0.0.1:${PORT}"
  fi
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
