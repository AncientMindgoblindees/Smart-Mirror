#!/usr/bin/env bash
# Install Smart Mirror launcher (and optionally autostart + Cloudflare tunnel).
# Usage:
#   bash deploy/raspberry-pi/install-pi-launcher.sh [--autostart]
#     [--tunnel-hostname mirror.example.com] [--tunnel-name NAME] [--tunnel-service-url URL]
# Default tunnel hostname: mirror.smart-mirror.tech (override with SMART_MIRROR_TUNNEL_HOSTNAME or --tunnel-hostname;
# set SMART_MIRROR_TUNNEL_HOSTNAME= empty to skip Cloudflare DNS setup).
# Env (optional): SMART_MIRROR_TUNNEL_HOSTNAME, SMART_MIRROR_TUNNEL_NAME, MIRROR_PORT (default 8002),
#   SMART_MIRROR_INSTALL_RETRIES, SMART_MIRROR_INSTALL_RETRY_DELAY,
#   SMART_MIRROR_TUNNEL_SETUP_RETRIES, SMART_MIRROR_TUNNEL_SETUP_RETRY_DELAY
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -n "${SMART_MIRROR_ROOT:-}" ]]; then
  ROOT_DIR="$(cd "${SMART_MIRROR_ROOT}" && pwd)"
else
  ROOT_DIR="${DEFAULT_ROOT}"
fi

START_SH="${ROOT_DIR}/scripts/start-mirror-app.sh"
TEMPLATE="${ROOT_DIR}/deploy/raspberry-pi/smart-mirror.desktop.template"

if [[ ! -f "${START_SH}" ]]; then
  echo "error: start script not found at ${START_SH}" >&2
  echo "Fix: export SMART_MIRROR_ROOT=/path/to/Smart-Mirror then re-run, or run from a full clone." >&2
  exit 1
fi
if [[ ! -f "${TEMPLATE}" ]]; then
  echo "error: desktop template missing at ${TEMPLATE}" >&2
  exit 1
fi

AUTOSTART=0
DEFAULT_TUNNEL_HOSTNAME="mirror.smart-mirror.tech"
# Unset → default hostname; explicitly empty SMART_MIRROR_TUNNEL_HOSTNAME= skips tunnel setup.
TUNNEL_HOSTNAME="${SMART_MIRROR_TUNNEL_HOSTNAME-${DEFAULT_TUNNEL_HOSTNAME}}"
TUNNEL_NAME="${SMART_MIRROR_TUNNEL_NAME:-smart-mirror-ui}"
: "${MIRROR_PORT:=8002}"
TUNNEL_SERVICE_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --autostart)
      AUTOSTART=1
      shift
      ;;
    --tunnel-hostname)
      if [[ -z "${2:-}" ]]; then
        echo "error: --tunnel-hostname requires a value" >&2
        exit 1
      fi
      TUNNEL_HOSTNAME="$2"
      shift 2
      ;;
    --tunnel-name)
      if [[ -z "${2:-}" ]]; then
        echo "error: --tunnel-name requires a value" >&2
        exit 1
      fi
      TUNNEL_NAME="$2"
      shift 2
      ;;
    --tunnel-service-url)
      if [[ -z "${2:-}" ]]; then
        echo "error: --tunnel-service-url requires a value" >&2
        exit 1
      fi
      TUNNEL_SERVICE_URL="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '1,20p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1' (try --help)" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${TUNNEL_SERVICE_URL}" ]]; then
  TUNNEL_SERVICE_URL="http://127.0.0.1:${MIRROR_PORT}"
fi

# Usage: retry_run MAX_ATTEMPTS DELAY_SECONDS command [args...]
retry_run() {
  local max="${1:?}"
  local delay="${2:?}"
  shift 2
  local attempt=1
  while [[ "${attempt}" -le "${max}" ]]; do
    if "$@"; then
      return 0
    fi
    if [[ "${attempt}" -ge "${max}" ]]; then
      echo "retry_run: command failed after ${max} attempt(s)." >&2
      return 1
    fi
    echo "retry_run: attempt ${attempt} failed; sleeping ${delay}s..." >&2
    sleep "${delay}"
    attempt=$((attempt + 1))
  done
}

