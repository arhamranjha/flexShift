import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  create(@Body() body: any) {
    return this.shiftsService.create(body);
  }

  @Get('feed')
  @Roles(Role.RELIEF_WORKER)
  getWorkerFeed(@CurrentUser() user: any, @Query() query: any) {
    return this.shiftsService.getWorkerFeed(user.reliefProfile.id, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }

  @Patch(':id/assign')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  assignWorker(
    @Param('id') id: string,
    @Body('reliefWorkerId') reliefWorkerId: string,
  ) {
    return this.shiftsService.assignWorker(id, reliefWorkerId);
  }

  @Post(':id/instant-book')
  @Roles(Role.RELIEF_WORKER)
  instantBook(@Param('id') id: string, @CurrentUser() user: any) {
    return this.shiftsService.instantBook(id, user.reliefProfile.id);
  }

  @Post(':id/apply')
  @Roles(Role.RELIEF_WORKER)
  applyForShift(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('notes') notes: string,
  ) {
    return this.shiftsService.applyForShift(id, user.reliefProfile.id, notes);
  }
}
