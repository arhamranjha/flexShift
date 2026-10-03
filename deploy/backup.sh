#!/usr/bin/env bash
# Nightly backup of the database and uploaded documents. Run on the server (see DEPLOY.md for the cron line).
set -euo pipefail
cd /opt/flexshift
DEST=/var/backups/flexshift
STAMP=$(date +%Y%m%d-%H%M%S)
COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"
mkdir -p "$DEST"

$COMPOSE exec -T postgres pg_dump -U flexshift -d flexshift --no-owner | gzip > "$DEST/db-$STAMP.sql.gz"
# Documents volume (skip quietly when S3 storage is used and the volume is empty)
docker run --rm -v flexshift_uploads:/data:ro -v "$DEST":/backup alpine tar czf "/backup/uploads-$STAMP.tar.gz" -C /data . 2>/dev/null || true

# Keep two weeks locally
find "$DEST" -type f -mtime +14 -delete

# Optional off-site copy: set RCLONE_REMOTE (e.g. r2:flexshift-backups) after configuring rclone on the server
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$DEST" "$RCLONE_REMOTE" --max-age 2d
fi
echo "Backup written to $DEST ($STAMP)"
