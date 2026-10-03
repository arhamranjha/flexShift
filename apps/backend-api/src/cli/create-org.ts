/**
 * Creates an organization with its first branch and its people on a fresh deployment.
 *   echo '{"orgName":"Acme Pharmacy", ...}' | node dist/cli/create-org.js
 * Prints a one-time temporary password for each new user (they must change it at first sign-in).
 * Until the dashboard has a "create organization" screen, this is how a customer is onboarded.
 */
import { PrismaClient } from '@prisma/client';
import { createOrganization, type CreateOrgInput } from '../organizations/onboarding';

// Kept for callers (and tests) that import the core from here.
export { createOrganization, type CreateOrgInput, type CreatedUser } from '../organizations/onboarding';

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const input = JSON.parse(await readStdin()) as CreateOrgInput;
  const prisma = new PrismaClient();
  try {
    const out = await createOrganization(prisma, input);
    console.log(`Created organization ${input.orgName} (${out.organizationCode}) with branch "${input.branchName}"`);
    console.log('One-time temporary passwords (each user must change theirs at first sign-in):');
    for (const u of out.users) console.log(`  ${u.role.padEnd(16)} ${u.email}   ${u.temporaryPassword}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
