#!/usr/bin/env bash
set -euo pipefail

# Quick ephemeral tunnel (no DNS) for testing.
# Usage:
#   MIRROR_PORT=8000 bash scripts/run-cloudflare-quick-tunnel.sh

PORT="${MIRROR_PORT:-8002}"
URL="http://127.0.0.1:${PORT}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "error: cloudflared not found. Run scripts/install-cloudflared.sh first." >&2
  exit 1
fi

echo "Starting temporary Cloudflare tunnel to ${URL} ..."
echo "Use the printed https://*.trycloudflare.com URL and append /ui/"
exec cloudflared tunnel --url "${URL}"
