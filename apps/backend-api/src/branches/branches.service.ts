import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId?: string) {
    return this.prisma.facilityBranch.findMany({
      where: organizationId ? { organizationId } : undefined,
      include: {
        organization: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, email: true } },
        _count: { select: { shifts: true, staffBankMembers: true } },
      },
    });
  }

  async findOne(id: string) {
    const branch = await this.prisma.facilityBranch.findUnique({
      where: { id },
      include: {
        organization: true,
        manager: true,
        shifts: {
          orderBy: { startTime: 'asc' },
          include: {
            assignedWorker: true,
            _count: { select: { applications: true, negotiations: true } },
          },
        },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async create(data: {
    organizationId: string;
    name: string;
    branchCode: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postcode: string;
    phone: string;
    email?: string;
    managerId?: string;
  }) {
    return this.prisma.facilityBranch.create({ data });
  }

  async getRota(branchId: string, startDate?: string, endDate?: string) {
    const where: any = { branchId };
    if (startDate && endDate) {
      where.startTime = { gte: new Date(startDate) };
      where.endTime = { lte: new Date(endDate) };
    }
    return this.prisma.shift.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        assignedWorker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            registrationNumber: true,
          },
        },
        _count: { select: { applications: true, negotiations: true } },
      },
    });
  }
}
