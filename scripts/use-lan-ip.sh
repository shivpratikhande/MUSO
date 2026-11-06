#!/usr/bin/env bash
# Points the dev setup at this Mac's current LAN IP so a phone on the same network can reach
# the API, storage (MinIO) and the checkout page. Run after switching Wi-Fi, then restart
# `pnpm dev:backend` and `pnpm dev:mobile`.
set -euo pipefail
cd "$(dirname "$0")/.."
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "$IP" ]; then echo "No LAN IP found (are you on Wi-Fi?)" >&2; exit 1; fi
sed -i '' -E "s#^S3_PUBLIC_ENDPOINT=.*#S3_PUBLIC_ENDPOINT=http://$IP:9000#; s#^PUBLIC_API_URL=.*#PUBLIC_API_URL=http://$IP:4000#" .env
sed -i '' -E "s#^EXPO_PUBLIC_API_URL=.*#EXPO_PUBLIC_API_URL=http://$IP:4000/v1#" apps/mobile/.env
echo "Using LAN IP $IP — now restart: pnpm dev:backend  and  pnpm dev:mobile"
