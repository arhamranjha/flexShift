'use client';

import { fmtDate, fmtRange, fmtTime, gbp, toNumber, type Timesheet, type TimesheetStatus } from '@flexshift/api-client';
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, Modal, StatusBadge, td, th, useAction, useAsync, useToast } from '@flexshift/ui';
import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { api, useScope } from '@/lib/auth';

type Tab = 'SUBMITTED' | 'APPROVED' | 'SETTLED' | 'ALL';
const TABS: { key: Tab; label: string }[] = [
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'SETTLED', label: 'Settled' },
  { key: 'ALL', label: 'All' },
];
const GRACE_MS = 15 * 60_000;

type Row = Timesheet & { branchName: string };

function variance(t: Timesheet) {
  if (!t.shift) return { early: false, late: false };
  const inMs = new Date(t.clockInTime).getTime();
  const outMs = new Date(t.clockOutTime).getTime();
  return {
    early: new Date(t.shift.startTime).getTime() - inMs > GRACE_MS,
    late: outMs - new Date(t.shift.endTime).getTime() > GRACE_MS,
  };
}

export default function TimesheetsPage() {
  const { branches, branchIds, loading: scopeLoading } = useScope();
  const toast = useToast();
  const { run, busy } = useAction();
  const [tab, setTab] = useState<Tab>('SUBMITTED');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<Row[] | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    if (!branchIds.length) return [] as Row[];
    const status: TimesheetStatus | undefined = tab === 'ALL' ? undefined : tab;
    const lists = await Promise.all(branchIds.map((id) => api.timesheets.byBranch(id, status)));
    const rows: Row[] = lists.flatMap((l, i) =>
      l.map((t) => ({ ...t, branchName: t.branch?.name ?? branches.find((b) => b.id === branchIds[i])?.name ?? '' })));
    setSelected(new Set());
    return rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [tab, branchIds.join(',')]);

  const rows = data ?? [];
  const submitted = rows.filter((r) => r.status === 'SUBMITTED');
  const allSelected = submitted.length > 0 && submitted.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [bulkBusy, setBulkBusy] = useState(false);
  async function approve(list: Row[]) {
    if (bulkBusy) return;
    setBulkBusy(true);
    try { await approveAll(list); } finally { setBulkBusy(false); }
  }

  async function approveAll(list: Row[]) {
    if (list.length === 1) {
      const res = await run(() => api.timesheets.approve(list[0].id));
      if (res) toast.success(`Timesheet approved. Invoice ${res.invoice.invoiceNumber} issued.`);
    } else {
      let ok = 0; const failed: string[] = [];
      for (const t of list) {
        try { await api.timesheets.approve(t.id); ok++; } catch (e) { failed.push(e instanceof Error ? e.message : 'failed'); }
      }
      if (ok) toast.success(`Approved ${ok} timesheet${ok === 1 ? '' : 's'}; invoices issued.`);
      if (failed.length) toast.error(`${failed.length} failed: ${failed[0]}`);
    }
    setConfirm(null); setDetail(null); reload();
  }

  const confirmTotal = (confirm ?? []).reduce((s, t) => s + toNumber(t.totalPayout), 0);

  return (
    <>
      <Header
        title="Timesheets"
        subtitle="Review and approve clocked hours"
        actions={selected.size > 0 && (
          <Button onClick={() => setConfirm(submitted.filter((r) => selected.has(r.id)))}>Approve selected ({selected.size})</Button>
        )}
      />
      <main className="p-8 space-y-6">
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('px-4 py-2 text-sm font-semibold -mb-px border-b-2', tab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              {t.label}
            </button>
          ))}
        </div>

        <Card>
          {scopeLoading || loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : rows.length === 0 ? (
            <EmptyState title="No timesheets here" hint="Nothing matches this status for the selected branch." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>
                      <input type="checkbox" aria-label="Select all" checked={allSelected} disabled={!submitted.length}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(submitted.map((r) => r.id)))} />
                    </th>
                    {['Worker', 'Branch', 'Shift', 'Clock in/out', 'Break', 'Hours', 'Rate', 'Payout', 'Status', ''].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const v = variance(t);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className={td}>
                          {t.status === 'SUBMITTED' && <input type="checkbox" aria-label="Select" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />}
                        </td>
                        <td className={td}>{t.reliefWorker ? `${t.reliefWorker.firstName} ${t.reliefWorker.lastName}` : '-'}</td>
                        <td className={td}>{t.branchName}</td>
                        <td className={td}>{t.shift ? <>{t.shift.title}<div className="text-xs text-slate-500">{fmtDate(t.shift.startTime)}</div></> : '-'}</td>
                        <td className={clsx(td, 'whitespace-nowrap', (v.early || v.late) && 'text-amber-700 font-semibold')}>
                          {fmtTime(t.clockInTime)}–{fmtTime(t.clockOutTime)}
                          {(v.early || v.late) && <AlertTriangle className="inline w-3.5 h-3.5 ml-1" />}
                        </td>
                        <td className={td}>{t.breakMinutes}m</td>
                        <td className={td}>{toNumber(t.billableHours).toFixed(2)}</td>
                        <td className={td}>{gbp(t.hourlyRateApplied)}/h</td>
                        <td className={clsx(td, 'font-semibold')}>{gbp(t.totalPayout)}</td>
                        <td className={td}><StatusBadge status={t.status} /></td>
                        <td className={td}><Button size="sm" variant="secondary" onClick={() => setDetail(t)}>Review</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      <Modal open={!!detail && !confirm} onClose={() => setDetail(null)} title="Timesheet detail" wide
        footer={detail && (
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
            {detail.status === 'SUBMITTED' && <Button onClick={() => setConfirm([detail])}>Approve</Button>}
          </>
        )}>
        {detail && (() => {
          const v = variance(detail);
          return (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{detail.reliefWorker ? `${detail.reliefWorker.firstName} ${detail.reliefWorker.lastName}` : 'Worker'}</p>
                  <p className="text-xs text-slate-500">{detail.branchName}{detail.shift ? ` · ${detail.shift.title}` : ''}</p>
                </div>
                <StatusBadge status={detail.status} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs font-semibold text-slate-500">Scheduled</dt>
                  <dd>{detail.shift ? fmtRange(detail.shift.startTime, detail.shift.endTime) : '-'}</dd>
                </div>
                <div className={clsx('rounded-lg p-3', v.early || v.late ? 'bg-amber-50 text-amber-900' : 'bg-slate-50')}>
                  <dt className="text-xs font-semibold text-slate-500">Clocked</dt>
                  <dd>{fmtRange(detail.clockInTime, detail.clockOutTime)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">Break</dt><dd>{detail.breakMinutes} min</dd></div>
                <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">Billable</dt><dd>{toNumber(detail.billableHours).toFixed(2)} h @ {gbp(detail.hourlyRateApplied)}/h</dd></div>
              </dl>
              {(v.early || v.late) && (
                <p className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {v.early && 'Clocked in more than 15 minutes before the scheduled start. '}
                  {v.late && 'Clocked out more than 15 minutes after the scheduled end. '}
                  Check this before approving.
                </p>
              )}
              {detail.notes && <p className="text-sm text-slate-600"><span className="font-semibold">Worker notes:</span> {detail.notes}</p>}
              <p className="text-right text-lg font-bold text-slate-900">Payout {gbp(detail.totalPayout)}</p>
            </>
          );
        })()}
      </Modal>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Approve timesheet"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button loading={busy || bulkBusy} onClick={() => confirm && approve(confirm)}>Approve and generate invoice{confirm && confirm.length > 1 ? 's' : ''}</Button>
        </>}>
        {confirm && (
          <>
            <p className="text-sm text-slate-700">
              Approving {confirm.length === 1 ? 'this timesheet' : `${confirm.length} timesheets`} for a total payout of{' '}
              <span className="font-bold">{gbp(confirmTotal)}</span>.
            </p>
            <p className="text-sm text-slate-600">{confirm.length === 1 ? 'An invoice' : 'Invoices'} will be generated automatically. This cannot be undone.</p>
          </>
        )}
      </Modal>
    </>
  );
}
