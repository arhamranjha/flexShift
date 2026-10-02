import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BranchesModule } from './branches/branches.module';
import { ReliefWorkersModule } from './relief-workers/relief-workers.module';
import { StaffBankModule } from './staff-bank/staff-bank.module';
import { ShiftsModule } from './shifts/shifts.module';
import { NegotiationsModule } from './negotiations/negotiations.module';
import { TimesheetsModule } from './timesheets/timesheets.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LeaveModule } from './leave/leave.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    BranchesModule,
    ReliefWorkersModule,
    StaffBankModule,
    ShiftsModule,
    NegotiationsModule,
    TimesheetsModule,
    InvoicesModule,
    LeaveModule,
  ],
})
export class AppModule {}
