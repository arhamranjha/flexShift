import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiError, createApiClient, documentFileProblem, documentMimeType, DOCUMENT_ACCEPT } from '@flexshift/api-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Drives the shared api-client (used by web-admin and worker-portal) against the real HTTP API,
 * so a client/DTO mismatch (the backend rejects unknown fields) shows up here, not in the browser.
 */
const PW = 'FlexShiftPass2026!';
const DAY = 86_400_000;
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

let app: INestApplication;
let baseUrl: string;
const clientFor = () => {
  let token: string | null = null;
  const api = createApiClient({ baseUrl, getToken: () => token });
  return { api, login: async (email: string, pw = PW) => { token = (await api.auth.login(email, pw)).accessToken; return api.auth.me(); } };
};

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl().then((u) => u.replace('[::1]', 'localhost'));
});
afterAll(() => app.close());

describe('api-client against the live API', () => {
  let admin: ReturnType<typeof clientFor>, mgr: ReturnType<typeof clientFor>, sarah: ReturnType<typeof clientFor>, david: ReturnType<typeof clientFor>;
  beforeAll(() => {
    // created here, not at describe time, because the server's port is only known after listen()
    [admin, mgr, sarah, david] = [clientFor(), clientFor(), clientFor(), clientFor()];
  });
  let richmondId: string, orgId: string, sarahId: string, davidId: string;
  let shiftId: string;

  it('signs in each role and loads scope', async () => {
    const [a, m, s, d] = await Promise.all([
      admin.login('admin@apexhealth.co.uk'), mgr.login('richmond.mgr@apexhealth.co.uk'), sarah.login('sarah.y@flexrelief.co.uk'), david.login('david.i@flexrelief.co.uk'),
    ]);
    orgId = a.organizationId!;
    richmondId = m.managedBranch!.id;
    sarahId = s.reliefProfile!.id;
    davidId = d.reliefProfile!.id;
    expect((await mgr.api.branches.list()).map((b) => b.id)).toEqual([richmondId]);
    expect((await admin.api.branches.list()).length).toBeGreaterThanOrEqual(2); // other suites may add branches
    await expect(sarah.api.branches.list()).rejects.toBeInstanceOf(ApiError);
  });

  it('dashboard and rota calls', async () => {
    const o = await mgr.api.analytics.overview();
    expect(Array.isArray(o.urgentShifts)).toBe(true);
    await admin.api.analytics.overview(richmondId);
    const rota = await mgr.api.branches.rota(richmondId, at(-1, 0), at(40, 0));
    expect(rota.length).toBeGreaterThan(0);
    expect((await mgr.api.branches.get(richmondId)).id).toBe(richmondId);
    expect((await mgr.api.analytics.marketRates('Pharmacist')).profession).toBe('Pharmacist');
  });

  it('shift form payloads: create, list, update, status, assign', async () => {
    // exactly the field set ShiftFormModal sends
    const created = await mgr.api.shifts.create({
      branchId: richmondId, title: 'Contract shift', roleRequired: 'Pharmacist', startTime: at(60, 9), endTime: at(60, 17), hourlyRate: 33,
      requiredSystems: ['ProScript'], requiredAccreditations: ['CPCS'], visibility: 'PUBLIC_MARKETPLACE', instantBookEnabled: false,
      isOvernight: false, isEmergency: false, notes: 'x',
    });
    shiftId = created.id;
    expect((await mgr.api.shifts.list({ branchId: richmondId, status: 'OPEN' })).some((s) => s.id === shiftId)).toBe(true);
    expect((await mgr.api.shifts.update(shiftId, { title: 'Contract shift v2', hourlyRate: 34, notes: 'y' })).title).toBe('Contract shift v2');
    await mgr.api.shifts.update(shiftId, { visibility: 'STAFF_BANK_ONLY' });
    await mgr.api.shifts.update(shiftId, { visibility: 'PUBLIC_MARKETPLACE' });
    const detail = await mgr.api.shifts.get(shiftId);
    expect(Array.isArray(detail.applications)).toBe(true);
  });

  it('worker portal: feed, watch, favourite, apply, negotiate', async () => {
    const feed = await sarah.api.shifts.feed({ tab: 'for_you' });
    expect(feed.some((s) => s.id === shiftId)).toBe(true);
    await sarah.api.shifts.feed({ tab: 'emergencies' });
    await sarah.api.shifts.feed({ tab: 'watching', minRate: 20, startDate: at(0, 0), endDate: at(90, 0) });
    expect((await sarah.api.workers.toggleWatch(shiftId)).watched).toBe(true);
    expect((await sarah.api.shifts.feed({ tab: 'watching' })).some((s) => s.id === shiftId)).toBe(true);
    expect((await sarah.api.workers.toggleFavourite(richmondId)).favourited).toBe(true);
    expect((await sarah.api.shifts.get(shiftId)).isWatched).toBe(true);

    await sarah.api.shifts.apply(shiftId, 'keen');
    const neg = await sarah.api.negotiations.create({ shiftId, proposedHourlyRate: 40, message: 'weekend premium' });
    const inbox = await mgr.api.negotiations.list({ status: 'PENDING' });
    expect(inbox.some((n) => n.id === neg.id)).toBe(true);
    await mgr.api.negotiations.counter(neg.id, 36);
    expect((await sarah.api.negotiations.mine()).find((n) => n.id === neg.id)!.status).toBe('COUNTERED');
    const booked = await sarah.api.negotiations.accept(neg.id);
    expect(booked.status).toBe('BOOKED');
    const diary = await sarah.api.shifts.mine();
    expect(diary.booked.some((s) => s.id === shiftId)).toBe(true);
    expect(diary.negotiations.length).toBeGreaterThan(0);
  });

  it('assign failures expose a problems list for the UI', async () => {
    const s = await mgr.api.shifts.create({
      branchId: richmondId, title: 'Needs Nexphase', startTime: at(61, 9), endTime: at(61, 17), hourlyRate: 30,
      requiredSystems: ['Nexphase'], visibility: 'PUBLIC_MARKETPLACE',
    });
    const err = await mgr.api.shifts.assign(s.id, davidId).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect((err.details as { problems: string[] }).problems.join()).toMatch(/Nexphase/);
    const forced = await admin.api.shifts.assign(s.id, davidId, true);
    expect(forced.status).toBe('BOOKED');
    await mgr.api.shifts.setStatus(s.id, 'OPEN'); // release
    await mgr.api.shifts.setStatus(s.id, 'CANCELLED', 'no longer needed');
  });

  it('staff bank and worker directory', async () => {
    const found = await mgr.api.workers.lookup('GPHC-2074319');
    expect(found.id).toBe(davidId);
    const m = await mgr.api.staffBank.add({ reliefWorkerId: davidId, branchId: richmondId, tier: 'TIER_3_RESERVE', customHourlyRate: 31, notes: 'n' });
    expect((await mgr.api.staffBank.list(orgId, richmondId)).some((x) => x.id === m.id)).toBe(true);
    await mgr.api.staffBank.update(m.id, { tier: 'TIER_1_PREFERRED', customHourlyRate: 32, isActive: true, notes: 'm' });
    await admin.api.staffBank.remove(m.id);
    expect((await mgr.api.workers.list({ search: 'sarah', isVerified: true })).length).toBeGreaterThan(0);
    const w = await mgr.api.workers.get(sarahId);
    expect(w.documents!.length).toBeGreaterThan(0);
  });

  it('concierge onboarding, document upload and the compliance desk', async () => {
    const reg = `GPHC-${Date.now().toString().slice(-7)}`;
    const w = await mgr.api.workers.concierge({
      email: `c${Date.now()}@flexrelief.co.uk`, firstName: 'Con', lastName: 'Cierge', phone: '07700900555', registrationNumber: reg,
      profession: 'Pharmacist', hourlyRate: 30, minimumShiftRate: 25, systemTags: ['ProScript'], accreditations: ['CPCS'], graduationYear: 2019,
      yearsCommunityExperience: 3,
    });
    expect(w.temporaryPassword.length).toBeGreaterThan(8);

    const self = clientFor();
    await self.login(w.user!.email, w.temporaryPassword);
    // staff upload on behalf of the concierge worker, using the exact FormData the UI builds
    const form = new FormData();
    form.append('type', 'IDENTITY');
    form.append('documentReference', 'PASSPORT-1');
    form.append('issueDate', at(-100, 0));
    form.append('expiresAt', at(900, 0));
    form.append('file', new Blob(['%PDF-1.4 hello'], { type: 'application/pdf' }), 'id.pdf');
    const doc = await mgr.api.workers.uploadDocument(w.id, form);
    expect(doc.status).toBe('PENDING');
    expect((await mgr.api.workers.documentQueue()).some((d) => d.id === doc.id)).toBe(true);
    expect((await (await mgr.api.workers.documentBlob(doc.id)).text())).toContain('%PDF-1.4');
    const verified = await mgr.api.workers.verifyDocument(doc.id, 'VERIFIED');
    expect(verified.status).toBe('VERIFIED');
    expect((await mgr.api.workers.documentQueue('VERIFIED')).some((d) => d.id === doc.id)).toBe(true);
    await expect(mgr.api.workers.verifyDocument(doc.id, 'REJECTED')).rejects.toThrow(/note/i);
  });

  it('document sharing: worker asks, organization lists, accepts or declines', async () => {
    const self = clientFor();
    const stamp = Date.now();
    const reg = await self.api.auth.registerWorker({
      email: `share${stamp}@worker.test`, password: 'WorkerPass123!', firstName: 'Client', lastName: 'Share', phone: '+64 21 555 0400', registrationNumber: `CSH-${stamp % 1e7}`,
    });
    await self.login(reg.user.email, 'WorkerPass123!');
    const org = await admin.api.organizations.get(orgId);

    const share = await self.api.documentShares.create({ organizationCode: org.code });
    expect(share).toMatchObject({ status: 'PENDING', organization: { id: orgId } });
    expect((await self.api.documentShares.mine()).map((s) => s.id)).toEqual([share.id]);
    expect((await self.api.documentShares.withdraw(share.id)).status).toBe('WITHDRAWN');
    await self.api.documentShares.create({ organizationId: orgId });

    const listed = (await mgr.api.documentShares.list({ status: 'PENDING' })).find((s) => s.id === share.id)!;
    expect(listed.reliefWorker!.lastName).toBe('Share');
    expect(Array.isArray(listed.reliefWorker!.documents)).toBe(true);
    expect((await admin.api.documentShares.accept(share.id, { tier: 'TIER_3_RESERVE', branchId: richmondId })).status).toBe('ACCEPTED');
    await expect(mgr.api.documentShares.decline(share.id)).rejects.toMatchObject({ status: 409 });
    const member = (await admin.api.staffBank.list(orgId)).find((m) => m.reliefWorkerId === reg.user.reliefProfile!.id)!;
    expect(member).toMatchObject({ tier: 'TIER_3_RESERVE', branchId: richmondId });
    await admin.api.staffBank.remove(member.id);
  });

  it('worker profile preferences and password change', async () => {
    const p = await sarah.api.workers.updatePreferences({ minimumShiftRate: 27, hourlyRate: 33, bio: 'hello', systemTags: ['ProScript', 'Columbus'], accreditations: ['CPCS'] });
    expect(Number(p.minimumShiftRate)).toBe(27);
    const w = await sarah.api.workers.get(sarahId);
    expect(w.documents!.length).toBeGreaterThan(0);
    const tmp = clientFor();
    const created = await admin.api.users.create({ email: `u${Date.now()}@apexhealth.co.uk`, role: 'FACILITY_MANAGER' });
    await tmp.login(created.email, created.temporaryPassword);
    const { accessToken } = await tmp.api.auth.changePassword(created.temporaryPassword, 'NewPassw0rd!');
    expect(accessToken.length).toBeGreaterThan(20);
    await admin.api.users.update(created.id, { isActive: false });
  });

  it('timesheets, invoices, export and leave', async () => {
    // a finished, booked shift for Sarah (created straight in the DB: the API refuses past shifts)
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const prisma = app.get(PrismaService);
    const start = new Date(Date.now() - 8 * 3_600_000), end = new Date(Date.now() - 1 * 3_600_000);
    const shift = await prisma.shift.create({
      data: { branchId: richmondId, currency: 'GBP', title: 'Contract finished', startTime: start, endTime: end, hourlyRate: 35, totalEstimatedPay: 245, status: 'BOOKED', assignedWorkerId: sarahId, visibility: 'PUBLIC_MARKETPLACE', requiredSystems: [], requiredAccreditations: [] },
    });
    const ts = await sarah.api.timesheets.submit({ shiftId: shift.id, clockInTime: start.toISOString(), clockOutTime: end.toISOString(), breakMinutes: 30, notes: 'busy' });
    expect((await sarah.api.timesheets.mine()).some((t) => t.id === ts.id)).toBe(true);
    expect((await mgr.api.timesheets.byBranch(richmondId, 'SUBMITTED')).some((t) => t.id === ts.id)).toBe(true);
    const { invoice } = await mgr.api.timesheets.approve(ts.id);
    expect((await admin.api.invoices.byOrganization(orgId, 'ISSUED')).some((i) => i.id === invoice.id)).toBe(true);
    const csv = await (await admin.api.invoices.exportCsv(orgId)).text();
    expect(csv).toContain(invoice.invoiceNumber);
    expect((await sarah.api.invoices.mine()).pendingPayout).toBeGreaterThan(0);
    await admin.api.invoices.pay(invoice.id, 'BACS-CONTRACT');

    const leave = await mgr.api.leave.submit({ branchId: richmondId, staffName: 'Pat', staffRole: 'Pharmacist', startDate: at(70, 9), endDate: at(70, 17), leaveType: 'STUDY', reason: 'exam' });
    expect((await mgr.api.leave.byBranch(richmondId)).some((l) => l.id === leave.id)).toBe(true);
    await mgr.api.leave.review(leave.id, 'APPROVED', true, 34);
  });

  it('live clock-in / clock-out through the client', async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const prisma = app.get(PrismaService);
    const live = await prisma.shift.create({
      data: {
        branchId: richmondId, currency: 'GBP', title: 'Contract live shift', startTime: new Date(Date.now() - 2 * 3_600_000), endTime: new Date(Date.now() + 5 * 3_600_000),
        hourlyRate: 30, totalEstimatedPay: 210, status: 'BOOKED', assignedWorkerId: sarahId, visibility: 'PUBLIC_MARKETPLACE', requiredSystems: [], requiredAccreditations: [],
      },
    });
    const started = await sarah.api.timesheets.clockIn(live.id);
    expect(started.status).toBe('IN_PROGRESS');
    expect((await sarah.api.shifts.get(live.id)).workerClockInAt).toBeTruthy();
    await prisma.shift.update({ where: { id: live.id }, data: { workerClockInAt: new Date(Date.now() - 2 * 3_600_000) } });
    const ts = await sarah.api.timesheets.clockOut({ shiftId: live.id, breakMinutes: 15, notes: 'ok' });
    expect(ts.status).toBe('SUBMITTED');
    expect((await sarah.api.shifts.get(live.id)).timesheet?.status).toBe('SUBMITTED');
    await expect(sarah.api.timesheets.clockOut({ shiftId: live.id })).rejects.toBeInstanceOf(ApiError);
  });

  it('settings, notifications, logout', async () => {
    expect((await admin.api.organizations.get(orgId)).branches!.length).toBeGreaterThanOrEqual(2);
    await admin.api.organizations.update(orgId, { name: 'Apex Healthcare Group', billingEmail: 'billing@apexhealth.co.uk', phone: '+44 20 7946 0910', requiredDocTypes: [] });
    await admin.api.branches.update(richmondId, { name: 'Richmond George Street Healthcare', phone: '+44 20 8940 1234' });
    expect((await admin.api.users.list()).length).toBeGreaterThan(0);
    const feed = await mgr.api.notifications.list();
    expect(feed.items.length).toBeGreaterThan(0);
    expect(typeof feed.emailEnabled).toBe('boolean');
    expect((await mgr.api.notifications.setEmailEnabled(false)).emailEnabled).toBe(false);
    expect((await mgr.api.notifications.list()).emailEnabled).toBe(false);
    await mgr.api.notifications.setEmailEnabled(true);
    await mgr.api.notifications.markAllRead();
    expect((await mgr.api.notifications.list()).unread).toBe(0);
    await david.api.auth.logout();
    await expect(david.api.auth.me()).rejects.toMatchObject({ status: 401 });
  });
});

