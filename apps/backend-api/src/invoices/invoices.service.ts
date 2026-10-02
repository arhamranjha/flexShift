import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async findByOrganization(organizationId: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId },
      include: {
        reliefWorker: { select: { id: true, firstName: true, lastName: true, registrationNumber: true } },
        timesheet: { include: { branch: { select: { name: true, branchCode: true } } } },
      },
      orderBy: { issuedAt: 'desc' },
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

    const totalEarned = invoices
      .filter((i) => i.status === InvoiceStatus.PAID)
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);

    const pendingPayout = invoices
      .filter((i) => i.status === InvoiceStatus.ISSUED)
      .reduce((sum, i) => sum + Number(i.totalAmount), 0);

    return {
      totalEarned,
      pendingPayout,
      invoices,
    };
  }

  async markPaid(id: string, paymentReference: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        paymentReference,
      },
    });
  }
}
