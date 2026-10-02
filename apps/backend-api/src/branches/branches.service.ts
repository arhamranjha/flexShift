import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, AuthUser } from '../common/access.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async findAll(user: AuthUser, organizationId?: string) {
    return this.prisma.facilityBranch.findMany({
      where: {
        AND: [
          this.access.branchScope(user),
          // Only super admins may pick an arbitrary organization.
          organizationId && user.role === Role.SUPER_ADMIN ? { organizationId } : {},
        ],
      },
      include: {
        organization: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, email: true } },
        _count: { select: { shifts: true, staffBankMembers: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const branch = await this.prisma.facilityBranch.findFirst({
      where: { AND: [{ id }, this.access.branchScope(user)] },
      include: {
        organization: true,
        manager: { select: { id: true, email: true } },
        shifts: {
          orderBy: { startTime: 'asc' },
          take: 200,
          include: {
            assignedWorker: { select: { id: true, firstName: true, lastName: true } },
            _count: { select: { applications: true, negotiations: true } },
          },
        },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async create(user: AuthUser, dto: CreateBranchDto) {
    const organizationId = user.role === Role.SUPER_ADMIN ? dto.organizationId : user.organizationId;
    if (!organizationId) throw new BadRequestException('organizationId is required');
    await this.assertManagerInOrg(dto.managerId, organizationId);
    const { organizationId: _ignored, ...rest } = dto;
    return this.prisma.facilityBranch.create({ data: { ...rest, organizationId } });
  }

  async update(user: AuthUser, id: string, dto: UpdateBranchDto) {
    const branch = await this.access.assertBranch(user, id);
    await this.assertManagerInOrg(dto.managerId, branch.organizationId);
    return this.prisma.facilityBranch.update({ where: { id }, data: dto });
  }

  private async assertManagerInOrg(managerId: string | undefined, organizationId: string) {
    if (!managerId) return;
    const manager = await this.prisma.user.findFirst({ where: { id: managerId, organizationId } });
    if (!manager) throw new BadRequestException('Manager must be a user of the same organization');
  }

  async getRota(user: AuthUser, branchId: string, startDate?: string, endDate?: string) {
    await this.access.assertBranch(user, branchId);
    return this.prisma.shift.findMany({
      where: {
        branchId,
        // Any shift overlapping the window (not only those fully inside it).
        ...(startDate && endDate ? { startTime: { lt: new Date(endDate) }, endTime: { gt: new Date(startDate) } } : {}),
      },
      orderBy: { startTime: 'asc' },
      include: {
        assignedWorker: {
          select: { id: true, firstName: true, lastName: true, phone: true, registrationNumber: true },
        },
        _count: { select: { applications: true, negotiations: true } },
      },
    });
  }
}
