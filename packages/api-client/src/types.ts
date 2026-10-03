export type Role = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'FACILITY_MANAGER' | 'RELIEF_WORKER';
export type ShiftStatus = 'DRAFT' | 'OPEN' | 'IN_NEGOTIATION' | 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ShiftVisibility = 'STAFF_BANK_ONLY' | 'PUBLIC_MARKETPLACE' | 'EMERGENCY_BROADCAST';
export type NegotiationStatus = 'PENDING' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED';
export type DocType =
  | 'IDENTITY' | 'RIGHT_TO_WORK' | 'DBS_POLICE_CHECK' | 'INDEMNITY_INSURANCE'
  | 'SAFEGUARDING_L3' | 'PRACTICE_DECLARATION' | 'PRACTISING_CERTIFICATE' | 'MANDATORY_TRAINING' | 'OTHER';
export type DocStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
export type TimesheetStatus = 'PENDING_SUBMISSION' | 'SUBMITTED' | 'APPROVED' | 'DISPUTED' | 'SETTLED';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveType = 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'STUDY' | 'UNPAID';
export type StaffBankTier = 'TIER_1_PREFERRED' | 'TIER_2_REGULAR' | 'TIER_3_RESERVE';

/** Prisma Decimal columns arrive as strings. */
export type Money = string | number;

export interface ReliefProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  registrationNumber: string;
  profession: string;
  hourlyRate?: Money | null;
  minimumShiftRate?: Money | null;
  bio?: string | null;
  systemTags: string[];
  accreditations: string[];
  isVerified: boolean;
  yearsCommunityExperience?: number;
  yearsHospitalExperience?: number;
  /** Market the worker is registered in (NZ | GB): selects registration wording. */
  country?: string;
  documents?: ComplianceDocument[];
  user?: { id: string; email: string; isActive?: boolean };
  staffBankMemberships?: StaffBankMember[];
  _count?: { assignedShifts: number; timesheets: number };
}

export interface User {
  id: string;
  email: string;
  role: Role;
  organizationId?: string | null;
  mustChangePassword?: boolean;
  reliefProfile?: ReliefProfile | null;
  managedBranch?: { id: string; name: string } | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  code: string;
  billingEmail: string;
  phone: string;
  logoUrl?: string | null;
  /** Extra credentials required on top of the platform-wide mandatory four. */
  requiredDocTypes?: DocType[];
  /** Market code (NZ | GB) with the currency and timezone it implies. */
  country?: string;
  currency?: string;
  timezone?: string;
  /** Organization admins (the list endpoint includes them for the super-admin overview). */
  users?: { id: string; email: string; isActive: boolean; mustChangePassword: boolean; lastLoginAt?: string | null }[];
  branches?: FacilityBranch[];
  _count?: { branches: number; staffBankMembers: number; users: number };
}

export interface FacilityBranch {
  id: string;
  organizationId: string;
  name: string;
  branchCode: string;
  addressLine1?: string;
  city: string;
  postcode: string;
  phone: string;
  email?: string | null;
  isActive?: boolean;
  organization?: { id: string; name: string; code?: string; logoUrl?: string | null };
  manager?: { id: string; email: string } | null;
  _count?: { shifts: number; staffBankMembers: number };
}

export interface Shift {
  id: string;
  branchId: string;
  branch?: { id: string; name: string; city?: string; postcode?: string; phone?: string; organization?: { id: string; name: string; logoUrl?: string | null } };
  title: string;
  roleRequired: string;
  startTime: string;
  endTime: string;
  hourlyRate: Money;
  totalEstimatedPay: Money;
  /** ISO currency of this shift's money (set from the organization when the shift is created). */
  currency?: string;
  requiredSystems: string[];
  requiredAccreditations: string[];
  visibility: ShiftVisibility;
  status: ShiftStatus;
  instantBookEnabled: boolean;
  isOvernight: boolean;
  isEmergency: boolean;
  notes?: string | null;
  assignedWorkerId?: string | null;
  assignedWorker?: Pick<ReliefProfile, 'id' | 'firstName' | 'lastName'> & Partial<ReliefProfile> | null;
  applications?: ShiftApplication[];
  negotiations?: Negotiation[];
  timesheet?: { id: string; status: TimesheetStatus } | null;
  _count?: { applications: number; negotiations: number };
  isWatched?: boolean;
  isFavouriteBranch?: boolean;
  /** Staff-bank cascade: 1 = Tier 1 only, 2 = Tiers 1-2, 3 = whole bank. */
  cascadeStage?: number;
  nextCascadeAt?: string | null;
  /** Set while the assigned worker is clocked in. */
  workerClockInAt?: string | null;
}

export interface ShiftApplication {
  id: string;
  shiftId: string;
  reliefWorkerId: string;
  status: 'APPLIED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  appliedAt: string;
  notes?: string | null;
  reliefWorker?: ReliefProfile;
  shift?: Shift;
}

