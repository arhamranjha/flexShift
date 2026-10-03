import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { JobsService } from '../src/jobs/jobs.service';
import { MailerService } from '../src/notifications/mailer.service';
import { createOrganization } from '../src/cli/create-org';
import { zonedTime } from '../src/common/time';

const PW = 'FlexShiftPass2026!';
const DAY = 86_400_000;

let app: INestApplication;
let prisma: PrismaService;
// Listen once and send every request to that one URL. Passing the http.Server to supertest instead makes it
// bind a throwaway ephemeral port per request and close it afterwards; with concurrent requests a call can land
// on a port that has just closed (and may now belong to some other local service), giving random 401/404/503s.
let baseUrl: string;
const api = () => request(baseUrl);

async function login(email: string, password = PW) {
  const r = await api().post('/auth/login').send({ email, password }).expect(200);
  return r.body.accessToken as string;
}
const get = (t: string, url: string) => api().get(url).set('Authorization', `Bearer ${t}`);
const post = (t: string, url: string, body?: object) => api().post(url).set('Authorization', `Bearer ${t}`).send(body);
const patch = (t: string, url: string, body?: object) => api().patch(url).set('Authorization', `Bearer ${t}`).send(body);

/** UTC time `days` from now at `hour`:00. */
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

let superT: string, adminT: string, richmondT: string, beckenhamT: string, sarahT: string, davidT: string;
let richmondId: string, beckenhamId: string, barkingId: string, apexId: string, crestId: string;
let sarahId: string, davidId: string;

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configureApp(app);
  await app.listen(0);
  baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  prisma = app.get(PrismaService);

  [superT, adminT, richmondT, beckenhamT, sarahT, davidT] = await Promise.all([
    login('super@flexshift.io'),
    login('admin@apexhealth.co.uk'),
    login('richmond.mgr@apexhealth.co.uk'),
    login('beckenham.mgr@crestpharmacy.co.uk'),
    login('sarah.y@flexrelief.co.uk'),
    login('david.i@flexrelief.co.uk'),
  ]);
  const branches = (await get(superT, '/branches').expect(200)).body;
  const byCode = (c: string) => branches.find((b: any) => b.branchCode === c);
  richmondId = byCode('APEX-RCH-01').id;
  beckenhamId = byCode('CRST-BCK-02').id;
  barkingId = byCode('APEX-BRK-03').id;
  apexId = byCode('APEX-RCH-01').organization.id;
  crestId = byCode('CRST-BCK-02').organization.id;
  sarahId = (await get(sarahT, '/auth/me')).body.reliefProfile.id;
  davidId = (await get(davidT, '/auth/me')).body.reliefProfile.id;
});

afterAll(async () => {
  await app.close();
});

const newShift = (token: string, over: Record<string, unknown> = {}) =>
  post(token, '/shifts', {
    branchId: richmondId,
    title: 'Test shift',
    startTime: at(10, 9),
    endTime: at(10, 17),
    hourlyRate: 30,
    visibility: 'PUBLIC_MARKETPLACE',
    ...over,
  });

describe('auth', () => {
  it('rejects bad credentials and unknown fields', async () => {
    await api().post('/auth/login').send({ email: 'sarah.y@flexrelief.co.uk', password: 'nope' }).expect(401);
    await api().post('/auth/login').send({ email: 'sarah.y@flexrelief.co.uk', password: PW, admin: true }).expect(400);
  });

  it('requires a token', async () => {
    await api().get('/shifts/feed').expect(401);
  });

  it('logout revokes previously issued tokens', async () => {
    const t = await login('david.i@flexrelief.co.uk');
    await get(t, '/auth/me').expect(200);
    await post(t, '/auth/logout').expect(200);
    await get(t, '/auth/me').expect(401);
    davidT = await login('david.i@flexrelief.co.uk'); // fresh session for later tests
  });
});

describe('tenant isolation', () => {
  it('managers only see their own branch', async () => {
    const r = await get(richmondT, '/branches').expect(200);
    expect(r.body.map((b: any) => b.id)).toEqual([richmondId]);
    await get(richmondT, `/branches/${beckenhamId}`).expect(404);
    await get(richmondT, `/branches/${beckenhamId}/rota`).expect(404);
    await get(richmondT, `/branches/${barkingId}`).expect(404); // same org, other branch
  });

  it('org admins see their org branches only', async () => {
    const r = await get(adminT, '/branches').expect(200);
    expect(r.body.map((b: any) => b.id).sort()).toEqual([richmondId, barkingId].sort());
    await get(adminT, `/branches?organizationId=${crestId}`).expect(200).then((x) => expect(x.body.length).toBe(2));
  });

  it('blocks cross-org reads', async () => {
    await get(adminT, `/staff-bank/organization/${crestId}`).expect(403);
    await get(adminT, `/invoices/organization/${crestId}`).expect(403);
    await get(adminT, `/organizations/${crestId}`).expect(403);
    await get(beckenhamT, `/staff-bank/organization/${apexId}`).expect(403);
    await get(richmondT, `/timesheets/branch/${beckenhamId}`).expect(404);
    await get(richmondT, `/leave/branch/${beckenhamId}`).expect(404);
    expect((await get(adminT, '/organizations').expect(200)).body.map((o: any) => o.id)).toEqual([apexId]);
  });

  it('blocks cross-org writes', async () => {
    await newShift(richmondT, { branchId: beckenhamId }).expect(404);
    await post(richmondT, '/staff-bank', { organizationId: crestId, reliefWorkerId: sarahId }).expect(403);
    const s = (await get(beckenhamT, `/shifts?branchId=${beckenhamId}`).expect(200)).body[0];
    await get(richmondT, `/shifts/${s.id}`).expect(404);
    await patch(richmondT, `/shifts/${s.id}/status`, { status: 'CANCELLED' }).expect(404);
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(404);
  });

  it('workers cannot use staff endpoints or touch other workers', async () => {
    await get(sarahT, '/branches').expect(403);
    await get(sarahT, `/relief-workers/${davidId}`).expect(403);
    await get(sarahT, '/relief-workers').expect(403);
    await api()
      .post(`/relief-workers/${davidId}/documents`)
      .set('Authorization', `Bearer ${sarahT}`)
      .field('type', 'OTHER')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(403);
    await get(sarahT, `/relief-workers/${sarahId}`).expect(200);
  });

  it('org admins cannot create staff or branches in another org', async () => {
    const b = await post(adminT, '/branches', {
      organizationId: crestId, name: 'Sneaky', branchCode: 'SNEAK-01', addressLine1: '1 Rd', city: 'X', postcode: 'AB1 2CD', phone: '0123456789',
    }).expect(201);
    expect(b.body.organizationId).toBe(apexId); // forced to the caller's own org
    await post(adminT, '/users', { email: 'x@y.co.uk', role: 'FACILITY_MANAGER', organizationId: crestId, branchId: beckenhamId }).expect(400);
  });
});

describe('visibility and eligibility', () => {
  it('staff-bank-only shifts are hidden from non-members', async () => {
    const titles = async (t: string) => (await get(t, '/shifts/feed').expect(200)).body.map((s: any) => s.title);
    expect(await titles(sarahT)).toContain('Staff Bank Pharmacist (Weekday)');
    expect(await titles(davidT)).not.toContain('Staff Bank Pharmacist (Weekday)');
    expect(await titles(davidT)).toContain('Open Marketplace Relief Pharmacist');
  });

  it('non-members cannot see, apply for or watch a staff-bank-only shift', async () => {
    const s = (await get(richmondT, '/shifts?status=OPEN').expect(200)).body.find((x: any) => x.title.startsWith('Staff Bank'));
    await get(davidT, `/shifts/${s.id}`).expect(404);
    await post(davidT, `/shifts/${s.id}/apply`, {}).expect(404);
    await post(davidT, `/relief-workers/me/watch-shift/${s.id}`).expect(404);
    await post(sarahT, `/shifts/${s.id}/apply`, { notes: 'happy to help' }).expect(201);
    await post(sarahT, `/shifts/${s.id}/apply`, {}).expect(400); // duplicate
  });

  it('enforces required systems and accreditations', async () => {
    const s = (await get(superT, '/shifts?status=OPEN').expect(200)).body.find((x: any) => x.title.startsWith('Emergency Overnight'));
    const r = await post(davidT, `/shifts/${s.id}/instant-book`).expect(403); // needs Nexphase, David lacks it
    expect(JSON.stringify(r.body)).toMatch(/Nexphase/);
  });

  it('only org admins may override skills when assigning', async () => {
    const s = (await get(superT, '/shifts?status=OPEN').expect(200)).body.find((x: any) => x.title.startsWith('Emergency Overnight'));
    // Beckenham manager cannot override; David still lacks Nexphase
    await patch(beckenhamT, `/shifts/${s.id}/assign`, { reliefWorkerId: davidId }).expect(403);
    await patch(beckenhamT, `/shifts/${s.id}/assign`, { reliefWorkerId: davidId, overrideSkills: true }).expect(403);
  });

  it('workers with missing or expired documents cannot book', async () => {
    const created = await post(richmondT, '/relief-workers/concierge', {
      email: 'newbie@flexrelief.co.uk', firstName: 'New', lastName: 'Starter', phone: '07700900999', registrationNumber: 'GPHC-9999999',
    }).expect(201);
    expect(created.body.temporaryPassword).toBeTruthy();
    expect(created.body.user.passwordHash).toBeUndefined();

    const temp = await login('newbie@flexrelief.co.uk', created.body.temporaryPassword);
    const me = await get(temp, '/auth/me').expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    expect(me.body.tokenVersion).toBeUndefined();
    await get(temp, '/shifts/feed').expect(403); // blocked until the temporary password is changed
    const t = (await post(temp, '/auth/change-password', { currentPassword: created.body.temporaryPassword, newPassword: 'FreshPass123!' }).expect(200)).body.accessToken;
    await get(t, '/shifts/feed').expect(200);

    const shift = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(11, 9), endTime: at(11, 17) }).expect(201)).body;
    const r = await post(t, `/shifts/${shift.id}/instant-book`).expect(403);
    expect(JSON.stringify(r.body)).toMatch(/IDENTITY/);

    // Expired document is treated as missing
    await prisma.complianceDocument.updateMany({
      where: { reliefWorkerId: davidId, type: 'DBS_POLICE_CHECK' },
      data: { expiresAt: new Date(Date.now() - DAY) },
    });
    const r2 = await post(davidT, `/shifts/${shift.id}/instant-book`).expect(403);
    expect(JSON.stringify(r2.body)).toMatch(/DBS_POLICE_CHECK/);
    await prisma.complianceDocument.updateMany({
      where: { reliefWorkerId: davidId, type: 'DBS_POLICE_CHECK' },
      data: { expiresAt: new Date(Date.now() + 500 * DAY) },
    });
  });

  it('password change clears the flag and revokes the old token', async () => {
    const created = await post(richmondT, '/relief-workers/concierge', {
      email: 'pw@flexrelief.co.uk', firstName: 'P', lastName: 'W', phone: '07700900888', registrationNumber: 'GPHC-8888888',
    }).expect(201);
    const old = await login('pw@flexrelief.co.uk', created.body.temporaryPassword);
    const changed = await post(old, '/auth/change-password', { currentPassword: created.body.temporaryPassword, newPassword: 'AnotherPass123!' }).expect(200);
    await get(old, '/auth/me').expect(401);
    expect((await get(changed.body.accessToken, '/auth/me').expect(200)).body.mustChangePassword).toBe(false);
  });
});

