// Same shift lifecycle as live.mjs but over plain HTTPS requests (no browser), against a DEPLOYED stack:
//   first sign-in with a temporary password -> shift posted -> worker registers and uploads documents -> manager verifies ->
//   instant book -> clock in/out -> approval -> invoice paid -> finance.
// It behaves like the browser apps: session cookies per app, X-Requested-With, Origin headers, a CORS preflight.
//   DOMAIN=204-168-199-75.sslip.io ADMIN_EMAIL=.. ADMIN_TEMP=.. MGR_EMAIL=.. MGR_TEMP=.. node live-api.mjs
const need = (k) => process.env[k] || (() => { throw new Error(`Set ${k}`); })();
const DOMAIN = need('DOMAIN');
const ADMIN_EMAIL = need('ADMIN_EMAIL'), ADMIN_TEMP = need('ADMIN_TEMP');
const MGR_EMAIL = need('MGR_EMAIL'), MGR_TEMP = need('MGR_TEMP');
const API = `https://api.${DOMAIN}`, APP = `https://app.${DOMAIN}`, WORK = `https://work.${DOMAIN}`;
const NEW_PW = 'Live-Test-Passw0rd!';
const STAMP = Date.now();
const TITLE = `Live API test shift ${STAMP}`;

let passed = 0;
const problems = [];
const log = (ok, name, extra = '') => console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
async function step(name, fn) {
  const t0 = Date.now();
  try { const r = await fn(); passed++; log(true, name, `${((Date.now() - t0) / 1000).toFixed(1)}s`); return r; }
  catch (e) { problems.push(`${name}: ${e.message}`); log(false, name, e.message); throw e; }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

/** A browser stand-in: one cookie jar per app, sending the headers the real frontends send. */
class Client {
  constructor(app, origin) { this.app = app; this.origin = origin; this.jar = {}; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(method, path, body, { raw = false, form } = {}) {
    const headers = { Origin: this.origin, 'X-FlexShift-App': this.app, 'X-Requested-With': 'flexshift' };
    if (this.cookieHeader()) headers.Cookie = this.cookieHeader();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      this.jar[k] = v;
      this.lastSetCookie = c;
      if (/Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(attrs.join(';'))) delete this.jar[k];
    }
    if (raw) return res;
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) { const e = new Error(`${method} ${path} -> ${res.status} ${typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data).slice(0, 200)}`); e.status = res.status; throw e; }
    return data;
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b ?? {}); }
  patch(p, b) { return this.req('PATCH', p, b ?? {}); }
}

const manager = new Client('admin', APP), admin = new Client('admin', APP), worker = new Client('worker', WORK);

async function firstLogin(c, email, temp) {
  let res;
  try { res = await c.req('POST', '/auth/login', { email, password: temp }); }
  catch (e) {
    // Re-run: a previous run already replaced the temporary password.
    if (e.status !== 401) throw e;
    res = await c.req('POST', '/auth/login', { email, password: NEW_PW });
    console.log('       (temporary password already changed by an earlier run)');
    return c.get('/auth/me');
  }
  assert(res.user.mustChangePassword === true, 'temporary password should force a change');
  assert(/HttpOnly/i.test(c.lastSetCookie) && /Secure/i.test(c.lastSetCookie) && /SameSite=Lax/i.test(c.lastSetCookie), `cookie flags wrong: ${c.lastSetCookie}`);
  try { await c.get('/branches'); throw new Error('API usable before the password change'); } catch (e) { assert(e.status === 403, e.message); }
  await c.post('/auth/change-password', { currentPassword: temp, newPassword: NEW_PW });
  const me = await c.get('/auth/me');
  assert(me.mustChangePassword === false, 'flag should be cleared');
  return me;
}

