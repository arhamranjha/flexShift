import { Injectable, Logger } from '@nestjs/common';
import { DocStatus, Prisma, Role, ShiftVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from './mailer.service';
import { formatMoney, marketFor } from '../common/markets';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  /** App-relative link; each frontend resolves it against its own routes. */
  link?: string;
}

/** Tier rank used by the shift cascade: Tier 1 sees a shift first, Tier 3 last. */
export const TIER_RANK = { TIER_1_PREFERRED: 1, TIER_2_REGULAR: 2, TIER_3_RESERVE: 3 } as const;

/** Notification types worth an email. High-volume ones (new-shift alerts, clock-ins, queue items) stay in-app only. */
const EMAILED_TYPES = new Set([
  'NEGOTIATION_PROPOSED', 'NEGOTIATION_COUNTERED', 'NEGOTIATION_ACCEPTED', 'NEGOTIATION_REJECTED',
  'SHIFT_BOOKED', 'TIMESHEET_APPROVED', 'INVOICE_PAID',
  'DOCUMENT_VERIFIED', 'DOCUMENT_REJECTED', 'DOCUMENT_EXPIRING', 'DOCUMENT_EXPIRED',
  'EMERGENCY_SHIFT', 'WORKER_COMPLIANCE_LAPSED',
]);

/** Types whose body contains text typed by a manager or a worker: emailed with a link only, never the text. */
const FREE_TEXT_TYPES = new Set(['EMERGENCY_SHIFT', 'SHIFT_BOOKED', 'WORKER_COMPLIANCE_LAPSED', 'DOCUMENT_REJECTED', 'NEGOTIATION_PROPOSED']);

const trimSlash = (u: string) => u.replace(/\/+$/, '');

/**
 * In-app notifications. Sending is best-effort: a failure here must never break the business
 * action that triggered it. (Email delivery can be layered on by mirroring `notifyUsers`.)
 */
