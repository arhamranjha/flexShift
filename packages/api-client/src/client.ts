import type * as T from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  baseUrl: string;
  /**
   * Browser apps: the session lives in an HttpOnly cookie the server sets, so scripts never see a token.
   * Naming the app selects its own cookie and turns on credentialed requests plus the CSRF header.
   */
  app?: 'admin' | 'worker';
  /** Bearer token for non-browser callers (tools, tests). Browser apps return null. */
  getToken?: () => string | null;
  /** Called on any 401 so the app can drop the session. */
  onUnauthorized?: () => void;
}

type Query = Record<string, string | number | boolean | undefined | null>;

const qs = (q?: Query) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function createApiClient(opts: ClientOptions) {
  async function raw(path: string, init: RequestInit = {}) {
    const token = opts.getToken?.() ?? null;
    const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
    const res = await fetch(`${opts.baseUrl}${path}`, {
      ...init,
      ...(opts.app ? { credentials: 'include' as const } : {}),
      headers: {
        ...(opts.app ? { 'X-FlexShift-App': opts.app, 'X-Requested-With': 'flexshift' } : {}),
        ...(init.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (res.status === 401) opts.onUnauthorized?.();
      const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
      throw new ApiError(res.status, msg || res.statusText || 'Request failed', body);
    }
    return res;
  }
  const json = async <R>(path: string, init?: RequestInit) => (await raw(path, init)).json() as Promise<R>;
  const get = <R>(path: string, q?: Query) => json<R>(path + qs(q));
  const send = <R>(method: string, path: string, body?: unknown) =>
    json<R>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    auth: {
      login: (email: string, password: string) => send<T.LoginResponse>('POST', '/auth/login', { email, password }),
      registerWorker: (body: Record<string, unknown>) => send<T.LoginResponse>('POST', '/auth/register/relief-worker', body),
      me: () => get<T.User>('/auth/me'),
      logout: () => send<{ success: boolean }>('POST', '/auth/logout'),
      changePassword: (currentPassword: string, newPassword: string) =>
        send<{ accessToken: string }>('POST', '/auth/change-password', { currentPassword, newPassword }),
    },
    analytics: {
      overview: (branchId?: string) => get<T.OverviewStats>('/analytics/overview', { branchId }),
      marketRates: (profession?: string) => get<T.MarketRates>('/analytics/market-rates', { profession }),
    },
    notifications: {
      list: () => get<T.NotificationFeed>('/notifications'),
      markRead: (id: string) => send<{ success: boolean }>('POST', `/notifications/${id}/read`),
      markAllRead: () => send<{ success: boolean }>('POST', '/notifications/read-all'),
      setEmailEnabled: (emailEnabled: boolean) => send<{ emailEnabled: boolean }>('PATCH', '/notifications/preferences', { emailEnabled }),
    },
    organizations: {
      list: () => get<T.Organization[]>('/organizations'),
      get: (id: string) => get<T.Organization>(`/organizations/${id}`),
      update: (id: string, body: Partial<Pick<T.Organization, 'name' | 'billingEmail' | 'phone' | 'logoUrl' | 'requiredDocTypes'>>) =>
        send<T.Organization>('PATCH', `/organizations/${id}`, body),
    },
    users: {
      list: () => get<T.StaffUser[]>('/users'),
      create: (body: { email: string; role: 'ORG_ADMIN' | 'FACILITY_MANAGER'; branchId?: string; organizationId?: string }) =>
        send<T.StaffUser & { temporaryPassword: string }>('POST', '/users', body),
      update: (id: string, body: { isActive?: boolean }) => send<T.StaffUser>('PATCH', `/users/${id}`, body),
    },
    branches: {
      list: () => get<T.FacilityBranch[]>('/branches'),
      get: (id: string) => get<T.FacilityBranch>(`/branches/${id}`),
      rota: (id: string, startDate?: string, endDate?: string) => get<T.Shift[]>(`/branches/${id}/rota`, { startDate, endDate }),
      create: (body: Record<string, unknown>) => send<T.FacilityBranch>('POST', '/branches', body),
      update: (id: string, body: Record<string, unknown>) => send<T.FacilityBranch>('PATCH', `/branches/${id}`, body),
    },
    shifts: {
      list: (q?: { branchId?: string; status?: T.ShiftStatus; startDate?: string; endDate?: string }) => get<T.Shift[]>('/shifts', q),
      get: (id: string) => get<T.Shift>(`/shifts/${id}`),
      create: (body: Record<string, unknown>) => send<T.Shift>('POST', '/shifts', body),
      update: (id: string, body: Record<string, unknown>) => send<T.Shift>('PATCH', `/shifts/${id}`, body),
      setStatus: (id: string, status: T.ShiftStatus, reason?: string) => send<T.Shift>('PATCH', `/shifts/${id}/status`, { status, reason }),
      assign: (id: string, reliefWorkerId: string, overrideSkills?: boolean) =>
        send<T.Shift>('PATCH', `/shifts/${id}/assign`, { reliefWorkerId, overrideSkills }),
      feed: (q?: { tab?: string; minRate?: number; profession?: string; startDate?: string; endDate?: string }) => get<T.Shift[]>('/shifts/feed', q),
      mine: () => get<T.WorkerDiary>('/shifts/mine'),
      instantBook: (id: string) => send<T.Shift>('POST', `/shifts/${id}/instant-book`),
      apply: (id: string, notes?: string) => send<T.ShiftApplication>('POST', `/shifts/${id}/apply`, { notes }),
    },
    negotiations: {
      list: (q?: { branchId?: string; status?: T.NegotiationStatus }) => get<T.Negotiation[]>('/negotiations', q),
      mine: () => get<T.Negotiation[]>('/negotiations/mine'),
      create: (body: { shiftId: string; proposedHourlyRate: number; message?: string }) => send<T.Negotiation>('POST', '/negotiations', body),
      accept: (id: string) => send<T.Shift>('PATCH', `/negotiations/${id}/accept`),
      counter: (id: string, counterOfferRate: number) => send<T.Negotiation>('PATCH', `/negotiations/${id}/counter`, { counterOfferRate }),
      reject: (id: string) => send<T.Negotiation>('PATCH', `/negotiations/${id}/reject`),
    },
    staffBank: {
      list: (orgId: string, branchId?: string) => get<T.StaffBankMember[]>(`/staff-bank/organization/${orgId}`, { branchId }),
      add: (body: { reliefWorkerId: string; branchId?: string; tier?: T.StaffBankTier; customHourlyRate?: number; notes?: string; organizationId?: string }) =>
        send<T.StaffBankMember>('POST', '/staff-bank', body),
      update: (id: string, body: { tier?: T.StaffBankTier; customHourlyRate?: number | null; isActive?: boolean; notes?: string }) =>
        send<T.StaffBankMember>('PATCH', `/staff-bank/${id}`, body),
      remove: (id: string) => send<T.StaffBankMember>('DELETE', `/staff-bank/${id}`),
    },
    workers: {
      list: (q?: { search?: string; isVerified?: boolean; profession?: string; systemTag?: string; accreditation?: string }) =>
        get<T.ReliefProfile[]>('/relief-workers', q),
      get: (id: string) => get<T.ReliefProfile>(`/relief-workers/${id}`),
      lookup: (registrationNumber: string) =>
        get<Pick<T.ReliefProfile, 'id' | 'firstName' | 'lastName' | 'profession' | 'registrationNumber' | 'isVerified'>>('/relief-workers/lookup', { registrationNumber }),
      concierge: (body: Record<string, unknown>) => send<T.ReliefProfile & { temporaryPassword: string }>('POST', '/relief-workers/concierge', body),
      documentQueue: (status?: T.DocStatus) => get<T.ComplianceDocument[]>('/relief-workers/documents/queue', { status }),
      verifyDocument: (docId: string, status: 'VERIFIED' | 'REJECTED', notes?: string) =>
        send<T.ComplianceDocument>('PATCH', `/relief-workers/documents/${docId}/verify`, { status, notes }),
      uploadDocument: (workerId: string, form: FormData) => json<T.ComplianceDocument>(`/relief-workers/${workerId}/documents`, { method: 'POST', body: form }),
      /** Documents need the bearer token, so fetch the bytes and hand back a Blob (use URL.createObjectURL). */
      documentBlob: async (docId: string) => (await raw(`/relief-workers/documents/${docId}/file`)).blob(),
      updatePreferences: (body: { minimumShiftRate?: number | null; hourlyRate?: number | null; bio?: string; systemTags?: string[]; accreditations?: string[] }) =>
        send<T.ReliefProfile>('PATCH', '/relief-workers/me/preferences', body),
      toggleWatch: (shiftId: string) => send<{ watched: boolean }>('POST', `/relief-workers/me/watch-shift/${shiftId}`),
      toggleFavourite: (branchId: string) => send<{ favourited: boolean }>('POST', `/relief-workers/me/favourite-branch/${branchId}`),
    },
    timesheets: {
      byBranch: (branchId: string, status?: T.TimesheetStatus) => get<T.Timesheet[]>(`/timesheets/branch/${branchId}`, { status }),
      mine: () => get<T.Timesheet[]>('/timesheets/my-timesheets'),
      submit: (body: { shiftId: string; clockInTime: string; clockOutTime: string; breakMinutes?: number; notes?: string }) =>
        send<T.Timesheet>('POST', '/timesheets/submit', body),
      approve: (id: string) => send<{ timesheet: T.Timesheet; invoice: T.Invoice }>('PATCH', `/timesheets/${id}/approve`),
      clockIn: (shiftId: string) => send<T.Shift>('POST', '/timesheets/clock-in', { shiftId }),
      clockOut: (body: { shiftId: string; breakMinutes?: number; notes?: string }) => send<T.Timesheet>('POST', '/timesheets/clock-out', body),
    },
    invoices: {
      byOrganization: (orgId: string, status?: T.InvoiceStatus) => get<T.Invoice[]>(`/invoices/organization/${orgId}`, { status }),
      mine: () => get<T.FinanceSummary>('/invoices/my-finance'),
      pay: (id: string, paymentReference: string) => send<T.Invoice>('PATCH', `/invoices/${id}/pay`, { paymentReference }),
      exportCsv: async (orgId: string, status?: T.InvoiceStatus) => (await raw(`/invoices/organization/${orgId}/export.csv${qs({ status })}`)).blob(),
    },
    leave: {
      byBranch: (branchId: string) => get<T.LeaveRequest[]>(`/leave/branch/${branchId}`),
      submit: (body: { branchId: string; staffName: string; staffRole: string; startDate: string; endDate: string; leaveType?: T.LeaveType; reason?: string }) =>
        send<T.LeaveRequest>('POST', '/leave', body),
      review: (id: string, status: 'APPROVED' | 'REJECTED', autoCreateShiftVacancy?: boolean, backfillHourlyRate?: number) =>
        send<T.LeaveRequest>('PATCH', `/leave/${id}/review`, { status, autoCreateShiftVacancy, backfillHourlyRate }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
