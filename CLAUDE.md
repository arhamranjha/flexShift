# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FlexShift is a two-sided healthcare workforce platform: B2B rota/staff-bank management for organizations (pharmacies, optical clinics) and shift discovery/booking/invoicing for relief workers. pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`):

- `apps/backend-api` — NestJS 10 + Prisma 5 + PostgreSQL (the only substantially built app)
- `apps/web-admin` — Next.js 14 App Router + Tailwind; early stage (only `/` and `/rota` exist)
- `apps/worker-portal` — planned, not yet created
- Root `*.md` specs (`FlexShift_Master_Specification.md`, `Phase1_NodeJS_Architecture_Spec.md`, `NestJS_API_Stubs.md`, `FlexShift_Execution_Plan_and_Review_Loop.md`, etc.) hold product intent and the staged plan.

**Naming mandate:** `FlexShift_Execution_Plan_and_Review_Loop.md` forbids introducing any variation of the legacy/competitor keyword it refers to in code, schema, endpoints, docs or UI (clean-room build). Read that file's "Core Directives" before naming things or copying from external references.

## Commands

Run from the repo root (pnpm) unless noted:

```bash
docker compose up -d                       # Postgres 16 on :5432 (db flexshift_db, creds in docker-compose.yml)
cp apps/backend-api/.env.example apps/backend-api/.env   # PORT, DATABASE_URL, JWT_SECRET
pnpm prisma:generate                       # prisma generate (backend-api)
pnpm prisma:migrate                        # prisma migrate dev
cd apps/backend-api && npx ts-node prisma/seed.ts   # seed UK orgs/branches/workers/shifts
pnpm dev:backend                           # ts-node src/main.ts on :4000 (no watch mode)
pnpm build:backend                         # tsc -> dist/, run with `pnpm --filter backend-api start`
pnpm --filter web-admin dev                # Next.js on :3000
pnpm --filter web-admin lint
```

Swagger UI: `http://localhost:4000/api/docs`.

There is **no test runner or linter configured for the backend** (no jest/eslint scripts), so there is no single-test command yet.

## Backend architecture

- `app.module.ts` wires one Nest module per domain: auth, organizations, branches, relief-workers, staff-bank, shifts, negotiations, timesheets, invoices, leave. Each follows `*.module/controller/service`. `PrismaModule` provides `PrismaService` for all of them; `ConfigModule` is global.
- `main.ts`: global `ValidationPipe` (`whitelist`, `transform`), CORS `*`, Swagger at `/api/docs` with bearer auth.
- Auth: Passport JWT (`auth/jwt.strategy.ts`), `JwtAuthGuard` + `RolesGuard` with `@Roles()` and `@CurrentUser()` decorators. Roles: `SUPER_ADMIN`, `ORG_ADMIN`, `FACILITY_MANAGER`, `RELIEF_WORKER`. Multi-tenancy is organization → `FacilityBranch` → users/shifts, so services must scope queries by the caller's org/branch.
- Data model lives in `apps/backend-api/prisma/schema.prisma`.
- Core business flows:
  - **Tiered shift cascade**: shifts have a `ShiftVisibility`; publish to staff bank (`StaffBankTier` 1 Preferred → 2 Regular → 3 Reserve) before the open marketplace.
  - **Booking** (`shifts.service.ts`) runs in a `$transaction` with an anti-double-booking check; preserve this when changing booking/assignment logic.
  - **Negotiations** (rate counter-offers, accept/counter/reject), **timesheets** (clock in/out → manager sign-off), **invoices** (generated from approved timesheets), and **leave** (approval auto-creates vacancy shifts to backfill) each mutate several tables inside transactions.
  - Relief workers carry a compliance "passport" (`ComplianceDocument` with `DocType`/`DocStatus`) that gates bookability.
- Dependency note: both `bcrypt` and `bcryptjs` are installed; check which one `auth.service.ts` imports before touching password code.
