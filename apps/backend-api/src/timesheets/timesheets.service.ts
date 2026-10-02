import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimesheetStatus, InvoiceStatus, ShiftStatus } from '@prisma/client';

@Injectable()
export class TimesheetsService {
  constructor(private prisma: PrismaService) {}

  async submitTimesheet(data: {
    shiftId: string;
    reliefWorkerId: string;
    clockInTime: string | Date;
    clockOutTime: string | Date;
    breakMinutes?: number;
    notes?: string;
  }) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: data.shiftId },
      include: { branch: true },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.assignedWorkerId !== data.reliefWorkerId) {
      throw new BadRequestException('Worker is not assigned to this shift');
    }

    const existingTs = await this.prisma.timesheet.findUnique({
      where: { shiftId: data.shiftId },
    });

    if (
      existingTs &&
      (existingTs.status === TimesheetStatus.APPROVED ||
        existingTs.status === TimesheetStatus.SETTLED)
    ) {
      throw new BadRequestException(
        'Cannot modify a timesheet that has already been approved or settled',
      );
    }

    const clockIn = new Date(data.clockInTime);
    const clockOut = new Date(data.clockOutTime);
    const breakMins = data.breakMinutes || 0;

    const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60) - breakMins;
    if (totalMinutes <= 0) {
      throw new BadRequestException('Invalid duration after break deduction');
    }

    const billableHours = Number((totalMinutes / 60).toFixed(2));
    const hourlyRateApplied = Number(shift.hourlyRate);
    const totalPayout = Number((billableHours * hourlyRateApplied).toFixed(2));

    return this.prisma.timesheet.upsert({
      where: { shiftId: data.shiftId },
      create: {
        shiftId: data.shiftId,
        reliefWorkerId: data.reliefWorkerId,
        branchId: shift.branchId,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        breakMinutes: breakMins,
        billableHours,
        hourlyRateApplied,
        totalPayout,
        notes: data.notes,
        status: TimesheetStatus.SUBMITTED,
      },
      update: {
        clockInTime: clockIn,
        clockOutTime: clockOut,
        breakMinutes: breakMins,
        billableHours,
        hourlyRateApplied,
        totalPayout,
        notes: data.notes,
        status: TimesheetStatus.SUBMITTED,
      },
      include: { shift: true, branch: true },
    });
  }

  async approveTimesheet(timesheetId: string, approverUserId: string) {
    const ts = await this.prisma.timesheet.findUnique({
      where: { id: timesheetId },
      include: { branch: true, shift: true },
    });
    if (!ts) throw new NotFoundException('Timesheet not found');
    if (ts.status === TimesheetStatus.APPROVED || ts.status === TimesheetStatus.SETTLED) {
      throw new BadRequestException('Timesheet is already approved');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedTs = await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: TimesheetStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: approverUserId,
        },
      });

      // Update shift status to COMPLETED
      await tx.shift.update({
        where: { id: ts.shiftId },
        data: { status: ShiftStatus.COMPLETED },
      });

      // Auto-generate digital invoice
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14); // 14-day net terms

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          organizationId: ts.branch.organizationId,
          reliefWorkerId: ts.reliefWorkerId,
          timesheetId: ts.id,
          totalAmount: ts.totalPayout,
          status: InvoiceStatus.ISSUED,
          dueAt: dueDate,
        },
      });

      return { timesheet: updatedTs, invoice };
    });
  }

  async findByBranch(branchId: string, status?: TimesheetStatus) {
    return this.prisma.timesheet.findMany({
      where: {
        branchId,
        ...(status ? { status } : {}),
      },
      include: {
        reliefWorker: true,
        shift: true,
        approvedBy: { select: { id: true, email: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async findByWorker(reliefWorkerId: string) {
    return this.prisma.timesheet.findMany({
      where: { reliefWorkerId },
      include: {
        branch: { select: { id: true, name: true, branchCode: true, city: true } },
        shift: true,
        invoice: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
