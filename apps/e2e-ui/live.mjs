// Full shift lifecycle in a real browser against a DEPLOYED stack (HTTPS, three subdomains, real cookies):
//   manager first sign-in -> posts a shift -> worker registers, uploads documents -> manager verifies them ->
//   worker instant-books, clocks in and out -> manager approves the timesheet -> admin pays the invoice.
//
// It needs a throwaway organization created beforehand (deploy/create-org.sh) and its temporary passwords:
//   DOMAIN=204-168-199-75.sslip.io ADMIN_EMAIL=.. ADMIN_TEMP=.. MGR_EMAIL=.. MGR_TEMP=.. node live.mjs
// Screenshots go to $SHOTS (default /tmp/fs-live). It takes about 6 minutes (clock-out needs a minute of worked time).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const need = (k) => process.env[k] || (() => { throw new Error(`Set ${k}`); })();
const DOMAIN = need('DOMAIN');
const ADMIN_EMAIL = need('ADMIN_EMAIL'), ADMIN_TEMP = need('ADMIN_TEMP');
const MGR_EMAIL = need('MGR_EMAIL'), MGR_TEMP = need('MGR_TEMP');
const APP = `https://app.${DOMAIN}`, WORK = `https://work.${DOMAIN}`;
const SHOTS = process.env.SHOTS || '/tmp/fs-live';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NEW_PW = 'Live-Test-Passw0rd!';
const STAMP = Date.now();
const WORKER_EMAIL = `live-worker-${STAMP}@livetest.invalid`;
const TITLE = `Live test shift ${STAMP}`;
mkdirSync(SHOTS, { recursive: true });

const problems = [];
let passed = 0;
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { problems.push(`${name}: ${e.message.split('\n')[0]}`); console.log(`  FAIL ${name}: ${e.message.split('\n')[0]}`); throw e; }
};