describe('booking concurrency', () => {
  it('rejects overlapping bookings for the same worker', async () => {
    const a = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(12, 9), endTime: at(12, 17) }).expect(201)).body;
    const b = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(12, 12), endTime: at(12, 20) }).expect(201)).body;
    await post(sarahT, `/shifts/${a.id}/instant-book`).expect(201);
    await post(sarahT, `/shifts/${b.id}/instant-book`).expect(409);
    await patch(richmondT, `/shifts/${b.id}/assign`, { reliefWorkerId: sarahId }).expect(409);
  });

  it('lets exactly one of two simultaneous instant-books win', async () => {
    const s = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(14, 9), endTime: at(14, 17) }).expect(201)).body;
    const [x, y] = await Promise.all([post(sarahT, `/shifts/${s.id}/instant-book`), post(davidT, `/shifts/${s.id}/instant-book`)]);
    expect([x.status, y.status].filter((c) => c === 201)).toHaveLength(1);
    expect([x.status, y.status].filter((c) => c !== 201)[0]).toBeGreaterThanOrEqual(400);
    const final = (await get(richmondT, `/shifts/${s.id}`).expect(200)).body;
    expect(final.status).toBe('BOOKED');
  });

  it('manager cancel releases the worker and closes pending items', async () => {
    const s = (await newShift(richmondT, { startTime: at(16, 9), endTime: at(16, 17) }).expect(201)).body;
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: davidId }).expect(200);
    await patch(richmondT, `/shifts/${s.id}/status`, { status: 'COMPLETED' }).expect(400); // only via timesheet
    const r = await patch(richmondT, `/shifts/${s.id}/status`, { status: 'CANCELLED' }).expect(200);
    expect(r.body.status).toBe('CANCELLED');
    expect(r.body.assignedWorkerId).toBeNull();
    await patch(richmondT, `/shifts/${s.id}/status`, { status: 'OPEN' }).expect(400);
  });

  it('rejects shifts in the past or with inverted times', async () => {
    await newShift(richmondT, { startTime: at(-1, 9), endTime: at(-1, 17) }).expect(400);
    await newShift(richmondT, { startTime: at(5, 17), endTime: at(5, 9) }).expect(400);
    await newShift(richmondT, { hourlyRate: -3 }).expect(400);
  });
});

describe('rate negotiation', () => {
  it('runs propose → counter → worker accepts, and guards bad transitions', async () => {
    const s = (await newShift(richmondT, { startTime: at(20, 9), endTime: at(20, 17), hourlyRate: 32 }).expect(201)).body;
    const neg = (await post(sarahT, '/negotiations', { shiftId: s.id, proposedHourlyRate: 38, message: 'weekend' }).expect(201)).body;
    await post(sarahT, '/negotiations', { shiftId: s.id, proposedHourlyRate: 39 }).expect(400); // already open
    expect((await get(richmondT, `/shifts/${s.id}`)).body.status).toBe('IN_NEGOTIATION');

    await patch(sarahT, `/negotiations/${neg.id}/accept`).expect(400); // worker cannot accept own pending proposal
    await patch(sarahT, `/negotiations/${neg.id}/counter`, { counterOfferRate: 35 }).expect(403); // staff only
    await patch(beckenhamT, `/negotiations/${neg.id}/counter`, { counterOfferRate: 35 }).expect(404); // other tenant
    await patch(richmondT, `/negotiations/${neg.id}/counter`, { counterOfferRate: 35 }).expect(200);
    await patch(richmondT, `/negotiations/${neg.id}/counter`, { counterOfferRate: 34 }).expect(400); // already countered
    await patch(davidT, `/negotiations/${neg.id}/accept`).expect(404); // someone else's

    const booked = (await patch(sarahT, `/negotiations/${neg.id}/accept`).expect(200)).body;
    expect(booked.status).toBe('BOOKED');
    expect(Number(booked.hourlyRate)).toBe(35);
    expect(Number(booked.totalEstimatedPay)).toBe(280);

    await patch(richmondT, `/negotiations/${neg.id}/reject`).expect(400); // already accepted
    expect((await get(richmondT, `/shifts/${s.id}`)).body.status).toBe('BOOKED'); // stays booked
  });

  it('reopens the shift when the last negotiation is rejected', async () => {
    const s = (await newShift(richmondT, { startTime: at(22, 9), endTime: at(22, 17) }).expect(201)).body;
    const neg = (await post(davidT, '/negotiations', { shiftId: s.id, proposedHourlyRate: 40 }).expect(201)).body;
    await patch(richmondT, `/negotiations/${neg.id}/reject`).expect(200);
    expect((await get(richmondT, `/shifts/${s.id}`)).body.status).toBe('OPEN');
    const mine = (await get(davidT, '/negotiations/mine').expect(200)).body;
    expect(mine.find((n: any) => n.id === neg.id).status).toBe('REJECTED');
  });

  it('hides other applicants from workers', async () => {
    const s = (await newShift(richmondT, { startTime: at(24, 9), endTime: at(24, 17) }).expect(201)).body;
    await post(sarahT, `/shifts/${s.id}/apply`, {}).expect(201);
    await post(davidT, `/shifts/${s.id}/apply`, {}).expect(201);
    const asDavid = (await get(davidT, `/shifts/${s.id}`).expect(200)).body;
    expect(asDavid.applications).toHaveLength(1);
    expect(asDavid.applications[0].reliefWorkerId).toBe(davidId);
    const asManager = (await get(richmondT, `/shifts/${s.id}`).expect(200)).body;
    expect(asManager.applications).toHaveLength(2);
    // Booking Sarah rejects David's application
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
    const diary = (await get(davidT, '/shifts/mine').expect(200)).body;
    expect(diary.applications.find((a: any) => a.shiftId === s.id).status).toBe('REJECTED');
  });
});

