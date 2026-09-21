#!/usr/bin/env bash
# Open the design workbench (docs/mockups/index.html) in the default browser.
#
#   npm run design        # or: bash scripts/design.sh
#
# The gallery is static HTML — no dev server needed.
set -euo pipefail
cd "$(dirname "$0")/.."

file="docs/mockups/index.html"

if command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$file"
elif command -v open >/dev/null 2>&1; then
  exec open "$file"
else
  echo "No opener found (xdg-open/open). Open $PWD/$file manually." >&2
  exit 1
fi
