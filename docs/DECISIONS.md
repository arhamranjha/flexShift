# Decision log

Why FlexShift is built the way it is. Each entry: what was decided, why, what was rejected, and what it costs you. Newer
decisions are appended at the bottom of each section. If you change one of these, add a new entry rather than editing history.

`CLAUDE.md` says how to work in the code; `HANDOFF.md` says where things stand; this file says *why*.

---

## 1. Product and scope

### 1.1 Disintermediation SaaS, not an agency
Healthcare organizations pay for rota, staff-bank, compliance and billing tooling; relief workers keep 100% of their rate.
Source: `FlexShift_Master_Specification.md`, `Healthcare_ReliefWorker_B2B_MVP_Plan.md`. Everything (negotiation, staff bank, tiered
release) exists to let an organization fill shifts from its own people first and the open market second.

### 1.2 Clean-room naming mandate
`FlexShift_Execution_Plan_and_Review_Loop.md` forbids any variation of the legacy/competitor product name in code, schema, docs or UI.
Every review round greps the repo for it (case-insensitive) and must find nothing. Do not "fix" this by renaming the mandate file.

### 1.3 New Zealand first (decided 2026-10-03)
The product is meant for NZ. The original specification was UK-shaped (GBP, GPhC, DBS, ProScript...). See 3.1 for how this was handled.

---

## 2. Architecture

### 2.1 NestJS + Prisma + PostgreSQL; strict validation
Every request body/query is a class-validator DTO and the global `ValidationPipe` uses `forbidNonWhitelisted`: an unknown field is a
400. *Why:* the early backend had no DTOs at all (`ValidationPipe` was a no-op), which hid mass-assignment and client/server drift.
*Cost:* clients must send exactly the fields in the DTO. The shared client + `test/client-contract.e2e-spec.ts` exist to catch drift.

### 2.2 Tenant isolation lives in one place: `AccessService`
SUPER_ADMIN sees all; ORG_ADMIN their organization; FACILITY_MANAGER their own branch; workers only themselves. Branch lookups return
404 (not 403) so other tenants' ids are not confirmed to exist.
*Why:* the first agent-built backend declared itself "hardened" with no tenant isolation at all; the first review found any manager
could read or write another organization's data.
*Trap (a real bug found by tests):* spreading `branchScope(user)` after `{ id }` silently overwrote the id, so a manager asking for
any branch got their own. Always compose with `AND: [...]`.

### 2.3 One eligibility gate for every booking path
`shifts/eligibility.ts` decides whether a worker may take a shift: verified, unexpired Identity / Right to Work / police check /
Indemnity, plus the market's own credentials (3.3), plus the organization's extras (`requiredDocTypes`), plus required systems and
accreditations, plus tier-aware visibility. Instant book, apply, negotiate, accept and manager assign all call it.
*Why:* the original code checked a single `isVerified` flag in one path and nothing in the others. *Note:* manager assign may skip
**skills** (org admins only, `overrideSkills`) but never documents.

### 2.4 Booking concurrency: row lock + conditional updates
Booking takes `SELECT ... FOR UPDATE` on the worker row, re-checks overlap, then flips the shift with a conditional `updateMany`
(status in the `where`). Other state changes use conditional updates rather than read-then-write.
*Why:* review found two simultaneous instant-books could double-book a worker. *Rejected:* serializable isolation (retries everywhere).

### 2.5 Staff-bank tiers and the cascade run in-process
`STAFF_BANK_ONLY` shifts start at Tier 1 and widen Tier 2 → Tier 3 → marketplace on a timer (`JobsService.runCascade`, cron every
minute, `CASCADE_DELAY_MINUTES`). Each step is a conditional update so overlapping runs cannot double-advance.
*Consequence:* the API must be a **long-running, always-on process**. This is why serverless hosting (Vercel functions) was rejected for
the API (see 6.2). Cron is disabled under test (`DISABLE_CRON`); tests call `JobsService.run*()` directly.