let me, shift, timesheet;
try {
  console.log(`Live stack: ${API}`);

  await step('CORS preflight from the dashboard origin is allowed, a foreign origin is not', async () => {
    const ok = await fetch(`${API}/auth/login`, { method: 'OPTIONS', headers: { Origin: APP, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-requested-with,x-flexshift-app' } });
    assert(ok.headers.get('access-control-allow-origin') === APP && ok.headers.get('access-control-allow-credentials') === 'true', 'dashboard origin not allowed');
    const bad = await fetch(`${API}/auth/login`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert(!bad.headers.get('access-control-allow-origin'), 'foreign origin was allowed');
  });
  await step('markets are public and New Zealand is the default', async () => {
    const m = await (await fetch(`${API}/markets`)).json();
    assert(m.default === 'NZ' && m.markets.some((x) => x.code === 'NZ' && x.currency === 'NZD'), 'NZ market missing');
  });
  await step('security headers present on the frontends', async () => {
    for (const u of [`${APP}/login`, `${WORK}/login`]) {
      const r = await fetch(u);
      assert(r.status === 200, `${u} -> ${r.status}`);
      assert(r.headers.get('strict-transport-security') && r.headers.get('x-frame-options') === 'DENY', `${u} missing security headers`);
    }
  });
  await step('org admin: first sign-in forces a password change (cookie is Secure+HttpOnly)', () => firstLogin(admin, ADMIN_EMAIL, ADMIN_TEMP));
  me = await step('manager: first sign-in forces a password change', () => firstLogin(manager, MGR_EMAIL, MGR_TEMP));
  const branchId = me.managedBranch?.id; assert(branchId, 'manager has no branch');

  await step('cookie-authenticated writes need the CSRF header', async () => {
    const res = await fetch(`${API}/shifts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: manager.cookieHeader(), 'X-FlexShift-App': 'admin' }, body: '{}' });
    assert(res.status === 403, `expected 403 without X-Requested-With, got ${res.status}`);
  });

  shift = await step('manager posts a public instant-book shift starting in two minutes', async () => {
    const start = new Date(Date.now() + 2 * 60_000);
    const s = await manager.post('/shifts', { branchId, title: TITLE, startTime: start.toISOString(), endTime: new Date(start.getTime() + 3 * 3600_000).toISOString(), hourlyRate: 35, visibility: 'PUBLIC_MARKETPLACE', instantBookEnabled: true });
    assert(s.currency === 'NZD', `new shift currency is ${s.currency}`);
    s.start = start; return s;
  });

  const wEmail = `live-worker-${STAMP}@livetest.invalid`;
  await step('worker registers and gets a session cookie for the worker app', async () => {
    const r = await worker.post('/auth/register/relief-worker', { email: wEmail, password: NEW_PW, firstName: 'Live', lastName: 'Tester', phone: '+64 21 555 0199', registrationNumber: `LIVE-${STAMP}`.slice(0, 20), profession: 'Pharmacist' });
    assert(r.user.role === 'RELIEF_WORKER', 'wrong role');
    assert((await worker.get('/auth/me')).email === wEmail, 'worker cookie did not authenticate');
    try { await manager.req('GET', '/auth/me', undefined, {}); } catch { throw new Error('manager session lost'); }
    // the worker app's cookie must not authenticate the dashboard app
    const crossApp = new Client('admin', APP); crossApp.jar = { ...worker.jar };
    try { await crossApp.get('/auth/me'); throw new Error('worker cookie worked for the admin app'); } catch (e) { assert(e.status === 401, e.message); }
  });

  const profile = (await worker.get('/auth/me')).reliefProfile;
  const docIds = await step('worker uploads the four mandatory documents (multipart over HTTPS)', async () => {
    const ids = [];
    const expiry = new Date(Date.now() + 400 * 86400_000).toISOString().slice(0, 10);
    // the four every worker needs, plus the practising certificate New Zealand organizations require
    for (const type of ['IDENTITY', 'RIGHT_TO_WORK', 'DBS_POLICE_CHECK', 'INDEMNITY_INSURANCE', 'PRACTISING_CERTIFICATE']) {
      const form = new FormData();
      form.append('type', type); form.append('expiresAt', expiry);
      form.append('file', new Blob(['%PDF-1.4 live test'], { type: 'application/pdf' }), `${type}.pdf`);
      ids.push((await worker.req('POST', `/relief-workers/${profile.id}/documents`, undefined, { form })).id);
    }
    return ids;
  });

  await step('worker cannot book yet, the manager sees four pending documents and verifies them', async () => {
    try { await worker.post(`/shifts/${shift.id}/instant-book`); throw new Error('booked without verified documents'); } catch (e) { assert(e.status === 403, e.message); }
    const orgBefore = await manager.get(`/organizations/${me.organizationId}`).catch(() => null);
    assert(orgBefore === null || orgBefore.currency === 'NZD', 'organization is not in the NZD market');
    // A self-registered worker is invisible to organizations until one invites them: look them up by their
    // registration number and add them to the staff bank, which brings them (and their documents) into scope.
    const before = await manager.get('/relief-workers/documents/queue');
    assert(!docIds.some((id) => before.some((d) => d.id === id)), 'an unrelated worker\'s documents were visible to the manager');
    const found = await manager.get(`/relief-workers/lookup?registrationNumber=${encodeURIComponent(`LIVE-${STAMP}`.slice(0, 20))}`);
    await manager.post('/staff-bank', { reliefWorkerId: found.id, branchId, tier: 'TIER_1_PREFERRED' });
    const queue = await manager.get('/relief-workers/documents/queue');
    assert(docIds.every((id) => queue.some((d) => d.id === id)), 'documents missing from the compliance queue');
    for (const id of docIds) await manager.patch(`/relief-workers/documents/${id}/verify`, { status: 'VERIFIED' });
    const doc = await worker.req('GET', `/relief-workers/documents/${docIds[0]}/file`, undefined, { raw: true });
    assert(doc.status === 200 && (await doc.text()).startsWith('%PDF'), 'uploaded document not retrievable');
  });

  await step('worker sees the shift in the feed and instant-books it', async () => {
    const feed = await worker.get('/shifts/feed?tab=for_you');
    assert(feed.some((s) => s.id === shift.id), 'shift not in the worker feed');
    const booked = await worker.post(`/shifts/${shift.id}/instant-book`);
    assert(booked.status === 'BOOKED', `status ${booked.status}`);
  });

  await step('worker clocks in', async () => { const s = await worker.post('/timesheets/clock-in', { shiftId: shift.id }); assert(s.status === 'IN_PROGRESS', 'not in progress'); });

  timesheet = await step('worker clocks out after a billable minute, creating the timesheet', async () => {
    const wait = shift.start.getTime() + 75_000 - Date.now();
    if (wait > 0) { console.log(`       (waiting ${Math.ceil(wait / 1000)}s for one billable minute)`); await new Promise((r) => setTimeout(r, wait)); }
    const ts = await worker.post('/timesheets/clock-out', { shiftId: shift.id, breakMinutes: 0, notes: 'live test' });
    assert(ts.status === 'SUBMITTED', ts.status); return ts;
  });

  const approved = await step('manager approves the timesheet; an invoice is issued', async () => {
    const r = await manager.patch(`/timesheets/${timesheet.id}/approve`);
    assert(/^INV-\d{8}-[0-9A-F]{6}$/.test(r.invoice.invoiceNumber), 'bad invoice number');
    assert(r.invoice.currency === 'NZD', `invoice currency is ${r.invoice.currency}`); return r;
  });
  const orgId = me.organizationId;

  await step('org admin exports the payment batch and the accounting file, then marks the invoice paid', async () => {
    const csv = await admin.req('GET', `/invoices/organization/${orgId}/export.csv`, undefined, { raw: true });
    assert((await csv.text()).includes(approved.invoice.invoiceNumber), 'invoice missing from the payment batch');
    const acc = await admin.req('GET', `/invoices/organization/${orgId}/accounting.csv`, undefined, { raw: true });
    assert((await acc.text()).includes(approved.invoice.invoiceNumber), 'invoice missing from the accounting export');
    const paid = await admin.patch(`/invoices/${approved.invoice.id}/pay`, { paymentReference: 'LIVE-TEST-0001' });
    assert(paid.status === 'PAID', paid.status);
  });

  await step('worker sees the payment in Finance; tenants stay separate', async () => {
    const f = await worker.get('/invoices/my-finance');
    assert(f.totalEarned > 0 && f.invoices.some((i) => i.status === 'PAID'), 'payment not visible to the worker');
    assert(f.byCurrency.length === 1 && f.byCurrency[0].currency === 'NZD', 'finance totals are not per currency');
    const others = await manager.get('/branches');
    assert(others.length === 1 && others[0].id === branchId, 'manager sees other branches');
  });

  await step('sign out revokes the session', async () => {
    await manager.post('/auth/logout');
    try { await manager.get('/auth/me'); throw new Error('still signed in'); } catch (e) { assert(e.status === 401, e.message); }
  });
} catch {
  /* the failing step already printed itself */
}

console.log(`\n${passed} steps passed, ${problems.length} problem(s)`);
for (const p of problems) console.log(' - ' + p);
console.log(`Test data: worker live-worker-${STAMP}@livetest.invalid, shift "${TITLE}"`);
process.exit(problems.length ? 1 : 0);
