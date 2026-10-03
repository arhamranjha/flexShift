#!/usr/bin/env bash
# Creates deploy/.env for a server that has no domain yet, using free sslip.io names:
#   deploy/init-env.sh 203.0.113.7     ->  app.203-0-113-7.sslip.io, work.203-0-113-7.sslip.io, api.203-0-113-7.sslip.io
# With a real domain instead:  deploy/init-env.sh --domain flexshift.co.nz
# Generates strong random secrets. The file is gitignored; keep a copy in your password manager.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/.env"
[ ! -e "$OUT" ] || { echo "$OUT already exists; delete it first if you really want new secrets (that would invalidate sessions and not match the existing database password)"; exit 1; }

if [ "${1:-}" = "--domain" ]; then
  DOMAIN="${2:?usage: init-env.sh --domain example.com}"
else
  IP="${1:?usage: init-env.sh <server-ip>   or   init-env.sh --domain <domain>}"
  [[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "'$IP' is not an IPv4 address"; exit 1; }
  DOMAIN="${IP//./-}.sslip.io"
fi

{
  grep -v -E '^(DOMAIN|POSTGRES_PASSWORD|JWT_SECRET)=' "$HERE/.env.production.example"
  echo
  echo "DOMAIN=$DOMAIN"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
  echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
} > "$OUT"
chmod 600 "$OUT"

echo "Created $OUT"
echo "  Dashboard:      https://app.$DOMAIN"
echo "  Worker portal:  https://work.$DOMAIN"
echo "  API health:     https://api.$DOMAIN/health"
