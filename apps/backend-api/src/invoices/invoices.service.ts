import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';
import { AccessService, AuthUser } from '../common/access.service';
import { NotificationsService } from '../notifications/notifications.service';

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  // Neutralise spreadsheet formula injection, then quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
  ) {}

  async findByOrganization(user: AuthUser, organizationId: string, status?: InvoiceStatus) {
    this.access.assertOrg(user, organizationId);
    return this.prisma.invoice.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: {
        reliefWorker: { select: { id: true, firstName: true, lastName: true, registrationNumber: true } },
        timesheet: { include: { branch: { select: { name: true, branchCode: true } } } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });
  }

  async findByWorker(reliefWorkerId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { reliefWorkerId },
      include: {
        organization: { select: { id: true, name: true, logoUrl: true } },
        timesheet: { include: { branch: { select: { name: true, branchCode: true } }, shift: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    const sum = (status: InvoiceStatus) =>
      invoices.filter((i) => i.status === status).reduce((acc, i) => acc + Number(i.totalAmount), 0);

    return { totalEarned: sum(InvoiceStatus.PAID), pendingPayout: sum(InvoiceStatus.ISSUED), invoices };
  }

  async markPaid(user: AuthUser, id: string, paymentReference: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    this.access.assertOrg(user, invoice.organizationId);
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException(`Only issued invoices can be marked as paid (current: ${invoice.status})`);
    }

    const res = await this.prisma.invoice.updateMany({
      where: { id, status: InvoiceStatus.ISSUED },
      data: { status: InvoiceStatus.PAID, paidAt: new Date(), paymentReference },
    });
    if (res.count === 0) throw new BadRequestException('Invoice was already processed');
    await this.prisma.timesheet.updateMany({
      where: { id: invoice.timesheetId ?? '', status: 'APPROVED' },
      data: { status: 'SETTLED' },
    });
    await this.notifications.notifyWorker(invoice.reliefWorkerId, {
      type: 'INVOICE_PAID', title: 'Invoice paid', body: `${invoice.invoiceNumber} · ref ${paymentReference}`, link: '/finance',
    });
    return this.prisma.invoice.findUnique({ where: { id } });
  }

  /** Payment batch for a finance team / BACS bulk upload (bank details are collected outside the platform). */
  async exportPaymentBatch(user: AuthUser, organizationId: string, status: InvoiceStatus = InvoiceStatus.ISSUED) {
    const invoices = await this.findByOrganization(user, organizationId, status);
    const header = ['Invoice', 'Payee', 'Registration', 'Branch', 'Amount', 'Currency', 'Issued', 'Due'];
    const rows = invoices.map((i) => [
      i.invoiceNumber,
      `${i.reliefWorker.firstName} ${i.reliefWorker.lastName}`,
      i.reliefWorker.registrationNumber,
      i.timesheet?.branch?.name ?? '',
      Number(i.totalAmount).toFixed(2),
      i.currency,
      i.issuedAt.toISOString().slice(0, 10),
      i.dueAt ? i.dueAt.toISOString().slice(0, 10) : '',
    ]);
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  /**
   * Purchase-invoice import file for accounting software (column names follow the common
   * "bills" import layout used by Xero-style tools). One line per invoice: hours x agreed rate.
   */
  async exportAccounting(
    user: AuthUser,
    organizationId: string,
    opts: { status?: InvoiceStatus; from?: string; to?: string; accountCode?: string; taxType?: string },
  ) {
    const invoices = (await this.findByOrganization(user, organizationId, opts.status)).filter((i) => {
      const t = i.issuedAt.getTime();
      return (!opts.from || t >= new Date(opts.from).getTime()) && (!opts.to || t <= new Date(opts.to).getTime() + 86_399_999);
    });
    const header = ['*ContactName', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'Currency'];
    const rows = invoices.map((i) => {
      const ts = i.timesheet;
      const hours = ts ? Number(ts.billableHours) : 1;
      const rate = ts ? Number(ts.hourlyRateApplied) : Number(i.totalAmount);
      const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
      return [
        `${i.reliefWorker.firstName} ${i.reliefWorker.lastName}`,
        i.invoiceNumber,
        i.paymentReference ?? '',
        day(i.issuedAt),
        day(i.dueAt),
        `Relief cover${ts?.branch?.name ? ` at ${ts.branch.name}` : ''}`,
        hours.toFixed(2),
        rate.toFixed(2),
        opts.accountCode ?? '310',
        opts.taxType ?? 'No VAT',
        i.currency,
      ];
    });
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
}
