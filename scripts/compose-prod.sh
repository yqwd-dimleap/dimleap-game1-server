#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$server_dir"

if [[ -d "/Applications/Docker.app/Contents/Resources/bin" ]]; then
  export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

exec docker compose --env-file .env -f deploy/compose.prod.yaml "$@"
