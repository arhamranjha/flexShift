import { Controller, Get, Patch, Param, Body, Query, Res, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AccountingQueryDto, InvoiceQueryDto, MarkPaidDto } from './dto/invoice.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Get('organization/:orgId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  findByOrganization(@CurrentUser() user: any, @Param('orgId', ParseUUIDPipe) orgId: string, @Query() q: InvoiceQueryDto) {
    return this.invoicesService.findByOrganization(user, orgId, q.status);
  }

  @Get('organization/:orgId/export.csv')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  async exportCsv(
    @CurrentUser() user: any,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() q: InvoiceQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.invoicesService.exportPaymentBatch(user, orgId, q.status);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payment-batch.csv"');
    res.send(csv);
  }

  @Get('organization/:orgId/accounting.csv')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  async accountingCsv(
    @CurrentUser() user: any,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() q: AccountingQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.invoicesService.exportAccounting(user, orgId, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="accounting-export.csv"');
    res.send(csv);
  }

  @Get('my-finance')
  @Roles(Role.RELIEF_WORKER)
  getMyFinance(@CurrentUser() user: any) {
    return this.invoicesService.findByWorker(user.reliefProfile.id);
  }

  @Patch(':id/pay')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  markPaid(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: MarkPaidDto) {
    return this.invoicesService.markPaid(user, id, body.paymentReference);
  }
}
