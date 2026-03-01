#!/usr/bin/env bash
# scripts/deploy-pi.sh
#
# Builds multi-arch Docker images for Raspberry Pi (arm64) and deploys
# to the Pi via SSH + Docker Compose.
#
# Usage:
#   ./scripts/deploy-pi.sh <pi-host>           # e.g. pi@raspberrypi.local
#   ./scripts/deploy-pi.sh <pi-host> --reset-db  # fresh DB (all data wiped!)
#
# Prerequisites:
#   - Docker buildx with arm64 support (docker buildx create --use)
#   - SSH access to the Pi (ideally passwordless via key)

set -euo pipefail

PI_HOST="${1:?Usage: $0 <user@pi-host> [--reset-db]}"
RESET_DB="false"
if [[ "${2:-}" == "--reset-db" ]]; then
  RESET_DB="true"
  echo "⚠️  --reset-db flag set: the database will be wiped on startup!"
fi

DEPLOY_DIR="/home/pi/registrator"
PLATFORM="linux/arm64"
IMAGE_BACKEND="registrator-backend"
IMAGE_FRONTEND="registrator-frontend"

echo "==> Building back-end image for $PLATFORM..."
docker buildx build \
  --platform "$PLATFORM" \
  --load \
  -t "$IMAGE_BACKEND" \
  ./backend

echo "==> Building front-end image for $PLATFORM..."
docker buildx build \
  --platform "$PLATFORM" \
  --load \
  -t "$IMAGE_FRONTEND" \
  ./frontend

echo "==> Saving images to tarballs..."
docker save "$IMAGE_BACKEND" | gzip > /tmp/backend.tar.gz
docker save "$IMAGE_FRONTEND" | gzip > /tmp/frontend.tar.gz

echo "==> Uploading images and config to $PI_HOST:$DEPLOY_DIR ..."
ssh "$PI_HOST" "mkdir -p $DEPLOY_DIR"
scp /tmp/backend.tar.gz /tmp/frontend.tar.gz "$PI_HOST:$DEPLOY_DIR/"
scp docker-compose.yml nginx.conf "$PI_HOST:$DEPLOY_DIR/"

echo "==> Deploying on Pi..."
ssh "$PI_HOST" bash << REMOTE
  set -e
  cd $DEPLOY_DIR

  echo "Loading Docker images..."
  docker load < backend.tar.gz
  docker load < frontend.tar.gz

  echo "Starting services (RESET_DB=$RESET_DB)..."
  RESET_DB=$RESET_DB docker compose up -d --remove-orphans

  echo "Cleaning up tarballs..."
  rm -f backend.tar.gz frontend.tar.gz

  echo "Status:"
  docker compose ps
REMOTE

echo ""
echo "✅  Deploy complete! App is at http://$(echo $PI_HOST | sed 's/.*@//')"
rm -f /tmp/backend.tar.gz /tmp/frontend.tar.gz