### 2.6 Who can see which workers (`workerScope`)
An organization only sees workers it onboarded, has in its staff bank, or who applied to / negotiated / were booked on its shifts.
*Why:* worker documents (identity, right to work, police checks) are sensitive; the first review found every manager could read all of them.
*Consequence you must know:* a **self-registered worker is invisible to every organization until a manager looks them up by
registration number and adds them to the staff bank** (`GET /relief-workers/lookup`). Only then can that organization review their
documents. A worker cannot apply to shifts until verified, so there is no other path. **Decision (2026-10-03, owner): build both paths, operator first.**
(1) *Operator verification — built.* The platform operator (super admin) sees every worker's pending documents in the Compliance Desk (a
"platform queue" banner, worker email/country, search) and is notified in-app (`DOCUMENT_UPLOADED`) when a worker uploads. Verifying makes the
worker bookable wherever the rules are met and notifies them. Organizations still see only workers in their scope, so an organization cannot
verify strangers who have not asked it or applied to it. (2) *Worker-initiated "share my documents with this organization" request — built (2026-10-03).* A worker asks an
organization, by its code (shown in Settings) or from any of its shift pages (`DocumentShare`, `/relief-workers/me/document-shares`). While the
request is **PENDING** the organization has the worker in `workerScope` and can review and verify their documents; **accepting** adds the worker
to its staff bank (which keeps them in scope), **declining** or the worker **withdrawing** removes them from scope again. Choices: scope comes
only from PENDING (an accepted request does not keep a worker visible after the organization removes them from its bank, they may ask again);
a decline stands for 30 days and only organization admins may decline (a branch manager misclick should not lock a worker out); after
withdrawing, a worker waits 24 hours before asking the same organization again, and asking is throttled (`SHARE_THROTTLE_LIMIT`, 10/min), because
every request notifies the organization's admins; at most 5 requests may wait at once (no spraying every organization); accepting is allowed
before the documents are verified (the eligibility gate still blocks booking); a deactivated organization loses pending workers from scope;
a request nobody answers **lapses after 30 days** (`EXPIRED`, `JobsService.runShareExpiry`, daily) so a silent organization does not keep
access to identity documents (Privacy Act mindset), and the worker may ask again; the 5-waiting cap is checked under the worker row lock
(`lockWorker`) so parallel requests cannot exceed it; request notifications go to the organization's admins, or its managers if it has no
active admin, or the platform operator, so no request is a silent dead end. A pending organization sees the worker's full profile (name,
contact details, rates, experience, systems, documents; there is no home address on the profile): the worker is told exactly that before asking.
Request emails never contain the worker's name (it is typed by a stranger; see 2.9). Because any organization a worker asks can now see
their profile, staff only see *who* verified a document when the verifier is from their own organization, and only their own branches among
the worker's favourites. Cost of (1): the operator is a bottleneck by design.
Cost of (2): verification is still **global**, so an organization a worker asked can verify documents that then count everywhere; per-organization
verification remains open (TODO.md).

### 2.7 Sessions: HttpOnly cookies, one per app, CSRF header; bearer still accepted
Browser apps hold no token in JavaScript-readable storage. Login/register/change-password set `fs_admin` or `fs_worker` (HttpOnly,
Secure in production, SameSite=Lax). Each frontend sends `X-FlexShift-App` so the two apps get separate cookies (*cookies ignore ports on
localhost, so one shared cookie let the apps overwrite each other*). State-changing requests authenticated only by a cookie must carry
`X-Requested-With: flexshift`, which a browser cannot add cross-origin without a CORS preflight that only allow-listed origins pass.
Bearer tokens remain for tools and tests. `User.tokenVersion` revokes every token on logout/password change.
*Requirement:* the apps and API must share a registrable domain (`app.x`, `work.x`, `api.x`), or set `COOKIE_SAMESITE=none` on HTTPS.
Temporary passwords force a change before any other endpoint works (`JwtAuthGuard`).

### 2.8 Documents: the extension and the bytes decide, never the browser-reported type
Uploads are accepted by file extension (.pdf/.png/.jpg/.jpeg) and the file's first bytes must agree. *Why:* on some Windows machines the
OS registry has no entry for these types, so the browser reports a blank or wrong MIME type; the file dialog greyed files out and the
upload was rejected (a real user report, 2026-10-03). Storage is behind `StorageService`: local disk by default, S3 when `S3_BUCKET`
is set (tested against an S3-compatible server). Files are served only through an authenticated endpoint. HEIC (iPhone) is **not**
supported yet.

