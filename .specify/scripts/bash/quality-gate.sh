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

echo "[quality-gate] Running lint, typecheck and coverage before PR ..." >&2

pnpm lint
pnpm typecheck
pnpm test:coverage

echo "[quality-gate] All checks passed. Branch is ready for a pull request." >&2
