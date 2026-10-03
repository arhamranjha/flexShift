# Deploying FlexShift to one server

A single small Linux server runs everything in Docker: Postgres, the API, the dashboard, the worker portal and Caddy
(automatic HTTPS). It was tested locally end to end (HTTPS, migrations, first admin, secure cookies, CORS).

## Before you start
- A server running Ubuntu 24.04 with a public IP, SSH key access, and ports 22/80/443 open.
- A domain with three **A records** pointing at the server: `app.<domain>`, `work.<domain>`, `api.<domain>`.
  The three must share one registrable domain (the session cookies are `SameSite=Lax`).

## One time
```bash
# 1. prepare the server (as root): Docker, firewall, fail2ban, automatic security updates, swap
scp deploy/bootstrap-server.sh root@SERVER:/root/ && ssh root@SERVER bash /root/bootstrap-server.sh

# 2. create the environment file on the server
ssh root@SERVER 'mkdir -p /opt/flexshift/deploy'
scp deploy/.env.production.example root@SERVER:/opt/flexshift/deploy/.env
ssh root@SERVER nano /opt/flexshift/deploy/.env     # set DOMAIN, POSTGRES_PASSWORD, JWT_SECRET (openssl rand -base64 36)
```

## Deploy (and every later update)
```bash
deploy/push.sh root@SERVER
```
Migrations run automatically when the API container starts.

## Create the first administrator
Production has no demo accounts. Create your own super admin (it must change the password at first sign-in):
```bash
ssh root@SERVER 'cd /opt/flexshift && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T \
  -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD="a long passphrase" -w /repo/apps/backend-api api node dist/cli/create-admin.js'
```
Then sign in at `https://app.<domain>`, add your organization and branches (as the super admin, via the API/Swagger-less
flows) and invite managers from Settings. Do **not** run the demo seed on a real server.

## Backups
```bash
ssh root@SERVER 'crontab -l 2>/dev/null; echo "15 3 * * * /opt/flexshift/deploy/backup.sh >> /var/log/flexshift-backup.log 2>&1"' | ssh root@SERVER crontab -
```
This writes a database dump and a documents archive to `/var/backups/flexshift` nightly and keeps two weeks. Also turn on
your provider's server snapshots, and copy backups off the server (set `RCLONE_REMOTE` after configuring rclone).

Restore a database dump: `gunzip -c db-<stamp>.sql.gz | docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T postgres psql -U flexshift -d flexshift`

## Checks
- `curl https://api.<domain>/health` → `{"status":"ok"}` (point an uptime monitor at it)
- `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs -f api` (JSON access log lines include a request id)

## Local rehearsal
`DOMAIN=flexshift.localhost HTTPS_PORT=8443 HTTP_PORT=8080 CADDYFILE=./Caddyfile.local` in `deploy/.env` runs the same stack on
your machine with local certificates.
