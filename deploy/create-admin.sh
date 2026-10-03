#!/usr/bin/env bash
# Creates (or resets) the first super admin on the server:  deploy/create-admin.sh root@<server-ip> you@example.com
# The password is typed here, hidden, and sent over SSH on stdin: it never appears in a command line or shell history.
set -euo pipefail
TARGET="${1:?usage: deploy/create-admin.sh user@server admin-email}"
EMAIL="${2:?usage: deploy/create-admin.sh user@server admin-email}"
read -r -s -p "Password for $EMAIL (min 12 characters): " PASS; echo
read -r -s -p "Repeat password: " PASS2; echo
[ "$PASS" = "$PASS2" ] || { echo "Passwords do not match"; exit 1; }

printf '%s\n' "$PASS" | ssh "$TARGET" "ADMIN_EMAIL='$EMAIL' bash -s" <<'REMOTE'
set -euo pipefail
read -r ADMIN_PASSWORD
export ADMIN_PASSWORD
cd /opt/flexshift
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD -w /repo/apps/backend-api api node dist/cli/create-admin.js
REMOTE
