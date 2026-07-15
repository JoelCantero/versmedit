#!/usr/bin/env bash
# Logical backup of the PostgreSQL `db` service (constitution Principle VI).
# Portable across hosts. Usage: COMPOSE_FILE=<file> ./scripts/db-backup.sh [output-dir]
set -euo pipefail

OUT_DIR="${1:-./backups}"
: "${COMPOSE_FILE:?Set COMPOSE_FILE to docker-compose.yml or docker-compose.prod.yml}"

# Load PROJECT_NAME from .env only when the caller did not provide it.
if [ -z "${PROJECT_NAME:-}" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# POSTGRES_USER and POSTGRES_DB derive from PROJECT_NAME (as in the compose files).
: "${PROJECT_NAME:?PROJECT_NAME is required}"
POSTGRES_USER="$PROJECT_NAME"
POSTGRES_DB="$PROJECT_NAME"

mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/${POSTGRES_DB}-${TS}.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip >"$FILE"

echo "Backup written to $FILE"
