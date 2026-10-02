# Phase 1 Technical Architecture Specification (Node.js / TypeScript)

## 1. Stack Overview
* **Runtime:** Node.js (v20+ LTS)
* **Framework Options:** NestJS (recommended for enterprise structure)
* **Database:** PostgreSQL
* **ORM / Query Builder:** Prisma
* **Authentication:** Passport.js / JWT with HTTP-only cookies
* **File Storage:** AWS S3
* **API Paradigm:** RESTful API (OpenAPI / Swagger documentation)

## 2. Core Modules (Phase 1 MVP)

### Module A: Auth & RBAC (`/auth`)
* `POST /auth/login` - Authenticate Organization Admins and Facility Managers.
* `POST /auth/logout` - Invalidate session tokens.
* `GET /auth/me` - Fetch currently authenticated user and active branch permissions.

### Module B: Relief Worker Administration (`/relief-workers`)
* `POST /relief-workers` - Create a new Relief Worker profile.
* `GET /relief-workers` - Search/list all workers with filter by compliance status.
* `GET /relief-workers/:id` - Fetch worker profile and attached document metadata.
* `POST /relief-workers/:id/documents` - Upload compliance document.
* `PATCH /relief-workers/:id/documents/:docId` - Update verification status.

### Module C: Facility & Rota Management (`/branches`, `/shifts`)
* `POST /branches` - Register a facility branch.
* `GET /branches/:id/rota` - Fetch weekly/monthly shift grid.
* `POST /shifts` - Create open shift slot.
* `PATCH /shifts/:id/assign` - Direct assign a verified Relief Worker to a shift slot.
* `PATCH /shifts/:id/status` - Transition shift state.
