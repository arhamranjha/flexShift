# Handoff: start here

Written for the next engineer or agent picking this project up. Read this, then `CLAUDE.md` (how to work in the code),
`docs/DECISIONS.md` (why it is built this way) and `TODO.md` (everything open). Agent "memory" is private to whoever wrote it:
**everything that matters is in these files.**

_State as of 2026-10-03, branch `feature/platform-buildout` merged to `main`._

> A ready-to-paste first message for a new agent or Claude account is in [`docs/NEW_AGENT_PROMPT.md`](NEW_AGENT_PROMPT.md).

## What this is
FlexShift is a two-sided healthcare workforce platform for **New Zealand** (UK also supported). Pharmacies and similar organizations post
shifts and manage a staff bank, compliance, timesheets and invoicing; relief professionals find, book and get paid for shifts and keep 100% of
their rate. Product intent: `FlexShift_Master_Specification.md` and the other root `*.md` specs.

## What exists and works
Backend (NestJS + Prisma + Postgres), dashboard (`apps/web-admin`), worker portal (`apps/worker-portal`, mobile-first, installable), shared
client/UI packages. Complete shift lifecycle: post shift → staff-bank tier cascade / marketplace → apply, negotiate rate or instant book →
credential-gated booking → clock in/out → timesheet → approval → invoice → payment, plus leave with vacancy backfill, compliance desk with
document uploads and expiry alerts, notifications (in-app, optional email), accounting and payment CSV exports, markets (NZ default, GB),
super-admin Organizations screen. **93 backend tests pass**, ESLint is clean, and a real-Chrome walkthrough (34 steps) passes locally.

