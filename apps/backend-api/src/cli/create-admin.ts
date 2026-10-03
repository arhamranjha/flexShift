/**
 * Creates (or resets) the first SUPER_ADMIN on a fresh deployment, so demo seed accounts never exist in production.
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' node dist/cli/create-admin.js
 * The account must change the password at first sign-in.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Set ADMIN_EMAIL to a valid email address');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  if (password === 'FlexShiftPass2026!') throw new Error('Refusing to use the public demo password');

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: Role.SUPER_ADMIN, isActive: true, mustChangePassword: true, tokenVersion: { increment: 1 } },
      create: { email, passwordHash, role: Role.SUPER_ADMIN, mustChangePassword: true },
    });
    console.log(`Super admin ready: ${user.email} (password change required at first sign-in)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
