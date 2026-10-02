import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReliefWorkersService } from './relief-workers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, DocStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('relief-workers')
export class ReliefWorkersController {
  constructor(private workersService: ReliefWorkersService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  findAll(@Query() query: any) {
    return this.workersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workersService.findOne(id);
  }

  @Post('concierge')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  createConcierge(@Body() body: any) {
    return this.workersService.createConciergeWorker(body);
  }

  @Post(':id/documents')
  uploadDocument(@Param('id') id: string, @Body() body: any) {
    return this.workersService.uploadDocument(id, body);
  }

  @Patch('documents/:docId/verify')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  verifyDocument(
    @Param('docId') docId: string,
    @Body('status') status: DocStatus,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    return this.workersService.verifyDocument(docId, status, user.id, notes);
  }

  @Patch(':id/preferences')
  updatePreferences(@Param('id') id: string, @Body() body: any) {
    return this.workersService.updatePreferences(id, body);
  }

  @Post(':id/watch-shift/:shiftId')
  toggleWatchShift(@Param('id') id: string, @Param('shiftId') shiftId: string) {
    return this.workersService.toggleWatchShift(id, shiftId);
  }

  @Post(':id/favourite-branch/:branchId')
  toggleFavouriteBranch(@Param('id') id: string, @Param('branchId') branchId: string) {
    return this.workersService.toggleFavouriteBranch(id, branchId);
  }
}
