import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocStatus, ShiftStatus, ShiftVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { recomputeVerified } from '../relief-workers/verification';
import { CASCADE_DELAY_MINUTES } from '../shifts/shifts.service';

const DAY = 86_400_000;
const OPEN = [ShiftStatus.OPEN, ShiftStatus.IN_NEGOTIATION];

/** Scheduled background work. The run* methods are public so they can be triggered in tests. */
@Injectable()
export class JobsService {
  private log = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cascadeTick() {
    try { await this.runCascade(); } catch (e) { this.log.error(`cascade failed: ${(e as Error).message}`); }
  }

  @Cron('0 6 * * *')
  async expiryTick() {
    try { await this.runExpiry(); } catch (e) { this.log.error(`expiry failed: ${(e as Error).message}`); }
  }

  /**
   * Widens staff-bank shifts that have waited long enough: Tier 1 → Tier 2 → Tier 3 → public marketplace.
   * Each step is a conditional update, so overlapping runs (or several API instances) cannot double-advance.
   */
  async runCascade(now = new Date()) {
    // Shifts that were filled or cancelled no longer need a timer.
    await this.prisma.shift.updateMany({
      where: { nextCascadeAt: { not: null }, status: { notIn: OPEN } },
      data: { nextCascadeAt: null },
    });

    const due = await this.prisma.shift.findMany({
      where: { nextCascadeAt: { lte: now }, startTime: { gt: now }, status: { in: OPEN }, visibility: ShiftVisibility.STAFF_BANK_ONLY },
    });
    let advanced = 0;
    for (const shift of due) {
      const next = new Date(now.getTime() + CASCADE_DELAY_MINUTES * 60_000);
      if (shift.cascadeStage < 3) {
        const res = await this.prisma.shift.updateMany({
          where: { id: shift.id, cascadeStage: shift.cascadeStage, visibility: ShiftVisibility.STAFF_BANK_ONLY },
          data: { cascadeStage: shift.cascadeStage + 1, nextCascadeAt: next },
        });
        if (res.count) {
          advanced++;
          await this.notifications.notifyTierMembers(shift, shift.cascadeStage + 1);
        }
      } else {
        const res = await this.prisma.shift.updateMany({
          where: { id: shift.id, cascadeStage: 3, visibility: ShiftVisibility.STAFF_BANK_ONLY },
          data: { visibility: ShiftVisibility.PUBLIC_MARKETPLACE, nextCascadeAt: null },
        });
        if (res.count) {
          advanced++;
          await this.notifications.notifyRateMatches({ ...shift, visibility: ShiftVisibility.PUBLIC_MARKETPLACE });
        }
      }
    }
    return advanced;
  }

  /** Expires lapsed documents and sends 30-day / 7-day warnings (each at most once per document). */
  async runExpiry(now = new Date()) {
    const lapsed = await this.prisma.complianceDocument.findMany({
      where: { status: DocStatus.VERIFIED, expiresAt: { lte: now } },
    });
    for (const doc of lapsed) {
      await this.prisma.$transaction(async (tx) => {
        await tx.complianceDocument.update({ where: { id: doc.id }, data: { status: DocStatus.EXPIRED } });
        await recomputeVerified(tx, doc.reliefWorkerId);
      });
      const affected = await this.prisma.shift.findMany({
        where: { assignedWorkerId: doc.reliefWorkerId, status: ShiftStatus.BOOKED, startTime: { gt: now } },
        include: { branch: { select: { organization: { select: { requiredDocTypes: true } } } } },
      });
      for (const shift of affected) {
        await this.notifications.notifyBranchStaff(shift.branchId, {
          type: 'WORKER_COMPLIANCE_LAPSED',
          title: 'Booked worker\'s document has expired',
          body: `${doc.type} expired for the worker booked on "${shift.title}". Review the booking.`,
          link: '/rota',
        });
      }
      await this.notifications.notifyWorker(doc.reliefWorkerId, {
        type: 'DOCUMENT_EXPIRED',
        title: 'A compliance document has expired',
        body: `${doc.type}: upload a new one to keep booking shifts`,
        link: '/profile',
      });
    }

    let warned = 0;
    for (const [days, flag] of [[7, 'expiryNotified7'], [30, 'expiryNotified30']] as const) {
      const docs = await this.prisma.complianceDocument.findMany({
        where: {
          status: DocStatus.VERIFIED,
          expiresAt: { gt: now, lte: new Date(now.getTime() + days * DAY) },
          [flag]: false,
        },
      });
      for (const doc of docs) {
        // The 7-day warning also satisfies the 30-day one.
        await this.prisma.complianceDocument.update({
          where: { id: doc.id },
          data: days === 7 ? { expiryNotified7: true, expiryNotified30: true } : { expiryNotified30: true },
        });
        await this.notifications.notifyWorker(doc.reliefWorkerId, {
          type: 'DOCUMENT_EXPIRING',
          title: `A document expires within ${days} days`,
          body: `${doc.type} expires on ${doc.expiresAt!.toISOString().slice(0, 10)}`,
          link: '/profile',
        });
        warned++;
      }
    }
    return { expired: lapsed.length, warned };
  }
}
