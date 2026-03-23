#!/usr/bin/env bash
# Create repo .venv (if needed) and install backend/requirements.txt.
# Used by deploy/raspberry-pi/install-pi-launcher.sh and start-mirror-app.sh.
set -euo pipefail

ROOT_DIR="$(cd "${1:?usage: ensure-mirror-python-env.sh <REPO_ROOT>}" && pwd)"
REQ="${ROOT_DIR}/backend/requirements.txt"
VENV="${ROOT_DIR}/.venv"

if [[ ! -f "${REQ}" ]]; then
  echo "error: requirements not found at ${REQ}" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found. Install with: sudo apt install -y python3 python3-pip" >&2
  exit 1
fi

if [[ ! -x "${VENV}/bin/python" ]]; then
  echo "Smart Mirror: creating venv at ${VENV}"
  if ! python3 -m venv "${VENV}"; then
    echo "error: python3 -m venv failed. On Raspberry Pi OS install venv support:" >&2
    echo "  sudo apt install -y python3-venv python3-pip" >&2
    exit 1
  fi
fi

if [[ "${SKIP_MIRROR_PIP_INSTALL:-}" == "1" ]]; then
  echo "Smart Mirror: SKIP_MIRROR_PIP_INSTALL=1 — skipping pip install."
  exit 0
fi

echo "Smart Mirror: installing / updating Python dependencies..."
"${VENV}/bin/pip" install --upgrade pip
"${VENV}/bin/pip" install -r "${REQ}"
echo "Smart Mirror: Python environment ready (${VENV})."
