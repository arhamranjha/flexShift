import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocStatus, DocType, Prisma, ShiftVisibility, StaffBankTier } from '@prisma/client';

export const MANDATORY_DOCS: DocType[] = [
  DocType.IDENTITY,
  DocType.RIGHT_TO_WORK,
  DocType.DBS_POLICE_CHECK,
  DocType.INDEMNITY_INSURANCE,
];

type ShiftLike = {
  endTime: Date;
  requiredSystems: string[];
  requiredAccreditations: string[];
};
type WorkerLike = {
  systemTags: string[];
  accreditations: string[];
  documents: { type: DocType; status: DocStatus; expiresAt: Date | null }[];
};

const lower = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));

/** Reasons a worker cannot take a shift (empty array = eligible). */
export function eligibilityProblems(
  shift: ShiftLike,
  worker: WorkerLike,
  opts: { skipSkills?: boolean; extraDocs?: DocType[] } = {},
): string[] {
  const problems: string[] = [];

  // Platform-wide mandatory credentials plus anything the shift's organization insists on.
  for (const type of new Set([...MANDATORY_DOCS, ...(opts.extraDocs ?? [])])) {
    const ok = worker.documents.some(
      (d) =>
        d.type === type &&
        d.status === DocStatus.VERIFIED &&
        (!d.expiresAt || d.expiresAt.getTime() > shift.endTime.getTime()),
    );
    if (!ok) problems.push(`Missing, unverified or expired document: ${type}`);
  }

  if (!opts.skipSkills) {
    const systems = lower(worker.systemTags);
    for (const s of shift.requiredSystems) {
      if (!systems.has(s.trim().toLowerCase())) problems.push(`Missing required system: ${s}`);
    }
    const accr = lower(worker.accreditations);
    for (const a of shift.requiredAccreditations) {
      if (!accr.has(a.trim().toLowerCase())) problems.push(`Missing required accreditation: ${a}`);
    }
  }
  return problems;
}

export const TIER_RANK: Record<StaffBankTier, number> = {
  TIER_1_PREFERRED: 1,
  TIER_2_REGULAR: 2,
  TIER_3_RESERVE: 3,
};

/**
 * STAFF_BANK_ONLY shifts are only visible to active staff-bank members of the branch's organization,
 * and only once the tiered cascade has reached the member's tier (Tier 1 first, Tier 3 last).
 */
export function isVisibleToWorker(
  shift: { visibility: ShiftVisibility; branchId: string; cascadeStage: number; branch: { organizationId: string } },
  memberships: { organizationId: string; branchId: string | null; isActive: boolean; tier: StaffBankTier }[],
): boolean {
  if (shift.visibility !== ShiftVisibility.STAFF_BANK_ONLY) return true;
  return memberships.some(
    (m) =>
      m.isActive &&
      m.organizationId === shift.branch.organizationId &&
      (m.branchId === null || m.branchId === shift.branchId) &&
      TIER_RANK[m.tier] <= shift.cascadeStage,
  );
}

/**
 * Loads shift + worker and throws unless the worker may book the shift.
 * `asManager` skips the visibility rule (managers can assign anyone who is compliant).
 */
export async function assertWorkerCanBook(
  client: Prisma.TransactionClient,
  shiftId: string,
  workerId: string,
  opts: { asManager?: boolean; skipSkills?: boolean } = {},
) {
  const shift = await client.shift.findUnique({
    where: { id: shiftId },
    include: { branch: { include: { organization: { select: { requiredDocTypes: true } } } } },
  });
  if (!shift) throw new NotFoundException('Shift not found');

  const worker = await client.reliefProfile.findUnique({
    where: { id: workerId },
    include: { documents: true, staffBankMemberships: true },
  });
  if (!worker) throw new NotFoundException('Worker not found');

  if (!opts.asManager && !isVisibleToWorker(shift, worker.staffBankMemberships)) {
    // Do not reveal that a staff-bank-only shift exists.
    throw new NotFoundException('Shift not found');
  }

  const problems = eligibilityProblems(shift, worker, {
    skipSkills: opts.skipSkills,
    extraDocs: shift.branch.organization?.requiredDocTypes ?? [],
  });
  if (problems.length) {
    throw new ForbiddenException({
      message: 'Worker is not eligible for this shift',
      problems,
    });
  }
  return { shift, worker };
}

export function assertShiftBookable(status: string) {
  if (status !== 'OPEN' && status !== 'IN_NEGOTIATION') {
    throw new BadRequestException('Shift is not open for booking');
  }
}

/**
 * Serialises concurrent bookings for one worker: takes a row lock so the overlap check that
 * follows sees any booking committed by a competing transaction.
 */
export async function lockWorker(tx: Prisma.TransactionClient, workerId: string) {
  await tx.$queryRaw`SELECT id FROM "ReliefProfile" WHERE id = ${workerId} FOR UPDATE`;
}
