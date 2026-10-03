'use client';

import { fmtDate, money, moneyTotals, toNumber, type Invoice, type InvoiceStatus } from '@flexshift/api-client';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, StatusBadge, td, th, useAction, useAsync, useToast } from '@flexshift/ui';
import clsx from 'clsx';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { api, useAuth, useScope } from '@/lib/auth';
import { useMarket } from '@/lib/market';

type Tab = 'ALL' | 'ISSUED' | 'PAID';
const TABS: { key: Tab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ISSUED', label: 'Issued' },
  { key: 'PAID', label: 'Paid' },
];

const isOverdue = (i: Invoice) => i.status === 'ISSUED' && !!i.dueAt && new Date(i.dueAt).getTime() < Date.now();
const workerName = (i: Invoice) => (i.reliefWorker ? `${i.reliefWorker.firstName} ${i.reliefWorker.lastName}` : '-');

export default function InvoicesPage() {
  const { user } = useAuth();
  if (user?.role === 'FACILITY_MANAGER') {
    return (
      <>
        <Header title="Invoices" hideBranchPicker />
        <main className="p-8"><Card><EmptyState title="Invoices are visible to organization admins" hint="Ask your organization admin if you need an invoice." /></Card></main>
      </>
    );
  }
  return <InvoicesView />;
}

