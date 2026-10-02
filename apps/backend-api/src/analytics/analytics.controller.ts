import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';

class OverviewQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
}

class MarketRatesQueryDto {
  @IsOptional() @IsString() @MaxLength(60) profession?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('market-rates')
  marketRates(@Query() q: MarketRatesQueryDto) {
    return this.analytics.marketRates(q.profession);
  }

  @Get('overview')
  overview(@CurrentUser() user: any, @Query() q: OverviewQueryDto) {
    return this.analytics.overview(user, q.branchId);
  }
}
