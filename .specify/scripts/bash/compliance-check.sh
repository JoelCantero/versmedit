#!/usr/bin/env bash
# after_implement hook: verify that implemented work still matches the required
# SpecKit governance artifacts before a pull request is opened.

set -euo pipefail

SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

if [[ "${1:-}" == "--all" ]]; then
    specs_dir="$(get_repo_root)/specs"
    if [[ ! -d "$specs_dir" ]]; then
        echo "[compliance-check] Template has no feature specs; nothing to validate." >&2
        exit 0
    fi

    failures=0
    while IFS= read -r -d '' feature_dir; do
        if ! SPECIFY_FEATURE_DIRECTORY="$feature_dir" "$0"; then
            failures=$((failures + 1))
        fi
    done < <(find "$specs_dir" -mindepth 1 -maxdepth 1 -type d -print0)

    if (( failures > 0 )); then
        echo "[compliance-check] $failures feature(s) failed compliance." >&2
        exit 1
    fi

    echo "[compliance-check] All feature specs comply with project governance." >&2
    exit 0
fi

eval "$(get_feature_paths --no-persist)"

required_files=("$FEATURE_SPEC" "$IMPL_PLAN" "$TASKS")
for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "[compliance-check] Missing required artifact: $file" >&2
        exit 1
    fi
done

required_sections=(
    "$FEATURE_SPEC|## Non-Goals"
    "$FEATURE_SPEC|## Security & Privacy Implications"
    "$FEATURE_SPEC|## Threats & Abuse Cases"
    "$IMPL_PLAN|## Constitution Check"
    "$IMPL_PLAN|**Migration Strategy**"
    "$IMPL_PLAN|**Recovery Strategy**"
)

section_has_content() {
    local file="$1"
    local section="$2"

    awk -v section="$section" '
        $0 == section { found = 1; next }
        found && /^## / { exit }
        found && /<!--/ { in_comment = 1; next }
        found && /-->/ { in_comment = 0; next }
        found && !in_comment && $0 ~ /[^[:space:]]/ { has_content = 1 }
        END { exit !(found && has_content) }
    ' "$file"
}

for requirement in "${required_sections[@]}"; do
    file="${requirement%%|*}"
    section="${requirement#*|}"
    if ! grep -Fq -- "$section" "$file"; then
        echo "[compliance-check] Missing required section in $file: $section" >&2
        exit 1
    fi
    if [[ "$section" == "## "* ]] && ! section_has_content "$file" "$section"; then
        echo "[compliance-check] Required section has no substantive content in $file: $section" >&2
        exit 1
    fi
done

placeholder_pattern='NEEDS CLARIFICATION|\[(FEATURE( NAME)?|DATE|YYYYMMDD-HHMMSS-feature-name|Brief Title)\]|:[[:space:]]*\[[^]]+\][[:space:]]*$'
if grep -En "$placeholder_pattern" "${required_files[@]}"; then
    echo "[compliance-check] Resolve all template placeholders before completion." >&2
    exit 1
fi

if grep -En '^[[:space:]]*- \[ \]' "$TASKS"; then
    echo "[compliance-check] All tasks must be completed before implementation finishes." >&2
    exit 1
fi

echo "[compliance-check] Spec, plan and tasks comply with project governance." >&2