# FlexShift Global TODO

Consolidated from the Master Specification, B2B MVP Plan, Phase 1 Architecture Spec, Onboarding Roadmap, Execution Plan & Review Loop and the READMEs. Status as of 2026-10-03.

Legend: [x] done · [~] partly done · [ ] not started

## Backend (`apps/backend-api`)
- [x] Auth, JWT + RBAC, logout/token revocation, change password, forced change of temporary passwords
- [x] Tenant isolation on every module (`AccessService`), worker scoping, DTO validation everywhere
- [x] Eligibility engine (documents, expiry, systems, accreditations, org-specific extra documents)
- [x] Booking concurrency (worker row lock, conditional updates), negotiation/timesheet/invoice state machines
- [x] Document upload (multipart, magic-byte check) behind a storage interface (local disk)
- [x] Tiered cascade Tier 1 → 2 → 3 → marketplace (cron), staff-bank visibility rules
- [x] Document expiry job (30/7-day warnings, expiring documents, un-verifies workers)
- [x] In-app notifications; analytics overview; market-rate benchmark (min 5 shifts / 3 orgs)
- [x] Migrations committed; seed is idempotent and date-relative
- [x] 59 jest e2e tests incl. a contract test of the shared API client; CI config
- [x] S3 document storage (set S3_BUCKET; tested against an S3-compatible server; local disk remains the default)
- [x] Email delivery for important notifications (SMTP via nodemailer, off by default; per-user opt-out in the bell menu; drivers off/smtp/json)
- [ ] Real BACS file: needs worker bank details (CSV payment batch exists, no sort code/account no.)
- [x] Accounting export (purchase-invoice CSV in the common bills-import layout; account code / tax type / date range options)
- [x] HTTP-only cookie sessions (per-app cookie, SameSite, CSRF header, bearer still accepted for tools/tests); no token in browser storage
- [x] Leave conflict detection (same person cannot hold overlapping pending/approved leave at a branch)
- [ ] Per-organization document *verification* (today any in-scope organization can verify a worker's documents; verified status is global)
- [ ] Worker distance/postcode filtering for the feed
- [ ] ESLint + Prettier (lint script is type-checking only)
- [x] Emergency broadcast: notifies every verified worker and ignores minimum-rate thresholds (feed emergencies tab too)

## Organization dashboard (`apps/web-admin`)
- [x] Login, forced password change, role-aware navigation, branch scope picker
- [x] Overview, multi-branch rota (day/week/month, assign, release), shifts (create/edit/publish/cancel, cascade option, market-rate hint)
- [x] Rate negotiations inbox, staff bank (tiers, rates, invite by registration number), workers directory + concierge onboarding
- [x] Compliance desk (review queue, previews, mandatory checklist), timesheets (single + bulk approval), invoices (pay, CSV export), leave (backfill), settings (org, branches, team, extra required credentials)
- [x] Notification bell
- [ ] Live browser walkthrough: pages compile, type-check and are covered by the client contract test, but nobody has clicked through them (browser tooling was unavailable)
- [ ] Modal-level a11y beyond focus trap (labelled landmarks, screen-reader pass)
- [x] Clearing optional values (staff-bank custom rate)

## Worker portal (`apps/worker-portal`)
- [x] Register (2-step) / login, feed (For you, Watching, Favourites, Emergencies, filters), shift detail (instant book, apply, negotiate, accept counter)
- [x] My shifts diary (list + calendar, timesheet submission), finance (invoices, timesheets), compliance passport + upload + preferences
- [x] Notification bell
- [x] Live clock-in/out on the shift page (clock-in opens 1h before start; clock-out submits the timesheet)
- [x] Clearing the minimum-rate threshold / standard rate
- [ ] Push notifications; installable PWA

## Infrastructure
- [x] Dockerfiles (api, web-admin, worker-portal; built and API boot-tested), compose `--profile app`, `.gitlab-ci.yml`
- [ ] Terraform / Terragrunt / EKS, S3 bucket, secrets management
- [ ] Observability (structured logs, metrics, error tracking)

## Later / product
- [ ] Worker Pro tier (auto-invoicing for self-employed workers, expense tracking, insights)
- [ ] Native mobile app

## Standing rules
- Never introduce the prohibited legacy keyword (see `FlexShift_Execution_Plan_and_Review_Loop.md`) in code, schema, docs or UI.
- Review loop before/after each milestone: naming, architecture, concurrency, security/RBAC.
- pnpm is the only package manager; Node 22.13+.
