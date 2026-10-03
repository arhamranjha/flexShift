import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from './test-env';

/** Rebuilds the dedicated test database from migrations + seed. Never touches the dev database. */
export default async () => {
  if (!/test/.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error('Refusing to reset a database whose name does not contain "test"');
  }
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$disconnect();
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('npx ts-node prisma/seed.ts', { env, stdio: 'ignore' });
};
