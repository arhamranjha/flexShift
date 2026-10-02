import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { NegotiationsService } from './negotiations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { CounterOfferDto, CreateNegotiationDto, NegotiationQueryDto } from './dto/negotiation.dto';

const STAFF = [Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('negotiations')
export class NegotiationsController {
  constructor(private negotiationsService: NegotiationsService) {}

  @Post()
  @Roles(Role.RELIEF_WORKER)
  create(@CurrentUser() user: any, @Body() body: CreateNegotiationDto) {
    return this.negotiationsService.createNegotiation(user.reliefProfile.id, body);
  }

  @Get()
  @Roles(...STAFF)
  list(@CurrentUser() user: any, @Query() query: NegotiationQueryDto) {
    return this.negotiationsService.listForStaff(user, query);
  }

  @Get('mine')
  @Roles(Role.RELIEF_WORKER)
  mine(@CurrentUser() user: any) {
    return this.negotiationsService.listMine(user.reliefProfile.id);
  }

  @Patch(':id/accept')
  @Roles(...STAFF, Role.RELIEF_WORKER)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.negotiationsService.acceptNegotiation(id, user);
  }

  @Patch(':id/counter')
  @Roles(...STAFF)
  counter(@Param('id', ParseUUIDPipe) id: string, @Body() body: CounterOfferDto, @CurrentUser() user: any) {
    return this.negotiationsService.counterOffer(id, body.counterOfferRate, user);
  }

  @Patch(':id/reject')
  @Roles(...STAFF, Role.RELIEF_WORKER)
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.negotiationsService.rejectNegotiation(id, user);
  }
}
