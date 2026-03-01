#!/usr/bin/env bash
# scripts/reset-db.sh
#
# Restarts the backend container with RESET_DB=true, which drops and recreates
# all database tables. ALL DATA IS LOST.
#
# For local Docker Compose:
#   ./scripts/reset-db.sh
#
# For remote Raspberry Pi:
#   ./scripts/reset-db.sh pi@raspberrypi.local

set -euo pipefail

run_reset() {
  echo "⚠️  Stopping backend..."
  docker compose stop backend

  echo "⚠️  Restarting with RESET_DB=true (all data will be wiped)..."
  RESET_DB=true docker compose up -d backend

  echo "Waiting for backend to finish reset..."
  sleep 3

  echo "Restarting backend without RESET_DB flag..."
  docker compose stop backend
  RESET_DB=false docker compose up -d backend

  echo "✅  Database has been reset."
}

if [[ -n "${1:-}" ]]; then
  PI_HOST="$1"
  echo "Resetting database on $PI_HOST..."
  ssh "$PI_HOST" "cd /home/pi/registrator && $(declare -f run_reset); run_reset"
else
  echo "Resetting database locally..."
  run_reset
fi
