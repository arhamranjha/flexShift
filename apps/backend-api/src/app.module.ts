import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { StorageModule } from './storage/storage.module';
import { validateEnv } from './common/env';
import { PrismaExceptionFilter, PrismaValidationFilter } from './common/prisma-exception.filter';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BranchesModule } from './branches/branches.module';
import { ReliefWorkersModule } from './relief-workers/relief-workers.module';
import { StaffBankModule } from './staff-bank/staff-bank.module';
import { DocumentSharesModule } from './document-shares/document-shares.module';
import { ShiftsModule } from './shifts/shifts.module';
import { NegotiationsModule } from './negotiations/negotiations.module';
import { TimesheetsModule } from './timesheets/timesheets.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LeaveModule } from './leave/leave.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { MarketsModule } from './markets/markets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT) || 300 }]),
    PrismaModule,
    CommonModule,
    StorageModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    JobsModule,
    HealthModule,
    MarketsModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    BranchesModule,
    ReliefWorkersModule,
    StaffBankModule,
    DocumentSharesModule,
    ShiftsModule,
    NegotiationsModule,
    TimesheetsModule,
    InvoicesModule,
    LeaveModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_FILTER, useClass: PrismaValidationFilter },
  ],
})
export class AppModule {}
