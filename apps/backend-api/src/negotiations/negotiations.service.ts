import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationStatus, NegotiationStatus, Prisma, Role, ShiftStatus } from '@prisma/client';
import { AccessService, AuthUser } from '../common/access.service';
import { assertShiftBookable, assertWorkerCanBook, lockWorker } from '../shifts/eligibility';
import { NotificationsService } from '../notifications/notifications.service';
import { formatMoney } from '../common/markets';
import { CreateNegotiationDto, NegotiationQueryDto } from './dto/negotiation.dto';

const ACTIVE = [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED];
const HOUR = 3_600_000;

@Injectable()
export class NegotiationsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
  ) {}

  async createNegotiation(workerId: string, dto: CreateNegotiationDto) {
    let shiftInfo: { title: string; branchId: string; currency: string };

    const negotiation = await this.prisma.$transaction(async (tx) => {
      const { shift } = await assertWorkerCanBook(tx, dto.shiftId, workerId);
      assertShiftBookable(shift.status);
      if (shift.startTime.getTime() < Date.now()) throw new BadRequestException('Shift has already started');
      shiftInfo = { title: shift.title, branchId: shift.branchId, currency: shift.currency };

      const start = dto.proposedStartTime ? new Date(dto.proposedStartTime) : null;
      const end = dto.proposedEndTime ? new Date(dto.proposedEndTime) : null;
      if ((start || end) && (!(start && end) || end <= start)) {
        throw new BadRequestException('Proposed times need both a start and an end, with end after start');
      }

      const active = await tx.shiftNegotiation.findFirst({
        where: { shiftId: dto.shiftId, reliefWorkerId: workerId, status: { in: ACTIVE } },
      });
      if (active) throw new BadRequestException('You already have an open negotiation on this shift');

      const created = await tx.shiftNegotiation.create({
        data: {
          shiftId: dto.shiftId,
          reliefWorkerId: workerId,
          proposedHourlyRate: dto.proposedHourlyRate,
          proposedStartTime: start,
          proposedEndTime: end,
          message: dto.message,
          status: NegotiationStatus.PENDING,
        },
      });
      await tx.shift.updateMany({
        where: { id: dto.shiftId, status: ShiftStatus.OPEN },
        data: { status: ShiftStatus.IN_NEGOTIATION },
      });
      return created;
    });

    await this.notifications.notifyBranchStaff(shiftInfo.branchId, {
      type: 'NEGOTIATION_PROPOSED',
      title: 'New rate proposal',
      body: `${formatMoney(dto.proposedHourlyRate, shiftInfo.currency)}/h proposed on ${shiftInfo.title}`,
      link: '/negotiations',
    });
    return negotiation;
  }

  listForStaff(user: AuthUser, q: NegotiationQueryDto) {
    return this.prisma.shiftNegotiation.findMany({
      where: {
        shift: { branch: this.access.branchScope(user), ...(q.branchId ? { branchId: q.branchId } : {}) },
        ...(q.status ? { status: q.status } : {}),
      },
      include: {
        reliefWorker: { select: { id: true, firstName: true, lastName: true, profession: true, registrationNumber: true } },
        shift: { include: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  listMine(workerId: string) {
    return this.prisma.shiftNegotiation.findMany({
      where: { reliefWorkerId: workerId },
      include: { shift: { include: { branch: { select: { id: true, name: true, city: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Loads a negotiation the caller is allowed to act on (own for workers, branch-scoped for staff). */
  private async loadActionable(tx: Prisma.TransactionClient, id: string, user: AuthUser) {
    const neg = await tx.shiftNegotiation.findFirst({
      where:
        user.role === Role.RELIEF_WORKER
          ? { id, reliefWorkerId: user.reliefProfile?.id ?? '' }
          : { id, shift: { branch: this.access.branchScope(user) } },
      include: { shift: true },
    });
    if (!neg) throw new NotFoundException('Negotiation not found');
    return neg;
  }

  /** Tells the other side of the negotiation that something happened. */
  private async notifyCounterparty(
    user: AuthUser,
    neg: { reliefWorkerId: string; shift: { id: string; title: string; branchId: string; currency: string } },
    type: string,
    title: string,
  ) {
    if (user.role === Role.RELIEF_WORKER) {
      await this.notifications.notifyBranchStaff(neg.shift.branchId, { type, title, body: neg.shift.title, link: '/negotiations' });
    } else {
      await this.notifications.notifyWorker(neg.reliefWorkerId, { type, title, body: neg.shift.title, link: `/shifts/${neg.shift.id}` });
    }
  }

  async acceptNegotiation(id: string, user: AuthUser) {
    let actedOn: { reliefWorkerId: string; shift: { id: string; title: string; branchId: string; currency: string } };

    const booked = await this.prisma.$transaction(async (tx) => {
      const neg = await this.loadActionable(tx, id, user);
      actedOn = { reliefWorkerId: neg.reliefWorkerId, shift: neg.shift };

      if (user.role === Role.RELIEF_WORKER) {
        if (neg.status !== NegotiationStatus.COUNTERED) {
          throw new BadRequestException('Relief workers can only accept manager counter-offers');
        }
      } else if (neg.status !== NegotiationStatus.PENDING) {
        throw new BadRequestException('Managers can only accept pending worker proposals');
      }

      // Lock the worker so a concurrent booking cannot slip past the overlap check below.
      await lockWorker(tx, neg.reliefWorkerId);
      const { shift } = await assertWorkerCanBook(tx, neg.shiftId, neg.reliefWorkerId, { asManager: true });
      assertShiftBookable(shift.status);
      if (shift.startTime.getTime() < Date.now()) throw new BadRequestException('Shift has already started');

      const overlap = await tx.shift.findFirst({
        where: {
          assignedWorkerId: neg.reliefWorkerId,
          id: { not: neg.shiftId },
          status: { in: [ShiftStatus.BOOKED, ShiftStatus.IN_PROGRESS] },
          startTime: { lt: shift.endTime },
          endTime: { gt: shift.startTime },
        },
      });
      if (overlap) throw new ConflictException('Worker already has an active booking that overlaps with this shift');

      const agreedRate =
        neg.status === NegotiationStatus.COUNTERED && neg.counterOfferRate ? neg.counterOfferRate : neg.proposedHourlyRate;
      const start = neg.proposedStartTime ?? shift.startTime;
      const end = neg.proposedEndTime ?? shift.endTime;
      const totalEstimatedPay = Number((((end.getTime() - start.getTime()) / HOUR) * Number(agreedRate)).toFixed(2));

      const res = await tx.shift.updateMany({
        where: { id: neg.shiftId, status: { in: [ShiftStatus.OPEN, ShiftStatus.IN_NEGOTIATION] } },
        data: {
          assignedWorkerId: neg.reliefWorkerId,
          hourlyRate: agreedRate,
          totalEstimatedPay,
          status: ShiftStatus.BOOKED,
        },
      });
      if (res.count === 0) throw new ConflictException('Shift has already been booked by another process');

      await tx.shiftNegotiation.update({ where: { id }, data: { status: NegotiationStatus.ACCEPTED } });
      await tx.shiftNegotiation.updateMany({
        where: { shiftId: neg.shiftId, id: { not: id }, status: { in: ACTIVE } },
        data: { status: NegotiationStatus.REJECTED },
      });
      await tx.shiftApplication.updateMany({
        where: { shiftId: neg.shiftId, status: ApplicationStatus.APPLIED },
        data: { status: ApplicationStatus.REJECTED, reviewedAt: new Date() },
      });

      return tx.shift.findUnique({ where: { id: neg.shiftId }, include: { assignedWorker: true, branch: true } });
    });

    await this.notifyCounterparty(user, actedOn, 'NEGOTIATION_ACCEPTED', 'Rate agreed: shift booked');
    return booked;
  }

  async counterOffer(id: string, rate: number, user: AuthUser) {
    let actedOn: { reliefWorkerId: string; shift: { id: string; title: string; branchId: string; currency: string } };

    const updated = await this.prisma.$transaction(async (tx) => {
      const neg = await this.loadActionable(tx, id, user);
      actedOn = { reliefWorkerId: neg.reliefWorkerId, shift: neg.shift };
      if (neg.status !== NegotiationStatus.PENDING) {
        throw new BadRequestException('Only pending proposals can be countered');
      }
      const res = await tx.shiftNegotiation.updateMany({
        where: { id, status: NegotiationStatus.PENDING },
        data: { counterOfferRate: rate, status: NegotiationStatus.COUNTERED },
      });
      if (res.count === 0) throw new ConflictException('Negotiation changed while updating, please retry');
      return tx.shiftNegotiation.findUniqueOrThrow({ where: { id } });
    });

    await this.notifyCounterparty(user, actedOn, 'NEGOTIATION_COUNTERED', `Counter-offer: ${formatMoney(rate, actedOn.shift.currency)}/h`);
    return updated;
  }

  async rejectNegotiation(id: string, user: AuthUser) {
    let actedOn: { reliefWorkerId: string; shift: { id: string; title: string; branchId: string; currency: string } };

    const updated = await this.prisma.$transaction(async (tx) => {
      const neg = await this.loadActionable(tx, id, user);
      actedOn = { reliefWorkerId: neg.reliefWorkerId, shift: neg.shift };
      if (!ACTIVE.includes(neg.status as (typeof ACTIVE)[number])) {
        throw new BadRequestException('Only open negotiations can be rejected');
      }
      const res = await tx.shiftNegotiation.updateMany({
        where: { id, status: { in: ACTIVE } },
        data: { status: NegotiationStatus.REJECTED },
      });
      if (res.count === 0) throw new ConflictException('Negotiation changed while updating, please retry');
      const rejected = await tx.shiftNegotiation.findUniqueOrThrow({ where: { id } });

      const remaining = await tx.shiftNegotiation.count({ where: { shiftId: neg.shiftId, status: { in: ACTIVE } } });
      if (remaining === 0) {
        // Only reopens a shift that is still in negotiation: a booked shift stays booked.
        await tx.shift.updateMany({
          where: { id: neg.shiftId, status: ShiftStatus.IN_NEGOTIATION },
          data: { status: ShiftStatus.OPEN },
        });
      }
      return rejected;
    });

    await this.notifyCounterparty(user, actedOn, 'NEGOTIATION_REJECTED', 'Rate proposal declined');
    return updated;
  }
}
