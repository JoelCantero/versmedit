#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.e2e.yml"
PROJECT="webapp-template-e2e-$$-$RANDOM"
export NEXT_DIST_DIR="$(mktemp -d .next-e2e-XXXXXX)"

cleanup() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --volumes --remove-orphans
  rm -rf "$NEXT_DIST_DIR"
}
trap cleanup EXIT

export PROJECT_NAME="playwright"
export AUTH_SECRET="playwright-secret-not-used-in-runtime-000"
export TRUST_PROXY_HEADERS="false"

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --wait db
DB_PORT="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" port db 5432 | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://playwright:playwright@127.0.0.1:${DB_PORT}/playwright?schema=public"
export E2E_APP_PORT="$(node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close()})')"
export NEXTAUTH_URL="http://127.0.0.1:${E2E_APP_PORT}"
pnpm db:deploy
pnpm build
pnpm exec playwright test