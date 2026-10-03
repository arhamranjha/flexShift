import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, AuthUser } from '../common/access.service';
import { marketFor } from '../common/markets';
import { CreateOrganizationDto, OnboardOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { createOrganization } from './onboarding';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async findAll(user: AuthUser) {
    return this.prisma.organization.findMany({
      where: user.role === Role.SUPER_ADMIN ? {} : { id: user.organizationId ?? '' },
      include: {
        branches: true,
        users: { where: { role: Role.ORG_ADMIN }, select: { id: true, email: true, isActive: true, mustChangePassword: true, lastLoginAt: true } },
        _count: { select: { branches: true, staffBankMembers: true, users: true } },
      },
    });
  }

  async findOne(user: AuthUser, id: string) {
    this.access.assertOrg(user, id);
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        branches: { include: { manager: { select: { id: true, email: true } } } },
        staffBankMembers: { include: { reliefWorker: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async onboard(input: OnboardOrganizationDto) {
    try {
      return await createOrganization(this.prisma, input);
    } catch (e) {
      // The onboarding core checks everything up front and explains problems in plain words.
      if (e instanceof Error && !(e as { code?: string }).code) throw new BadRequestException(e.message);
      throw e;
    }
  }

  create(data: CreateOrganizationDto) {
    const market = marketFor(data.country);
    return this.prisma.organization.create({ data: { ...data, country: market.code, currency: market.currency, timezone: market.timezone } });
  }

  async update(user: AuthUser, id: string, dto: UpdateOrganizationDto) {
    this.access.assertOrg(user, id);
    const market = dto.country ? marketFor(dto.country) : null;
    return this.prisma.organization.update({
      where: { id },
      data: { ...dto, ...(market ? { country: market.code, currency: market.currency, timezone: market.timezone } : {}) },
    });
  }
}