INSTALL_RETRIES="${SMART_MIRROR_INSTALL_RETRIES:-5}"
INSTALL_RETRY_DELAY="${SMART_MIRROR_INSTALL_RETRY_DELAY:-10}"
SETUP_RETRIES="${SMART_MIRROR_TUNNEL_SETUP_RETRIES:-3}"
SETUP_RETRY_DELAY="${SMART_MIRROR_TUNNEL_SETUP_RETRY_DELAY:-15}"

ENSURE_PY="${ROOT_DIR}/scripts/ensure-mirror-python-env.sh"
if [[ -f "${ENSURE_PY}" ]]; then
  bash "${ENSURE_PY}" "${ROOT_DIR}"
else
  echo "warning: ${ENSURE_PY} missing — run pip install yourself." >&2
fi

INSTALL_CF="${ROOT_DIR}/scripts/install-cloudflared.sh"
if [[ -f "${INSTALL_CF}" ]]; then
  if ! retry_run "${INSTALL_RETRIES}" "${INSTALL_RETRY_DELAY}" bash "${INSTALL_CF}"; then
    echo "error: cloudflared install failed after retries." >&2
    exit 1
  fi
else
  echo "warning: ${INSTALL_CF} missing — install cloudflared yourself." >&2
fi

SETUP_CF="${ROOT_DIR}/scripts/setup-cloudflare-tunnel.sh"
if [[ -n "${TUNNEL_HOSTNAME}" ]]; then
  if [[ ! -f "${SETUP_CF}" ]]; then
    echo "error: ${SETUP_CF} missing; cannot configure tunnel." >&2
    exit 1
  fi
  if ! retry_run "${SETUP_RETRIES}" "${SETUP_RETRY_DELAY}" \
    bash "${SETUP_CF}" \
    --hostname "${TUNNEL_HOSTNAME}" \
    --tunnel-name "${TUNNEL_NAME}" \
    --service-url "${TUNNEL_SERVICE_URL}"; then
    echo "error: tunnel setup failed after retries (if cert.pem is missing, run cloudflared tunnel login once)." >&2
    exit 1
  fi
else
  echo "Tunnel DNS skipped (hostname empty). To provision: bash ${SETUP_CF} --hostname mirror.smart-mirror.tech --service-url ${TUNNEL_SERVICE_URL}"
fi

APP_FILE="${HOME}/.local/share/applications/smart-mirror.desktop"
AUTOSTART_FILE="${HOME}/.config/autostart/smart-mirror.desktop"

mkdir -p "${HOME}/.local/share/applications"
mkdir -p "${HOME}/Desktop"
mkdir -p "${HOME}/.config/autostart"

# Strip CR so .desktop parses on Linux (Windows CRLF breaks [Desktop Entry] validation)
sed "s|__SMART_MIRROR_ROOT__|${ROOT_DIR}|g" "${TEMPLATE}" | tr -d "\r" >"${APP_FILE}"
cp "${APP_FILE}" "${HOME}/Desktop/smart-mirror.desktop"
chmod +x "${ROOT_DIR}/scripts/start-mirror-app.sh" "${ROOT_DIR}/scripts/stop-mirror-app.sh"
[[ -f "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh" ]] &&
  chmod +x "${ROOT_DIR}/scripts/ensure-mirror-python-env.sh"
[[ -f "${ROOT_DIR}/scripts/install-cloudflared.sh" ]] &&
  chmod +x "${ROOT_DIR}/scripts/install-cloudflared.sh"
[[ -f "${ROOT_DIR}/scripts/setup-cloudflare-tunnel.sh" ]] &&
  chmod +x "${ROOT_DIR}/scripts/setup-cloudflare-tunnel.sh"
[[ -f "${ROOT_DIR}/scripts/run-cloudflare-quick-tunnel.sh" ]] &&
  chmod +x "${ROOT_DIR}/scripts/run-cloudflare-quick-tunnel.sh"
chmod +x "${APP_FILE}" "${HOME}/Desktop/smart-mirror.desktop"

if [[ "${AUTOSTART}" -eq 1 ]]; then
  cp "${APP_FILE}" "${AUTOSTART_FILE}"
  chmod +x "${AUTOSTART_FILE}"
  echo "Installed launcher and enabled autostart (repo: ${ROOT_DIR})."
else
  echo "Installed launcher to app menu and Desktop (repo: ${ROOT_DIR})."
  echo "Run again with --autostart to launch Smart Mirror on login."
fi
