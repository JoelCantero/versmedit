#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="docker-compose.e2e.yml"
PROJECT="webapp-template-e2e-$$-$RANDOM"
export NEXT_DIST_DIR="$(mktemp -d .next-e2e-XXXXXX)"
PROVIDER_PID=""
TSCONFIG_BACKUP=""

cleanup() {
  if [[ -n "$PROVIDER_PID" ]] && kill -0 "$PROVIDER_PID" 2>/dev/null; then
    kill -TERM "$PROVIDER_PID" 2>/dev/null || true
    wait "$PROVIDER_PID" 2>/dev/null || true
  fi
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --volumes --remove-orphans
  rm -rf -- "$NEXT_DIST_DIR"
  if [[ -n "$TSCONFIG_BACKUP" && -f "$TSCONFIG_BACKUP" ]]; then
    cp -- "$TSCONFIG_BACKUP" tsconfig.json
    rm -f -- "$TSCONFIG_BACKUP"
  fi
}
trap cleanup EXIT

TSCONFIG_BACKUP="$(mktemp)"
cp -- tsconfig.json "$TSCONFIG_BACKUP"

free_port() {
  node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close()})'
}

export PROJECT_NAME="playwright"
export AUTH_SECRET="playwright-secret-not-used-in-runtime-000"
export TRUST_PROXY_HEADERS="false"
export E2E_PROVIDER_HTTP_PORT="$(free_port)"
export E2E_PROVIDER_HTTP_URL="http://127.0.0.1:${E2E_PROVIDER_HTTP_PORT}"
export E2E_MAIL_PROVIDER="${E2E_MAIL_PROVIDER:-brevo}"
export E2E_MAIL_API_KEY="e2e-provider-key"
export E2E_MAIL_API_SECRET="e2e-provider-secret"
export MAIL_ENABLED="true"
export MAIL_PROVIDER="$E2E_MAIL_PROVIDER"
export MAIL_API_KEY="$E2E_MAIL_API_KEY"
export MAIL_API_SECRET="$E2E_MAIL_API_SECRET"
export MAIL_FROM="no-reply@example.test"

if [[ "$E2E_MAIL_PROVIDER" != "brevo" && "$E2E_MAIL_PROVIDER" != "mailjet" ]]; then
  echo "E2E_MAIL_PROVIDER must be brevo or mailjet" >&2
  exit 1
fi

node --experimental-strip-types tests/e2e/helpers/provider-http-fixture.ts &
PROVIDER_PID=$!
node --input-type=module -e '
const url = `${process.env.E2E_PROVIDER_HTTP_URL}/control/health`;
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const response = await fetch(url);
    if (response.ok) process.exit(0);
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 50));
}
throw new Error(`Provider fixture did not become ready at ${url}`);
'

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --wait db
DB_PORT="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" port db 5432 | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://playwright:playwright@127.0.0.1:${DB_PORT}/playwright?schema=public"
export E2E_APP_PORT="$(node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close()})')"
export NEXTAUTH_URL="http://127.0.0.1:${E2E_APP_PORT}"
pnpm db:deploy
pnpm build
pnpm exec playwright test --project chromium --project chromium-320