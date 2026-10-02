import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { ApplyDto, AssignWorkerDto, CreateShiftDto, FeedQueryDto, ShiftListQueryDto, UpdateShiftDto, UpdateShiftStatusDto } from './dto/shift.dto';

const STAFF = [Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  @Post()
  @Roles(...STAFF)
  create(@CurrentUser() user: any, @Body() body: CreateShiftDto) {
    return this.shiftsService.create(user, body);
  }

  @Get()
  @Roles(...STAFF)
  list(@CurrentUser() user: any, @Query() query: ShiftListQueryDto) {
    return this.shiftsService.list(user, query);
  }

  @Get('feed')
  @Roles(Role.RELIEF_WORKER)
  getWorkerFeed(@CurrentUser() user: any, @Query() query: FeedQueryDto) {
    return this.shiftsService.getWorkerFeed(user.reliefProfile.id, query);
  }

  @Get('mine')
  @Roles(Role.RELIEF_WORKER)
  getDiary(@CurrentUser() user: any) {
    return this.shiftsService.getWorkerDiary(user.reliefProfile.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shiftsService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(...STAFF)
  update(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateShiftDto) {
    return this.shiftsService.update(user, id, body);
  }

  @Patch(':id/status')
  @Roles(...STAFF)
  updateStatus(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateShiftStatusDto) {
    return this.shiftsService.updateStatus(user, id, body);
  }

  @Patch(':id/assign')
  @Roles(...STAFF)
  assignWorker(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: AssignWorkerDto) {
    return this.shiftsService.assignWorker(user, id, body);
  }

  @Post(':id/instant-book')
  @Roles(Role.RELIEF_WORKER)
  instantBook(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.shiftsService.instantBook(id, user.reliefProfile.id);
  }

  @Post(':id/apply')
  @Roles(Role.RELIEF_WORKER)
  applyForShift(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Body() body: ApplyDto) {
    return this.shiftsService.applyForShift(id, user.reliefProfile.id, body);
  }
}
