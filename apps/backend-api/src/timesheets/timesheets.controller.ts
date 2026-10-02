import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { SubmitTimesheetDto, TimesheetQueryDto } from './dto/timesheet.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timesheets')
export class TimesheetsController {
  constructor(private timesheetsService: TimesheetsService) {}

  @Post('submit')
  @Roles(Role.RELIEF_WORKER)
  submit(@CurrentUser() user: any, @Body() body: SubmitTimesheetDto) {
    return this.timesheetsService.submitTimesheet(user.reliefProfile.id, body);
  }

  @Patch(':id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.timesheetsService.approveTimesheet(id, user);
  }

  @Get('branch/:branchId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  findByBranch(
    @CurrentUser() user: any,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.findByBranch(user, branchId, query.status);
  }

  @Get('my-timesheets')
  @Roles(Role.RELIEF_WORKER)
  getMyTimesheets(@CurrentUser() user: any) {
    return this.timesheetsService.findByWorker(user.reliefProfile.id);
  }
}
