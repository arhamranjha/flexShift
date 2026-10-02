import { DocStatus, Prisma } from '@prisma/client';
import { MANDATORY_DOCS } from '../shifts/eligibility';

/** A worker is "verified" when every mandatory document type is VERIFIED and unexpired. */
export async function recomputeVerified(tx: Prisma.TransactionClient, workerId: string) {
  const docs = await tx.complianceDocument.findMany({
    where: { reliefWorkerId: workerId, status: DocStatus.VERIFIED },
  });
  const now = Date.now();
  const valid = new Set(docs.filter((d) => !d.expiresAt || d.expiresAt.getTime() > now).map((d) => d.type));
  const isVerified = MANDATORY_DOCS.every((t) => valid.has(t));
  await tx.reliefProfile.update({ where: { id: workerId }, data: { isVerified } });
  return isVerified;
}
