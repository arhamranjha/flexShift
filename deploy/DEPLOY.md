# Deploying FlexShift to one server

A single small Linux server runs everything in Docker: Postgres, the API, the dashboard, the worker portal and Caddy
(automatic HTTPS). It was tested locally end to end (HTTPS, migrations, first admin, secure cookies, CORS).

## Before you start
- A server running Ubuntu 24.04 with a public IPv4, SSH key access, and ports 22/80/443 open.
- **No domain needed for testing:** `deploy/init-env.sh <server-ip>` uses free sslip.io names
  (`app.<ip-with-dashes>.sslip.io`, `work....`, `api....`). With a real domain later, add three A records
  (`app.`, `work.`, `api.`) at the server and run `deploy/init-env.sh --domain example.com` instead.
  The three names must share one parent domain (the session cookies are `SameSite=Lax`).

## One time
```bash
# 1. on the server (as root): Docker, firewall, fail2ban, automatic security updates, swap
scp deploy/bootstrap-server.sh root@SERVER:/root/ && ssh root@SERVER bash /root/bootstrap-server.sh

# 2. on your laptop: generate the environment file (strong random secrets). Keep a copy in your password manager.
deploy/init-env.sh SERVER_IP
```

## Deploy (and every later update)
```bash
deploy/push.sh root@SERVER
```
The first run also sends `deploy/.env`. Migrations run automatically when the API starts, and Caddy fetches the HTTPS
certificates on first start (give it a minute).

## Create the first administrator
Production has no demo accounts. Create your own super admin; it must change the password at first sign-in:
```bash
deploy/create-admin.sh root@SERVER you@example.com
```
Then sign in at `https://app.<domain>`. Do **not** run the demo seed on a real server.

## Onboard a customer
Until the dashboard has a "create organization" screen, run this in a normal Terminal window. It asks for the organization, its
first branch, the owner's email and (optionally) a branch manager, then prints one-time temporary passwords:
```bash
SSH_OPTS="-i ~/.ssh/flexshift -o IdentitiesOnly=yes" deploy/create-org.sh root@SERVER
```

## Upgrading
`deploy/push.sh` rebuilds and restarts; database migrations run when the API starts. **The markets release defaults every existing
organization to New Zealand (NZD, Pacific/Auckland)** and aligns existing invoices to their shift's currency. If a deployment already
holds UK organizations, a platform admin must set their market to United Kingdom (Organizations screen, or the API) right after
upgrading, otherwise they will require the NZ practising certificate. Run `deploy/backup.sh` on the server before upgrading.

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
