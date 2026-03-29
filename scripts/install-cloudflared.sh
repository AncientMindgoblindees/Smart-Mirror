#!/usr/bin/env bash
set -euo pipefail

# Installs cloudflared on Debian/Ubuntu/Raspberry Pi OS.
# Usage:
#   bash scripts/install-cloudflared.sh

SUDO=""
if [[ "${EUID}" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "error: sudo is required when not running as root." >&2
    exit 1
  fi
  SUDO="sudo"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Installing curl..."
  ${SUDO} apt-get update
  ${SUDO} apt-get install -y curl
fi

if [[ ! -r /etc/os-release ]]; then
  echo "error: unsupported Linux distribution (missing /etc/os-release)." >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
CODENAME="${VERSION_CODENAME:-}"
if [[ -z "${CODENAME}" ]]; then
  echo "error: could not determine distro codename (VERSION_CODENAME)." >&2
  exit 1
fi

echo "Adding Cloudflare package repository for '${CODENAME}'..."
${SUDO} mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | ${SUDO} tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared ${CODENAME} main" | ${SUDO} tee /etc/apt/sources.list.d/cloudflared.list >/dev/null

echo "Installing cloudflared..."
${SUDO} apt-get update
${SUDO} apt-get install -y cloudflared

echo "cloudflared installed:"
cloudflared --version
