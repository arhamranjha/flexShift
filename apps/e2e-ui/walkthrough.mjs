// Browser walkthrough of both apps against a running stack (API :4000, dashboard :3000, portal :3001).
//   pnpm seed && AUTH_THROTTLE_LIMIT=1000 node dist/main.js ; next start -p 3000 ; next start -p 3001
//   (the script logs in many times a minute, which the default login throttle of 10/min would reject)
//   pnpm --filter e2e-ui walkthrough
// Uses the system Chrome (no browser download). Screenshots go to $SHOTS (default /tmp/fs-ui).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const ADMIN = process.env.ADMIN_URL || 'http://localhost:3000';
const PORTAL = process.env.PORTAL_URL || 'http://localhost:3001';
const SHOTS = process.env.SHOTS || '/tmp/fs-ui';
const API = process.env.API_URL || 'http://localhost:4000';
const CHROME = process.env.CHROME || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const PW = 'FlexShiftPass2026!';
mkdirSync(SHOTS, { recursive: true });

const problems = [];
let passed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    problems.push(`${name}: ${e.message.split('\n')[0]}`);
    console.log(`  FAIL ${name}: ${e.message.split('\n')[0]}`);
  }
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function newPage(label, viewport) {
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`[${label}] console error: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] page error: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => {
    // 401 on /auth/me before sign-in and 403/404 from deliberate negative checks are expected
    if (r.status() >= 500) problems.push(`[${label}] ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return page;
}
// Wait until spinners/loading text are gone so screenshots show real content.
const settle = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByText(/^Loading/).first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
};
const shot = async (page, name) => { await settle(page); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
const heading = async (page, text) => page.getByRole('heading', { name: text }).first().waitFor({ timeout: 8000 });

// ---------------------------------------------------------------- dashboard
let createdTitle = '';
console.log('Dashboard (organization manager)');
{
  const page = await newPage('admin', { width: 1440, height: 900 });
  await step('unauthenticated visit redirects to /login', async () => {
    await page.goto(ADMIN + '/');
    await page.waitForURL('**/login', { timeout: 8000 });
  });
  await step('wrong password shows an error and stays on /login', async () => {
    await page.getByLabel('Email').fill('richmond.mgr@apexhealth.co.uk');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('alert').waitFor({ timeout: 5000 });
  });
  await step('manager signs in and lands on the overview', async () => {
    await page.getByLabel('Password').fill(PW);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(ADMIN + '/', { timeout: 10000 });
    await heading(page, 'Overview');
    await page.getByText(/Open vacancies/i).first().waitFor({ timeout: 8000 });
    await shot(page, 'admin-01-overview');
  });
  await step('session survives a reload (HttpOnly cookie, no token in storage)', async () => {
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    if (/eyJ/.test(stored)) throw new Error('a JWT is present in localStorage');
    await page.reload();
    await heading(page, 'Overview');
  });
  for (const [path, title] of [
    ['/rota', 'Multi-Branch Rota'], ['/shifts', 'Shifts'], ['/negotiations', 'Rate Negotiations'], ['/staff-bank', 'Staff Bank'],
    ['/workers', 'Relief Workers'], ['/compliance', 'Compliance'], ['/timesheets', 'Timesheets'], ['/leave', 'Leave'],
  ]) {
    await step(`${path} renders`, async () => {
      await page.goto(ADMIN + path);
      await heading(page, new RegExp(title, 'i'));
      await page.waitForLoadState('networkidle');
      await shot(page, `admin-${path.slice(1)}`);
    });
  }
  await step('manager cannot see Invoices/Settings in the nav', async () => {
    await page.goto(ADMIN + '/');
    const nav = await page.locator('aside nav').innerText();
    if (/Billing|Settings/.test(nav)) throw new Error('admin-only links visible to a branch manager');
  });
  await step('create a shift through the form', async () => {
    await page.goto(ADMIN + '/shifts');
    await page.getByRole('button', { name: /New shift/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const title = `UI walkthrough ${Date.now()}`;
    createdTitle = title;
    await dialog.getByLabel('Title').fill(title);
    const inTwoDays = new Date(Date.now() + 5 * 86400000);
    const fmt = (h) => { const d = new Date(inTwoDays); d.setHours(h, 0, 0, 0); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; };
    await dialog.getByLabel('Start', { exact: true }).fill(fmt(9));
    await dialog.getByLabel('End', { exact: true }).fill(fmt(17));
    await dialog.getByLabel(/Hourly rate/).fill('34');
    await shot(page, 'admin-shift-form');
    await dialog.getByRole('button', { name: /Create shift/ }).click();
    await page.getByText(title).first().waitFor({ timeout: 8000 });
    await shot(page, 'admin-shift-created');
  });
  await step('notification bell opens', async () => {
    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByText('Email me about important updates').waitFor({ timeout: 4000 }).catch(() => {}); // only when email is configured
    await page.keyboard.press('Escape');
  });
  await step('sign out returns to /login and the session is gone', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login', { timeout: 8000 });
    await page.goto(ADMIN + '/shifts');
    await page.waitForURL('**/login', { timeout: 8000 });
  });
  await page.context().close();
}

console.log('Dashboard (organization admin)');
{
  const page = await newPage('admin2', { width: 1440, height: 900 });
  await page.goto(ADMIN + '/login');
  await page.getByLabel('Email').fill('admin@apexhealth.co.uk');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(ADMIN + '/', { timeout: 10000 });
  for (const [path, title] of [['/invoices', 'Invoices'], ['/settings', 'Settings'], ['/staff-bank', 'Staff Bank']]) {
    await step(`${path} renders for an org admin`, async () => {
      await page.goto(ADMIN + path);
      await heading(page, new RegExp(title, 'i'));
      await page.waitForLoadState('networkidle');
      await shot(page, `admin2-${path.slice(1)}`);
    });
  }
  await step('branch picker lists both Apex branches', async () => {
    await page.goto(ADMIN + '/rota');
    await page.getByLabel('Branch').waitFor({ timeout: 8000 });
    const options = await page.getByLabel('Branch').locator('option').allInnerTexts();
    if (options.length < 3) throw new Error(`expected All + 2 branches, got ${options.join(' | ')}`);
  });
  await page.context().close();
}

// ---------------------------------------------------------------- worker portal
console.log('Worker portal (mobile viewport)');
{
  const page = await newPage('portal', { width: 390, height: 844 });
  await step('unauthenticated visit redirects to /login', async () => {
    await page.goto(PORTAL + '/feed');
    await page.waitForURL('**/login', { timeout: 8000 });
    await shot(page, 'portal-01-login');
  });
  await step('a staff account is refused by the portal', async () => {
    await page.getByLabel('Email').fill('richmond.mgr@apexhealth.co.uk');
    await page.getByLabel('Password').fill(PW);
    await page.getByRole('button', { name: /Sign in/ }).click();
    await page.getByText(/relief workers/i).first().waitFor({ timeout: 6000 });
  });
  await step('worker signs in and sees the feed', async () => {
    await page.getByLabel('Email').fill('sarah.y@flexrelief.co.uk');
    await page.getByLabel('Password').fill(PW);
    await page.getByRole('button', { name: /Sign in/ }).click();
    await page.waitForURL('**/feed', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await shot(page, 'portal-02-feed');
  });
  await step('feed tabs switch', async () => {
    for (const tab of ['Watching', 'Favourites', 'Emergencies', 'For you']) {
      await page.getByRole('button', { name: new RegExp(tab, 'i') }).first().click().catch(() => page.getByText(new RegExp(tab, 'i')).first().click());
      await page.waitForLoadState('networkidle');
    }
  });
  await step('open a shift from the feed', async () => {
    await page.getByRole('link').filter({ hasText: /£/ }).first().click();
    await page.waitForURL('**/shifts/**', { timeout: 8000 });
    await page.waitForLoadState('networkidle');
    await shot(page, 'portal-03-shift');
  });
  for (const path of ['/my-shifts', '/finance', '/profile']) {
    await step(`${path} renders`, async () => {
      await page.goto(PORTAL + path);
      await page.waitForLoadState('networkidle');
      await shot(page, `portal-${path.slice(1)}`);
      const body = await page.locator('body').innerText();
      if (/Application error|Unhandled/.test(body)) throw new Error('error screen shown');
    });
  }
  await step('worker is sent away from staff routes by the API (403 handled)', async () => {
    const status = await page.evaluate(async () => (await fetch('http://localhost:4000/branches', { credentials: 'include', headers: { 'X-FlexShift-App': 'worker', 'X-Requested-With': 'flexshift' } })).status);
    if (status !== 403) throw new Error(`expected 403, got ${status}`);
  });
  await page.context().close();
}

// ---------------------------------------------------------------- cross-app business flow
console.log('Negotiation round trip (worker portal <-> dashboard)');
{
  const worker = await newPage('flow-worker', { width: 390, height: 844 });
  const manager = await newPage('flow-manager', { width: 1440, height: 900 });
  await worker.goto(PORTAL + '/login');
  await worker.getByLabel('Email').fill('sarah.y@flexrelief.co.uk');
  await worker.getByLabel('Password').fill(PW);
  await worker.getByRole('button', { name: /Sign in/ }).click();
  await worker.waitForURL('**/feed', { timeout: 10000 });
  await manager.goto(ADMIN + '/login');
  await manager.getByLabel('Email').fill('richmond.mgr@apexhealth.co.uk');
  await manager.getByLabel('Password').fill(PW);
  await manager.getByRole('button', { name: 'Sign in' }).click();
  await manager.waitForURL(ADMIN + '/', { timeout: 10000 });

  await step('worker finds the new staff-bank shift (Tier 1 sees it first) and proposes a rate', async () => {
    await worker.goto(PORTAL + '/feed');
    await settle(worker);
    await worker.getByText(createdTitle).first().click();
    await worker.waitForURL('**/shifts/**', { timeout: 8000 });
    await worker.getByRole('button', { name: 'Negotiate rate' }).click();
    await worker.getByLabel(/Your proposed hourly rate/).fill('40');
    await shot(worker, 'flow-1-worker-negotiate');
    await worker.getByRole('button', { name: 'Send offer' }).click();
    await worker.getByText(/Offer sent/).first().waitFor({ timeout: 6000 });
  });
  await step('manager sees the proposal and sends a counter-offer', async () => {
    await manager.goto(ADMIN + '/negotiations');
    await settle(manager);
    await manager.getByRole('row').filter({ hasText: createdTitle }).getByRole('button', { name: /Respond/ }).click();
    await manager.getByLabel(/Counter-offer rate/).fill('36');
    await shot(manager, 'flow-2-manager-counter');
    await manager.getByRole('button', { name: 'Send counter' }).click();
    await manager.getByText(/Counter-offer sent/).first().waitFor({ timeout: 6000 });
  });
  await step('worker is notified, accepts the counter and is booked', async () => {
    await worker.reload();
    await settle(worker);
    await worker.getByText(/Counter offer|counter/i).first().waitFor({ timeout: 8000 });
    await worker.getByRole('button', { name: 'Accept and book' }).click();
    await worker.getByText('You are booked on this shift').first().waitFor({ timeout: 8000 });
    await shot(worker, 'flow-3-worker-booked');
  });
  await step('the manager rota now shows the worker on the shift', async () => {
    await manager.goto(ADMIN + '/shifts');
    await settle(manager);
    const row = manager.getByRole('row').filter({ hasText: createdTitle });
    await row.getByText('Booked').waitFor({ timeout: 6000 });
    await row.getByText(/Sarah/).waitFor({ timeout: 6000 });
    await shot(manager, 'flow-4-manager-booked');
  });
  await step('both sides received notifications', async () => {
    await manager.getByRole('button', { name: /Notifications/ }).click();
    await manager.getByText('New rate proposal').first().waitFor({ timeout: 6000 });
    await worker.getByRole('button', { name: /Notifications/ }).click();
    await worker.getByText(/Counter-offer/).first().waitFor({ timeout: 6000 });
  });
  await worker.context().close();
  await manager.context().close();
}

// ---------------------------------------------------------------- worker-initiated document sharing
console.log('Document sharing (new worker <-> organization admin)');
{
  const stamp = Date.now();
  const email = `share${stamp}@walkthrough.test`;
  const res = await fetch(API + '/auth/register/relief-worker', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'WorkerPass123!', firstName: 'Walk', lastName: 'Through', phone: '+64 21 555 0500', registrationNumber: `WLK-${stamp % 1e7}` }),
  });
  if (!res.ok) problems.push(`could not register the sharing worker: ${res.status}`);
  const worker = await newPage('share-worker', { width: 390, height: 844 });
  const admin = await newPage('share-admin', { width: 1440, height: 900 });
  await worker.goto(PORTAL + '/login');
  await worker.getByLabel('Email').fill(email);
  await worker.getByLabel('Password').fill('WorkerPass123!');
  await worker.getByRole('button', { name: /Sign in/ }).click();
  await worker.waitForURL('**/feed', { timeout: 10000 });
  await admin.goto(ADMIN + '/login');
  await admin.getByLabel('Email').fill('admin@apexhealth.co.uk');
  await admin.getByLabel('Password').fill(PW);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.waitForURL(ADMIN + '/', { timeout: 10000 });

  await step('an unverified worker is offered "ask this organization" on a shift page', async () => {
    await settle(worker);
    await worker.locator('a[href^="/shifts/"]').first().click();
    await worker.waitForURL('**/shifts/**', { timeout: 8000 });
    await worker.getByText('Not verified yet?').waitFor({ timeout: 8000 });
    await worker.getByRole('button', { name: /review me/ }).waitFor({ timeout: 6000 });
    await shot(worker, 'share-1-worker-shift-ask');
  });
  await step('the org admin can see the organization code to hand out', async () => {
    await admin.goto(ADMIN + '/settings');
    await settle(admin);
    await admin.getByText('APEX-UK').first().waitFor({ timeout: 8000 });
  });
  await step('worker asks by organization code from the profile', async () => {
    await worker.goto(PORTAL + '/profile');
    await settle(worker);
    await worker.getByLabel('Organization code').fill('apex-uk');
    await worker.getByRole('button', { name: 'Ask' }).click();
    await worker.getByText('Request sent').first().waitFor({ timeout: 6000 });
    await worker.getByText('Waiting for review').first().waitFor({ timeout: 6000 });
    await shot(worker, 'share-2-worker-asked');
  });
  await step('the org admin sees the request and adds the worker to the staff bank', async () => {
    await admin.goto(ADMIN + '/compliance');
    await settle(admin);
    const row = admin.getByRole('row').filter({ hasText: 'Walk Through' });
    await row.waitFor({ timeout: 8000 });
    await shot(admin, 'share-3-admin-requests');
    await row.getByRole('button', { name: 'Add to staff bank' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Add to staff bank' }).click();
    await admin.getByText(/added to the staff bank/).first().waitFor({ timeout: 6000 });
  });
  await step('the worker sees they are in the staff bank and was notified', async () => {
    await worker.reload();
    await settle(worker);
    await worker.getByText('In their staff bank').first().waitFor({ timeout: 8000 });
    await worker.getByRole('button', { name: /Notifications/ }).click();
    await worker.getByText(/added you to their staff bank/).first().waitFor({ timeout: 6000 });
    await shot(worker, 'share-4-worker-accepted');
  });
  await worker.context().close();
  await admin.context().close();
}

await browser.close();
console.log(`\n${passed} steps passed, ${problems.length} problem(s)`);
for (const p of problems) console.log(' - ' + p);
process.exit(problems.length ? 1 : 0);
