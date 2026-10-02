import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { BranchListQueryDto, CreateBranchDto, RotaQueryDto, UpdateBranchDto } from './dto/branch.dto';

const STAFF = [Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF)
@Controller('branches')
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query() q: BranchListQueryDto) {
    return this.branchesService.findAll(user, q.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.findOne(user, id);
  }

  @Get(':id/rota')
  getRota(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Query() q: RotaQueryDto) {
    return this.branchesService.getRota(user, id, q.startDate, q.endDate);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  create(@CurrentUser() user: any, @Body() body: CreateBranchDto) {
    return this.branchesService.create(user, body);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  update(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateBranchDto) {
    return this.branchesService.update(user, id, body);
  }
}
