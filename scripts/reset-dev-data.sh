#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$server_dir"

if [[ "${1:-}" != "--yes" ]]; then
  echo "This permanently deletes the local runestone database." >&2
  echo "Run: npm run reset:dev:yes" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "Stopping API..."
./scripts/compose-dev.sh stop api >/dev/null

echo "Dropping and recreating ${MYSQL_DATABASE}..."
./scripts/compose-dev.sh exec -T mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" -e \
  "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`; CREATE DATABASE \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

echo "Clearing Redis cache..."
./scripts/compose-dev.sh exec -T redis redis-cli FLUSHDB >/dev/null

echo "Rebuilding and starting API with migrations..."
./scripts/compose-dev.sh up -d --build api >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health/ready >/dev/null; then
    echo "Local database reset completed. The random 6-8 digit public ID pool was reseeded."
    exit 0
  fi
  sleep 1
done

echo "API did not become healthy after reset." >&2
./scripts/compose-dev.sh logs --tail=80 api >&2
exit 1