describe('timesheets, invoices and payment', () => {
  let timesheetId: string;
  let invoiceId: string;
  let invoiceNumber: string;

  it('validates the clock times against the shift', async () => {
    // A finished shift booked to Sarah (created directly, since the API refuses past shifts)
    const start = new Date(Date.now() - 9 * 3_600_000);
    const end = new Date(Date.now() - 1 * 3_600_000);
    const shift = await prisma.shift.create({
      data: {
        branchId: richmondId, title: 'Finished shift', startTime: start, endTime: end, hourlyRate: 36, totalEstimatedPay: 288,
        status: 'BOOKED', assignedWorkerId: sarahId, visibility: 'PUBLIC_MARKETPLACE', requiredSystems: [], requiredAccreditations: [],
      },
    });
    const body = (over: object) => ({ shiftId: shift.id, clockInTime: start.toISOString(), clockOutTime: end.toISOString(), breakMinutes: 30, ...over });

    await post(davidT, '/timesheets/submit', body({})).expect(400); // not assigned to David
    await post(sarahT, '/timesheets/submit', body({ clockOutTime: new Date(Date.now() + DAY).toISOString() })).expect(400); // future
    await post(sarahT, '/timesheets/submit', body({ clockInTime: new Date(start.getTime() - 5 * 3_600_000).toISOString() })).expect(400); // way early
    await post(sarahT, '/timesheets/submit', body({ breakMinutes: 600 })).expect(400); // break > 480 / duration
    const ok = await post(sarahT, '/timesheets/submit', body({})).expect(201);
    expect(Number(ok.body.billableHours)).toBe(7.5);
    expect(Number(ok.body.totalPayout)).toBe(270);
    timesheetId = ok.body.id;
  });

  it('only the owning branch can approve, once', async () => {
    await patch(beckenhamT, `/timesheets/${timesheetId}/approve`).expect(404);
    await patch(sarahT, `/timesheets/${timesheetId}/approve`).expect(403);
    const r = await patch(richmondT, `/timesheets/${timesheetId}/approve`).expect(200);
    expect(r.body.invoice.invoiceNumber).toMatch(/^INV-\d{8}-[0-9A-F]{6}$/);
    invoiceId = r.body.invoice.id;
    invoiceNumber = r.body.invoice.invoiceNumber;
    expect(Number(r.body.invoice.totalAmount)).toBe(270);
    await patch(richmondT, `/timesheets/${timesheetId}/approve`).expect(400);
    // approved timesheets cannot be changed by the worker
    const ts = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
    await post(sarahT, '/timesheets/submit', { shiftId: ts.shiftId, clockInTime: ts.clockInTime, clockOutTime: ts.clockOutTime }).expect(400);
  });

  it('shows the worker their pending payout', async () => {
    const f = (await get(sarahT, '/invoices/my-finance').expect(200)).body;
    expect(f.pendingPayout).toBeGreaterThanOrEqual(270);
  });

  it('exports a payment batch CSV and marks invoices paid (org admin only, own org)', async () => {
    await get(richmondT, `/invoices/organization/${apexId}`).expect(403); // managers cannot see finance
    const csv = await get(adminT, `/invoices/organization/${apexId}/export.csv`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain(invoiceNumber);

    await patch(adminT, `/invoices/${invoiceId}/pay`, {}).expect(400); // reference required
    await patch(richmondT, `/invoices/${invoiceId}/pay`, { paymentReference: 'BACS-1' }).expect(403);
    const paid = await patch(adminT, `/invoices/${invoiceId}/pay`, { paymentReference: 'BACS-0001' }).expect(200);
    expect(paid.body.status).toBe('PAID');
    await patch(adminT, `/invoices/${invoiceId}/pay`, { paymentReference: 'BACS-0002' }).expect(400); // already paid
    expect((await prisma.timesheet.findUnique({ where: { id: timesheetId } })).status).toBe('SETTLED');
  });
});

describe('compliance desk', () => {
  it('uploads, reviews and gates document access', async () => {
    await api()
      .post(`/relief-workers/${sarahId}/documents`)
      .set('Authorization', `Bearer ${sarahT}`)
      .field('type', 'SAFEGUARDING_L3')
      .attach('file', Buffer.from('not a pdf'), { filename: 'x.exe', contentType: 'application/x-msdownload' })
      .expect(400);
    await api().post(`/relief-workers/${sarahId}/documents`).set('Authorization', `Bearer ${sarahT}`).field('type', 'SAFEGUARDING_L3').expect(400); // no file

    const doc = (
      await api()
        .post(`/relief-workers/${sarahId}/documents`)
        .set('Authorization', `Bearer ${sarahT}`)
        .field('type', 'SAFEGUARDING_L3')
        .field('expiresAt', at(300, 0))
        .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'sg3.pdf', contentType: 'application/pdf' })
        .expect(201)
    ).body;
    expect(doc.status).toBe('PENDING');

    const queue = (await get(richmondT, '/relief-workers/documents/queue').expect(200)).body;
    expect(queue.some((d: any) => d.id === doc.id)).toBe(true);
    await get(sarahT, '/relief-workers/documents/queue').expect(403);

    await get(sarahT, `/relief-workers/documents/${doc.id}/file`).expect(200);
    await get(davidT, `/relief-workers/documents/${doc.id}/file`).expect(403);
    await get(richmondT, `/relief-workers/documents/${doc.id}/file`).expect(200);

    await patch(sarahT, `/relief-workers/documents/${doc.id}/verify`, { status: 'VERIFIED' }).expect(403);
    await patch(richmondT, `/relief-workers/documents/${doc.id}/verify`, { status: 'REJECTED' }).expect(400); // needs a note
    await patch(richmondT, `/relief-workers/documents/${doc.id}/verify`, { status: 'PENDING' }).expect(400);
    const v = await patch(richmondT, `/relief-workers/documents/${doc.id}/verify`, { status: 'VERIFIED', notes: 'ok' }).expect(200);
    expect(v.body.status).toBe('VERIFIED');
  });

  it('un-verifies a worker when a mandatory document is rejected', async () => {
    const dbs = await prisma.complianceDocument.findFirst({ where: { reliefWorkerId: davidId, type: 'INDEMNITY_INSURANCE' } });
    await patch(richmondT, `/relief-workers/documents/${dbs.id}/verify`, { status: 'REJECTED', notes: 'illegible' }).expect(200);
    expect((await prisma.reliefProfile.findUnique({ where: { id: davidId } })).isVerified).toBe(false);
    await patch(richmondT, `/relief-workers/documents/${dbs.id}/verify`, { status: 'VERIFIED' }).expect(200);
    expect((await prisma.reliefProfile.findUnique({ where: { id: davidId } })).isVerified).toBe(true);
  });
});

describe('leave, staff bank and analytics', () => {
  it('approves leave once and backfills a vacancy', async () => {
    const leave = (
      await post(richmondT, '/leave', {
        branchId: richmondId, staffName: 'Jo Bloggs', staffRole: 'Pharmacist', startDate: at(30, 9), endDate: at(30, 17), leaveType: 'ANNUAL',
      }).expect(201)
    ).body;
    await post(richmondT, '/leave', { branchId: richmondId, staffName: 'X', staffRole: 'Y', startDate: at(31, 9), endDate: at(30, 9) }).expect(400);
    await patch(beckenhamT, `/leave/${leave.id}/review`, { status: 'APPROVED' }).expect(404);
    await patch(richmondT, `/leave/${leave.id}/review`, { status: 'PENDING' }).expect(400);
    const before = await prisma.shift.count({ where: { branchId: richmondId } });
    await patch(richmondT, `/leave/${leave.id}/review`, { status: 'APPROVED', autoCreateShiftVacancy: true }).expect(200);
    expect(await prisma.shift.count({ where: { branchId: richmondId } })).toBe(before + 1);
    await patch(richmondT, `/leave/${leave.id}/review`, { status: 'REJECTED' }).expect(400); // already reviewed
  });

  it('manages staff bank within the caller org', async () => {
    const member = (await post(adminT, '/staff-bank', { reliefWorkerId: davidId, tier: 'TIER_2_REGULAR', customHourlyRate: 33 }).expect(201)).body;
    expect(member.organizationId).toBe(apexId);
    await post(adminT, '/staff-bank', { reliefWorkerId: davidId }).expect(400); // duplicate
    await post(adminT, '/staff-bank', { reliefWorkerId: sarahId, branchId: beckenhamId }).expect(400); // branch of another org
    await patch(beckenhamT, `/staff-bank/${member.id}`, { tier: 'TIER_1_PREFERRED' }).expect(403);
    await patch(adminT, `/staff-bank/${member.id}`, { tier: 'TIER_1_PREFERRED' }).expect(200);
    // David is now a bank member, so he can see staff-bank-only shifts
    const titles = (await get(davidT, '/shifts/feed').expect(200)).body.map((s: any) => s.title);
    expect(titles).toContain('Staff Bank Pharmacist (Weekday)');
    await api().delete(`/staff-bank/${member.id}`).set('Authorization', `Bearer ${beckenhamT}`).expect(403);
    await api().delete(`/staff-bank/${member.id}`).set('Authorization', `Bearer ${adminT}`).expect(200);
  });

  it('returns scoped dashboard numbers', async () => {
    const mgr = (await get(richmondT, '/analytics/overview').expect(200)).body;
    expect(mgr.openShifts).toBeGreaterThan(0);
    expect(typeof mgr.monthSpend).toBe('number');
    const crest = (await get(beckenhamT, '/analytics/overview').expect(200)).body;
    expect(crest.monthSpend).toBe(0); // no Crest invoices: Apex spend must not leak
    await get(sarahT, '/analytics/overview').expect(403);
    await get(richmondT, `/analytics/overview?branchId=${beckenhamId}`).expect(404);
  });

  it('creates managers via the users API (org admin only)', async () => {
    await post(richmondT, '/users', { email: 'm@apexhealth.co.uk', role: 'FACILITY_MANAGER' }).expect(403);
    const u = await post(adminT, '/users', { email: 'barking.mgr@apexhealth.co.uk', role: 'FACILITY_MANAGER', branchId: barkingId }).expect(201);
    expect(u.body.temporaryPassword).toBeTruthy();
    const temp = await login('barking.mgr@apexhealth.co.uk', u.body.temporaryPassword);
    await get(temp, '/branches').expect(403); // temporary password must be changed first
    const t = (await post(temp, '/auth/change-password', { currentPassword: u.body.temporaryPassword, newPassword: 'ManagerPass123!' }).expect(200)).body.accessToken;
    expect((await get(t, '/branches').expect(200)).body.map((b: any) => b.id)).toEqual([barkingId]);
  });
});

