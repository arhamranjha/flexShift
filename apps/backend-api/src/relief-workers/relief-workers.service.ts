import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocStatus, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { extname } from 'path';
import { AccessService, AuthUser } from '../common/access.service';
import { StorageService } from '../storage/storage.service';
import { isVisibleToWorker } from '../shifts/eligibility';
import { recomputeVerified } from './verification';
import { NotificationsService } from '../notifications/notifications.service';
import { generateTempPassword } from '../users/users.service';
import { DEFAULT_MARKET } from '../common/markets';
import {
  ConciergeWorkerDto, DocumentQueueQueryDto, UpdatePreferencesDto, UploadDocumentDto, VerifyDocumentDto, WorkerQueryDto,
} from './dto/relief-worker.dto';

/**
 * The file's extension says what it claims to be and its first bytes must agree. The browser-reported mimetype is
 * ignored: it comes from the user's OS registry and can be blank or wrong for perfectly good files.
 */
function assertFileSignature(file: { buffer: Buffer; originalname: string }) {
  const ext = extname(file.originalname).toLowerCase();
  const b = file.buffer;
  const ok =
    (ext === '.pdf' && b.subarray(0, 5).toString('latin1') === '%PDF-') ||
    (ext === '.png' && b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
    ((ext === '.jpg' || ext === '.jpeg') && b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
  if (!ok) throw new BadRequestException('File content does not match its type (PDF, PNG or JPEG only)');
}

@Injectable()
export class ReliefWorkersService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  async findAll(user: AuthUser, query: WorkerQueryDto) {
    const where: Prisma.ReliefProfileWhereInput = { AND: [this.access.workerScope(user)] };
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
          where: user.role === Role.SUPER_ADMIN ? {} : { organizationId: user.organizationId ?? '' },
          include: { organization: { select: { id: true, name: true } } },
        },
        _count: { select: { assignedShifts: true, timesheets: true } },
      },
      take: 200,
    });
  }

  /** Exact-match lookup by professional registration number, so an organization can invite a worker to its bank. */
  async lookup(registrationNumber: string) {
    const worker = await this.prisma.reliefProfile.findUnique({
      where: { registrationNumber: registrationNumber.trim() },
      select: { id: true, firstName: true, lastName: true, profession: true, registrationNumber: true, isVerified: true },
    });
    if (!worker) throw new NotFoundException('No relief worker found with that registration number');
    return worker;
  }

  /** Staff may only act on workers in their organization's scope. */
  private async assertWorkerVisible(user: AuthUser, workerId: string) {
    if (user.role === Role.RELIEF_WORKER) return this.access.assertWorkerSelfOrStaff(user, workerId);
    const found = await this.prisma.reliefProfile.findFirst({
      where: { AND: [{ id: workerId }, this.access.workerScope(user)] },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Relief worker profile not found');
  }

  async findOne(user: AuthUser, id: string) {
    await this.assertWorkerVisible(user, id);
    // Staff only see this worker's activity within their own organization.
    const orgId = user.role === Role.RELIEF_WORKER || user.role === Role.SUPER_ADMIN ? undefined : (user.organizationId ?? '');
    const inOrg = orgId ? { branch: { organizationId: orgId } } : {};
    const worker = await this.prisma.reliefProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, isActive: true, createdAt: true } },
        documents: {
          include: { verifiedBy: { select: { id: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
        assignedShifts: { where: inOrg, include: { branch: true }, orderBy: { startTime: 'desc' }, take: 20 },
        timesheets: { where: inOrg, include: { branch: true }, orderBy: { submittedAt: 'desc' }, take: 20 },
        staffBankMemberships: { where: orgId ? { organizationId: orgId } : {}, include: { organization: true, branch: true } },
        favouriteBranches: { include: { branch: true } },
      },
    });
    if (!worker) throw new NotFoundException('Relief worker profile not found');
    return worker;
  }

  async createConciergeWorker(user: AuthUser, data: ConciergeWorkerDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email already registered');

    // A worker onboarded by an organization defaults to that organization's market.
    const orgCountry = user.organizationId
      ? ((await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { country: true } }))?.country ?? DEFAULT_MARKET)
      : DEFAULT_MARKET;
    const temporaryPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const { email, ...profile } = data;

    const created = await this.prisma.$transaction(async (tx) => {
      const created_user = await tx.user.create({
        data: { email, passwordHash, role: Role.RELIEF_WORKER, mustChangePassword: true },
      });
      return tx.reliefProfile.create({
        data: {
          userId: created_user.id,
          createdByOrganizationId: user.organizationId ?? null,
          ...profile,
          profession: profile.profession || 'Pharmacist',
          country: profile.country ?? orgCountry,
          systemTags: profile.systemTags || [],
          accreditations: profile.accreditations || [],
        },
        include: { user: { select: { id: true, email: true } } },
      });
    });
    // Shown once so the admin can hand it to the worker; the worker must change it at first login.
    return { ...created, temporaryPassword };
  }

  async uploadDocument(
    user: AuthUser,
    workerId: string,
    dto: UploadDocumentDto,
    file?: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    await this.assertWorkerVisible(user, workerId);
    if (!file) throw new BadRequestException('A document file is required (multipart field "file")');
    if (!(await this.prisma.reliefProfile.findUnique({ where: { id: workerId }, select: { id: true } }))) {
      throw new NotFoundException('Relief worker profile not found');
    }
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : undefined;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (issueDate && expiresAt && expiresAt <= issueDate) throw new BadRequestException('Expiry must be after the issue date');

    assertFileSignature(file);
    const { key } = await this.storage.save(file);
    const doc = await this.prisma.complianceDocument.create({
      data: {
        reliefWorkerId: workerId,
        type: dto.type,
        documentReference: dto.documentReference,
        fileUrl: key,
        issueDate,
        expiresAt,
        status: DocStatus.PENDING,
      },
    });

    // A worker uploading for themselves may belong to no organization yet, so the platform operator is told there is something to review.
    if (user.role === Role.RELIEF_WORKER) {
      const w = await this.prisma.reliefProfile.findUnique({ where: { id: workerId }, select: { firstName: true, lastName: true } });
      await this.notifications.notifyPlatformAdmins({
        type: 'DOCUMENT_UPLOADED',
        title: 'A worker uploaded a document for review',
        body: `${w?.firstName} ${w?.lastName}: ${dto.type}`,
        link: '/compliance',
      });
    }
    return doc;
  }

  async downloadDocument(user: AuthUser, docId: string) {
    const doc = await this.prisma.complianceDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.assertWorkerVisible(user, doc.reliefWorkerId);
    return { buffer: await this.storage.read(doc.fileUrl), filename: doc.fileUrl };
  }

  documentQueue(user: AuthUser, q: DocumentQueueQueryDto) {
    return this.prisma.complianceDocument.findMany({
      where: { status: q.status ?? DocStatus.PENDING, reliefWorker: this.access.workerScope(user) },
      include: {
        reliefWorker: { select: { id: true, firstName: true, lastName: true, profession: true, registrationNumber: true, country: true, user: { select: { email: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async verifyDocument(user: AuthUser, docId: string, dto: VerifyDocumentDto) {
    const verifierUserId = user.id;
    if (dto.status === DocStatus.REJECTED && !dto.notes?.trim()) {
      throw new BadRequestException('A note is required when rejecting a document');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.complianceDocument.findUnique({ where: { id: docId } });
      if (!existing) throw new NotFoundException('Document not found');
      await this.assertWorkerVisible(user, existing.reliefWorkerId);
      if (dto.status === DocStatus.VERIFIED && existing.expiresAt && existing.expiresAt <= new Date()) {
        throw new BadRequestException('Cannot verify a document that has already expired');
      }

      const doc = await tx.complianceDocument.update({
        where: { id: docId },
        data: {
          status: dto.status as DocStatus,
          verifiedAt: new Date(),
          verifiedById: verifierUserId,
          verificationNotes: dto.notes,
        },
        include: { reliefWorker: true },
      });
      await recomputeVerified(tx, doc.reliefWorkerId);
      return doc;
    }).then(async (doc) => {
      await this.notifications.notifyWorker(doc.reliefWorkerId, {
        type: dto.status === 'VERIFIED' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
        title: dto.status === 'VERIFIED' ? 'Document verified' : 'Document rejected',
        body: dto.status === 'REJECTED' ? `${doc.type}: ${dto.notes}` : doc.type,
        link: '/profile',
      });
      return doc;
    });
  }

  updatePreferences(workerId: string, data: UpdatePreferencesDto) {
    return this.prisma.reliefProfile.update({ where: { id: workerId }, data });
  }

  async toggleWatchShift(workerId: string, shiftId: string) {
    const [shift, memberships] = await Promise.all([
      this.prisma.shift.findUnique({ where: { id: shiftId }, include: { branch: true } }),
      this.prisma.staffBankMember.findMany({ where: { reliefWorkerId: workerId } }),
    ]);
    if (!shift || !isVisibleToWorker(shift, memberships)) throw new NotFoundException('Shift not found');

    const existing = await this.prisma.workerWatchedShift.findUnique({
      where: { reliefWorkerId_shiftId: { reliefWorkerId: workerId, shiftId } },
    });
    if (existing) {
      await this.prisma.workerWatchedShift.delete({ where: { id: existing.id } });
      return { watched: false };
    }
    await this.prisma.workerWatchedShift.create({ data: { reliefWorkerId: workerId, shiftId } });
    return { watched: true };
  }

  async toggleFavouriteBranch(workerId: string, branchId: string) {
    if (!(await this.prisma.facilityBranch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
      throw new NotFoundException('Branch not found');
    }
    const existing = await this.prisma.workerFavouriteBranch.findUnique({
      where: { reliefWorkerId_branchId: { reliefWorkerId: workerId, branchId } },
    });
    if (existing) {
      await this.prisma.workerFavouriteBranch.delete({ where: { id: existing.id } });
      return { favourited: false };
    }
    await this.prisma.workerFavouriteBranch.create({ data: { reliefWorkerId: workerId, branchId } });
    return { favourited: true };
  }
}