// a tiny valid PDF for the uploads
const pdf = `/tmp/live-doc-${STAMP}.pdf`;
writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const open = async (label, viewport) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`[${label}] console: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message.slice(0, 160)}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`[${label}] ${r.status()} ${r.request().method()} ${r.url()}`); });
  return page;
};
const settle = async (p) => {
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.getByText(/^Loading/).first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
};
const shot = async (p, n) => { await settle(p); await p.screenshot({ path: `${SHOTS}/${n}.png` }); };
const local = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

async function firstLogin(page, email, temp) {
  await page.goto(APP + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(temp);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/change-password', { timeout: 15000 });
  await page.getByLabel('Current password').fill(temp);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PW);
  await page.getByLabel('Confirm new password').fill(NEW_PW);
  await page.getByRole('button', { name: 'Update password' }).click();
  await page.waitForURL(APP + '/', { timeout: 15000 });
}

try {
  const manager = await open('manager', { width: 1440, height: 900 });
  const admin = await open('admin', { width: 1440, height: 900 });
  const worker = await open('worker', { width: 390, height: 844 });
  let shiftStart;

  console.log(`Live stack: ${APP}`);
  await step('org admin: temporary password forces a change, then lands on the dashboard', async () => { await firstLogin(admin, ADMIN_EMAIL, ADMIN_TEMP); await shot(admin, '01-admin-home'); });
  await step('manager: temporary password forces a change, then lands on the dashboard', async () => { await firstLogin(manager, MGR_EMAIL, MGR_TEMP); await shot(manager, '02-manager-home'); });

  await step('manager posts an instant-book public shift starting in two minutes', async () => {
    await manager.goto(APP + '/shifts');
    await manager.getByRole('button', { name: /New shift/i }).first().click();
    const d = manager.getByRole('dialog');
    await d.getByLabel('Title').fill(TITLE);
    shiftStart = new Date(Date.now() + 2 * 60_000);
    await d.getByLabel('Start', { exact: true }).fill(local(shiftStart));
    await d.getByLabel('End', { exact: true }).fill(local(new Date(shiftStart.getTime() + 3 * 3600_000)));
    await d.getByLabel(/Hourly rate/).fill('35');
    await d.getByLabel('Visibility').selectOption('PUBLIC_MARKETPLACE');
    await d.getByLabel('Instant book').check();
    await d.getByRole('button', { name: /Create shift/ }).click();
    await manager.getByText(TITLE).first().waitFor({ timeout: 10000 });
    await shot(manager, '03-shift-posted');
  });

  await step('worker registers on the portal (two-step form)', async () => {
    await worker.goto(WORK + '/register');
    await worker.getByLabel('First name').fill('Live');
    await worker.getByLabel('Last name').fill('Tester');
    await worker.getByLabel('Email').fill(WORKER_EMAIL);
    await worker.getByLabel('Phone').fill('+64 21 555 0199');
    await worker.getByLabel('Password').fill(NEW_PW);
    await worker.getByRole('button', { name: 'Continue' }).click();
    await worker.getByLabel('Registration number').fill(`LIVE-${STAMP}`.slice(0, 20));
    await worker.getByLabel('Profession').fill('Pharmacist');
    await worker.getByRole('button', { name: 'Create account' }).click();
    await worker.waitForURL('**/profile**', { timeout: 15000 });
    await shot(worker, '04-worker-profile');
  });

  const docs = ['Identity', 'Right to Work', 'Dbs Police Check', 'Indemnity Insurance'];
  await step('worker uploads the four mandatory documents', async () => {
    const expiry = new Date(Date.now() + 400 * 86400_000).toISOString().slice(0, 10);
    for (const name of docs) {
      await worker.goto(WORK + '/profile');
      await settle(worker);
      const card = worker.locator('div, section, article').filter({ has: worker.getByText(name, { exact: true }) }).filter({ has: worker.getByRole('button', { name: /Upload/ }) }).last();
      await card.getByRole('button', { name: /Upload/ }).click();
      const dlg = worker.getByRole('dialog');
      await dlg.getByLabel('Expiry date').fill(expiry);
      await dlg.locator('input[type=file]').setInputFiles(pdf);
      await dlg.getByRole('button', { name: 'Upload', exact: true }).click();
      await dlg.waitFor({ state: 'hidden', timeout: 10000 });
    }
    await worker.goto(WORK + '/profile');
    await shot(worker, '05-worker-docs-pending');
  });

  await step('manager verifies each document in the compliance desk', async () => {
    await manager.goto(APP + '/compliance');
    await settle(manager);
    for (let i = 0; i < docs.length; i++) {
      await manager.getByRole('button', { name: 'Review' }).first().click();
      if (i === 0) await shot(manager, '06-compliance-review');
      await manager.getByRole('button', { name: 'Verify' }).click();
      await manager.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10000 });
      await settle(manager);
    }
    await shot(manager, '07-compliance-done');
  });

  await step('worker is now verified and instant-books the shift', async () => {
    await worker.goto(WORK + '/profile');
    await worker.getByText(/Verified/).first().waitFor({ timeout: 8000 });
    await worker.goto(WORK + '/feed');
    await settle(worker);
    await worker.getByText(TITLE).first().click();
    await worker.getByRole('button', { name: /Instant Book/ }).click();
    await worker.getByRole('button', { name: 'Book now' }).click();
    await worker.getByText('You are booked on this shift').first().waitFor({ timeout: 10000 });
    await shot(worker, '08-worker-booked');
  });

  await step('worker clocks in', async () => {
    await worker.getByRole('button', { name: 'Clock in' }).click();
    await worker.getByText(/Clocked in at/).first().waitFor({ timeout: 10000 });
    await shot(worker, '09-worker-clocked-in');
  });

  await step('worker clocks out after a minute of worked time and submits the timesheet', async () => {
    const readyAt = shiftStart.getTime() + 75_000; // billing starts at the scheduled start
    const wait = readyAt - Date.now();
    if (wait > 0) { console.log(`       (waiting ${Math.ceil(wait / 1000)}s for one billable minute)`); await worker.waitForTimeout(wait); }
    await worker.getByRole('button', { name: 'Clock out and submit' }).click();
    await worker.getByText(/timesheet submitted|Timesheet/i).first().waitFor({ timeout: 10000 });
    await shot(worker, '10-worker-clocked-out');
  });

  await step('manager approves the timesheet and an invoice is issued', async () => {
    await manager.goto(APP + '/timesheets');
    await settle(manager);
    await manager.getByRole('button', { name: 'Review' }).first().click();
    await manager.getByRole('button', { name: 'Approve', exact: true }).click();
    await manager.getByRole('button', { name: /Approve and generate invoice/ }).click();
    await manager.getByText(/Invoice INV-/).first().waitFor({ timeout: 10000 });
    await shot(manager, '11-timesheet-approved');
  });

  await step('org admin marks the invoice as paid', async () => {
    await admin.goto(APP + '/invoices');
    await settle(admin);
    await admin.getByRole('button', { name: 'Mark paid' }).first().click();
    await admin.getByLabel('Payment reference').fill('LIVE-TEST-0001');
    await admin.getByRole('dialog').getByRole('button', { name: 'Mark paid' }).click();
    await admin.getByText(/marked as paid/).first().waitFor({ timeout: 10000 });
    await shot(admin, '12-invoice-paid');
  });

  await step('worker sees the paid invoice in Finance', async () => {
    await worker.goto(WORK + '/finance');
    await settle(worker);
    await worker.getByText(/Paid|PAID/).first().waitFor({ timeout: 8000 });
    await shot(worker, '13-worker-finance');
  });

  await step('sign out ends the session on both apps', async () => {
    await manager.getByRole('button', { name: 'Sign out' }).click();
    await manager.waitForURL('**/login', { timeout: 10000 });
    await manager.goto(APP + '/shifts');
    await manager.waitForURL('**/login', { timeout: 10000 });
  });
} catch {
  /* the failing step already logged itself */
} finally {
  await browser.close();
}

console.log(`\n${passed} steps passed, ${problems.length} problem(s)`);
for (const p of problems) console.log(' - ' + p);
console.log(`Test data: worker ${WORKER_EMAIL}, shift "${TITLE}"`);
process.exit(problems.length ? 1 : 0);