export interface Negotiation {
  id: string;
  shiftId: string;
  reliefWorkerId: string;
  proposedHourlyRate: Money;
  counterOfferRate?: Money | null;
  message?: string | null;
  status: NegotiationStatus;
  createdAt: string;
  reliefWorker?: Pick<ReliefProfile, 'id' | 'firstName' | 'lastName'> & Partial<ReliefProfile>;
  shift?: Shift;
}

export interface ComplianceDocument {
  id: string;
  reliefWorkerId: string;
  type: DocType;
  documentReference?: string | null;
  issueDate?: string | null;
  expiresAt?: string | null;
  status: DocStatus;
  verificationNotes?: string | null;
  createdAt: string;
  reliefWorker?: Pick<ReliefProfile, 'id' | 'firstName' | 'lastName' | 'profession' | 'registrationNumber'>;
}

export interface StaffBankMember {
  id: string;
  organizationId: string;
  branchId?: string | null;
  reliefWorkerId: string;
  tier: StaffBankTier;
  customHourlyRate?: Money | null;
  isActive: boolean;
  notes?: string | null;
  reliefWorker?: ReliefProfile;
  branch?: { id: string; name: string; branchCode: string } | null;
  organization?: { id: string; name: string };
}

export interface Timesheet {
  id: string;
  shiftId: string;
  reliefWorkerId: string;
  branchId: string;
  clockInTime: string;
  clockOutTime: string;
  breakMinutes: number;
  billableHours: Money;
  hourlyRateApplied: Money;
  totalPayout: Money;
  status: TimesheetStatus;
  submittedAt: string;
  notes?: string | null;
  reliefWorker?: ReliefProfile;
  shift?: Shift;
  branch?: { id: string; name: string; branchCode?: string; city?: string };
  invoice?: Invoice | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  organizationId: string;
  reliefWorkerId: string;
  totalAmount: Money;
  currency: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  reliefWorker?: Pick<ReliefProfile, 'id' | 'firstName' | 'lastName' | 'registrationNumber'>;
  organization?: { id: string; name: string; logoUrl?: string | null };
  timesheet?: Timesheet | null;
}

export interface LeaveRequest {
  id: string;
  branchId: string;
  staffName: string;
  staffRole: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  status: LeaveStatus;
  reason?: string | null;
  autoShiftVacanciesCreated: boolean;
}

export interface StaffUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  organizationId?: string | null;
  managedBranch?: { id: string; name: string } | null;
}

export interface OverviewStats {
  openShifts: number;
  emergencyOpen: number;
  upcomingBooked: number;
  fillRate: number | null;
  staffBankHeadcount: number;
  /** Null when invoices in more than one currency exist (see monthSpendByCurrency). */
  monthSpend: number | null;
  monthSpendByCurrency?: { currency: string; total: number }[];
  /** Currency of the totals; null when the organizations in scope use more than one. */
  currency?: string | null;
  pendingTimesheets: number;
  pendingLeave: number;
  pendingNegotiations: number;
  pendingDocuments: number;
  urgentShifts: Shift[];
}

export interface WorkerDiary {
  booked: Shift[];
  applications: ShiftApplication[];
  negotiations: Negotiation[];
  watching: Shift[];
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface FinanceSummary {
  /** Null when the worker has invoices in more than one currency: use byCurrency, totals are never mixed. */
  totalEarned: number | null;
  pendingPayout: number | null;
  byCurrency?: { currency: string; totalEarned: number; pendingPayout: number }[];
  invoices: Invoice[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  unread: number;
  items: AppNotification[];
  /** Whether email copies are on for this user; null when the server has no email configured. */
  emailEnabled: boolean | null;
}

export interface MarketRates {
  profession: string;
  sampleSize: number;
  /** True when too few shifts/organizations exist to publish a benchmark. */
  insufficientData?: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
  average: number | null;
}

export type MarketCode = 'NZ' | 'GB';

/** Country-specific rules and wording, served by GET /markets. */
export interface Market {
  code: MarketCode;
  name: string;
  currency: string;
  timezone: string;
  locale: string;
  taxName: string;
  taxRatePercent: number;
  accountingTaxType: string;
  /** Professional register(s) a worker's registration number belongs to. */
  registrationBody: string;
  /** Credentials required in this market on top of the four every worker needs. */
  extraMandatoryDocs: DocType[];
  docLabels: Partial<Record<DocType, string>>;
  professions: string[];
  /** Suggestions only; free text is always allowed. */
  systems: string[];
  accreditations: string[];
  phoneExample: string;
}

export interface MarketList {
  default: MarketCode;
  markets: Market[];
}

export interface OnboardOrganizationInput {
  orgName: string;
  adminEmail: string;
  billingEmail?: string;
  phone: string;
  branchName: string;
  branchCode: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  country?: string;
  branchPhone?: string;
  managerEmail?: string;
  /** NZ (default) or GB. */
  marketCode?: MarketCode;
}

export interface OnboardOrganizationResult {
  organizationId: string;
  organizationCode: string;
  branchId: string;
  /** One-time temporary passwords: shown once, each person must change theirs at first sign-in. */
  users: { email: string; role: Role; temporaryPassword: string }[];
}
