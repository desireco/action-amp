#!/usr/bin/env bash
# Run the e2e suite with the right env paired to the API's database.
#
# Assumes both servers are already running (per web/playwright.config.ts —
# Playwright bug #11907 means the config polls instead of owning servers):
#   API:  cd api && bun run dev        (reads api/.env; NODE_ENV=development
#                                      for the dev-login route)
#   Web:  cd web && bun run dev        (:5174)
#
# Env resolution: DATABASE_URL + STRIPE_WEBHOOK_SECRET come from api/.env and
# webapp/.env.server so the specs' signed payloads and seeded fixtures always
# match what the running API uses.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f api/.env ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' api/.env | cut -d= -f2-)
fi
DATABASE_URL="${DATABASE_URL:-postgresql://jake@localhost:5432/actionamp_dev}"
if [ -f webapp/.env.server ]; then
  STRIPE_WEBHOOK_SECRET=$(grep -E '^STRIPE_WEBHOOK_SECRET=' webapp/.env.server | cut -d= -f2-)
fi

export DATABASE_URL STRIPE_WEBHOOK_SECRET
cd web
exec bunx playwright test --workers=1 "$@"
