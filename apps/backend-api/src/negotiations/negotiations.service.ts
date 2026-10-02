import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NegotiationStatus, ShiftStatus, Role } from '@prisma/client';

@Injectable()
export class NegotiationsService {
  constructor(private prisma: PrismaService) {}

  async createNegotiation(data: {
    shiftId: string;
    reliefWorkerId: string;
    proposedHourlyRate: number;
    proposedStartTime?: Date;
    proposedEndTime?: Date;
    message?: string;
  }) {
    const shift = await this.prisma.shift.findUnique({ where: { id: data.shiftId } });
    if (!shift || shift.status === ShiftStatus.BOOKED) {
      throw new BadRequestException('Shift is not available for negotiation');
    }

    return this.prisma.$transaction(async (tx) => {
      const negotiation = await tx.shiftNegotiation.create({
        data: {
          shiftId: data.shiftId,
          reliefWorkerId: data.reliefWorkerId,
          proposedHourlyRate: data.proposedHourlyRate,
          proposedStartTime: data.proposedStartTime,
          proposedEndTime: data.proposedEndTime,
          message: data.message,
          status: NegotiationStatus.PENDING,
        },
      });

      await tx.shift.update({
        where: { id: data.shiftId },
        data: { status: ShiftStatus.IN_NEGOTIATION },
      });

      return negotiation;
    });
  }

  async acceptNegotiation(id: string, user: any) {
    return this.prisma.$transaction(async (tx) => {
      const neg = await tx.shiftNegotiation.findUnique({
        where: { id },
        include: { shift: true },
      });
      if (!neg) throw new NotFoundException('Negotiation not found');

      // Symmetric validation based on role:
      if (user.role === Role.RELIEF_WORKER) {
        if (neg.reliefWorkerId !== user.reliefProfile?.id) {
          throw new ForbiddenException('You can only accept negotiations addressed to your profile');
        }
        if (neg.status !== NegotiationStatus.COUNTERED) {
          throw new BadRequestException('Relief workers can only accept manager counter-offers');
        }
      } else {
        // Manager / Admin accepting worker proposal
        if (neg.status !== NegotiationStatus.PENDING) {
          throw new BadRequestException('Managers can only accept pending worker proposals');
        }
      }

      // Check anti-double-booking for the worker
      const overlap = await tx.shift.findFirst({
        where: {
          assignedWorkerId: neg.reliefWorkerId,
          id: { not: neg.shiftId },
          status: { in: [ShiftStatus.BOOKED, ShiftStatus.IN_PROGRESS] },
          startTime: { lt: neg.shift.endTime },
          endTime: { gt: neg.shift.startTime },
        },
      });

      if (overlap) {
        throw new ConflictException(
          `Worker already has an active booking that overlaps with this shift`,
        );
      }

      await tx.shiftNegotiation.update({
        where: { id },
        data: { status: NegotiationStatus.ACCEPTED },
      });

      const agreedRate =
        neg.status === NegotiationStatus.COUNTERED && neg.counterOfferRate
          ? neg.counterOfferRate
          : neg.proposedHourlyRate;

      const hours =
        (neg.shift.endTime.getTime() - neg.shift.startTime.getTime()) / (1000 * 60 * 60);
      const totalEstimatedPay = Number((hours * Number(agreedRate)).toFixed(2));

      // Auto-reject competing negotiations on this shift
      await tx.shiftNegotiation.updateMany({
        where: {
          shiftId: neg.shiftId,
          id: { not: id },
          status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] },
        },
        data: { status: NegotiationStatus.REJECTED },
      });

      return tx.shift.update({
        where: { id: neg.shiftId },
        data: {
          assignedWorkerId: neg.reliefWorkerId,
          hourlyRate: agreedRate,
          totalEstimatedPay,
          status: ShiftStatus.BOOKED,
        },
        include: { assignedWorker: true, branch: true },
      });
    });
  }

  async counterOffer(id: string, counterOfferRate: number) {
    return this.prisma.shiftNegotiation.update({
      where: { id },
      data: {
        counterOfferRate,
        status: NegotiationStatus.COUNTERED,
      },
    });
  }

  async rejectNegotiation(id: string) {
    const neg = await this.prisma.shiftNegotiation.update({
      where: { id },
      data: { status: NegotiationStatus.REJECTED },
    });

    const pendingCount = await this.prisma.shiftNegotiation.count({
      where: {
        shiftId: neg.shiftId,
        status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] },
      },
    });

    if (pendingCount === 0) {
      await this.prisma.shift.update({
        where: { id: neg.shiftId },
        data: { status: ShiftStatus.OPEN },
      });
    }

    return neg;
  }
}
