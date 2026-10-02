# FlexShift Platform - Master Architecture, Data Models & Product Roadmap

## 1. Executive Summary & Core Philosophy
FlexShift is a modern, high-performance B2B workforce management SaaS and on-demand relief healthcare marketplace. It connects healthcare organizations (community pharmacies, optical practices, care clinics) directly with verified relief workers and flexible healthcare professionals—completely bypassing high-commission traditional staffing agencies.

### Core Architectural Pillars
1. **Clean-Room Implementation:** Built from first principles with zero legacy naming constraints or dependencies.
2. **Disintermediation Model:** Healthcare organizations subscribe to comprehensive rota, compliance, and staff bank SaaS tools. Relief workers receive 100% of their advertised shift pay.
3. **Multi-Tenant Enterprise Hierarchy:** Clear separation across Organizations (HQ/Group level), Facility Branches (store/clinic level), and Relief Professionals.
4. **Tiered Fulfillment Engine:** Shifts broadcast in an automated cascade: Internal Staff Bank $\to$ Preferred Regulars $\to$ Open Marketplace.

---

## 2. Product Matrix & Functional Modules

### A. Rota & Scheduling Engine
* **Digital Multi-Branch Rota:** Schedule staff up to 9 months in advance with daily, weekly, and monthly views.
* **Vacancy & Shift Gap Identification:** Live visualization of uncovered shifts and compliance alerts.
* **Smart Matching:** Match open shifts with relief workers possessing the exact required pharmacy management systems (e.g. ProScript, Columbus, Nexphase) and clinical accreditations (e.g. CPCS, Flu Vaccination, Safeguarding Level 3).

### B. Staff Bank Management
* **Internal Pool Management:** Facilities build and manage an internal pool of trusted relief professionals.
* **Tiered Cascade Dispatch:** Priority shift broadcast to Tier 1 (Preferred) before expanding to Tier 2 (Regular) and public marketplace.
* **Agreed Rates:** Branch-level custom hourly rates and preferential terms.

### C. Shift Marketplace & Rate Negotiation Engine
* **Feed Filters:** Instant filtering by branch proximity, hourly rate, date range, emergency status, and overnight tags.
* **Watchlist & Favourites:** Workers can watch shifts and save favourite branches.
* **Direct Negotiation:** Workers can counter-offer proposed rates; managers can accept, reject, or submit counter-rates.
* **Instant Book:** Instant booking for pre-verified staff meeting all compliance requirements.

### D. Compliance & Governance Passport
* **Mandatory Credentials:** Identity, Right to Work, DBS/Police Check, Professional Indemnity Insurance, Safeguarding L3, Fitness to Practise Declarations.
* **Automated Expiry Alerts:** 30-day and 7-day expiration notifications for documents nearing expiry.
* **Organization-Specific Verification:** Different pharmacy chains can enforce their custom credential checklist.

### E. Timesheets, Automated Invoicing & Payments
* **Digital Timesheets:** Shift check-in/out timestamps, break calculations, and billable hour validation.
* **Manager One-Click Sign-Off:** Digital approval by branch managers.
* **Automated Invoicing:** System automatically generates digital invoices upon timesheet approval, removing manual invoice paperwork.
* **Financial Export:** Export ready for BACS payroll files and accounting software.

### F. Leave Management
* **Absence & Annual Leave Tracking:** Workers and permanent staff submit leave requests directly.
* **Rota Overlap Detection:** Automatic conflict checking before approval.
* **Automatic Vacancy Backfill:** Approved leave automatically converts shifts into open vacancy slots for relief cover.

---

## 3. Technology Stack & Infrastructure

* **Backend:** Node.js (v20+ LTS), NestJS (Modular Architecture, TypeScript, Class Validator)
* **Database & ORM:** PostgreSQL, Prisma ORM
* **Frontend:** Next.js (App Router, React 18/19), TailwindCSS, Radix UI / Shadcn
* **Authentication:** Passport.js, JWT sessions, Role-Based Access Control (`SUPER_ADMIN`, `ORG_ADMIN`, `FACILITY_MANAGER`, `RELIEF_WORKER`)
* **Infrastructure:** Docker, Kubernetes (EKS), Terraform, AWS S3 (secure document storage)

---

## 4. Phased Engineering Roadmap

### Phase 1: B2B SaaS Core & Admin Concierge Onboarding
1. Multi-branch organization hierarchy and branch manager accounts.
2. Full Rota Builder & Shift Scheduling engine with open/booked/completed state machine.
3. Admin-led concierge worker profile setup and compliance document verification.
4. Direct shift assignment and fulfillment override.

### Phase 2: Marketplace, Staff Bank & Rate Negotiation
1. Relief Worker self-service registration and universal compliance passport.
2. Staff Bank priority dispatch and tiered broadcast.
3. Worker shift discovery feed, instant book, and rate counter-offer negotiations.
4. Leave management with automatic rota vacancy generation.

### Phase 3: Digital Timesheets, Automated Billing & Worker Finance
1. Shift clock-in/out digital timesheets and branch manager approvals.
2. Automated invoice generation, payment status tracking, and BACS payroll export.
3. Market rate benchmarking intelligence and minimum shift rate notification filters.
