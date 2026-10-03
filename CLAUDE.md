# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FlexShift is a two-sided healthcare workforce platform: B2B rota/staff-bank management for organizations (pharmacies, optical clinics) and shift discovery/booking/invoicing for relief workers. pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). pnpm is the only package manager (pnpm 11 needs Node 22.13+; do not add `package-lock.json`).

- `apps/backend-api`: NestJS 10 + Prisma 5 + PostgreSQL
- `apps/web-admin` (:3000): Next.js 14 dashboard for ORG_ADMIN / FACILITY_MANAGER / SUPER_ADMIN
- `apps/worker-portal` (:3001): mobile-first Next.js app for RELIEF_WORKER
- `packages/api-client`: typed fetch client + domain types used by both apps (consumed as TS source via `transpilePackages`)
- `packages/ui`: shared React components (entry is `src/index.tsx`)
- Root `*.md` specs hold product intent; `TODO.md` is the live checklist of what is built and what is open.

**Naming mandate:** `FlexShift_Execution_Plan_and_Review_Loop.md` forbids introducing any variation of the legacy/competitor keyword it refers to in code, schema, endpoints, docs or UI (clean-room build). Read its "Core Directives" before naming things or copying from external references. A case-insensitive grep for it must return nothing.

## Commands

From the repo root unless noted:

```bash
pnpm install
docker compose up -d                              # Postgres 16 on :5432 (db flexshift_db)
cp apps/backend-api/.env.example apps/backend-api/.env   # JWT_SECRET must be >= 32 chars or the API refuses to boot
cd apps/backend-api && pnpm exec prisma migrate deploy && pnpm seed
pnpm dev:backend | pnpm dev:web | pnpm dev:portal # :4000 (Swagger /api/docs) / :3000 / :3001
pnpm lint                                         # tsc --noEmit in every workspace package (there is no ESLint yet)
pnpm test:backend                                 # = cd apps/backend-api && jest --runInBand
cd apps/backend-api && npx jest -t "tenant isolation"   # single test / describe by name
cd apps/backend-api && npx jest test/client-contract     # a single spec file
```

Tests run against a separate database, `flexshift_test` (create once: `docker exec flexshift-postgres psql -U postgres -c "CREATE DATABASE flexshift_test"`). `test/global-setup.ts` drops and rebuilds it from migrations + seed on every run and refuses names without "test". **Never run two jest processes at once**: they share that database. Seed logins (password `FlexShiftPass2026!`) are in README.md.

Schema changes: edit `prisma/schema.prisma`, then create a migration non-interactively (`prisma migrate dev` refuses to run under an agent/non-TTY):
`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url postgresql://postgres:postgrespassword@localhost:5432/flexshift_shadow --script > prisma/migrations/<timestamp>_name/migration.sql`, then `prisma migrate deploy && prisma generate`. (Create the `flexshift_shadow` database once.)

pnpm's supply-chain policy rejects packages published in the last day (`minimumReleaseAge`); pin an older version rather than relaxing it. Install build scripts are controlled by `allowBuilds` in `pnpm-workspace.yaml`.

## Backend architecture (`apps/backend-api/src`)

One Nest module per domain (auth, users, organizations, branches, relief-workers, staff-bank, shifts, negotiations, timesheets, invoices, leave, analytics, notifications, jobs); `CommonModule`, `StorageModule` and `NotificationsModule` are global. `bootstrap.ts` (`configureApp`) holds helmet, CORS allow-list and the strict global `ValidationPipe` (`forbidNonWhitelisted`: unknown body fields are a 400), and is shared by `main.ts` and the tests. Every request/body shape is a class-validator DTO in the module's `dto/` folder.

