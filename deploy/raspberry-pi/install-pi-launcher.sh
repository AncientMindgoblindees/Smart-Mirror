#!/usr/bin/env bash
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

APP_FILE="${HOME}/.local/share/applications/smart-mirror.desktop"
AUTOSTART_FILE="${HOME}/.config/autostart/smart-mirror.desktop"

mkdir -p "${HOME}/.local/share/applications"
mkdir -p "${HOME}/Desktop"
mkdir -p "${HOME}/.config/autostart"

# Strip CR so .desktop parses on Linux (Windows CRLF breaks [Desktop Entry] validation)
sed "s|__SMART_MIRROR_ROOT__|${ROOT_DIR}|g" "${TEMPLATE}" | tr -d "\r" >"${APP_FILE}"
cp "${APP_FILE}" "${HOME}/Desktop/smart-mirror.desktop"
chmod +x "${ROOT_DIR}/scripts/start-mirror-app.sh" "${ROOT_DIR}/scripts/stop-mirror-app.sh"
chmod +x "${APP_FILE}" "${HOME}/Desktop/smart-mirror.desktop"

if [[ "${1:-}" == "--autostart" ]]; then
  cp "${APP_FILE}" "${AUTOSTART_FILE}"
  chmod +x "${AUTOSTART_FILE}"
  echo "Installed launcher and enabled autostart (repo: ${ROOT_DIR})."
else
  echo "Installed launcher to app menu and Desktop (repo: ${ROOT_DIR})."
  echo "Run again with --autostart to launch Smart Mirror on login."
fi
