#!/usr/bin/env bash
set -euo pipefail

# Creates/updates a named Cloudflare Tunnel for Smart Mirror.
# Usage:
#   bash scripts/setup-cloudflare-tunnel.sh --hostname mirror.example.com
#
# Optional:
#   --tunnel-name smart-mirror-ui
#   --service-url http://127.0.0.1:8000
#   --install-service

TUNNEL_NAME="smart-mirror-ui"
SERVICE_URL="http://127.0.0.1:8000"
HOSTNAME=""
INSTALL_SERVICE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tunnel-name)
      TUNNEL_NAME="${2:-}"
      shift 2
      ;;
    --hostname)
      HOSTNAME="${2:-}"
      shift 2
      ;;
    --service-url)
      SERVICE_URL="${2:-}"
      shift 2
      ;;
    --install-service)
      INSTALL_SERVICE="1"
      shift
      ;;
    -h|--help)
      sed -n '1,30p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${HOSTNAME}" ]]; then
  echo "error: --hostname is required (example: --hostname mirror.example.com)." >&2
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "error: cloudflared not found." >&2
  echo "Run: bash scripts/install-cloudflared.sh" >&2
  exit 1
fi

if [[ ! -f "${HOME}/.cloudflared/cert.pem" ]]; then
  echo "No Cloudflare login certificate found. Starting login..."
  cloudflared tunnel login
fi

if ! cloudflared tunnel info "${TUNNEL_NAME}" >/dev/null 2>&1; then
  echo "Creating tunnel '${TUNNEL_NAME}'..."
  cloudflared tunnel create "${TUNNEL_NAME}"
else
  echo "Tunnel '${TUNNEL_NAME}' already exists."
fi

TUNNEL_ID="$(cloudflared tunnel list --output json | python3 -c 'import json,sys; name=sys.argv[1]; data=json.load(sys.stdin); hit=[x["id"] for x in data if x.get("name")==name]; print(hit[0] if hit else "")' "${TUNNEL_NAME}")"
if [[ -z "${TUNNEL_ID}" ]]; then
  echo "error: failed to resolve tunnel id for '${TUNNEL_NAME}'." >&2
  exit 1
fi

CONF_DIR="${HOME}/.cloudflared"
CONF_FILE="${CONF_DIR}/config.yml"
CRED_FILE="${CONF_DIR}/${TUNNEL_ID}.json"

if [[ ! -f "${CRED_FILE}" ]]; then
  echo "error: expected tunnel credentials not found at '${CRED_FILE}'." >&2
  exit 1
fi

mkdir -p "${CONF_DIR}"
cat >"${CONF_FILE}" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED_FILE}

ingress:
  - hostname: ${HOSTNAME}
    service: ${SERVICE_URL}
  - service: http_status:404
EOF

echo "Routing DNS '${HOSTNAME}' -> tunnel '${TUNNEL_NAME}'..."
cloudflared tunnel route dns "${TUNNEL_NAME}" "${HOSTNAME}"

if [[ "${INSTALL_SERVICE}" == "1" ]]; then
  echo "Installing cloudflared as system service..."
  sudo cloudflared service install
  sudo systemctl enable cloudflared
  sudo systemctl restart cloudflared
fi

echo
echo "Cloudflare tunnel is configured."
echo "Config: ${CONF_FILE}"
echo "Public UI URL: https://${HOSTNAME}/ui/"
if [[ "${INSTALL_SERVICE}" != "1" ]]; then
  echo "Run now with:"
  echo "  cloudflared tunnel run ${TUNNEL_NAME}"
fi
