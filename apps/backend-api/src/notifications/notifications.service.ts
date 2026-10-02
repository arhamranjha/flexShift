import { Injectable, Logger } from '@nestjs/common';
import { Role, ShiftVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  /** App-relative link; each frontend resolves it against its own routes. */
  link?: string;
}

/** Tier rank used by the shift cascade: Tier 1 sees a shift first, Tier 3 last. */
export const TIER_RANK = { TIER_1_PREFERRED: 1, TIER_2_REGULAR: 2, TIER_3_RESERVE: 3 } as const;

/**
 * In-app notifications. Sending is best-effort: a failure here must never break the business
 * action that triggered it. (Email delivery can be layered on by mirroring `notifyUsers`.)
 */
@Injectable()
export class NotificationsService {
  private log = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async notifyUsers(userIds: string[], n: NotificationInput) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    try {
      await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
    } catch (e) {
      this.log.warn(`notify failed: ${(e as Error).message}`);
    }
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

  /** Staff-bank members whose tier has just been released to this shift. */
  async notifyTierMembers(shift: { id: string; title: string; branchId: string; hourlyRate: unknown }, stage: number) {
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
      body: `${shift.title} at £${Number(shift.hourlyRate).toFixed(2)}/h`,
      link: `/shifts/${shift.id}`,
    });
  }

  /** Verified workers of the right profession whose minimum rate threshold this shift meets. */
  async notifyRateMatches(shift: { id: string; title: string; roleRequired: string; hourlyRate: unknown; visibility: ShiftVisibility }) {
    if (shift.visibility === ShiftVisibility.STAFF_BANK_ONLY) return;
    const workers = await this.prisma.reliefProfile.findMany({
      where: {
        isVerified: true,
        profession: shift.roleRequired,
        minimumShiftRate: { not: null, lte: Number(shift.hourlyRate) },
        user: { isActive: true },
      },
      select: { userId: true },
      take: 500,
    });
    await this.notifyUsers(workers.map((w) => w.userId), {
      type: 'SHIFT_MATCH',
      title: 'A shift meets your minimum rate',
      body: `${shift.title} at £${Number(shift.hourlyRate).toFixed(2)}/h`,
      link: `/shifts/${shift.id}`,
    });
  }

  /**
   * Emergency broadcasts ignore minimum-rate thresholds: every verified, active worker of the right
   * profession is told straight away.
   */
  async notifyEmergency(shift: { id: string; title: string; roleRequired: string; hourlyRate: unknown }) {
    const workers = await this.prisma.reliefProfile.findMany({
      where: { isVerified: true, profession: shift.roleRequired, user: { isActive: true } },
      select: { userId: true },
      take: 500,
    });
    await this.notifyUsers(workers.map((w) => w.userId), {
      type: 'EMERGENCY_SHIFT',
      title: 'Emergency shift needs cover',
      body: `${shift.title} at £${Number(shift.hourlyRate).toFixed(2)}/h`,
      link: `/shifts/${shift.id}`,
    });
  }

  list(userId: string) {
    return Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]).then(([items, unread]) => ({ unread, items }));
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
