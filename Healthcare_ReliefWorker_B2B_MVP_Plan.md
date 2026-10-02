# Healthcare Relief Worker Management Platform - B2B MVP Plan

## 1. Executive Summary
The Minimum Viable Product (MVP) focuses on the core B2B workforce management SaaS platform for pharmacy and healthcare facilities. It empowers organization administrators and facility managers to build multi-branch rotas, manage internal staff banks, post relief shifts, verify compliance credentials, and direct-assign relief professionals.

## 2. Core Personas
1. **Organization Admin (HQ)**: Manages regional pharmacy chains, oversees all branches, configures billing, reviews macro spend, and manages organizational compliance policies.
2. **Facility Manager (Branch)**: Builds weekly and monthly rotas, identifies shift gaps, publishes vacancies to the staff bank or open marketplace, approves timesheets, and manages daily operations.
3. **Relief Healthcare Professional**: Registered pharmacist, dispenser, or clinical specialist seeking flexible shifts, submitting compliance documents, negotiating rates, and clocking timesheets.

## 3. High-Priority Functional Deliverables

### Milestone 1: Multi-Branch & Identity Hierarchy
* Complete Organization $\to$ FacilityBranch relationship model.
* JWT authentication with granular RBAC guards.
* Role-specific dashboards (HQ view vs Single branch view).

### Milestone 2: Rota Scheduling & Shift Dispatch
* Interactive rota calendar (Day, Week, Month views).
* Shift publishing with skill requirements (ProScript, Columbus, Nexphase) and clinical tags (CPCS, Flu).
* Tiered shift dispatch: broadcast to internal staff bank first, then public marketplace.
* Admin-override direct worker assignment.

### Milestone 3: Universal Compliance Passport
* Upload and review workflows for Identity, Right to Work, DBS/Police Check, Indemnity Insurance, Safeguarding L3, and GPhC/regulatory registrations.
* Automatic document status transitions (`PENDING`, `VERIFIED`, `EXPIRED`, `REJECTED`).
* Expiration alert notifications.

### Milestone 4: Timesheets & Automated Invoicing
* Digital shift completion and hours confirmation.
* Branch manager sign-off workflow.
* Automated invoice generation and settlement tracking.
