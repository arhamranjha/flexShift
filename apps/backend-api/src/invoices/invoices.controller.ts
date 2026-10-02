import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Get('organization/:orgId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  findByOrganization(@Param('orgId') orgId: string) {
    return this.invoicesService.findByOrganization(orgId);
  }

  @Get('my-finance')
  @Roles(Role.RELIEF_WORKER)
  getMyFinance(@CurrentUser() user: any) {
    return this.invoicesService.findByWorker(user.reliefProfile.id);
  }

  @Patch(':id/pay')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  markPaid(@Param('id') id: string, @Body('paymentReference') ref: string) {
    return this.invoicesService.markPaid(id, ref);
  }
}