describe('review-loop regressions', () => {
  it('scopes worker data to the caller organization', async () => {
    const list = (await get(beckenhamT, '/relief-workers').expect(200)).body.map((w: any) => w.id);
    expect(list).not.toContain(sarahId);
    await get(beckenhamT, `/relief-workers/${sarahId}`).expect(404);
    const found = (await get(beckenhamT, '/relief-workers/lookup?registrationNumber=GPHC-2089412').expect(200)).body;
    expect(found.id).toBe(sarahId);
    expect(found.user).toBeUndefined(); // minimal projection, no email
    await get(beckenhamT, '/relief-workers/lookup?registrationNumber=GPHC-0000000').expect(404);

    const queue = (await get(beckenhamT, '/relief-workers/documents/queue').expect(200)).body;
    expect(queue).toHaveLength(0);
    const pending = await prisma.complianceDocument.findFirst({ where: { reliefWorkerId: davidId, status: 'PENDING' } });
    await patch(beckenhamT, `/relief-workers/documents/${pending.id}/verify`, { status: 'VERIFIED' }).expect(404);
    await get(beckenhamT, `/relief-workers/documents/${pending.id}/file`).expect(404);

    // Apex staff see their own worker, but only Apex data about them
    const w = (await get(adminT, `/relief-workers/${sarahId}`).expect(200)).body;
    expect(w.staffBankMemberships.every((m: any) => m.organizationId === apexId)).toBe(true);
  });

  it('managers cannot edit org-wide staff bank entries', async () => {
    const m = (await post(adminT, '/staff-bank', { reliefWorkerId: davidId }).expect(201)).body; // no branch => org-wide
    await patch(richmondT, `/staff-bank/${m.id}`, { tier: 'TIER_3_RESERVE' }).expect(404);
    await api().delete(`/staff-bank/${m.id}`).set('Authorization', `Bearer ${adminT}`).expect(200);
  });

  it('rejects uploads whose content does not match the declared type', async () => {
    await api()
      .post(`/relief-workers/${sarahId}/documents`)
      .set('Authorization', `Bearer ${sarahT}`)
      .field('type', 'OTHER')
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'evil.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('freezes pay terms once a shift is booked', async () => {
    const s = (await newShift(richmondT, { startTime: at(26, 9), endTime: at(26, 17) }).expect(201)).body;
    await patch(richmondT, `/shifts/${s.id}`, { hourlyRate: 31 }).expect(200); // open: allowed
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
    await patch(richmondT, `/shifts/${s.id}`, { hourlyRate: 99 }).expect(400);
    await patch(richmondT, `/shifts/${s.id}`, { visibility: 'STAFF_BANK_ONLY' }).expect(400);
    await patch(richmondT, `/shifts/${s.id}`, { notes: 'Bring ID' }).expect(200);
  });

  it('a released worker cannot be paid for a pending timesheet', async () => {
    const start = new Date(Date.now() - 6 * 3_600_000);
    const end = new Date(Date.now() - 1 * 3_600_000);
    const shift = await prisma.shift.create({
      data: {
        branchId: richmondId, title: 'Released shift', startTime: start, endTime: end, hourlyRate: 30, totalEstimatedPay: 150,
        status: 'BOOKED', assignedWorkerId: davidId, visibility: 'PUBLIC_MARKETPLACE', requiredSystems: [], requiredAccreditations: [],
      },
    });
    const ts = (await post(davidT, '/timesheets/submit', { shiftId: shift.id, clockInTime: start.toISOString(), clockOutTime: end.toISOString() }).expect(201)).body;
    await patch(richmondT, `/shifts/${shift.id}/status`, { status: 'OPEN' }).expect(200); // manager releases the worker
    await patch(richmondT, `/timesheets/${ts.id}/approve`).expect(404); // timesheet was withdrawn with the release
  });

  it('creates one vacancy per day for multi-day leave and validates the dates', async () => {
    const leave = (
      await post(richmondT, '/leave', { branchId: richmondId, staffName: 'Al Away', staffRole: 'Pharmacist', startDate: at(40, 0), endDate: at(42, 0) }).expect(201)
    ).body;
    const before = await prisma.shift.count({ where: { branchId: richmondId } });
    await patch(richmondT, `/leave/${leave.id}/review`, { status: 'APPROVED', autoCreateShiftVacancy: true, backfillHourlyRate: 33 }).expect(200);
    expect(await prisma.shift.count({ where: { branchId: richmondId } })).toBe(before + 3);
    const past = (await post(richmondT, '/leave', { branchId: richmondId, staffName: 'Old', staffRole: 'Pharmacist', startDate: at(-5, 9), endDate: at(-5, 17) }).expect(201)).body;
    await patch(richmondT, `/leave/${past.id}/review`, { status: 'APPROVED', autoCreateShiftVacancy: true }).expect(400);
  });

  it('serialises concurrent overlapping bookings for one worker', async () => {
    const a = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(30, 9), endTime: at(30, 17) }).expect(201)).body;
    const b = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(30, 13), endTime: at(30, 21) }).expect(201)).body;
    const [x, y] = await Promise.all([post(davidT, `/shifts/${a.id}/instant-book`), post(davidT, `/shifts/${b.id}/instant-book`)]);
    expect([x.status, y.status].filter((c) => c === 201)).toHaveLength(1);
  });

  it('does not let inactive users sign in', async () => {
    const u = await post(adminT, '/users', { email: 'gone@apexhealth.co.uk', role: 'FACILITY_MANAGER' }).expect(201);
    await patch(adminT, `/users/${u.body.id}`, { isActive: false }).expect(200);
    await api().post('/auth/login').send({ email: 'gone@apexhealth.co.uk', password: u.body.temporaryPassword }).expect(401);
  });
});

