import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimesheetStatus, InvoiceStatus, ShiftStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AccessService, AuthUser } from '../common/access.service';
import { ClockInDto, ClockOutDto, SubmitTimesheetDto } from './dto/timesheet.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MINUTE = 60_000;
/** Clock-in may be up to 1h before the shift starts; clock-out up to 4h after it ends. */
const EARLY_CLOCK_IN = 60 * MINUTE;
const LATE_CLOCK_OUT = 4 * 60 * MINUTE;

@Injectable()
export class TimesheetsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
  ) {}

  async submitTimesheet(reliefWorkerId: string, dto: SubmitTimesheetDto) {
    const data = { ...dto, reliefWorkerId };
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

    if (shift.status !== ShiftStatus.BOOKED && shift.status !== ShiftStatus.IN_PROGRESS) {
      throw new BadRequestException(`Timesheets cannot be submitted for a ${shift.status} shift`);
    }

    const clockIn = new Date(data.clockInTime);
    const clockOut = new Date(data.clockOutTime);
    const breakMins = data.breakMinutes || 0;
    if (clockOut.getTime() > Date.now()) throw new BadRequestException('Clock-out time cannot be in the future');
    if (clockIn.getTime() < shift.startTime.getTime() - EARLY_CLOCK_IN) {
      throw new BadRequestException('Clock-in is more than 1 hour before the shift start');
    }
    if (clockOut.getTime() > shift.endTime.getTime() + LATE_CLOCK_OUT) {
      throw new BadRequestException('Clock-out is more than 4 hours after the shift end');
    }

    const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60) - breakMins;
    if (totalMinutes < 1) {
      throw new BadRequestException('Worked time must be at least one minute after the break is deducted');
    }

    const billableHours = Number((totalMinutes / 60).toFixed(2));
    const hourlyRateApplied = Number(shift.hourlyRate);
    const totalPayout = Number((billableHours * hourlyRateApplied).toFixed(2));

    const values = {
      clockInTime: clockIn,
      clockOutTime: clockOut,
      breakMinutes: breakMins,
      billableHours,
      hourlyRateApplied,
      totalPayout,
      notes: data.notes,
      status: TimesheetStatus.SUBMITTED,
    };

    // Re-submission is only allowed while the timesheet is still open; the status guard is part of
    // the UPDATE so a concurrent approval cannot be overwritten. First submission relies on the
    // unique shiftId (a racing duplicate surfaces as 409).
    if (existingTs) {
      const res = await this.prisma.timesheet.updateMany({
        where: { shiftId: data.shiftId, status: { in: [TimesheetStatus.SUBMITTED, TimesheetStatus.PENDING_SUBMISSION, TimesheetStatus.DISPUTED] } },
        data: values,
      });
      if (res.count === 0) throw new ConflictException('Timesheet was already processed');
    } else {
      await this.prisma.timesheet.create({
        data: { shiftId: data.shiftId, reliefWorkerId: data.reliefWorkerId, branchId: shift.branchId, ...values },
      });
    }
    await this.notifications.notifyBranchStaff(shift.branchId, {
      type: 'TIMESHEET_SUBMITTED', title: 'Timesheet awaiting approval', body: shift.title, link: '/timesheets',
    });
    return this.prisma.timesheet.findUnique({ where: { shiftId: data.shiftId }, include: { shift: true, branch: true } });
  }

  /** Starts the shift: allowed from 1h before the start until the shift ends, once, for the assigned worker. */
  async clockIn(reliefWorkerId: string, dto: ClockInDto) {
    const shift = await this.prisma.shift.findUnique({ where: { id: dto.shiftId } });
    if (!shift || shift.assignedWorkerId !== reliefWorkerId) throw new NotFoundException('Shift not found');
    if (shift.status !== ShiftStatus.BOOKED) throw new BadRequestException(`You cannot clock in to a ${shift.status} shift`);
    const now = Date.now();
    if (now < shift.startTime.getTime() - EARLY_CLOCK_IN) throw new BadRequestException('Too early: you can clock in up to 1 hour before the start');
    if (now > shift.endTime.getTime()) throw new BadRequestException('This shift has already ended: submit a timesheet instead');

    const res = await this.prisma.shift.updateMany({
      where: { id: dto.shiftId, assignedWorkerId: reliefWorkerId, status: ShiftStatus.BOOKED, workerClockInAt: null },
      data: { status: ShiftStatus.IN_PROGRESS, workerClockInAt: new Date(now) },
    });
    if (res.count === 0) throw new ConflictException('You are already clocked in');
    await this.notifications.notifyBranchStaff(shift.branchId, {
      type: 'WORKER_CLOCKED_IN', title: 'Worker clocked in', body: shift.title, link: '/rota',
    });
    return this.prisma.shift.findUnique({ where: { id: dto.shiftId }, include: { branch: true } });
  }

  /** Ends the shift and submits the timesheet from the recorded clock-in to now. */
  async clockOut(reliefWorkerId: string, dto: ClockOutDto) {
    const shift = await this.prisma.shift.findUnique({ where: { id: dto.shiftId } });
    if (!shift || shift.assignedWorkerId !== reliefWorkerId) throw new NotFoundException('Shift not found');
    if (shift.status !== ShiftStatus.IN_PROGRESS || !shift.workerClockInAt) {
      throw new BadRequestException('You are not clocked in to this shift');
    }
    if (await this.prisma.timesheet.findUnique({ where: { shiftId: dto.shiftId }, select: { id: true } })) {
      throw new ConflictException('A timesheet has already been submitted for this shift');
    }
    return this.submitTimesheet(reliefWorkerId, {
      shiftId: dto.shiftId,
      clockInTime: shift.workerClockInAt.toISOString(),
      clockOutTime: new Date().toISOString(),
      breakMinutes: dto.breakMinutes,
      notes: dto.notes,
    });
  }

  async approveTimesheet(timesheetId: string, user: AuthUser) {
    const approverUserId = user.id;
    const ts = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, branch: this.access.branchScope(user) },
      include: { branch: true, shift: true },
    });
    if (!ts) throw new NotFoundException('Timesheet not found');
    if (ts.status !== TimesheetStatus.SUBMITTED) {
      throw new BadRequestException(`Only submitted timesheets can be approved (current: ${ts.status})`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const res = await tx.timesheet.updateMany({
        where: { id: timesheetId, status: TimesheetStatus.SUBMITTED },
        data: {
          status: TimesheetStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: approverUserId,
        },
      });
      if (res.count === 0) throw new ConflictException('Timesheet was already processed');
      const updatedTs = await tx.timesheet.findUniqueOrThrow({ where: { id: timesheetId } });

      // The shift must still be held by this worker (a released/cancelled shift cannot be paid out).
      const shiftRes = await tx.shift.updateMany({
        where: {
          id: ts.shiftId,
          assignedWorkerId: ts.reliefWorkerId,
          status: { in: [ShiftStatus.BOOKED, ShiftStatus.IN_PROGRESS] },
        },
        data: { status: ShiftStatus.COMPLETED },
      });
      if (shiftRes.count === 0) throw new ConflictException('This shift is no longer assigned to the worker');

      // Auto-generate digital invoice
      const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
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
    await this.notifications.notifyWorker(ts.reliefWorkerId, {
      type: 'TIMESHEET_APPROVED', title: 'Timesheet approved: invoice issued', body: `${result.invoice.invoiceNumber} · £${Number(result.invoice.totalAmount).toFixed(2)}`, link: '/finance',
    });
    return result;
  }

  async findByBranch(user: AuthUser, branchId: string, status?: TimesheetStatus) {
    await this.access.assertBranch(user, branchId);
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
