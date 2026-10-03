import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveStatus, LeaveType, Prisma, ShiftStatus, ShiftVisibility } from '@prisma/client';
import { AccessService, AuthUser } from '../common/access.service';
import { SubmitLeaveDto } from './dto/leave.dto';
import { zonedTime } from '../common/time';

/** Canonical form of a person's name: Unicode-normalised, single spaces, trimmed. */
const normalizeName = (name: string) => name.normalize('NFKC').replace(/\s+/g, ' ').trim();

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async findByBranch(user: AuthUser, branchId: string) {
    await this.access.assertBranch(user, branchId);
    return this.prisma.leaveRequest.findMany({
      where: { branchId },
      include: {
        reviewedBy: { select: { id: true, email: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async submitLeave(user: AuthUser, data: SubmitLeaveDto) {
    await this.access.assertBranch(user, data.branchId);
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end < start) throw new BadRequestException('End date must not be before start date');
    const staffName = normalizeName(data.staffName);
    if (!staffName) throw new BadRequestException('Staff name is required');
    // The advisory lock serialises submissions for the same person, so two concurrent requests
    // cannot both pass the overlap check.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.branchId + ':' + staffName.toLowerCase()}))`;
      await this.assertNoOverlap(data.branchId, staffName, start, end, undefined, undefined, tx);
      return tx.leaveRequest.create({
        data: {
          branchId: data.branchId,
          staffName,
          staffRole: data.staffRole.trim(),
          startDate: start,
          endDate: end,
          leaveType: data.leaveType || LeaveType.ANNUAL,
          reason: data.reason,
          status: LeaveStatus.PENDING,
        },
      });
    });
  }

  /** The same person cannot have two overlapping pending/approved leave requests at a branch. */
  private async assertNoOverlap(
    branchId: string,
    staffName: string,
    start: Date,
    end: Date,
    excludeId?: string,
    statuses: LeaveStatus[] = [LeaveStatus.PENDING, LeaveStatus.APPROVED],
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const clash = await client.leaveRequest.findFirst({
      where: {
        branchId,
        staffName: { equals: normalizeName(staffName), mode: 'insensitive' },
        status: { in: statuses },
        startDate: { lte: end },
        endDate: { gte: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(
        `${clash.staffName} already has ${clash.status.toLowerCase()} leave from ${clash.startDate.toISOString().slice(0, 10)} to ${clash.endDate.toISOString().slice(0, 10)}`,
      );
    }
  }

  async reviewLeave(
    user: AuthUser,
    id: string,
    status: LeaveStatus,
    autoCreateShiftVacancy: boolean = false,
    backfillHourlyRate?: number,
  ) {
    const reviewerUserId = user.id;
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, branch: this.access.branchScope(user) },
      include: { branch: { include: { organization: { select: { timezone: true, currency: true } } } } },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequestException(`Leave request was already ${leave.status.toLowerCase()}`);
    }
    if (status === LeaveStatus.APPROVED) {
      await this.assertNoOverlap(leave.branchId, leave.staffName, leave.startDate, leave.endDate, leave.id, [LeaveStatus.APPROVED]);
    }

    return this.prisma.$transaction(async (tx) => {
      const willBackfill = status === LeaveStatus.APPROVED && autoCreateShiftVacancy;
      const res = await tx.leaveRequest.updateMany({
        where: { id, status: LeaveStatus.PENDING },
        data: {
          status,
          reviewedById: reviewerUserId,
          reviewedAt: new Date(),
          autoShiftVacanciesCreated: willBackfill,
        },
      });
      if (res.count === 0) throw new BadRequestException('Leave request was already reviewed');
      const updated = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });

      if (willBackfill) {
        // Short leave (a single shift window) maps to one vacancy; longer leave to one 09:00-17:30
        // vacancy per day. Days already in the past are skipped.
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const windows: { start: Date; end: Date }[] = [];
        if (end.getTime() - start.getTime() <= 16 * 3_600_000 && end > start) {
          windows.push({ start, end });
        } else {
          const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
          const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
          for (; day.getTime() <= last; day.setUTCDate(day.getUTCDate() + 1)) {
            windows.push({
              start: zonedTime(day, 9, 0, leave.branch.organization.timezone),
              end: zonedTime(day, 17, 30, leave.branch.organization.timezone),
            });
          }
        }
        const future = windows.filter((w) => w.end.getTime() > Date.now());
        if (future.length === 0) {
          throw new BadRequestException('This leave is entirely in the past, so there is nothing to backfill');
        }
        const rate = backfillHourlyRate ?? 30;
        for (const w of future) {
          const hours = (w.end.getTime() - w.start.getTime()) / 3_600_000;
          await tx.shift.create({
            data: {
              branchId: leave.branchId,
              title: `Relief Cover: ${leave.staffRole} Leave Cover`,
              roleRequired: leave.staffRole,
              startTime: w.start,
              endTime: w.end,
              hourlyRate: rate,
              totalEstimatedPay: Number((hours * rate).toFixed(2)),
              visibility: ShiftVisibility.STAFF_BANK_ONLY,
              status: ShiftStatus.OPEN,
              currency: leave.branch.organization.currency,
              notes: `Auto-generated backfill for ${leave.staffName} approved leave`,
            },
          });
        }
      }

      return updated;
    });
  }
}
