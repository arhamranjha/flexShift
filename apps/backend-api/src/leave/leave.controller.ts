import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, LeaveStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private leaveService: LeaveService) {}

  @Get('branch/:branchId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  findByBranch(@Param('branchId') branchId: string) {
    return this.leaveService.findByBranch(branchId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  submitLeave(@Body() body: any) {
    return this.leaveService.submitLeave(body);
  }

  @Patch(':id/review')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  reviewLeave(
    @Param('id') id: string,
    @Body('status') status: LeaveStatus,
    @Body('autoCreateShiftVacancy') autoCreateShiftVacancy: boolean,
    @CurrentUser() user: any,
  ) {
    return this.leaveService.reviewLeave(id, status, user.id, autoCreateShiftVacancy);
  }
}
