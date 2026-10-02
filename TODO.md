# FlexShift Global TODO

Consolidated from: Master Specification, B2B MVP Plan, Phase 1 Architecture Spec, Onboarding Roadmap, Execution Plan & Review Loop, READMEs, and the last agent summary. Status reflects code as of 2026-10-03.

Legend: [x] done · [~] partial · [ ] not started

## Stage 1 — Backend (mostly done)
- [x] Prisma schema (13+ models), seed, docker-compose Postgres
- [x] Auth: login, relief-worker register, `/auth/me`, JWT + RBAC guards
- [x] Orgs, branches (+ `/branches/:id/rota`), relief workers (concierge, docs, verify, prefs, watch, favourite)
- [x] Staff bank CRUD, shifts (create/feed/assign/instant-book/apply), negotiations (propose/accept/counter/reject)
- [x] Timesheets submit/approve → auto invoice, invoices (org list, my-finance, pay), leave (request/review + backfill)
- [x] Concurrency hardening (transactional booking, overlap checks), bcryptjs standardisation
- [x] Ad-hoc E2E happy path passed (not committed as tests)
- [ ] Spec endpoints missing: `POST /auth/logout`, `PATCH /shifts/:id/status`, shift cancel, `PATCH /branches/:id`, org/branch update, user (manager) creation
- [ ] Real document upload (multipart + S3 or local-disk adapter) — currently metadata-only `uploadDocument`
- [ ] HTTP-only cookie auth (spec) vs bearer-only today
- [ ] Tiered cascade dispatch automation (Tier1 → Tier2 → marketplace over time), not just visibility flag
- [ ] Smart matching (systems/accreditations vs worker) + compliance gating on book/instant-book
- [ ] Document expiry alerts (30/7-day) — scheduler + notifications
- [ ] Notification system (email/in-app) for offers, counters, approvals
- [ ] Org-specific credential checklists
- [ ] BACS payroll CSV export; accounting export
- [ ] Market-rate benchmarking; min-rate notification filter
- [ ] Analytics endpoints (fill rate, spend, vacancies) for dashboard
- [ ] Tenant-scoping audit of every service (org/branch isolation)
- [ ] Automated tests (jest unit + e2e), eslint/prettier, `start:dev` watch mode, CI (GitLab CI)
- [ ] Remove duplicate root `schema.prisma`; prisma migrations committed (currently none in repo)
- [ ] Lock down CORS `*`, env validation, rate limiting, helmet

## Stage 2 — `apps/web-admin` (scaffolded: `/` dashboard, `/rota`)
- [~] Dashboard `/` and Rota `/rota` exist (need install/build verification, real data wiring, Day/Week/Month)
- [ ] Login page + auth/session handling + route protection, role-based nav (HQ vs branch)
- [ ] `/staff-bank` tiers 1/2/3 + custom rates
- [ ] `/shifts` create/publish (tags, systems, visibility), assign, cancel
- [ ] `/compliance` review desk (queue, inspect, verify/reject with notes, GPhC badge)
- [ ] `/workers` directory + concierge onboarding form
- [ ] `/timesheets` + `/invoices` approvals, payment tracking, BACS export
- [ ] `/leave` approval with backfill
- [ ] `/negotiations` inbox (accept/counter/reject)
- [ ] Settings: org/branch management, credential policy
- [ ] Shared UI kit (Radix/Shadcn per spec), loading/error states, `.env` for API URL

## Stage 3 — `apps/worker-portal` (not created)
- [ ] Scaffold Next.js mobile-first app; auth + self-registration (Phase 2 onboarding)
- [ ] Shift feed tabs: For You / Watching / Favourites / Emergencies; distance + rate filters, gross payout
- [ ] Shift detail: instant book, watch, apply, negotiate modal
- [ ] My Shifts diary (calendar + list, status filters)
- [ ] My Finance: invoices, payout status, earnings
- [ ] Compliance passport + document upload, min-rate threshold
- [ ] Timesheet submit (clock in/out)

## Phase 3 / Infra (later)
- [ ] Dockerfiles, Terraform/Terragrunt, EKS, GitLab CI, S3 bucket
- [ ] Worker Pro tier (auto-invoicing, expense tracking, insights) — from original product brief
- [ ] Mobile app (native) — out of scope for now

## Standing rules
- Never introduce the prohibited legacy keyword (see Execution Plan) in code, schema, docs, or UI.
- Review loop before/after each milestone: naming, architecture, concurrency, security/RBAC.
