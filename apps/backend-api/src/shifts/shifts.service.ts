import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftStatus, ShiftVisibility, ApplicationStatus, NegotiationStatus, Role, Prisma } from '@prisma/client';
import { AccessService, AuthUser } from '../common/access.service';
import { TIER_RANK, assertShiftBookable, assertWorkerCanBook, isVisibleToWorker, lockWorker } from './eligibility';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplyDto, AssignWorkerDto, CreateShiftDto, FeedQueryDto, ShiftListQueryDto, UpdateShiftDto, UpdateShiftStatusDto } from './dto/shift.dto';

const HOUR = 3_600_000;
export const CASCADE_DELAY_MINUTES = Number(process.env.CASCADE_DELAY_MINUTES) || 60;

/** Manager-driven transitions. COMPLETED is reached only through timesheet approval. */
const TRANSITIONS: Partial<Record<ShiftStatus, ShiftStatus[]>> = {
  DRAFT: [ShiftStatus.OPEN, ShiftStatus.CANCELLED],
  OPEN: [ShiftStatus.CANCELLED],
  IN_NEGOTIATION: [ShiftStatus.CANCELLED],
  // IN_PROGRESS is entered only when the worker clocks in.
  BOOKED: [ShiftStatus.OPEN, ShiftStatus.CANCELLED],
  IN_PROGRESS: [ShiftStatus.CANCELLED],
};

const money = (hours: number, rate: number) => Number((hours * rate).toFixed(2));

