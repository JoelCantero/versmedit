#!/usr/bin/env bash
# quality-gate.sh
#
# after_implement hook: run the pre-PR quality gate before a pull request is
# opened (constitution Principles IX & XII). Runs lint -> typecheck -> coverage and
# aborts on the first failure so a red branch never reaches a PR.
#
# CI repeats the same checks and adds integration/E2E as the authoritative merge gate. This local hook
# provides fast feedback before a pull request is opened.

set -euo pipefail

SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

REPO_ROOT="$(get_repo_root)" || { echo "Error: could not determine repository root" >&2; exit 1; }
cd "$REPO_ROOT"

# Some unit modules validate configuration at import time. Mirror CI with
# non-secret defaults while preserving values explicitly supplied by callers.
export PROJECT_NAME="${PROJECT_NAME:-quality-gate}"
export DATABASE_URL="${DATABASE_URL:-postgresql://quality:quality@127.0.0.1:5432/quality?schema=public}"
export AUTH_SECRET="${AUTH_SECRET:-quality-gate-secret-not-used-in-runtime}"
export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3100}"

echo "[quality-gate] Running lint, typecheck and coverage before PR ..." >&2

pnpm lint
pnpm typecheck
pnpm test:coverage

echo "[quality-gate] All checks passed. Branch is ready for a pull request." >&2