## Where it is running (the owner's test deployment)
| Thing | Value |
| :--- | :--- |
| Server | Hetzner Cloud, Helsinki, Ubuntu 26.04, `204.168.199.75` |
| Dashboard | https://app.204-168-199-75.sslip.io |
| Worker portal | https://work.204-168-199-75.sslip.io |
| API health | https://api.204-168-199-75.sslip.io/health |
| SSH | `ssh -i ~/.ssh/flexshift -o IdentitiesOnly=yes root@204.168.199.75` (the key is on the owner's Mac; never in the repo) |
| App location on server | `/opt/flexshift`, config in `/opt/flexshift/deploy/.env` (secrets; also in the owner's gitignored `deploy/.env` locally) |
| Real data | one super admin (`arhamranjha@gmail.com`), one customer organization "Kiwi Care Pharmacies" (NZ) with an org admin, one test worker. **Treat as real; do not wipe.** |

Production has **no demo accounts**. It is a testing deployment on a free `sslip.io` name (not for customers) and a Helsinki server (slow from NZ).
The owner plans to move to AWS (or an NZ/AU host) and buy a domain before going live.

### Operating it
On the server, `flexshift logs api`, `flexshift errors 24h`, `flexshift ps`, `flexshift backup` work from any directory (see `deploy/DEPLOY.md`).

```bash
# deploy the current working tree (rsync + docker compose up --build; migrations run on API start)
SSH_OPTS="-i ~/.ssh/flexshift -o IdentitiesOnly=yes" deploy/push.sh root@204.168.199.75
# first super admin / a new customer (run in a normal terminal: they prompt)
SSH_OPTS="-i ~/.ssh/flexshift -o IdentitiesOnly=yes" deploy/create-admin.sh root@204.168.199.75 you@example.com
SSH_OPTS="-i ~/.ssh/flexshift -o IdentitiesOnly=yes" deploy/create-org.sh   root@204.168.199.75
# on the server: backups run nightly at 03:15 (root crontab) to /var/backups/flexshift; run one before every upgrade
bash /opt/flexshift/deploy/backup.sh
```
Details, restore steps and the upgrade note (existing organizations default to NZ) are in `deploy/DEPLOY.md`. The Organizations screen
(super admin) replaces `create-org.sh` for everyday onboarding.

**Safety rules learned the hard way:** run `docker compose ... down` only with the right `-f`/project (prod is `flexshift-prod`, dev is
`flexshift`); take a backup before a release that has migrations; never run the seed on the server; never pipe a multi-line script into
`ssh bash -s` if it runs `docker compose exec` (it swallows the rest of the script: copy the file and run it).

## Local development
See README "Getting Started" and `CLAUDE.md` Commands. In short: `pnpm install`, `docker compose up -d`, copy `apps/backend-api/.env.example` to
`.env` (set `JWT_SECRET`), `prisma migrate deploy`, `pnpm seed`, then `pnpm dev:backend | dev:web | dev:portal`. Demo logins use the password
`FlexShiftPass2026!` (README table); the seeded organizations are **UK** on purpose (shows two markets side by side), new organizations are NZ.
`pnpm lint` (ESLint + tsc) and `pnpm test:backend` must pass before you commit. Needs Node 22.13+ and pnpm.

## How we work (keep doing this)
1. Plan, then build phase by phase; keep `TODO.md` honest (tick only what is verified).
2. After each phase, run an **independent reviewer agent** (read-only, adversarial) and fix what it finds before moving on.
3. Verify in a real browser where possible (`apps/e2e-ui`), and over HTTP against the live server (`live-api.mjs`) after a deploy. Remove any test data created on production afterwards (scope deletes narrowly, preview first).
4. Commit with a message that says *why*. Do not push or merge without the owner's say-so.
5. Respect the **naming mandate** (no legacy product name anywhere; reviews grep for it).

## What is pending (ranked)
Full list in `TODO.md`. The ones that need an owner decision or real-world input first:
1. **Self-registered worker verification path** (DECISIONS 2.6). Today a new worker is invisible to organizations until invited; decide on a platform verification queue or a share-with-organization request.
2. **Confirm NZ rules with a real pharmacy customer** and edit `common/markets.ts`: Pharmacy Council wording, police-vetting requirement, dispensing systems (only "Toniq" and "Corum" are placeholders), accreditations, GST treatment.
3. **NZ privacy review** before real worker documents are stored (Privacy Act 2020; offshore hosting duties under IPP 12).
4. **Go-live hosting**: AWS/NZ region, real domain, off-server backups, uptime monitor, SMTP provider, Terraform/secrets management.
5. Payment file: a real NZ bank-file format needs worker bank details (sensitive PII; not stored). Today: CSV payment batch + accounting CSV.
6. Smaller: HEIC uploads, per-currency reporting view, push notifications/offline (no service worker on purpose), CI for the browser walkthrough, Prettier, Worker Pro tier.

## Known limitations and sharp edges
- Hosting is Helsinki; expect ~250-300 ms from NZ.
- `isVerified` only reflects the four base documents; bookability is enforced separately in the eligibility gate (so NZ workers without a practising certificate can look "verified" but get refused at booking, with a clear message).
- The login throttle is 10 attempts/minute per IP (`AUTH_THROTTLE_LIMIT`); automated browser runs must raise it.
- On the owner's machine Chrome is blocked from the production address, so browser tests only run against local stacks there; `apps/e2e-ui/live-api.mjs` covers production at HTTP level (needs a throwaway organization; it prints how).
- Do not run two jest processes at once (shared `flexshift_test` database).

## Map of the repo
```
apps/backend-api   NestJS API, Prisma schema + migrations, seed, CLI commands (src/cli), e2e tests (test/)
apps/web-admin     Next.js dashboard (staff)         apps/worker-portal  Next.js worker app (mobile-first)
apps/e2e-ui        Playwright walkthroughs (system Chrome)
packages/api-client  typed client, domain types, money/markets/file helpers     packages/ui  shared React components
deploy/            production compose, Caddy, server bootstrap, push/backup/admin scripts, DEPLOY.md
docs/              HANDOFF.md (this), DECISIONS.md
*.md (root)        original product specs; FlexShift_Execution_Plan_and_Review_Loop.md holds the naming mandate
```
