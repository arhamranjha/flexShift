import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, StaffBankTier } from '@prisma/client';
import { AccessService, AuthUser } from '../common/access.service';
import { AddStaffBankMemberDto, UpdateStaffBankMemberDto } from './dto/staff-bank.dto';

@Injectable()
export class StaffBankService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async findBankMembers(user: AuthUser, organizationId: string, branchId?: string) {
    this.access.assertOrg(user, organizationId);
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

  async addMember(user: AuthUser, dto: AddStaffBankMemberDto) {
    const organizationId = user.role === Role.SUPER_ADMIN ? dto.organizationId : user.organizationId;
    if (!organizationId) throw new BadRequestException('organizationId is required');
    this.access.assertOrg(user, organizationId);

    if (dto.branchId) {
      const branch = await this.prisma.facilityBranch.findFirst({ where: { id: dto.branchId, organizationId } });
      if (!branch) throw new BadRequestException('Branch does not belong to this organization');
      if (user.role === Role.FACILITY_MANAGER) await this.access.assertBranch(user, dto.branchId);
    } else if (user.role === Role.FACILITY_MANAGER) {
      throw new ForbiddenException('Facility managers can only add workers to their own branch');
    }

    const worker = await this.prisma.reliefProfile.findUnique({ where: { id: dto.reliefWorkerId } });
    if (!worker) throw new NotFoundException('Relief worker not found');

    const existing = await this.prisma.staffBankMember.findUnique({
      where: { organizationId_reliefWorkerId: { organizationId, reliefWorkerId: dto.reliefWorkerId } },
    });
    if (existing) throw new BadRequestException('Worker is already a member of this organization staff bank');

    return this.prisma.staffBankMember.create({
      data: {
        organizationId,
        branchId: dto.branchId,
        reliefWorkerId: dto.reliefWorkerId,
        tier: dto.tier || StaffBankTier.TIER_2_REGULAR,
        customHourlyRate: dto.customHourlyRate,
        notes: dto.notes,
      },
      include: { reliefWorker: true },
    });
  }

  private async loadMember(user: AuthUser, id: string) {
    const member = await this.prisma.staffBankMember.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('Staff bank member not found');
    this.access.assertOrg(user, member.organizationId);
    if (user.role === Role.FACILITY_MANAGER && member.branchId !== user.managedBranch?.id) {
      throw new NotFoundException('Staff bank member not found');
    }
    return member;
  }

  async updateMember(user: AuthUser, id: string, dto: UpdateStaffBankMemberDto) {
    await this.loadMember(user, id);
    return this.prisma.staffBankMember.update({ where: { id }, data: dto });
  }

  async removeMember(user: AuthUser, id: string) {
    await this.loadMember(user, id);
    return this.prisma.staffBankMember.delete({ where: { id } });
  }
}
