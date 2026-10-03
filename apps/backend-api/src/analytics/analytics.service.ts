import { Injectable } from '@nestjs/common';
import { DocStatus, InvoiceStatus, LeaveStatus, NegotiationStatus, ShiftStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, AuthUser } from '../common/access.service';

const DAY = 86_400_000;
const OPEN = [ShiftStatus.OPEN, ShiftStatus.IN_NEGOTIATION];
const FILLED = [ShiftStatus.BOOKED, ShiftStatus.IN_PROGRESS, ShiftStatus.COMPLETED];

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async overview(user: AuthUser, branchId?: string) {
    if (branchId) await this.access.assertBranch(user, branchId);
    const branches = await this.prisma.facilityBranch.findMany({
      where: { AND: [this.access.branchScope(user), branchId ? { id: branchId } : {}] },
      select: { id: true, organizationId: true },
    });
    const branchIds = branches.map((b) => b.id);
    const orgIds = [...new Set(branches.map((b) => b.organizationId))];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Money totals are in one currency only when every organization in scope shares it.
    const currencies = [...new Set((await this.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { currency: true } })).map((o) => o.currency))];

    const inScope = { branchId: { in: branchIds } };
    const [openShifts, emergencyOpen, upcomingBooked, windowTotal, windowFilled, urgentShifts, staffBankHeadcount, monthSpend, pendingTimesheets, pendingLeave, pendingNegotiations, pendingDocuments] =
      await Promise.all([
        this.prisma.shift.count({ where: { ...inScope, status: { in: OPEN }, startTime: { gte: now } } }),
        this.prisma.shift.count({ where: { ...inScope, status: { in: OPEN }, startTime: { gte: now }, isEmergency: true } }),
        this.prisma.shift.count({ where: { ...inScope, status: ShiftStatus.BOOKED, startTime: { gte: now } } }),
        this.prisma.shift.count({
          where: { ...inScope, startTime: { gte: new Date(now.getTime() - 30 * DAY), lte: new Date(now.getTime() + 30 * DAY) }, status: { notIn: [ShiftStatus.DRAFT, ShiftStatus.CANCELLED] } },
        }),
        this.prisma.shift.count({
          where: { ...inScope, startTime: { gte: new Date(now.getTime() - 30 * DAY), lte: new Date(now.getTime() + 30 * DAY) }, status: { in: FILLED } },
        }),
        this.prisma.shift.findMany({
          where: { ...inScope, status: { in: OPEN }, startTime: { gte: now, lte: new Date(now.getTime() + 3 * DAY) } },
          orderBy: [{ isEmergency: 'desc' }, { startTime: 'asc' }],
          take: 10,
          include: { branch: { select: { id: true, name: true } }, _count: { select: { applications: true, negotiations: true } } },
        }),
        this.prisma.staffBankMember.count({
          where: { organizationId: { in: orgIds }, isActive: true, OR: [{ branchId: null }, { branchId: { in: branchIds } }] },
        }),
        this.prisma.invoice.aggregate({
          where: {
            timesheet: { branchId: { in: branchIds } },
            issuedAt: { gte: monthStart },
            status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] },
          },
          _sum: { totalAmount: true },
        }),
        this.prisma.timesheet.count({ where: { ...inScope, status: TimesheetStatus.SUBMITTED } }),
        this.prisma.leaveRequest.count({ where: { ...inScope, status: LeaveStatus.PENDING } }),
        this.prisma.shiftNegotiation.count({
          where: { shift: inScope, status: NegotiationStatus.PENDING },
        }),
        this.prisma.complianceDocument.count({ where: { status: DocStatus.PENDING, reliefWorker: this.access.workerScope(user) } }),
      ]);

    return {
      openShifts,
      emergencyOpen,
      upcomingBooked,
      fillRate: windowTotal ? Math.round((windowFilled / windowTotal) * 100) : null,
      staffBankHeadcount,
      monthSpend: Number(monthSpend._sum.totalAmount ?? 0),
      currency: currencies.length === 1 ? currencies[0] : null,
      pendingTimesheets,
      pendingLeave,
      pendingNegotiations,
      pendingDocuments,
      urgentShifts,
    };
  }

  /**
   * Platform-wide hourly-rate benchmark for a profession over the last 90 days (booked or completed
   * shifts only). Returns nulls below 3 samples so individual organizations cannot be identified.
   */
  async marketRates(profession = 'Pharmacist') {
    const rows = await this.prisma.shift.findMany({
      where: {
        roleRequired: profession,
        status: { in: [ShiftStatus.BOOKED, ShiftStatus.IN_PROGRESS, ShiftStatus.COMPLETED] },
        startTime: { gte: new Date(Date.now() - 90 * DAY) },
      },
      select: { hourlyRate: true, branch: { select: { organizationId: true } } },
      take: 5000,
    });
    const rates = rows.map((r) => Number(r.hourlyRate)).sort((a, b) => a - b);
    // Percentiles of tiny samples are just individual rates, so require several shifts from several organizations.
    const orgs = new Set(rows.map((r) => r.branch.organizationId));
    if (rates.length < 5 || orgs.size < 3) return { profession, sampleSize: 0, insufficientData: true, p25: null, median: null, p75: null, average: null };
    const at = (q: number) => rates[Math.min(rates.length - 1, Math.floor(q * (rates.length - 1) + 0.5))];
    const round = (n: number) => Number(n.toFixed(2));
    return {
      profession,
      sampleSize: rates.length,
      insufficientData: false,
      p25: round(at(0.25)),
      median: round(at(0.5)),
      p75: round(at(0.75)),
      average: round(rates.reduce((a, b) => a + b, 0) / rates.length),
    };
  }
}
