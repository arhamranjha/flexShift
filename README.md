# FlexShift Platform

> Enterprise Healthcare Workforce Management & Relief Professional Fulfillment Platform

FlexShift is a clean-room, two-sided workforce management SaaS and flexible shift fulfillment platform designed for healthcare organizations (community pharmacies, optical clinics, care practices) and qualified relief professionals.

---

## 1. Core Value Proposition & Business Model

* **For Healthcare Organizations:** End-to-end multi-branch rota scheduling (up to 9 months ahead), automated gap identification, staff bank management, live compliance tracking, leave management, and direct digital booking.
* **For Relief Healthcare Professionals:** Zero commission fees (workers keep 100% of their advertised shift rate), fast shift discovery, rate negotiation tools, instant booking, and automated digital invoicing.
* **Tiered Shift Cascade:** Broadcast open shifts to internal Staff Banks first (Tier 1 Preferred $\to$ Tier 2 Regular), before publishing to the broader marketplace, cutting high agency placement fees.

---

## 2. Monorepo Structure

```text
flexShift/
├── apps/
│   ├── backend-api/        # NestJS + Prisma API (auth, tenancy, rota, marketplace, billing, jobs)
│   ├── web-admin/          # Next.js dashboard for organization admins & branch managers (:3000)
│   └── worker-portal/      # Mobile-first Next.js portal for relief workers (:3001)
├── packages/
│   ├── api-client/         # Typed fetch client + domain types shared by both frontends
│   └── ui/                 # Shared React components (Button, Modal, Toast, useAsync, ...)
├── docker-compose.yml      # Postgres (default) and the full stack (`--profile app`)
├── .gitlab-ci.yml          # lint + e2e tests + builds
├── TODO.md                 # Global checklist and what is still open
└── pnpm-workspace.yaml
```

---

## 3. Getting Started

### Prerequisites
* Node.js 22.13+ (pnpm 11 requires it) and pnpm (`corepack enable` picks the pinned version)
* Docker & Docker Compose

### 1. Install and start Postgres
```bash
pnpm install
docker compose up -d
```

### 2. Configure and migrate the API
```bash
cd apps/backend-api
cp .env.example .env            # then set JWT_SECRET (>= 32 chars): openssl rand -base64 48
pnpm exec prisma migrate deploy
pnpm seed                       # demo organizations, branches, workers and shifts
```

### 3. Run everything
```bash
pnpm dev:backend     # http://localhost:4000   (Swagger: /api/docs)
pnpm dev:web         # http://localhost:3000   organization dashboard
pnpm dev:portal      # http://localhost:3001   relief worker portal
```

Demo logins (password `FlexShiftPass2026!`, created by the seed):

| Who | Email | Uses |
| :--- | :--- | :--- |
| Super admin | `super@flexshift.io` | dashboard |
| Org admin (Apex) | `admin@apexhealth.co.uk` | dashboard |
| Branch manager (Richmond) | `richmond.mgr@apexhealth.co.uk` | dashboard |
| Branch manager (Crest, Beckenham) | `beckenham.mgr@crestpharmacy.co.uk` | dashboard |
| Relief worker (Tier 1, Apex bank) | `sarah.y@flexrelief.co.uk` | worker portal |
| Relief worker (marketplace only) | `david.i@flexrelief.co.uk` | worker portal |

### Tests
```bash
pnpm test:backend    # jest e2e against its own database (flexshift_test, rebuilt every run)
pnpm lint            # type-checks every workspace package
```
The test database must exist once: `docker exec flexshift-postgres psql -U postgres -c "CREATE DATABASE flexshift_test"`.
Do not run two test processes at the same time; they share that database.

### Full stack in containers
```bash
JWT_SECRET=$(openssl rand -base64 48) docker compose --profile app up --build
```

---

## 4. How it works

* **Tenancy:** organization → facility branch. Org admins see all their branches, branch managers only their own; every query goes through `AccessService` (`apps/backend-api/src/common/access.service.ts`). Other tenants' ids return 404/403.
* **Compliance gating:** a worker can only be booked with verified, unexpired Identity, Right to Work, DBS and Indemnity documents (plus anything the organization adds under Settings) and the shift's required systems/accreditations. One rule, `shifts/eligibility.ts`, covers instant book, apply, negotiate and manager assignment.
* **Tiered cascade:** staff-bank shifts go to Tier 1 first, then Tier 2, Tier 3 and finally the open marketplace, one step per `CASCADE_DELAY_MINUTES` (a cron job).
* **Money flow:** shift → (apply / negotiate / instant book / assign) → timesheet → manager approval → invoice → org admin marks paid (CSV payment batch export available).
* **Notifications:** in-app (bell icon) for proposals, counters, bookings, timesheets, invoices, document reviews, expiry warnings (30 and 7 days) and new-shift releases.

## 5. API surface

| Module | Routes |
| :--- | :--- |
| Auth | `POST /auth/login`, `/auth/register/relief-worker`, `/auth/logout`, `/auth/change-password`, `GET /auth/me` |
| Organizations / Users | `/organizations`, `/users` (invite managers; one-time temporary password) |
| Branches | `/branches`, `/branches/:id/rota` |
| Shifts | `/shifts` (list/create/update/status/assign), `/shifts/feed`, `/shifts/mine`, `/shifts/:id/instant-book`, `/shifts/:id/apply` |
| Negotiations | `/negotiations` (+ `/mine`, `:id/accept`, `:id/counter`, `:id/reject`) |
| Staff bank | `/staff-bank` |
| Relief workers | `/relief-workers` (+ `/lookup`, concierge onboarding, document upload/queue/verify/file, `/me/preferences`) |
| Timesheets / Invoices | `/timesheets`, `/invoices` (+ `/organization/:id/export.csv`) |
| Leave | `/leave` (approval can create backfill vacancies) |
| Analytics / Notifications | `/analytics/overview`, `/analytics/market-rates`, `/notifications` |
