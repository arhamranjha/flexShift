import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveStatus, LeaveType, ShiftStatus, ShiftVisibility } from '@prisma/client';
import { AccessService, AuthUser } from '../common/access.service';
import { SubmitLeaveDto } from './dto/leave.dto';

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
    if (new Date(data.endDate) < new Date(data.startDate)) {
      throw new BadRequestException('End date must not be before start date');
    }
    return this.prisma.leaveRequest.create({
      data: {
        branchId: data.branchId,
        staffName: data.staffName,
        staffRole: data.staffRole,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        leaveType: data.leaveType || LeaveType.ANNUAL,
        reason: data.reason,
        status: LeaveStatus.PENDING,
      },
    });
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
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequestException(`Leave request was already ${leave.status.toLowerCase()}`);
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
              start: new Date(day.getTime() + 9 * 3_600_000),
              end: new Date(day.getTime() + 17.5 * 3_600_000),
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
              notes: `Auto-generated backfill for ${leave.staffName} approved leave`,
            },
          });
        }
      }

      return updated;
    });
  }
}
