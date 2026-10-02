import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { StaffBankService } from './staff-bank.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AddStaffBankMemberDto, StaffBankQueryDto, UpdateStaffBankMemberDto } from './dto/staff-bank.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff-bank')
export class StaffBankController {
  constructor(private staffBankService: StaffBankService) {}

  @Get('organization/:orgId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  findMembers(@CurrentUser() user: any, @Param('orgId', ParseUUIDPipe) orgId: string, @Query() q: StaffBankQueryDto) {
    return this.staffBankService.findBankMembers(user, orgId, q.branchId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  addMember(@CurrentUser() user: any, @Body() body: AddStaffBankMemberDto) {
    return this.staffBankService.addMember(user, body);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  updateMember(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateStaffBankMemberDto) {
    return this.staffBankService.updateMember(user, id, body);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  removeMember(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.staffBankService.removeMember(user, id);
  }
}
