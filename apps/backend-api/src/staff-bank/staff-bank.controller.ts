import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { StaffBankService } from './staff-bank.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff-bank')
export class StaffBankController {
  constructor(private staffBankService: StaffBankService) {}

  @Get('organization/:orgId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  findMembers(
    @Param('orgId') orgId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.staffBankService.findBankMembers(orgId, branchId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  addMember(@Body() body: any) {
    return this.staffBankService.addMember(body);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  updateMember(@Param('id') id: string, @Body() body: any) {
    return this.staffBankService.updateMember(id, body);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  removeMember(@Param('id') id: string) {
    return this.staffBankService.removeMember(id);
  }
}
