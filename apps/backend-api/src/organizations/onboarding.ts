/**
 * Onboarding a customer: an organization with its first branch, an organization admin and an optional branch manager.
 * Shared by the `create-org` command and the super-admin API; one-time temporary passwords are returned to the caller.
 */
import { Prisma, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { marketFor } from '../common/markets';
import { randomBytes } from 'crypto';

export interface CreateOrgInput {
  orgName: string;
  /** Becomes the organization admin. */
  adminEmail: string;
  billingEmail?: string;
  phone: string;
  branchName: string;
  branchCode: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  country?: string;
  branchPhone?: string;
  /** Optional branch manager (FACILITY_MANAGER) for the first branch. */
  managerEmail?: string;
  /** Market: NZ (default) or GB. Sets the organization's currency and timezone. */
  marketCode?: string;
}

export interface CreatedUser {
  email: string;
  role: Role;
  temporaryPassword: string;
}

/** A problem with the request itself, explained in plain words (as opposed to a server fault, which must not be reported this way). */
export class OnboardingError extends Error {}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export async function createOrganization(prisma: PrismaClient, input: CreateOrgInput) {
  const need = (v: string | undefined, label: string) => {
    if (!v || !v.trim()) throw new OnboardingError(`${label} is required`);
    return v.trim();
  };
  const orgName = need(input.orgName, 'orgName');
  const adminEmail = need(input.adminEmail, 'adminEmail').toLowerCase();
  const managerEmail = input.managerEmail?.trim().toLowerCase() || undefined;
  for (const [label, e] of [['adminEmail', adminEmail], ['managerEmail', managerEmail], ['billingEmail', input.billingEmail?.trim()]] as const) {
    if (e && !EMAIL.test(e)) throw new OnboardingError(`${label} is not a valid email address`);
  }
  if (managerEmail && managerEmail === adminEmail) throw new OnboardingError('The manager and the admin must be different people');

  const market = marketFor(input.marketCode);
  if (input.marketCode && market.code !== input.marketCode.toUpperCase()) throw new OnboardingError(`Unknown market ${input.marketCode} (use NZ or GB)`);
  const slug = slugify(orgName);
  if (!slug) throw new OnboardingError('orgName must contain letters or digits');
  const branchCode = need(input.branchCode, 'branchCode').toUpperCase();

  // Fail early with readable messages instead of unique-constraint errors.
  if (await prisma.organization.findUnique({ where: { slug } })) throw new OnboardingError(`An organization named like "${orgName}" already exists`);
  if (await prisma.facilityBranch.findUnique({ where: { branchCode } })) throw new OnboardingError(`Branch code ${branchCode} is already in use`);
  for (const email of [adminEmail, managerEmail].filter(Boolean) as string[]) {
    if (await prisma.user.findUnique({ where: { email } })) throw new OnboardingError(`${email} already has an account`);
  }

  // Passwords are generated and hashed up front: hashing inside an open transaction holds it (and the event loop) for no reason.
  const people = await Promise.all(
    ([[adminEmail, Role.ORG_ADMIN], ...(managerEmail ? [[managerEmail, Role.FACILITY_MANAGER]] : [])] as [string, Role][]).map(async ([email, role]) => {
      const temporaryPassword = randomBytes(9).toString('base64url');
      return { email, role, temporaryPassword, passwordHash: await bcrypt.hash(temporaryPassword, 12) };
    }),
  );
  const created: CreatedUser[] = people.map(({ email, role, temporaryPassword }) => ({ email, role, temporaryPassword }));

  let result;
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const tdb = tx as unknown as PrismaClient;
        // Organization.code is unique: derive it from the name and add a numeric suffix on collision.
        let code = slug.replace(/-/g, '').toUpperCase().slice(0, 12) || 'ORG';
        for (let n = 2; await tdb.organization.findUnique({ where: { code } }); n++) code = `${code.slice(0, 10)}${n}`;

        const org = await tdb.organization.create({
          data: {
            name: orgName,
            slug,
            code,
            country: market.code,
            currency: market.currency,
            timezone: market.timezone,
            billingEmail: (input.billingEmail?.trim() || adminEmail).toLowerCase(),
            phone: need(input.phone, 'phone'),
          },
        });
        const users = [];
        for (const p of people) {
          users.push(await tdb.user.create({ data: { email: p.email, role: p.role, organizationId: org.id, passwordHash: p.passwordHash, mustChangePassword: true } }));
        }
        const manager = users.find((u) => u.role === Role.FACILITY_MANAGER);
        const branch = await tdb.facilityBranch.create({
          data: {
            organizationId: org.id,
            name: need(input.branchName, 'branchName'),
            branchCode,
            addressLine1: need(input.addressLine1, 'addressLine1'),
            addressLine2: input.addressLine2?.trim() || undefined,
            city: need(input.city, 'city'),
            postcode: need(input.postcode, 'postcode'),
            country: input.country?.trim() || market.code,
            phone: (input.branchPhone || input.phone).trim(),
            managerId: manager?.id,
          },
        });
        return { org, branch };
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    // Two onboardings racing for the same name, branch code or email: the loser gets a clear message, not a raw database error.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new OnboardingError('Another request just created an organization, branch code or account with the same details. Check the list and try again.');
    }
    throw e;
  }
  return { organizationId: result.org.id, organizationCode: result.org.code, branchId: result.branch.id, users: created };
}