@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, dto: CreateShiftDto) {
    const branch = await this.access.assertBranch(user, dto.branchId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: branch.organizationId }, select: { currency: true } });
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (end <= start) throw new BadRequestException('End time must be after start time');
    if (start.getTime() < Date.now()) throw new BadRequestException('Shift cannot start in the past');

    const visibility = dto.visibility || ShiftVisibility.STAFF_BANK_ONLY;
    // Staff-bank shifts start with Tier 1 and widen on a timer (see JobsService.runCascade).
    const cascading = visibility === ShiftVisibility.STAFF_BANK_ONLY && dto.cascade !== false;
    const created = await this.prisma.shift.create({
      data: {
        cascadeStage: cascading ? 1 : 3,
        cascadeEnabled: cascading,
        currency: org.currency,
        nextCascadeAt: cascading ? new Date(Date.now() + CASCADE_DELAY_MINUTES * 60_000) : null,
        branchId: dto.branchId,
        title: dto.title,
        roleRequired: dto.roleRequired || 'Pharmacist',
        startTime: start,
        endTime: end,
        hourlyRate: dto.hourlyRate,
        totalEstimatedPay: money((end.getTime() - start.getTime()) / HOUR, dto.hourlyRate),
        requiredSystems: dto.requiredSystems || [],
        requiredAccreditations: dto.requiredAccreditations || [],
        visibility,
        instantBookEnabled: dto.instantBookEnabled || false,
        isOvernight: dto.isOvernight || false,
        isEmergency: dto.isEmergency || false,
        notes: dto.notes,
        status: ShiftStatus.OPEN,
      },
      include: { branch: true },
    });
    if (cascading) await this.notifications.notifyTierMembers(created, 1);
    else if (visibility === ShiftVisibility.STAFF_BANK_ONLY) {
      for (const stage of [1, 2, 3]) await this.notifications.notifyTierMembers(created, stage);
    } else if (visibility === ShiftVisibility.EMERGENCY_BROADCAST) await this.notifications.notifyEmergency(created);
    else await this.notifications.notifyRateMatches(created);
    return created;
  }

  async list(user: AuthUser, q: ShiftListQueryDto) {
    if (q.branchId) await this.access.assertBranch(user, q.branchId);
    return this.prisma.shift.findMany({
      where: {
        branch: this.access.branchScope(user),
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.startDate || q.endDate
          ? { startTime: { ...(q.startDate ? { gte: new Date(q.startDate) } : {}), ...(q.endDate ? { lte: new Date(q.endDate) } : {}) } }
          : {}),
      },
      orderBy: { startTime: 'asc' },
      include: {
        branch: { select: { id: true, name: true, branchCode: true } },
        assignedWorker: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { applications: true, negotiations: true } },
      },
      take: 500,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateShiftDto) {
    const shift = await this.access.assertShift(user, id);
    if (shift.status === ShiftStatus.COMPLETED || shift.status === ShiftStatus.CANCELLED || shift.status === ShiftStatus.IN_PROGRESS) {
      throw new BadRequestException(`A ${shift.status} shift cannot be edited`);
    }
    if (shift.status === ShiftStatus.BOOKED) {
      const locked = Object.keys(dto).filter((k) => !['title', 'notes'].includes(k) && dto[k as keyof UpdateShiftDto] !== undefined);
      if (locked.length) {
        throw new BadRequestException(`A booked shift only allows editing title and notes (not: ${locked.join(', ')})`);
      }
    }
    const start = dto.startTime ? new Date(dto.startTime) : shift.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : shift.endTime;
    const rate = dto.hourlyRate ?? Number(shift.hourlyRate);
    if (end <= start) throw new BadRequestException('End time must be after start time');
    if (shift.assignedWorkerId && (dto.startTime || dto.endTime)) {
      throw new BadRequestException('Unassign the worker before changing the shift times');
    }
    const { cascade: _cascade, ...fields } = dto as UpdateShiftDto & { cascade?: boolean };
    const widened = dto.visibility && dto.visibility !== shift.visibility;
    const res = await this.prisma.shift.updateMany({
      where: { id, status: shift.status },
      data: {
        ...fields,
        // Changing visibility by hand ends any running cascade (staff bank = whole bank, or public).
        ...(widened ? { cascadeStage: 3, nextCascadeAt: null, cascadeEnabled: false } : {}),
        startTime: start,
        endTime: end,
        hourlyRate: rate,
        totalEstimatedPay: money((end.getTime() - start.getTime()) / HOUR, rate),
      },
    });
    if (res.count === 0) throw new ConflictException('Shift changed while updating, please retry');
    const updated = await this.prisma.shift.findUnique({ where: { id } });
    if (widened) {
      if (updated.visibility === ShiftVisibility.EMERGENCY_BROADCAST) await this.notifications.notifyEmergency(updated);
      else await this.notifications.notifyRateMatches(updated);
    }
    return updated;
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateShiftStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({ where: { id, branch: this.access.branchScope(user) } });
      if (!shift) throw new NotFoundException('Shift not found');
      if (!TRANSITIONS[shift.status]?.includes(dto.status)) {
        throw new BadRequestException(`Cannot move a shift from ${shift.status} to ${dto.status}`);
      }

      const data: Prisma.ShiftUncheckedUpdateManyInput = { status: dto.status };
      if (dto.status === ShiftStatus.CANCELLED || (shift.status === ShiftStatus.BOOKED && dto.status === ShiftStatus.OPEN)) {
        data.assignedWorkerId = null; // releases the worker
        data.workerClockInAt = null;
        // A pending timesheet for a released worker must not be approvable.
        await tx.timesheet.deleteMany({ where: { shiftId: id, status: 'SUBMITTED' } });
      }
      // A released staff-bank shift picks its cascade timer back up where it left off.
      if (shift.status === ShiftStatus.BOOKED && dto.status === ShiftStatus.OPEN && shift.visibility === ShiftVisibility.STAFF_BANK_ONLY && shift.cascadeEnabled) {
        data.nextCascadeAt = new Date(Date.now() + CASCADE_DELAY_MINUTES * 60_000);
      }
      const res = await tx.shift.updateMany({ where: { id, status: shift.status }, data });
      if (res.count === 0) throw new ConflictException('Shift changed while updating, please retry');

      if (dto.status === ShiftStatus.CANCELLED || dto.status === ShiftStatus.OPEN) {
        await tx.shiftApplication.updateMany({
          where: { shiftId: id, status: ApplicationStatus.APPLIED },
          data: { status: ApplicationStatus.REJECTED },
        });
        await tx.shiftNegotiation.updateMany({
          where: { shiftId: id, status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] } },
          data: { status: NegotiationStatus.REJECTED },
        });
      }
      return tx.shift.findUnique({ where: { id }, include: { branch: true, assignedWorker: true } });
    });
  }

  async getWorkerFeed(workerId: string, filter: FeedQueryDto = {}) {
    const worker = await this.prisma.reliefProfile.findUnique({
      where: { id: workerId },
      include: {
        watchedShifts: { select: { shiftId: true } },
        favouriteBranches: { select: { branchId: true } },
        staffBankMemberships: { select: { organizationId: true, branchId: true, isActive: true, tier: true } },
      },
    });
    if (!worker) throw new NotFoundException('Worker profile not found');

    const and: Prisma.ShiftWhereInput[] = [];
    const where: Prisma.ShiftWhereInput = {
      startTime: { gte: new Date() },
      status: { in: [ShiftStatus.OPEN, ShiftStatus.IN_NEGOTIATION] },
      AND: and,
    };

    // Tiered visibility: staff-bank-only shifts only reach that organization's bank members.
    const bankOrgs = worker.staffBankMemberships.filter((m) => m.isActive);
    and.push({
      OR: [
        { visibility: { in: [ShiftVisibility.PUBLIC_MARKETPLACE, ShiftVisibility.EMERGENCY_BROADCAST] } },
        ...bankOrgs.map((m) => ({
          visibility: ShiftVisibility.STAFF_BANK_ONLY,
          cascadeStage: { gte: TIER_RANK[m.tier] },
          branch: { organizationId: m.organizationId },
          ...(m.branchId ? { branchId: m.branchId } : {}),
        })),
      ],
    });

    const tab = filter.tab || 'for_you';
    // The worker's saved minimum rate hides low-paid shifts, except emergencies which are always shown.
    const minRate = filter.minRate ?? (tab !== 'emergencies' && worker.minimumShiftRate ? Number(worker.minimumShiftRate) : undefined);
    if (minRate) where.hourlyRate = { gte: minRate };

    if (filter.startDate && filter.endDate) {
      where.startTime = { gte: new Date(filter.startDate), lte: new Date(filter.endDate) };
    }

    if (tab === 'watching') {
      where.id = { in: worker.watchedShifts.map((w) => w.shiftId) };
    } else if (tab === 'favourites') {
      where.branchId = { in: worker.favouriteBranches.map((f) => f.branchId) };
    } else if (tab === 'emergencies') {
      where.isEmergency = true;
    } else if (filter.profession || worker.profession) {
      where.roleRequired = filter.profession || worker.profession;
    }

    const shifts = await this.prisma.shift.findMany({
      where,
      orderBy: [{ isEmergency: 'desc' }, { startTime: 'asc' }],
      include: {
        branch: {
          select: {
            id: true, name: true, city: true, postcode: true, organizationId: true,
            organization: { select: { id: true, name: true, logoUrl: true } },
          },
        },
        _count: { select: { applications: true } },
      },
      take: 200,
    });

    const watched = new Set(worker.watchedShifts.map((w) => w.shiftId));
    const favs = new Set(worker.favouriteBranches.map((f) => f.branchId));
    return shifts.map((s) => ({ ...s, isWatched: watched.has(s.id), isFavouriteBranch: favs.has(s.branchId) }));
  }

  /** Worker diary: everything the worker is booked on, applied for, negotiating or watching. */
  async getWorkerDiary(workerId: string) {
    const [booked, applications, negotiations, watched] = await Promise.all([
      this.prisma.shift.findMany({
        where: { assignedWorkerId: workerId },
        orderBy: { startTime: 'desc' },
        include: { branch: { select: { id: true, name: true, city: true } }, timesheet: { select: { id: true, status: true } } },
        take: 200,
      }),
      this.prisma.shiftApplication.findMany({
        where: { reliefWorkerId: workerId },
        orderBy: { appliedAt: 'desc' },
        include: { shift: { include: { branch: { select: { id: true, name: true, city: true } } } } },
        take: 100,
      }),
      this.prisma.shiftNegotiation.findMany({
        where: { reliefWorkerId: workerId },
        orderBy: { createdAt: 'desc' },
        include: { shift: { include: { branch: { select: { id: true, name: true, city: true } } } } },
        take: 100,
      }),
      this.prisma.workerWatchedShift.findMany({
        where: { reliefWorkerId: workerId },
        include: { shift: { include: { branch: { select: { id: true, name: true, city: true } } } } },
        take: 100,
      }),
    ]);
    return { booked, applications, negotiations, watching: watched.map((w) => w.shift) };
  }

  async findOne(user: AuthUser, id: string) {
    if (user.role === Role.RELIEF_WORKER) return this.findOneForWorker(user.reliefProfile.id, id);

    const shift = await this.prisma.shift.findFirst({
      where: { id, branch: this.access.branchScope(user) },
      include: {
        branch: { include: { organization: { select: { id: true, name: true } }, manager: { select: { id: true, email: true } } } },
        assignedWorker: { include: { documents: { where: { status: 'VERIFIED' } } } },
        applications: { include: { reliefWorker: true }, orderBy: { appliedAt: 'desc' } },
        negotiations: { include: { reliefWorker: true }, orderBy: { createdAt: 'desc' } },
        timesheet: true,
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  private async findOneForWorker(workerId: string, id: string) {
    const [shift, memberships] = await Promise.all([
      this.prisma.shift.findUnique({
        where: { id },
        include: {
          branch: { select: { id: true, name: true, city: true, postcode: true, phone: true, organizationId: true, organization: { select: { id: true, name: true, logoUrl: true } } } },
          applications: { where: { reliefWorkerId: workerId } },
          negotiations: { where: { reliefWorkerId: workerId }, orderBy: { createdAt: 'desc' } },
          watchedBy: { where: { reliefWorkerId: workerId } },
          timesheet: { select: { id: true, status: true } },
        },
      }),
      this.prisma.staffBankMember.findMany({ where: { reliefWorkerId: workerId } }),
    ]);
    if (!shift) throw new NotFoundException('Shift not found');
    const isMine = shift.assignedWorkerId === workerId;
    // Closed shifts (booked/completed/cancelled) are only visible to the worker who is involved with them.
    const involved = isMine || shift.applications.length > 0 || shift.negotiations.length > 0;
    const biddable = shift.status === ShiftStatus.OPEN || shift.status === ShiftStatus.IN_NEGOTIATION;
    if (!involved && (!biddable || !isVisibleToWorker(shift, memberships))) throw new NotFoundException('Shift not found');
    const { watchedBy, ...rest } = shift;
    return { ...rest, isWatched: watchedBy.length > 0 };
  }

  async assignWorker(user: AuthUser, shiftId: string, dto: AssignWorkerDto) {
    await this.access.assertShift(user, shiftId);
    const canOverride = user.role === Role.ORG_ADMIN || user.role === Role.SUPER_ADMIN;
    if (dto.overrideSkills && !canOverride) {
      throw new ForbiddenException('Only organization admins can override skill requirements');
    }
    const booked = await this.book(shiftId, dto.reliefWorkerId, { asManager: true, skipSkills: !!dto.overrideSkills });
    await this.notifications.notifyWorker(dto.reliefWorkerId, {
      type: 'SHIFT_BOOKED', title: 'You have been booked', body: booked.title, link: `/shifts/${shiftId}`,
    });
    return booked;
  }

  async instantBook(shiftId: string, workerId: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (!shift.instantBookEnabled) throw new BadRequestException('Instant booking is not enabled for this shift');
    const booked = await this.book(shiftId, workerId, {});
    await this.notifications.notifyBranchStaff(shift.branchId, {
      type: 'SHIFT_BOOKED', title: 'Shift filled by instant book', body: `${booked.assignedWorker?.firstName} ${booked.assignedWorker?.lastName} booked ${shift.title}`, link: '/rota',
    });
    return booked;
  }

  /** Atomic booking: eligibility, overlap check and a conditional status flip in one transaction. */
  private book(shiftId: string, workerId: string, opts: { asManager?: boolean; skipSkills?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      await lockWorker(tx, workerId);
      const { shift } = await assertWorkerCanBook(tx, shiftId, workerId, opts);
      assertShiftBookable(shift.status);
      if (shift.startTime.getTime() < Date.now()) throw new BadRequestException('Shift has already started');

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

      const res = await tx.shift.updateMany({
        where: { id: shiftId, status: { in: [ShiftStatus.OPEN, ShiftStatus.IN_NEGOTIATION] } },
        data: { assignedWorkerId: workerId, status: ShiftStatus.BOOKED },
      });
      if (res.count === 0) throw new ConflictException('Shift has already been booked by another process');

      await tx.shiftApplication.updateMany({
        where: { shiftId, reliefWorkerId: workerId, status: ApplicationStatus.APPLIED },
        data: { status: ApplicationStatus.ACCEPTED, reviewedAt: new Date() },
      });
      await tx.shiftApplication.updateMany({
        where: { shiftId, reliefWorkerId: { not: workerId }, status: ApplicationStatus.APPLIED },
        data: { status: ApplicationStatus.REJECTED, reviewedAt: new Date() },
      });
      await tx.shiftNegotiation.updateMany({
        where: { shiftId, status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] } },
        data: { status: NegotiationStatus.REJECTED },
      });

      return tx.shift.findUnique({ where: { id: shiftId }, include: { assignedWorker: true, branch: true } });
    });
  }

  async applyForShift(shiftId: string, workerId: string, dto: ApplyDto) {
    return this.prisma.$transaction(async (tx) => {
      const { shift } = await assertWorkerCanBook(tx, shiftId, workerId);
      if (shift.status !== ShiftStatus.OPEN) throw new BadRequestException('Shift is not open for applications');
      if (shift.startTime.getTime() < Date.now()) throw new BadRequestException('Shift has already started');
      try {
        return await tx.shiftApplication.create({
          data: { shiftId, reliefWorkerId: workerId, status: ApplicationStatus.APPLIED, notes: dto.notes },
          include: { shift: { include: { branch: true } } },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException('You have already applied for this shift');
        }
        throw e;
      }
    });
  }
}