- **Tenancy is the central invariant.** `common/access.service.ts` (`AccessService`) owns the rules: `branchScope(user)`, `workerScope(user)`, `assertOrg/assertBranch/assertShift`. SUPER_ADMIN sees all; ORG_ADMIN their organization; FACILITY_MANAGER their own branch only. Branch lookups return 404, not 403. Always compose scope filters with `AND: [...]`; **spreading `branchScope` after `{ id }` silently overwrites the id** (this was a real bug). New endpoints must call AccessService.
- **Eligibility** (`shifts/eligibility.ts`) is the single gate for every booking path (instant book, apply, negotiate, accept, manager assign): verified + unexpired Identity/Right-to-Work/DBS/Indemnity, plus the organization's `requiredDocTypes`, plus required systems/accreditations, plus tier-aware visibility (`isVisibleToWorker`, mirrored by the Prisma `where` in `ShiftsService.getWorkerFeed`: keep the two in sync). Booking runs in a transaction that first takes a row lock (`lockWorker`) then does a conditional `updateMany` on status. Follow that pattern for anything that books or releases a worker; other state changes use conditional `updateMany` (status in the `where`) rather than read-then-write.
- **Cascade:** a STAFF_BANK_ONLY shift starts at `cascadeStage` 1 (Tier 1) with `nextCascadeAt`; `JobsService.runCascade` (cron, public for tests) widens it 1→2→3 then flips it to PUBLIC_MARKETPLACE. `JobsService.runExpiry` expires documents, warns at 30/7 days and recomputes `isVerified` (`relief-workers/verification.ts`).
- **Notifications** (`notifications.service.ts`) are best-effort, sent after the transaction commits; the `link` is an app-relative path each frontend resolves itself.
- **Auth:** Passport JWT, carried either as a bearer header (tools/tests) or, for the browser apps, an HttpOnly `fs_<app>` cookie set by login/register/change-password (`auth/session.ts`). Each frontend names itself in `X-FlexShift-App` (admin|worker) so the two apps get separate cookies; `csrfGuard` requires `X-Requested-With: flexshift` on unsafe cookie-authenticated requests. The shared client does both when created with `app: 'admin'|'worker'`; no token is ever stored in the browser. Cookie-mode cannot be tested from Node's fetch, so it is covered by supertest agents in the e2e suite.
- **Guard rules:** `JwtAuthGuard` also blocks every endpoint except `/auth/me|logout|change-password` while `mustChangePassword` is set (temporary passwords from concierge onboarding and `POST /users`). Logout/password change bump `User.tokenVersion`, which revokes older tokens. Throttling via `@nestjs/throttler`.
- Shift lifecycle: OPEN → IN_NEGOTIATION → BOOKED → IN_PROGRESS → COMPLETED (COMPLETED only through timesheet approval, which also issues the invoice). Booked shifts only allow title/notes edits. Timesheets are bounded to the shift window.
- Relief-worker endpoints for the signed-in worker live under `/relief-workers/me/...`; there is no worker id in those URLs on purpose.
- Documents are stored by `StorageService` (local disk under `UPLOAD_DIR`; swap the methods for S3) and served only through `GET /relief-workers/documents/:id/file`.

## Frontend architecture

Both apps are client-rendered App Router apps with the same shape: `src/lib/auth.tsx` (session is the HttpOnly cookie, single shared `api` client, `AuthProvider`; web-admin also has `ScopeProvider`/`useScope` for the branch picker and `orgId`), `components/AppShell` (route guard, redirects, blocks rendering while a password change is pending), and one folder per page under `src/app`. Pages load with `useAsync`, mutate with `useAction` (toasts API errors), and must show loading/error/empty states. All HTTP goes through `packages/api-client`; add a method there (and its type) rather than calling `fetch` in a page. A 403 from booking carries `ApiError.details.problems: string[]` which the UIs render as a checklist.

`test/client-contract.e2e-spec.ts` runs the shared client against a real server, so renaming a DTO field or client method breaks it by design.

## Infra

Dockerfiles for the three apps (Node 22, pnpm; build context is the repo root), `docker compose --profile app up --build` for the full stack, `.gitlab-ci.yml` (lint, tests with a Postgres service, builds).
