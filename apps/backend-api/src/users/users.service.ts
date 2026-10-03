import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, AuthUser } from '../common/access.service';
import { CreateStaffUserDto, UpdateStaffUserDto } from './users.dto';

export const generateTempPassword = () => randomBytes(9).toString('base64url');

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.user.findMany({
      where: {
        role: { in: [Role.ORG_ADMIN, Role.FACILITY_MANAGER] },
        ...(user.role === Role.SUPER_ADMIN ? {} : { organizationId: user.organizationId ?? '' }),
      },
      select: { id: true, email: true, role: true, isActive: true, organizationId: true, lastLoginAt: true, managedBranch: { select: { id: true, name: true } } },
      orderBy: { email: 'asc' },
    });
  }

  async create(user: AuthUser, dto: CreateStaffUserDto) {
    const organizationId = user.role === Role.SUPER_ADMIN ? dto.organizationId : user.organizationId;
    if (!organizationId) throw new BadRequestException('organizationId is required');
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('Email already registered');
    }
    if (dto.branchId) {
      if (dto.role !== Role.FACILITY_MANAGER) throw new BadRequestException('Only facility managers can be assigned a branch');
      const branch = await this.prisma.facilityBranch.findFirst({ where: { id: dto.branchId, organizationId } });
      if (!branch) throw new BadRequestException('Branch does not belong to this organization');
      if (branch.managerId) throw new ConflictException('Branch already has a manager');
    }

    const temporaryPassword = generateTempPassword();
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        role: dto.role as Role,
        organizationId,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        mustChangePassword: true,
      },
      select: { id: true, email: true, role: true, organizationId: true },
    });
    if (dto.branchId) {
      await this.prisma.facilityBranch.update({ where: { id: dto.branchId }, data: { managerId: created.id } });
    }
    // Shown once; the user must change it at first login.
    return { ...created, temporaryPassword };
  }

  async update(user: AuthUser, id: string, dto: UpdateStaffUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.role === Role.RELIEF_WORKER || target.role === Role.SUPER_ADMIN) {
      throw new NotFoundException('User not found');
    }
    this.access.assertOrg(user, target.organizationId ?? '');
    if (target.id === user.id && dto.isActive === false) throw new BadRequestException('You cannot deactivate yourself');
    return this.prisma.user.update({
      where: { id },
      data: { ...dto, ...(dto.isActive === false ? { tokenVersion: { increment: 1 } } : {}) },
      select: { id: true, email: true, role: true, isActive: true },
    });
  }
}
