import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentShareStatus, Prisma, Role, StaffBankTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, AuthUser } from '../common/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AcceptDocumentShareDto, CreateDocumentShareDto, DocumentShareQueryDto } from './dto/document-share.dto';

/** A worker may have this many requests waiting at once, so nobody can spray every organization on the platform. */
export const MAX_PENDING_SHARES = 5;

const ORG_SUMMARY = { select: { id: true, name: true } } as const;
const WORKER_SUMMARY = {
  select: {
    id: true, firstName: true, lastName: true, profession: true, registrationNumber: true, country: true, isVerified: true,
    documents: { select: { id: true, type: true, status: true, expiresAt: true } },
  },
} as const;

/**
 * Worker-initiated verification path (DECISIONS 2.6): a self-registered worker asks an organization to review their
 * documents. While the request is PENDING the organization has the worker in scope (AccessService.workerScope) and can
 * review and verify their documents in the Compliance Desk; accepting adds the worker to its staff bank.
 * Every state change is a conditional update on the current status, so two people answering at once cannot both win.
 */
@Injectable()
export class DocumentSharesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
  ) {}

  listMine(workerId: string) {
    return this.prisma.documentShare.findMany({
      where: { reliefWorkerId: workerId },
      include: { organization: ORG_SUMMARY },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(workerId: string, dto: CreateDocumentShareDto) {
    if (!dto.organizationId === !dto.organizationCode) {
      throw new BadRequestException('Give either organizationId or organizationCode');
    }
    const org = await this.prisma.organization.findFirst({
      where: {
        isActive: true,
        ...(dto.organizationId ? { id: dto.organizationId } : { code: dto.organizationCode!.trim().toUpperCase() }),
      },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const [worker, member, existing, pending] = await Promise.all([
      this.prisma.reliefProfile.findUniqueOrThrow({ where: { id: workerId }, select: { firstName: true, lastName: true, profession: true } }),
      this.prisma.staffBankMember.findUnique({ where: { organizationId_reliefWorkerId: { organizationId: org.id, reliefWorkerId: workerId } } }),
      this.prisma.documentShare.findUnique({ where: { reliefWorkerId_organizationId: { reliefWorkerId: workerId, organizationId: org.id } } }),
      this.prisma.documentShare.count({ where: { reliefWorkerId: workerId, status: DocumentShareStatus.PENDING } }),
    ]);
    if (member) throw new ConflictException(`You are already in ${org.name}'s staff bank`);
    if (existing?.status === DocumentShareStatus.PENDING) throw new ConflictException(`You have already asked ${org.name}`);
    if (existing?.status === DocumentShareStatus.DECLINED) throw new ConflictException(`${org.name} declined your request`);
    if (pending >= MAX_PENDING_SHARES) {
      throw new BadRequestException(`You can have at most ${MAX_PENDING_SHARES} requests waiting; withdraw one first`);
    }

    let share;
    if (existing) {
      // WITHDRAWN, or ACCEPTED but since removed from the staff bank: the worker may ask again.
      const reopened = await this.prisma.documentShare.updateMany({
        where: { id: existing.id, status: existing.status },
        data: { status: DocumentShareStatus.PENDING, respondedAt: null, respondedById: null },
      });
      if (!reopened.count) throw new ConflictException('This request changed; reload and try again');
      share = await this.prisma.documentShare.findUniqueOrThrow({ where: { id: existing.id }, include: { organization: ORG_SUMMARY } });
    } else {
      try {
        share = await this.prisma.documentShare.create({
          data: { reliefWorkerId: workerId, organizationId: org.id },
          include: { organization: ORG_SUMMARY },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`You have already asked ${org.name}`);
        throw e;
      }
    }

    await this.notifications.notifyOrgAdmins(org.id, {
      type: 'DOCUMENT_SHARE_REQUESTED',
      title: 'A worker asked you to review their documents',
      body: `${worker.firstName} ${worker.lastName} (${worker.profession})`,
      link: '/compliance',
    });
    return share;
  }

  async withdraw(workerId: string, id: string) {
    const res = await this.prisma.documentShare.updateMany({
      where: { id, reliefWorkerId: workerId, status: DocumentShareStatus.PENDING },
      data: { status: DocumentShareStatus.WITHDRAWN },
    });
    if (!res.count) {
      const exists = await this.prisma.documentShare.findFirst({ where: { id, reliefWorkerId: workerId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Request not found');
      throw new ConflictException('Only a waiting request can be withdrawn');
    }
    return this.prisma.documentShare.findUniqueOrThrow({ where: { id }, include: { organization: ORG_SUMMARY } });
  }

  listForOrganization(user: AuthUser, q: DocumentShareQueryDto) {
    const organizationId = user.role === Role.SUPER_ADMIN ? q.organizationId : (user.organizationId ?? undefined);
    if (user.role !== Role.SUPER_ADMIN && !organizationId) throw new ForbiddenException('You do not belong to an organization');
    return this.prisma.documentShare.findMany({
      where: { ...(organizationId ? { organizationId } : {}), status: q.status ?? DocumentShareStatus.PENDING },
      include: { reliefWorker: WORKER_SUMMARY, organization: ORG_SUMMARY },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  /** Shares outside the caller's organization answer 404, like other tenant lookups. */
  private async loadForStaff(user: AuthUser, id: string) {
    const share = await this.prisma.documentShare.findUnique({ where: { id }, include: { organization: ORG_SUMMARY } });
    if (!share || (user.role !== Role.SUPER_ADMIN && share.organizationId !== user.organizationId)) {
      throw new NotFoundException('Request not found');
    }
    return share;
  }

  async accept(user: AuthUser, id: string, dto: AcceptDocumentShareDto) {
    const share = await this.loadForStaff(user, id);
    let branchId = dto.branchId;
    if (user.role === Role.FACILITY_MANAGER) {
      // Same rule as adding to the staff bank directly: managers only add to their own branch.
      if (!user.managedBranch?.id) throw new ForbiddenException('Facility managers can only add workers to their own branch');
      if (branchId && branchId !== user.managedBranch.id) throw new ForbiddenException('Facility managers can only add workers to their own branch');
      branchId = user.managedBranch.id;
    } else if (branchId) {
      const branch = await this.prisma.facilityBranch.findFirst({ where: { id: branchId, organizationId: share.organizationId }, select: { id: true } });
      if (!branch) throw new BadRequestException('Branch does not belong to this organization');
    }

    const accepted = await this.prisma.$transaction(async (tx) => {
      const res = await tx.documentShare.updateMany({
        where: { id, status: DocumentShareStatus.PENDING },
        data: { status: DocumentShareStatus.ACCEPTED, respondedById: user.id, respondedAt: new Date() },
      });
      if (!res.count) throw new ConflictException('This request has already been answered or withdrawn');
      const key = { organizationId: share.organizationId, reliefWorkerId: share.reliefWorkerId };
      // Someone may have added the worker to the bank directly in the meantime; keep that membership as it is.
      await tx.staffBankMember.upsert({
        where: { organizationId_reliefWorkerId: key },
        update: {},
        create: { ...key, branchId, tier: dto.tier ?? StaffBankTier.TIER_2_REGULAR },
      });
      return tx.documentShare.findUniqueOrThrow({ where: { id }, include: { organization: ORG_SUMMARY } });
    });

    await this.notifications.notifyWorker(share.reliefWorkerId, {
      type: 'DOCUMENT_SHARE_ACCEPTED',
      title: `${share.organization.name} added you to their staff bank`,
      link: '/profile',
    });
    return accepted;
  }

  async decline(user: AuthUser, id: string) {
    const share = await this.loadForStaff(user, id);
    const res = await this.prisma.documentShare.updateMany({
      where: { id, status: DocumentShareStatus.PENDING },
      data: { status: DocumentShareStatus.DECLINED, respondedById: user.id, respondedAt: new Date() },
    });
    if (!res.count) throw new ConflictException('This request has already been answered or withdrawn');

    await this.notifications.notifyWorker(share.reliefWorkerId, {
      type: 'DOCUMENT_SHARE_DECLINED',
      title: `${share.organization.name} declined your request`,
      link: '/profile',
    });
    return this.prisma.documentShare.findUniqueOrThrow({ where: { id }, include: { organization: ORG_SUMMARY } });
  }
}
