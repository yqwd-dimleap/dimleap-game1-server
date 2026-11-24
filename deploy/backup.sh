#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$server_dir"

if [[ ! -f .env ]]; then
  echo "Missing .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -d "/Applications/Docker.app/Contents/Resources/bin" ]]; then
  export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

mkdir -p backups
stamp="$(date '+%Y%m%d-%H%M%S')"
target="backups/runestone-${stamp}.sql.gz"

docker compose --env-file .env -f deploy/compose.prod.yaml exec -T mysql \
  mysqldump --single-transaction --routines --events \
  -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" | gzip > "$target"

find backups -type f -name 'runestone-*.sql.gz' -mtime +7 -delete
echo "Backup written to $target"