### 2.9 Notifications: in-app always, email optional and conservative
In-app notifications for all events; email (nodemailer, off by default) only for important types, with an opt-out. Emails never contain
free text typed by users (a manager could otherwise send arbitrary text from the platform's address); they carry a link. SMTP delivery
is fire-and-forget with a pooled transport and timeouts so a slow mail server cannot hang requests.

### 2.10 Timesheets and clock-in/out
Clock-in opens 1 hour before the shift. Billing starts at the **scheduled start** (clocking in early is unpaid) and a clock-out later
than the allowed overrun is capped, not rejected (so a worker is never stuck IN_PROGRESS). Timesheets need at least one billable minute.
`IN_PROGRESS` is entered only by clocking in. Submitting locks the shift row so a concurrent cancel cannot leave an orphan timesheet.

### 2.11 No demo accounts in production
The seed (`prisma/seed.ts`) creates public-password demo users and is for development only. Production gets its first super admin from
`dist/cli/create-admin.js` (refuses the demo password, forces a change) and customers from the Organizations screen or
`dist/cli/create-org.js`. Temporary passwords are shown once.

---

## 3. Money and markets (NZ first)

### 3.1 Markets are data, not code branches
`apps/backend-api/src/common/markets.ts` is the single source of truth (NZ default, GB kept): currency, timezone, tax defaults, the
professional register, extra mandatory credentials, document wording, suggestions. It is served publicly at `GET /markets`; both apps
read it through `useMarket()`. An organization's `country` selects its market. *Rejected:* hard-coding NZ (would strand the UK demo and
make a second market a rewrite) and per-field overrides (would let organizations weaken credential rules).
**Only platform admins can change an organization's market** because it decides which credentials are mandatory; an org admin could
otherwise drop the NZ practising-certificate rule.
*NZ values are starting points.* Regulator wording, vetting requirements, dispensing-system names and accreditations must be confirmed with
a real NZ pharmacy customer (HANDOFF.md).

### 3.2 Money follows the record
`Shift.currency` is copied from the organization when the shift is created; `Invoice.currency` from the shift. Changing an
organization's market never rewrites history. *Never format money with an assumed currency*: use `money(value, record.currency)` from the
shared client. Amounts in different currencies are **never added**: analytics groups by invoice currency, worker finance returns
`byCurrency`, UIs use `moneyTotals()`. (The review found sums that silently mixed currencies; this is the rule that prevents it.)

### 3.3 NZ credentials
Everyone needs Identity, Right to Work, a police check and Indemnity (the enum value is still `DBS_POLICE_CHECK`; the label is per market:
"Police vetting (NZ Police)" in NZ). NZ organizations additionally require `PRACTISING_CERTIFICATE`. Emergency and rate-match alerts only go
to workers who hold what the shift's organization requires.

### 3.4 Dates stay en-GB
Day-first, 24-hour formatting suits NZ pharmacies and was left alone. Times are shown in the viewer's browser timezone; leave backfill and
month boundaries use the organization's timezone (`common/time.ts`, daylight-saving safe).

### 3.5 Tax
Invoices carry no tax today. The accounting export defaults to "No GST" (NZ) / "No VAT" (UK) because most relief contractors are probably not
tax-registered; the query parameter overrides it. Confirm with an NZ accountant before relying on it.

---

## 4. Frontends

### 4.1 Two apps and two shared packages
`apps/web-admin` (staff) and `apps/worker-portal` (mobile-first workers), with `packages/api-client` (typed client + domain types + formatting
+ market helpers) and `packages/ui` (components). All HTTP goes through the client. Pages must show loading, error and empty states.
`packages/api-client` is consumed as TypeScript source (`transpilePackages`).

### 4.2 No service worker (yet)
The worker portal is installable (manifest + icons) but deliberately has no service worker: a stale offline cache is worse than none for a
booking app. Push notifications and offline support are open.

---

## 5. Process and quality

### 5.1 Order of work for a cross-cutting change (how NZ was done; repeat it for another market)
Backend first (markets module, migrations, services, tests), shared client second, then the two UIs in parallel, then an independent review.

### 5.2 Review loop
After each phase an independent reviewer agent audits read-only and reports ranked findings; fixes are made and re-tested before moving on.
Five rounds so far found real problems each time (tenant isolation, booking races, mixed-currency sums, a market-switch bypass...).
Keep doing this; it is the main reason the code is trustworthy.

### 5.3 Testing
- `apps/backend-api/test`: end-to-end tests against a real Postgres (`flexshift_test`, rebuilt every run) and a client-contract suite that
  runs the shared client over real HTTP. Never run two jest processes at once (shared database).
- Tests must `listen(0)` once and send requests to that URL. Passing the http server to supertest binds a throwaway port per request and
  caused random 401/404/503 (a ~12% flake rate) when a request hit a port another local service had taken.