describe('automation: cascade, expiry, notifications, checklists, benchmarks', () => {
  const feedTitles = async (t: string) => (await get(t, '/shifts/feed').expect(200)).body.map((x: any) => x.title);

  it('releases staff-bank shifts tier by tier, then to the marketplace', async () => {
    const jobs = app.get(JobsService);
    // David joins the Apex bank as Tier 2; Sarah is Tier 1.
    const member = (await post(adminT, '/staff-bank', { reliefWorkerId: davidId, tier: 'TIER_2_REGULAR' }).expect(201)).body;
    const title = `Cascade shift ${Date.now()}`;
    const shift = (await post(richmondT, '/shifts', { branchId: richmondId, title, startTime: at(35, 9), endTime: at(35, 17), hourlyRate: 31, visibility: 'STAFF_BANK_ONLY' }).expect(201)).body;
    expect(shift.cascadeStage).toBe(1);

    expect(await feedTitles(sarahT)).toContain(title); // Tier 1 sees it straight away
    expect(await feedTitles(davidT)).not.toContain(title); // Tier 2 has to wait
    await get(davidT, `/shifts/${shift.id}`).expect(404);

    const due = () => prisma.shift.update({ where: { id: shift.id }, data: { nextCascadeAt: new Date(Date.now() - 1000) } });
    await due();
    await jobs.runCascade();
    expect((await prisma.shift.findUnique({ where: { id: shift.id } })).cascadeStage).toBe(2);
    expect(await feedTitles(davidT)).toContain(title);

    await due(); await jobs.runCascade(); // stage 3 (Tier 3 reserve)
    await due(); await jobs.runCascade(); // marketplace
    const final = await prisma.shift.findUnique({ where: { id: shift.id } });
    expect(final.visibility).toBe('PUBLIC_MARKETPLACE');
    expect(final.nextCascadeAt).toBeNull();

    // Tier 2 members were notified when their tier was released
    const notes = (await get(davidT, '/notifications').expect(200)).body;
    expect(notes.items.some((n: any) => n.type === 'NEW_SHIFT' && n.link === `/shifts/${shift.id}`)).toBe(true);
    await api().delete(`/staff-bank/${member.id}`).set('Authorization', `Bearer ${adminT}`).expect(200);
  });

  it('delivers and clears in-app notifications', async () => {
    const mine = (await get(richmondT, '/notifications').expect(200)).body;
    expect(mine.items.some((n: any) => n.type === 'NEGOTIATION_PROPOSED')).toBe(true);
    expect(mine.unread).toBeGreaterThan(0);
    await post(richmondT, `/notifications/${mine.items[0].id}/read`).expect(200);
    await post(richmondT, '/notifications/read-all').expect(200);
    expect((await get(richmondT, '/notifications').expect(200)).body.unread).toBe(0);
    // Someone else's notification id is a silent no-op
    await post(sarahT, `/notifications/${mine.items[0].id}/read`).expect(200);
    expect((await prisma.notification.findUnique({ where: { id: mine.items[0].id } })).readAt).not.toBeNull();
  });

  it('warns about expiring documents once, then expires them and un-verifies the worker', async () => {
    const jobs = app.get(JobsService);
    const doc = await prisma.complianceDocument.findFirst({ where: { reliefWorkerId: davidId, type: 'IDENTITY' } });
    await prisma.complianceDocument.update({ where: { id: doc.id }, data: { expiresAt: new Date(Date.now() + 5 * DAY) } });

    const first = await jobs.runExpiry();
    expect(first.warned).toBeGreaterThanOrEqual(1);
    const second = await jobs.runExpiry();
    expect(second.warned).toBe(0); // no repeat warnings
    const notes = (await get(davidT, '/notifications').expect(200)).body.items;
    expect(notes.some((n: any) => n.type === 'DOCUMENT_EXPIRING')).toBe(true);

    await prisma.complianceDocument.update({ where: { id: doc.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const third = await jobs.runExpiry();
    expect(third.expired).toBe(1);
    expect((await prisma.complianceDocument.findUnique({ where: { id: doc.id } })).status).toBe('EXPIRED');
    expect((await prisma.reliefProfile.findUnique({ where: { id: davidId } })).isVerified).toBe(false);

    // restore for any later test
    await prisma.complianceDocument.update({ where: { id: doc.id }, data: { status: 'VERIFIED', expiresAt: new Date(Date.now() + 500 * DAY), expiryNotified7: false, expiryNotified30: false } });
    await prisma.reliefProfile.update({ where: { id: davidId }, data: { isVerified: true } });
  });

  it('enforces organization-specific credential checklists', async () => {
    await patch(richmondT, `/organizations/${apexId}`, { requiredDocTypes: ['SAFEGUARDING_L3'] }).expect(403); // admins only
    await patch(adminT, `/organizations/${apexId}`, { requiredDocTypes: ['NOT_A_TYPE'] }).expect(400);
    await patch(adminT, `/organizations/${apexId}`, { requiredDocTypes: ['SAFEGUARDING_L3'] }).expect(200);
    try {
      const s = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(50, 9), endTime: at(50, 17) }).expect(201)).body;
      const r = await post(davidT, `/shifts/${s.id}/instant-book`).expect(403); // David's safeguarding doc is still pending
      expect(JSON.stringify(r.body)).toMatch(/SAFEGUARDING_L3/);
      await post(sarahT, `/shifts/${s.id}/instant-book`).expect(201); // Sarah's was verified earlier
    } finally {
      await patch(adminT, `/organizations/${apexId}`, { requiredDocTypes: [] }).expect(200);
    }
  });

  it('serves anonymised market-rate benchmarks to staff only', async () => {
    const r = (await get(richmondT, '/analytics/market-rates?profession=Pharmacist').expect(200)).body;
    expect(r.profession).toBe('Pharmacist');
    expect(typeof r.sampleSize).toBe('number');
    // Needs >=5 shifts from >=3 organizations; the seed has only 2 organizations, so it must be withheld.
    expect(r.median).toBeNull();
    expect(r.p25).toBeNull();
    await get(sarahT, '/analytics/market-rates').expect(403);
  });

  it('hides closed shifts from workers who are not involved', async () => {
    const s = (await newShift(richmondT, { startTime: at(55, 9), endTime: at(55, 17) }).expect(201)).body;
    await get(davidT, `/shifts/${s.id}`).expect(200); // open + public: visible
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
    await get(davidT, `/shifts/${s.id}`).expect(404); // booked to someone else: gone
    await get(sarahT, `/shifts/${s.id}`).expect(200); // her own booking stays visible
  });

  it('resumes the cascade timer when a booked shift is released', async () => {
    const jobs = app.get(JobsService);
    const s = (await post(richmondT, '/shifts', { branchId: richmondId, title: `Release ${Date.now()}`, startTime: at(56, 9), endTime: at(56, 17), hourlyRate: 31, visibility: 'STAFF_BANK_ONLY' }).expect(201)).body;
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
    await jobs.runCascade(); // booked shifts have their timer cleared
    expect((await prisma.shift.findUnique({ where: { id: s.id } })).nextCascadeAt).toBeNull();
    await patch(richmondT, `/shifts/${s.id}/status`, { status: 'OPEN' }).expect(200);
    const after = await prisma.shift.findUnique({ where: { id: s.id } });
    expect(after.cascadeStage).toBe(1);
    expect(after.nextCascadeAt).not.toBeNull(); // cascading again
  });

  it('does not cascade a shift that has already started', async () => {
    const jobs = app.get(JobsService);
    const shift = await prisma.shift.create({
      data: {
        branchId: richmondId, title: 'Already started', startTime: new Date(Date.now() - 3_600_000), endTime: new Date(Date.now() + 3_600_000),
        hourlyRate: 30, totalEstimatedPay: 60, status: 'OPEN', visibility: 'STAFF_BANK_ONLY', requiredSystems: [], requiredAccreditations: [],
        cascadeStage: 1, nextCascadeAt: new Date(Date.now() - 1000),
      },
    });
    await jobs.runCascade();
    expect((await prisma.shift.findUnique({ where: { id: shift.id } })).cascadeStage).toBe(1);
  });

  it('tells managers when a booked worker\'s document lapses', async () => {
    const jobs = app.get(JobsService);
    const s = (await newShift(richmondT, { startTime: at(57, 9), endTime: at(57, 17) }).expect(201)).body;
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: davidId }).expect(200);
    const doc = await prisma.complianceDocument.findFirst({ where: { reliefWorkerId: davidId, type: 'RIGHT_TO_WORK' } });
    await prisma.complianceDocument.update({ where: { id: doc.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await jobs.runExpiry();
    const notes = (await get(richmondT, '/notifications').expect(200)).body.items;
    expect(notes.some((n: any) => n.type === 'WORKER_COMPLIANCE_LAPSED' && n.body.includes(s.title))).toBe(true);
    await prisma.complianceDocument.update({ where: { id: doc.id }, data: { status: 'VERIFIED', expiresAt: new Date(Date.now() + 500 * DAY), expiryNotified7: false, expiryNotified30: false } });
    await prisma.reliefProfile.update({ where: { id: davidId }, data: { isVerified: true } });
    await patch(richmondT, `/shifts/${s.id}/status`, { status: 'CANCELLED' }).expect(200);
  });

  it('lets rates be cleared again with null (and still rejects junk)', async () => {
    const member = (await post(adminT, '/staff-bank', { reliefWorkerId: davidId, customHourlyRate: 33 }).expect(201)).body;
    expect(Number(member.customHourlyRate)).toBe(33);
    const cleared = (await patch(adminT, `/staff-bank/${member.id}`, { customHourlyRate: null }).expect(200)).body;
    expect(cleared.customHourlyRate).toBeNull();
    await patch(adminT, `/staff-bank/${member.id}`, { customHourlyRate: 'lots' }).expect(400);
    await patch(adminT, `/staff-bank/${member.id}`, { customHourlyRate: 0 }).expect(400);
    await api().delete(`/staff-bank/${member.id}`).set('Authorization', `Bearer ${adminT}`).expect(200);

    await patch(sarahT, '/relief-workers/me/preferences', { minimumShiftRate: 31 }).expect(200);
    const off = (await patch(sarahT, '/relief-workers/me/preferences', { minimumShiftRate: null, hourlyRate: null }).expect(200)).body;
    expect(off.minimumShiftRate).toBeNull();
    expect(off.hourlyRate).toBeNull();
    await patch(sarahT, '/relief-workers/me/preferences', { minimumShiftRate: -1 }).expect(400);
    await patch(sarahT, '/relief-workers/me/preferences', { minimumShiftRate: 28, hourlyRate: 32.5 }).expect(200); // restore seed values
  });

  it('rejects overlapping leave for the same person at a branch', async () => {
    const body = (startDays: number, endDays: number, name = 'Sam Overlap') => ({
      branchId: richmondId, staffName: name, staffRole: 'Pharmacist', startDate: at(80 + startDays, 9), endDate: at(80 + endDays, 17),
    });
    const first = (await post(richmondT, '/leave', body(0, 3)).expect(201)).body;
    await post(richmondT, '/leave', body(2, 5)).expect(409); // overlaps the pending request
    await post(richmondT, '/leave', body(2, 5, 'sam overlap')).expect(409); // names compare case-insensitively
    await post(richmondT, '/leave', body(2, 5, 'Someone Else')).expect(201); // other people are unaffected
    await post(richmondT, '/leave', body(4, 6)).expect(201); // adjacent but not overlapping
    await patch(richmondT, `/leave/${first.id}/review`, { status: 'REJECTED' }).expect(200);
    await post(richmondT, '/leave', body(1, 2)).expect(201); // the rejected request no longer blocks its dates
  });

  it('broadcasts emergencies to every verified worker, ignoring minimum-rate thresholds', async () => {
    const title = `Emergency ${Date.now()}`;
    // Sarah's saved minimum (28) is above this rate, so a normal shift would be hidden from her
    const s = (
      await post(richmondT, '/shifts', {
        branchId: richmondId, title, startTime: at(65, 9), endTime: at(65, 17), hourlyRate: 5, visibility: 'EMERGENCY_BROADCAST', isEmergency: true,
      }).expect(201)
    ).body;
    const forYou = (await get(sarahT, '/shifts/feed?tab=for_you').expect(200)).body.map((x: any) => x.title);
    const emergencies = (await get(sarahT, '/shifts/feed?tab=emergencies').expect(200)).body.map((x: any) => x.title);
    expect(forYou).not.toContain(title);
    expect(emergencies).toContain(title);
    for (const t of [sarahT, davidT]) {
      const notes = (await get(t, '/notifications').expect(200)).body.items;
      expect(notes.some((n: any) => n.type === 'EMERGENCY_SHIFT' && n.link === `/shifts/${s.id}`)).toBe(true);
    }
  });

  it('records live clock-in and clock-out and turns them into a timesheet', async () => {
    const mk = (title: string, startOffsetH: number, endOffsetH: number, worker = sarahId) =>
      prisma.shift.create({
        data: {
          branchId: richmondId, title, startTime: new Date(Date.now() + startOffsetH * 3_600_000), endTime: new Date(Date.now() + endOffsetH * 3_600_000),
          hourlyRate: 40, totalEstimatedPay: 320, status: 'BOOKED', assignedWorkerId: worker, visibility: 'PUBLIC_MARKETPLACE', requiredSystems: [], requiredAccreditations: [],
        },
      });
    const future = await mk('Clock too early', 48, 56);
    await post(sarahT, '/timesheets/clock-in', { shiftId: future.id }).expect(400); // more than 1h before the start
    await post(sarahT, '/timesheets/clock-out', { shiftId: future.id }).expect(400); // not clocked in

    const live = await mk('Clock live', -2, 6);
    await post(davidT, '/timesheets/clock-in', { shiftId: live.id }).expect(404); // not his shift
    await post(richmondT, '/timesheets/clock-in', { shiftId: live.id }).expect(403); // staff cannot clock a worker in
    const started = (await post(sarahT, '/timesheets/clock-in', { shiftId: live.id }).expect(201)).body;
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.workerClockInAt).toBeTruthy();
    await post(sarahT, '/timesheets/clock-in', { shiftId: live.id }).expect(400); // already in progress
    await post(sarahT, '/timesheets/clock-out', { shiftId: live.id }).expect(400); // 0 minutes worked

    // pretend the clock-in happened 3 hours ago
    await prisma.shift.update({ where: { id: live.id }, data: { workerClockInAt: new Date(Date.now() - 3 * 3_600_000) } });
    const ts = (await post(sarahT, '/timesheets/clock-out', { shiftId: live.id, breakMinutes: 30, notes: 'busy day' }).expect(201)).body;
    // clock-in was backdated 3h but the shift only started 2h ago: early time is not billed (2h - 30min break)
    expect(Number(ts.billableHours)).toBeCloseTo(1.5, 1);
    expect(Number(ts.totalPayout)).toBeCloseTo(60, 0);
    expect(ts.status).toBe('SUBMITTED');
    await post(sarahT, '/timesheets/clock-out', { shiftId: live.id }).expect(409); // already submitted

    // a manager can still approve it while the shift is IN_PROGRESS
    const approved = (await patch(richmondT, `/timesheets/${ts.id}/approve`).expect(200)).body;
    expect(approved.invoice.invoiceNumber).toMatch(/^INV-/);
    expect((await prisma.shift.findUnique({ where: { id: live.id } })).status).toBe('COMPLETED');
  });

  it('emails important notifications, respects opt-out and links to the right app', async () => {
    const mailer = app.get(MailerService);
    const mailsTo = (email: string) => mailer.outbox.filter((m) => m.to === email);
    const before = mailsTo('sarah.y@flexrelief.co.uk').length;

    const s = (await newShift(richmondT, { startTime: at(70, 9), endTime: at(70, 17), title: 'Emailed booking' }).expect(201)).body;
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
    const sent = mailsTo('sarah.y@flexrelief.co.uk').slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('You have been booked');
    expect(sent[0].text).toContain(`http://localhost:3001/shifts/${s.id}`); // workers are sent to the worker portal
    expect(sent[0].text).not.toContain('Emailed booking'); // free text from managers is never put in email bodies

    // Managers are linked to the dashboard, not the worker portal
    const neg = await newShift(richmondT, { startTime: at(71, 9), endTime: at(71, 17) }).expect(201);
    await post(davidT, '/negotiations', { shiftId: neg.body.id, proposedHourlyRate: 45 }).expect(201);
    const mgrMail = mailsTo('richmond.mgr@apexhealth.co.uk').find((m) => m.subject === 'New rate proposal');
    expect(mgrMail).toBeTruthy();
    expect(mgrMail!.text).toContain('http://localhost:3000/negotiations');

    // High-volume types stay in-app only: a tier release creates a notification but no email
    const total = mailer.outbox.length;
    await post(richmondT, '/shifts', { branchId: richmondId, title: 'Quiet release', startTime: at(72, 9), endTime: at(72, 17), hourlyRate: 31, visibility: 'STAFF_BANK_ONLY' }).expect(201);
    expect(mailer.outbox.length).toBe(total);
    expect((await get(sarahT, '/notifications').expect(200)).body.items.some((n: any) => n.type === 'NEW_SHIFT')).toBe(true);

    // Opt-out
    expect((await get(sarahT, '/notifications').expect(200)).body.emailEnabled).toBe(true);
    await patch(sarahT, '/notifications/preferences', { emailEnabled: 'yes' }).expect(400);
    await patch(sarahT, '/notifications/preferences', { emailEnabled: false }).expect(200);
    expect((await get(sarahT, '/notifications').expect(200)).body.emailEnabled).toBe(false);
    const s2 = (await newShift(richmondT, { startTime: at(73, 9), endTime: at(73, 17) }).expect(201)).body;
    const count = mailsTo('sarah.y@flexrelief.co.uk').length;
    await patch(richmondT, `/shifts/${s2.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
    expect(mailsTo('sarah.y@flexrelief.co.uk').length).toBe(count); // no email, but the in-app notification still exists
    expect((await get(sarahT, '/notifications').expect(200)).body.items.some((n: any) => n.type === 'SHIFT_BOOKED' && n.link === `/shifts/${s2.id}`)).toBe(true);
    await patch(sarahT, '/notifications/preferences', { emailEnabled: true }).expect(200);
  });

  it('caps a very late clock-out instead of leaving the worker stuck IN_PROGRESS', async () => {
    const end = new Date(Date.now() - 10 * 3_600_000);
    const start = new Date(end.getTime() - 8 * 3_600_000);
    const shift = await prisma.shift.create({
      data: {
        branchId: richmondId, title: 'Forgot to clock out', startTime: start, endTime: end, hourlyRate: 30, totalEstimatedPay: 240,
        status: 'IN_PROGRESS', assignedWorkerId: sarahId, workerClockInAt: start, visibility: 'PUBLIC_MARKETPLACE', requiredSystems: [], requiredAccreditations: [],
      },
    });
    const ts = (await post(sarahT, '/timesheets/clock-out', { shiftId: shift.id }).expect(201)).body;
    // 8h scheduled + the 4h allowed overrun, nothing more
    expect(Number(ts.billableHours)).toBeCloseTo(12, 1);
  });

  it('only lets workers move a shift to IN_PROGRESS by clocking in', async () => {
    const s = (await newShift(richmondT, { startTime: at(75, 9), endTime: at(75, 17) }).expect(201)).body;
    await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
    await patch(richmondT, `/shifts/${s.id}/status`, { status: 'IN_PROGRESS' }).expect(400);
  });

  it('turns null on non-nullable fields into a 400, not a 500', async () => {
    const m = (await post(adminT, '/staff-bank', { reliefWorkerId: davidId }).expect(201)).body;
    await patch(adminT, `/staff-bank/${m.id}`, { isActive: null }).expect(400);
    await patch(adminT, `/staff-bank/${m.id}`, { tier: null }).expect(400);
    await patch(sarahT, '/relief-workers/me/preferences', { systemTags: null }).expect(400);
    await api().delete(`/staff-bank/${m.id}`).set('Authorization', `Bearer ${adminT}`).expect(200);
  });

  it('matches leave names after Unicode/whitespace normalisation and serialises concurrent submissions', async () => {
    const body = (name: string, off = 0) => ({ branchId: richmondId, staffName: name, staffRole: 'Pharmacist', startDate: at(90 + off, 9), endDate: at(92 + off, 17) });
    const first = (await post(richmondT, '/leave', body('  Zoë   Quinn ')).expect(201)).body;
    expect(first.staffName).toBe('Zoë Quinn'); // stored normalised
    await post(richmondT, '/leave', body('ZOË QUINN')).expect(409);
    await post(richmondT, '/leave', body('Zoe\u0308 Quinn')).expect(409); // decomposed ë
    // two simultaneous requests for the same person: exactly one wins
    const results = await Promise.all([1, 2, 3].map(() => post(richmondT, '/leave', body('Race Runner', 10))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it('keeps a released stage-3 staff-bank shift cascading, but not one created with cascade:false', async () => {
    const mk = async (cascade: boolean, day: number) => {
      const s = (await post(richmondT, '/shifts', { branchId: richmondId, title: `Stage3 ${cascade} ${Date.now()}`, startTime: at(day, 9), endTime: at(day, 17), hourlyRate: 31, visibility: 'STAFF_BANK_ONLY', cascade }).expect(201)).body;
      if (cascade) await prisma.shift.update({ where: { id: s.id }, data: { cascadeStage: 3 } });
      await patch(richmondT, `/shifts/${s.id}/assign`, { reliefWorkerId: sarahId }).expect(200);
      await patch(richmondT, `/shifts/${s.id}/status`, { status: 'OPEN' }).expect(200);
      return prisma.shift.findUnique({ where: { id: s.id } });
    };
    expect((await mk(true, 76)).nextCascadeAt).not.toBeNull();
    expect((await mk(false, 77)).nextCascadeAt).toBeNull();
  });

  it('signs sessions into an HttpOnly cookie per app, with CSRF protection', async () => {
    const admin = request.agent(baseUrl);
    const loginRes = await admin.post('/auth/login').set('X-FlexShift-App', 'admin').set('X-Requested-With', 'flexshift')
      .send({ email: 'richmond.mgr@apexhealth.co.uk', password: PW }).expect(200);
    const setCookie = ([] as string[]).concat(loginRes.headers['set-cookie'] as any).join(';');
    expect(setCookie).toMatch(/fs_admin=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    // the cookie alone authenticates reads
    expect((await admin.get('/auth/me').set('X-FlexShift-App', 'admin').expect(200)).body.email).toBe('richmond.mgr@apexhealth.co.uk');
    // ...but another app's cookie jar slot is separate: the worker app sees no session
    await admin.get('/auth/me').set('X-FlexShift-App', 'worker').expect(401);
    // state-changing requests need the custom header when they rely on the cookie (CSRF defence)
    await admin.post('/shifts').set('X-FlexShift-App', 'admin').send({}).expect(403);
    await admin.post('/shifts').set('X-FlexShift-App', 'admin').set('X-Requested-With', 'flexshift').send({}).expect(400); // passes CSRF, fails validation
    // bearer callers do not need the header
    await post(richmondT, '/shifts', {}).expect(400);

    // logout clears the cookie and revokes the token
    const out = await admin.post('/auth/logout').set('X-FlexShift-App', 'admin').set('X-Requested-With', 'flexshift').expect(200);
    expect(([] as string[]).concat(out.headers['set-cookie'] as any).join(';')).toMatch(/fs_admin=;/);
    await admin.get('/auth/me').set('X-FlexShift-App', 'admin').expect(401);
    richmondT = await login('richmond.mgr@apexhealth.co.uk'); // logout revoked every earlier token for this user
  });

  it('rotates the cookie when the password changes', async () => {
    const created = await post(richmondT, '/relief-workers/concierge', {
      email: 'cookie@flexrelief.co.uk', firstName: 'C', lastName: 'K', phone: '07700900777', registrationNumber: 'GPHC-7777777',
    }).expect(201);
    const agent = request.agent(baseUrl);
    await agent.post('/auth/login').set('X-FlexShift-App', 'worker').set('X-Requested-With', 'flexshift')
      .send({ email: 'cookie@flexrelief.co.uk', password: created.body.temporaryPassword }).expect(200);
    await agent.get('/shifts/feed').set('X-FlexShift-App', 'worker').expect(403); // must change password first
    const changed = await agent.post('/auth/change-password').set('X-FlexShift-App', 'worker').set('X-Requested-With', 'flexshift')
      .send({ currentPassword: created.body.temporaryPassword, newPassword: 'CookiePass123!' }).expect(200);
    expect(([] as string[]).concat(changed.headers['set-cookie'] as any).join(';')).toMatch(/fs_worker=/);
    await agent.get('/shifts/feed').set('X-FlexShift-App', 'worker').expect(200); // new cookie works
  });

  it('exports invoices for accounting software, scoped and validated', async () => {
    const res = await get(adminT, `/invoices/organization/${apexId}/accounting.csv`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const [header, ...rows] = res.text.trim().split('\r\n');
    expect(header).toBe('"*ContactName","*InvoiceNumber","Reference","*InvoiceDate","*DueDate","Description","*Quantity","*UnitAmount","*AccountCode","*TaxType","Currency"');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatch(/"INV-\d{8}-[0-9A-F]{6}"/);
    expect(res.text).toContain('Relief cover at Richmond');
    // quantity x unit amount reproduces the invoice total
    const cells = rows[0].split('","').map((c) => c.replace(/"/g, ''));
    expect(Number(cells[6]) * Number(cells[7])).toBeGreaterThan(0);

    const custom = (await get(adminT, `/invoices/organization/${apexId}/accounting.csv?accountCode=400&taxType=Tax%20Exempt&from=2020-01-01&to=2099-01-01`).expect(200)).text;
    expect(custom).toContain('"400","Tax Exempt"');
    expect((await get(adminT, `/invoices/organization/${apexId}/accounting.csv?from=2099-01-01`).expect(200)).text.trim().split('\r\n')).toHaveLength(1); // header only
    await get(adminT, `/invoices/organization/${apexId}/accounting.csv?from=yesterday`).expect(400);
    await get(adminT, `/invoices/organization/${apexId}/accounting.csv?accountCode=1;DROP`).expect(400);
    await get(richmondT, `/invoices/organization/${apexId}/accounting.csv`).expect(403);
    await get(adminT, `/invoices/organization/${crestId}/accounting.csv`).expect(403);
  });

  it('tags every response with a request id and keeps a sane incoming one', async () => {
    const generated = await get(sarahT, '/auth/me').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await api().get('/auth/me').set('Authorization', `Bearer ${sarahT}`).set('X-Request-Id', 'trace-abc-12345').expect(200);
    expect(kept.headers['x-request-id']).toBe('trace-abc-12345');
    const replaced = await api().get('/auth/me').set('Authorization', `Bearer ${sarahT}`).set('X-Request-Id', 'bad id with spaces\t').expect(200);
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers the unauthenticated health probe with a database check', async () => {
    const res = await api().get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('onboards a customer with the create-organization command', async () => {
    const base = {
      orgName: 'Kiwi Care Pharmacies', adminEmail: 'Owner@KiwiCare.test', phone: '+64 9 555 0100',
      branchName: 'Ponsonby Pharmacy', branchCode: 'kiwi-pon-01', addressLine1: '12 Ponsonby Road', city: 'Auckland', postcode: '1011',
      managerEmail: 'manager@kiwicare.test',
    };
    const out = await createOrganization(prisma as any, base);
    expect(out.users.map((u) => u.role).sort()).toEqual(['FACILITY_MANAGER', 'ORG_ADMIN']);

    const branch = await prisma.facilityBranch.findUnique({ where: { id: out.branchId }, include: { manager: true, organization: true } });
    expect(branch.branchCode).toBe('KIWI-PON-01');
    expect(branch.country).toBe('NZ');
    expect(branch.manager.email).toBe('manager@kiwicare.test');
    expect(branch.organization.billingEmail).toBe('owner@kiwicare.test'); // defaults to the admin's email

    // the new people can sign in with their temporary password but must change it first
    const mgr = out.users.find((u) => u.role === 'FACILITY_MANAGER');
    const t = await login('manager@kiwicare.test', mgr.temporaryPassword);
    expect((await get(t, '/auth/me').expect(200)).body.mustChangePassword).toBe(true);
    await get(t, '/branches').expect(403);
    const t2 = (await post(t, '/auth/change-password', { currentPassword: mgr.temporaryPassword, newPassword: 'KiwiManager123!' }).expect(200)).body.accessToken;
    expect((await get(t2, '/branches').expect(200)).body.map((b: any) => b.id)).toEqual([out.branchId]); // sees only their branch

    // tenants stay separate: the new manager cannot see Apex data
    await get(t2, `/branches/${richmondId}`).expect(404);

    // readable errors, and nothing half-created
    const usersBefore = await prisma.user.count();
    await expect(createOrganization(prisma as any, { ...base, branchCode: 'OTHER-1', adminEmail: 'x@y.test', managerEmail: undefined })).rejects.toThrow(/already exists/); // same name
    await expect(createOrganization(prisma as any, { ...base, orgName: 'Another Org', adminEmail: 'z@y.test', managerEmail: undefined })).rejects.toThrow(/Branch code KIWI-PON-01 is already in use/);
    await expect(createOrganization(prisma as any, { ...base, orgName: 'Third Org', branchCode: 'T-1', adminEmail: 'owner@kiwicare.test', managerEmail: undefined })).rejects.toThrow(/already has an account/);
    await expect(createOrganization(prisma as any, { ...base, orgName: 'Fourth Org', branchCode: 'F-1', adminEmail: 'bad-email' })).rejects.toThrow(/valid email/);
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('accepts documents whatever type the browser reports, and still rejects disguised files', async () => {
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
    const upload = (name: string, body: Buffer, contentType?: string) =>
      api().post(`/relief-workers/${sarahId}/documents`).set('Authorization', `Bearer ${sarahT}`).field('type', 'OTHER')
        .attach('file', body, contentType === undefined ? { filename: name } : { filename: name, contentType });

    // Some Windows machines report no type, or a generic one, for perfectly good files
    await upload('passport.pdf', Buffer.from('%PDF-1.4 x'), 'application/octet-stream').expect(201);
    await upload('PASSPORT SCAN.PDF', Buffer.from('%PDF-1.4 x'), 'application/x-unknown').expect(201); // upper case, spaces
    await upload('photo.png', PNG, 'application/octet-stream').expect(201);
    await upload('photo.JPG', JPG, 'image/pjpeg').expect(201); // legacy MIME some systems report for JPEG
    await upload('photo.jpeg', JPG, 'image/jpeg').expect(201);

    // The extension and the bytes must agree, whatever the browser claims
    await upload('fake.pdf', Buffer.from('<html><script>1</script></html>'), 'application/pdf').expect(400);
    await upload('photo.png', Buffer.from('%PDF-1.4 x'), 'image/png').expect(400); // PDF bytes in a .png
    await upload('malware.exe', Buffer.from('MZ'), 'application/pdf').expect(400); // wrong extension, right claim
    await upload('noextension', Buffer.from('%PDF-1.4 x'), 'application/pdf').expect(400);
  });

  describe('New Zealand market', () => {
    let nzMgrT: string, nzAdminT: string, nzBranchId: string, nzOrgId: string;
    const wallClock = (d: Date, tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

    it('publishes the market definitions without signing in', async () => {
      const m = (await api().get('/markets').expect(200)).body;
      expect(m.default).toBe('NZ');
      const nz = m.markets.find((x: any) => x.code === 'NZ');
      expect(nz).toMatchObject({ currency: 'NZD', timezone: 'Pacific/Auckland', taxName: 'GST', taxRatePercent: 15, accountingTaxType: 'No GST' });
      expect(nz.extraMandatoryDocs).toContain('PRACTISING_CERTIFICATE');
      expect(nz.docLabels.DBS_POLICE_CHECK).toMatch(/Police vetting/);
      expect(m.markets.find((x: any) => x.code === 'GB')).toMatchObject({ currency: 'GBP', timezone: 'Europe/London' });
    });

    it('new organizations default to New Zealand and existing UK ones keep their market', async () => {
      const out = await createOrganization(prisma as any, {
        orgName: 'Aotearoa Pharmacies', adminEmail: 'admin@aotearoa.test', phone: '+64 9 555 0000', branchName: 'Queen Street', branchCode: 'AOT-01',
        addressLine1: '1 Queen Street', city: 'Auckland', postcode: '1010', managerEmail: 'mgr@aotearoa.test',
      });
      nzOrgId = out.organizationId; nzBranchId = out.branchId;
      const org = await prisma.organization.findUnique({ where: { id: nzOrgId } });
      expect(org).toMatchObject({ country: 'NZ', currency: 'NZD', timezone: 'Pacific/Auckland' });
      expect((await prisma.facilityBranch.findUnique({ where: { id: nzBranchId } })).country).toBe('NZ');
      expect(await prisma.organization.findUnique({ where: { id: apexId } })).toMatchObject({ country: 'GB', currency: 'GBP' });

      const signIn = async (email: string) => {
        const u = out.users.find((x) => x.email === email);
        const temp = await login(email, u.temporaryPassword);
        return (await post(temp, '/auth/change-password', { currentPassword: u.temporaryPassword, newPassword: 'AotearoaPass123!' }).expect(200)).body.accessToken as string;
      };
      nzMgrT = await signIn('mgr@aotearoa.test');
      nzAdminT = await signIn('admin@aotearoa.test');
      await expect(createOrganization(prisma as any, { orgName: 'Bad Market Co', adminEmail: 'a@bad.test', phone: '1', branchName: 'b', branchCode: 'BM-1', addressLine1: 'a', city: 'c', postcode: 'p', marketCode: 'FR' })).rejects.toThrow(/Unknown market/);
    });

    it('shifts carry their organization\'s currency, so each side sees the right symbol', async () => {
      const nz = (await post(nzMgrT, '/shifts', { branchId: nzBranchId, title: 'Auckland cover', startTime: at(80, 9), endTime: at(80, 17), hourlyRate: 45, visibility: 'PUBLIC_MARKETPLACE', instantBookEnabled: true }).expect(201)).body;
      expect(nz.currency).toBe('NZD');
      const gb = (await newShift(richmondT, { startTime: at(81, 9), endTime: at(81, 17) }).expect(201)).body;
      expect(gb.currency).toBe('GBP');
      // a worker sees each shift in its own currency in the feed
      const feed = (await get(davidT, '/shifts/feed').expect(200)).body;
      expect(feed.find((x: any) => x.id === nz.id)?.currency).toBe('NZD');
      expect(feed.find((x: any) => x.id === gb.id)?.currency).toBe('GBP');
    });

    it('requires the NZ practising certificate on top of the four everyone needs', async () => {
      const shift = (await post(nzMgrT, '/shifts', { branchId: nzBranchId, title: 'Certificate rule', startTime: at(82, 9), endTime: at(82, 17), hourlyRate: 45, visibility: 'PUBLIC_MARKETPLACE', instantBookEnabled: true }).expect(201)).body;
      // David holds the four base documents (verified) but no practising certificate
      const blocked = await post(davidT, `/shifts/${shift.id}/instant-book`).expect(403);
      expect(JSON.stringify(blocked.body)).toMatch(/PRACTISING_CERTIFICATE/);
      expect(JSON.stringify(blocked.body)).not.toMatch(/IDENTITY|RIGHT_TO_WORK|INDEMNITY/);
      // the same worker can still take a UK shift: that market does not need it
      const uk = (await newShift(richmondT, { instantBookEnabled: true, startTime: at(83, 9), endTime: at(83, 17) }).expect(201)).body;
      await post(davidT, `/shifts/${uk.id}/instant-book`).expect(201);
      // once a manager verifies a certificate, the NZ shift is bookable
      await prisma.complianceDocument.create({ data: { reliefWorkerId: davidId, type: 'PRACTISING_CERTIFICATE', fileUrl: 'seed/apc.pdf', status: 'VERIFIED', verifiedAt: new Date(), expiresAt: new Date(Date.now() + 300 * DAY) } });
      await post(davidT, `/shifts/${shift.id}/instant-book`).expect(201);
    });

    it('uses the organization\'s currency in notification wording and on the invoice', async () => {
      const shift = (await post(nzMgrT, '/shifts', { branchId: nzBranchId, title: 'Currency wording', startTime: at(84, 9), endTime: at(84, 17), hourlyRate: 45, visibility: 'PUBLIC_MARKETPLACE' }).expect(201)).body;
      await post(davidT, '/negotiations', { shiftId: shift.id, proposedHourlyRate: 52.5 }).expect(201);
      const note = (await get(nzMgrT, '/notifications').expect(200)).body.items.find((n: any) => n.type === 'NEGOTIATION_PROPOSED');
      expect(note.body).toContain('$52.50/h');
      expect(note.body).not.toContain('£');

      // a finished NZ shift -> timesheet -> invoice in NZD
      const start = new Date(Date.now() - 9 * 3_600_000), end = new Date(Date.now() - 3_600_000);
      const done = await prisma.shift.create({ data: { branchId: nzBranchId, title: 'Finished NZ shift', startTime: start, endTime: end, hourlyRate: 40, totalEstimatedPay: 320, currency: 'NZD', status: 'BOOKED', assignedWorkerId: davidId, visibility: 'PUBLIC_MARKETPLACE', requiredSystems: [], requiredAccreditations: [] } });
      const ts = (await post(davidT, '/timesheets/submit', { shiftId: done.id, clockInTime: start.toISOString(), clockOutTime: end.toISOString() }).expect(201)).body;
      const inv = (await patch(nzMgrT, `/timesheets/${ts.id}/approve`).expect(200)).body.invoice;
      expect(inv.currency).toBe('NZD');
      // the accounting export defaults to the NZ tax setting and states the currency
      const csv = (await get(nzAdminT, `/invoices/organization/${nzOrgId}/accounting.csv`).expect(200)).text;
      expect(csv).toContain('"No GST","NZD"');
      expect((await get(adminT, `/invoices/organization/${apexId}/accounting.csv`).expect(200)).text).not.toContain('"No GST"'); // UK default is "No VAT"
      expect((await get(nzAdminT, '/analytics/overview').expect(200)).body.currency).toBe('NZD');
      expect((await get(adminT, '/analytics/overview').expect(200)).body.currency).toBe('GBP');
    });

    it('lets an org admin change the market, applying its currency and timezone (existing shifts keep theirs)', async () => {
      await patch(nzAdminT, `/organizations/${nzOrgId}`, { country: 'FR' }).expect(400);
      const before = await prisma.shift.findFirst({ where: { branchId: nzBranchId } });
      const uk = (await patch(nzAdminT, `/organizations/${nzOrgId}`, { country: 'GB' }).expect(200)).body;
      expect(uk).toMatchObject({ country: 'GB', currency: 'GBP', timezone: 'Europe/London' });
      expect((await prisma.shift.findUnique({ where: { id: before.id } })).currency).toBe('NZD');
      const back = (await patch(nzAdminT, `/organizations/${nzOrgId}`, { country: 'NZ' }).expect(200)).body;
      expect(back).toMatchObject({ country: 'NZ', currency: 'NZD', timezone: 'Pacific/Auckland' });
    });

    it('computes local working hours in the organization\'s timezone, across daylight saving', () => {
      // NZDT (UTC+13) in January, NZST (UTC+12) in July, and the days around the 2026 changeovers
      expect(zonedTime(new Date(Date.UTC(2027, 0, 12)), 9, 0, 'Pacific/Auckland').toISOString()).toBe('2027-01-11T20:00:00.000Z');
      expect(zonedTime(new Date(Date.UTC(2026, 6, 15)), 9, 0, 'Pacific/Auckland').toISOString()).toBe('2026-07-14T21:00:00.000Z');
      expect(zonedTime(new Date(Date.UTC(2026, 8, 26)), 17, 30, 'Pacific/Auckland').toISOString()).toBe('2026-09-26T05:30:00.000Z'); // last day of NZST
      expect(zonedTime(new Date(Date.UTC(2026, 8, 28)), 9, 0, 'Pacific/Auckland').toISOString()).toBe('2026-09-27T20:00:00.000Z'); // first full NZDT day
      expect(zonedTime(new Date(Date.UTC(2026, 2, 29)), 9, 0, 'Europe/London').toISOString()).toBe('2026-03-29T08:00:00.000Z'); // UK BST starts
      expect(zonedTime(new Date(Date.UTC(2026, 9, 25)), 9, 0, 'Europe/London').toISOString()).toBe('2026-10-25T09:00:00.000Z'); // UK back to GMT
      expect(zonedTime(new Date(Date.UTC(2026, 5, 1)), 12, 0, 'UTC').toISOString()).toBe('2026-06-01T12:00:00.000Z');
    });

    it('creates leave vacancies at 09:00-17:30 local time for each market', async () => {
      const run = async (token: string, branchId: string, tz: string, name: string) => {
        const leave = (await post(token, '/leave', { branchId, staffName: name, staffRole: 'Pharmacist', startDate: at(120, 0), endDate: at(121, 0) }).expect(201)).body;
        await patch(token, `/leave/${leave.id}/review`, { status: 'APPROVED', autoCreateShiftVacancy: true }).expect(200);
        const made = await prisma.shift.findMany({ where: { branchId, notes: { contains: name } }, orderBy: { startTime: 'asc' } });
        expect(made.length).toBeGreaterThanOrEqual(2);
        for (const sh of made) { expect(wallClock(sh.startTime, tz)).toBe('09:00'); expect(wallClock(sh.endTime, tz)).toBe('17:30'); }
        return made[0];
      };
      const nz = await run(nzMgrT, nzBranchId, 'Pacific/Auckland', 'Nia NZ');
      const uk = await run(richmondT, richmondId, 'Europe/London', 'Una UK');
      expect(nz.currency).toBe('NZD');
      expect(uk.currency).toBe('GBP');
    });

    it('records the market a worker registers in, defaulting to New Zealand', async () => {
      const reg = (email: string, extra: object = {}) => api().post('/auth/register/relief-worker').send({ email, password: 'WorkerPass123!', firstName: 'A', lastName: 'B', phone: '+64 21 555 0100', registrationNumber: `REG-${email.slice(0, 6)}-${Date.now() % 1e6}`, ...extra });
      const def = (await reg('nzdefault@worker.test').expect(201)).body;
      expect(def.user.reliefProfile.country).toBe('NZ');
      const gb = (await reg('gbworker@worker.test', { country: 'GB' }).expect(201)).body;
      expect(gb.user.reliefProfile.country).toBe('GB');
      await reg('badworker@worker.test', { country: 'XX' }).expect(400);
      const tok = def.accessToken;
      expect((await patch(tok, '/relief-workers/me/preferences', { country: 'GB' }).expect(200)).body.country).toBe('GB');
    });
  });

  it('lets a super admin onboard a customer through the API, and nobody else', async () => {
    const body = {
      orgName: 'Southern Lakes Pharmacy', adminEmail: 'Boss@SouthernLakes.test', phone: '+64 3 555 0100', branchName: 'Queenstown', branchCode: 'sl-qtn-01',
      addressLine1: '5 Shotover Street', city: 'Queenstown', postcode: '9300', managerEmail: 'mgr@southernlakes.test',
    };
    await post(adminT, '/organizations/onboard', body).expect(403); // org admins cannot create other organizations
    await post(richmondT, '/organizations/onboard', body).expect(403);
    await post(sarahT, '/organizations/onboard', body).expect(403);
    await post(superT, '/organizations/onboard', { ...body, adminEmail: 'not-an-email' }).expect(400);
    await post(superT, '/organizations/onboard', { ...body, marketCode: 'FR' }).expect(400);
    await post(superT, '/organizations/onboard', { ...body, extra: 'field' }).expect(400); // strict validation

    const res = (await post(superT, '/organizations/onboard', body).expect(201)).body;
    expect(res.users.map((u: any) => u.role).sort()).toEqual(['FACILITY_MANAGER', 'ORG_ADMIN']);
    expect(res.users.every((u: any) => u.temporaryPassword.length >= 10)).toBe(true);
    const org = await prisma.organization.findUnique({ where: { id: res.organizationId } });
    expect(org).toMatchObject({ country: 'NZ', currency: 'NZD', timezone: 'Pacific/Auckland' }); // new customers default to NZ

    // plain-language problems come back as 400, with nothing half-created
    const before = await prisma.user.count();
    const dup = await post(superT, '/organizations/onboard', { ...body, adminEmail: 'other@southernlakes.test', managerEmail: undefined }).expect(400);
    expect(dup.body.message).toMatch(/already exists|already in use/);
    expect(await prisma.user.count()).toBe(before);

    // the overview lists every organization with its admins for the super admin, only its own for an org admin
    const all = (await get(superT, '/organizations').expect(200)).body;
    const created = all.find((o: any) => o.id === res.organizationId);
    expect(created.users.map((u: any) => u.email)).toEqual(['boss@southernlakes.test']);
    expect(created.users[0].mustChangePassword).toBe(true);
    expect(all.length).toBeGreaterThan(2);
    expect((await get(adminT, '/organizations').expect(200)).body.map((o: any) => o.id)).toEqual([apexId]);
  });
});
