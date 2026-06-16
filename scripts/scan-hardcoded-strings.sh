#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required" >&2
  exit 1
fi

rg -n '[一-龥]' \
  "$ROOT/client/src" \
  "$ROOT/server/PkManager.Server" \
  --glob '!**/bin/**' \
  --glob '!**/obj/**' \
  --glob '!**/public/**' \
  --glob '!**/i18n/locales/**' \
  --glob '!**/*.min.js' \
  | rg -v '^\s*(//|///|\*|/\*)'
