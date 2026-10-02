import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, TimesheetStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timesheets')
export class TimesheetsController {
  constructor(private timesheetsService: TimesheetsService) {}

  @Post('submit')
  @Roles(Role.RELIEF_WORKER)
  submit(@CurrentUser() user: any, @Body() body: any) {
    return this.timesheetsService.submitTimesheet({
      ...body,
      reliefWorkerId: user.reliefProfile.id,
    });
  }

  @Patch(':id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.timesheetsService.approveTimesheet(id, user.id);
  }

  @Get('branch/:branchId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  findByBranch(
    @Param('branchId') branchId: string,
    @Query('status') status?: TimesheetStatus,
  ) {
    return this.timesheetsService.findByBranch(branchId, status);
  }

  @Get('my-timesheets')
  @Roles(Role.RELIEF_WORKER)
  getMyTimesheets(@CurrentUser() user: any) {
    return this.timesheetsService.findByWorker(user.reliefProfile.id);
  }
}