@Injectable()
export class NotificationsService {
  private log = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}

  async notifyUsers(userIds: string[], n: NotificationInput) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    try {
      await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
    } catch (e) {
      this.log.warn(`notify failed: ${(e as Error).message}`);
      return;
    }
    // Real SMTP delivery can be slow, so it must not hold up the request that triggered it.
    // The json driver (tests) is instant and awaited so outcomes are deterministic.
    const sending = this.email(ids, n);
    if (this.mailer.driver === 'json') await sending;
    else void sending;
  }

  /** Mirrors important notifications to email for users who have not opted out. */
  private async email(userIds: string[], n: NotificationInput) {
    if (!this.mailer.enabled || !EMAILED_TYPES.has(n.type)) return;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true, emailNotifications: true },
        select: { email: true, role: true },
      });
      const adminUrl = trimSlash(process.env.ADMIN_APP_URL || 'http://localhost:3000');
      const workerUrl = trimSlash(process.env.WORKER_APP_URL || 'http://localhost:3001');
      await Promise.all(
        users.map((u) => {
          const base = u.role === Role.RELIEF_WORKER ? workerUrl : adminUrl;
          const lines = [FREE_TEXT_TYPES.has(n.type) ? 'Open FlexShift for the details.' : n.body, n.link ? `Open: ${base}${n.link}` : '', '', 'You can turn these emails off from the bell menu in FlexShift.'];
          return this.mailer.send({ to: u.email, subject: n.title, text: lines.filter((l) => l !== undefined && l !== null).join('\n').trim() });
        }),
      );
    } catch (e) {
      this.log.warn(`email fan-out failed: ${(e as Error).message}`);
    }
  }

  /** Platform operators (super admins): they review documents for workers no organization has invited yet. */
  async notifyPlatformAdmins(n: NotificationInput) {
    const admins = await this.prisma.user.findMany({ where: { role: Role.SUPER_ADMIN, isActive: true }, select: { id: true } });
    await this.notifyUsers(admins.map((a) => a.id), n);
  }

  async notifyWorker(workerId: string, n: NotificationInput) {
    const w = await this.prisma.reliefProfile.findUnique({ where: { id: workerId }, select: { userId: true } });
    if (w) await this.notifyUsers([w.userId], n);
  }

  /** The branch manager plus the organization admins. */
  async notifyBranchStaff(branchId: string, n: NotificationInput) {
    const branch = await this.prisma.facilityBranch.findUnique({ where: { id: branchId }, select: { managerId: true, organizationId: true } });
    if (!branch) return;
    const admins = await this.prisma.user.findMany({
      where: { organizationId: branch.organizationId, role: Role.ORG_ADMIN, isActive: true },
      select: { id: true },
    });
    await this.notifyUsers([...admins.map((a) => a.id), ...(branch.managerId ? [branch.managerId] : [])], n);
  }

  /**
   * Narrows a worker query to those who hold every extra credential the shift's organization needs (its market's own, such as
   * the NZ practising certificate, plus anything the organization adds), so alerts do not go to workers who would be refused.
   */
  private async canBookWhere(branchId: string, where: Prisma.ReliefProfileWhereInput): Promise<Prisma.ReliefProfileWhereInput> {
    const branch = await this.prisma.facilityBranch.findUnique({
      where: { id: branchId },
      select: { organization: { select: { country: true, requiredDocTypes: true } } },
    });
    const extras = [...new Set([...marketFor(branch?.organization.country).extraMandatoryDocs, ...(branch?.organization.requiredDocTypes ?? [])])];
    const now = new Date();
    return {
      AND: [
        where,
        ...extras.map((type) => ({
          documents: { some: { type, status: DocStatus.VERIFIED, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
        })),
      ],
    };
  }

  /** Pages through every matching worker in a stable order (capped at 5000 so one shift cannot fan out forever). */
  private async workerUserIds(where: Prisma.ReliefProfileWhereInput) {
    const ids: string[] = [];
    let cursor: string | undefined;
    while (ids.length < 5000) {
      const page = await this.prisma.reliefProfile.findMany({
        where,
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (!page.length) break;
      ids.push(...page.map((w) => w.userId));
      cursor = page[page.length - 1].id;
      if (page.length < 500) break;
    }
    return ids;
  }

  /** Staff-bank members whose tier has just been released to this shift. */
  async notifyTierMembers(shift: { id: string; title: string; branchId: string; hourlyRate: unknown; currency?: string }, stage: number) {
    const branch = await this.prisma.facilityBranch.findUnique({ where: { id: shift.branchId }, select: { organizationId: true } });
    if (!branch) return;
    const members = await this.prisma.staffBankMember.findMany({
      where: { organizationId: branch.organizationId, isActive: true, OR: [{ branchId: null }, { branchId: shift.branchId }] },
      select: { tier: true, reliefWorker: { select: { userId: true } } },
    });
    const ids = members.filter((m) => TIER_RANK[m.tier] === stage).map((m) => m.reliefWorker.userId);
    await this.notifyUsers(ids, {
      type: 'NEW_SHIFT',
      title: 'New shift for your staff bank tier',
      body: `${shift.title} at ${formatMoney(shift.hourlyRate as number, shift.currency)}/h`,
      link: `/shifts/${shift.id}`,
    });
  }

  /** Verified workers of the right profession whose minimum rate threshold this shift meets. */
  async notifyRateMatches(shift: { id: string; title: string; branchId: string; roleRequired: string; hourlyRate: unknown; visibility: ShiftVisibility; currency?: string }) {
    if (shift.visibility === ShiftVisibility.STAFF_BANK_ONLY) return;
    const userIds = await this.workerUserIds(await this.canBookWhere(shift.branchId, {
      isVerified: true,
      profession: shift.roleRequired,
      minimumShiftRate: { not: null, lte: Number(shift.hourlyRate) },
      user: { isActive: true },
    }));
    await this.notifyUsers(userIds, {
      type: 'SHIFT_MATCH',
      title: 'A shift meets your minimum rate',
      body: `${shift.title} at ${formatMoney(shift.hourlyRate as number, shift.currency)}/h`,
      link: `/shifts/${shift.id}`,
    });
  }

  /**
   * Emergency broadcasts ignore minimum-rate thresholds: every verified, active worker of the right
   * profession is told straight away.
   */
  async notifyEmergency(shift: { id: string; title: string; branchId: string; roleRequired: string; hourlyRate: unknown; currency?: string }) {
    const userIds = await this.workerUserIds(await this.canBookWhere(shift.branchId, { isVerified: true, profession: shift.roleRequired, user: { isActive: true } }));
    await this.notifyUsers(userIds, {
      type: 'EMERGENCY_SHIFT',
      title: 'Emergency shift needs cover',
      body: `${shift.title} at ${formatMoney(shift.hourlyRate as number, shift.currency)}/h`,
      link: `/shifts/${shift.id}`,
    });
  }

  list(userId: string) {
    return Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { emailNotifications: true } }),
    ]).then(([items, unread, prefs]) => ({
      unread,
      items,
      emailEnabled: this.mailer.enabled ? (prefs?.emailNotifications ?? true) : null, // null: email is not configured
    }));
  }

  async setEmailPreference(userId: string, emailEnabled: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { emailNotifications: emailEnabled } });
    return { emailEnabled };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { success: true };
  }
}
