#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${ROOT_DIR}/deploy/raspberry-pi/smart-mirror.desktop.template"
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
  echo "Installed launcher and enabled autostart."
else
  echo "Installed launcher to app menu and Desktop."
  echo "Run again with --autostart to launch Smart Mirror on login."
fi
