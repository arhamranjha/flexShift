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
│   ├── backend-api/            # NestJS + TypeScript Enterprise API
│   │   ├── prisma/             # schema.prisma & seed data
│   │   ├── src/
│   │   │   ├── auth/           # JWT & RBAC (Org Admin, Facility Manager, Relief Worker)
│   │   │   ├── organizations/  # Multi-tenant healthcare groups
│   │   │   ├── branches/       # Facility branches & rota endpoints
│   │   │   ├── relief-workers/ # Worker profiles, compliance passports & verification
│   │   │   ├── staff-bank/     # Internal worker pools & tiered cascades
│   │   │   ├── shifts/         # Rota scheduling, instant book & feeds
│   │   │   ├── negotiations/   # Worker rate counter-offers & approvals
│   │   │   ├── timesheets/     # Digital shift check-in/out & approvals
│   │   │   ├── invoices/       # Automated invoicing & financial analytics
│   │   │   └── leave/          # Leave requests & auto-vacancy backfilling
│   │   └── package.json
│   └── web-admin/              # Next.js B2B Admin Dashboard (Coming in Phase 2)
├── docker-compose.yml          # PostgreSQL database service
├── pnpm-workspace.yaml         # Monorepo configuration
└── schema.prisma               # Master Prisma database schema
```

---

## 3. Getting Started

### Prerequisites
* Node.js v20+ LTS
* pnpm v9+ or npm v10+
* Docker & Docker Compose

### 1. Start the PostgreSQL Database
```bash
docker compose up -d
```

### 2. Configure Environment Variables
```bash
cd apps/backend-api
cp .env.example .env
```

### 3. Generate Prisma Client & Migrate
```bash
pnpm --filter backend-api prisma:generate
pnpm --filter backend-api prisma:migrate
```

### 4. Seed the Database
```bash
npx ts-node prisma/seed.ts
```

### 5. Start the Development Server
```bash
pnpm --filter backend-api start:dev
```

The API will be running at `http://localhost:4000`.  
Swagger OpenAPI interactive documentation is available at `http://localhost:4000/api/docs`.

---

## 4. API Modules Summary

| Module | Route Prefix | Key Functionality |
| :--- | :--- | :--- |
| **Auth** | `/auth` | Login, relief worker registration, session validation |
| **Organizations** | `/organizations` | Healthcare group management, billing terms |
| **Branches** | `/branches` | Branch details, rota schedules (`/branches/:id/rota`) |
| **Relief Workers** | `/relief-workers` | Worker profiles, concierge onboarding, compliance docs |
| **Staff Bank** | `/staff-bank` | Internal bank rosters, tiered dispatch |
| **Shifts** | `/shifts` | Rota creation, worker feeds (`/shifts/feed`), instant booking |
| **Negotiations** | `/negotiations` | Rate counter-offers, accept/counter/reject |
| **Timesheets** | `/timesheets` | Clock-in/out, hours validation, manager sign-off |
| **Invoices** | `/invoices` | Automated invoice generation, payout tracking |
| **Leave** | `/leave` | Absence requests, automatic shift vacancy backfill |
