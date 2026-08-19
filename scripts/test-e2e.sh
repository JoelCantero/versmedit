#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="docker-compose.e2e.yml"
PROJECT="webapp-template-e2e-$$-$RANDOM"
export NEXT_DIST_DIR="$(mktemp -d .next-e2e-XXXXXX)"
SMTP_PID=""

cleanup() {
  if [[ -n "$SMTP_PID" ]] && kill -0 "$SMTP_PID" 2>/dev/null; then
    kill -TERM "$SMTP_PID" 2>/dev/null || true
    wait "$SMTP_PID" 2>/dev/null || true
  fi
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --volumes --remove-orphans
  rm -rf -- "$NEXT_DIST_DIR"
}
trap cleanup EXIT

free_port() {
  node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close()})'
}

export PROJECT_NAME="playwright"
export AUTH_SECRET="playwright-secret-not-used-in-runtime-000"
export TRUST_PROXY_HEADERS="false"
export E2E_SMTP_PORT="$(free_port)"
export E2E_SMTP_HTTP_PORT="$(free_port)"
export E2E_SMTP_HTTP_URL="http://127.0.0.1:${E2E_SMTP_HTTP_PORT}"

node --experimental-strip-types tests/e2e/helpers/smtp-fixture-server.ts &
SMTP_PID=$!
node --input-type=module -e '
const url = `${process.env.E2E_SMTP_HTTP_URL}/health`;
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const response = await fetch(url);
    if (response.ok) process.exit(0);
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 50));
}
throw new Error(`SMTP fixture did not become ready at ${url}`);
'

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --wait db
DB_PORT="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" port db 5432 | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://playwright:playwright@127.0.0.1:${DB_PORT}/playwright?schema=public"
export E2E_APP_PORT="$(node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close()})')"
export NEXTAUTH_URL="http://127.0.0.1:${E2E_APP_PORT}"
pnpm db:deploy
pnpm build
pnpm exec playwright test --project chromium --project chromium-320