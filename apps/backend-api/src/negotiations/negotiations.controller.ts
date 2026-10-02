import { Controller, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { NegotiationsService } from './negotiations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('negotiations')
export class NegotiationsController {
  constructor(private negotiationsService: NegotiationsService) {}

  @Post()
  @Roles(Role.RELIEF_WORKER)
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.negotiationsService.createNegotiation({
      ...body,
      reliefWorkerId: user.reliefProfile.id,
    });
  }

  @Patch(':id/accept')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER, Role.RELIEF_WORKER)
  accept(@Param('id') id: string, @CurrentUser() user: any) {
    return this.negotiationsService.acceptNegotiation(id, user);
  }

  @Patch(':id/counter')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
  counter(@Param('id') id: string, @Body('counterOfferRate') rate: number) {
    return this.negotiationsService.counterOffer(id, rate);
  }

  @Patch(':id/reject')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER, Role.RELIEF_WORKER)
  reject(@Param('id') id: string) {
    return this.negotiationsService.rejectNegotiation(id);
  }
}
