import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveStatus, LeaveType, ShiftStatus, ShiftVisibility } from '@prisma/client';

@Injectable()
export class LeaveService {
  constructor(private prisma: PrismaService) {}

  async findByBranch(branchId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { branchId },
      include: {
        reviewedBy: { select: { id: true, email: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async submitLeave(data: {
    branchId: string;
    staffName: string;
    staffRole: string;
    startDate: string | Date;
    endDate: string | Date;
    leaveType?: LeaveType;
    reason?: string;
  }) {
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
    id: string,
    status: LeaveStatus,
    reviewerUserId: string,
    autoCreateShiftVacancy: boolean = false,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Leave request not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status,
          reviewedById: reviewerUserId,
          reviewedAt: new Date(),
          autoShiftVacanciesCreated: autoCreateShiftVacancy,
        },
      });

      if (status === LeaveStatus.APPROVED && autoCreateShiftVacancy) {
        // Automatically create an open shift vacancy on the branch rota
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const defaultRate = 30.0;
        const totalEstimatedPay = Number((hours * defaultRate).toFixed(2));

        await tx.shift.create({
          data: {
            branchId: leave.branchId,
            title: `Relief Cover: ${leave.staffRole} Leave Cover`,
            roleRequired: leave.staffRole,
            startTime: start,
            endTime: end,
            hourlyRate: defaultRate,
            totalEstimatedPay,
            visibility: ShiftVisibility.STAFF_BANK_ONLY,
            status: ShiftStatus.OPEN,
            notes: `Auto-generated backfill for ${leave.staffName} approved leave`,
          },
        });
      }

      return updated;
    });
  }
}