describe('document file helpers (shared by both apps)', () => {
  it('decides the type from the extension, never from the browser-reported type', () => {
    expect(documentMimeType('Passport.PDF')).toBe('application/pdf');
    expect(documentMimeType('my scan.v2.jpeg')).toBe('image/jpeg');
    expect(documentMimeType('photo.JPG')).toBe('image/jpeg');
    expect(documentMimeType('a.png')).toBe('image/png');
    expect(documentMimeType('virus.exe')).toBeNull();
    expect(documentMimeType('noextension')).toBeNull();
    expect(documentMimeType('archive.pdf.zip')).toBeNull();
  });

  it('flags only genuinely unusable files', () => {
    expect(documentFileProblem({ name: 'ok.pdf', size: 1024 })).toBeUndefined();
    expect(documentFileProblem({ name: 'ok.pdf', size: 11 * 1024 * 1024 })).toMatch(/10MB/);
    expect(documentFileProblem({ name: 'ok.pdf', size: 0 })).toMatch(/empty/);
    expect(documentFileProblem({ name: 'ok.docx', size: 10 })).toMatch(/PDF, PNG or JPEG/);
  });

  it('lists extensions first in the file-dialog filter (what Windows dialogs use)', () => {
    expect(DOCUMENT_ACCEPT.split(',').slice(0, 4)).toEqual(['.pdf', '.png', '.jpg', '.jpeg']);
  });
});
