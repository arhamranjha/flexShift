import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentShareStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** The user object attached to the request by JwtStrategy. */
export interface AuthUser {
  id: string;
  role: Role;
  organizationId?: string | null;
  reliefProfile?: { id: string } | null;
  managedBranch?: { id: string } | null;
}

const NO_MATCH = '00000000-0000-0000-0000-000000000000';

/**
 * Central tenant-isolation rules.
 *  - SUPER_ADMIN: everything.
 *  - ORG_ADMIN: every branch of their organization.
 *  - FACILITY_MANAGER: their organization (org-level resources) and only their own branch.
 * Branch-level lookups answer 404 (not 403) so other tenants' ids are not confirmed to exist.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  assertOrg(user: AuthUser, organizationId: string) {
    if (user.role === Role.SUPER_ADMIN) return;
    if (!user.organizationId || user.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this organization');
    }
  }

  /** Prisma filter for the branches this user may see. */
  branchScope(user: AuthUser): Prisma.FacilityBranchWhereInput {
    switch (user.role) {
      case Role.SUPER_ADMIN:
        return {};
      case Role.ORG_ADMIN:
        return { organizationId: user.organizationId ?? NO_MATCH };
      case Role.FACILITY_MANAGER:
        return { id: user.managedBranch?.id ?? NO_MATCH };
      default:
        return { id: NO_MATCH };
    }
  }

  async assertBranch(user: AuthUser, branchId: string) {
    const branch = await this.prisma.facilityBranch.findFirst({
      where: { AND: [{ id: branchId }, this.branchScope(user)] },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async assertShift<T extends Prisma.ShiftInclude>(user: AuthUser, shiftId: string, include?: T) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, branch: this.branchScope(user) },
      include: include as T,
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  /**
   * Relief workers an organization may see: ones it onboarded, has in its staff bank, that applied / negotiated /
   * were booked on its shifts, or that have a pending request asking it to review their documents. SUPER_ADMIN sees all.
   */
  workerScope(user: AuthUser): Prisma.ReliefProfileWhereInput {
    if (user.role === Role.SUPER_ADMIN) return {};
    const orgId = user.organizationId ?? NO_MATCH;
    const onOrgShift = { shift: { branch: { organizationId: orgId } } };
    return {
      OR: [
        { createdByOrganizationId: orgId },
        { staffBankMemberships: { some: { organizationId: orgId } } },
        { applications: { some: onOrgShift } },
        { negotiations: { some: onOrgShift } },
        { assignedShifts: { some: { branch: { organizationId: orgId } } } },
        // Only while pending: acceptance adds the worker to the staff bank, which keeps them in scope from then on.
        { documentShares: { some: { organizationId: orgId, status: DocumentShareStatus.PENDING } } },
      ],
    };
  }

  /** Relief workers may only act on their own profile; staff are allowed through. */
  assertWorkerSelfOrStaff(user: AuthUser, workerId: string) {
    if (user.role === Role.RELIEF_WORKER && user.reliefProfile?.id !== workerId) {
      throw new ForbiddenException('You can only act on your own profile');
    }
  }
}