- `apps/e2e-ui`: Playwright against system Chrome (`walkthrough.mjs` local, `live.mjs` browser against a deployed stack, `live-api.mjs`
  HTTP-level equivalent). On the owner's machine Chrome is blocked from the production address, so `live-api.mjs` is what runs there.

### 5.4 pnpm only, Node 22.13+
pnpm 11 requires Node 22.13+ (Docker/CI use node:22). The backend once had an npm lockfile npm 10 could not parse; pnpm is the single
manager. pnpm's `minimumReleaseAge` policy rejects packages published in the last day: pin an older version, do not relax the policy.

### 5.5 Migrations are SQL files made with `prisma migrate diff`
`prisma migrate dev` refuses to run non-interactively. See `CLAUDE.md` for the exact command (needs a `flexshift_shadow` database).
Never edit an applied migration (checksum): add a new one (for example `20261003080000_backfill_invoice_currency`).

---

## 6. Hosting

### 6.1 One small server with Docker Compose + Caddy (MVP)
Postgres, API, dashboard, worker portal and Caddy (automatic HTTPS) on one Hetzner server (~5 EUR/month), deployed from the laptop with
`deploy/push.sh` (rsync + `docker compose up --build`). *Why:* the API needs an always-on process (2.5); one box is the cheapest honest
setup while developing. *Rejected:* free tiers (sleep when idle, so the cascade timer stops); Vercel for everything (functions cannot keep
a timer; its free tier is non-commercial); Kubernetes/Terraform (premature).

### 6.2 Testing domain: sslip.io
`<ip-with-dashes>.sslip.io` gives `app.`, `work.`, `api.` names with real certificates and no purchase. Not for customers. A real domain
needs the three A records and `deploy/init-env.sh --domain <domain>`.

### 6.3 Location: Helsinki for now, AWS Auckland/Azure NZ North/Sydney later
The server is in Helsinki (about 250-300 ms from NZ). Accepted for testing; the owner expects to move to AWS when going live. The deploy is
provider-neutral (any Ubuntu host with Docker). NZ residency: hosting overseas is allowed under the NZ Privacy Act but IPP 12 puts due
diligence on the organization; get NZ privacy advice before storing real worker documents.

### 6.4 Compose project names must differ
The production compose project is `flexshift-prod`. It once shared the dev project name (`flexshift`) and a service name, so tearing the
production rehearsal down removed the dev Postgres container (the data volume survived). Check the project name before `down`.

### 6.5 Operational scripts take no secrets on the command line
`create-admin.sh` reads the password silently and sends it over SSH stdin. `init-env.sh` generates strong secrets locally into `deploy/.env`
(gitignored); `push.sh` sends it once and never overwrites the server's copy (changing the DB password or JWT secret would break the system).

---

## 7. Open decisions (not yet made)

Recorded so nobody builds one of these by default. When one is decided, move it into the right section above as a normal entry.

### 7.1 Who may verify a worker's documents (pending: owner with stakeholders / BA, raised in the PR #4 review, 2026-10-03)
**Today:** a document's `VERIFIED` status is global. Any organization that has the worker in scope can verify it, and that verification
counts at every other organization. Since document sharing (2.6) a worker can bring any organization into scope, by its id or a guessable code,
so the worker effectively chooses who verifies them, and one careless organization admin becomes a platform-wide trust problem.
**Options:**
1. *Leave it global* (status quo). No work. The trust problem stays; acceptable only while every organization on the platform is onboarded and known.
2. *Show booking organizations which organization verified each document* (for example "Identity verified by Kiwi Care Pharmacies"), so each
   organization can decide whether it trusts that. Small change. Cost: it tells one organization about the worker's dealings with another
   (privacy; also hidden today on purpose, see 2.6).
3. *Operator-only for the identity document* (or for all four base documents): organizations may review but only the platform operator's
   verification counts for identity. Small to medium change. Cost: the operator becomes a bottleneck again (the reason 2.6 path (2) exists).
4. *Per-organization verification*: each organization verifies for itself and the eligibility gate checks the booking organization's own
   verification (TODO.md). Largest change (schema, eligibility, both UIs). Cost: workers are re-checked by every organization they work for,
   which is how many agencies already work.
Options 2 and 3 are cheap stopgaps that can be combined; 4 is the long-term answer. Nothing is built until this is decided.
