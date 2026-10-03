#!/usr/bin/env bash
# Deploy from your laptop:  deploy/push.sh root@<server-ip>
# Copies the repository to the server (no git remote needed) and rebuilds/restarts the stack.
set -euo pipefail
TARGET="${1:?usage: deploy/push.sh user@server}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

rsync -az --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude .git --exclude uploads \
  --exclude 'deploy/.env' --exclude '*.mp4' --exclude .idea --exclude coverage \
  "$ROOT/" "$TARGET:/opt/flexshift/"

# First deploy only: send the generated environment file (never overwrites the one already on the server,
# because changing the database password or JWT secret would break the running system).
if [ -f "$ROOT/deploy/.env" ] && ! ssh "$TARGET" test -f /opt/flexshift/deploy/.env; then
  ssh "$TARGET" 'mkdir -p /opt/flexshift/deploy'
  scp -q "$ROOT/deploy/.env" "$TARGET:/opt/flexshift/deploy/.env"
  ssh "$TARGET" chmod 600 /opt/flexshift/deploy/.env
  echo "Sent deploy/.env to the server"
fi

ssh "$TARGET" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/flexshift
[ -f deploy/.env ] || { echo "deploy/.env is missing: run deploy/init-env.sh <server-ip> on your laptop first"; exit 1; }
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps
REMOTE
