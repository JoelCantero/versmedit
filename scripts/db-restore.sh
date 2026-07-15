#!/usr/bin/env bash
# Restore a logical backup into the PostgreSQL `db` service (constitution Principle VI).
# Usage: COMPOSE_FILE=<file> ./scripts/db-restore.sh <backup-file.sql.gz>
set -euo pipefail

FILE="${1:?Usage: COMPOSE_FILE=<file> db-restore.sh <backup-file.sql.gz>}"
: "${COMPOSE_FILE:?Set COMPOSE_FILE to docker-compose.yml or docker-compose.prod.yml}"

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

if [ ! -f "$FILE" ]; then
  echo "Backup file not found: $FILE" >&2
  exit 1
fi

# A custom-format schema dump inventories every object PostgreSQL would restore,
# including schemas, relations, functions, types, collations, extensions, and
# text-search objects. A fresh database has no non-comment archive entries.
OBJECT_INVENTORY="$(
  docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump --format=custom --schema-only --no-owner --no-privileges \
      -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    | docker compose -f "$COMPOSE_FILE" exec -T db pg_restore --list \
    | sed '/^;/d; /^[[:space:]]*$/d'
)"

if [ -n "$OBJECT_INVENTORY" ]; then
  echo "Restore refused: database '$POSTGRES_DB' contains user-defined objects." >&2
  echo "Create a fresh database or volume, then retry the restore." >&2
  exit 1
fi

gunzip -c "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
  psql --set ON_ERROR_STOP=1 --single-transaction \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore complete from $FILE"
