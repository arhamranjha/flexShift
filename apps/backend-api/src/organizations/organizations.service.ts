import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.organization.findMany({
      include: {
        branches: true,
        _count: {
          select: { branches: true, staffBankMembers: true, users: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        branches: {
          include: {
            manager: {
              select: { id: true, email: true },
            },
          },
        },
        staffBankMembers: {
          include: {
            reliefWorker: true,
          },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(data: {
    name: string;
    slug: string;
    code: string;
    billingEmail: string;
    phone: string;
    subscriptionTier?: string;
  }) {
    return this.prisma.organization.create({ data });
  }
}
