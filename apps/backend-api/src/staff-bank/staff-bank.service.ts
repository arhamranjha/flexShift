import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffBankTier } from '@prisma/client';

@Injectable()
export class StaffBankService {
  constructor(private prisma: PrismaService) {}

  async findBankMembers(organizationId: string, branchId?: string) {
    return this.prisma.staffBankMember.findMany({
      where: {
        organizationId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      include: {
        reliefWorker: {
          include: {
            documents: { where: { status: 'VERIFIED' } },
            _count: { select: { assignedShifts: true } },
          },
        },
        branch: { select: { id: true, name: true, branchCode: true } },
      },
      orderBy: [{ tier: 'asc' }, { joinedAt: 'desc' }],
    });
  }

  async addMember(data: {
    organizationId: string;
    branchId?: string;
    reliefWorkerId: string;
    tier?: StaffBankTier;
    customHourlyRate?: number;
    notes?: string;
  }) {
    const existing = await this.prisma.staffBankMember.findUnique({
      where: {
        organizationId_reliefWorkerId: {
          organizationId: data.organizationId,
          reliefWorkerId: data.reliefWorkerId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Worker is already a member of this organization staff bank');
    }

    return this.prisma.staffBankMember.create({
      data: {
        organizationId: data.organizationId,
        branchId: data.branchId,
        reliefWorkerId: data.reliefWorkerId,
        tier: data.tier || StaffBankTier.TIER_2_REGULAR,
        customHourlyRate: data.customHourlyRate,
        notes: data.notes,
      },
      include: { reliefWorker: true },
    });
  }

  async updateMember(id: string, data: {
    tier?: StaffBankTier;
    customHourlyRate?: number;
    isActive?: boolean;
    notes?: string;
  }) {
    return this.prisma.staffBankMember.update({
      where: { id },
      data,
    });
  }

  async removeMember(id: string) {
    return this.prisma.staffBankMember.delete({ where: { id } });
  }
}
