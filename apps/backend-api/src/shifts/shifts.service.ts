import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftStatus, ShiftVisibility, ApplicationStatus, NegotiationStatus } from '@prisma/client';

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    branchId: string;
    title: string;
    roleRequired?: string;
    startTime: string | Date;
    endTime: string | Date;
    hourlyRate: number;
    requiredSystems?: string[];
    requiredAccreditations?: string[];
    visibility?: ShiftVisibility;
    instantBookEnabled?: boolean;
    isOvernight?: boolean;
    isEmergency?: boolean;
    notes?: string;
  }) {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (end <= start) {
      throw new BadRequestException('End time must be after start time');
    }

    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const totalEstimatedPay = Number((hours * data.hourlyRate).toFixed(2));

    return this.prisma.shift.create({
      data: {
        branchId: data.branchId,
        title: data.title,
        roleRequired: data.roleRequired || 'Pharmacist',
        startTime: start,
        endTime: end,
        hourlyRate: data.hourlyRate,
        totalEstimatedPay,
        requiredSystems: data.requiredSystems || [],
        requiredAccreditations: data.requiredAccreditations || [],
        visibility: data.visibility || ShiftVisibility.STAFF_BANK_ONLY,
        instantBookEnabled: data.instantBookEnabled || false,
        isOvernight: data.isOvernight || false,
        isEmergency: data.isEmergency || false,
        notes: data.notes,
        status: ShiftStatus.OPEN,
      },
      include: { branch: true },
    });
  }

  async getWorkerFeed(workerId: string, filter?: {
    tab?: 'for_you' | 'watching' | 'favourites' | 'emergencies';
    profession?: string;
    minRate?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const worker = await this.prisma.reliefProfile.findUnique({
      where: { id: workerId },
      include: {
        watchedShifts: { select: { shiftId: true } },
        favouriteBranches: { select: { branchId: true } },
        staffBankMemberships: { select: { organizationId: true, branchId: true } },
      },
    });

    if (!worker) throw new NotFoundException('Worker profile not found');

    const now = new Date();
    const where: any = {
      startTime: { gte: now },
      status: { in: [ShiftStatus.OPEN, ShiftStatus.IN_NEGOTIATION] },
    };

    if (filter?.minRate) {
      where.hourlyRate = { gte: filter.minRate };
    } else if (worker.minimumShiftRate) {
      where.hourlyRate = { gte: worker.minimumShiftRate };
    }

    if (filter?.startDate && filter?.endDate) {
      where.startTime = {
        gte: new Date(filter.startDate),
        lte: new Date(filter.endDate),
      };
    }

    const tab = filter?.tab || 'for_you';

    if (tab === 'watching') {
      const watchedIds = worker.watchedShifts.map((w) => w.shiftId);
      where.id = { in: watchedIds };
    } else if (tab === 'favourites') {
      const favBranchIds = worker.favouriteBranches.map((f) => f.branchId);
      where.branchId = { in: favBranchIds };
    } else if (tab === 'emergencies') {
      where.isEmergency = true;
    } else {
      if (worker.profession) {
        where.roleRequired = worker.profession;
      }
    }

    return this.prisma.shift.findMany({
      where,
      orderBy: [{ isEmergency: 'desc' }, { startTime: 'asc' }],
      include: {
        branch: {
          include: { organization: { select: { id: true, name: true, logoUrl: true } } },
        },
        _count: { select: { applications: true } },
      },
    });
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        branch: { include: { organization: true, manager: true } },
        assignedWorker: {
          include: { documents: { where: { status: 'VERIFIED' } } },
        },
        applications: {
          include: { reliefWorker: true },
          orderBy: { appliedAt: 'desc' },
        },
        negotiations: {
          include: { reliefWorker: true },
          orderBy: { createdAt: 'desc' },
        },
        timesheet: true,
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async assignWorker(shiftId: string, workerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({ where: { id: shiftId } });
      if (!shift) throw new NotFoundException('Shift not found');

      // Atomic verification of shift status
      if (shift.status === ShiftStatus.BOOKED || shift.status === ShiftStatus.COMPLETED) {
        throw new ConflictException('Shift has already been filled');
      }

      const worker = await tx.reliefProfile.findUnique({
        where: { id: workerId },
        include: { documents: true },
      });
      if (!worker) throw new NotFoundException('Worker not found');

      // Anti double-booking validation inside atomic transaction
      const overlap = await tx.shift.findFirst({
        where: {
          assignedWorkerId: workerId,
          id: { not: shiftId },
          status: { in: [ShiftStatus.BOOKED, ShiftStatus.IN_PROGRESS] },
          startTime: { lt: shift.endTime },
          endTime: { gt: shift.startTime },
        },
      });

      if (overlap) {
        throw new ConflictException(
          `Worker already has a conflicting shift booking from ${overlap.startTime.toISOString()} to ${overlap.endTime.toISOString()}`,
        );
      }

      // Conditional atomic update
      const updateResult = await tx.shift.updateMany({
        where: {
          id: shiftId,
          status: { in: [ShiftStatus.OPEN, ShiftStatus.IN_NEGOTIATION] },
        },
        data: {
          assignedWorkerId: workerId,
          status: ShiftStatus.BOOKED,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException('Shift has already been booked by another process');
      }

      // Automatically resolve other pending applications & negotiations
      await tx.shiftApplication.updateMany({
        where: {
          shiftId,
          reliefWorkerId: { not: workerId },
          status: ApplicationStatus.APPLIED,
        },
        data: { status: ApplicationStatus.REJECTED },
      });

      await tx.shiftNegotiation.updateMany({
        where: {
          shiftId,
          reliefWorkerId: { not: workerId },
          status: NegotiationStatus.PENDING,
        },
        data: { status: NegotiationStatus.REJECTED },
      });

      return tx.shift.findUnique({
        where: { id: shiftId },
        include: { assignedWorker: true, branch: true },
      });
    });
  }

  async instantBook(shiftId: string, workerId: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (!shift.instantBookEnabled) {
      throw new BadRequestException('Instant booking is not enabled for this shift');
    }
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('Shift is no longer open for booking');
    }

    const worker = await this.prisma.reliefProfile.findUnique({ where: { id: workerId } });
    if (!worker || !worker.isVerified) {
      throw new BadRequestException('Full compliance verification is required for Instant Booking');
    }

    return this.assignWorker(shiftId, workerId);
  }

  async applyForShift(shiftId: string, workerId: string, notes?: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('Shift is not open for applications');
    }

    const existing = await this.prisma.shiftApplication.findUnique({
      where: { shiftId_reliefWorkerId: { shiftId, reliefWorkerId: workerId } },
    });
    if (existing) {
      throw new BadRequestException('You have already applied for this shift');
    }

    return this.prisma.shiftApplication.create({
      data: {
        shiftId,
        reliefWorkerId: workerId,
        status: ApplicationStatus.APPLIED,
        notes,
      },
      include: { shift: { include: { branch: true } } },
    });
  }
}
