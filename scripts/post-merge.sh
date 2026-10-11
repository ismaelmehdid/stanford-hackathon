#!/bin/bash
set -euo pipefail
# Setup has closed stdin. Allow pnpm to recreate module directories without
# asking for confirmation when the package-manager version/layout changes.
export CI=true
# Do not run an installer from the node_modules directory it may replace.
# Use the environment's stable pnpm executable instead of a local shadow copy.
PNPM_BIN="$(type -ap pnpm | while IFS= read -r candidate; do
  case "$candidate" in */node_modules/*) continue ;; esac
  printf '%s\n' "$candidate"
  break
done)"
if [ -z "$PNPM_BIN" ]; then
  echo "No stable pnpm executable found outside node_modules." >&2
  exit 1
fi
"$PNPM_BIN" install --frozen-lockfile
"$PNPM_BIN" run typecheck:libs
"$PNPM_BIN" --filter @workspace/db run push
