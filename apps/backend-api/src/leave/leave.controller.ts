import { Controller, Get, Post, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, LeaveStatus } from '@prisma/client';
import { ReviewLeaveDto, SubmitLeaveDto } from './dto/leave.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private leaveService: LeaveService) {}

  @Get('branch/:branchId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  findByBranch(@CurrentUser() user: any, @Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.leaveService.findByBranch(user, branchId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  submitLeave(@CurrentUser() user: any, @Body() body: SubmitLeaveDto) {
    return this.leaveService.submitLeave(user, body);
  }

  @Patch(':id/review')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  reviewLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewLeaveDto,
    @CurrentUser() user: any,
  ) {
    return this.leaveService.reviewLeave(user, id, body.status as LeaveStatus, body.autoCreateShiftVacancy, body.backfillHourlyRate);
  }
}
