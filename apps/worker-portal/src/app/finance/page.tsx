'use client';

import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, Modal, StatusBadge, useAsync } from '@flexshift/ui';
import { fmtDate, fmtRange, money, moneyTotals, toNumber, type Invoice } from '@flexshift/api-client';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { PageTitle } from '@/components/common';
import { api } from '@/lib/auth';
import { useMarket } from '@/lib/market';

const fmtLong = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-');

export default function FinancePage() {
  const { currency } = useMarket();
  const fin = useAsync(() => api.invoices.mine(), []);
  const ts = useAsync(() => api.timesheets.mine(), []);
  const [open, setOpen] = useState<Invoice | null>(null);

  const reload = () => { fin.reload(); ts.reload(); };

  return (
    <>
      <PageTitle>Finance</PageTitle>
      {fin.loading && !fin.data ? <LoadingBlock /> : fin.error ? <ErrorBlock error={fin.error} retry={reload} /> : fin.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4"><p className="text-xs font-semibold text-slate-500">Pending payout</p><p className="text-2xl font-extrabold text-amber-600 mt-1">{fin.data.byCurrency?.length ? moneyTotals(fin.data.byCurrency.map((c) => ({ amount: c.pendingPayout, currency: c.currency })), currency) : money(fin.data.pendingPayout ?? 0, currency)}</p><p className="text-[11px] text-slate-500">Awaiting payment</p></Card>
            <Card className="p-4"><p className="text-xs font-semibold text-slate-500">Total earned</p><p className="text-2xl font-extrabold text-emerald-700 mt-1">{fin.data.byCurrency?.length ? moneyTotals(fin.data.byCurrency.map((c) => ({ amount: c.totalEarned, currency: c.currency })), currency) : money(fin.data.totalEarned ?? 0, currency)}</p><p className="text-[11px] text-slate-500">Paid invoices</p></Card>
          </div>

          <section>
            <h2 className="font-bold mb-2">Invoices</h2>
            {fin.data.invoices.length === 0 ? <EmptyState title="No invoices yet" hint="An invoice is issued once a manager approves your timesheet." /> : (
              <div className="space-y-2">
                {fin.data.invoices.map((i) => (
                  <button key={i.id} onClick={() => setOpen(i)} className="w-full min-h-[44px] text-left bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{i.invoiceNumber}</p>
                      <p className="text-xs text-slate-500 truncate">{i.organization?.name} · {fmtLong(i.issuedAt)}</p>
                    </div>
                    <div className="text-right shrink-0"><p className="font-extrabold">{money(i.totalAmount, i.currency ?? currency)}</p>{i.status === 'ISSUED' ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Awaiting payment</span> : <StatusBadge status={i.status} />}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <section className="mt-6">
        <h2 className="font-bold mb-2">Timesheets</h2>
        {ts.loading && !ts.data ? <LoadingBlock /> : ts.error ? <ErrorBlock error={ts.error} retry={ts.reload} /> : ts.data?.length ? (
          <div className="space-y-2">
            {ts.data.map((t) => (
              <Card key={t.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{t.branch?.name ?? t.shift?.title}</p>
                  <p className="text-xs text-slate-500">{fmtDate(t.clockInTime)} · {toNumber(t.billableHours).toFixed(2)}h at {money(t.hourlyRateApplied, t.shift?.currency ?? currency)}</p>
                </div>
                <div className="text-right shrink-0"><p className="font-bold">{money(t.totalPayout, t.shift?.currency ?? currency)}</p><StatusBadge status={t.status} /></div>
              </Card>
            ))}
          </div>
        ) : <EmptyState title="No timesheets yet" hint="Submit one from My Shifts after a shift ends." />}
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title="Invoice" wide
        footer={<><Button variant="secondary" className="min-h-[44px] print:hidden" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button><Button className="min-h-[44px] print:hidden" onClick={() => setOpen(null)}>Close</Button></>}>
        {open && <InvoiceView inv={open} />}
      </Modal>
    </>
  );
}

function InvoiceView({ inv }: { inv: Invoice }) {
  const { currency: mine } = useMarket();
  const currency = inv.currency ?? mine;
  const t = inv.timesheet;
  const rows: [string, string][] = [
    ['Organization', inv.organization?.name ?? '-'],
    ['Branch', t?.branch?.name ?? '-'],
    ['Shift', t?.shift ? fmtRange(t.shift.startTime, t.shift.endTime) : '-'],
    ['Hours', t ? `${toNumber(t.billableHours).toFixed(2)} h` : '-'],
    ['Rate', t ? `${money(t.hourlyRateApplied, t.shift?.currency ?? currency)}/hr` : '-'],
    ['Issued', fmtLong(inv.issuedAt)],
    ['Due date', fmtLong(inv.dueAt)],
    ...(inv.paidAt ? [['Paid on', fmtLong(inv.paidAt)] as [string, string]] : []),
    ['Payment reference', inv.paymentReference ?? '-'],
  ];
  return (
    <div className="text-sm">
      <div className="flex justify-between items-start mb-4">
        <div><p className="text-xs text-slate-500">Invoice</p><p className="text-lg font-extrabold">{inv.invoiceNumber}</p></div>
        {inv.status === 'ISSUED' ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Awaiting payment</span> : <StatusBadge status={inv.status} />}
      </div>
      <dl className="divide-y divide-slate-100">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-right">{v}</dd></div>)}
      </dl>
      <div className="flex justify-between items-center mt-3 pt-3 border-t-2 border-slate-900"><span className="font-bold">Total</span><span className="text-xl font-extrabold">{money(inv.totalAmount, currency)}</span></div>
    </div>
  );
}
