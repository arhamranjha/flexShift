# FlexShift Comprehensive Engineering Plan & Autonomous Review Loop

## 1. Executive Summary & Core Directives
FlexShift is a clean-room B2B workforce management SaaS and relief professional fulfillment platform.
* **Strict Naming Mandate**: Under no circumstances may any variation of the legacy keyword be introduced into any code, schema, endpoint, documentation, or user interface.
* **Architecture Standard**: Enterprise NestJS backend (TypeScript, Prisma, PostgreSQL) paired with a modern Next.js frontend (TailwindCSS, Radix/Shadcn).
* **Two-Sided Synergy**:
  1. Organization & Facility Management Web App (`apps/web-admin`)
  2. Relief Professional Portal & Mobile-Responsive Web App (`apps/worker-portal`)

---

## 2. Multi-Stage Execution Plan

### Stage 1: Backend Verification, Database Migration & Seed Validation
1. Verify database connectivity (Docker PostgreSQL container or fallback PostgreSQL instance).
2. Apply Prisma schema migrations to establish all 13 core relational tables.
3. Execute `seed.ts` to populate realistic UK healthcare organizations (Apex Healthcare, Crest Pharmacy), London branches (Richmond, Beckenham, Barking), verified relief professionals, compliance credentials, rota shifts, staff bank memberships, timesheets, and invoices.
4. Execute automated integration tests across all 10 API modules (`auth`, `organizations`, `branches`, `relief-workers`, `staff-bank`, `shifts`, `negotiations`, `timesheets`, `invoices`, `leave`).

### Stage 2: Next.js Enterprise Management Dashboard (`apps/web-admin`)
1. Scaffold Next.js application with TailwindCSS, Lucide icons, and component libraries.
2. Build core pages:
   - **Executive Overview (`/dashboard`)**: Metric cards for branch fill rate, active staff bank headcount, open shift vacancies, and monthly relief spend.
   - **Interactive Multi-Branch Rota (`/rota`)**: Visual weekly/monthly schedule matrix, shift status color-coding, vacancy gap indicators, and one-click relief assignment.
   - **Staff Bank Management (`/staff-bank`)**: Tier 1 (Preferred), Tier 2 (Regular), and Tier 3 (Reserve) worker pools with agreed custom rates.
   - **Shift Management & Publishing (`/shifts`)**: Create shifts with required clinical tags (CPCS, Flu), system proficiency (ProScript, Columbus), and visibility controls (Staff Bank vs Open Market).
   - **Compliance Review Desk (`/compliance`)**: Review queue for worker credentials (Identity, Right to Work, DBS, Indemnity Insurance) with approval/rejection audit trail.
   - **Timesheets & Billing Approvals (`/timesheets`, `/invoices`)**: Digital hours validation, manager sign-off, automated invoice generation, and BACS payment batch export.
   - **Leave Management (`/leave`)**: Holiday request approval with automated rota vacancy backfilling.

### Stage 3: Relief Professional Mobile-Responsive Web Portal (`apps/worker-portal`)
1. Build high-fidelity mobile-responsive web app reflecting the complete worker journey:
   - **Shift Discovery Feed (`/feed`)**: Tabbed navigation (*For You*, *Watching*, *Favourites*, *Emergencies*), distance/rate filters, and gross payout calculations.
   - **Shift Details & Actions (`/shifts/:id`)**: Comprehensive shift information, required computer systems, Instant Book action, and Watch toggle.
   - **Rate Negotiation Modal (`/negotiations`)**: Rate counter-proposal input, reason note, and status tracking (*Pending*, *Countered*, *Accepted*).
   - **My Shifts Diary (`/my-shifts`)**: Calendar and list views with status filters (*Watching*, *In Negotiation*, *Applied*, *Booked*, *Completed*).
   - **My Finance & Invoicing (`/finance`)**: Automated digital invoices, payout status tracking, and earnings breakdown.
   - **Universal Compliance Passport (`/profile`)**: Document upload status, GPhC registration, skills accreditations, and minimum shift rate notification threshold.

---

## 3. Autonomous Review Loop Protocol
Before and after each milestone, dedicated reviewer subagents will inspect:
1. **Naming & Brand Integrity**: Absolute 0 occurrences of prohibited terms.
2. **Architecture & Clean Code**: Separation of concerns, DTO validation, service decoupling, proper error handling.
3. **Data Model & Concurrency**: Anti-double-booking locks, database transactions, foreign key cascades.
4. **Security & Governance**: JWT expiry, RBAC enforcement (`SUPER_ADMIN`, `ORG_ADMIN`, `FACILITY_MANAGER`, `RELIEF_WORKER`), sensitive credential protection.
