#!/usr/bin/env bash
# prepare-feature-branch.sh
#
# before_specify hook: start every feature from a fresh branch cut from an
# up-to-date base branch (default: origin/main).
#
#   1. Abort if the working tree has uncommitted changes to tracked files
#      (staged or unstaged). Untracked files are allowed and carry over.
#   2. Fetch the remote and create the branch from <remote>/<base>.
#   3. Reuse create-new-feature.sh naming (honours feature_numbering in
#      .specify/init-options.json) unless an explicit branch name is given.
#
# Output: JSON {"BRANCH_NAME":..,"FEATURE_NUM":..,"BASE":..} on stdout
#         (with --json); human-readable progress goes to stderr.
#
# Overrides via env: SPECIFY_REMOTE (default "origin"),
#                    SPECIFY_BASE_BRANCH (default "main"),
#                    GIT_BRANCH_NAME (exact branch name to use).

set -euo pipefail

JSON_MODE=false
GIT_BRANCH_NAME="${GIT_BRANCH_NAME:-}"
BASE_BRANCH="${SPECIFY_BASE_BRANCH:-main}"
REMOTE="${SPECIFY_REMOTE:-origin}"
ARGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --json)
            JSON_MODE=true
            ;;
        --branch-name)
            shift
            [ $# -gt 0 ] || { echo "Error: --branch-name requires a value" >&2; exit 1; }
            GIT_BRANCH_NAME="$1"
            ;;
        --base)
            shift
            [ $# -gt 0 ] || { echo "Error: --base requires a value" >&2; exit 1; }
            BASE_BRANCH="$1"
            ;;
        --remote)
            shift
            [ $# -gt 0 ] || { echo "Error: --remote requires a value" >&2; exit 1; }
            REMOTE="$1"
            ;;
        --help|-h)
            echo "Usage: $0 [--json] [--branch-name <name>] [--base <branch>] [--remote <name>] <feature description>"
            echo ""
            echo "Creates a fresh feature branch from <remote>/<base> (default origin/main)."
            echo "Aborts if the working tree has uncommitted changes to tracked files."
            exit 0
            ;;
        *)
            ARGS+=("$1")
            ;;
    esac
    shift
done

SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

REPO_ROOT="$(get_repo_root)" || { echo "Error: could not determine repository root" >&2; exit 1; }
cd "$REPO_ROOT"

# Must be inside a git work tree.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Error: not inside a git repository; cannot create a feature branch." >&2
    exit 1
fi

# 1) Abort on uncommitted tracked changes (staged or unstaged). Untracked files
#    are allowed since they carry over cleanly to the new branch.
if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
    echo "Error: You have uncommitted changes. Commit or stash them before starting a new feature." >&2
    echo "" >&2
    git status --short --untracked-files=no >&2 || true
    exit 1
fi

# 2) Fetch the latest base from the remote.
echo "[prepare-branch] Fetching ${REMOTE}/${BASE_BRANCH} ..." >&2
if ! git fetch --quiet "$REMOTE" "$BASE_BRANCH" 2>/dev/null; then
    if ! git fetch --quiet "$REMOTE" 2>/dev/null; then
        echo "Error: could not fetch from remote '$REMOTE'. Is the remote configured?" >&2
        exit 1
    fi
fi

# 3) Verify the base ref exists on the remote.
BASE_REF="refs/remotes/${REMOTE}/${BASE_BRANCH}"
if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
    echo "Error: ${REMOTE}/${BASE_BRANCH} not found after fetch. Cannot branch from it." >&2
    exit 1
fi

# 4) Determine the branch name.
FEATURE_NUM=""
if [ -n "$GIT_BRANCH_NAME" ]; then
    BRANCH_NAME="$GIT_BRANCH_NAME"
else
    DESCRIPTION="${ARGS[*]:-}"
    DESCRIPTION="$(printf '%s' "$DESCRIPTION" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    if [ -z "$DESCRIPTION" ]; then
        echo "Error: a feature description is required (or pass --branch-name)." >&2
        exit 1
    fi

    # Honour feature_numbering from init-options.json (sequential | timestamp).
    USE_TIMESTAMP=false
    INIT_OPTS="$REPO_ROOT/.specify/init-options.json"
    if [ -f "$INIT_OPTS" ]; then
        numbering="$(grep -o '"feature_numbering"[[:space:]]*:[[:space:]]*"[^"]*"' "$INIT_OPTS" 2>/dev/null | sed -E 's/.*"([^"]*)"$/\1/' || true)"
        [ "$numbering" = "timestamp" ] && USE_TIMESTAMP=true
    fi

    # Reuse the canonical name generator without creating any files (--dry-run).
    if [ "$USE_TIMESTAMP" = true ]; then
        DRY_OUT="$("$SCRIPT_DIR/create-new-feature.sh" --dry-run --timestamp "$DESCRIPTION")"
    else
        DRY_OUT="$("$SCRIPT_DIR/create-new-feature.sh" --dry-run "$DESCRIPTION")"
    fi
    BRANCH_NAME="$(printf '%s\n' "$DRY_OUT" | awk -F': ' '/^BRANCH_NAME: /{print $2; exit}')"
    FEATURE_NUM="$(printf '%s\n' "$DRY_OUT" | awk -F': ' '/^FEATURE_NUM: /{print $2; exit}')"
fi

if [ -z "$BRANCH_NAME" ]; then
    echo "Error: could not determine a branch name." >&2
    exit 1
fi

# 5) Refuse to clobber an existing local branch.
if git rev-parse --verify --quiet "refs/heads/${BRANCH_NAME}" >/dev/null; then
    echo "Error: branch '$BRANCH_NAME' already exists. Aborting to avoid clobbering it." >&2
    exit 1
fi

# 6) Create and switch to the new branch from the updated base.
#    --no-track keeps the feature branch from tracking the base ref.
echo "[prepare-branch] Creating '$BRANCH_NAME' from ${REMOTE}/${BASE_BRANCH} ..." >&2
if ! git switch --no-track -c "$BRANCH_NAME" "$BASE_REF" 2>/dev/null; then
    git checkout --no-track -b "$BRANCH_NAME" "$BASE_REF"
fi

# 7) Report the result.
if [ "$JSON_MODE" = true ]; then
    printf '{"BRANCH_NAME":"%s","FEATURE_NUM":"%s","BASE":"%s"}\n' \
        "$BRANCH_NAME" "$FEATURE_NUM" "${REMOTE}/${BASE_BRANCH}"
else
    echo "BRANCH_NAME: $BRANCH_NAME"
    echo "FEATURE_NUM: $FEATURE_NUM"
    echo "BASE: ${REMOTE}/${BASE_BRANCH}"
fi
echo "[prepare-branch] Done. Now on branch '$BRANCH_NAME'." >&2
