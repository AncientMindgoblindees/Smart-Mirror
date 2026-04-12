#!/usr/bin/env bash
set -euo pipefail

# Installs cloudflared on Debian/Ubuntu/Raspberry Pi OS.
# If cloudflared-linux-arm64.deb exists at the repo root (next to scripts/), installs via dpkg/apt.
# Otherwise uses Cloudflare apt repo (Debian testing codenames like trixie map to bookworm).
# Usage:
#   bash scripts/install-cloudflared.sh
# Optional: CLOUDFLARED_DEB=/path/to/package.deb

SUDO=""
if [[ "${EUID}" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "error: sudo is required when not running as root." >&2
    exit 1
  fi
  SUDO="sudo"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DEB="${REPO_ROOT}/cloudflared-linux-arm64.deb"
LOCAL_DEB="${CLOUDFLARED_DEB:-${DEFAULT_DEB}}"

if command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared already on PATH; skipping install."
  cloudflared --version
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Installing curl..."
  ${SUDO} apt-get update
  ${SUDO} apt-get install -y curl
fi

if [[ -f "${LOCAL_DEB}" ]]; then
  echo "Installing cloudflared from local package: ${LOCAL_DEB}"
  # Broken trixie line breaks apt update; remove it so dependency fix can run.
  if [[ -f /etc/apt/sources.list.d/cloudflared.list ]] && grep -qE 'pkg\.cloudflare\.com/cloudflared[[:space:]]+trixie' /etc/apt/sources.list.d/cloudflared.list 2>/dev/null; then
    echo "Removing stale Cloudflare apt source (no trixie suite); using local .deb instead."
    ${SUDO} rm -f /etc/apt/sources.list.d/cloudflared.list
  fi
  ${SUDO} dpkg -i "${LOCAL_DEB}" || true
  if ! command -v cloudflared >/dev/null 2>&1; then
    ${SUDO} apt-get install -f -y
  fi
  echo "cloudflared installed:"
  cloudflared --version
  exit 0
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

APT_CODENAME="${CODENAME}"
case "${CODENAME}" in
  trixie|sid|forky)
    APT_CODENAME="bookworm"
    echo "note: Cloudflare apt has no '${CODENAME}' suite; using '${APT_CODENAME}' for cloudflared repo."
    ;;
esac

echo "Adding Cloudflare package repository for '${APT_CODENAME}'..."
${SUDO} mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | ${SUDO} tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared ${APT_CODENAME} main" | ${SUDO} tee /etc/apt/sources.list.d/cloudflared.list >/dev/null

echo "Installing cloudflared..."
${SUDO} apt-get update
${SUDO} apt-get install -y cloudflared

echo "cloudflared installed:"
cloudflared --version
