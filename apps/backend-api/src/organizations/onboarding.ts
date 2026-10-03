/**
 * Onboarding a customer: an organization with its first branch, an organization admin and an optional branch manager.
 * Shared by the `create-org` command and the super-admin API; one-time temporary passwords are returned to the caller.
 */
import { PrismaClient, Role } from '@prisma/client';
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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export async function createOrganization(prisma: PrismaClient, input: CreateOrgInput) {
  const need = (v: string | undefined, label: string) => {
    if (!v || !v.trim()) throw new Error(`${label} is required`);
    return v.trim();
  };
  const orgName = need(input.orgName, 'orgName');
  const adminEmail = need(input.adminEmail, 'adminEmail').toLowerCase();
  const managerEmail = input.managerEmail?.trim().toLowerCase() || undefined;
  for (const [label, e] of [['adminEmail', adminEmail], ['managerEmail', managerEmail], ['billingEmail', input.billingEmail?.trim()]] as const) {
    if (e && !EMAIL.test(e)) throw new Error(`${label} is not a valid email address`);
  }
  if (managerEmail && managerEmail === adminEmail) throw new Error('The manager and the admin must be different people');

  const market = marketFor(input.marketCode);
  if (input.marketCode && market.code !== input.marketCode.toUpperCase()) throw new Error(`Unknown market ${input.marketCode} (use NZ or GB)`);
  const slug = slugify(orgName);
  if (!slug) throw new Error('orgName must contain letters or digits');
  const branchCode = need(input.branchCode, 'branchCode').toUpperCase();

  // Fail early with readable messages instead of unique-constraint errors.
  if (await prisma.organization.findUnique({ where: { slug } })) throw new Error(`An organization named like "${orgName}" already exists`);
  if (await prisma.facilityBranch.findUnique({ where: { branchCode } })) throw new Error(`Branch code ${branchCode} is already in use`);
  for (const email of [adminEmail, managerEmail].filter(Boolean) as string[]) {
    if (await prisma.user.findUnique({ where: { email } })) throw new Error(`${email} already has an account`);
  }

  const created: CreatedUser[] = [];

  const result = await prisma.$transaction(async (tx) => {
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
    const admin = await makeUser(tdb, adminEmail, Role.ORG_ADMIN, org.id);
    const manager = managerEmail ? await makeUser(tdb, managerEmail, Role.FACILITY_MANAGER, org.id) : null;
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
    return { org, branch, admin, manager };
  });

  async function makeUser(client: PrismaClient, email: string, role: Role, organizationId: string) {
    const temporaryPassword = randomBytes(9).toString('base64url');
    const user = await client.user.create({
      data: { email, role, organizationId, passwordHash: await bcrypt.hash(temporaryPassword, 12), mustChangePassword: true },
    });
    created.push({ email, role, temporaryPassword });
    return user;
  }
  return { organizationId: result.org.id, organizationCode: result.org.code, branchId: result.branch.id, users: created };
}

