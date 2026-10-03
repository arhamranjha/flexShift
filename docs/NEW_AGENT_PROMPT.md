# Prompt for a new agent (or a new Claude account)

Paste the block below as the **first message** in a fresh Claude Code session opened in the repository root. It points the agent at the
documentation that carries all the context (architecture, decisions, live deployment, pending work) and sets the working rules. Nothing
else from the previous conversation is needed.

---

````text
You are picking up an existing project: FlexShift, a healthcare workforce platform for New Zealand (UK also supported). A lot of work
has already been done by other agents; your job is to continue it safely, not to start over.

Before doing anything else, read these in order and then summarise back to me in under 300 words: what the product is, what is built, what is
live on the server, what is pending, and the three decisions you consider most important to respect.
  1. CLAUDE.md                 (how to work in the code: commands, architecture rules, traps)
  2. docs/HANDOFF.md           (current state, the live test server and how to operate it, pending work, sharp edges)
  3. docs/DECISIONS.md         (why things are built this way, what was rejected, what each choice costs)
  4. TODO.md                   (everything open; tick only what you have verified)
  5. deploy/DEPLOY.md          (production deployment and server commands)

Working rules (these were agreed with the owner):
- Do NOT push, merge, deploy, or touch the production server (204.168.199.75) or its data without asking me first. A local, reversible
  change and a local commit on a branch are fine; anything outward-facing needs my explicit go-ahead.
- Production holds real data (one organization, a super admin, a test worker). Never wipe it. Test data you create on the server must be
  clearly named (`ZZ ...`, `@livetest.invalid`), removed afterwards with a narrowly scoped delete that you preview first, and a backup
  (`flexshift backup` on the server) taken before any release with migrations.
- Never commit or paste secrets (deploy/.env, SSH keys, passwords, tokens). If you need a credential, ask me.
- Naming mandate: never write the legacy/competitor product name described in FlexShift_Execution_Plan_and_Review_Loop.md anywhere
  (code, docs, UI). Reviews grep for it.
- Keep the quality loop: plan, build in phases, run `pnpm lint` and `pnpm test:backend` (do not run two jest processes at once), verify
  UI changes in a real browser where possible (apps/e2e-ui), then run an independent read-only reviewer agent and fix its findings
  before moving on. Update TODO.md, docs/HANDOFF.md and docs/DECISIONS.md whenever you change something they describe, including the
  reasons for any decision.
- Money is never formatted with an assumed currency and never summed across currencies (docs/DECISIONS.md section 3.2). Tenant checks go through
  AccessService (section 2.2). Booking goes through the eligibility gate (section 2.3).
- Do not use organization/company integrations (Jira, Slack, Microsoft, GitLab, etc.) for this project unless I ask.

Then ask me what I want to work on next, and offer the top three items from "What is pending" in docs/HANDOFF.md.
````

---

## Notes for the owner
- **Secrets are not in the repo.** Move the SSH key (`~/.ssh/flexshift`) and `deploy/.env` to the new machine/account yourself (for example via a
  password manager). Never paste them into a chat.
- **If the new agent is on a different machine:** `git clone` the repository, then `pnpm install` (Node 22.13+). Local setup is in the README.
- **To resume the old conversation on the same Mac:** `claude --resume` lists local sessions for this folder (history is stored locally under
  `~/.claude/projects/`). A different machine cannot see it; that is what the docs are for.
- Keep this file current: if the working rules change, change them here and in `CLAUDE.md`.
