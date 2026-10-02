import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocStatus, DocType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ReliefWorkersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    profession?: string;
    isVerified?: boolean;
    systemTag?: string;
    accreditation?: string;
    search?: string;
  }) {
    const where: any = {};
    if (query.profession) where.profession = query.profession;
    if (query.isVerified !== undefined) where.isVerified = query.isVerified;
    if (query.systemTag) where.systemTags = { has: query.systemTag };
    if (query.accreditation) where.accreditations = { has: query.accreditation };
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { registrationNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.reliefProfile.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        documents: true,
        staffBankMemberships: {
          include: { organization: { select: { id: true, name: true } } },
        },
        _count: { select: { assignedShifts: true, timesheets: true } },
      },
    });
  }

  async findOne(id: string) {
    const worker = await this.prisma.reliefProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, isActive: true, createdAt: true } },
        documents: {
          include: { verifiedBy: { select: { id: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
        assignedShifts: {
          include: { branch: true },
          orderBy: { startTime: 'desc' },
          take: 20,
        },
        timesheets: {
          include: { branch: true },
          orderBy: { submittedAt: 'desc' },
          take: 20,
        },
        staffBankMemberships: {
          include: { organization: true, branch: true },
        },
        favouriteBranches: {
          include: { branch: true },
        },
      },
    });
    if (!worker) throw new NotFoundException('Relief worker profile not found');
    return worker;
  }

  async createConciergeWorker(data: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    registrationNumber: string;
    profession?: string;
    hourlyRate?: number;
    minimumShiftRate?: number;
    systemTags?: string[];
    accreditations?: string[];
    university?: string;
    graduationYear?: number;
    yearsCommunityExperience?: number;
    yearsHospitalExperience?: number;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new BadRequestException('Email already registered');

    const tempPassword = await bcrypt.hash('TempFlexShift2026!', 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: tempPassword,
          role: Role.RELIEF_WORKER,
        },
      });

      return tx.reliefProfile.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          registrationNumber: data.registrationNumber,
          profession: data.profession || 'Pharmacist',
          hourlyRate: data.hourlyRate,
          minimumShiftRate: data.minimumShiftRate,
          systemTags: data.systemTags || [],
          accreditations: data.accreditations || [],
          university: data.university,
          graduationYear: data.graduationYear,
          yearsCommunityExperience: data.yearsCommunityExperience || 0,
          yearsHospitalExperience: data.yearsHospitalExperience || 0,
        },
        include: { user: true },
      });
    });
  }

  async uploadDocument(workerId: string, data: {
    type: DocType;
    documentReference?: string;
    fileUrl: string;
    issueDate?: Date;
    expiresAt?: Date;
  }) {
    return this.prisma.complianceDocument.create({
      data: {
        reliefWorkerId: workerId,
        type: data.type,
        documentReference: data.documentReference,
        fileUrl: data.fileUrl,
        issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        status: DocStatus.PENDING,
      },
    });
  }

  async verifyDocument(
    docId: string,
    status: DocStatus,
    verifierUserId: string,
    verificationNotes?: string,
  ) {
    const doc = await this.prisma.complianceDocument.update({
      where: { id: docId },
      data: {
        status,
        verifiedAt: new Date(),
        verifiedById: verifierUserId,
        verificationNotes,
      },
      include: { reliefWorker: true },
    });

    // Check if worker now has all mandatory docs verified
    const mandatoryTypes: DocType[] = [
      DocType.IDENTITY,
      DocType.RIGHT_TO_WORK,
      DocType.DBS_POLICE_CHECK,
      DocType.INDEMNITY_INSURANCE,
    ];

    const workerDocs = await this.prisma.complianceDocument.findMany({
      where: {
        reliefWorkerId: doc.reliefWorkerId,
        status: DocStatus.VERIFIED,
      },
    });

    const verifiedTypes = new Set(workerDocs.map((d) => d.type));
    const allMandatoryVerified = mandatoryTypes.every((t) => verifiedTypes.has(t));

    await this.prisma.reliefProfile.update({
      where: { id: doc.reliefWorkerId },
      data: { isVerified: allMandatoryVerified },
    });

    return doc;
  }

  async updatePreferences(workerId: string, data: {
    minimumShiftRate?: number;
    hourlyRate?: number;
    bio?: string;
    systemTags?: string[];
    accreditations?: string[];
  }) {
    return this.prisma.reliefProfile.update({
      where: { id: workerId },
      data,
    });
  }

  async toggleWatchShift(workerId: string, shiftId: string) {
    const existing = await this.prisma.workerWatchedShift.findUnique({
      where: { reliefWorkerId_shiftId: { reliefWorkerId: workerId, shiftId } },
    });
    if (existing) {
      await this.prisma.workerWatchedShift.delete({ where: { id: existing.id } });
      return { watched: false };
    } else {
      await this.prisma.workerWatchedShift.create({
        data: { reliefWorkerId: workerId, shiftId },
      });
      return { watched: true };
    }
  }

  async toggleFavouriteBranch(workerId: string, branchId: string) {
    const existing = await this.prisma.workerFavouriteBranch.findUnique({
      where: { reliefWorkerId_branchId: { reliefWorkerId: workerId, branchId } },
    });
    if (existing) {
      await this.prisma.workerFavouriteBranch.delete({ where: { id: existing.id } });
      return { favourited: false };
    } else {
      await this.prisma.workerFavouriteBranch.create({
        data: { reliefWorkerId: workerId, branchId },
      });
      return { favourited: true };
    }
  }
}
