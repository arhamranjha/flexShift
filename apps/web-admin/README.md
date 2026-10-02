# FlexShift Web Admin Dashboard (`apps/web-admin`)

A Next.js (App Router) enterprise dashboard for healthcare organization executives and facility managers.

## Key Views & Features

### 1. Multi-Branch Rota (`/rota`)
* Interactive schedule grid (Weekly & Monthly views).
* Real-time vacancy gap indicator (uncovered shifts flagged).
* Color-coded shift states:
  - Green: Booked & confirmed
  - Amber: Open / Staff Bank dispatch
  - Red: Emergency / High-priority uncovered
  - Purple: In rate negotiation
* Click to assign verified relief professionals directly.

### 2. Staff Bank Management (`/staff-bank`)
* Dedicated internal worker directory.
* Tier classification:
  - Tier 1: Preferred regular relief workers
  - Tier 2: General qualified bank staff
  - Tier 3: Reserve pool
* Custom agreed hourly rates per branch.

### 3. Compliance Verification Desk (`/compliance`)
* Queue of newly uploaded compliance documents.
* Document inspection modal (Identity, Right to Work, DBS, Indemnity Insurance).
* One-click Verify / Reject with notes.
* Real-time GPhC register cross-referencing badge.

### 4. Timesheet Approvals & Billing (`/timesheets`, `/invoices`)
* Clock-in / clock-out review with automatic break deductions.
* One-click manager sign-off.
* Automated invoice generation and BACS payment file export.

### 5. Absence & Leave Management (`/leave`)
* Live staff holiday calendar.
* Rota overlap conflict detection.
* "Auto-Backfill" option to convert approved leave dates directly into open shift vacancies.
