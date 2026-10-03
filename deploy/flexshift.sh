#!/usr/bin/env bash
# Everyday server commands that work from any directory. Installed as `flexshift` by deploy/push.sh.
#   flexshift logs [service]      follow logs (api, caddy, web-admin, worker-portal, postgres; none = all)
#   flexshift errors [since]      API requests that failed (4xx/5xx), default last 1h:  flexshift errors 24h
#   flexshift ps                  containers and their health
#   flexshift health              ask the API whether it and the database are up
#   flexshift backup              back up the database and uploaded documents now
#   flexshift restart [service]   restart one service or all (data is kept)
set -euo pipefail
cd /opt/flexshift
C="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"
cmd="${1:-help}"; shift || true
case "$cmd" in
  logs)    exec $C logs -f --tail 100 "$@" ;;
  errors)  $C logs --since "${1:-1h}" api | grep -E '"status":(4|5)[0-9][0-9]' || echo "no failed requests in that period" ;;
  ps)      exec $C ps ;;
  health)  DOMAIN=$(grep -E '^DOMAIN=' deploy/.env | cut -d= -f2-); curl -fsS "https://api.${DOMAIN}/health"; echo ;;
  backup)  exec bash deploy/backup.sh ;;
  restart) exec $C restart "$@" ;;
  *)       sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
