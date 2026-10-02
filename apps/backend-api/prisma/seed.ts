import { PrismaClient, Role, DocType, DocStatus, ShiftStatus, ShiftVisibility, StaffBankTier, TimesheetStatus, InvoiceStatus, LeaveType, LeaveStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function main() {
  console.log('Seeding FlexShift database with enterprise data...');

  const defaultPasswordHash = await bcrypt.hash('FlexShiftPass2026!', 10);

  // 1. Create Organizations
  const apexHealth = await prisma.organization.upsert({
    where: { slug: 'apex-healthcare' },
    update: {},
    create: {
      name: 'Apex Healthcare Group',
      slug: 'apex-healthcare',
      code: 'APEX-UK',
      billingEmail: 'billing@apexhealth.co.uk',
      phone: '+44 20 7946 0910',
      subscriptionTier: 'ENTERPRISE_UNLIMITED',
    },
  });

  const crestPharmacy = await prisma.organization.upsert({
    where: { slug: 'crest-pharmacy' },
    update: {},
    create: {
      name: 'Crest Pharmacy Group',
      slug: 'crest-pharmacy',
      code: 'CREST-UK',
      billingEmail: 'accounts@crestpharmacy.co.uk',
      phone: '+44 20 7946 0922',
      subscriptionTier: 'ENTERPRISE_PRO',
    },
  });

  // 2. Create Users
  const orgAdmin = await prisma.user.upsert({
    where: { email: 'admin@apexhealth.co.uk' },
    update: {},
    create: {
      email: 'admin@apexhealth.co.uk',
      passwordHash: defaultPasswordHash,
      role: Role.ORG_ADMIN,
      organizationId: apexHealth.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'super@flexshift.io' },
    update: {},
    create: { email: 'super@flexshift.io', passwordHash: defaultPasswordHash, role: Role.SUPER_ADMIN },
  });

  const managerRichmond = await prisma.user.upsert({
    where: { email: 'richmond.mgr@apexhealth.co.uk' },
    update: {},
    create: {
      email: 'richmond.mgr@apexhealth.co.uk',
      passwordHash: defaultPasswordHash,
      role: Role.FACILITY_MANAGER,
      organizationId: apexHealth.id,
    },
  });

  const managerBeckenham = await prisma.user.upsert({
    where: { email: 'beckenham.mgr@crestpharmacy.co.uk' },
    update: {},
    create: {
      email: 'beckenham.mgr@crestpharmacy.co.uk',
      passwordHash: defaultPasswordHash,
      role: Role.FACILITY_MANAGER,
      organizationId: crestPharmacy.id,
    },
  });

  // 3. Create Branches
  const richmondBranch = await prisma.facilityBranch.upsert({
    where: { branchCode: 'APEX-RCH-01' },
    update: {},
    create: {
      organizationId: apexHealth.id,
      name: 'Richmond George Street Healthcare',
      branchCode: 'APEX-RCH-01',
      addressLine1: '45 George Street',
      city: 'Richmond',
      postcode: 'TW9 1HJ',
      country: 'UK',
      phone: '+44 20 8940 1234',
      email: 'richmond@apexhealth.co.uk',
      managerId: managerRichmond.id,
    },
  });

  const beckenhamBranch = await prisma.facilityBranch.upsert({
    where: { branchCode: 'CRST-BCK-02' },
    update: {},
    create: {
      organizationId: crestPharmacy.id,
      name: 'Beckenham High Street Pharmacy',
      branchCode: 'CRST-BCK-02',
      addressLine1: '112 High Street',
      city: 'Beckenham',
      postcode: 'BR3 1EB',
      country: 'UK',
      phone: '+44 20 8650 5678',
      email: 'beckenham@crestpharmacy.co.uk',
      managerId: managerBeckenham.id,
    },
  });

  const barkingBranch = await prisma.facilityBranch.upsert({
    where: { branchCode: 'APEX-BRK-03' },
    update: {},
    create: {
      organizationId: apexHealth.id,
      name: 'Barking Health & Relief Clinic',
      branchCode: 'APEX-BRK-03',
      addressLine1: '28 Station Parade',
      city: 'Barking',
      postcode: 'IG11 8ER',
      country: 'UK',
      phone: '+44 20 8594 9012',
      email: 'barking@apexhealth.co.uk',
    },
  });

  // 4. Create Relief Healthcare Professionals
  const worker1User = await prisma.user.upsert({
    where: { email: 'sarah.y@flexrelief.co.uk' },
    update: {},
    create: {
      email: 'sarah.y@flexrelief.co.uk',
      passwordHash: defaultPasswordHash,
      role: Role.RELIEF_WORKER,
    },
  });

  const worker1Profile = await prisma.reliefProfile.upsert({
    where: { userId: worker1User.id },
    update: {},
    create: {
      userId: worker1User.id,
      firstName: 'Sarah',
      lastName: 'Yasmin',
      phone: '+44 7700 900123',
      registrationNumber: 'GPHC-2089412',
      profession: 'Pharmacist',
      hourlyRate: 32.5,
      minimumShiftRate: 28.0,
      bio: 'Experienced clinical relief pharmacist with 6 years experience in busy community and primary care dispensaries.',
      yearsCommunityExperience: 5,
      yearsHospitalExperience: 1,
      university: 'Medway School of Pharmacy',
      graduationYear: 2018,
      skilledWorkerVisa: false,
      systemTags: ['ProScript', 'Columbus', 'Nexphase'],
      accreditations: ['CPCS', 'Flu Vaccination', 'Safeguarding Level 3', 'NMS'],
      isVerified: true,
    },
  });

  const worker2User = await prisma.user.upsert({
    where: { email: 'david.i@flexrelief.co.uk' },
    update: {},
    create: {
      email: 'david.i@flexrelief.co.uk',
      passwordHash: defaultPasswordHash,
      role: Role.RELIEF_WORKER,
    },
  });

  const worker2Profile = await prisma.reliefProfile.upsert({
    where: { userId: worker2User.id },
    update: {},
    create: {
      userId: worker2User.id,
      firstName: 'David',
      lastName: 'Ibrahim',
      phone: '+44 7700 900456',
      registrationNumber: 'GPHC-2074319',
      profession: 'Pharmacist',
      hourlyRate: 35.0,
      minimumShiftRate: 30.0,
      bio: 'Independent Prescriber and relief pharmacist specializing in travel clinic and urgent consultations.',
      yearsCommunityExperience: 7,
      yearsHospitalExperience: 2,
      university: 'University of Nottingham',
      graduationYear: 2016,
      skilledWorkerVisa: false,
      systemTags: ['ProScript', 'Columbus'],
      accreditations: ['CPCS', 'Independent Prescriber', 'Flu Vaccination', 'Safeguarding Level 3'],
      isVerified: true,
    },
  });

  // 5. Compliance Documents (reset so reseeding keeps expiry dates fresh)
  await prisma.complianceDocument.deleteMany({
    where: { reliefWorkerId: { in: [worker1Profile.id, worker2Profile.id] } },
  });
  await prisma.complianceDocument.createMany({
    data: [
      {
        reliefWorkerId: worker1Profile.id,
        type: DocType.IDENTITY,
        documentReference: 'UK-PASSPORT-549102',
        fileUrl: 'https://docs.flexshift.internal/sarah-id.pdf',
        issueDate: new Date('2022-01-10'),
        expiresAt: inDays(2000),
        status: DocStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedById: orgAdmin.id,
      },
      {
        reliefWorkerId: worker1Profile.id,
        type: DocType.RIGHT_TO_WORK,
        documentReference: 'RTW-SHARE-782190',
        fileUrl: 'https://docs.flexshift.internal/sarah-rtw.pdf',
        issueDate: new Date('2023-01-01'),
        expiresAt: inDays(800),
        status: DocStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedById: orgAdmin.id,
      },
      {
        reliefWorkerId: worker1Profile.id,
        type: DocType.DBS_POLICE_CHECK,
        documentReference: 'DBS-ENH-00192847',
        fileUrl: 'https://docs.flexshift.internal/sarah-dbs.pdf',
        issueDate: inDays(-300),
        expiresAt: inDays(365),
        status: DocStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedById: orgAdmin.id,
      },
      {
        reliefWorkerId: worker1Profile.id,
        type: DocType.INDEMNITY_INSURANCE,
        documentReference: 'PDA-INDEMNITY-2024',
        fileUrl: 'https://docs.flexshift.internal/sarah-indemnity.pdf',
        issueDate: new Date('2024-01-01'),
        expiresAt: inDays(400),
        status: DocStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedById: orgAdmin.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.complianceDocument.createMany({
    data: [DocType.IDENTITY, DocType.RIGHT_TO_WORK, DocType.DBS_POLICE_CHECK, DocType.INDEMNITY_INSURANCE].map((type) => ({
      reliefWorkerId: worker2Profile.id,
      type,
      documentReference: `DAVID-${type}`,
      fileUrl: `seed/david-${type.toLowerCase()}.pdf`,
      issueDate: inDays(-200),
      expiresAt: inDays(500),
      status: DocStatus.VERIFIED,
      verifiedAt: new Date(),
      verifiedById: orgAdmin.id,
    })),
  });

  // A pending document so the compliance desk has something to review
  await prisma.complianceDocument.create({
    data: {
      reliefWorkerId: worker2Profile.id,
      type: DocType.SAFEGUARDING_L3,
      documentReference: 'SG3-2026-11',
      fileUrl: 'seed/david-safeguarding.pdf',
      issueDate: inDays(-10),
      expiresAt: inDays(1000),
      status: DocStatus.PENDING,
    },
  });

  // 6. Staff Bank Membership
  await prisma.staffBankMember.upsert({
    where: {
      organizationId_reliefWorkerId: {
        organizationId: apexHealth.id,
        reliefWorkerId: worker1Profile.id,
      },
    },
    update: {},
    create: {
      organizationId: apexHealth.id,
      reliefWorkerId: worker1Profile.id,
      branchId: richmondBranch.id,
      tier: StaffBankTier.TIER_1_PREFERRED,
      customHourlyRate: 33.0,
      notes: 'Preferred regular relief pharmacist for Richmond branch',
    },
  });

  // 7. Shifts (reset so reseeding does not duplicate rota data)
  await prisma.shift.deleteMany({});
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(17, 30, 0, 0);

  const shift1 = await prisma.shift.create({
    data: {
      branchId: richmondBranch.id,
      title: 'Sole Charge Clinical Relief Pharmacist',
      roleRequired: 'Pharmacist',
      startTime: tomorrow,
      endTime: tomorrowEnd,
      hourlyRate: 32.0,
      totalEstimatedPay: 272.0,
      requiredSystems: ['ProScript'],
      requiredAccreditations: ['CPCS', 'Flu Vaccination'],
      visibility: ShiftVisibility.STAFF_BANK_ONLY,
      status: ShiftStatus.BOOKED,
      instantBookEnabled: true,
      assignedWorkerId: worker1Profile.id,
    },
  });

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 4);
  nextWeek.setHours(20, 0, 0, 0);

  const nextWeekEnd = new Date(nextWeek);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 1);
  nextWeekEnd.setHours(4, 30, 0, 0);

  const shiftEmergency = await prisma.shift.create({
    data: {
      branchId: beckenhamBranch.id,
      title: 'Emergency Overnight Relief Cover',
      roleRequired: 'Pharmacist',
      startTime: nextWeek,
      endTime: nextWeekEnd,
      hourlyRate: 35.0,
      totalEstimatedPay: 297.5,
      requiredSystems: ['Nexphase'],
      requiredAccreditations: ['CPCS'],
      visibility: ShiftVisibility.EMERGENCY_BROADCAST,
      status: ShiftStatus.OPEN,
      instantBookEnabled: true,
      isEmergency: true,
      isOvernight: true,
      notes: 'Urgent weekend emergency cover - free parking on site.',
    },
  });

  const atTime = (days: number, h: number, m = 0) => {
    const d = inDays(days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const extraShifts = [
    { branchId: richmondBranch.id, title: 'Staff Bank Pharmacist (Weekday)', start: atTime(2, 9), end: atTime(2, 17), rate: 31, visibility: ShiftVisibility.STAFF_BANK_ONLY, systems: ['ProScript'], accr: ['CPCS'] },
    { branchId: barkingBranch.id, title: 'Open Marketplace Relief Pharmacist', start: atTime(6, 9), end: atTime(6, 18), rate: 34, visibility: ShiftVisibility.PUBLIC_MARKETPLACE, systems: ['ProScript'], accr: ['CPCS'] },
    { branchId: beckenhamBranch.id, title: 'Saturday Dispensary Cover', start: atTime(8, 9), end: atTime(8, 13), rate: 30, visibility: ShiftVisibility.PUBLIC_MARKETPLACE, systems: [], accr: [] },
  ];
  for (const e of extraShifts) {
    const hours = (e.end.getTime() - e.start.getTime()) / 3_600_000;
    await prisma.shift.create({
      data: {
        branchId: e.branchId,
        title: e.title,
        roleRequired: 'Pharmacist',
        startTime: e.start,
        endTime: e.end,
        hourlyRate: e.rate,
        totalEstimatedPay: Number((hours * e.rate).toFixed(2)),
        requiredSystems: e.systems,
        requiredAccreditations: e.accr,
        visibility: e.visibility,
        status: ShiftStatus.OPEN,
      },
    });
  }

  console.log('FlexShift database seeded successfully!');
  console.log('Demo Credentials:');
  console.log('- Super Admin: super@flexshift.io / FlexShiftPass2026!');
  console.log('- Super / Org Admin: admin@apexhealth.co.uk / FlexShiftPass2026!');
  console.log('- Facility Manager: richmond.mgr@apexhealth.co.uk / FlexShiftPass2026!');
  console.log('- Relief Worker: sarah.y@flexrelief.co.uk / FlexShiftPass2026!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