function InvoicesView() {
  const { orgId, branches } = useScope();
  const { currency } = useMarket();
  const toast = useToast();
  const { run, busy } = useAction();
  const [tab, setTab] = useState<Tab>('ALL');
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [ref, setRef] = useState('');
  const [view, setView] = useState<Invoice | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, error, loading, reload } = useAsync(
    async () => (orgId ? api.invoices.byOrganization(orgId) : []),
    [orgId],
  );
  const all = data ?? [];
  const rows = all.filter((i) => tab === 'ALL' || i.status === tab);

  const now = new Date();
  // Totals are kept per currency: an organization or super admin can hold invoices in more than one.
  const outstanding = moneyTotals(all.filter((i) => i.status === 'ISSUED').map((i) => ({ amount: i.totalAmount, currency: i.currency })), currency);
  const paidMonth = moneyTotals(
    all
      .filter((i) => i.status === 'PAID' && i.paidAt && new Date(i.paidAt).getMonth() === now.getMonth() && new Date(i.paidAt).getFullYear() === now.getFullYear())
      .map((i) => ({ amount: i.totalAmount, currency: i.currency })),
    currency,
  );
  const overdue = all.filter(isOverdue).length;

  const branchOf = (i: Invoice) => i.timesheet?.branch?.name ?? branches.find((b) => b.id === i.timesheet?.branchId)?.name ?? '-';

  async function pay() {
    if (!payFor) return;
    const ok = await run(() => api.invoices.pay(payFor.id, ref.trim()), `Invoice ${payFor.invoiceNumber} marked as paid`);
    if (ok) { setPayFor(null); setRef(''); reload(); }
  }

  async function download(fetchBlob: () => Promise<Blob>, name: string) {
    setExporting(true);
    try {
      const url = URL.createObjectURL(await fetchBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally { setExporting(false); }
  }
  const exportCsv = () => orgId && download(() => api.invoices.exportCsv(orgId, 'ISSUED' as InvoiceStatus), 'payment-batch');
  const exportAccounting = () => orgId && download(() => api.invoices.exportAccounting(orgId), 'accounting-export');

  const refValid = ref.trim().length >= 3 && ref.trim().length <= 100;

  return (
    <>
      <Header title="Invoices" subtitle="Worker invoices generated from approved timesheets" hideBranchPicker
        actions={(
          <div className="flex gap-2">
            <Button variant="secondary" loading={exporting} onClick={exportAccounting}><Download className="w-4 h-4" />Accounting export (CSV)</Button>
            <Button variant="secondary" loading={exporting} onClick={exportCsv}><Download className="w-4 h-4" />Export payment batch (CSV)</Button>
          </div>
        )} />
      <main className="p-8 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { l: 'Outstanding (issued)', v: outstanding },
            { l: 'Paid this month', v: paidMonth },
            { l: 'Overdue invoices', v: String(overdue), warn: overdue > 0 },
          ].map((c) => (
            <Card key={c.l} className="p-5">
              <p className="text-xs font-semibold text-slate-500">{c.l}</p>
              <p className={clsx('text-2xl font-bold mt-1', c.warn ? 'text-rose-600' : 'text-slate-900')}>{c.v}</p>
            </Card>
          ))}
        </div>

        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('px-4 py-2 text-sm font-semibold -mb-px border-b-2', tab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              {t.label}
            </button>
          ))}
        </div>

        <Card>
          {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : rows.length === 0 ? (
            <EmptyState title="No invoices" hint="Invoices appear here when timesheets are approved." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>{['Invoice', 'Worker', 'Branch', 'Amount', 'Issued', 'Due', 'Status', 'Payment ref', ''].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className={clsx(td, 'font-semibold')}>
                        <button className="text-emerald-700 hover:underline" onClick={() => setView(i)}>{i.invoiceNumber}</button>
                      </td>
                      <td className={td}>{workerName(i)}</td>
                      <td className={td}>{branchOf(i)}</td>
                      <td className={clsx(td, 'font-semibold')}>{money(i.totalAmount, i.currency ?? currency)}</td>
                      <td className={td}>{fmtDate(i.issuedAt)}</td>
                      <td className={td}>{i.dueAt ? fmtDate(i.dueAt) : '-'} {isOverdue(i) && <Badge tone="rose">Overdue</Badge>}</td>
                      <td className={td}><StatusBadge status={i.status} /></td>
                      <td className={td}>{i.paymentReference ?? '-'}</td>
                      <td className={td}>{i.status === 'ISSUED' && <Button size="sm" onClick={() => { setPayFor(i); setRef(''); }}>Mark paid</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="Mark invoice as paid"
        footer={<><Button variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button><Button loading={busy} disabled={!refValid} onClick={pay}>Mark paid</Button></>}>
        {payFor && (
          <>
            <p className="text-sm text-slate-700">{payFor.invoiceNumber} · {workerName(payFor)} · <span className="font-bold">{money(payFor.totalAmount, payFor.currency ?? currency)}</span></p>
            <Field label="Payment reference" hint="3 to 100 characters, e.g. bank transfer reference" error={ref && !refValid ? 'Reference must be 3 to 100 characters' : undefined}>
              <Input value={ref} maxLength={100} onChange={(e) => setRef(e.target.value)} autoFocus />
            </Field>
          </>
        )}
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title="Invoice" wide
        footer={<><Button variant="secondary" onClick={() => window.print()}><Printer className="w-4 h-4" />Print</Button><Button variant="secondary" onClick={() => setView(null)}>Close</Button></>}>
        <style>{`@media print { body * { visibility: hidden } #invoice-print, #invoice-print * { visibility: visible } #invoice-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px } }`}</style>
        {view && (
          <div id="invoice-print" className="space-y-4 text-sm text-slate-800">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xl font-bold">Invoice {view.invoiceNumber}</p>
                <p className="text-slate-500">Issued {fmtDate(view.issuedAt)}{view.dueAt ? ` · Due ${fmtDate(view.dueAt)}` : ''}</p>
              </div>
              <StatusBadge status={view.status} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs font-semibold text-slate-500">Billed to</p><p>{view.organization?.name ?? branches[0]?.organization?.name ?? '-'}</p></div>
              <div><p className="text-xs font-semibold text-slate-500">Worker</p><p>{workerName(view)}</p>{view.reliefWorker?.registrationNumber && <p className="text-slate-500">{view.reliefWorker.registrationNumber}</p>}</div>
            </div>
            {view.timesheet && (
              <table className="w-full border border-slate-200">
                <thead><tr>{['Shift', 'Hours', 'Rate', 'Amount'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody><tr>
                  <td className={td}>{view.timesheet.shift?.title ?? 'Shift'}{view.timesheet.shift && <div className="text-xs text-slate-500">{fmtDate(view.timesheet.shift.startTime)} · {branchOf(view)}</div>}</td>
                  <td className={td}>{toNumber(view.timesheet.billableHours).toFixed(2)}</td>
                  <td className={td}>{money(view.timesheet.hourlyRateApplied, view.currency ?? currency)}/h</td>
                  <td className={td}>{money(view.timesheet.totalPayout, view.currency ?? currency)}</td>
                </tr></tbody>
              </table>
            )}
            <p className="text-right text-lg font-bold">Total {money(view.totalAmount, view.currency ?? currency)}</p>
            {view.status === 'PAID' && <p className="text-slate-600">Paid {view.paidAt ? fmtDate(view.paidAt) : ''}{view.paymentReference ? ` · Ref ${view.paymentReference}` : ''}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
