#!/usr/bin/env bash
# Percent-encode one UTF-8 value read from stdin for use in a URL component.
set -euo pipefail

IFS= read -r value || true
encoded=""
LC_ALL=C

for ((index = 0; index < ${#value}; index++)); do
  char="${value:index:1}"
  case "$char" in
    [a-zA-Z0-9.~_-]) encoded+="$char" ;;
    *)
      hex="$(printf '%s' "$char" | od -An -tx1 | tr -d ' \n' | tr '[:lower:]' '[:upper:]')"
      encoded+="%$hex"
      ;;
  esac
done

printf '%s' "$encoded"